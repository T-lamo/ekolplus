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
vi.mock('@/lib/server/portal-invite', () => ({ createPortalInvite: vi.fn() }));
vi.mock('@/lib/server/initial-password', () => ({
  generateInitialPassword: vi.fn(() => 'TempPass123'),
}));
vi.mock('@/lib/server/personnel/view', () => ({ getPersonnelList: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';
import { createPortalInvite } from '@/lib/server/portal-invite';
import { getPersonnelList } from '@/lib/server/personnel/view';
import { GET, POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);
const mockCreatePortalInvite = vi.mocked(createPortalInvite);
const mockGetPersonnelList = vi.mocked(getPersonnelList);

const authUser = { user: { sub: 'user_1', email: 'admin@test.local' } };
const ownerSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'OWNER' as const };
const adminSchool = { ...ownerSchool, role: 'ADMIN' as const };
const memberSchool = { ...ownerSchool, role: 'MEMBER' as const };

function getReq(qs = '') {
  return new NextRequest(`http://localhost/api/school/personnel${qs}`, { method: 'GET' });
}
function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/school/personnel', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(ownerSchool);
  prismaMock.$transaction.mockImplementation((async (cb: (tx: typeof prismaMock) => unknown) =>
    cb(prismaMock)) as never);
});

describe('GET /api/school/personnel', () => {
  it('returns a paginated, filtered list', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      id: `p_${i}`,
      userId: null,
      name: `Person ${i}`,
      avatarUrl: null,
      profiles: ['TEACHER'],
      staffRoleNames: [],
      accountStatus: 'NONE',
      loginMode: null,
    }));
    mockGetPersonnelList.mockResolvedValue(rows as never);

    const res = await GET(getReq('?profile=teacher&q=foo&page=2'));
    const body = (await res.json()) as {
      items: unknown[];
      total: number;
      page: number;
      pageSize: number;
    };

    expect(res.status).toBe(200);
    expect(mockGetPersonnelList).toHaveBeenCalledWith('school_1', 'org_1', {
      profile: 'teacher',
      q: 'foo',
    });
    expect(body.total).toBe(25);
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(20);
    expect(body.items).toHaveLength(5);
  });

  it('404s a caller with no school', async () => {
    mockResolveMySchool.mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(404);
  });
});

