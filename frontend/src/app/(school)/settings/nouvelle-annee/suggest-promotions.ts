// Pure helpers behind Step 2's "Suggérer toutes les promotions". No React,
// no fetch — unit-tested in isolation. A suggestion is a `destClassId`
// pointing at one of the school's CURRENT classes, chosen as the template
// the rollover clones into the new year (see `executeRollover` step 4) —
// exactly what the Step 2 destination picker produces by hand.
// Spec: docs/superpowers/specs/2026-08-17-grade-level-ordering-design.md
import type { ClassForPromotion, ClassMappingEntry } from './types';

export interface GradeLevelOption {
  id: string;
  name: string;
  order: number;
}

/** Same rule as `handleProceed`'s validation and `computeStats`'s class-
 * creation guard: an `isNew` entry only counts once `newClass` is present
 * (legacy drafts — the UI no longer produces `isNew` entries). */
export function hasDestination(entry: ClassMappingEntry | undefined): boolean {
  return Boolean(entry?.destClassId) || Boolean(entry?.isNew && entry?.newClass);
}

/** Step 2 may proceed once every class is DECIDED: either it has a
 * destination, or it is explicitly marked "fin de cursus" (`unenroll`). An
 * empty entry is "no decision yet" and blocks. */
export function isDecided(entry: ClassMappingEntry | undefined): boolean {
  return hasDestination(entry) || entry?.unenroll === true;
}

/** For every class without a destination, propose an existing class at the
 * next level. Successor level = the next one in `order`-sorted sequence
 * (positional, so a gap left by a deleted level doesn't break the chain).
 * Candidate resolution, in order:
 *   1. a class named like the source with the level substring swapped
 *      ("6ème A" → "5ème A", or the bare next-level name when the source
 *      name doesn't contain its level);
 *   2. otherwise, the ONLY class at the next level (unambiguous);
 *   3. otherwise skip (ambiguous, or the school has no class there).
 * A class at the LAST catalog level gets `{ unenroll: true }` ("fin de
 * cursus" — its students leave the school). Level not in catalog → skip. */
export function suggestPromotions(
  classes: ClassForPromotion[],
  gradeLevels: GradeLevelOption[],
  candidates: ClassForPromotion[],
  activeMapping: Record<string, ClassMappingEntry>,
): Array<{ classId: string; entry: ClassMappingEntry }> {
  const sorted = [...gradeLevels].sort((a, b) => a.order - b.order);
  const nextByName = new Map<string, GradeLevelOption>();
  sorted.forEach((level, i) => {
    const next = sorted[i + 1];
    if (next) nextByName.set(level.name, next);
  });

  const suggestions: Array<{ classId: string; entry: ClassMappingEntry }> = [];
  for (const cls of classes) {
    if (isDecided(activeMapping[cls.id])) continue;
    const next = nextByName.get(cls.level);
    if (!next) {
      const isLastLevel = sorted.length > 0 && sorted[sorted.length - 1]?.name === cls.level;
      if (isLastLevel) suggestions.push({ classId: cls.id, entry: { unenroll: true } });
      continue;
    }

    const wantedName = cls.name.includes(cls.level)
      ? cls.name.replace(cls.level, next.name)
      : next.name;
    const atNextLevel = candidates.filter((c) => c.level === next.name);
    const target =
      atNextLevel.find((c) => c.name === wantedName) ??
      (atNextLevel.length === 1 ? atNextLevel[0] : undefined);
    if (!target) continue;

    suggestions.push({ classId: cls.id, entry: { destClassId: target.id } });
  }
  return suggestions;
}
