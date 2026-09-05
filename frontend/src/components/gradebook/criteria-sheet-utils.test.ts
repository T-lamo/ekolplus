import { describe, it, expect } from 'vitest';
import { flattenOverrides, mergeSheetRatings, ratedCount } from './criteria-sheet-utils';

describe('criteria-sheet-utils', () => {
  it('unsaved ticks win over stored ones and null clears a tick', () => {
    const merged = mergeSheetRatings(
      [
        { studentId: 's1', ratings: { c1: 0, c2: 2 } },
        { studentId: 's2', ratings: {} },
      ],
      { s1: { c2: null, c3: 1 } },
    );
    expect(merged.get('s1')).toEqual({ c1: 0, c2: null, c3: 1 });
    expect(ratedCount(merged.get('s1'))).toBe(2);
    expect(ratedCount(merged.get('s2'))).toBe(0);
    expect(ratedCount(undefined)).toBe(0);
  });

  it('flattens the unsaved ticks into the PUT body shape', () => {
    expect(flattenOverrides({ s1: { c1: 1, c2: null } })).toEqual([
      { studentId: 's1', criterionId: 'c1', level: 1 },
      { studentId: 's1', criterionId: 'c2', level: null },
    ]);
  });
});
