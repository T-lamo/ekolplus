// GET /api/school/evaluations?classSubjectId=&termId= — list evaluations for
// one subject-in-a-class, one term, ordered for display.
// POST /api/school/evaluations — create one. No dedicated grade-notebook/
// grade-entry screen exists yet (Epic 6, not fetched this pass) — this
// endpoint is the real API those screens will consume; for now it's driven
// by a seed script. See .planning/banani/epic-6-data-model.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'notes', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const classSubjectId = req.nextUrl.searchParams.get('classSubjectId');
    const termId = req.nextUrl.searchParams.get('termId');
    if (!classSubjectId) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'classSubjectId is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const classSubject = await prisma.classSubject.findUnique({
      where: { id: classSubjectId },
      include: { class: { select: { schoolId: true } } },
    });
    if (!classSubject || classSubject.class.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'ClassSubject not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const evaluations = await prisma.evaluation.findMany({
      where: { classSubjectId, ...(termId ? { termId } : {}) },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { grades: true } } },
    });

    return NextResponse.json({ evaluations }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

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
  // nullable: the creation modal sends date: null when the field is left
  // empty; bare z.coerce.date() would coerce null to epoch (1970-01-01).
  date: z.coerce.date().nullable().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'notes', 'create', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const parsed = CreateEvaluationBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [classSubject, term] = await Promise.all([
      prisma.classSubject.findUnique({
        where: { id: parsed.data.classSubjectId },
        include: { class: { select: { schoolId: true } } },
      }),
      prisma.term.findUnique({
        where: { id: parsed.data.termId },
        include: { academicYear: { select: { schoolId: true } } },
      }),
    ]);
    if (
      !classSubject ||
      classSubject.class.schoolId !== mySchool.schoolId ||
      !term ||
      term.academicYear.schoolId !== mySchool.schoolId
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
