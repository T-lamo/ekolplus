// GET /api/student/appreciations?termId= — the Espace Élève's Appréciations
// read model: the same getStudentAppreciations the fiche élève uses, built
// for the `student` audience (PUBLISHED rows only, no roster prev/next),
// for the session's own student only. 404 without any enrollment,
// mirroring the staff route. Read-only: there is no PUT/DELETE here.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStudent } from '@/lib/server/middleware/require-student';
import { getStudentAppreciations } from '@/lib/server/student-views/appreciations';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStudent(req);
    if (auth instanceof NextResponse) return auth;

    const view = await getStudentAppreciations({
      studentId: auth.student.studentId,
      termId: req.nextUrl.searchParams.get('termId'),
      audience: 'student',
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
