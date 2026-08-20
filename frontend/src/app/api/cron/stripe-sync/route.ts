// POST /api/cron/stripe-sync — daily Stripe reconciliation (03:00 UTC).
//
// Two jobs per Stripe-linked subscription, in order:
//   1. Re-sync the whole subscription state from Stripe (status, period end,
//      cancel_at_period_end, interval). This SELF-HEALS a missed webhook: a
//      school that canceled or hit period end reverts to Starter within a
//      day even if `customer.subscription.deleted` never reached us.
//   2. Align the billed seat quantity with the school's current student
//      count (proration 'none' — predictable invoices).
//
// Mirrors cron/order-expiration/route.ts: verifyCronSecret gate, Redis
// leader lease so two instances never double-run, per-row try/catch so one
// broken subscription never blocks the others. No-op when Stripe env is
// absent (dev without keys, forks that pruned billing).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getStripe, isStripeConfigured } from '@/lib/server/billing/stripe-client';
import {
  findOpenSubscription,
  isBillableStripeStatus,
  syncCustomerEmail,
  syncSeatQuantity,
  syncSubscriptionFromStripe,
} from '@/lib/server/billing/stripe';

const log = createLogger();
const LEASE_TTL_MS = 120_000; // ~2 × maxDuration

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { ok: true, skipped: 'STRIPE_NOT_CONFIGURED', processed: 0 },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    let processed = 0;
    let seatUpdates = 0;
    let failed = 0;

    await withLease(redis ?? undefined, 'stripe-sync', LEASE_TTL_MS, async () => {
      const rows = await prisma.subscription.findMany({
        where: { stripeSubscriptionId: { not: null } },
        select: {
          id: true,
          schoolId: true,
          stripeSubscriptionId: true,
          school: { select: { stripeCustomerId: true } },
        },
      });
      const stripe = getStripe();
      for (const row of rows) {
        if (!row.stripeSubscriptionId) continue;
        try {
          const sub = await stripe.subscriptions.retrieve(row.stripeSubscriptionId);
          await syncSubscriptionFromStripe(prisma, sub);
          processed += 1;
          const customerId = row.school.stripeCustomerId;
          if (customerId) {
            // Single-subscription invariant: another open subscription on the
            // same Customer means the school could be billed twice — surface it.
            const open = await findOpenSubscription(customerId);
            if (open && open.id !== sub.id && isBillableStripeStatus(sub.status)) {
              log.error('stripe-sync: duplicate open subscription for customer', {
                schoolId: row.schoolId,
                customerId,
                subscriptions: [sub.id, open.id],
              });
            }
            // Stripe's own emails (receipts, dunning, trial reminders) go to the
            // Customer email — keep it on the school's current OWNER.
            await syncCustomerEmail(prisma, { schoolId: row.schoolId, customerId });
          }
          const item = sub.items.data[0];
          if (!item || !isBillableStripeStatus(sub.status)) continue;
          const updated = await syncSeatQuantity(prisma, {
            id: row.id,
            schoolId: row.schoolId,
            stripeSubscriptionId: sub.id,
            stripeSubscriptionItemId: item.id,
            billedSeats: item.quantity ?? null,
          });
          if (updated !== null) seatUpdates += 1;
        } catch (err) {
          failed += 1;
          log.error('stripe-sync: subscription failed', {
            subscriptionId: row.id,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
      log.info('stripe-sync tick', { processed, seatUpdates, failed, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, processed, seatUpdates, failed },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

// Vercel's native Cron Jobs scheduler invokes the configured path via GET,
// not POST (confirmed live: every scheduled invocation was returning 405
// before this alias existed, so the cron never actually ran in production —
// only a manual POST, e.g. via curl, ever reached the handler).
export const GET = POST;
