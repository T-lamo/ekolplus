// GET /api/school/students/[id]/results?academicYearId=&termId=
//
// The Notes & Résultats tab's read model: per-subject breakdown (dynamic
// evaluation columns, subject average, class average, trend vs. previous
// term, auto appreciation), overall weighted average, class ranking,
// best/worst subject, pedagogical alert subjects, and (when a specific term
// is resolved) the student's goals for that term.
//
// `termId` query param: omitted = server resolves the "current" term by
// date (used by the profile hero's summary stats); `"all"` = whole-year
// aggregate (pools every evaluation across all terms of the year); an
// explicit id = that term. The resolved ids are always echoed back so the
// frontend's filter dropdowns can sync to the default without a second
// round trip. See .planning/banani/epic-6-data-model.md for every formula.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool } from '@/lib/server/school';
import {
  appreciationFor,
  competitionRank,
  resolveCurrentTerm,
  subjectAverageFor as scoreOf,
  trendBetween,
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

    const { id: studentId } = await params;
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student || student.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const years = await prisma.academicYear.findMany({
      where: { schoolId: mySchool.schoolId },
      orderBy: { startDate: 'desc' },
    });
    const yearIdParam = req.nextUrl.searchParams.get('academicYearId');
    const year =
      years.find((y) => y.id === yearIdParam) ?? years.find((y) => y.isActive) ?? years[0];

    if (!year) {
      return NextResponse.json(
        {
          years: [],
          terms: [],
          resolvedAcademicYearId: null,
          resolvedTermId: null,
          termMode: 'NONE',
          enrolled: false,
          className: null,
          subjects: [],
          overallAverage: null,
          classOverallAverage: null,
          rank: null,
          rankedCount: 0,
          bestSubject: null,
          worstSubject: null,
          alertSubjects: [],
          ranking: [],
          goals: null,
        },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const terms = await prisma.term.findMany({
      where: { academicYearId: year.id },
      orderBy: { order: 'asc' },
    });

    const termIdParam = req.nextUrl.searchParams.get('termId');
    let term: (typeof terms)[number] | null = null;
    let termMode: 'SPECIFIC' | 'ALL' | 'NONE';
    if (termIdParam === 'all') {
      termMode = terms.length ? 'ALL' : 'NONE';
    } else if (termIdParam) {
      term = terms.find((t) => t.id === termIdParam) ?? null;
      termMode = term ? 'SPECIFIC' : terms.length ? 'ALL' : 'NONE';
    } else {
      term = resolveCurrentTerm(terms);
      termMode = term ? 'SPECIFIC' : terms.length ? 'ALL' : 'NONE';
    }

    const shell = {
      years: years.map((y) => ({ id: y.id, label: y.label, isActive: y.isActive })),
      terms: terms.map((t) => ({ id: t.id, label: t.label, order: t.order })),
      resolvedAcademicYearId: year.id,
      resolvedTermId: term?.id ?? null,
      termMode,
    };

    const enrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId, academicYearId: year.id } },
      include: { class: { select: { id: true, name: true } } },
    });
    if (!enrollment) {
      return NextResponse.json(
        {
          ...shell,
          enrolled: false,
          className: null,
          subjects: [],
          overallAverage: null,
          classOverallAverage: null,
          rank: null,
          rankedCount: 0,
          bestSubject: null,
          worstSubject: null,
          alertSubjects: [],
          ranking: [],
          goals: null,
        },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const classSubjects = await prisma.classSubject.findMany({
      where: { classId: enrollment.classId },
      include: { subject: true },
      orderBy: [{ subject: { domain: 'asc' } }, { subject: { name: 'asc' } }],
    });
    const classSubjectIds = classSubjects.map((cs) => cs.id);

    const evaluations =
      termMode === 'NONE' || classSubjectIds.length === 0
        ? []
        : await prisma.evaluation.findMany({
            where: {
              classSubjectId: { in: classSubjectIds },
              ...(termMode === 'SPECIFIC'
                ? { termId: term!.id }
                : { term: { academicYearId: year.id } }),
            },
            orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
            include: { grades: { select: { studentId: true, score: true, absent: true } } },
          });

    const prevTerm =
      termMode === 'SPECIFIC' ? (terms.find((t) => t.order === term!.order - 1) ?? null) : null;
    const prevEvaluations =
      prevTerm && classSubjectIds.length > 0
        ? await prisma.evaluation.findMany({
            where: { classSubjectId: { in: classSubjectIds }, termId: prevTerm.id },
            include: { grades: { select: { studentId: true, score: true, absent: true } } },
          })
        : [];

    const classmates = await prisma.enrollment.findMany({
      where: { classId: enrollment.classId, academicYearId: year.id },
      include: { student: { select: { id: true, firstName: true, lastName: true } } },
    });

    const evalsByClassSubject = new Map<string, typeof evaluations>();
    for (const ev of evaluations) {
      const list = evalsByClassSubject.get(ev.classSubjectId) ?? [];
      list.push(ev);
      evalsByClassSubject.set(ev.classSubjectId, list);
    }
    const prevEvalsByClassSubject = new Map<string, typeof prevEvaluations>();
    for (const ev of prevEvaluations) {
      const list = prevEvalsByClassSubject.get(ev.classSubjectId) ?? [];
      list.push(ev);
      prevEvalsByClassSubject.set(ev.classSubjectId, list);
    }

    const subjects = classSubjects.map((cs) => {
      const evals = evalsByClassSubject.get(cs.id) ?? [];
      const average = scoreOf(evals, studentId);
      const classmateAverages = classmates
        .map((cm) => scoreOf(evals, cm.studentId))
        .filter((a): a is number => a != null);
      const classAverage =
        classmateAverages.length > 0
          ? Math.round(
              (classmateAverages.reduce((a, b) => a + b, 0) / classmateAverages.length) * 10,
            ) / 10
          : null;
      const prevAverage = scoreOf(prevEvalsByClassSubject.get(cs.id) ?? [], studentId);

      return {
        subjectId: cs.subjectId,
        subjectName: cs.subject.name,
        domain: cs.subject.domain ?? 'Autres matières',
        coefficient: cs.coefficient,
        evaluations: evals.map((e) => ({
          id: e.id,
          label: e.label,
          maxScore: e.maxScore,
          score: e.grades.find((g) => g.studentId === studentId)?.score ?? null,
        })),
        average: average != null ? Math.round(average * 10) / 10 : null,
        classAverage,
        trend: trendBetween(average, prevAverage),
        appreciation: appreciationFor(average),
      };
    });

    const gradedSubjects = subjects.filter((s) => s.average != null);
    const overallAverage = weightedAverage(
      gradedSubjects.map((s) => ({ value: s.average!, weight: s.coefficient })),
    );
    const classGradedSubjects = subjects.filter((s) => s.classAverage != null);
    const classOverallAverage = weightedAverage(
      classGradedSubjects.map((s) => ({ value: s.classAverage!, weight: s.coefficient })),
    );

    const bestSubject = gradedSubjects.length
      ? gradedSubjects.reduce((a, b) => (b.average! > a.average! ? b : a))
      : null;
    const worstSubject = gradedSubjects.length
      ? gradedSubjects.reduce((a, b) => (b.average! < a.average! ? b : a))
      : null;
    const alertSubjects = gradedSubjects
      .filter((s) => s.average! < 8)
      .map((s) => ({ name: s.subjectName, average: s.average! }));

    function overallFor(sid: string): number | null {
      const rows = classSubjects
        .map((cs) => {
          const avg = scoreOf(evalsByClassSubject.get(cs.id) ?? [], sid);
          return avg != null ? { value: avg, weight: cs.coefficient } : null;
        })
        .filter((r): r is { value: number; weight: number | null } => r != null);
      return weightedAverage(rows);
    }

    const rankingRaw = classmates
      .map((cm) => ({
        studentId: cm.studentId,
        name: `${cm.student.firstName} ${cm.student.lastName}`,
        average: overallFor(cm.studentId),
      }))
      .filter((r): r is { studentId: string; name: string; average: number } => r.average != null)
      .sort((a, b) => b.average - a.average);
    const positions = competitionRank(rankingRaw, (r) => r.average);
    const ranking = rankingRaw.map((r, i) => ({
      ...r,
      position: positions[i]!,
      isSelf: r.studentId === studentId,
    }));
    const selfRanking = ranking.find((r) => r.studentId === studentId);

    let goals:
      | {
          id: string;
          subjectId: string | null;
          subjectName: string;
          targetScore: number;
          current: number | null;
        }[]
      | null = null;
    if (termMode === 'SPECIFIC') {
      const goalRows = await prisma.goal.findMany({
        where: { studentId, termId: term!.id },
        include: { subject: { select: { name: true } } },
      });
      goals = goalRows.map((g) => ({
        id: g.id,
        subjectId: g.subjectId,
        subjectName: g.subject?.name ?? 'Moyenne générale',
        targetScore: g.targetScore,
        current: g.subjectId
          ? (subjects.find((s) => s.subjectId === g.subjectId)?.average ?? null)
          : overallAverage,
      }));
    }

    return NextResponse.json(
      {
        ...shell,
        enrolled: true,
        className: enrollment.class.name,
        subjects,
        overallAverage,
        classOverallAverage,
        rank: selfRanking?.position ?? null,
        rankedCount: rankingRaw.length,
        bestSubject: bestSubject
          ? { name: bestSubject.subjectName, average: bestSubject.average }
          : null,
        worstSubject: worstSubject
          ? { name: worstSubject.subjectName, average: worstSubject.average }
          : null,
        alertSubjects,
        ranking,
        goals,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
