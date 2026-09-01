// /api/school/members/[userId] — PATCH full-replaces the list of StaffRoles
// on a MEMBER-role org account (OWNER/ADMIN only), gated by
// hasMinRole('ADMIN'), NOT by grants (spec 2026-09-01-multi-espaces §8).
// A member can hold several roles at once; `staffRoleIds: []` clears every
// role. prismaMock first (auto-hoists vi.mock for '@/lib/server/prisma'),
// then mock requireAuth + verifyCsrf + resolveMySchool — modeled on
// src/app/api/school/roles/route.test.ts.
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

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';
import { PATCH } from './[userId]/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);

const authUser = { user: { sub: 'user_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };

function req(method: string, url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const params = (userId: string) => ({ params: Promise.resolve({ userId }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(adminSchool);
});

describe('PATCH /api/school/members/[userId]', () => {
  it('missing CSRF → 403 short-circuits before auth', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await PATCH(
      req('PATCH', '/api/school/members/user_2', { staffRoleIds: [] }),
      params('user_2'),
    );
    expect(res.status).toBe(403);
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });

  it('no school membership → 404 NOT_FOUND (anti-leak)', async () => {
    mockResolveMySchool.mockResolvedValueOnce(null);
    const res = await PATCH(
      req('PATCH', '/api/school/members/user_2', { staffRoleIds: [] }),
      params('user_2'),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('NOT_FOUND');
    expect(prismaMock.organizationMember.findFirst).not.toHaveBeenCalled();
  });

  it('caller is MEMBER → 404 NOT_FOUND (anti-leak)', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    const res = await PATCH(
      req('PATCH', '/api/school/members/user_2', { staffRoleIds: [] }),
      params('user_2'),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('NOT_FOUND');
    expect(prismaMock.organizationMember.findFirst).not.toHaveBeenCalled();
  });

  it('target not a member of the org → 404 NOT_FOUND', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      req('PATCH', '/api/school/members/user_x', { staffRoleIds: [] }),
      params('user_x'),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('NOT_FOUND');
    expect(prismaMock.organizationMember.update).not.toHaveBeenCalled();
  });

  it('target is OWNER → 400 NOT_A_MEMBER', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      id: 'om_2',
      role: 'OWNER',
    } as never);
    const res = await PATCH(
      req('PATCH', '/api/school/members/user_2', { staffRoleIds: [] }),
      params('user_2'),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('NOT_A_MEMBER');
    expect(prismaMock.organizationMember.update).not.toHaveBeenCalled();
  });

  it('target is ADMIN → 400 NOT_A_MEMBER', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      id: 'om_2',
      role: 'ADMIN',
    } as never);
    const res = await PATCH(
      req('PATCH', '/api/school/members/user_2', { staffRoleIds: [] }),
      params('user_2'),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('NOT_A_MEMBER');
    expect(prismaMock.organizationMember.update).not.toHaveBeenCalled();
  });

  it('invalid body → 400 VALIDATION_FAILED', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      id: 'om_2',
      role: 'MEMBER',
    } as never);
    const res = await PATCH(
      req('PATCH', '/api/school/members/user_2', { staffRoleIds: 42 }),
      params('user_2'),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('VALIDATION_FAILED');
    expect(prismaMock.organizationMember.update).not.toHaveBeenCalled();
  });

  it('a foreign/unknown staffRoleId → 404 NOT_FOUND', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      id: 'om_2',
      role: 'MEMBER',
    } as never);
    prismaMock.staffRole.count.mockResolvedValue(0);
    const res = await PATCH(
      req('PATCH', '/api/school/members/user_2', { staffRoleIds: ['role_other'] }),
      params('user_2'),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('NOT_FOUND');
    expect(prismaMock.staffRole.count).toHaveBeenCalledWith({
      where: { id: { in: ['role_other'] }, schoolId: 'school_1' },
    });
    expect(prismaMock.organizationMember.update).not.toHaveBeenCalled();
  });

  it('200 — assigns multiple valid staffRoleIds', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      id: 'om_2',
      role: 'MEMBER',
    } as never);
    prismaMock.staffRole.count.mockResolvedValue(2);
    prismaMock.organizationMember.update.mockResolvedValue({} as never);

    const res = await PATCH(
      req('PATCH', '/api/school/members/user_2', { staffRoleIds: ['role_1', 'role_2'] }),
      params('user_2'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({ ok: true });
    expect(prismaMock.organizationMember.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org_1', userId: 'user_2' },
      select: { id: true, role: true },
    });
    expect(prismaMock.organizationMember.update).toHaveBeenCalledWith({
      where: { id: 'om_2' },
      data: { staffRoles: { set: [{ id: 'role_1' }, { id: 'role_2' }] } },
    });
  });

  it('200 — clears all roles (staffRoleIds: []) without looking up a role', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      id: 'om_2',
      role: 'MEMBER',
    } as never);
    prismaMock.organizationMember.update.mockResolvedValue({} as never);

    const res = await PATCH(
      req('PATCH', '/api/school/members/user_2', { staffRoleIds: [] }),
      params('user_2'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({ ok: true });
    expect(prismaMock.staffRole.count).not.toHaveBeenCalled();
    expect(prismaMock.organizationMember.update).toHaveBeenCalledWith({
      where: { id: 'om_2' },
      data: { staffRoles: { set: [] } },
    });
  });

  it('200 — duplicate staffRoleIds are deduped before checking and writing', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      id: 'om_2',
      role: 'MEMBER',
    } as never);
    prismaMock.staffRole.count.mockResolvedValue(1);
    prismaMock.organizationMember.update.mockResolvedValue({} as never);

    const res = await PATCH(
      req('PATCH', '/api/school/members/user_2', { staffRoleIds: ['role_1', 'role_1'] }),
      params('user_2'),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.staffRole.count).toHaveBeenCalledWith({
      where: { id: { in: ['role_1'] }, schoolId: 'school_1' },
    });
    expect(prismaMock.organizationMember.update).toHaveBeenCalledWith({
      where: { id: 'om_2' },
      data: { staffRoles: { set: [{ id: 'role_1' }] } },
    });
  });
});
