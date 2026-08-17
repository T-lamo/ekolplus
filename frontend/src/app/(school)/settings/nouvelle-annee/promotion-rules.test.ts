import { describe, expect, it } from 'vitest';
import {
  buildLevelRank,
  findDemotions,
  findExceptionDemotions,
  hasDestination,
  isDecided,
  isDemotion,
} from './promotion-rules';
import type { ClassMappingEntry, StudentExceptionEntry } from './types';

const levels = [
  { name: '6ème', order: 0 },
  { name: '5ème', order: 1 },
  { name: '4ème', order: 3 }, // gap on purpose (a level was deleted)
  { name: '3ème', order: 7 },
];
const classes = [
  { id: 'c6', name: '6ème A', level: '6ème' },
  { id: 'c5', name: '5ème A', level: '5ème' },
  { id: 'c4', name: '4ème A', level: '4ème' },
  { id: 'c3', name: '3ème A', level: '3ème' },
  { id: 'cx', name: 'Atelier', level: 'Spécial' }, // level not in catalog
];

describe('hasDestination / isDecided', () => {
  it('destination = destClassId or legacy isNew+newClass', () => {
    expect(hasDestination({ destClassId: 'c5' })).toBe(true);
    expect(hasDestination({ isNew: true, newClass: { name: 'x', level: 'y' } })).toBe(true);
    expect(hasDestination({ isNew: true })).toBe(false);
    expect(hasDestination(undefined)).toBe(false);
  });
  it('decided = destination OR explicit unenroll', () => {
    expect(isDecided({ unenroll: true })).toBe(true);
    expect(isDecided({ destClassId: 'c5' })).toBe(true);
    expect(isDecided({})).toBe(false);
    expect(isDecided({ unenroll: false })).toBe(false);
  });
});

describe('buildLevelRank / isDemotion', () => {
  const rank = buildLevelRank(levels);
  it('ranks positionally by order (gap-tolerant)', () => {
    expect([...rank.entries()]).toEqual([
      ['6ème', 0],
      ['5ème', 1],
      ['4ème', 2],
      ['3ème', 3],
    ]);
  });
  it('lower rank than the source is a demotion; same or higher is not', () => {
    expect(isDemotion('3ème', '5ème', rank)).toBe(true);
    expect(isDemotion('3ème', '4ème', rank)).toBe(true);
    expect(isDemotion('3ème', '3ème', rank)).toBe(false); // repeat year
    expect(isDemotion('5ème', '4ème', rank)).toBe(false); // promotion
    expect(isDemotion('6ème', '3ème', rank)).toBe(false); // skipping levels is allowed
  });
  it('cannot judge when either level is unknown → not a demotion', () => {
    expect(isDemotion('Spécial', '6ème', rank)).toBe(false);
    expect(isDemotion('3ème', 'Spécial', rank)).toBe(false);
    expect(isDemotion('3ème', '5ème', buildLevelRank([]))).toBe(false);
  });
});

describe('findDemotions (class mapping)', () => {
  it('lists every mapping whose destination level is below the source level', () => {
    const mapping: Record<string, ClassMappingEntry> = {
      c3: { destClassId: 'c5' }, // demotion
      c4: { destClassId: 'c3' }, // promotion
      c5: { destClassId: 'c5' }, // repeat
      c6: { unenroll: true }, // no destination
      cx: { destClassId: 'c6' }, // unknown source level → allowed
    };
    expect(findDemotions(mapping, classes, levels)).toEqual([
      {
        classId: 'c3',
        className: '3ème A',
        fromLevel: '3ème',
        destClassId: 'c5',
        destClassName: '5ème A',
        toLevel: '5ème',
      },
    ]);
  });
  it('ignores destClassIds that are not in the class list', () => {
    expect(findDemotions({ c3: { destClassId: 'ghost' } }, classes, levels)).toEqual([]);
  });
  it('empty mapping / empty catalog → nothing', () => {
    expect(findDemotions({}, classes, levels)).toEqual([]);
    expect(findDemotions({ c3: { destClassId: 'c5' } }, classes, [])).toEqual([]);
  });
});

describe('findExceptionDemotions (per-student overrides)', () => {
  const students = [
    { id: 's1', classId: 'c3' },
    { id: 's2', classId: 'c4' },
  ];
  it('flags a student sent to a class below their current level', () => {
    const exceptions: Record<string, StudentExceptionEntry> = {
      s1: { destClassId: 'c5' }, // 3ème → 5ème: demotion
      s2: { destClassId: 'c3' }, // 4ème → 3ème: fine
    };
    expect(findExceptionDemotions(exceptions, students, classes, levels)).toEqual([
      {
        studentId: 's1',
        fromLevel: '3ème',
        destClassId: 'c5',
        destClassName: '5ème A',
        toLevel: '5ème',
      },
    ]);
  });
  it('skip: true and unknown students are ignored', () => {
    expect(
      findExceptionDemotions(
        { s1: { skip: true }, s9: { destClassId: 'c5' } },
        students,
        classes,
        levels,
      ),
    ).toEqual([]);
  });
});
