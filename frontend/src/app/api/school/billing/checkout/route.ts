// POST /api/school/billing/checkout — start a hosted Stripe Checkout for the
// Établissement Pro plan. Body: { interval: 'MONTH' | 'YEAR' }. Returns
// { url } to redirect the browser to. OWNER-only. No DB write besides the
// Customer id — the Subscription row is created by the webhook.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { resolvePrintBaseUrl } from '@/lib/server/bulletin-pdf/print-base-url';
import { requireSchoolBilling, stripeErrorResponse } from '@/lib/server/billing/route-guards';
import { createCheckoutSession, hasLiveStripeSubscription } from '@/lib/server/billing/stripe';

const Body = z.object({ interval: z.enum(['MONTH', 'YEAR']).default('MONTH') });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;
    const guard = await requireSchoolBilling(ctx.requestId, 'OWNER');
    if (guard instanceof NextResponse) return guard;

    const parsed = Body.safeParse((await req.json().catch(() => null)) ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // A school with a live Stripe subscription changes plan/interval in
    // place (PATCH /subscription) — a second Checkout would double-bill.
    const existing = await prisma.subscription.findUnique({
      where: { schoolId: guard.mySchool.schoolId },
      select: { stripeSubscriptionId: true, stripeStatus: true },
    });
    if (existing && hasLiveStripeSubscription(existing)) {
      return NextResponse.json(
        {
          error: 'ALREADY_SUBSCRIBED',
          message: 'Cette école a déjà un abonnement actif — gérez-le depuis la page Abonnement.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    try {
      const url = await createCheckoutSession(prisma, {
        schoolId: guard.mySchool.schoolId,
        interval: parsed.data.interval,
        appUrl: resolvePrintBaseUrl(),
        requesterEmail: guard.auth.user.email,
      });
      return NextResponse.json({ url }, { headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      return stripeErrorResponse(err, ctx.requestId);
    }
  });
}
