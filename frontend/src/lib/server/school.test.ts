import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import {
  resolveMySchool,
  resolveMySchoolIncludingTeacher,
  resolveMyTeacherProfile,
} from './school';

function membershipRow(over: Record<string, unknown> = {}) {
  return {
    organizationId: 'org_1',
    role: 'MEMBER',
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
  });
});
