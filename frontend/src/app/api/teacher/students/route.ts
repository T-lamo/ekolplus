// GET /api/teacher/students — every student enrolled (active academic year)
// in a class this teacher either homerooms or teaches at least one subject
// in, flattened for the Mes élèves list screen. Read-only, teacher-scoped:
// the class list is re-derived from the caller's own Teacher row on every
// request, so the response can never carry another teacher's students.
// Non-teacher accounts get 404 (not-found-for-you), matching every other
// ownership-scoped route. See
// docs/superpowers/specs/2026-08-31-espace-enseignant-phase3-saisie-design.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

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

    const taughtClasses =
      myTeacher.classSubjectIds.length > 0
        ? await prisma.classSubject.findMany({
            where: { id: { in: myTeacher.classSubjectIds } },
            select: { classId: true },
          })
        : [];
    const classIds = [
      ...new Set([...myTeacher.homeroomClassIds, ...taughtClasses.map((cs) => cs.classId)]),
    ];
    if (classIds.length === 0) {
      return NextResponse.json({ students: [] }, { headers: { 'x-request-id': ctx.requestId } });
    }

    // Classes are year-scoped rows, so filtering enrollments to the active
    // year naturally drops any stale previous-year assignment.
    const enrollments = await prisma.enrollment.findMany({
      where: { classId: { in: classIds }, academicYear: { isActive: true } },
      select: {
        classId: true,
        class: { select: { name: true, level: true } },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentNumber: true,
            photoUrl: true,
            status: true,
          },
        },
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });

    return NextResponse.json(
      {
        students: enrollments.map((e) => ({
          id: e.student.id,
          firstName: e.student.firstName,
          lastName: e.student.lastName,
          studentNumber: e.student.studentNumber,
          photoUrl: e.student.photoUrl,
          status: e.student.status,
          classId: e.classId,
          className: e.class.name,
          classLevel: e.class.level,
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
