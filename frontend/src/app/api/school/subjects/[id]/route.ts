// GET /api/school/subjects/[id] — full "fiche matière" payload (profile +
// prerequisites + class assignments + teacher availability + unassigned
// classes), one round trip for every tab (add-matiere.md).
// PATCH /api/school/subjects/[id] — update the profile; `status` drives
// `isActive`; `prerequisiteIds` replaces the prerequisite set.
// DELETE /api/school/subjects/[id] — delete, blocked (409) if still
// referenced by a ClassSubject row. See .planning/banani/matieres-list.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { hasMinRole } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import {
  SUBJECT_PROFILE_SELECT,
  SubjectProfileBody,
  assertSubjectRelationsOwned,
  getSubjectDetail,
  splitSubjectInput,
  validateScoreBounds,
} from '@/lib/server/subjects';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

async function assertOwnedSubject(id: string, schoolId: string) {
  const subject = await prisma.subject.findUnique({ where: { id } });
  if (!subject || subject.schoolId !== schoolId) return null;
  return subject;
}

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
    const subject = await getSubjectDetail(mySchool.schoolId, id);
    if (!subject) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Subject not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json({ subject }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function PATCH(
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
    const existing = await assertOwnedSubject(id, mySchool.schoolId);
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Subject not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = SubjectProfileBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const input = parsed.data;
    const boundsError = validateScoreBounds({
      maxScore: input.maxScore ?? existing.maxScore,
      passingScore: input.passingScore ?? existing.passingScore,
      eliminatoryScore:
        input.eliminatoryScore === undefined ? existing.eliminatoryScore : input.eliminatoryScore,
    });
    if (boundsError) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: boundsError },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const relationError = await assertSubjectRelationsOwned(mySchool.schoolId, input, id);
    if (relationError) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: relationError },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (input.code && input.code !== existing.code) {
      const taken = await prisma.subject.count({
        where: { schoolId: mySchool.schoolId, code: input.code, id: { not: id } },
      });
      if (taken > 0) {
        return NextResponse.json(
          {
            error: 'SUBJECT_CODE_TAKEN',
            message: 'Ce code est déjà utilisé par une autre matière.',
          },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const { data, prerequisiteIds } = splitSubjectInput(input);
    const subject = await prisma.subject.update({
      where: { id },
      data: {
        ...data,
        ...(prerequisiteIds
          ? { prerequisites: { set: prerequisiteIds.map((pid) => ({ id: pid })) } }
          : {}),
      },
      select: SUBJECT_PROFILE_SELECT,
    });
    return NextResponse.json({ subject }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

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
    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const existing = await assertOwnedSubject(id, mySchool.schoolId);
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Subject not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const inUse = await prisma.classSubject.count({ where: { subjectId: id } });
    if (inUse > 0) {
      return NextResponse.json(
        {
          error: 'SUBJECT_IN_USE',
          message:
            'Cette matière est encore affectée à des classes — retire les affectations avant de la supprimer.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.subject.delete({ where: { id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
