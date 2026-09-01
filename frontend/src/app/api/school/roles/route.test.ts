// /api/school/roles — staff role CRUD (OWNER/ADMIN only), gated by
// hasMinRole('ADMIN'), NOT by grants (spec 2026-09-01-permission-manager §8).
// prismaMock first (auto-hoists vi.mock for '@/lib/server/prisma'), then
// mock requireAuth + verifyCsrf + resolveMySchool — modeled on
// src/app/api/school/grade-levels/route.test.ts.
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
import { GET, POST } from './route';
import { PATCH, DELETE } from './[id]/route';

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

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const now = new Date('2026-09-01T00:00:00Z');
const roleRow = (
  overrides: Partial<{
    id: string;
    name: string;
    description: string | null;
    grants: string[];
    _count: { members: number };
  }> = {},
) => ({
  id: 'role_1',
  schoolId: 'school_1',
  name: 'Comptable',
  description: 'Gestion finance',
  grants: ['paiements.view'],
  createdAt: now,
  updatedAt: now,
  _count: { members: 3 },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(adminSchool);
});

describe('GET /api/school/roles', () => {
  it('propagates 401 from requireAuth', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }) as never,
    );
    const res = await GET(req('GET', '/api/school/roles'));
    expect(res.status).toBe(401);
  });

  it('no school membership → 404 NO_SCHOOL', async () => {
    mockResolveMySchool.mockResolvedValueOnce(null);
    const res = await GET(req('GET', '/api/school/roles'));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('NO_SCHOOL');
  });

  it('MEMBER → 403 FORBIDDEN', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    const res = await GET(req('GET', '/api/school/roles'));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('FORBIDDEN');
    expect(prismaMock.staffRole.findMany).not.toHaveBeenCalled();
  });

  it('200 — lists roles with memberCount + systemCounts (owners/admins)', async () => {
    prismaMock.staffRole.findMany.mockResolvedValue([roleRow()] as never);
    prismaMock.organizationMember.count.mockResolvedValueOnce(2).mockResolvedValueOnce(5);

    const res = await GET(req('GET', '/api/school/roles'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();

    const body = (await res.json()) as {
      roles: unknown[];
      systemCounts: { owners: number; admins: number };
    };
    expect(body.roles).toEqual([
      {
        id: 'role_1',
        name: 'Comptable',
        description: 'Gestion finance',
        grants: ['paiements.view'],
        memberCount: 3,
        updatedAt: now.toISOString(),
      },
    ]);
    expect(body.systemCounts).toEqual({ owners: 2, admins: 5 });

    expect(prismaMock.staffRole.findMany).toHaveBeenCalledWith({
      where: { schoolId: 'school_1' },
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });
    expect(prismaMock.organizationMember.count).toHaveBeenNthCalledWith(1, {
      where: { organizationId: 'org_1', role: 'OWNER' },
    });
    expect(prismaMock.organizationMember.count).toHaveBeenNthCalledWith(2, {
      where: { organizationId: 'org_1', role: 'ADMIN' },
    });
  });
});

describe('POST /api/school/roles', () => {
  it('missing CSRF → 403 short-circuits before auth', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await POST(req('POST', '/api/school/roles', { name: 'Comptable' }));
    expect(res.status).toBe(403);
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });

  it('empty / missing name → 400 VALIDATION_FAILED', async () => {
    for (const body of [{ name: '   ' }, {}]) {
      const res = await POST(req('POST', '/api/school/roles', body));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('VALIDATION_FAILED');
    }
    expect(prismaMock.staffRole.create).not.toHaveBeenCalled();
  });

  it('201 — grants passed through sanitizeGrants before create', async () => {
    prismaMock.staffRole.create.mockResolvedValue({
      id: 'role_2',
      schoolId: 'school_1',
      name: 'Comptable',
      description: null,
      grants: ['eleves.view'],
      createdAt: now,
      updatedAt: now,
    } as never);

    const res = await POST(
      req('POST', '/api/school/roles', { name: 'Comptable', grants: ['eleves.view', 'bogus'] }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.staffRole.create).toHaveBeenCalledWith({
      data: {
        schoolId: 'school_1',
        name: 'Comptable',
        description: null,
        grants: ['eleves.view'],
      },
    });
    const body = (await res.json()) as { role: { grants: string[] } };
    expect(body.role.grants).toEqual(['eleves.view']);
  });

  it('duplicate name (P2002, duck-typed) → 409 ROLE_NAME_TAKEN', async () => {
    prismaMock.staffRole.create.mockRejectedValue({ code: 'P2002' });
    const res = await POST(req('POST', '/api/school/roles', { name: 'Comptable' }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('ROLE_NAME_TAKEN');
  });
});

describe('PATCH /api/school/roles/[id]', () => {
  it("role not in caller's school → 404 NOT_FOUND (findFirst → null)", async () => {
    prismaMock.staffRole.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      req('PATCH', '/api/school/roles/role_x', { name: 'Autre' }),
      params('role_x'),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('NOT_FOUND');
    expect(prismaMock.staffRole.update).not.toHaveBeenCalled();
  });

  it('200 — name/description updated and grants re-sanitized', async () => {
    prismaMock.staffRole.findFirst.mockResolvedValue({ id: 'role_1' } as never);
    prismaMock.staffRole.update.mockResolvedValue({
      id: 'role_1',
      schoolId: 'school_1',
      name: 'Comptable Senior',
      description: 'Nouvelle description',
      grants: ['paiements.view'],
      createdAt: now,
      updatedAt: now,
    } as never);

    const res = await PATCH(
      req('PATCH', '/api/school/roles/role_1', {
        name: 'Comptable Senior',
        description: 'Nouvelle description',
        grants: ['paiements.view', 'bogus'],
      }),
      params('role_1'),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.staffRole.update).toHaveBeenCalledWith({
      where: { id: 'role_1' },
      data: {
        name: 'Comptable Senior',
        description: 'Nouvelle description',
        grants: ['paiements.view'],
      },
    });
    const body = (await res.json()) as { role: { name: string; grants: string[] } };
    expect(body.role.name).toBe('Comptable Senior');
    expect(body.role.grants).toEqual(['paiements.view']);
  });
});

describe('DELETE /api/school/roles/[id]', () => {
  it('deletes by id → 200 { ok: true }; 404 anti-leak like PATCH for another school', async () => {
    prismaMock.staffRole.findFirst.mockResolvedValueOnce({ id: 'role_1' } as never);
    prismaMock.staffRole.delete.mockResolvedValue({ id: 'role_1' } as never);
    let res = await DELETE(req('DELETE', '/api/school/roles/role_1'), params('role_1'));
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({ ok: true });
    expect(prismaMock.staffRole.delete).toHaveBeenCalledWith({ where: { id: 'role_1' } });

    prismaMock.staffRole.findFirst.mockResolvedValueOnce(null);
    res = await DELETE(req('DELETE', '/api/school/roles/role_x'), params('role_x'));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('NOT_FOUND');
  });
});
