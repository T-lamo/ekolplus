// POST /api/teacher/checkins — "Je suis présent" button. Only allowed for
// the caller's own session, and only within [start, end + 15min grace].
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMyTeacherProfile } from '@/lib/server/school';
import { GRACE_MINUTES } from '@/lib/server/teacher-attendance/status';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ timetableSessionId: z.string().min(1) });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const me = await resolveMyTeacherProfile(auth.user.sub);
    if (!me) {
      return NextResponse.json(
        { error: 'NOT_A_TEACHER', message: 'This account has no teacher profile.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const session = await prisma.timetableSession.findFirst({
      where: { id: parsed.data.timetableSessionId, teacherId: me.teacherId },
      select: { id: true, date: true, startMinutes: true, endMinutes: true },
    });
    if (!session) {
      return NextResponse.json(
        { error: 'NOT_YOUR_SESSION', message: 'Session not found for this teacher.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const now = new Date();
    const dayStart = new Date(session.date);
    const windowStart = new Date(dayStart.getTime() + session.startMinutes * 60_000);
    const windowEnd = new Date(dayStart.getTime() + (session.endMinutes + GRACE_MINUTES) * 60_000);
    if (now < windowStart || now > windowEnd) {
      return NextResponse.json(
        { error: 'OUTSIDE_WINDOW', message: 'Ce cours n’est pas en cours actuellement.' },
        { status: 422, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    try {
      await prisma.teacherCheckIn.create({
        data: { schoolId: me.schoolId, timetableSessionId: session.id, teacherId: me.teacherId },
      });
    } catch (err) {
      const isUniqueViolation =
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002';
      if (isUniqueViolation) {
        return NextResponse.json(
          { error: 'ALREADY_CHECKED_IN', message: 'Déjà pointé pour ce cours.' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
