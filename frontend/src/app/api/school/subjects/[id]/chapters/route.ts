// GET /api/school/subjects/[id]/chapters — the active year's terms plus every
// chapter of the subject, ordered per term (programme-annuel.md).
// POST /api/school/subjects/[id]/chapters — append a chapter to a term
// (order = last + 1).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import {
  CHAPTER_SELECT,
  ChapterFields,
  findActiveTerms,
  findOwnedSubject,
} from '@/lib/server/subject-chapters';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'configuration',
      'view',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const { id } = await params;
    const subject = await findOwnedSubject(mySchool.schoolId, id);
    if (!subject) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Subject not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const year = await findActiveTerms(mySchool.schoolId);
    const chapters = year
      ? await prisma.subjectChapter.findMany({
          where: { subjectId: id, termId: { in: year.terms.map((t) => t.id) } },
          orderBy: [{ termId: 'asc' }, { order: 'asc' }],
          select: CHAPTER_SELECT,
        })
      : [];

    return NextResponse.json(
      {
        activeYear: year ? { id: year.id, label: year.label } : null,
        terms: year?.terms ?? [],
        chapters,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const CreateChapterBody = ChapterFields.extend({ termId: z.string().min(1) });

export async function POST(
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
      'create',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const { id } = await params;
    const subject = await findOwnedSubject(mySchool.schoolId, id);
    if (!subject) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Subject not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = CreateChapterBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const year = await findActiveTerms(mySchool.schoolId);
    if (!year || !year.terms.some((t) => t.id === parsed.data.termId)) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid termId' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { termId, ...fields } = parsed.data;
    const chapter = await prisma.$transaction(async (tx) => {
      const last = await tx.subjectChapter.findFirst({
        where: { subjectId: id, termId },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      return tx.subjectChapter.create({
        data: {
          subjectId: id,
          termId,
          order: (last?.order ?? 0) + 1,
          title: fields.title,
          objectives: fields.objectives ?? null,
          hours: fields.hours ?? null,
          reference: fields.reference ?? null,
          competence: fields.competence ?? null,
        },
        select: CHAPTER_SELECT,
      });
    });

    return NextResponse.json(
      { chapter },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
