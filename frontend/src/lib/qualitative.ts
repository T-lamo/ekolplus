// Qualitative subjects: the pure, client-safe half (no server-only, no
// Prisma), shared by the subject form and by lib/server/qualitative.ts.
// Spec: docs/superpowers/specs/2026-09-05-bulletin-prescolaire-et-pages-design.md §4.
export const EVALUATION_MODES = ['NUMERIC', 'QUALITATIVE'] as const;
export type EvaluationMode = (typeof EVALUATION_MODES)[number];

export const RATING_SCALE_MIN = 2;
export const RATING_SCALE_MAX = 6;
export const RATING_LABEL_MAX = 30;
export const CRITERION_LABEL_MAX = 80;

export type RatingScaleError =
  | 'TOO_FEW'
  | 'TOO_MANY'
  | 'EMPTY_LABEL'
  | 'LABEL_TOO_LONG'
  | 'DUPLICATE_LABEL';

export type NormalizedRatingScale =
  | { ok: true; scale: string[] }
  | { ok: false; error: RatingScaleError };

/**
 * Trims every label and checks the §4 rules: 2 to 6 labels, none empty,
 * none longer than RATING_LABEL_MAX, all distinct after trim. The first
 * broken rule wins.
 */
export function normalizeRatingScale(labels: readonly string[]): NormalizedRatingScale {
  const scale = labels.map((label) => label.trim());
  if (scale.length < RATING_SCALE_MIN) return { ok: false, error: 'TOO_FEW' };
  if (scale.length > RATING_SCALE_MAX) return { ok: false, error: 'TOO_MANY' };
  if (scale.some((label) => label.length === 0)) return { ok: false, error: 'EMPTY_LABEL' };
  if (scale.some((label) => label.length > RATING_LABEL_MAX)) {
    return { ok: false, error: 'LABEL_TOO_LONG' };
  }
  if (new Set(scale).size !== scale.length) return { ok: false, error: 'DUPLICATE_LABEL' };
  return { ok: true, scale };
}
