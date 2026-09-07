// GET/PATCH/DELETE /api/teacher/evaluations/[id] — one of MY evaluations.
// Ownership = evaluation.classSubject.teacherId === my teacherId, re-read
// per request (404 anti-leak otherwise). PATCH mirrors the school route's
// contract (config edits + DRAFT/PUBLISHED flips + the lowered-maxScore
// guard); a classSubjectId change must stay inside my own affectations and
// a termId change must belong to the target class's academic year. DELETE
// cascades grades, same as the school route. See
// docs/superpowers/specs/2026-08-31-espace-enseignant-phase3-saisie-design.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import {
  resolveMySchoolIncludingTeacher,
  resolveMyTeacherProfile,
  type MyTeacherProfile,
} from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function notFound(requestId: string): NextResponse {
  return NextResponse.json(
    { error: 'NOT_FOUND', message: 'Not found' },
    { status: 404, headers: { 'x-request-id': requestId } },
  );
}

async function resolveCaller(sub: string): Promise<MyTeacherProfile | null> {
  const mySchool = await resolveMySchoolIncludingTeacher(sub);
  if (!mySchool) return null;
  return resolveMyTeacherProfile(sub, mySchool.schoolId);
}

async function findMyEvaluation(id: string, teacherId: string) {
  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    include: {
      classSubject: {
        select: {
          teacherId: true,
          class: { select: { id: true, name: true, schoolId: true, academicYearId: true } },
          subject: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
        },
      },
      term: { select: { id: true, label: true } },
    },
  });
  if (!evaluation || evaluation.classSubject.teacherId !== teacherId) return null;
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
    const myTeacher = await resolveCaller(auth.user.sub);
    if (!myTeacher) return notFound(ctx.requestId);

    const { id } = await params;
    const evaluation = await findMyEvaluation(id, myTeacher.teacherId);
    if (!evaluation) return notFound(ctx.requestId);

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
    const myTeacher = await resolveCaller(auth.user.sub);
    if (!myTeacher) return notFound(ctx.requestId);

    const { id } = await params;
    const existing = await findMyEvaluation(id, myTeacher.teacherId);
    if (!existing) return notFound(ctx.requestId);

    const parsed = UpdateEvaluationBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Moving the evaluation stays inside my own affectations.
    let targetYearId = existing.classSubject.class.academicYearId;
    if (parsed.data.classSubjectId && parsed.data.classSubjectId !== existing.classSubjectId) {
      if (!myTeacher.classSubjectIds.includes(parsed.data.classSubjectId)) {
        return notFound(ctx.requestId);
      }
      const target = await prisma.classSubject.findUnique({
        where: { id: parsed.data.classSubjectId },
        select: {
          class: { select: { academicYearId: true } },
          subject: { select: { evaluationMode: true } },
        },
      });
      if (!target) return notFound(ctx.requestId);
      // Same guard as POST: an Evaluation must never land on a qualitative
      // subject, retargeting included — normalized averages assume otherwise.
      if (target.subject.evaluationMode !== 'NUMERIC') {
        return NextResponse.json(
          {
            error: 'SUBJECT_NOT_NUMERIC',
            message: 'Cette matière est évaluée par critères, pas par notes.',
          },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      targetYearId = target.class.academicYearId;
    }
    if (parsed.data.termId) {
      const term = await prisma.term.findUnique({
        where: { id: parsed.data.termId },
        select: { id: true, academicYearId: true },
      });
      if (!term || term.academicYearId !== targetYearId) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Invalid termId' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    // Same guard as the school route: lowering maxScore under an existing
    // score would corrupt every normalized average computed from it.
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
    const myTeacher = await resolveCaller(auth.user.sub);
    if (!myTeacher) return notFound(ctx.requestId);

    const { id } = await params;
    const existing = await findMyEvaluation(id, myTeacher.teacherId);
    if (!existing) return notFound(ctx.requestId);

    await prisma.evaluation.delete({ where: { id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
