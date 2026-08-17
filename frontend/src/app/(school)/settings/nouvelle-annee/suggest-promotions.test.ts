import { describe, expect, it } from 'vitest';
import { hasDestination, suggestPromotions, type GradeLevelOption } from './suggest-promotions';
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

describe('hasDestination', () => {
  it('true for an existing destClassId', () => {
    expect(hasDestination({ destClassId: 'c9' })).toBe(true);
  });
  it('true for isNew + newClass', () => {
    expect(hasDestination({ isNew: true, newClass: { name: '5ème A', level: '5ème' } })).toBe(true);
  });
  it('false for undefined, empty, or malformed isNew without newClass', () => {
    expect(hasDestination(undefined)).toBe(false);
    expect(hasDestination({})).toBe(false);
    expect(hasDestination({ isNew: true })).toBe(false);
  });
});

describe('suggestPromotions', () => {
  it('replaces the level substring inside the class name ("3ème A" → "2nde A")', () => {
    const out = suggestPromotions([cls('c1', '3ème A', '3ème')], levels, {});
    expect(out).toEqual([
      { classId: 'c1', entry: { isNew: true, newClass: { name: '2nde A', level: '2nde' } } },
    ]);
  });

  it('falls back to the bare next-level name when the class name does not contain the level', () => {
    const out = suggestPromotions([cls('c1', '3A', '3ème')], levels, {});
    expect(out[0]?.entry.newClass).toEqual({ name: '2nde', level: '2nde' });
  });

  it('skips the last level of the sequence (implicit end of cursus)', () => {
    expect(suggestPromotions([cls('c1', 'Terminale S', 'Terminale')], levels, {})).toEqual([]);
  });

  it('skips a class whose level is not in the catalog', () => {
    expect(suggestPromotions([cls('c1', 'CP A', 'CP')], levels, {})).toEqual([]);
  });

  it('returns nothing when the catalog is empty', () => {
    expect(suggestPromotions([cls('c1', '6ème A', '6ème')], [], {})).toEqual([]);
  });

  it('leaves already-mapped classes untouched (manual mapping wins), but fills malformed ones', () => {
    const mapping: Record<string, ClassMappingEntry> = {
      c1: { destClassId: 'existing' },
      c2: { isNew: true, newClass: { name: 'Custom', level: '5ème' } },
      c3: { isNew: true }, // malformed — counts as unmapped
    };
    const out = suggestPromotions(
      [cls('c1', '6ème A', '6ème'), cls('c2', '6ème B', '6ème'), cls('c3', '6ème C', '6ème')],
      levels,
      mapping,
    );
    expect(out.map((s) => s.classId)).toEqual(['c3']);
    expect(out[0]?.entry.newClass).toEqual({ name: '5ème C', level: '5ème' });
  });

  it('two sections of the same level are each suggested independently', () => {
    const out = suggestPromotions(
      [cls('a', '6ème A', '6ème'), cls('b', '6ème B', '6ème')],
      levels,
      {},
    );
    expect(out.map((s) => s.entry.newClass?.name)).toEqual(['5ème A', '5ème B']);
  });

  it('follows the sorted sequence even when orders have gaps (after a delete)', () => {
    const gappy: GradeLevelOption[] = [
      { id: 'x', name: 'CE1', order: 0 },
      { id: 'y', name: 'CE2', order: 2 },
      { id: 'z', name: 'CM1', order: 5 },
    ];
    const out = suggestPromotions(
      [cls('c1', 'CE1 A', 'CE1'), cls('c2', 'CE2 A', 'CE2')],
      gappy,
      {},
    );
    expect(out.map((s) => s.entry.newClass?.name)).toEqual(['CE2 A', 'CM1 A']);
  });

  it('is order-agnostic about the input array (sorts by `order` itself)', () => {
    const shuffled = [...levels].reverse();
    const out = suggestPromotions([cls('c1', '6ème A', '6ème')], shuffled, {});
    expect(out[0]?.entry.newClass?.level).toBe('5ème');
  });
});
