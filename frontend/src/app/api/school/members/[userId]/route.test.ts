// /api/school/members/[userId] — the org-role change (PATCH `role`, OWNER
// only) and DELETE (remove access) added with the Banani « Admin Settings »
// screen (2026-09-04). The staff-role PATCH cases live in ../route.test.ts.
// prismaMock first (auto-hoists vi.mock for '@/lib/server/prisma').
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
import { DELETE, PATCH } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);

const authUser = { user: { sub: 'user_1', email: 'owner@test.local' } };
const ownerSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'OWNER' as const };
const adminSchool = { ...ownerSchool, role: 'ADMIN' as const };

function req(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/school/members/user_2', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const params = (userId: string) => ({ params: Promise.resolve({ userId }) });

function target(role: 'OWNER' | 'ADMIN' | 'MEMBER', extra: Record<string, unknown> = {}) {
  return {
    id: 'om_2',
    role,
    userId: 'user_2',
    user: { teacherProfile: null },
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(ownerSchool);
  prismaMock.organizationMember.update.mockResolvedValue({} as never);
  prismaMock.$transaction.mockResolvedValue([] as never);
});

describe('PATCH /api/school/members/[userId] { role }', () => {
  it('empty body → 400 VALIDATION_FAILED', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(target('MEMBER') as never);
    const res = await PATCH(req('PATCH', {}), params('user_2'));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('VALIDATION_FAILED');
  });

  it('an ADMIN caller cannot change an org role → 403 PERMISSION_DENIED', async () => {
    mockResolveMySchool.mockResolvedValue(adminSchool);
    prismaMock.organizationMember.findFirst.mockResolvedValue(target('MEMBER') as never);
    const res = await PATCH(req('PATCH', { role: 'ADMIN' }), params('user_2'));
    expect(res.status).toBe(403);
    expect(prismaMock.organizationMember.update).not.toHaveBeenCalled();
  });

  it('the OWNER row cannot be changed → 400 CANNOT_CHANGE_OWNER', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(target('OWNER') as never);
    const res = await PATCH(req('PATCH', { role: 'MEMBER' }), params('user_2'));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('CANNOT_CHANGE_OWNER');
  });

  it('promoting to ADMIN clears the staff roles', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(target('MEMBER') as never);
    const res = await PATCH(req('PATCH', { role: 'ADMIN' }), params('user_2'));
    expect(res.status).toBe(200);
    expect(prismaMock.organizationMember.update).toHaveBeenCalledWith({
      where: { id: 'om_2' },
      data: { role: 'ADMIN', staffRoles: { set: [] } },
    });
  });

  it('demoting to MEMBER may set staff roles in the same call', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(target('ADMIN') as never);
    prismaMock.staffRole.count.mockResolvedValue(1);
    const res = await PATCH(
      req('PATCH', { role: 'MEMBER', staffRoleIds: ['role_1'] }),
      params('user_2'),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.organizationMember.update).toHaveBeenCalledWith({
      where: { id: 'om_2' },
      data: { role: 'MEMBER', staffRoles: { set: [{ id: 'role_1' }] } },
    });
  });

  it('staff roles on an ADMIN target without a demotion → 400 NOT_A_MEMBER', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(target('ADMIN') as never);
    const res = await PATCH(req('PATCH', { staffRoleIds: ['role_1'] }), params('user_2'));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('NOT_A_MEMBER');
  });
});

describe('DELETE /api/school/members/[userId]', () => {
  it('missing CSRF → 403 short-circuits before auth', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await DELETE(req('DELETE'), params('user_2'));
    expect(res.status).toBe(403);
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });

  it('caller is MEMBER → 404 NOT_FOUND (anti-leak)', async () => {
    mockResolveMySchool.mockResolvedValue({ ...ownerSchool, role: 'MEMBER' });
    const res = await DELETE(req('DELETE'), params('user_2'));
    expect(res.status).toBe(404);
    expect(prismaMock.organizationMember.findFirst).not.toHaveBeenCalled();
  });

  it('target not in the org → 404 NOT_FOUND', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(null);
    const res = await DELETE(req('DELETE'), params('user_x'));
    expect(res.status).toBe(404);
  });

  it('removing yourself → 400 CANNOT_REMOVE_SELF', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      target('ADMIN', { userId: 'user_1' }) as never,
    );
    const res = await DELETE(req('DELETE'), params('user_1'));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('CANNOT_REMOVE_SELF');
  });

  it('removing the OWNER → 400 CANNOT_REMOVE_OWNER', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(target('OWNER') as never);
    const res = await DELETE(req('DELETE'), params('user_2'));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('CANNOT_REMOVE_OWNER');
  });

  it('an ADMIN cannot remove another ADMIN → 403 PERMISSION_DENIED', async () => {
    mockResolveMySchool.mockResolvedValue(adminSchool);
    prismaMock.organizationMember.findFirst.mockResolvedValue(target('ADMIN') as never);
    const res = await DELETE(req('DELETE'), params('user_2'));
    expect(res.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('a teacher-linked member is never removed here → 409 MEMBER_IS_TEACHER', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      target('MEMBER', { user: { teacherProfile: { schoolId: 'school_1' } } }) as never,
    );
    const res = await DELETE(req('DELETE'), params('user_2'));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('MEMBER_IS_TEACHER');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('removes the membership and retires pending STAFF_INVITE codes → 204', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(target('MEMBER') as never);
    const res = await DELETE(req('DELETE'), params('user_2'));
    expect(res.status).toBe(204);
    expect(prismaMock.verificationCode.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_2', type: 'STAFF_INVITE', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(prismaMock.organizationMember.delete).toHaveBeenCalledWith({ where: { id: 'om_2' } });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
