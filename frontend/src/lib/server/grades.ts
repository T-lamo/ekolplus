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
