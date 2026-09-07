// GET /api/school/subjects/[id]/criteria — ordered criteria of a subject.
// POST /api/school/subjects/[id]/criteria — append one criterion (order =
// last + 1). Criteria may be created while the stored evaluationMode is
// still NUMERIC (the form adds them before saving the profile); they are
// only displayed and rated for QUALITATIVE subjects. Spec 2026-09-05 §4.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import {
  CRITERION_SELECT,
  CriterionBody,
  findOwnedSubjectId,
  listCriteria,
} from '@/lib/server/subject-criteria';
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
    const subjectId = await findOwnedSubjectId(id, mySchool.schoolId);
    if (!subjectId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Subject not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const criteria = await listCriteria(subjectId);
    return NextResponse.json({ criteria }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

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

    const parsed = CriterionBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const last = await prisma.subjectCriterion.findFirst({
      where: { subjectId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const criterion = await prisma.subjectCriterion.create({
      data: { subjectId, label: parsed.data.label, order: last ? last.order + 1 : 0 },
      select: CRITERION_SELECT,
    });
    return NextResponse.json(
      { criterion },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
