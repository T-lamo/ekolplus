// PATCH /api/school/billing/subscription — in-app changes to a live Stripe
// subscription, no redirect: { cancelAtPeriodEnd: boolean } (cancel at the
// end of the paid period / undo) or { interval: 'MONTH' | 'YEAR' } (switch
// billing cycle, prorated by Stripe). Exactly one field per call. OWNER-only.
// The Stripe object is updated first, then our row is re-synced from it, so
// the response already reflects the new state without waiting on the webhook.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { requireSchoolBilling, stripeErrorResponse } from '@/lib/server/billing/route-guards';
import {
  changeInterval,
  hasLiveStripeSubscription,
  setCancelAtPeriodEnd,
} from '@/lib/server/billing/stripe';
import { getBillingSummary } from '@/lib/server/billing/summary';

const Body = z
  .object({
    cancelAtPeriodEnd: z.boolean().optional(),
    interval: z.enum(['MONTH', 'YEAR']).optional(),
  })
  .refine((b) => (b.cancelAtPeriodEnd !== undefined) !== (b.interval !== undefined), {
    message: 'Provide exactly one of cancelAtPeriodEnd or interval',
  });

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;
    const guard = await requireSchoolBilling(ctx.requestId, 'OWNER');
    if (guard instanceof NextResponse) return guard;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const sub = await prisma.subscription.findUnique({
      where: { schoolId: guard.mySchool.schoolId },
      select: { stripeSubscriptionId: true, stripeStatus: true, billingInterval: true },
    });
    if (!sub || !hasLiveStripeSubscription(sub)) {
      return NextResponse.json(
        { error: 'NO_STRIPE_SUBSCRIPTION', message: 'Aucun abonnement Stripe actif à modifier.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    try {
      if (parsed.data.cancelAtPeriodEnd !== undefined) {
        await setCancelAtPeriodEnd(prisma, sub.stripeSubscriptionId, parsed.data.cancelAtPeriodEnd);
      } else if (parsed.data.interval && parsed.data.interval !== sub.billingInterval) {
        await changeInterval(prisma, sub.stripeSubscriptionId, parsed.data.interval);
      }
    } catch (err) {
      return stripeErrorResponse(err, ctx.requestId);
    }

    const billing = await getBillingSummary(prisma, guard.mySchool.schoolId);
    return NextResponse.json(
      { billing, role: guard.mySchool.role },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
