// GET /api/student/bulletins — the Espace Élève's Bulletins list: one
// summary row per term (getStudentBulletinSummaries, `student` audience),
// for the session's own student only. `{ terms: [] }` without enrollment,
// like the staff route.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStudent } from '@/lib/server/middleware/require-student';
import { getStudentBulletinSummaries } from '@/lib/server/student-views/bulletins';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStudent(req);
    if (auth instanceof NextResponse) return auth;

    const view = await getStudentBulletinSummaries({
      studentId: auth.student.studentId,
      audience: 'student',
    });
    return NextResponse.json(view, { headers: { 'x-request-id': ctx.requestId } });
  });
}
