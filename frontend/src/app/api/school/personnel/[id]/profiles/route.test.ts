// prismaMock first — auto-hoists the vi.mock('@/lib/server/prisma', ...) call.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchool: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);

const authUser = { user: { sub: 'admin_1', email: 'admin@test.local' } };
const ownerSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'OWNER' as const };
const adminSchool = { ...ownerSchool, role: 'ADMIN' as const };
const memberSchool = { ...ownerSchool, role: 'MEMBER' as const };
const ROLE_ID = 'caaaaaaaaaaaaaaaaaaaaa1';

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/school/personnel/p1/profiles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: 'p1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(ownerSchool);
});

describe('POST /api/school/personnel/[id]/profiles', () => {
  it('404s when the id matches neither a Teacher nor an OrganizationMember of this school', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue(null as never);
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never);
    const res = await POST(postReq({ profile: 'teacher' }), params);
    expect(res.status).toBe(404);
  });

  it('404s a Teacher belonging to another school', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 'p1',
      schoolId: 'other',
      userId: 'u1',
    } as never);
    const res = await POST(postReq({ profile: 'teacher' }), params);
    expect(res.status).toBe(404);
  });

  it('404s a Teacher with no account at all (nothing to attach a profile to)', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 'p1',
      schoolId: 'school_1',
      userId: null,
    } as never);
    const res = await POST(postReq({ profile: 'teacher' }), params);
    expect(res.status).toBe(404);
  });

  it('adds a missing Teacher profile to a staff-only person', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue(null as never);
    prismaMock.organizationMember.findFirst.mockResolvedValue({ userId: 'user_2' } as never);
    prismaMock.teacher.findFirst.mockResolvedValue(null as never); // no existing teacher profile
    prismaMock.user.findUnique.mockResolvedValue({
      name: 'Carla Admin',
      email: 'carla@school.test',
      username: null,
    } as never);
    prismaMock.teacher.create.mockResolvedValue({ id: 'teach_new' } as never);

    const res = await POST(postReq({ profile: 'teacher' }), params);
    expect(res.status).toBe(201);
    expect(prismaMock.teacher.create).toHaveBeenCalledWith({
      data: {
        schoolId: 'school_1',
        name: 'Carla Admin',
        phone: null,
        email: null,
        userId: 'user_2',
      },
    });
  });

  it('409s when the target already has a teaching profile', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue(null as never);
    prismaMock.organizationMember.findFirst.mockResolvedValue({ userId: 'user_2' } as never);
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teach_existing' } as never);

    const res = await POST(postReq({ profile: 'teacher' }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ALREADY_HAS_PROFILE');
  });

  it('adds a missing staff profile to a teacher (upgrades the connective membership)', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 'p1',
      schoolId: 'school_1',
      userId: 'user_3',
    } as never);
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      role: 'MEMBER',
      staffRoles: [], // connective row only
    } as never);
    prismaMock.staffRole.count.mockResolvedValue(1 as never);
    prismaMock.organizationMember.upsert.mockResolvedValue({} as never);

    const res = await POST(
      postReq({ profile: 'staff', role: 'MEMBER', staffRoleIds: [ROLE_ID] }),
      params,
    );
    expect(res.status).toBe(201);
    expect(prismaMock.organizationMember.upsert).toHaveBeenCalledWith({
      where: { organizationId_userId: { organizationId: 'org_1', userId: 'user_3' } },
      create: expect.objectContaining({ role: 'MEMBER' }),
      update: { role: 'MEMBER', staffRoles: { set: [{ id: ROLE_ID }] } },
    });
  });

  it('rejects a MEMBER caller attempting to add a staff profile', async () => {
    mockResolveMySchool.mockResolvedValue(memberSchool);
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      staffRoles: [{ grants: ['enseignants.create'] }],
    } as never);
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 'p1',
      schoolId: 'school_1',
      userId: 'user_3',
    } as never);

    const res = await POST(postReq({ profile: 'staff', role: 'MEMBER', staffRoleIds: [] }), params);
    expect(res.status).toBe(403);
  });

  it('rejects an ADMIN caller granting an ADMIN target role', async () => {
    mockResolveMySchool.mockResolvedValue(adminSchool);
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 'p1',
      schoolId: 'school_1',
      userId: 'user_3',
    } as never);

    const res = await POST(postReq({ profile: 'staff', role: 'ADMIN', staffRoleIds: [] }), params);
    expect(res.status).toBe(403);
  });

  it('409s when the target already has a genuine staff profile', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 'p1',
      schoolId: 'school_1',
      userId: 'user_3',
    } as never);
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      role: 'MEMBER',
      staffRoles: [{ id: 'role_x' }],
    } as never);

    const res = await POST(postReq({ profile: 'staff', role: 'MEMBER', staffRoleIds: [] }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ALREADY_HAS_PROFILE');
  });

  it('404s an unknown staffRoleId', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 'p1',
      schoolId: 'school_1',
      userId: 'user_3',
    } as never);
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      role: 'MEMBER',
      staffRoles: [],
    } as never);
    prismaMock.staffRole.count.mockResolvedValue(0 as never);

    const res = await POST(
      postReq({ profile: 'staff', role: 'MEMBER', staffRoleIds: [ROLE_ID] }),
      params,
    );
    expect(res.status).toBe(404);
  });
});
