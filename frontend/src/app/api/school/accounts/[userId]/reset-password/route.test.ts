// prismaMock first — auto-hoists the vi.mock('@/lib/server/prisma', ...) call.
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
vi.mock('@/lib/server/school-accounts', () => ({ requireAccountAccess: vi.fn() }));
vi.mock('@/lib/server/initial-password', () => ({
  generateInitialPassword: vi.fn(() => 'TempPass123'),
}));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';
import { requireAccountAccess } from '@/lib/server/school-accounts';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);
const mockRequireAccountAccess = vi.mocked(requireAccountAccess);

const authUser = { user: { sub: 'admin_1', email: 'admin@test.local' } };
const ownerSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'OWNER' as const };

function req() {
  return new NextRequest('http://localhost/api/school/accounts/u1/reset-password', {
    method: 'POST',
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

describe('POST /api/school/accounts/[userId]/reset-password', () => {
  it('404s a caller with no school', async () => {
    mockResolveMySchool.mockResolvedValue(null);
    const res = await POST(req(), params);
    expect(res.status).toBe(404);
  });

  it('propagates a denied access resolution', async () => {
    mockRequireAccountAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'PERMISSION_DENIED', message: 'no' }, { status: 403 }),
    });
    const res = await POST(req(), params);
    expect(res.status).toBe(403);
  });

  it('400s ACCOUNT_HAS_EMAIL when the account has an email on file', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: 'gina@school.test' } as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('ACCOUNT_HAS_EMAIL');
  });

  it('generates and returns a new password once, bumping tokenVersion', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: null } as never);
    prismaMock.user.update.mockResolvedValue({} as never);

    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, temporaryPassword: 'TempPass123' });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        passwordHash: expect.any(String),
        tokenVersion: { increment: 1 },
        passwordChangedAt: expect.any(Date),
      },
    });
  });
});
