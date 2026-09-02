// GET /api/student/results?academicYearId=&termId= — the Espace Élève's
// Mes notes read model: the same getStudentResults the fiche élève uses,
// built for the `student` audience (PUBLISHED evaluations only, no
// nominative ranking). The studentId is never a parameter: it is the
// session's own resolved id, and anything not student-linked gets the
// 404 requireStudent returns.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStudent } from '@/lib/server/middleware/require-student';
import { getStudentResults } from '@/lib/server/student-views/results';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStudent(req);
    if (auth instanceof NextResponse) return auth;

    const view = await getStudentResults({
      schoolId: auth.student.schoolId,
      studentId: auth.student.studentId,
      academicYearId: req.nextUrl.searchParams.get('academicYearId'),
      termId: req.nextUrl.searchParams.get('termId'),
      audience: 'student',
    });
    return NextResponse.json(view, { headers: { 'x-request-id': ctx.requestId } });
  });
}
