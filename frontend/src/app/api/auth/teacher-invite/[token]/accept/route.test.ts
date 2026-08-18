// POST /api/auth/teacher-invite/[token]/accept tests — focused on the
// invite-consumption race guard (mirrors reset-password's WR-05 test). The
// outer `teacherInvite.findUnique` check in the route is only a cheap
// fail-fast optimization; the real correctness guarantee is the guarded
// `updateMany({ where: { usedAt: null } })` that runs FIRST inside the
// transaction — this file asserts that guard actually gates the
// User/OrganizationMember/Teacher writes.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';

const STRONG_PW = 'a-strong-passphrase-2026';

function makeReq(
  token: string,
  body: unknown,
): { req: NextRequest; params: Promise<{ token: string }> } {
  return {
    req: new NextRequest(`http://test/api/auth/teacher-invite/${token}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ token }),
  };
}

const baseInvite = {
  id: 'inv1',
  expiresAt: new Date(Date.now() + 60_000),
  usedAt: null,
  schoolId: 'school1',
  teacherId: 'teacher1',
  teacher: { email: 'teacher@example.com', userId: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('POST /api/auth/teacher-invite/[token]/accept', () => {
  it('happy path: consumes the invite (guarded updateMany), creates the User, links Teacher.userId, upserts OrganizationMember', async () => {
    prismaMock.teacherInvite.findUnique.mockResolvedValue(baseInvite as never);
    prismaMock.teacherInvite.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'user1' } as never);
    prismaMock.organization.findFirst.mockResolvedValue({ id: 'org1' } as never);
    prismaMock.organizationMember.upsert.mockResolvedValue({} as never);
    prismaMock.teacher.update.mockResolvedValue({} as never);

    const { req, params } = makeReq('tok1', { password: STRONG_PW });
    const res = await POST(req, { params });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(prismaMock.teacherInvite.updateMany).toHaveBeenCalledTimes(1);
    const consumeArg = prismaMock.teacherInvite.updateMany.mock.calls[0]?.[0];
    expect(consumeArg?.where).toEqual({ id: 'inv1', usedAt: null });
    expect(consumeArg?.data?.usedAt).toBeInstanceOf(Date);

    expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.teacher.update).toHaveBeenCalledWith({
      where: { id: 'teacher1' },
      data: { userId: 'user1' },
    });
    expect(prismaMock.organizationMember.upsert).toHaveBeenCalledTimes(1);
  });

  it('race guard: when the guarded updateMany returns count=0, surfaces INVALID_OR_EXPIRED and never touches User/OrganizationMember/Teacher', async () => {
    // Simulate a concurrent winner: the outer findUnique (run before either
    // racer's transaction starts) still sees the invite as valid/unused —
    // that's the whole point of the TOCTOU window this guard closes.
    prismaMock.teacherInvite.findUnique.mockResolvedValue(baseInvite as never);
    prismaMock.teacherInvite.updateMany.mockResolvedValue({ count: 0 } as never);

    const { req, params } = makeReq('tok1', { password: STRONG_PW });
    const res = await POST(req, { params });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('INVALID_OR_EXPIRED');

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.organizationMember.upsert).not.toHaveBeenCalled();
    expect(prismaMock.teacher.update).not.toHaveBeenCalled();
  });

  it('returns INVALID_OR_EXPIRED without a DB round-trip when the invite is already used at the outer check', async () => {
    prismaMock.teacherInvite.findUnique.mockResolvedValue({
      ...baseInvite,
      usedAt: new Date(),
    } as never);

    const { req, params } = makeReq('tok1', { password: STRONG_PW });
    const res = await POST(req, { params });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('INVALID_OR_EXPIRED');
    expect(prismaMock.teacherInvite.updateMany).not.toHaveBeenCalled();
  });
});
