// DELETE /api/school/class-subjects/[id] — hard delete (also clears any
// coefficient set from the Coefficients screen — see the deliberate no-partial-
// null-case decision in .planning/banani/affectations.md).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'configuration',
      'delete',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const { id } = await params;
    const row = await prisma.classSubject.findUnique({
      where: { id },
      include: { class: { select: { schoolId: true } } },
    });
    if (!row || row.class.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Deleting the pivot cascades on its evaluations (grades) — refuse when
    // any exist so a class/subject page toggle can never wipe a gradebook.
    const evaluationCount = await prisma.evaluation.count({ where: { classSubjectId: id } });
    if (evaluationCount > 0) {
      return NextResponse.json(
        {
          error: 'CLASS_SUBJECT_HAS_EVALUATIONS',
          message: 'Des notes existent pour cette matière dans cette classe.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.classSubject.delete({ where: { id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
