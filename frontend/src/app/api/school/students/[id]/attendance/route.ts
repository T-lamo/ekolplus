// GET /api/school/students/[id]/attendance?termId= — one student's full
// attendance picture for the Student Profile "Présences" tab (and its hero
// stats). The query lives in lib/server/student-views/attendance.ts
// (getStudentAttendance), shared with the Espace Élève's GET
// /api/student/attendance; this route is the staff authorization layer
// around it (presences.view grant, ownership check).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { getStudentAttendance } from '@/lib/server/student-views/attendance';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

async function assertOwnedStudent(id: string, schoolId: string) {
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student || student.schoolId !== schoolId) return null;
  return student;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'presences', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const { id: studentId } = await params;
    const student = await assertOwnedStudent(studentId, mySchool.schoolId);
    if (!student) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const view = await getStudentAttendance({
      studentId,
      termId: req.nextUrl.searchParams.get('termId'),
    });
    if (!view) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student has no active enrollment' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(view, { headers: { 'x-request-id': ctx.requestId } });
  });
}
