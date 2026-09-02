// GET /api/school/students/[id]/bulletins — Student Profile's "Bulletins" tab
// read model: one summary row per Term. The query lives in
// lib/server/student-views/bulletins.ts (getStudentBulletinSummaries),
// shared with the Espace Élève's GET /api/student/bulletins; this route is
// the staff authorization layer around it (notes.view grant, ownership
// check).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { getStudentBulletinSummaries } from '@/lib/server/student-views/bulletins';
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

    const view = await getStudentBulletinSummaries({ studentId, audience: 'staff' });
    return NextResponse.json(view, { headers: { 'x-request-id': ctx.requestId } });
  });
}
