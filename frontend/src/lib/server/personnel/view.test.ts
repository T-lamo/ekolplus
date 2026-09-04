// prismaMock first — auto-hoists the vi.mock('@/lib/server/prisma', ...) call.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { getPersonnelList, getPersonnelDetail } from './view';

const SCHOOL_ID = 'school_1';
const ORG_ID = 'org_1';

describe('getPersonnelList', () => {
  it('a teacher never invited (no userId) yields one row, accountStatus NONE', async () => {
    prismaMock.teacher.findMany.mockResolvedValue([
      { id: 'teach_1', name: 'Alice Pierre', photoUrl: null, userId: null },
    ] as never);
    prismaMock.organizationMember.findMany.mockResolvedValue([] as never);

    const rows = await getPersonnelList(SCHOOL_ID, ORG_ID);

    expect(rows).toEqual([
      {
        id: 'teach_1',
        userId: null,
        name: 'Alice Pierre',
        avatarUrl: null,
        profiles: ['TEACHER'],
        staffRoleNames: [],
        accountStatus: 'NONE',
        loginMode: null,
      },
    ]);
  });

  it('a teacher invited by email, pending → PENDING/EMAIL, single TEACHER profile (connective membership row does not count as a second profile)', async () => {
    prismaMock.teacher.findMany.mockResolvedValue([
      { id: 'teach_2', name: 'Bob Joseph', photoUrl: null, userId: 'user_2' },
    ] as never);
    // Connective row from the email-invite flow: role MEMBER, no StaffRole.
    prismaMock.organizationMember.findMany.mockResolvedValue([
      { userId: 'user_2', role: 'MEMBER', staffRoles: [] },
    ] as never);
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'user_2',
        name: null,
        email: 'bob@school.test',
        username: null,
        phone: null,
        avatarUrl: null,
        passwordHash: null,
      },
    ] as never);

    const rows = await getPersonnelList(SCHOOL_ID, ORG_ID);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'teach_2',
      profiles: ['TEACHER'],
      accountStatus: 'PENDING',
      loginMode: 'EMAIL',
    });
  });

  it('an OrganizationMember-only admin (no Teacher row) → profiles: [ADMIN]', async () => {
    prismaMock.teacher.findMany.mockResolvedValue([] as never);
    prismaMock.organizationMember.findMany.mockResolvedValue([
      { userId: 'user_3', role: 'ADMIN', staffRoles: [] },
    ] as never);
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'user_3',
        name: 'Carla Admin',
        email: 'carla@school.test',
        username: null,
        phone: null,
        avatarUrl: null,
        passwordHash: 'hash',
      },
    ] as never);

    const rows = await getPersonnelList(SCHOOL_ID, ORG_ID);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'user_3',
      userId: 'user_3',
      name: 'Carla Admin',
      profiles: ['ADMIN'],
      accountStatus: 'ACTIVE',
      loginMode: 'EMAIL',
    });
  });

  it('a double-profile person (Teacher + OrganizationMember with a real StaffRole) → exactly one row, both badges', async () => {
    prismaMock.teacher.findMany.mockResolvedValue([
      { id: 'teach_4', name: 'Diane Comptable', photoUrl: null, userId: 'user_4' },
    ] as never);
    prismaMock.organizationMember.findMany.mockResolvedValue([
      {
        userId: 'user_4',
        role: 'MEMBER',
        staffRoles: [{ id: 'role_1', name: 'Comptable' }],
      },
    ] as never);
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'user_4',
        name: null,
        email: 'diane@school.test',
        username: 'diane.c',
        phone: null,
        avatarUrl: null,
        passwordHash: 'hash',
      },
    ] as never);

    const rows = await getPersonnelList(SCHOOL_ID, ORG_ID);

    // Dedup: never two rows for the same person.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'teach_4',
      profiles: ['TEACHER', 'MEMBER'],
      staffRoleNames: ['Comptable'],
      // Both email and username set → BOTH.
      loginMode: 'BOTH',
    });
  });

  it('filters by profile=teacher / profile=staff and by search text', async () => {
    prismaMock.teacher.findMany.mockResolvedValue([
      { id: 'teach_5', name: 'Eric Sanon', photoUrl: null, userId: null },
    ] as never);
    prismaMock.organizationMember.findMany.mockResolvedValue([
      { userId: 'user_6', role: 'ADMIN', staffRoles: [] },
    ] as never);
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'user_6',
        name: 'Fabienne Directrice',
        email: 'fab@school.test',
        username: null,
        phone: null,
        avatarUrl: null,
        passwordHash: 'hash',
      },
    ] as never);

    const teacherOnly = await getPersonnelList(SCHOOL_ID, ORG_ID, { profile: 'teacher' });
    expect(teacherOnly.map((r) => r.id)).toEqual(['teach_5']);

    const staffOnly = await getPersonnelList(SCHOOL_ID, ORG_ID, { profile: 'staff' });
    expect(staffOnly.map((r) => r.id)).toEqual(['user_6']);

    const searched = await getPersonnelList(SCHOOL_ID, ORG_ID, { q: 'fab@school.test' });
    expect(searched.map((r) => r.id)).toEqual(['user_6']);
  });

  it('a connective-only membership (role MEMBER, no StaffRole) with no Teacher row is not surfaced as a person', async () => {
    prismaMock.teacher.findMany.mockResolvedValue([] as never);
    prismaMock.organizationMember.findMany.mockResolvedValue([
      { userId: 'user_7', role: 'MEMBER', staffRoles: [] },
    ] as never);
    prismaMock.user.findMany.mockResolvedValue([] as never);

    const rows = await getPersonnelList(SCHOOL_ID, ORG_ID);
    expect(rows).toEqual([]);
  });
});

