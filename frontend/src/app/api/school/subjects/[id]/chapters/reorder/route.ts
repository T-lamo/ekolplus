// PUT /api/school/subjects/[id]/chapters/reorder — persist a drag-and-drop
// reorder inside one term: `ids` is the full new sequence for `termId`, every
// chapter is renumbered 1..n in a single transaction. Refused (400) if the
// list doesn't match the term's chapters exactly, so a stale client can't
// silently drop or duplicate a chapter.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { hasMinRole } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { CHAPTER_SELECT, findOwnedSubject } from '@/lib/server/subject-chapters';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const ReorderBody = z.object({
  termId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1).max(200),
});

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
    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const subject = await findOwnedSubject(mySchool.schoolId, id);
    if (!subject) {
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
    const { termId, ids } = parsed.data;

    const current = await prisma.subjectChapter.findMany({
      where: { subjectId: id, termId },
      select: { id: true },
    });
    const currentIds = new Set(current.map((c) => c.id));
    const sameSet =
      currentIds.size === ids.length &&
      new Set(ids).size === ids.length &&
      ids.every((cid) => currentIds.has(cid));
    if (!sameSet) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'ids must list every chapter of the term exactly once',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const chapters = await prisma.$transaction(
      ids.map((cid, index) =>
        prisma.subjectChapter.update({
          where: { id: cid },
          data: { order: index + 1 },
          select: CHAPTER_SELECT,
        }),
      ),
    );
    return NextResponse.json({ chapters }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
