import { describe, expect, it } from 'vitest';
import {
  hasDestination,
  isDecided,
  suggestPromotions,
  type GradeLevelOption,
} from './suggest-promotions';
import type { ClassForPromotion, ClassMappingEntry } from './types';

const levels: GradeLevelOption[] = [
  { id: 'l1', name: '6ème', order: 0 },
  { id: 'l2', name: '5ème', order: 1 },
  { id: 'l3', name: '3ème', order: 2 },
  { id: 'l4', name: '2nde', order: 3 },
  { id: 'l5', name: 'Terminale', order: 4 },
];

const cls = (id: string, name: string, level: string): ClassForPromotion => ({
  id,
  name,
  level,
  studentCount: 10,
});

// A typical school: two sections per level, one at 2nde, one Terminale.
const school = [
  cls('c6a', '6ème A', '6ème'),
  cls('c6b', '6ème B', '6ème'),
  cls('c5a', '5ème A', '5ème'),
  cls('c5b', '5ème B', '5ème'),
  cls('c3a', '3ème A', '3ème'),
  cls('c2', '2nde', '2nde'),
  cls('cT', 'Terminale S', 'Terminale'),
];

describe('hasDestination', () => {
  it('true for an existing destClassId', () => {
    expect(hasDestination({ destClassId: 'c9' })).toBe(true);
  });
  it('true for isNew + newClass (legacy drafts)', () => {
    expect(hasDestination({ isNew: true, newClass: { name: '5ème A', level: '5ème' } })).toBe(true);
  });
  it('false for undefined, empty, or malformed isNew without newClass', () => {
    expect(hasDestination(undefined)).toBe(false);
    expect(hasDestination({})).toBe(false);
    expect(hasDestination({ isNew: true })).toBe(false);
  });
});

describe('isDecided', () => {
  it('true for a destination OR an explicit unenroll', () => {
    expect(isDecided({ destClassId: 'c9' })).toBe(true);
    expect(isDecided({ unenroll: true })).toBe(true);
  });
  it('false for undefined / empty / unenroll:false', () => {
    expect(isDecided(undefined)).toBe(false);
    expect(isDecided({})).toBe(false);
    expect(isDecided({ unenroll: false })).toBe(false);
  });
});

describe('suggestPromotions', () => {
  it('picks the existing class whose name is the level-substituted name ("6ème A" → "5ème A")', () => {
    const out = suggestPromotions([school[0]!], levels, school, {});
    expect(out).toEqual([{ classId: 'c6a', entry: { destClassId: 'c5a' } }]);
  });

  it('each section resolves independently ("6ème B" → "5ème B")', () => {
    const out = suggestPromotions([school[0]!, school[1]!], levels, school, {});
    expect(out.map((s) => s.entry.destClassId)).toEqual(['c5a', 'c5b']);
  });

  it('falls back to the ONLY class at the next level when no name match exists ("3ème A" → "2nde")', () => {
    const out = suggestPromotions([school[4]!], levels, school, {});
    expect(out).toEqual([{ classId: 'c3a', entry: { destClassId: 'c2' } }]);
  });

  it('skips when no name match and several classes sit at the next level (ambiguous)', () => {
    // "5ème C" has no "3ème C"; there are… only one 3ème here, so make two.
    const withTwo3 = [...school, cls('c3b', '3ème B', '3ème')];
    const out = suggestPromotions([cls('c5c', '5ème C', '5ème')], levels, withTwo3, {});
    expect(out).toEqual([]);
  });

  it('marks a class at the LAST catalog level as "fin de cursus" (unenroll: true)', () => {
    expect(suggestPromotions([school[6]!], levels, school, {})).toEqual([
      { classId: 'cT', entry: { unenroll: true } },
    ]);
  });

  it('skips a class whose level is not in the catalog', () => {
    expect(suggestPromotions([cls('cp', 'CP A', 'CP')], levels, school, {})).toEqual([]);
  });

  it('skips when the next level exists in the catalog but the school has no class at it', () => {
    const noSecondes = school.filter((c) => c.level !== '2nde');
    expect(suggestPromotions([school[4]!], levels, noSecondes, {})).toEqual([]);
  });

  it('returns nothing when the catalog is empty', () => {
    expect(suggestPromotions([school[0]!], [], school, {})).toEqual([]);
  });

  it('leaves already-mapped classes untouched (manual mapping wins), but fills malformed ones', () => {
    const mapping: Record<string, ClassMappingEntry> = {
      c6a: { destClassId: 'c5b' }, // manual choice, must not be overwritten
      c6b: { isNew: true }, // malformed legacy entry — counts as unmapped
      cT: { unenroll: true }, // already decided — left alone
    };
    const out = suggestPromotions([school[0]!, school[1]!, school[6]!], levels, school, mapping);
    expect(out).toEqual([{ classId: 'c6b', entry: { destClassId: 'c5b' } }]);
  });

  it('follows the sorted sequence even when orders have gaps (after a delete)', () => {
    const gappy: GradeLevelOption[] = [
      { id: 'x', name: 'CE1', order: 0 },
      { id: 'y', name: 'CE2', order: 2 },
      { id: 'z', name: 'CM1', order: 5 },
    ];
    const primary = [cls('a', 'CE1 A', 'CE1'), cls('b', 'CE2 A', 'CE2'), cls('c', 'CM1 A', 'CM1')];
    const out = suggestPromotions([primary[0]!, primary[1]!], gappy, primary, {});
    expect(out.map((s) => s.entry.destClassId)).toEqual(['b', 'c']);
  });

  it('is order-agnostic about the catalog array (sorts by `order` itself)', () => {
    const out = suggestPromotions([school[0]!], [...levels].reverse(), school, {});
    expect(out[0]?.entry.destClassId).toBe('c5a');
  });
});
