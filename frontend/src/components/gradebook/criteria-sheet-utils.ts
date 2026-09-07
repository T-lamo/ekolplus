// Pure state helpers of CriteriaSheetEditor: the stored sheet plus the
// unsaved ticks (`overrides`, student → criterion → level | null).
export type RatingOverrides = Record<string, Record<string, number | null>>;
export type MergedRatings = Map<string, Record<string, number | null>>;

export function mergeSheetRatings(
  students: { studentId: string; ratings: Record<string, number> }[],
  overrides: RatingOverrides,
): MergedRatings {
  const map: MergedRatings = new Map();
  for (const s of students) {
    map.set(s.studentId, { ...s.ratings, ...(overrides[s.studentId] ?? {}) });
  }
  return map;
}

export function ratedCount(ratings: Record<string, number | null> | undefined): number {
  return Object.values(ratings ?? {}).filter((level) => level !== null).length;
}

export function flattenOverrides(
  overrides: RatingOverrides,
): { studentId: string; criterionId: string; level: number | null }[] {
  return Object.entries(overrides).flatMap(([studentId, byCriterion]) =>
    Object.entries(byCriterion).map(([criterionId, level]) => ({
      studentId,
      criterionId,
      level: level ?? null,
    })),
  );
}
