// prismaMock first — auto-hoists the vi.mock('@/lib/server/prisma', ...) call.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchool: vi.fn() };
});
vi.mock('@/lib/server/school-accounts', () => ({ requireAccountAccess: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';
import { requireAccountAccess } from '@/lib/server/school-accounts';
import { PATCH } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);
const mockRequireAccountAccess = vi.mocked(requireAccountAccess);

const authUser = { user: { sub: 'admin_1', email: 'admin@test.local' } };
const ownerSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'OWNER' as const };

function patchReq(body: unknown) {
  return new NextRequest('http://localhost/api/school/accounts/u1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ userId: 'u1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(ownerSchool);
  mockRequireAccountAccess.mockResolvedValue({
    ok: true,
    account: { kind: 'TEACHER_ONLY', teacherId: 'teach_1' },
  });
});

describe('PATCH /api/school/accounts/[userId]', () => {
  it('404s a caller with no school', async () => {
    mockResolveMySchool.mockResolvedValue(null);
    const res = await PATCH(patchReq({ username: 'marie.k' }), params);
    expect(res.status).toBe(404);
  });

  it('propagates a denied access resolution (404 or 403 from requireAccountAccess)', async () => {
    mockRequireAccountAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'PERMISSION_DENIED', message: 'no' }, { status: 403 }),
    });
    const res = await PATCH(patchReq({ username: 'marie.k' }), params);
    expect(res.status).toBe(403);
  });

  it('400s LAST_IDENTIFIER when clearing the only identifier', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: null, username: 'marie.k' } as never);
    const res = await PATCH(patchReq({ username: null }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('LAST_IDENTIFIER');
  });

  it('409s USERNAME_TAKEN when the new username belongs to someone else', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ email: 'gina@school.test', username: null } as never) // target lookup
      .mockResolvedValueOnce({ id: 'someone_else' } as never); // conflict check
    const res = await PATCH(patchReq({ username: 'taken.name' }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('USERNAME_TAKEN');
  });

  it('409s EMAIL_ALREADY_IN_USE when the new email belongs to someone else', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ email: null, username: 'gina.p' } as never)
      .mockResolvedValueOnce({ id: 'someone_else' } as never);
    const res = await PATCH(patchReq({ email: 'taken@school.test' }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('EMAIL_ALREADY_IN_USE');
  });

  it('sets a new username, bumps tokenVersion', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ email: 'gina@school.test', username: null } as never)
      .mockResolvedValueOnce(null as never); // no conflict
    prismaMock.user.update.mockResolvedValue({} as never);

    const res = await PATCH(patchReq({ username: 'gina.p' }), params);
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { username: 'gina.p', tokenVersion: { increment: 1 } },
    });
  });

  it('sets a new email, resets emailVerifiedAt, does not touch tokenVersion', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ email: null, username: 'gina.p' } as never)
      .mockResolvedValueOnce(null as never);
    prismaMock.user.update.mockResolvedValue({} as never);

    const res = await PATCH(patchReq({ email: 'gina@school.test' }), params);
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { email: 'gina@school.test', emailVerifiedAt: null },
    });
  });
});
