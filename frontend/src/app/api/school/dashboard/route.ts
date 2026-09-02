// GET /api/school/dashboard — School Dashboard ("Tableau de bord") read
// model. One call hydrates the whole page (same precedent as
// admin/stats/detailed, fees/overview): KPIs, monthly averages trend, level
// distribution, fee summary, per-class attendance, per-subject performance,
// "à traiter" counters, and a real recent-activity feed. See
// .planning/banani/school-dashboard.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { getSchoolDashboard } from '@/lib/server/school-dashboard';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'dashboard', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const data = await getSchoolDashboard(mySchool.schoolId);

    return NextResponse.json(data, { headers: { 'x-request-id': ctx.requestId } });
  });
}
