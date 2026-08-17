// Pure helpers behind Step 2's "Suggérer toutes les promotions". No React,
// no fetch — unit-tested in isolation. The suggestion produces the exact
// `ClassMappingEntry` shape manual "Créer nouvelle" produces, so Step 3 and
// executeRollover consume it unchanged.
// Spec: docs/superpowers/specs/2026-08-17-grade-level-ordering-design.md
import type { ClassForPromotion, ClassMappingEntry } from './types';

export interface GradeLevelOption {
  id: string;
  name: string;
  order: number;
}

/** Same rule as `handleProceed`'s validation and `computeStats`'s class-
 * creation guard: an `isNew` entry only counts once `newClass` is present. */
export function hasDestination(entry: ClassMappingEntry | undefined): boolean {
  return Boolean(entry?.destClassId) || Boolean(entry?.isNew && entry?.newClass);
}

/** For every class without a destination, propose "create new class at the
 * next level". Successor = the next level in `order`-sorted sequence
 * (positional, so a gap left by a deleted level doesn't break the chain).
 * Skips: level not in catalog, last level (implicit end of cursus). */
export function suggestPromotions(
  classes: ClassForPromotion[],
  gradeLevels: GradeLevelOption[],
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
    if (hasDestination(activeMapping[cls.id])) continue;
    const next = nextByName.get(cls.level);
    if (!next) continue;
    const name = cls.name.includes(cls.level) ? cls.name.replace(cls.level, next.name) : next.name;
    suggestions.push({
      classId: cls.id,
      entry: { isNew: true, newClass: { name, level: next.name } },
    });
  }
  return suggestions;
}
