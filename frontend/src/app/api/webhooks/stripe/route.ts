/**
 * POST /api/webhooks/stripe — Stripe billing webhook (SaaS subscriptions).
 *
 * Thin shim over the PROTECTED factory at `lib/server/webhook/handler.ts`,
 * mirroring webhooks/bictorys/route.ts: the factory reads the raw body,
 * verifies the signature (via the Stripe SDK in webhook/stripe.ts), opens a
 * Serializable tx, dedups on (event.id, event.type) and dispatches. This
 * file only maps event types to the billing sync helpers.
 *
 * Invariants honored:
 *   - runtime = 'nodejs' + dynamic = 'force-dynamic'.
 *   - This file NEVER reads the request body (raw-body HMAC integrity).
 *   - All DB writes run on the factory's tx client; the only side-effect
 *     (in-app notification on payment failure) is a row insert inside that
 *     same tx — no post-commit closures, no outbox change needed.
 *
 * Event ordering is NOT assumed: for a fresh checkout, `invoice.paid`,
 * `customer.subscription.created` and `checkout.session.completed` arrive
 * in any order — each handler is independently idempotent (upserts keyed on
 * schoolId / invoice id) and every object carries `schoolId` in metadata.
 * `checkout.session.completed` re-fetches the Subscription from Stripe so
 * the row exists even if the subscription.* events were dropped.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import type Stripe from 'stripe';
import { NextRequest, type NextResponse } from 'next/server';
import { createWebhookHandler } from '@/lib/server/webhook/handler';
import { stripeWebhookProvider } from '@/lib/server/webhook/stripe';
import { prisma } from '@/lib/server/prisma';
import { getStripe } from '@/lib/server/billing/stripe-client';
import {
  handleInvoicePaymentFailed,
  handleTrialWillEnd,
  reconcileCheckoutSubscription,
  recordInvoice,
  recordRefund,
  syncSubscriptionFromStripe,
} from '@/lib/server/billing/stripe';

const handler = createWebhookHandler<Stripe.Event>({
  prisma,
  provider: stripeWebhookProvider,

  async onPaid(event, tx) {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const subId =
          typeof session.subscription === 'string'
            ? session.subscription
            : (session.subscription?.id ?? null);
        if (subId && session.mode === 'subscription') {
          const sub = await getStripe().subscriptions.retrieve(subId);
          if (!sub.metadata?.schoolId && session.metadata?.schoolId) {
            sub.metadata = { ...sub.metadata, schoolId: session.metadata.schoolId };
          }
          // Adopts the paid subscription; cancels a superseded open one (race).
          await reconcileCheckoutSubscription(tx, sub);
        }
        return {};
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscriptionFromStripe(tx, event.data.object);
        return {};
      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(tx, event.data.object);
        return {};
      case 'invoice.paid':
        await recordInvoice(tx, event.data.object, 'SUCCEEDED');
        return {};
      default:
        return {};
    }
  },

  async onFailed(event, tx) {
    if (event.type === 'invoice.payment_failed') {
      await handleInvoicePaymentFailed(tx, event.data.object);
    }
    return {};
  },

  async onRefunded(event, tx) {
    if (event.type === 'charge.refunded') {
      await recordRefund(tx, event.data.object);
    }
    return {};
  },
});

/**
 * One bounded retry on a failed transaction. Stripe fires 3–4 events per
 * Checkout at the same instant; under the factory's `Serializable` isolation,
 * concurrent transactions touching the same rows (WebhookLog, Subscription)
 * make Postgres abort one with a serialization failure (Prisma P2034) — by
 * design, and Postgres' own instruction is « retry ». Stripe would redeliver
 * a 500 later, but retrying once here (idempotent handlers, dedup on event.id)
 * turns a minutes-long gap into ~300 ms and covers `stripe listen`, which never
 * retries. The request is cloned BEFORE the first attempt: the factory
 * consumes the raw body bytes.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const retryReq = new NextRequest(req.clone());
  const first = await handler(req);
  if (first.status < 500) return first;
  await new Promise((r) => setTimeout(r, 150 + Math.random() * 250));
  return handler(retryReq);
}