describe('POST /api/school/personnel', () => {
  it('rejects a body with neither teacherProfile nor staffProfile', async () => {
    const res = await POST(postReq({ firstName: 'A', lastName: 'B', login: { mode: 'none' } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('rejects login.mode "none" combined with a staffProfile', async () => {
    const res = await POST(
      postReq({
        firstName: 'A',
        lastName: 'B',
        staffProfile: { role: 'MEMBER', staffRoleIds: [] },
        login: { mode: 'none' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('creates a teacher-only profile with no account (login.mode none)', async () => {
    prismaMock.teacher.create.mockResolvedValue({ id: 'teach_1' } as never);
    const res = await POST(
      postReq({
        firstName: 'Alice',
        lastName: 'Pierre',
        teacherProfile: { matiereIds: [], classIds: [] },
        login: { mode: 'none' },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ ok: true, id: 'teach_1', userId: null });
    expect(prismaMock.teacher.create).toHaveBeenCalledWith({
      data: { schoolId: 'school_1', name: 'Alice Pierre', phone: null },
    });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('creates a teacher via email invite, reusing createPortalInvite with the connective membership', async () => {
    mockCreatePortalInvite.mockResolvedValue({ ok: true, userId: 'user_new' });
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teach_2' } as never);

    const res = await POST(
      postReq({
        firstName: 'Bob',
        lastName: 'Joseph',
        teacherProfile: { matiereIds: [], classIds: [] },
        login: { mode: 'email', email: 'bob@school.test' },
      }),
    );
    expect(res.status).toBe(201);
    expect(mockCreatePortalInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'bob@school.test',
        inviteType: 'STAFF_INVITE',
        createOrgMembership: true,
      }),
    );
    const callback = mockCreatePortalInvite.mock.calls[0]![0].linkExisting;
    await callback(prismaMock as never, 'user_new');
    expect(prismaMock.teacher.create).toHaveBeenCalledWith({
      data: {
        schoolId: 'school_1',
        name: 'Bob Joseph',
        phone: null,
        email: 'bob@school.test',
        userId: 'user_new',
      },
    });
    const body = await res.json();
    expect(body).toEqual({ ok: true, id: 'teach_2', userId: 'user_new' });
    // Email mode never returns a password field.
    expect(body).not.toHaveProperty('temporaryPassword');
  });

  it('surfaces EMAIL_ALREADY_IN_USE from createPortalInvite', async () => {
    mockCreatePortalInvite.mockResolvedValue({ ok: false, error: 'EMAIL_ALREADY_IN_USE' });
    const res = await POST(
      postReq({
        firstName: 'Bob',
        lastName: 'Joseph',
        teacherProfile: { matiereIds: [], classIds: [] },
        login: { mode: 'email', email: 'bob@school.test' },
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('EMAIL_ALREADY_IN_USE');
  });

  it('creates a staff-only account with a username login, returning temporaryPassword once', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null as never);
    prismaMock.staffRole.count.mockResolvedValue(1 as never);
    prismaMock.user.create.mockResolvedValue({ id: 'user_3' } as never);
    prismaMock.organizationMember.create.mockResolvedValue({} as never);
    prismaMock.organizationMember.update.mockResolvedValue({} as never);

    const res = await POST(
      postReq({
        firstName: 'Carla',
        lastName: 'Admin',
        staffProfile: { role: 'MEMBER', staffRoleIds: ['caaaaaaaaaaaaaaaaaaaaa1'] },
        login: { mode: 'username', username: 'carla.admin' },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      id: 'user_3',
      userId: 'user_3',
      temporaryPassword: 'TempPass123',
    });
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        username: 'carla.admin',
        name: 'Carla Admin',
        phone: null,
        passwordHash: expect.any(String),
      },
    });
    expect(prismaMock.organizationMember.create).toHaveBeenCalledWith({
      data: { organizationId: 'org_1', userId: 'user_3', role: 'MEMBER' },
    });
    expect(prismaMock.organizationMember.update).toHaveBeenCalledWith({
      where: { organizationId_userId: { organizationId: 'org_1', userId: 'user_3' } },
      data: { role: 'MEMBER', staffRoles: { set: [{ id: 'caaaaaaaaaaaaaaaaaaaaa1' }] } },
    });
  });

  it('409s on a taken username', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'someone_else' } as never);
    const res = await POST(
      postReq({
        firstName: 'Carla',
        lastName: 'Admin',
        teacherProfile: { matiereIds: [], classIds: [] },
        login: { mode: 'username', username: 'carla.admin' },
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('USERNAME_TAKEN');
  });

  it('rejects a MEMBER (enseignants.create only) attempting to check the staff-profile box', async () => {
    mockResolveMySchool.mockResolvedValue(memberSchool);
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      staffRoles: [{ grants: ['enseignants.create'] }],
    } as never);

    const res = await POST(
      postReq({
        firstName: 'Bob',
        lastName: 'Joseph',
        staffProfile: { role: 'MEMBER', staffRoleIds: [] },
        login: { mode: 'username', username: 'bob.joseph' },
      }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('PERMISSION_DENIED');
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('rejects an ADMIN caller requesting an ADMIN target role (owner-only)', async () => {
    mockResolveMySchool.mockResolvedValue(adminSchool);
    const res = await POST(
      postReq({
        firstName: 'Bob',
        lastName: 'Joseph',
        staffProfile: { role: 'ADMIN', staffRoleIds: [] },
        login: { mode: 'username', username: 'bob.joseph' },
      }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('PERMISSION_DENIED');
  });

  it('404s an unknown staffRoleId (anti-fuite)', async () => {
    prismaMock.staffRole.count.mockResolvedValue(0 as never);
    const res = await POST(
      postReq({
        firstName: 'Bob',
        lastName: 'Joseph',
        staffProfile: { role: 'MEMBER', staffRoleIds: ['cbbbbbbbbbbbbbbbbbbbbb2'] },
        login: { mode: 'username', username: 'bob.joseph' },
      }),
    );
    expect(res.status).toBe(404);
  });
});
