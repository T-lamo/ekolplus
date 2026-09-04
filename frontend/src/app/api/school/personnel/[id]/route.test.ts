// prismaMock first — auto-hoists the vi.mock('@/lib/server/prisma', ...) call.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchool: vi.fn() };
});
vi.mock('@/lib/server/personnel/view', () => ({ getPersonnelDetail: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchool } from '@/lib/server/school';
import { getPersonnelDetail } from '@/lib/server/personnel/view';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveMySchool = vi.mocked(resolveMySchool);
const mockGetPersonnelDetail = vi.mocked(getPersonnelDetail);

const authUser = { user: { sub: 'user_1', email: 'staff@test.local' } };
const ownerSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'OWNER' as const };
const memberSchool = { ...ownerSchool, role: 'MEMBER' as const };

function req() {
  return new NextRequest('http://localhost/api/school/personnel/p1', { method: 'GET' });
}
const params = { params: Promise.resolve({ id: 'p1' }) };

const fullDetail = {
  id: 'teach_1',
  userId: 'user_1',
  name: 'Gina Prof',
  avatarUrl: null,
  profiles: ['TEACHER'],
  staffRoleNames: [],
  accountStatus: 'ACTIVE',
  loginMode: 'EMAIL',
  email: 'gina@school.test',
  username: null,
  phone: null,
  teacher: { id: 'teach_1', name: 'Gina Prof' },
  organizationMember: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveMySchool.mockResolvedValue(ownerSchool);
});

describe('GET /api/school/personnel/[id]', () => {
  it('404s when the person is not found in this school', async () => {
    mockGetPersonnelDetail.mockResolvedValue(null);
    const res = await GET(req(), params);
    expect(res.status).toBe(404);
  });

  it('an ADMIN+ caller sees the full detail, including the account block', async () => {
    mockGetPersonnelDetail.mockResolvedValue(fullDetail as never);
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.personnel.email).toBe('gina@school.test');
  });

  it('a MEMBER with enseignants.view only (no edit) never sees email/username/organizationMember', async () => {
    mockResolveMySchool.mockResolvedValue(memberSchool);
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      staffRoles: [{ grants: ['enseignants.view'] }],
    } as never);
    mockGetPersonnelDetail.mockResolvedValue(fullDetail as never);

    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.personnel.email).toBeNull();
    expect(body.personnel.username).toBeNull();
    expect(body.personnel.organizationMember).toBeNull();
    // Base fields (already ungated in the list) stay visible.
    expect(body.personnel.accountStatus).toBe('ACTIVE');
    expect(body.personnel.teacher).toEqual(fullDetail.teacher);
  });

  it('a MEMBER with enseignants.edit sees the account block for a teacher-only person (no staff profile)', async () => {
    mockResolveMySchool.mockResolvedValue(memberSchool);
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      staffRoles: [{ grants: ['enseignants.view', 'enseignants.edit'] }],
    } as never);
    mockGetPersonnelDetail.mockResolvedValue(fullDetail as never);

    const res = await GET(req(), params);
    const body = await res.json();
    expect(body.personnel.email).toBe('gina@school.test');
  });

  it('enseignants.edit does NOT unlock the account block for a genuine double-profile person', async () => {
    mockResolveMySchool.mockResolvedValue(memberSchool);
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      staffRoles: [{ grants: ['enseignants.view', 'enseignants.edit'] }],
    } as never);
    mockGetPersonnelDetail.mockResolvedValue({
      ...fullDetail,
      profiles: ['TEACHER', 'MEMBER'],
      organizationMember: { role: 'MEMBER', staffRoleIds: ['role_1'] },
    } as never);

    const res = await GET(req(), params);
    const body = await res.json();
    expect(body.personnel.organizationMember).toBeNull();
    expect(body.personnel.email).toBeNull();
  });
});
