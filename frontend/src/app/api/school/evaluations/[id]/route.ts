// PATCH /api/school/evaluations/[id] — edit an evaluation's config (Edit
// Evaluation screen) or flip its status DRAFT→PUBLISHED ("Valider les
// notes" on Grade Entry). classSubjectId/termId ARE editable (Banani's
// "Modifier l'évaluation" form lets you move Classe/Matière/Trimestre) —
// existing grades stay attached to the same evaluation row either way.
// DELETE /api/school/evaluations/[id] — cascades its grades.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

async function assertOwnedEvaluation(id: string, schoolId: string) {
  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    include: { classSubject: { select: { class: { select: { schoolId: true } } } } },
  });
  if (!evaluation || evaluation.classSubject.class.schoolId !== schoolId) return null;
  return evaluation;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const evaluation = await prisma.evaluation.findUnique({
      where: { id },
      include: {
        classSubject: {
          include: {
            class: { select: { id: true, name: true, schoolId: true } },
            subject: { select: { id: true, name: true } },
            teacher: { select: { id: true, name: true } },
          },
        },
        term: { select: { id: true, label: true } },
      },
    });
    if (!evaluation || evaluation.classSubject.class.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Evaluation not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json({ evaluation }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

const UpdateEvaluationBody = z.object({
  classSubjectId: z.string().min(1).optional(),
  termId: z.string().min(1).optional(),
  label: z.string().trim().min(1).max(60).optional(),
  type: z.enum(['DS', 'INTERROGATION', 'EXAMEN', 'AUTRE']).optional(),
  maxScore: z.number().int().min(1).max(1000).optional(),
  coefficient: z.number().int().min(1).max(10).optional(),
  countsTowardAverage: z.boolean().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  date: z.coerce.date().nullable().optional(),
});

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

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const existing = await assertOwnedEvaluation(id, mySchool.schoolId);
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Evaluation not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = UpdateEvaluationBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (parsed.data.classSubjectId) {
      const classSubject = await prisma.classSubject.findUnique({
        where: { id: parsed.data.classSubjectId },
        include: { class: { select: { schoolId: true } } },
      });
      if (!classSubject || classSubject.class.schoolId !== mySchool.schoolId) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Invalid classSubjectId' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }
    if (parsed.data.termId) {
      const term = await prisma.term.findUnique({
        where: { id: parsed.data.termId },
        include: { academicYear: { select: { schoolId: true } } },
      });
      if (!term || term.academicYear.schoolId !== mySchool.schoolId) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Invalid termId' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const data = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
    const evaluation = await prisma.evaluation.update({ where: { id }, data });

    return NextResponse.json({ evaluation }, { headers: { 'x-request-id': ctx.requestId } });
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

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const existing = await assertOwnedEvaluation(id, mySchool.schoolId);
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Evaluation not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.evaluation.delete({ where: { id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
