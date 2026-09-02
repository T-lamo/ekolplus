// GET /api/school/students/[id]/results?academicYearId=&termId=
//
// The Notes & Résultats tab's read model. The query itself lives in
// lib/server/student-views/results.ts (getStudentResults), shared with the
// Espace Élève's GET /api/student/results; this route is the staff
// authorization layer around it (notes.view grant, ownership check) and
// asks for the `staff` audience, which keeps the nominative class ranking
// and draft evaluations the fiche shows.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { getStudentResults } from '@/lib/server/student-views/results';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'notes', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const { id: studentId } = await params;
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student || student.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const view = await getStudentResults({
      schoolId: mySchool.schoolId,
      studentId,
      academicYearId: req.nextUrl.searchParams.get('academicYearId'),
      termId: req.nextUrl.searchParams.get('termId'),
      audience: 'staff',
    });
    return NextResponse.json(view, { headers: { 'x-request-id': ctx.requestId } });
  });
}
