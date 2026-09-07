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
import { requireSchoolPermission } from '@/lib/server/school-permissions';
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

    const perm = await requireSchoolPermission(auth.user.sub, 'notes', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

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

    const perm = await requireSchoolPermission(auth.user.sub, 'notes', 'edit', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

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
        include: {
          class: { select: { schoolId: true } },
          subject: { select: { evaluationMode: true } },
        },
      });
      if (!classSubject || classSubject.class.schoolId !== mySchool.schoolId) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Invalid classSubjectId' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      // Same guard as POST: an Evaluation must never land on a qualitative
      // subject, retargeting included — normalized averages assume otherwise.
      if (classSubject.subject.evaluationMode !== 'NUMERIC') {
        return NextResponse.json(
          {
            error: 'SUBJECT_NOT_NUMERIC',
            message: 'Cette matière est évaluée par critères, pas par notes.',
          },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
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

    // Lowering maxScore on an evaluation that already has grades would
    // silently leave stale scores above the new ceiling — and since
    // subjectAverageFor() normalizes score/maxScore*20, a now-over-max
    // score would push the normalized value past 20, distorting the
    // average worse than an unnormalized system ever would have.
    if (parsed.data.maxScore != null) {
      const overMax = await prisma.grade.findFirst({
        where: { evaluationId: id, score: { gt: parsed.data.maxScore } },
      });
      if (overMax) {
        return NextResponse.json(
          {
            error: 'VALIDATION_FAILED',
            message: 'Existing grades exceed the new max score — update those grades first',
          },
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

    const perm = await requireSchoolPermission(auth.user.sub, 'notes', 'delete', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

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
