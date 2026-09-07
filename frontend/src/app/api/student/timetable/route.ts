// GET /api/student/timetable?from&to — the Espace Élève's Emploi du temps
// data: the sessions of the student's own class (current-year Enrollment)
// in a date range (≤ 62 days, same validation as the school timetable GET),
// serialized the same way (SESSION_INCLUDE / serializeSession /
// seriesCounts) so the shared timetable views render them unchanged.
// `rooms` lists the distinct rooms of the returned sessions only: the
// student has no filter/modal to feed, and the school-wide room lookup is
// staff data. `sessions: []` without an active year or a current
// enrollment. The studentId/classId are never parameters: they come from
// the session via requireStudent.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireStudent } from '@/lib/server/middleware/require-student';
import { prisma } from '@/lib/server/prisma';
import { resolveActiveAcademicYear } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { DAY_MS, parseDay } from '@/lib/server/timetable';
import {
  DAY_RE,
  SESSION_INCLUDE,
  serializeSession,
  seriesCounts,
} from '@/lib/server/timetable-route-helpers';

const MAX_RANGE_DAYS = 62;

const Query = z.object({
  from: z.string().regex(DAY_RE),
  to: z.string().regex(DAY_RE),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStudent(req);
    if (auth instanceof NextResponse) return auth;
    const { schoolId, classId } = auth.student;

    const sp = req.nextUrl.searchParams;
    const parsed = Query.safeParse({
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'from and to (YYYY-MM-DD) are required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const from = parseDay(parsed.data.from);
    const to = parseDay(parsed.data.to);
    if (to < from || (to.getTime() - from.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: `Range must be 0–${MAX_RANGE_DAYS} days` },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const activeYear = await resolveActiveAcademicYear(schoolId);
    if (!activeYear) {
      return NextResponse.json(
        { academicYear: null, sessions: [], rooms: [] },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const academicYear = { id: activeYear.id, label: activeYear.label };
    if (!classId) {
      return NextResponse.json(
        { academicYear, sessions: [], rooms: [] },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const rows = await prisma.timetableSession.findMany({
      where: { schoolId, academicYearId: activeYear.id, classId, date: { gte: from, lte: to } },
      orderBy: [{ date: 'asc' }, { startMinutes: 'asc' }],
      include: SESSION_INCLUDE,
    });
    const counts = await seriesCounts(prisma, rows);
    const rooms = [
      ...new Set(rows.map((r) => r.room?.trim() ?? '').filter((r) => r.length > 0)),
    ].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));

    return NextResponse.json(
      {
        academicYear,
        sessions: rows.map((s) => serializeSession(s, s.seriesId ? counts.get(s.seriesId) : 1)),
        rooms,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
