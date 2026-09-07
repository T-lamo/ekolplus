// Qualitative subjects, server half: profile resolution for the subject
// routes, the §4 transition guards (409 codes) and the filter every numeric
// consumer spreads into its ClassSubject query (§6).
// Spec: docs/superpowers/specs/2026-09-05-bulletin-prescolaire-et-pages-design.md.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import {
  type EvaluationMode,
  type RatingScaleError,
  normalizeRatingScale,
} from '@/lib/qualitative';

/**
 * Spread into `prisma.classSubject.findMany({ where: { classId, ...NUMERIC_SUBJECT_FILTER } })`
 * by every consumer that computes or displays numeric grades. A QUALITATIVE
 * subject never has evaluations, so it must neither show up as an empty
 * row nor be offered for a new evaluation.
 */
export const NUMERIC_SUBJECT_FILTER = { subject: { evaluationMode: 'NUMERIC' } } as const;

const SCALE_ERROR_MESSAGE: Record<RatingScaleError, string> = {
  TOO_FEW: 'ratingScale needs at least 2 labels',
  TOO_MANY: 'ratingScale allows at most 6 labels',
  EMPTY_LABEL: 'ratingScale labels must not be empty',
  LABEL_TOO_LONG: 'ratingScale labels must be 30 characters or fewer',
  DUPLICATE_LABEL: 'ratingScale labels must be distinct',
};

export interface QualitativeProfile {
  evaluationMode: EvaluationMode;
  ratingScale: string[];
}

/**
 * Resolves the pair the subject routes write: NUMERIC always stores an empty
 * scale; QUALITATIVE requires a valid scale (trimmed, 2 to 6 distinct labels).
 */
export function resolveQualitativeProfile(
  next: QualitativeProfile,
): { ok: true; profile: QualitativeProfile } | { ok: false; message: string } {
  if (next.evaluationMode === 'NUMERIC') {
    return { ok: true, profile: { evaluationMode: 'NUMERIC', ratingScale: [] } };
  }
  const normalized = normalizeRatingScale(next.ratingScale);
  if (!normalized.ok) return { ok: false, message: SCALE_ERROR_MESSAGE[normalized.error] };
  return { ok: true, profile: { evaluationMode: 'QUALITATIVE', ratingScale: normalized.scale } };
}

export type QualitativeConflict =
  | 'SUBJECT_HAS_EVALUATIONS'
  | 'SUBJECT_HAS_RATINGS'
  | 'SCALE_LEVEL_IN_USE';

export const QUALITATIVE_CONFLICT_MESSAGES: Record<QualitativeConflict, string> = {
  SUBJECT_HAS_EVALUATIONS:
    'Cette matière a déjà des évaluations notées. Supprimez-les avant de passer en mode critères.',
  SUBJECT_HAS_RATINGS:
    'Cette matière a déjà des critères cochés. Effacez-les avant de repasser en mode notes.',
  SCALE_LEVEL_IN_USE: "Un niveau de l'échelle que vous retirez est déjà utilisé par une coche.",
};

/**
 * Same labels, any order — a true reorder, not a rename. Joined on a
 * control character rather than a space: rating labels are free-form
 * multi-word French text (e.g. «Très bien»), and a space-joined
 * fingerprint could collide two different multisets that happen to
 * reflow across word boundaries the same way.
 */
function sameLabelSet(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join('\x00') === [...b].sort().join('\x00');
}

/**
 * §4 transition rules, checked by PATCH before writing:
 * - NUMERIC to QUALITATIVE is refused while any evaluation exists on one of
 *   the subject's class-subjects;
 * - QUALITATIVE to NUMERIC is refused while any rating exists;
 * - shrinking the scale is refused while a rating uses a removed level
 *   (ratings store the index, so "removed" means index >= new length);
 * - reordering the scale at the same length is refused while any rating
 *   exists, because a rating stores the index: moving a label would
 *   silently change what every existing tick means.
 * Renaming levels in place and growing the scale are always allowed and
 * never query.
 */
export async function findQualitativeConflict(
  subjectId: string,
  current: { evaluationMode: string; ratingScale: string[] },
  next: QualitativeProfile,
): Promise<QualitativeConflict | null> {
  if (current.evaluationMode === 'NUMERIC' && next.evaluationMode === 'QUALITATIVE') {
    const evaluations = await prisma.evaluation.count({
      where: { classSubject: { subjectId } },
    });
    return evaluations > 0 ? 'SUBJECT_HAS_EVALUATIONS' : null;
  }
  if (current.evaluationMode === 'QUALITATIVE' && next.evaluationMode === 'NUMERIC') {
    const ratings = await prisma.criteriaRating.count({ where: { criterion: { subjectId } } });
    return ratings > 0 ? 'SUBJECT_HAS_RATINGS' : null;
  }
  if (
    current.evaluationMode === 'QUALITATIVE' &&
    next.ratingScale.length < current.ratingScale.length
  ) {
    const inUse = await prisma.criteriaRating.count({
      where: { criterion: { subjectId }, level: { gte: next.ratingScale.length } },
    });
    return inUse > 0 ? 'SCALE_LEVEL_IN_USE' : null;
  }
  if (
    current.evaluationMode === 'QUALITATIVE' &&
    next.evaluationMode === 'QUALITATIVE' &&
    next.ratingScale.length === current.ratingScale.length &&
    next.ratingScale.some((label, i) => label !== current.ratingScale[i]) &&
    sameLabelSet(next.ratingScale, current.ratingScale)
  ) {
    const inUse = await prisma.criteriaRating.count({ where: { criterion: { subjectId } } });
    return inUse > 0 ? 'SCALE_LEVEL_IN_USE' : null;
  }
  return null;
}
