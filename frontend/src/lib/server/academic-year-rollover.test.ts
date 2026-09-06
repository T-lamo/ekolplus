// Tests for the academic-year-rollover pure helper `computeStats`, plus
// `executeRollover` (the transactional commit itself).
//
// Critical invariant under test for computeStats — precedence order:
//   exception.skip > exception.destClassId > class mapping > unenrolled fallback
//
// `executeRollover` takes a `Prisma.TransactionClient` as its first param —
// following the `mockDeep<PrismaClient>()` convention used elsewhere for
// transaction-taking functions (see src/lib/server/outbox/dispatcher.test.ts,
// which mocks the same way and passes the deep-mocked client straight into
// the function under test).
import { describe, it, expect, beforeEach } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { computeStats, executeRollover } from './academic-year-rollover';
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

// Fix 2 (final-review) — executeRollover had zero direct test coverage;
// confirm/route.test.ts only asserted against a *mocked* executeRollover.
// These tests exercise the real transactional-commit logic against a
// mockDeep<PrismaClient> passed in as `tx`.
describe('executeRollover', () => {
  const tx = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

  function oldClass(
    id: string,
    name: string,
    extra: Partial<{
      level: string;
      room: string | null;
      capacity: number | null;
      homeroomTeacherId: string | null;
      gradeLevelId: string | null;
    }> = {},
  ) {
    return {
      id,
      name,
      level: '6ème',
      room: null,
      capacity: null,
      homeroomTeacherId: null,
      gradeLevelId: null,
      ...extra,
    };
  }

  beforeEach(() => {
    mockReset(tx);
    tx.academicYear.create.mockResolvedValue({ id: 'new_year_1' } as never);
    tx.academicYear.update.mockResolvedValue({} as never);
  });

  const baseRolloverData = {
    newYearLabel: '2026-2027',
    newYearStartDate: new Date('2026-09-01'),
    newYearEndDate: new Date('2027-06-30'),
  };

  it('archives the old year and activates the new one', async () => {
    tx.class.findMany.mockResolvedValue([] as never);
    tx.enrollment.findMany.mockResolvedValue([] as never);

    const result = await executeRollover(tx, 'school_1', 'ay_old', {
      ...baseRolloverData,
      classMapping: {},
      studentExceptions: {},
    });

    expect(result.newAcademicYearId).toBe('new_year_1');
    expect(tx.academicYear.create).toHaveBeenCalledWith({
      data: {
        schoolId: 'school_1',
        label: '2026-2027',
        startDate: baseRolloverData.newYearStartDate,
        endDate: baseRolloverData.newYearEndDate,
        isActive: true,
      },
    });
    expect(tx.academicYear.update).toHaveBeenCalledWith({
      where: { id: 'ay_old' },
      data: { isActive: false },
    });
  });

  it('(a) destClassId = a current-year class → cloned into the new year (name/level/room/capacity/homeroom), enrollment goes to the clone', async () => {
    tx.class.findMany.mockResolvedValue([
      oldClass('old_c1', '6ème A'),
      oldClass('old_c2', '5ème A', {
        level: '5ème',
        room: 'B12',
        capacity: 30,
        homeroomTeacherId: 't_9',
        gradeLevelId: 'gl_5eme',
      }),
    ] as never);
    tx.enrollment.findMany.mockResolvedValue([{ studentId: 's1', classId: 'old_c1' }] as never);
    tx.class.create.mockResolvedValue({ id: 'clone_5A' } as never);
    tx.enrollment.create.mockResolvedValue({} as never);

    await executeRollover(tx, 'school_1', 'ay_old', {
      ...baseRolloverData,
      classMapping: { old_c1: { destClassId: 'old_c2' } },
      studentExceptions: {},
    });

    expect(tx.class.create).toHaveBeenCalledTimes(1);
    expect(tx.class.create).toHaveBeenCalledWith({
      data: {
        schoolId: 'school_1',
        academicYearId: 'new_year_1',
        name: '5ème A',
        level: '5ème',
        room: 'B12',
        capacity: 30,
        homeroomTeacherId: 't_9',
        // F3 (final-review): GradeLevel is year-independent, so the clone
        // carries the template's catalog link forward instead of dropping it.
        gradeLevelId: 'gl_5eme',
      },
    });
    expect(tx.enrollment.create).toHaveBeenCalledWith({
      data: {
        studentId: 's1',
        classId: 'clone_5A',
        academicYearId: 'new_year_1',
        enrolledAt: expect.any(Date),
      },
    });
  });

  it('(a2) two old classes pointing at the same destClassId share ONE clone', async () => {
    tx.class.findMany.mockResolvedValue([
      oldClass('old_c1', '6ème A'),
      oldClass('old_c2', '6ème B'),
      oldClass('old_c3', '5ème A', { level: '5ème' }),
    ] as never);
    tx.enrollment.findMany.mockResolvedValue([
      { studentId: 's1', classId: 'old_c1' },
      { studentId: 's2', classId: 'old_c2' },
    ] as never);
    tx.class.create.mockResolvedValue({ id: 'clone_5A' } as never);
    tx.enrollment.create.mockResolvedValue({} as never);

    await executeRollover(tx, 'school_1', 'ay_old', {
      ...baseRolloverData,
      classMapping: { old_c1: { destClassId: 'old_c3' }, old_c2: { destClassId: 'old_c3' } },
      studentExceptions: {},
    });

    expect(tx.class.create).toHaveBeenCalledTimes(1);
    expect(tx.enrollment.create).toHaveBeenCalledTimes(2);
    for (const studentId of ['s1', 's2']) {
      expect(tx.enrollment.create).toHaveBeenCalledWith({
        data: {
          studentId,
          classId: 'clone_5A',
          academicYearId: 'new_year_1',
          enrolledAt: expect.any(Date),
        },
      });
    }
  });

  it('(a3) a class mapped onto ITSELF is cloned too (collective repeat year)', async () => {
    tx.class.findMany.mockResolvedValue([oldClass('old_c1', '6ème A')] as never);
    tx.enrollment.findMany.mockResolvedValue([{ studentId: 's1', classId: 'old_c1' }] as never);
    tx.class.create.mockResolvedValue({ id: 'clone_6A' } as never);
    tx.enrollment.create.mockResolvedValue({} as never);

    await executeRollover(tx, 'school_1', 'ay_old', {
      ...baseRolloverData,
      classMapping: { old_c1: { destClassId: 'old_c1' } },
      studentExceptions: {},
    });

    expect(tx.class.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ academicYearId: 'new_year_1', name: '6ème A' }),
    });
    expect(tx.enrollment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ studentId: 's1', classId: 'clone_6A' }),
    });
  });

  it("(a4) destClassId that is not one of the old year's classes → nothing created, students not enrolled", async () => {
    tx.class.findMany.mockResolvedValue([oldClass('old_c1', '6ème A')] as never);
    tx.enrollment.findMany.mockResolvedValue([{ studentId: 's1', classId: 'old_c1' }] as never);

    await executeRollover(tx, 'school_1', 'ay_old', {
      ...baseRolloverData,
      classMapping: { old_c1: { destClassId: 'from_another_year' } },
      studentExceptions: {},
    });

    expect(tx.class.create).not.toHaveBeenCalled();
    expect(tx.enrollment.create).not.toHaveBeenCalled();
  });

  it('(a5) a template clone and an isNew of the SAME name dedupe onto one class', async () => {
    tx.class.findMany.mockResolvedValue([
      oldClass('old_c1', '6ème A'),
      oldClass('old_c2', '6ème B'),
      oldClass('old_c3', '5ème A', { level: '5ème' }),
    ] as never);
    tx.enrollment.findMany.mockResolvedValue([
      { studentId: 's1', classId: 'old_c1' },
      { studentId: 's2', classId: 'old_c2' },
    ] as never);
    tx.class.create.mockResolvedValue({ id: 'only_one' } as never);
    tx.enrollment.create.mockResolvedValue({} as never);

    await executeRollover(tx, 'school_1', 'ay_old', {
      ...baseRolloverData,
      classMapping: {
        old_c1: { destClassId: 'old_c3' },
        old_c2: { isNew: true, newClass: { name: '5ème A', level: '5ème' } },
      },
      studentExceptions: {},
    });

    expect(tx.class.create).toHaveBeenCalledTimes(1);
    expect(tx.enrollment.create).toHaveBeenCalledTimes(2);
  });

  it('(b) isNew: true + newClass present creates a new class and enrolls into it', async () => {
    tx.class.findMany.mockResolvedValue([oldClass('old_c1', '6ème A')] as never);
    tx.enrollment.findMany.mockResolvedValue([{ studentId: 's1', classId: 'old_c1' }] as never);
    tx.class.create.mockResolvedValue({ id: 'created_c1' } as never);
    tx.enrollment.create.mockResolvedValue({} as never);

    await executeRollover(tx, 'school_1', 'ay_old', {
      ...baseRolloverData,
      classMapping: {
        old_c1: { isNew: true, newClass: { name: '5ème A', level: '5ème' } },
      },
      studentExceptions: {},
    });

    expect(tx.class.create).toHaveBeenCalledWith({
      data: {
        schoolId: 'school_1',
        academicYearId: 'new_year_1',
        name: '5ème A',
        level: '5ème',
        room: null,
        capacity: null,
        homeroomTeacherId: null,
        // The legacy "Créer nouvelle" draft path has no source class to
        // carry a catalog link from.
        gradeLevelId: null,
      },
    });
    expect(tx.enrollment.create).toHaveBeenCalledWith({
      data: {
        studentId: 's1',
        classId: 'created_c1',
        academicYearId: 'new_year_1',
        enrolledAt: expect.any(Date),
      },
    });
  });

  it('(c) isNew: true with NO newClass → that class is not created and its students are not enrolled', async () => {
    tx.class.findMany.mockResolvedValue([oldClass('old_c1', '6ème A')] as never);
    tx.enrollment.findMany.mockResolvedValue([{ studentId: 's1', classId: 'old_c1' }] as never);

    await executeRollover(tx, 'school_1', 'ay_old', {
      ...baseRolloverData,
      classMapping: { old_c1: { isNew: true } }, // malformed/incomplete: no newClass
      studentExceptions: {},
    });

    expect(tx.class.create).not.toHaveBeenCalled();
    expect(tx.enrollment.create).not.toHaveBeenCalled();
  });

  it('(d) a studentExceptions destClassId overrides the class-level mapping (and is cloned the same way)', async () => {
    tx.class.findMany.mockResolvedValue([
      oldClass('old_c1', '6ème A'),
      oldClass('old_c2', '5ème A', { level: '5ème' }),
      oldClass('old_c3', '5ème B', { level: '5ème' }),
    ] as never);
    tx.enrollment.findMany.mockResolvedValue([{ studentId: 's1', classId: 'old_c1' }] as never);
    tx.class.create
      .mockResolvedValueOnce({ id: 'clone_5A' } as never)
      .mockResolvedValueOnce({ id: 'clone_5B' } as never);
    tx.enrollment.create.mockResolvedValue({} as never);

    await executeRollover(tx, 'school_1', 'ay_old', {
      ...baseRolloverData,
      classMapping: { old_c1: { destClassId: 'old_c2' } },
      studentExceptions: { s1: { destClassId: 'old_c3' } },
    });

    expect(tx.enrollment.create).toHaveBeenCalledTimes(1);
    expect(tx.enrollment.create).toHaveBeenCalledWith({
      data: {
        studentId: 's1',
        classId: 'clone_5B',
        academicYearId: 'new_year_1',
        enrolledAt: expect.any(Date),
      },
    });
  });

  it('(e) a studentExceptions skip: true results in no enrollment regardless of class mapping', async () => {
    tx.class.findMany.mockResolvedValue([oldClass('old_c1', '6ème A')] as never);
    tx.enrollment.findMany.mockResolvedValue([{ studentId: 's1', classId: 'old_c1' }] as never);

    await executeRollover(tx, 'school_1', 'ay_old', {
      ...baseRolloverData,
      classMapping: { old_c1: { destClassId: 'class-mapped-dest' } },
      studentExceptions: { s1: { skip: true } },
    });

    expect(tx.enrollment.create).not.toHaveBeenCalled();
  });

  it('(f) an old class with no mapping entry at all → its students are not enrolled', async () => {
    tx.class.findMany.mockResolvedValue([oldClass('old_c1', '6ème A')] as never);
    tx.enrollment.findMany.mockResolvedValue([{ studentId: 's1', classId: 'old_c1' }] as never);

    await executeRollover(tx, 'school_1', 'ay_old', {
      ...baseRolloverData,
      classMapping: {}, // no entry for old_c1 at all
      studentExceptions: {},
    });

    expect(tx.class.create).not.toHaveBeenCalled();
    expect(tx.enrollment.create).not.toHaveBeenCalled();
  });

  // Fix 3 (final-review) — two source classes both mapped to a "Créer
  // nouvelle" with the same name (the only way to express a class merge in
  // v1) must not hit @@unique([academicYearId, name]) and roll back the
  // whole transaction.
  it('dedups same-name "Créer nouvelle" mappings: only one class is created, both old classes reuse it', async () => {
    tx.class.findMany.mockResolvedValue([
      oldClass('old_c1', '6ème A'),
      oldClass('old_c2', '6ème B'),
    ] as never);
    tx.enrollment.findMany.mockResolvedValue([
      { studentId: 's1', classId: 'old_c1' },
      { studentId: 's2', classId: 'old_c2' },
    ] as never);
    tx.class.create.mockResolvedValue({ id: 'merged_c1' } as never);
    tx.enrollment.create.mockResolvedValue({} as never);

    await executeRollover(tx, 'school_1', 'ay_old', {
      ...baseRolloverData,
      classMapping: {
        old_c1: { isNew: true, newClass: { name: '6ème Fusion', level: '6ème' } },
        old_c2: { isNew: true, newClass: { name: '6ème Fusion', level: '6ème' } },
      },
      studentExceptions: {},
    });

    expect(tx.class.create).toHaveBeenCalledTimes(1);
    expect(tx.enrollment.create).toHaveBeenCalledWith({
      data: {
        studentId: 's1',
        classId: 'merged_c1',
        academicYearId: 'new_year_1',
        enrolledAt: expect.any(Date),
      },
    });
    expect(tx.enrollment.create).toHaveBeenCalledWith({
      data: {
        studentId: 's2',
        classId: 'merged_c1',
        academicYearId: 'new_year_1',
        enrolledAt: expect.any(Date),
      },
    });
  });
});
