// POST /api/school/members — staff invitation by email. prismaMock first
// (auto-hoists vi.mock for '@/lib/server/prisma'), then mock requireAuth +
// verifyCsrf + resolveMySchool + createPortalInvite — modeled on
// src/app/api/school/teachers/[id]/invite/route.test.ts.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

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
const ownerSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'OWNER' as const };
const adminSchool = { ...ownerSchool, role: 'ADMIN' as const };
const memberSchool = { ...ownerSchool, role: 'MEMBER' as const };

function req(body?: unknown) {
  return new NextRequest('http://localhost/api/school/members', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function runLinkExisting() {
  const call = mockCreatePortalInvite.mock.calls[0]?.[0];
  const tx = { organizationMember: { update: vi.fn().mockResolvedValue({}) } };
  await call?.linkExisting(tx as never, 'user_new');
  return tx.organizationMember.update;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(adminSchool);
  mockCreatePortalInvite.mockResolvedValue({ ok: true, userId: 'user_new' });
  prismaMock.organizationMember.findFirst.mockResolvedValue(null);
  prismaMock.staffRole.count.mockResolvedValue(1);
});

describe('POST /api/school/members', () => {
  it('missing CSRF → 403 short-circuits before auth', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await POST(req({ email: 'x@test.local' }));
    expect(res.status).toBe(403);
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });

  it('caller is MEMBER → 404 NOT_FOUND (anti-leak)', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    const res = await POST(req({ email: 'x@test.local' }));
    expect(res.status).toBe(404);
    expect(mockCreatePortalInvite).not.toHaveBeenCalled();
  });

  it('invalid body → 400 VALIDATION_FAILED', async () => {
    const res = await POST(req({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('VALIDATION_FAILED');
    expect(mockCreatePortalInvite).not.toHaveBeenCalled();
  });

  it('an ADMIN cannot invite another ADMIN → 403 PERMISSION_DENIED', async () => {
    const res = await POST(req({ email: 'x@test.local', role: 'ADMIN' }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('PERMISSION_DENIED');
    expect(mockCreatePortalInvite).not.toHaveBeenCalled();
  });

  it('a foreign/unknown staffRoleId → 404 NOT_FOUND', async () => {
    prismaMock.staffRole.count.mockResolvedValue(0);
    const res = await POST(req({ email: 'x@test.local', staffRoleIds: ['role_other'] }));
    expect(res.status).toBe(404);
    expect(mockCreatePortalInvite).not.toHaveBeenCalled();
  });

  it('email already belongs to an active member of this school → 409 ALREADY_MEMBER', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      user: { id: 'user_2', passwordHash: 'hash', emailVerifiedAt: null },
    } as never);
    const res = await POST(req({ email: 'x@test.local' }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('ALREADY_MEMBER');
    expect(mockCreatePortalInvite).not.toHaveBeenCalled();
  });

  it('re-inviting a pending member invalidates the previous code and resends', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      user: { id: 'user_2', passwordHash: null, emailVerifiedAt: null },
    } as never);
    const res = await POST(req({ email: 'x@test.local' }));
    expect(res.status).toBe(201);
    expect(prismaMock.verificationCode.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_2', type: 'STAFF_INVITE', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(mockCreatePortalInvite).toHaveBeenCalledTimes(1);
  });

  it('maps createPortalInvite EMAIL_ALREADY_IN_USE to 409', async () => {
    mockCreatePortalInvite.mockResolvedValue({ ok: false, error: 'EMAIL_ALREADY_IN_USE' });
    const res = await POST(req({ email: 'x@test.local' }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('EMAIL_ALREADY_IN_USE');
  });

  it('invites a MEMBER with staff roles: STAFF_INVITE code, membership, roles set in the tx', async () => {
    const res = await POST(
      req({ email: 'x@test.local', role: 'MEMBER', staffRoleIds: ['role_1', 'role_1'] }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ userId: 'user_new' });
    expect(prismaMock.staffRole.count).toHaveBeenCalledWith({
      where: { id: { in: ['role_1'] }, schoolId: 'school_1' },
    });
    expect(mockCreatePortalInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school_1',
        organizationId: 'org_1',
        email: 'x@test.local',
        inviteType: 'STAFF_INVITE',
        acceptPath: '/definir-mot-de-passe?portal=staff',
        createOrgMembership: true,
      }),
    );
    const update = await runLinkExisting();
    expect(update).toHaveBeenCalledWith({
      where: { organizationId_userId: { organizationId: 'org_1', userId: 'user_new' } },
      data: { role: 'MEMBER', staffRoles: { set: [{ id: 'role_1' }] } },
    });
  });

  it('the OWNER invites an ADMIN: role applied, staff roles cleared', async () => {
    mockResolveMySchool.mockResolvedValue(ownerSchool);
    const res = await POST(req({ email: 'x@test.local', role: 'ADMIN', staffRoleIds: ['r1'] }));
    expect(res.status).toBe(201);
    expect(prismaMock.staffRole.count).not.toHaveBeenCalled();
    const update = await runLinkExisting();
    expect(update).toHaveBeenCalledWith({
      where: { organizationId_userId: { organizationId: 'org_1', userId: 'user_new' } },
      data: { role: 'ADMIN', staffRoles: { set: [] } },
    });
  });
});
