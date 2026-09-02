// PUT /api/teacher/evaluations/[id]/grades — bulk upsert grades for one of
// MY evaluations. Same contract and guards as the school route (over-max
// batch rejection, enrolled-students check, per-term grade-entry lock with
// the same stable GRADE_ENTRY_DISABLED code so the frontend handles both
// surfaces identically); only the authorization differs: ownership is the
// evaluation's classSubject.teacherId. `score: null` clears a grade;
// Grade.absent stays a real state distinct from not-yet-graded. See
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

    const { id } = await params;
    const evaluation = await prisma.evaluation.findUnique({
      where: { id },
      include: {
        classSubject: {
          select: { teacherId: true, classId: true, class: { select: { schoolId: true } } },
        },
        term: { select: { gradeEntryEnabled: true } },
      },
    });
    if (
      !evaluation ||
      evaluation.classSubject.teacherId !== myTeacher.teacherId ||
      evaluation.classSubject.class.schoolId !== mySchool.schoolId
    ) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
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
