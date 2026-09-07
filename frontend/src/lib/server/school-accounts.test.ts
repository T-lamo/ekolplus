import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import {
  resolveSchoolAccount,
  staffAccountAccessAllowed,
  requireAccountAccess,
} from './school-accounts';
import type { MySchool } from './school';

const mySchool: MySchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'OWNER' };

describe('resolveSchoolAccount', () => {
  it('resolves an ADMIN member as STAFF', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      role: 'ADMIN',
      staffRoles: [],
    } as never);

    const result = await resolveSchoolAccount('user_1', mySchool);
    expect(result).toEqual({ kind: 'STAFF', targetRole: 'ADMIN' });
  });

  it('resolves a MEMBER holding at least one StaffRole as STAFF', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      role: 'MEMBER',
      staffRoles: [{ id: 'role_1' }],
    } as never);

    const result = await resolveSchoolAccount('user_2', mySchool);
    expect(result).toEqual({ kind: 'STAFF', targetRole: 'MEMBER' });
  });

  it('a connective membership (role MEMBER, no StaffRole) attached to a teacher resolves as TEACHER_ONLY, not STAFF', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      role: 'MEMBER',
      staffRoles: [],
    } as never);
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teach_1' } as never);

    const result = await resolveSchoolAccount('user_3', mySchool);
    expect(result).toEqual({ kind: 'TEACHER_ONLY', teacherId: 'teach_1' });
  });

  it('resolves a plain teacher with no membership row at all as TEACHER_ONLY', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never);
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teach_2' } as never);

    const result = await resolveSchoolAccount('user_4', mySchool);
    expect(result).toEqual({ kind: 'TEACHER_ONLY', teacherId: 'teach_2' });
  });

  it('resolves a student as STUDENT', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never);
    prismaMock.teacher.findFirst.mockResolvedValue(null as never);
    prismaMock.student.findFirst.mockResolvedValue({ id: 'stu_1' } as never);

    const result = await resolveSchoolAccount('user_5', mySchool);
    expect(result).toEqual({ kind: 'STUDENT', studentId: 'stu_1' });
  });

  it('returns null for a userId that belongs to no one in this school (anti-enumeration 404)', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never);
    prismaMock.teacher.findFirst.mockResolvedValue(null as never);
    prismaMock.student.findFirst.mockResolvedValue(null as never);

    const result = await resolveSchoolAccount('user_6', mySchool);
    expect(result).toBeNull();
  });
});

describe('staffAccountAccessAllowed', () => {
  it('a MEMBER target is reachable by ADMIN+', () => {
    expect(staffAccountAccessAllowed({ ...mySchool, role: 'ADMIN' }, 'MEMBER')).toBe(true);
    expect(staffAccountAccessAllowed({ ...mySchool, role: 'MEMBER' }, 'MEMBER')).toBe(false);
  });

  it('an ADMIN or OWNER target is reachable only by the OWNER — an ADMIN never touches another ADMIN', () => {
    expect(staffAccountAccessAllowed({ ...mySchool, role: 'ADMIN' }, 'ADMIN')).toBe(false);
    expect(staffAccountAccessAllowed({ ...mySchool, role: 'OWNER' }, 'ADMIN')).toBe(true);
    expect(staffAccountAccessAllowed({ ...mySchool, role: 'OWNER' }, 'OWNER')).toBe(true);
  });
});

describe('requireAccountAccess', () => {
  it('404s when the target belongs to no one in this school', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never);
    prismaMock.teacher.findFirst.mockResolvedValue(null as never);
    prismaMock.student.findFirst.mockResolvedValue(null as never);

    const result = await requireAccountAccess('caller_1', 'user_1', mySchool, 'req_1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
  });

  it('403s an ADMIN caller targeting another ADMIN account', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      role: 'ADMIN',
      staffRoles: [],
    } as never);

    const result = await requireAccountAccess(
      'caller_1',
      'user_1',
      { ...mySchool, role: 'ADMIN' },
      'req_1',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('allows a MEMBER caller with enseignants.edit to reach a teacher-only account', async () => {
    prismaMock.organizationMember.findFirst
      .mockResolvedValueOnce(null as never) // resolveSchoolAccount's own membership lookup
      .mockResolvedValueOnce({ staffRoles: [{ grants: ['enseignants.edit'] }] } as never); // resolveGrantsFor
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teach_1' } as never);

    const result = await requireAccountAccess(
      'caller_1',
      'user_1',
      { ...mySchool, role: 'MEMBER' },
      'req_1',
    );
    expect(result).toMatchObject({
      ok: true,
      account: { kind: 'TEACHER_ONLY', teacherId: 'teach_1' },
    });
  });

  it('403s a MEMBER caller without eleves.edit targeting a student account', async () => {
    prismaMock.organizationMember.findFirst
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ staffRoles: [{ grants: ['eleves.view'] }] } as never);
    prismaMock.teacher.findFirst.mockResolvedValue(null as never);
    prismaMock.student.findFirst.mockResolvedValue({ id: 'stu_1' } as never);

    const result = await requireAccountAccess(
      'caller_1',
      'user_1',
      { ...mySchool, role: 'MEMBER' },
      'req_1',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
});
