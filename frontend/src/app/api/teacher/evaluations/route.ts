// POST /api/teacher/evaluations — a teacher creates an evaluation for one
// of their OWN class-subjects. Same body contract as the school route; the
// authorization differs: the classSubjectId must be in the caller's own
// affectations (404 anti-leak otherwise, checked BEFORE any lookup so a
// foreign id costs nothing), and the term must belong to the class's
// academic year (stricter than the school route's school-level check, and
// what the spec intends). Teachers publish their own evaluations via the
// sibling [id] route. See
// docs/superpowers/specs/2026-08-31-espace-enseignant-phase3-saisie-design.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const CreateEvaluationBody = z.object({
  classSubjectId: z.string().min(1),
  termId: z.string().min(1),
  label: z.string().trim().min(1).max(60),
  type: z.enum(['DS', 'INTERROGATION', 'EXAMEN', 'AUTRE']).optional(),
  maxScore: z.number().int().min(1).max(1000).optional(),
  coefficient: z.number().int().min(1).max(10).optional(),
  countsTowardAverage: z.boolean().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  order: z.number().int().min(0).optional(),
  date: z.coerce.date().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchoolIncludingTeacher(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const myTeacher = await resolveMyTeacherProfile(auth.user.sub, mySchool.schoolId);
    if (!myTeacher) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = CreateEvaluationBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Anti-leak: check affectations first without touching DB.
    if (!myTeacher.classSubjectIds.includes(parsed.data.classSubjectId)) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [classSubject, term] = await Promise.all([
      prisma.classSubject.findUnique({
        where: { id: parsed.data.classSubjectId },
        select: { id: true, class: { select: { schoolId: true, academicYearId: true } } },
      }),
      prisma.term.findUnique({
        where: { id: parsed.data.termId },
        select: { id: true, academicYearId: true },
      }),
    ]);
    if (
      !classSubject ||
      classSubject.class.schoolId !== mySchool.schoolId ||
      !term ||
      term.academicYearId !== classSubject.class.academicYearId
    ) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid classSubjectId or termId' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const evaluation = await prisma.evaluation.create({
      data: {
        classSubjectId: parsed.data.classSubjectId,
        termId: parsed.data.termId,
        label: parsed.data.label,
        type: parsed.data.type ?? 'AUTRE',
        maxScore: parsed.data.maxScore ?? 20,
        coefficient: parsed.data.coefficient ?? 1,
        countsTowardAverage: parsed.data.countsTowardAverage ?? true,
        notes: parsed.data.notes ?? null,
        order: parsed.data.order ?? 0,
        date: parsed.data.date ?? null,
      },
    });

    return NextResponse.json(
      { evaluation },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
