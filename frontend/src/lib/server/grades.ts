// Shared grade-computation helpers for Epic 6 (Notes & Résultats now;
// grade-notebook/grade-entry consume the same functions when built next).
// See .planning/banani/epic-6-data-model.md for the formulas' rationale.
import 'server-only';

export function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

// Coefficient-weighted average. A subject with no coefficient set yet
// (Epic 4 "not configured" state) weighs 1, not 0 — it still counts toward
// the average, just unweighted, matching how the Coefficients screen treats
// an unset value as "default", not "excluded".
export function weightedAverage(rows: { value: number; weight: number | null }[]): number | null {
  if (rows.length === 0) return null;
  const totalWeight = rows.reduce((sum, r) => sum + (r.weight ?? 1), 0);
  const sum = rows.reduce((s, r) => s + r.value * (r.weight ?? 1), 0);
  return roundToTenth(sum / totalWeight);
}

interface EvaluationLike {
  coefficient: number;
  maxScore: number;
  status: string;
  countsTowardAverage: boolean;
  grades: { studentId: string; score: number | null; absent: boolean }[];
}

// The single source of truth for "what is this student's average in this
// subject" — used identically by the results/notebook (single-subject) and
// notebook (all-subjects) endpoints so the three never drift apart.
//
// Only PUBLISHED + countsTowardAverage evaluations count. An absent or
// not-yet-graded student is excluded from that evaluation entirely (not
// scored as 0) — Grade.absent is a real state, not a zero.
//
// Every score is rescaled to a common /20 basis via (score / maxScore) *
// 20 before being weighted by the evaluation's own coefficient.
// Evaluation.maxScore is a free per-evaluation field (a quick quiz might
// be graded out of 10 while a DS is out of 20) — averaging raw scores
// across evaluations with different maxScore without rescaling first
// would silently produce a meaningless number, and every other part of
// the app (tone()/appreciationFor() thresholds, "sur 20" labels, Goal
// targets, cross-subject ranking) assumes a genuine 0–20 scale.
export function subjectAverageFor(evaluations: EvaluationLike[], studentId: string): number | null {
  const rows = evaluations
    .filter((e) => e.status === 'PUBLISHED' && e.countsTowardAverage)
    .map((e) => {
      const g = e.grades.find((gr) => gr.studentId === studentId);
      if (!g || g.absent || g.score == null) return null;
      const normalized = e.maxScore > 0 ? (g.score / e.maxScore) * 20 : 0;
      return { value: normalized, weight: e.coefficient };
    })
    .filter((r): r is { value: number; weight: number } => r != null);
  return weightedAverage(rows);
}

// Competition ("1224") ranking: entries tied on value share the same rank,
// and the next distinct value skips ahead by the number of entries tied
// above it — matches how French bulletins show "ex-aequo" instead of
// arbitrarily breaking ties by insertion order. `sortedDesc` must already
// be sorted by value descending; returns one rank per entry, same order.
export function competitionRank<T>(sortedDesc: T[], valueOf: (item: T) => number): number[] {
  let rank = 1;
  return sortedDesc.map((item, i) => {
    if (i > 0 && valueOf(item) !== valueOf(sortedDesc[i - 1]!)) rank = i + 1;
    return rank;
  });
}

export function appreciationFor(average: number | null): string | null {
  if (average == null) return null;
  if (average < 8) return 'Faible';
  if (average < 10) return 'Insuffisant';
  if (average < 11) return 'Passable';
  if (average < 12) return 'Assez bien';
  if (average < 14) return 'Bien';
  return 'Très bien';
}

export interface TrendResult {
  direction: 'up' | 'down' | 'flat' | null;
  delta: number | null;
}

export function trendBetween(current: number | null, previous: number | null): TrendResult {
  if (current == null || previous == null) return { direction: null, delta: null };
  const delta = roundToTenth(current - previous);
  const direction = delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';
  return { direction, delta };
}

interface TermLike {
  id: string;
  order: number;
  startDate: Date;
  endDate: Date;
}

// The term whose date range contains "now"; else the most recently-ended
// past term; else the first term by order. Returns null only when `terms`
// is empty.
export function resolveCurrentTerm<T extends TermLike>(terms: T[]): T | null {
  if (terms.length === 0) return null;
  const now = new Date();
  const active = terms.find((t) => t.startDate <= now && now <= t.endDate);
  if (active) return active;
  const past = terms
    .filter((t) => t.endDate < now)
    .sort((a, b) => b.endDate.getTime() - a.endDate.getTime())[0];
  if (past) return past;
  return [...terms].sort((a, b) => a.order - b.order)[0] ?? null;
}
