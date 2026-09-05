// PUT /api/school/subjects/[id]/criteria/reorder { ids } — `ids` must be
// exactly the subject's criteria set; order becomes the index in `ids`.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { ReorderBody, findOwnedSubjectId, listCriteria } from '@/lib/server/subject-criteria';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function PUT(
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
      'edit',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const { id } = await params;
    const subjectId = await findOwnedSubjectId(id, mySchool.schoolId);
    if (!subjectId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Subject not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = ReorderBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const ids = parsed.data.ids;
    const current = await prisma.subjectCriterion.findMany({
      where: { subjectId },
      select: { id: true },
    });
    const currentIds = new Set(current.map((c) => c.id));
    const sameSet =
      ids.length === currentIds.size &&
      new Set(ids).size === ids.length &&
      ids.every((cid) => currentIds.has(cid));
    if (!sameSet) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'ids must list every criterion of the subject exactly once',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.$transaction(
      ids.map((cid, index) =>
        prisma.subjectCriterion.update({ where: { id: cid }, data: { order: index } }),
      ),
    );
    const criteria = await listCriteria(subjectId);
    return NextResponse.json({ criteria }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
