// GET /api/school/billing — the caller's school billing summary (plan,
// Stripe status, headcount vs limits, rates, last transactions). Pure DB
// reads, no Stripe call — feeds the Abonnement page and the checkout récap.
// OWNER/ADMIN only (amounts + invoices); plain members get 403 and the
// sidebar hides the entry. Mutations live in the sibling routes (OWNER).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { requireSchoolBilling } from '@/lib/server/billing/route-guards';
import { getBillingSummary } from '@/lib/server/billing/summary';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const guard = await requireSchoolBilling(ctx.requestId, 'ADMIN');
    if (guard instanceof NextResponse) return guard;
    const summary = await getBillingSummary(prisma, guard.mySchool.schoolId);
    return NextResponse.json(
      { billing: summary, role: guard.mySchool.role },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
