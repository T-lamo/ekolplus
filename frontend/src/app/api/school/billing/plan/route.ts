// GET /api/school/billing/plan — lightweight plan snapshot for the school
// shell (the sidebar plan card is mounted on every page): effective plan,
// status, headcount vs Starter cap. Two DB reads, no Stripe call. Readable
// by OWNER/ADMIN (MEMBER → `plan: null`); the full summary + mutations live
// in the sibling routes.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { requireSchoolBilling } from '@/lib/server/billing/route-guards';
import { hasMinRole } from '@/lib/server/school';
import { getPlanSnapshot } from '@/lib/server/billing/summary';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const guard = await requireSchoolBilling(ctx.requestId, 'MEMBER');
    if (guard instanceof NextResponse) return guard;
    // Plan visibility (sidebar card, upsell) is an OWNER/ADMIN matter — a
    // teacher gets a null snapshot and the shell simply shows nothing.
    if (!hasMinRole(guard.mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { plan: null, role: guard.mySchool.role },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const snapshot = await getPlanSnapshot(prisma, guard.mySchool.schoolId);
    return NextResponse.json(
      { plan: snapshot, role: guard.mySchool.role },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
