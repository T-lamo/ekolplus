// /api/school/grade-levels — per-school ordered catalog of grade levels
// (spec: docs/superpowers/specs/2026-08-17-grade-level-ordering-design.md).
// prismaMock first (auto-hoists vi.mock for '@/lib/server/prisma'), then
// mock requireAuth + verifyCsrf + resolveMySchool — modeled on
// src/app/api/school/subjects/route.test.ts.
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

const now = new Date('2026-08-17T00:00:00Z');
const row = (id: string, name: string, order: number) => ({
  id,
  schoolId: 'school_1',
  name,
  order,
  createdAt: now,
  updatedAt: now,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(adminSchool);
});

describe('GET /api/school/grade-levels', () => {
  it('propagates 401 from requireAuth', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }) as never,
    );
    const res = await GET(req('GET', '/api/school/grade-levels'));
    expect(res.status).toBe(401);
  });

  it('no school membership → 404 NO_SCHOOL', async () => {
    mockResolveMySchool.mockResolvedValueOnce(null);
    const res = await GET(req('GET', '/api/school/grade-levels'));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('NO_SCHOOL');
  });

  it('MEMBER can read; levels come back ordered by `order asc` with id/name/order only', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    // The route `select`s id/name/order — mock what Prisma would hand back
    // for that select (the mock doesn't apply `select` itself).
    prismaMock.gradeLevel.findMany.mockResolvedValue([
      { id: 'l1', name: '6ème', order: 0 },
      { id: 'l2', name: '5ème', order: 1 },
    ] as never);
    const res = await GET(req('GET', '/api/school/grade-levels'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    const body = (await res.json()) as { levels: unknown[] };
    expect(body.levels).toEqual([
      { id: 'l1', name: '6ème', order: 0 },
      { id: 'l2', name: '5ème', order: 1 },
    ]);
    expect(prismaMock.gradeLevel.findMany).toHaveBeenCalledWith({
      where: { schoolId: 'school_1' },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, order: true },
    });
  });
});

describe('POST /api/school/grade-levels', () => {
  it('missing CSRF → 403 short-circuits before auth', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await POST(req('POST', '/api/school/grade-levels', { name: '6ème' }));
    expect(res.status).toBe(403);
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });

  it('MEMBER → 403 ORG_ROLE_INSUFFICIENT', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    const res = await POST(req('POST', '/api/school/grade-levels', { name: '6ème' }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('ORG_ROLE_INSUFFICIENT');
    expect(prismaMock.gradeLevel.create).not.toHaveBeenCalled();
  });

  it('empty / too-long / missing name → 400 VALIDATION_FAILED', async () => {
    for (const body of [{ name: '   ' }, { name: 'x'.repeat(41) }, {}]) {
      const res = await POST(req('POST', '/api/school/grade-levels', body));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('VALIDATION_FAILED');
    }
    expect(prismaMock.gradeLevel.create).not.toHaveBeenCalled();
  });

  it('name already used in this school → 409 LEVEL_NAME_TAKEN', async () => {
    prismaMock.gradeLevel.findFirst.mockResolvedValue(row('l1', '6ème', 0) as never);
    const res = await POST(req('POST', '/api/school/grade-levels', { name: ' 6ème ' }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('LEVEL_NAME_TAKEN');
    expect(prismaMock.gradeLevel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: 'school_1', name: '6ème' } }),
    );
    expect(prismaMock.gradeLevel.create).not.toHaveBeenCalled();
  });

  it('appends at max(order)+1 → 201 { level }', async () => {
    prismaMock.gradeLevel.findFirst.mockResolvedValue(null);
    prismaMock.gradeLevel.aggregate.mockResolvedValue({ _max: { order: 4 } } as never);
    prismaMock.gradeLevel.create.mockResolvedValue(row('l6', '2nde', 5) as never);
    const res = await POST(req('POST', '/api/school/grade-levels', { name: '2nde' }));
    expect(res.status).toBe(201);
    expect((await res.json()) as unknown).toEqual({ level: { id: 'l6', name: '2nde', order: 5 } });
    expect(prismaMock.gradeLevel.create).toHaveBeenCalledWith({
      data: { schoolId: 'school_1', name: '2nde', order: 5 },
    });
  });

  it('first level of a school gets order 0', async () => {
    prismaMock.gradeLevel.findFirst.mockResolvedValue(null);
    prismaMock.gradeLevel.aggregate.mockResolvedValue({ _max: { order: null } } as never);
    prismaMock.gradeLevel.create.mockResolvedValue(row('l1', '6ème', 0) as never);
    const res = await POST(req('POST', '/api/school/grade-levels', { name: '6ème' }));
    expect(res.status).toBe(201);
    expect(prismaMock.gradeLevel.create).toHaveBeenCalledWith({
      data: { schoolId: 'school_1', name: '6ème', order: 0 },
    });
  });
});
