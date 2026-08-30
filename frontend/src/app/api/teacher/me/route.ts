// GET /api/teacher/me — the Espace Enseignant home screen's one aggregate
// read: this teacher's identity, homeroom classes, taught ClassSubjects
// (with class/subject names), this week's timetable sessions, and the
// active academic year. One round trip avoids a phone-network waterfall of
// separate admin-shaped list endpoints. Teacher-linked accounts only — any
// other account gets 404 (not-found-for-you, matching every other
// ownership-scoped route in this app). See
// docs/superpowers/specs/2026-08-30-espace-enseignant-design.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import {
  resolveMySchoolIncludingTeacher,
  resolveMyTeacherProfile,
  resolveActiveAcademicYear,
} from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { mondayOf, addDays, SCHOOL_WEEK_DAYS } from '@/lib/server/attendance';
import {
  SESSION_INCLUDE,
  serializeSession,
  seriesCounts,
  type SerializedSession,
} from '@/lib/server/timetable-route-helpers';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchoolIncludingTeacher(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const myTeacher = await resolveMyTeacherProfile(auth.user.sub, mySchool.schoolId);
    if (!myTeacher) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [teacher, homeroomClasses, classSubjects, activeYear] = await Promise.all([
      prisma.teacher.findUniqueOrThrow({
        where: { id: myTeacher.teacherId },
        select: { id: true, name: true, email: true },
      }),
      prisma.class.findMany({
        where: { id: { in: myTeacher.homeroomClassIds } },
        select: { id: true, name: true, level: true },
        orderBy: { name: 'asc' },
      }),
      prisma.classSubject.findMany({
        where: { id: { in: myTeacher.classSubjectIds } },
        select: {
          id: true,
          classId: true,
          class: { select: { name: true, level: true } },
          subjectId: true,
          subject: { select: { name: true } },
        },
        orderBy: { class: { name: 'asc' } },
      }),
      resolveActiveAcademicYear(mySchool.schoolId),
    ]);

    let thisWeekSessions: SerializedSession[] = [];
    if (activeYear) {
      const from = mondayOf(new Date());
      const to = addDays(from, SCHOOL_WEEK_DAYS - 1);
      const rows = await prisma.timetableSession.findMany({
        where: {
          schoolId: mySchool.schoolId,
          academicYearId: activeYear.id,
          teacherId: myTeacher.teacherId,
          date: { gte: from, lte: to },
        },
        orderBy: [{ date: 'asc' }, { startMinutes: 'asc' }],
        include: SESSION_INCLUDE,
      });
      const counts = await seriesCounts(prisma, rows);
      thisWeekSessions = rows.map((s) =>
        serializeSession(s, s.seriesId ? counts.get(s.seriesId) : 1),
      );
    }

    return NextResponse.json(
      {
        teacher,
        homeroomClasses,
        classSubjects: classSubjects.map((cs) => ({
          id: cs.id,
          classId: cs.classId,
          className: cs.class.name,
          classLevel: cs.class.level,
          subjectId: cs.subjectId,
          subjectName: cs.subject.name,
        })),
        thisWeekSessions,
        academicYear: activeYear ? { id: activeYear.id, label: activeYear.label } : null,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
