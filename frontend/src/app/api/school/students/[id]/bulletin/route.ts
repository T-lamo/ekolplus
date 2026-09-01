// GET /api/school/students/[id]/bulletin?termId= — Bulletin Viewer's full
// data model. The actual query lives in getStudentBulletinView
// (lib/server/bulletin-pdf/get-bulletin-view.ts), shared with the
// server-side PDF pipeline's print page so both render identically.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { getStudentBulletinView } from '@/lib/server/bulletin-pdf/get-bulletin-view';
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
    const termId = req.nextUrl.searchParams.get('termId');
    const view = await getStudentBulletinView(mySchool.schoolId, studentId, termId);
    if (!view) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(view, { headers: { 'x-request-id': ctx.requestId } });
  });
}
