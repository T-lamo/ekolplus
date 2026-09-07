// Annual carnet computation (spec 2026-09-06 §2 and §3.2). Pure: no Prisma,
// so the calculation rules are unit-tested without a database. The per-
// subject average on 20 comes from grades.ts's subjectAverageFor (published
// + counted evaluations only, absent/ungraded excluded), then is brought to
// the subject's Sur = maxScore × coefficient. Totals run over EVERY numeric
// subject of the class, so Sur is the same for every student and an ungraded
// subject contributes 0 points (the school's rule, validated 2026-09-06).
import 'server-only';
import { competitionRank, roundToTenth, subjectAverageFor } from '@/lib/server/grades';
import type { YearData, YearTermData } from '@/components/bulletin/render-data';

export interface YearEvaluation {
  termId: string;
  classSubjectId: string;
  coefficient: number;
  maxScore: number;
  status: string;
  countsTowardAverage: boolean;
  grades: { studentId: string; score: number | null; absent: boolean }[];
}

export interface BuildYearDataInput {
  terms: { id: string; label: string; order: number }[];
  classSubjects: {
    id: string;
    subjectName: string;
    domain: string | null;
    maxScore: number;
    coefficient: number | null;
  }[];
  evaluations: YearEvaluation[];
  studentId: string;
  classmateIds: string[];
}

interface StudentTermPoints {
  points: (number | null)[];
  total: number | null;
  average10: number | null;
}

export function buildYearData(input: BuildYearDataInput): YearData {
  const { classSubjects, studentId, classmateIds } = input;
  const maxPoints = classSubjects.map((cs) => cs.maxScore * (cs.coefficient ?? 1));
  const totalMax = maxPoints.reduce((sum, m) => sum + m, 0);
  const coefficientSum = classSubjects.reduce((sum, cs) => sum + (cs.coefficient ?? 1), 0);

  const byTerm = new Map<string, Map<string, YearEvaluation[]>>();
  for (const ev of input.evaluations) {
    const bySubject = byTerm.get(ev.termId) ?? new Map<string, YearEvaluation[]>();
    const list = bySubject.get(ev.classSubjectId) ?? [];
    list.push(ev);
    bySubject.set(ev.classSubjectId, list);
    byTerm.set(ev.termId, bySubject);
  }

  const pointsFor = (bySubject: Map<string, YearEvaluation[]>, sid: string): StudentTermPoints => {
    let any = false;
    let total = 0;
    const points = classSubjects.map((cs, i) => {
      const avg = subjectAverageFor(bySubject.get(cs.id) ?? [], sid);
      if (avg == null) return null;
      any = true;
      const p = roundToTenth((avg / 20) * maxPoints[i]!);
      total += p;
      return p;
    });
    if (!any || totalMax === 0) return { points, total: null, average10: null };
    return {
      points,
      total: roundToTenth(total),
      average10: roundToTenth((total / totalMax) * 10),
    };
  };

  const terms: YearTermData[] = [...input.terms]
    .sort((a, b) => a.order - b.order)
    .map((term) => {
      const bySubject = byTerm.get(term.id) ?? new Map<string, YearEvaluation[]>();
      const pointsByStudent = new Map(classmateIds.map((id) => [id, pointsFor(bySubject, id)]));
      // The ledger invariant guarantees studentId is always in classmateIds;
      // this fallback only guards against that invariant ever breaking.
      const own = pointsByStudent.get(studentId) ?? pointsFor(bySubject, studentId);
      // Ranked on the rounded average10 on purpose: two students printing the
      // same Moyenne must share the same Place.
      const ranked = classmateIds
        .map((id) => ({ studentId: id, average10: pointsByStudent.get(id)!.average10 }))
        .filter((r): r is { studentId: string; average10: number } => r.average10 != null)
        .sort((a, b) => b.average10 - a.average10);
      const ranks = competitionRank(ranked, (r) => r.average10);
      const rankEntry = ranked.findIndex((r) => r.studentId === studentId);
      return {
        termId: term.id,
        label: term.label,
        order: term.order,
        hasGrades: ranked.length > 0,
        subjects: classSubjects.map((cs, i) => ({
          subjectName: cs.subjectName,
          domain: cs.domain,
          points: own.points[i] ?? null,
          maxPoints: maxPoints[i]!,
        })),
        totalPoints: own.total,
        totalMax,
        average10: own.average10,
        rank: rankEntry >= 0 ? ranks[rankEntry]! : null,
        rankedCount: ranked.length,
        coefficientSum,
      };
    });

  const graded = terms.filter((t) => t.average10 != null);
  return {
    terms,
    generalAverage: graded.length
      ? roundToTenth(graded.reduce((sum, t) => sum + (t.average10 ?? 0), 0))
      : null,
    // Over the periods where THIS student has an average, the same predicate as the coefficient cell of each Décisions row.
    generalCoefficient: graded.reduce((sum, t) => sum + t.coefficientSum, 0),
  };
}
