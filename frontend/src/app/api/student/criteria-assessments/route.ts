// GET /api/student/criteria-assessments?termId= — the Espace Élève's
// qualitative grids: PUBLISHED sheets of the student's class for the term,
// reduced to the student's own ticks. The studentId is never a parameter:
// it is the session's own resolved id (requireStudent). Spec 2026-09-05 §7.
// classId/academicYearId can be null (no current-year Enrollment yet, e.g.
// mid-rollover) — same guard as the student timetable route, returning the
// same empty shape getStudentQualitativeGrids returns for an unresolved term.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStudent } from '@/lib/server/middleware/require-student';
import { getStudentQualitativeGrids } from '@/lib/server/student-views/criteria';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStudent(req);
    if (auth instanceof NextResponse) return auth;
    const { classId, academicYearId, studentId } = auth.student;

    if (!classId || !academicYearId) {
      return NextResponse.json(
        { terms: [], term: null, grids: [] },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const view = await getStudentQualitativeGrids({
      academicYearId,
      classId,
      studentId,
      termId: req.nextUrl.searchParams.get('termId'),
    });
    return NextResponse.json(view, { headers: { 'x-request-id': ctx.requestId } });
  });
}
