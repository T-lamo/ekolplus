// PATCH /api/school/subjects/[id]/criteria/[criterionId] — rename.
// DELETE … — remove, 409 CRITERION_IN_USE once any rating references it
// (archiving is out of scope, spec 2026-09-05 §15).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { CRITERION_SELECT, CriterionBody, findOwnedSubjectId } from '@/lib/server/subject-criteria';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

type Params = { params: Promise<{ id: string; criterionId: string }> };

async function ownedCriterion(
  subjectId: string,
  criterionId: string,
): Promise<{ id: string } | null> {
  return prisma.subjectCriterion.findFirst({
    where: { id: criterionId, subjectId },
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

    const { id, criterionId } = await params;
    const subjectId = await findOwnedSubjectId(id, mySchool.schoolId);
    const existing = subjectId ? await ownedCriterion(subjectId, criterionId) : null;
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Criterion not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = CriterionBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const criterion = await prisma.subjectCriterion.update({
      where: { id: criterionId },
      data: { label: parsed.data.label },
      select: CRITERION_SELECT,
    });
    return NextResponse.json({ criterion }, { headers: { 'x-request-id': ctx.requestId } });
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
      'edit',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const { id, criterionId } = await params;
    const subjectId = await findOwnedSubjectId(id, mySchool.schoolId);
    const existing = subjectId ? await ownedCriterion(subjectId, criterionId) : null;
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Criterion not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const inUse = await prisma.criteriaRating.count({ where: { criterionId } });
    if (inUse > 0) {
      return NextResponse.json(
        {
          error: 'CRITERION_IN_USE',
          message: 'Ce critère a déjà des coches. Il ne peut pas être supprimé.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    await prisma.subjectCriterion.delete({ where: { id: criterionId } });
    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
