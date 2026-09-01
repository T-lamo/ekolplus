// GET /api/school/activity — full, paginated "Tout voir" activity log
// backing the dashboard's RecentActivityCard link. Shares its event merge
// with the dashboard preview (see lib/server/activity-log.ts) but looks
// deeper per source and paginates the merged, sorted feed in-memory —
// there is no single AuditLog table this reads from a cursor.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { resolveActiveAcademicYear } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { queryActivityEvents, type ActivityType } from '@/lib/server/activity-log';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PAGE_SIZE = 20;
const LIMIT_PER_TYPE = 60;
const ACTIVITY_TYPES: ActivityType[] = ['grade', 'absence', 'payment', 'enrollment'];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'dashboard', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const year = await resolveActiveAcademicYear(mySchool.schoolId);
    if (!year) {
      return NextResponse.json(
        { items: [], total: 0, page: 1, pageSize: PAGE_SIZE },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const typeParam = req.nextUrl.searchParams.get('type');
    const type = ACTIVITY_TYPES.includes(typeParam as ActivityType)
      ? (typeParam as ActivityType)
      : undefined;
    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1') || 1);

    const events = await queryActivityEvents(mySchool.schoolId, year.id, {
      type,
      limitPerType: LIMIT_PER_TYPE,
    });

    const items = events.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return NextResponse.json(
      { items, total: events.length, page, pageSize: PAGE_SIZE },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
