// PUT /api/school/evaluations/[id]/grades — bulk upsert grades for one
// evaluation. Body: { grades: [{ studentId, score }] }. `score: null` clears
// a grade (absence / not yet graded — a real state, not deleted). Every
// studentId must be a student currently enrolled in the evaluation's class
// for its term's academic year — you can't grade a student who isn't in
// that class.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const BulkGradesBody = z.object({
  grades: z
    .array(
      z.object({
        studentId: z.string().min(1),
        score: z.number().min(0).max(1000).nullable(),
        absent: z.boolean().optional(),
        comment: z.string().trim().max(300).nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});

export async function PUT(
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
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const evaluation = await prisma.evaluation.findUnique({
      where: { id },
      include: {
        classSubject: { select: { classId: true, class: { select: { schoolId: true } } } },
        term: { select: { gradeEntryEnabled: true } },
      },
    });
    if (!evaluation || evaluation.classSubject.class.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Evaluation not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!evaluation.term.gradeEntryEnabled) {
      return NextResponse.json(
        {
          error: 'GRADE_ENTRY_DISABLED',
          message: 'La saisie des notes est désactivée pour cette période.',
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = BulkGradesBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // The client's own max-score hint is cosmetic (a red border, not a
    // disabled button) — this is the real boundary. A score above this
    // evaluation's maxScore would silently corrupt every average/rank/
    // appreciation computed from it, so the whole batch is rejected rather
    // than clamped or partially applied.
    const scoreTooHigh = parsed.data.grades.some(
      (g) => !g.absent && g.score != null && g.score > evaluation.maxScore,
    );
    if (scoreTooHigh) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: `Score exceeds this evaluation's max score (${evaluation.maxScore})`,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const studentIds = parsed.data.grades.map((g) => g.studentId);
    const enrolledCount = await prisma.enrollment.count({
      where: { classId: evaluation.classSubject.classId, studentId: { in: studentIds } },
    });
    if (enrolledCount !== new Set(studentIds).size) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'One or more students are not enrolled in this class',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.$transaction(
      parsed.data.grades.map((g) =>
        prisma.grade.upsert({
          where: { evaluationId_studentId: { evaluationId: id, studentId: g.studentId } },
          create: {
            evaluationId: id,
            studentId: g.studentId,
            score: g.absent ? null : g.score,
            absent: g.absent ?? false,
            comment: g.comment ?? null,
          },
          update: {
            score: g.absent ? null : g.score,
            absent: g.absent ?? false,
            ...(g.comment !== undefined ? { comment: g.comment } : {}),
          },
        }),
      ),
    );

    const grades = await prisma.grade.findMany({ where: { evaluationId: id } });
    return NextResponse.json({ grades }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
