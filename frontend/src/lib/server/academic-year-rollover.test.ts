// Tests for the academic-year-rollover pure helper `computeStats`.
//
// Critical invariant under test — precedence order:
//   exception.skip > exception.destClassId > class mapping > unenrolled fallback
//
// `getPromotionData` and `executeRollover` talk to Prisma directly (reads /
// writes inside a caller-supplied transaction) and are exercised indirectly
// once the route handlers (Tasks 4-5) land route-level tests — no lightweight
// lib-level Prisma-mocking convention exists yet in this repo outside of
// route tests (see src/test-utils/prisma-mock.ts), so they are left
// untested-by-design here per the task brief.
import { describe, it, expect } from 'vitest';
import { computeStats } from './academic-year-rollover';
import type {
  ClassMappingEntry,
  StudentExceptionEntry,
  StudentForPromotion,
} from '@/app/(school)/settings/nouvelle-annee/types';

function student(id: string, classId: string): StudentForPromotion {
  return {
    id,
    firstName: 'Prenom',
    lastName: 'Nom',
    classId,
    enrolledAt: new Date('2025-09-01'),
  };
}

describe('computeStats', () => {
  it('student with no exception + class mapped to an existing destClassId => promoted', () => {
    const classMapping: Record<string, ClassMappingEntry> = {
      'class-old-1': { destClassId: 'class-new-1' },
    };
    const studentExceptions: Record<string, StudentExceptionEntry> = {};
    const students = [student('s1', 'class-old-1')];

    expect(computeStats(classMapping, studentExceptions, students)).toEqual({
      promoted: 1,
      exceptions: 0,
      unenrolled: 0,
    });
  });

  it('student with no exception + class mapped to a newly-created class => promoted', () => {
    const classMapping: Record<string, ClassMappingEntry> = {
      'class-old-1': {
        isNew: true,
        newClass: { name: '4ème A', level: '4ème' },
      },
    };
    const students = [student('s1', 'class-old-1')];

    expect(computeStats(classMapping, {}, students)).toEqual({
      promoted: 1,
      exceptions: 0,
      unenrolled: 0,
    });
  });

  it('class mapping with isNew: true but no newClass => unenrolled (matches executeRollover, which cannot create the class)', () => {
    const classMapping: Record<string, ClassMappingEntry> = {
      'class-old-1': { isNew: true }, // malformed/incomplete: isNew without newClass
    };
    const students = [student('s1', 'class-old-1')];

    expect(computeStats(classMapping, {}, students)).toEqual({
      promoted: 0,
      exceptions: 0,
      unenrolled: 1,
    });
  });

  it('student exception with destClassId overrides the class mapping => exceptions', () => {
    const classMapping: Record<string, ClassMappingEntry> = {
      'class-old-1': { destClassId: 'class-new-1' },
    };
    const studentExceptions: Record<string, StudentExceptionEntry> = {
      s1: { destClassId: 'class-new-2' },
    };
    const students = [student('s1', 'class-old-1')];

    expect(computeStats(classMapping, studentExceptions, students)).toEqual({
      promoted: 0,
      exceptions: 1,
      unenrolled: 0,
    });
  });

  it('student exception with skip: true => unenrolled, regardless of a valid class mapping', () => {
    const classMapping: Record<string, ClassMappingEntry> = {
      'class-old-1': { destClassId: 'class-new-1' },
    };
    const studentExceptions: Record<string, StudentExceptionEntry> = {
      s1: { skip: true },
    };
    const students = [student('s1', 'class-old-1')];

    expect(computeStats(classMapping, studentExceptions, students)).toEqual({
      promoted: 0,
      exceptions: 0,
      unenrolled: 1,
    });
  });

  it('skip: true takes precedence even if the same exception also has a destClassId', () => {
    const studentExceptions: Record<string, StudentExceptionEntry> = {
      s1: { skip: true, destClassId: 'class-new-2' },
    };
    const students = [student('s1', 'class-old-1')];

    expect(computeStats({}, studentExceptions, students)).toEqual({
      promoted: 0,
      exceptions: 0,
      unenrolled: 1,
    });
  });

  it("student's class has no mapping entry at all => unenrolled", () => {
    const classMapping: Record<string, ClassMappingEntry> = {};
    const students = [student('s1', 'class-old-1')];

    expect(computeStats(classMapping, {}, students)).toEqual({
      promoted: 0,
      exceptions: 0,
      unenrolled: 1,
    });
  });

  it('mixed cohort tallies each outcome independently', () => {
    const classMapping: Record<string, ClassMappingEntry> = {
      'class-old-1': { destClassId: 'class-new-1' },
      'class-old-2': {}, // present but incomplete => treated as no mapping
    };
    const studentExceptions: Record<string, StudentExceptionEntry> = {
      s2: { destClassId: 'class-new-3' },
      s3: { skip: true },
    };
    const students = [
      student('s1', 'class-old-1'), // promoted via class mapping
      student('s2', 'class-old-1'), // exception destClassId wins
      student('s3', 'class-old-1'), // exception skip wins
      student('s4', 'class-old-2'), // incomplete mapping => unenrolled
      student('s5', 'class-unmapped'), // no mapping entry at all => unenrolled
    ];

    expect(computeStats(classMapping, studentExceptions, students)).toEqual({
      promoted: 1,
      exceptions: 1,
      unenrolled: 3,
    });
  });

  it('empty student list yields all-zero stats', () => {
    expect(computeStats({}, {}, [])).toEqual({ promoted: 0, exceptions: 0, unenrolled: 0 });
  });
});
