// GET /api/school/teachers/[id]/checkins — read-only history for the
// Teachers profile's "Présences" tab. Any school member can view (no
// hasMinRole gate — same as the rest of the teacher profile GET).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool } from '@/lib/server/school';
import { computeCheckInStatus } from '@/lib/server/teacher-attendance/status';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const teacher = await prisma.teacher.findFirst({
      where: { id, schoolId: mySchool.schoolId },
      select: { id: true },
    });
    if (!teacher) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Teacher not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const sessions = await prisma.timetableSession.findMany({
      where: { teacherId: id, schoolId: mySchool.schoolId },
      orderBy: { date: 'desc' },
      take: 100,
      select: {
        id: true,
        date: true,
        startMinutes: true,
        endMinutes: true,
        subject: { select: { name: true } },
        class: { select: { name: true } },
        checkIns: { where: { teacherId: id }, select: { checkedInAt: true }, take: 1 },
      },
    });

    const now = new Date();
    const rows = sessions.map((s) => {
      const dateIso = s.date.toISOString().slice(0, 10);
      const checkedInAt = s.checkIns[0]?.checkedInAt ?? null;
      return {
        id: s.id,
        date: dateIso,
        subjectName: s.subject.name,
        className: s.class.name,
        startMinutes: s.startMinutes,
        endMinutes: s.endMinutes,
        status: computeCheckInStatus(
          { date: dateIso, startMinutes: s.startMinutes, endMinutes: s.endMinutes },
          checkedInAt,
          now,
        ),
        checkedInAt: checkedInAt ? checkedInAt.toISOString() : null,
      };
    });

    return NextResponse.json({ rows }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
