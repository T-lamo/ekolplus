// GET /api/teacher/classes/[classSubjectId] — roster (via Enrollment, the
// class's own AcademicYear) of a class-subject this teacher is assigned to,
// plus the class/subject names for the page header. 404s (not found for
// you, not 403) when classSubjectId isn't one of this teacher's own
// assignments — same non-leaking convention as every other ownership-scoped
// route in this app.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ classSubjectId: string }> },
): Promise<NextResponse> {
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
    const { classSubjectId } = await params;
    if (!myTeacher || !myTeacher.classSubjectIds.includes(classSubjectId)) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const classSubject = await prisma.classSubject.findUniqueOrThrow({
      where: { id: classSubjectId },
      select: {
        id: true,
        classId: true,
        class: { select: { id: true, name: true, level: true, academicYearId: true } },
        subjectId: true,
        subject: { select: { id: true, name: true, icon: true, color: true } },
      },
    });

    const enrollments = await prisma.enrollment.findMany({
      where: { classId: classSubject.classId, academicYearId: classSubject.class.academicYearId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, studentNumber: true } },
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });

    return NextResponse.json(
      {
        classSubject: {
          id: classSubject.id,
          classId: classSubject.classId,
          className: classSubject.class.name,
          classLevel: classSubject.class.level,
          subjectId: classSubject.subjectId,
          subjectName: classSubject.subject.name,
          subjectIcon: classSubject.subject.icon,
          subjectColor: classSubject.subject.color,
        },
        students: enrollments.map((e) => e.student),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
