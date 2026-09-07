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
vi.mock('@/lib/server/initial-password', () => ({
  generateInitialPassword: vi.fn(() => 'TempPass123'),
}));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);

const authUser = { user: { sub: 'admin_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/school/teachers/t1/access', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: 't1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(adminSchool);
  prismaMock.$transaction.mockImplementation((async (cb: (tx: typeof prismaMock) => unknown) =>
    cb(prismaMock)) as never);
});

describe('POST /api/school/teachers/[id]/access', () => {
  it('404s when the teacher does not belong to this school', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'other',
      userId: null,
    } as never);
    const res = await POST(postReq({ username: 'marie.k' }), params);
    expect(res.status).toBe(404);
  });

  it('400s ACCOUNT_ALREADY_EXISTS when the teacher already has an account', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'school_1',
      userId: 'user_x',
    } as never);
    const res = await POST(postReq({ username: 'marie.k' }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('ACCOUNT_ALREADY_EXISTS');
  });

  it('400s VALIDATION_FAILED with field: username on an invalid format', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'school_1',
      userId: null,
    } as never);
    const res = await POST(postReq({ username: '1nvalid' }), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(body.field).toBe('username');
  });

  it('409s USERNAME_TAKEN when the username is already in use', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'school_1',
      userId: null,
    } as never);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'someone' } as never);
    const res = await POST(postReq({ username: 'marie.k' }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('USERNAME_TAKEN');
  });

  it('creates an active username account, links Teacher.userId, and returns temporaryPassword once', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'school_1',
      userId: null,
      name: 'Marie Kessa',
      phone: '+50931112222',
    } as never);
    prismaMock.user.findUnique.mockResolvedValue(null as never);
    prismaMock.user.create.mockResolvedValue({ id: 'user_new' } as never);
    prismaMock.organizationMember.create.mockResolvedValue({} as never);
    prismaMock.teacher.update.mockResolvedValue({} as never);

    const res = await POST(postReq({ username: 'marie.k' }), params);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ ok: true, userId: 'user_new', temporaryPassword: 'TempPass123' });
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        username: 'marie.k',
        name: 'Marie Kessa',
        phone: '+50931112222',
        passwordHash: expect.any(String),
      },
    });
    expect(prismaMock.organizationMember.create).toHaveBeenCalledWith({
      data: { organizationId: 'org_1', userId: 'user_new', role: 'MEMBER' },
    });
    expect(prismaMock.teacher.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { userId: 'user_new' },
    });
  });
});