describe('getPersonnelDetail', () => {
  it('resolves by teacher.id and returns the full merged detail', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 'teach_8',
      schoolId: SCHOOL_ID,
      userId: 'user_8',
      name: 'Gina Prof',
      email: null,
      phone: '+50931112222',
      photoUrl: null,
      civility: null,
      firstName: null,
      lastName: null,
      dateOfBirth: null,
      gender: null,
      nationality: null,
      idNumber: null,
      secondaryPhone: null,
      address: null,
      contractType: null,
      hiredAt: null,
      weeklyHoursTarget: null,
      status: 'ACTIVE',
      isActive: true,
      classSubjects: [],
    } as never);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_8',
      name: null,
      email: 'gina@school.test',
      username: null,
      phone: '+50931112222',
      avatarUrl: null,
      passwordHash: 'hash',
    } as never);
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never);

    const detail = await getPersonnelDetail(SCHOOL_ID, ORG_ID, 'teach_8');

    expect(detail).toMatchObject({
      id: 'teach_8',
      userId: 'user_8',
      name: 'Gina Prof',
      profiles: ['TEACHER'],
      email: 'gina@school.test',
      username: null,
      organizationMember: null,
    });
    expect(detail?.teacher).toMatchObject({ id: 'teach_8', name: 'Gina Prof' });
  });

  it('returns null when the teacher.id belongs to another school', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 'teach_9',
      schoolId: 'other_school',
    } as never);

    const detail = await getPersonnelDetail(SCHOOL_ID, ORG_ID, 'teach_9');
    expect(detail).toBeNull();
  });

  it('resolves by user.id for a staff-only person', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue(null as never);
    prismaMock.organizationMember.findFirst
      .mockResolvedValueOnce({ userId: 'user_10' } as never) // resolution lookup
      .mockResolvedValueOnce({
        role: 'ADMIN',
        staffRoles: [],
      } as never); // detail lookup
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_10',
      name: 'Henri Admin',
      email: 'henri@school.test',
      username: null,
      phone: null,
      avatarUrl: null,
      passwordHash: 'hash',
    } as never);

    const detail = await getPersonnelDetail(SCHOOL_ID, ORG_ID, 'user_10');

    expect(detail).toMatchObject({
      id: 'user_10',
      userId: 'user_10',
      name: 'Henri Admin',
      profiles: ['ADMIN'],
      organizationMember: { role: 'ADMIN', staffRoleIds: [] },
    });
  });

  it('returns null for an id that matches nothing in this school', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue(null as never);
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never);

    const detail = await getPersonnelDetail(SCHOOL_ID, ORG_ID, 'nope');
    expect(detail).toBeNull();
  });
});
