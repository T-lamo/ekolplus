// PATCH /api/school/subjects/[id]/chapters/[chapterId] — inline edits from
// the Programme annuel tab (title/objectives/hours/reference/competence).
// DELETE — remove a chapter; the remaining ones keep their relative order
// (gaps are fine, the UI numbers chapters by position).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { CHAPTER_SELECT, ChapterFields } from '@/lib/server/subject-chapters';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

type Params = { params: Promise<{ id: string; chapterId: string }> };

async function findOwnedChapter(schoolId: string, subjectId: string, chapterId: string) {
  return prisma.subjectChapter.findFirst({
    where: { id: chapterId, subjectId, subject: { schoolId } },
    select: { id: true },
  });
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
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

    const { id, chapterId } = await params;
    const existing = await findOwnedChapter(mySchool.schoolId, id, chapterId);
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Chapter not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = ChapterFields.partial().safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
    const chapter = await prisma.subjectChapter.update({
      where: { id: chapterId },
      data,
      select: CHAPTER_SELECT,
    });
    return NextResponse.json({ chapter }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
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

    const { id, chapterId } = await params;
    const existing = await findOwnedChapter(mySchool.schoolId, id, chapterId);
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Chapter not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.subjectChapter.delete({ where: { id: chapterId } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
