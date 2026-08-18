// POST /api/school/billing/portal — open the Stripe Customer Portal (card,
// invoices, cancel) for the school. Returns { url }. OWNER-only. 409 when
// the school never checked out (no Stripe Customer yet).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { resolvePrintBaseUrl } from '@/lib/server/bulletin-pdf/print-base-url';
import { requireSchoolBilling, stripeErrorResponse } from '@/lib/server/billing/route-guards';
import { createPortalSession } from '@/lib/server/billing/stripe';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;
    const guard = await requireSchoolBilling(ctx.requestId, 'OWNER');
    if (guard instanceof NextResponse) return guard;

    const school = await prisma.school.findUnique({
      where: { id: guard.mySchool.schoolId },
      select: { stripeCustomerId: true },
    });
    if (!school?.stripeCustomerId) {
      return NextResponse.json(
        {
          error: 'NO_STRIPE_CUSTOMER',
          message: 'Aucun abonnement Stripe à gérer pour cette école.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    try {
      const url = await createPortalSession(school.stripeCustomerId, resolvePrintBaseUrl());
      return NextResponse.json({ url }, { headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      return stripeErrorResponse(err, ctx.requestId);
    }
  });
}
