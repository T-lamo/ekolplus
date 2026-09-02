// GET /api/school/class-subjects/[id]/notebook?termId= — Grade Notebook's
// read model: every evaluation for this class+subject+term, every enrolled
// student's per-evaluation scores, weighted subject average, and rank.
// `termId` omitted = resolve the current term (mirrors the Notes Résultats
// results endpoint's default). See .planning/banani/grade-entry-flow.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { competitionRank, resolveCurrentTerm, subjectAverageFor } from '@/lib/server/grades';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

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

    const { id: classSubjectId } = await params;
    const classSubject = await prisma.classSubject.findUnique({
      where: { id: classSubjectId },
      include: {
        class: { select: { id: true, name: true, schoolId: true, academicYearId: true } },
        subject: true,
      },
    });
    if (!classSubject || classSubject.class.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'ClassSubject not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const terms = await prisma.term.findMany({
      where: { academicYear: { id: classSubject.class.academicYearId } },
      orderBy: { order: 'asc' },
    });
    const termIdParam = req.nextUrl.searchParams.get('termId');
    const term = termIdParam
      ? (terms.find((t) => t.id === termIdParam) ?? null)
      : resolveCurrentTerm(terms);

    const shell = {
      classSubjectId,
      className: classSubject.class.name,
      subjectName: classSubject.subject.name,
      subjectCoefficient: classSubject.coefficient,
      terms: terms.map((t) => ({ id: t.id, label: t.label, order: t.order })),
      resolvedTermId: term?.id ?? null,
    };

    if (!term) {
      return NextResponse.json(
        {
          ...shell,
          evaluations: [],
          students: [],
          classAverage: null,
          bestScore: null,
          worstScore: null,
          absentCount: 0,
          gradedCount: 0,
          totalCount: 0,
        },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [evaluations, enrollments] = await Promise.all([
      prisma.evaluation.findMany({
        where: { classSubjectId, termId: term.id },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        include: { grades: true },
      }),
      prisma.enrollment.findMany({
        where: { classId: classSubject.classId, academicYearId: classSubject.class.academicYearId },
        include: {
          student: { select: { id: true, firstName: true, lastName: true, studentNumber: true } },
        },
        orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
      }),
    ]);

    const students = enrollments.map((en) => ({
      studentId: en.studentId,
      firstName: en.student.firstName,
      lastName: en.student.lastName,
      studentNumber: en.student.studentNumber,
      grades: evaluations.map((e) => {
        const g = e.grades.find((gr) => gr.studentId === en.studentId);
        return {
          evaluationId: e.id,
          score: g?.score ?? null,
          absent: g?.absent ?? false,
          comment: g?.comment ?? null,
        };
      }),
      average: subjectAverageFor(evaluations, en.studentId),
    }));

    const ranked = [...students]
      .filter((s) => s.average != null)
      .sort((a, b) => b.average! - a.average!);
    const ranks = competitionRank(ranked, (s) => s.average!);
    const rankByStudent = new Map(ranked.map((s, i) => [s.studentId, ranks[i]!]));
    const studentsWithRank = students.map((s) => ({
      ...s,
      rank: rankByStudent.get(s.studentId) ?? null,
    }));

    const averages = ranked.map((s) => s.average!);
    const classAverage = averages.length
      ? Math.round((averages.reduce((a, b) => a + b, 0) / averages.length) * 10) / 10
      : null;
    const absentCount = students.filter((s) => s.grades.some((g) => g.absent)).length;
    const gradedCount = students.filter((s) => s.average != null).length;

    return NextResponse.json(
      {
        ...shell,
        evaluations: evaluations.map((e) => ({
          id: e.id,
          label: e.label,
          type: e.type,
          maxScore: e.maxScore,
          coefficient: e.coefficient,
          countsTowardAverage: e.countsTowardAverage,
          status: e.status,
          date: e.date,
        })),
        students: studentsWithRank,
        classAverage,
        bestScore: averages.length ? Math.max(...averages) : null,
        worstScore: averages.length ? Math.min(...averages) : null,
        absentCount,
        gradedCount,
        totalCount: students.length,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
