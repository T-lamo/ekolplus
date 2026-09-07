// POST /api/school/members/[userId]/invite — resend a pending staff
// invitation. prismaMock first (auto-hoists vi.mock for '@/lib/server/prisma').
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

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';
import { createPortalInvite } from '@/lib/server/portal-invite';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);
const mockCreatePortalInvite = vi.mocked(createPortalInvite);

const authUser = { user: { sub: 'user_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };
const memberSchool = { ...adminSchool, role: 'MEMBER' as const };

function req() {
  return new NextRequest('http://localhost/api/school/members/user_2/invite', { method: 'POST' });
}
const params = { params: Promise.resolve({ userId: 'user_2' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(adminSchool);
  mockCreatePortalInvite.mockResolvedValue({ ok: true, userId: 'user_2' });
  prismaMock.organizationMember.findFirst.mockResolvedValue({
    user: { id: 'user_2', email: 'x@test.local', passwordHash: null, emailVerifiedAt: null },
  } as never);
});

describe('POST /api/school/members/[userId]/invite', () => {
  it('caller is MEMBER → 404 NOT_FOUND (anti-leak)', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    const res = await POST(req(), params);
    expect(res.status).toBe(404);
    expect(mockCreatePortalInvite).not.toHaveBeenCalled();
  });

  it('target not in the org → 404 NOT_FOUND', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(null);
    const res = await POST(req(), params);
    expect(res.status).toBe(404);
  });

  it('target already activated → 409 ALREADY_ACTIVE', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      user: { id: 'user_2', email: 'x@test.local', passwordHash: 'hash', emailVerifiedAt: null },
    } as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('ALREADY_ACTIVE');
    expect(mockCreatePortalInvite).not.toHaveBeenCalled();
  });

  it('invalidates the previous code and resends through the existingUserId path', async () => {
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect(prismaMock.verificationCode.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_2', type: 'STAFF_INVITE', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(mockCreatePortalInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'x@test.local',
        inviteType: 'STAFF_INVITE',
        createOrgMembership: false,
        existingUserId: 'user_2',
      }),
    );
  });
});
