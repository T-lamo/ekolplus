// GET /api/student/bulletin?termId= — the Espace Élève's Bulletin Viewer
// data model: the same getStudentBulletinView the school viewer and the
// PDF pipeline use, built for the `student` audience (no roster prev/next,
// PUBLISHED appreciations only), for the session's own student only.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStudent } from '@/lib/server/middleware/require-student';
import { getStudentBulletinView } from '@/lib/server/bulletin-pdf/get-bulletin-view';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStudent(req);
    if (auth instanceof NextResponse) return auth;

    const view = await getStudentBulletinView(
      auth.student.schoolId,
      auth.student.studentId,
      req.nextUrl.searchParams.get('termId'),
      'student',
    );
    if (!view) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Bulletin not available' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json(view, { headers: { 'x-request-id': ctx.requestId } });
  });
}
