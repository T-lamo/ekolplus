import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveMySchool,
  resolveMySchoolIncludingTeacher,
  resolveMyTeacherProfile,
  resolveMyStudentProfile,
  isPortalLocked,
  resolveMySpaces,
} from './school';

// isPortalOnlyAccount now checks Student in addition to Teacher (Espace
// Élève, 2026-08-30) — default every test to "no Student row" so existing
// teacher-focused tests that don't care about the Student side don't hang
// or reject on an unmocked call. Tests that DO care override this.
beforeEach(() => {
  prismaMock.student.findFirst.mockResolvedValue(null as never);
});

function membershipRow(over: Record<string, unknown> = {}) {
  return {
    organizationId: 'org_1',
    role: 'MEMBER',
    staffRoles: [],
    organization: { school: { id: 'school_1' } },
    ...over,
  };
}

describe('resolveMySchool', () => {
  it('returns null when there is no membership', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never);
    expect(await resolveMySchool('user_1')).toBeNull();
  });

  it('returns the school for a non-teacher MEMBER', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(membershipRow() as never);
    prismaMock.teacher.findFirst.mockResolvedValue(null as never);
    expect(await resolveMySchool('user_1')).toEqual({
      organizationId: 'org_1',
      schoolId: 'school_1',
      role: 'MEMBER',
    });
  });

  it('returns null for a teacher-linked MEMBER (deny-by-default)', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(membershipRow() as never);
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teacher_1' } as never);
    expect(await resolveMySchool('user_1')).toBeNull();
    // isPortalOnlyAccount's Teacher lookup MUST be scoped to this school —
    // dropping schoolId would let a Teacher row in a DIFFERENT school
    // match and wrongly deny (or, for the inverse bug, wrongly allow).
    expect(prismaMock.teacher.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_1', schoolId: 'school_1' } }),
    );
  });

  it('never rejects an ADMIN account even if also teacher-linked', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ role: 'ADMIN' }) as never,
    );
    const result = await resolveMySchool('user_1');
    expect(result).toEqual({ organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' });
    expect(prismaMock.teacher.findFirst).not.toHaveBeenCalled();
  });
});

describe('resolveMySchoolIncludingTeacher', () => {
  it('returns the school for a teacher-linked MEMBER (no rejection)', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(membershipRow() as never);
    expect(await resolveMySchoolIncludingTeacher('user_1')).toEqual({
      organizationId: 'org_1',
      schoolId: 'school_1',
      role: 'MEMBER',
    });
    expect(prismaMock.teacher.findFirst).not.toHaveBeenCalled();
  });
});

describe('resolveMyTeacherProfile', () => {
  it('returns null when the user has no Teacher row in this school', async () => {
    prismaMock.teacher.findFirst.mockResolvedValue(null as never);
    expect(await resolveMyTeacherProfile('user_1', 'school_1')).toBeNull();
  });

  it('returns classSubjectIds and homeroomClassIds for a linked teacher', async () => {
    prismaMock.teacher.findFirst.mockResolvedValue({
      id: 'teacher_1',
      classSubjects: [{ id: 'cs_1' }, { id: 'cs_2' }],
      homeroomClasses: [{ id: 'class_1' }],
    } as never);
    expect(await resolveMyTeacherProfile('user_1', 'school_1')).toEqual({
      teacherId: 'teacher_1',
      classSubjectIds: ['cs_1', 'cs_2'],
      homeroomClassIds: ['class_1'],
    });
    // Must be scoped to this school — dropping schoolId would let a
    // Teacher row in a DIFFERENT school match this userId.
    expect(prismaMock.teacher.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_1', schoolId: 'school_1' } }),
    );
  });
});

describe('resolveMySchool — student lockdown', () => {
  it('returns null for a student-linked MEMBER (deny-by-default)', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      organizationId: 'org_1',
      role: 'MEMBER',
      staffRoles: [],
      organization: { school: { id: 'school_1' } },
    } as never);
    prismaMock.teacher.findFirst.mockResolvedValue(null as never);
    prismaMock.student.findFirst.mockResolvedValue({ id: 'student_1' } as never);
    expect(await resolveMySchool('user_1')).toBeNull();
  });
});

describe('resolveMyStudentProfile', () => {
  it('returns null when the user has no Student row', async () => {
    prismaMock.student.findFirst.mockResolvedValue(null as never);
    expect(await resolveMyStudentProfile('user_1')).toBeNull();
  });

  it('returns the current-year classId/academicYearId via the active Enrollment', async () => {
    prismaMock.student.findFirst.mockResolvedValue({
      id: 'student_1',
      schoolId: 'school_1',
      enrollments: [{ classId: 'class_1', academicYearId: 'year_1' }],
    } as never);
    expect(await resolveMyStudentProfile('user_1')).toEqual({
      studentId: 'student_1',
      schoolId: 'school_1',
      classId: 'class_1',
      academicYearId: 'year_1',
    });
  });

  it('returns classId/academicYearId as null when there is no current-year Enrollment', async () => {
    prismaMock.student.findFirst.mockResolvedValue({
      id: 'student_1',
      schoolId: 'school_1',
      enrollments: [],
    } as never);
    expect(await resolveMyStudentProfile('user_1')).toEqual({
      studentId: 'student_1',
      schoolId: 'school_1',
      classId: null,
      academicYearId: null,
    });
  });
});

