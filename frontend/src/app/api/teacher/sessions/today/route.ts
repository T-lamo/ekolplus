// GET /api/teacher/sessions/today — teacher portal's "Mes cours
// aujourd'hui". Never trusts a client-supplied teacherId — always resolves
// it from the caller's own session via resolveMyTeacherProfile.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMyTeacherProfile } from '@/lib/server/school';
import { computeCheckInStatus } from '@/lib/server/teacher-attendance/status';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const me = await resolveMyTeacherProfile(auth.user.sub);
    if (!me) {
      return NextResponse.json(
        { error: 'NOT_A_TEACHER', message: 'This account has no teacher profile.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const date = todayIso();
    const sessions = await prisma.timetableSession.findMany({
      where: { teacherId: me.teacherId, date: new Date(date) },
      orderBy: { startMinutes: 'asc' },
      select: {
        id: true,
        startMinutes: true,
        endMinutes: true,
        room: true,
        subject: { select: { name: true } },
        class: { select: { name: true } },
        checkIns: { where: { teacherId: me.teacherId }, select: { checkedInAt: true }, take: 1 },
      },
    });

    const now = new Date();
    const payload = sessions.map((s) => {
      const checkedInAt = s.checkIns[0]?.checkedInAt ?? null;
      return {
        id: s.id,
        subjectName: s.subject.name,
        className: s.class.name,
        room: s.room,
        startMinutes: s.startMinutes,
        endMinutes: s.endMinutes,
        status: computeCheckInStatus(
          { date, startMinutes: s.startMinutes, endMinutes: s.endMinutes },
          checkedInAt,
          now,
        ),
        checkedInAt: checkedInAt ? checkedInAt.toISOString() : null,
      };
    });

    return NextResponse.json({ sessions: payload }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
