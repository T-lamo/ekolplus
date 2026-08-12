// GET /api/school/classes/[id]/notebook?termId= — Grade Notebook's "Toutes
// les matières" read model: every ClassSubject for this class, each with
// its own evaluations, plus every enrolled student's per-subject grades,
// per-subject sub-average, GENERAL weighted average (subjects weighted by
// ClassSubject.coefficient — same formula as students/[id]/results'
// overallAverage, so the two stay consistent), and general rank within the
// class. `termId` omitted = resolve the current term (mirrors the
// single-subject notebook endpoint's default).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool } from '@/lib/server/school';
import {
  competitionRank,
  resolveCurrentTerm,
  subjectAverageFor,
  weightedAverage,
} from '@/lib/server/grades';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

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

    const { id: classId } = await params;
    const cls = await prisma.class.findUnique({ where: { id: classId } });
    if (!cls || cls.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Class not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const terms = await prisma.term.findMany({
      where: { academicYear: { id: cls.academicYearId } },
      orderBy: { order: 'asc' },
    });
    const termIdParam = req.nextUrl.searchParams.get('termId');
    const term = termIdParam
      ? (terms.find((t) => t.id === termIdParam) ?? null)
      : resolveCurrentTerm(terms);

    const shell = {
      classId,
      className: cls.name,
      terms: terms.map((t) => ({ id: t.id, label: t.label, order: t.order })),
      resolvedTermId: term?.id ?? null,
    };

    if (!term) {
      return NextResponse.json(
        {
          ...shell,
          subjects: [],
          students: [],
          classAverage: null,
          bestScore: null,
          worstScore: null,
          gradedCount: 0,
          totalCount: 0,
        },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const classSubjects = await prisma.classSubject.findMany({
      where: { classId },
      include: { subject: true },
      orderBy: [{ subject: { domain: 'asc' } }, { subject: { name: 'asc' } }],
    });
    const classSubjectIds = classSubjects.map((cs) => cs.id);

    const [evaluations, enrollments] = await Promise.all([
      classSubjectIds.length === 0
        ? Promise.resolve([])
        : prisma.evaluation.findMany({
            where: { classSubjectId: { in: classSubjectIds }, termId: term.id },
            orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
            include: { grades: true },
          }),
      prisma.enrollment.findMany({
        where: { classId, academicYearId: cls.academicYearId },
        include: {
          student: { select: { id: true, firstName: true, lastName: true, studentNumber: true } },
        },
        orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
      }),
    ]);

    const evalsByClassSubject = new Map<string, typeof evaluations>();
    for (const ev of evaluations) {
      const list = evalsByClassSubject.get(ev.classSubjectId) ?? [];
      list.push(ev);
      evalsByClassSubject.set(ev.classSubjectId, list);
    }

    const students = enrollments.map((en) => {
      const subjectCells = classSubjects.map((cs) => {
        const evals = evalsByClassSubject.get(cs.id) ?? [];
        return {
          classSubjectId: cs.id,
          grades: evals.map((e) => {
            const g = e.grades.find((gr) => gr.studentId === en.studentId);
            return {
              evaluationId: e.id,
              score: g?.score ?? null,
              absent: g?.absent ?? false,
              comment: g?.comment ?? null,
            };
          }),
          average: subjectAverageFor(evals, en.studentId),
        };
      });
      const generalAverage = weightedAverage(
        subjectCells
          .filter((sc) => sc.average != null)
          .map((sc) => ({
            value: sc.average!,
            weight: classSubjects.find((cs) => cs.id === sc.classSubjectId)?.coefficient ?? null,
          })),
      );
      return {
        studentId: en.studentId,
        firstName: en.student.firstName,
        lastName: en.student.lastName,
        studentNumber: en.student.studentNumber,
        subjects: subjectCells,
        generalAverage,
      };
    });

    const ranked = [...students]
      .filter((s) => s.generalAverage != null)
      .sort((a, b) => b.generalAverage! - a.generalAverage!);
    const ranks = competitionRank(ranked, (s) => s.generalAverage!);
    const rankByStudent = new Map(ranked.map((s, i) => [s.studentId, ranks[i]!]));
    const studentsWithRank = students.map((s) => ({
      ...s,
      rank: rankByStudent.get(s.studentId) ?? null,
    }));

    const averages = ranked.map((s) => s.generalAverage!);
    const classAverage = averages.length
      ? Math.round((averages.reduce((a, b) => a + b, 0) / averages.length) * 10) / 10
      : null;

    return NextResponse.json(
      {
        ...shell,
        subjects: classSubjects.map((cs) => ({
          classSubjectId: cs.id,
          subjectId: cs.subjectId,
          subjectName: cs.subject.name,
          subjectCoefficient: cs.coefficient,
          evaluations: (evalsByClassSubject.get(cs.id) ?? []).map((e) => ({
            id: e.id,
            label: e.label,
            type: e.type,
            maxScore: e.maxScore,
            coefficient: e.coefficient,
            countsTowardAverage: e.countsTowardAverage,
            status: e.status,
            date: e.date,
          })),
        })),
        students: studentsWithRank,
        classAverage,
        bestScore: averages.length ? Math.max(...averages) : null,
        worstScore: averages.length ? Math.min(...averages) : null,
        gradedCount: students.filter((s) => s.generalAverage != null).length,
        totalCount: students.length,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