describe('resolveMySchool — déblocage double profil (multi-espaces)', () => {
  it('still denies a teacher-linked MEMBER with no staff role', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ staffRoles: [] }) as never,
    );
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teacher_1' } as never);
    expect(await resolveMySchool('user_1')).toBeNull();
  });

  it('still denies a teacher-linked MEMBER whose roles have zero grants', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ staffRoles: [{ grants: [] }, { grants: ['bogus.grant'] }] }) as never,
    );
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teacher_1' } as never);
    expect(await resolveMySchool('user_1')).toBeNull();
  });

  it('unlocks a teacher-linked MEMBER whose grant union is non-empty', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ staffRoles: [{ grants: ['paiements.view'] }] }) as never,
    );
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teacher_1' } as never);
    expect(await resolveMySchool('user_1')).toEqual({
      organizationId: 'org_1',
      schoolId: 'school_1',
      role: 'MEMBER',
    });
  });

  it('a student-linked MEMBER stays denied even with staff-role grants', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ staffRoles: [{ grants: ['paiements.view'] }] }) as never,
    );
    prismaMock.teacher.findFirst.mockResolvedValue(null as never);
    prismaMock.student.findFirst.mockResolvedValue({ id: 'student_1' } as never);
    expect(await resolveMySchool('user_1')).toBeNull();
  });
});

describe('isPortalLocked', () => {
  it.each([
    [{ teacherLinked: false, studentLinked: false, staffGrantUnion: [] }, false],
    [{ teacherLinked: true, studentLinked: false, staffGrantUnion: [] }, true],
    [{ teacherLinked: true, studentLinked: false, staffGrantUnion: ['eleves.view'] }, false],
    [{ teacherLinked: false, studentLinked: true, staffGrantUnion: ['eleves.view'] }, true],
    [{ teacherLinked: true, studentLinked: true, staffGrantUnion: ['eleves.view'] }, true],
  ])('%o → %s', (input, locked) => {
    expect(isPortalLocked(input)).toBe(locked);
  });
});

describe('resolveMySpaces', () => {
  function mockUserRole(role: string) {
    prismaMock.user.findUnique.mockResolvedValue({ role } as never);
  }

  it('pure school admin → school only', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ role: 'OWNER', staffRoles: [] }) as never,
    );
    prismaMock.teacher.findFirst.mockResolvedValue(null as never);
    mockUserRole('USER');
    expect(await resolveMySpaces('user_1')).toEqual({
      school: true,
      teacher: false,
      student: false,
    });
  });

  it('pure teacher (MEMBER, no grants) → teacher only', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ staffRoles: [] }) as never,
    );
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teacher_1' } as never);
    mockUserRole('USER');
    expect(await resolveMySpaces('user_1')).toEqual({
      school: false,
      teacher: true,
      student: false,
    });
  });

  it('pure student (no membership, USER role) → student only', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never);
    prismaMock.student.findFirst.mockResolvedValue({ id: 'student_1' } as never);
    mockUserRole('USER');
    expect(await resolveMySpaces('user_1')).toEqual({
      school: false,
      teacher: false,
      student: true,
    });
  });

  it('teacher with a granted staff role (double profil) → school + teacher', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ staffRoles: [{ grants: ['paiements.view'] }] }) as never,
    );
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teacher_1' } as never);
    mockUserRole('USER');
    expect(await resolveMySpaces('user_1')).toEqual({
      school: true,
      teacher: true,
      student: false,
    });
  });

  it('director who also teaches (ADMIN + teacher link) → school + teacher', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ role: 'ADMIN', staffRoles: [] }) as never,
    );
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teacher_1' } as never);
    mockUserRole('USER');
    expect(await resolveMySpaces('user_1')).toEqual({
      school: true,
      teacher: true,
      student: false,
    });
  });

  it('MEMBER staff without any grant → no space at all (login falls back to /dashboard)', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ staffRoles: [] }) as never,
    );
    prismaMock.teacher.findFirst.mockResolvedValue(null as never);
    mockUserRole('USER');
    expect(await resolveMySpaces('user_1')).toEqual({
      school: false,
      teacher: false,
      student: false,
    });
  });

  it('account with nothing → all false', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never);
    mockUserRole('USER');
    expect(await resolveMySpaces('user_1')).toEqual({
      school: false,
      teacher: false,
      student: false,
    });
  });
});
