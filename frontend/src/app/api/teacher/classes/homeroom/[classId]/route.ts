// GET /api/teacher/classes/homeroom/[classId] — roster of a class this
// teacher is titulaire (homeroom teacher) of. Separate route from
// [classSubjectId] because a homeroom relationship is keyed by Class, not
// ClassSubject — a titulaire is not necessarily also a subject teacher in
// their own homeroom class. Same 404-not-403 ownership convention.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
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
    const { classId } = await params;
    if (!myTeacher || !myTeacher.homeroomClassIds.includes(classId)) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const cls = await prisma.class.findUniqueOrThrow({
      where: { id: classId },
      select: { id: true, name: true, level: true, academicYearId: true },
    });

    const enrollments = await prisma.enrollment.findMany({
      where: { classId: cls.id, academicYearId: cls.academicYearId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, studentNumber: true } },
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });

    return NextResponse.json(
      {
        class: { id: cls.id, name: cls.name, level: cls.level },
        students: enrollments.map((e) => e.student),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
