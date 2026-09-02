// GET /api/student/attendance?termId= — the Espace Élève's Mes présences
// read model: the same getStudentAttendance the fiche élève uses, for the
// session's own student only (never a parameter). 404 without any
// enrollment, mirroring the staff route.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStudent } from '@/lib/server/middleware/require-student';
import { getStudentAttendance } from '@/lib/server/student-views/attendance';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStudent(req);
    if (auth instanceof NextResponse) return auth;

    const view = await getStudentAttendance({
      studentId: auth.student.studentId,
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
