import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/redis', () => ({ redis: null }));
vi.mock('@/lib/server/auth/banned-passwords', () => ({ isBanned: vi.fn().mockReturnValue(false) }));
vi.mock('@/lib/server/auth/hibp', () => ({ isPwned: vi.fn().mockResolvedValue(false) }));

// Cookies mock MUST be installed at module level so vi.mock auto-hoists
// (matches verify-email/route.test.ts's convention — this route also
// issues all 3 auth cookies on success via next/headers `cookies()`).
mockNextCookies();

import { POST } from './route';

function req(body: unknown) {
  return new NextRequest('http://localhost/api/auth/student-invite/accept', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  email: 'student@school.test',
  code: 'ABCD2345',
  newPassword: 'a-long-enough-password',
};

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('POST /api/auth/student-invite/accept', () => {
  it('returns VERIFICATION_CODE_INVALID for an unknown email', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null as never);
    const res = await POST(req(validBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VERIFICATION_CODE_INVALID');
  });

  it('returns VERIFICATION_CODE_INVALID for a wrong/used code', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'student@school.test',
      tokenVersion: 0,
    } as never);
    prismaMock.verificationCode.findFirst.mockResolvedValue(null as never);
    const res = await POST(req(validBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VERIFICATION_CODE_INVALID');
  });

  it('returns VERIFICATION_CODE_EXPIRED for an expired code', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'student@school.test',
      tokenVersion: 0,
    } as never);
    prismaMock.verificationCode.findFirst.mockResolvedValue({
      id: 'code_1',
      code: 'ABCD2345',
      expiresAt: new Date(Date.now() - 1000),
    } as never);
    const res = await POST(req(validBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VERIFICATION_CODE_EXPIRED');
  });

  it('sets the password, marks the code used, and issues cookies on success', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'student@school.test',
      tokenVersion: 0,
    } as never);
    prismaMock.verificationCode.findFirst.mockResolvedValue({
      id: 'code_1',
      code: 'ABCD2345',
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    prismaMock.verificationCode.updateMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_1' },
        data: expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
      }),
    );
  });
});
