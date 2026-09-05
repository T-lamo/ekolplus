// The Notes & Résultats read model for ONE student — extracted verbatim
// from GET /api/school/students/[id]/results so the Espace Élève can serve
// the same numbers to the student (GET /api/student/results) without a
// second copy of the formulas. Per-subject breakdown (dynamic evaluation
// columns, subject average, class average, trend vs. previous term, auto
// appreciation), overall weighted average, class ranking, best/worst
// subject, pedagogical alert subjects, and (for a specific term) the
// student's goals. See .planning/banani/epic-6-data-model.md for every
// formula.
//
// `termId`: null = the "current" term by date; "all" = whole-year
// aggregate; an id = that term. The resolved ids are echoed back so the
// caller's filter dropdowns can sync without a second round trip.
//
// `audience: 'student'` applies the portal rules: only PUBLISHED
// evaluations are listed (drafts never reach a student, not even as an
// empty column) and `ranking` is emptied — the student keeps their own
// rank and the class average, never a classmate's name or score.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import {
  appreciationFor,
  competitionRank,
  resolveCurrentTerm,
  subjectAverageFor as scoreOf,
  trendBetween,
  weightedAverage,
} from '@/lib/server/grades';
import { NUMERIC_SUBJECT_FILTER } from '@/lib/server/qualitative';
import type { ViewAudience } from './audience';

export interface StudentResultsInput {
  schoolId: string;
  studentId: string;
  academicYearId: string | null;
  termId: string | null;
  audience: ViewAudience;
}

export interface SubjectResultView {
  subjectId: string;
  subjectName: string;
  domain: string;
  coefficient: number | null;
  evaluations: { id: string; label: string; maxScore: number; score: number | null }[];
  average: number | null;
  classAverage: number | null;
  trend: { direction: 'up' | 'down' | 'flat' | null; delta: number | null };
  appreciation: string | null;
}

export interface RankingRowView {
  studentId: string;
  name: string;
  average: number;
  position: number;
  isSelf: boolean;
}

export interface GoalRowView {
  id: string;
  subjectId: string | null;
  subjectName: string;
  targetScore: number;
  current: number | null;
}

export interface StudentResultsView {
  years: { id: string; label: string; isActive: boolean }[];
  terms: { id: string; label: string; order: number }[];
  resolvedAcademicYearId: string | null;
  resolvedTermId: string | null;
  termMode: 'SPECIFIC' | 'ALL' | 'NONE';
  enrolled: boolean;
  className: string | null;
  subjects: SubjectResultView[];
  overallAverage: number | null;
  classOverallAverage: number | null;
  rank: number | null;
  rankedCount: number;
  bestSubject: { name: string; average: number } | null;
  worstSubject: { name: string; average: number } | null;
  alertSubjects: { name: string; average: number }[];
  ranking: RankingRowView[];
  goals: GoalRowView[] | null;
}

const EMPTY_BODY = {
  enrolled: false as const,
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
};

export async function getStudentResults(input: StudentResultsInput): Promise<StudentResultsView> {
  const { schoolId, studentId, audience } = input;
  // subjectAverageFor already ignores drafts in every average; the explicit
  // filter is what keeps draft evaluations out of the student's column list.
  const publishedOnly = audience === 'student' ? { status: 'PUBLISHED' as const } : {};

  const years = await prisma.academicYear.findMany({
    where: { schoolId },
    orderBy: { startDate: 'desc' },
  });
  const year =
    years.find((y) => y.id === input.academicYearId) ?? years.find((y) => y.isActive) ?? years[0];

  if (!year) {
    return {
      years: [],
      terms: [],
      resolvedAcademicYearId: null,
      resolvedTermId: null,
      termMode: 'NONE',
      ...EMPTY_BODY,
    };
  }

  const terms = await prisma.term.findMany({
    where: { academicYearId: year.id },
    orderBy: { order: 'asc' },
  });

  let term: (typeof terms)[number] | null = null;
  let termMode: 'SPECIFIC' | 'ALL' | 'NONE';
  if (input.termId === 'all') {
    termMode = terms.length ? 'ALL' : 'NONE';
  } else if (input.termId) {
    term = terms.find((t) => t.id === input.termId) ?? null;
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
    return { ...shell, ...EMPTY_BODY };
  }

  const classSubjects = await prisma.classSubject.findMany({
    where: { classId: enrollment.classId, ...NUMERIC_SUBJECT_FILTER },
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
            ...publishedOnly,
          },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          include: { grades: { select: { studentId: true, score: true, absent: true } } },
        });

  const prevTerm =
    termMode === 'SPECIFIC' ? (terms.find((t) => t.order === term!.order - 1) ?? null) : null;
  const prevEvaluations =
    prevTerm && classSubjectIds.length > 0
      ? await prisma.evaluation.findMany({
          where: { classSubjectId: { in: classSubjectIds }, termId: prevTerm.id, ...publishedOnly },
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

  const subjects: SubjectResultView[] = classSubjects.map((cs) => {
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
  const ranking: RankingRowView[] = rankingRaw.map((r, i) => ({
    ...r,
    position: positions[i]!,
    isSelf: r.studentId === studentId,
  }));
  const selfRanking = ranking.find((r) => r.studentId === studentId);

  let goals: GoalRowView[] | null = null;
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

  return {
    ...shell,
    enrolled: true,
    className: enrollment.class.name,
    subjects,
    overallAverage,
    classOverallAverage,
    rank: selfRanking?.position ?? null,
    rankedCount: rankingRaw.length,
    bestSubject: bestSubject
      ? { name: bestSubject.subjectName, average: bestSubject.average! }
      : null,
    worstSubject: worstSubject
      ? { name: worstSubject.subjectName, average: worstSubject.average! }
      : null,
    alertSubjects,
    // Rule 3 of the spec: a student never sees a classmate's name or score.
    ranking: audience === 'student' ? [] : ranking,
    goals,
  };
}
