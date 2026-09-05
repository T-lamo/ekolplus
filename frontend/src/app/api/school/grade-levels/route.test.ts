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
vi.mock('@/lib/server/school-permissions', () => ({ requireSchoolPermission: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import {
  deniedSchoolPermission,
  passThroughSchoolPermission,
} from '@/test-utils/school-permission-mock';
import { GET, POST } from './route';
import { PATCH, DELETE } from './[id]/route';
import { POST as REORDER } from './reorder/route';

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
const row = (
  id: string,
  name: string,
  order: number,
  bulletinTemplateId: string | null = null,
) => ({
  id,
  schoolId: 'school_1',
  name,
  order,
  bulletinTemplateId,
  createdAt: now,
  updatedAt: now,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSchoolPermission).mockImplementation(
    passThroughSchoolPermission(mockResolveMySchool),
  );
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
      { id: 'l1', name: '6ème', order: 0, bulletinTemplateId: null },
      { id: 'l2', name: '5ème', order: 1, bulletinTemplateId: null },
    ] as never);
    const res = await GET(req('GET', '/api/school/grade-levels'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    const body = (await res.json()) as { levels: unknown[] };
    expect(body.levels).toEqual([
      { id: 'l1', name: '6ème', order: 0, bulletinTemplateId: null },
      { id: 'l2', name: '5ème', order: 1, bulletinTemplateId: null },
    ]);
    expect(prismaMock.gradeLevel.findMany).toHaveBeenCalledWith({
      where: { schoolId: 'school_1' },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, order: true, bulletinTemplateId: true },
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

  it('rôle sans configuration.create → 403 PERMISSION_DENIED', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    vi.mocked(requireSchoolPermission).mockResolvedValueOnce(deniedSchoolPermission());
    const res = await POST(req('POST', '/api/school/grade-levels', { name: '6ème' }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('PERMISSION_DENIED');
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

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('PATCH /api/school/grade-levels/[id]', () => {
  it('missing CSRF → 403', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await PATCH(
      req('PATCH', '/api/school/grade-levels/l1', { name: '6e' }),
      params('l1'),
    );
    expect(res.status).toBe(403);
  });

  it('rôle sans configuration.edit → 403 PERMISSION_DENIED', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    vi.mocked(requireSchoolPermission).mockResolvedValueOnce(deniedSchoolPermission());
    const res = await PATCH(
      req('PATCH', '/api/school/grade-levels/l1', { name: '6e' }),
      params('l1'),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('PERMISSION_DENIED');
    expect(prismaMock.gradeLevel.update).not.toHaveBeenCalled();
  });

  it("unknown id or another school's level → 404 NOT_FOUND", async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValueOnce(null);
    let res = await PATCH(
      req('PATCH', '/api/school/grade-levels/nope', { name: '6e' }),
      params('nope'),
    );
    expect(res.status).toBe(404);

    prismaMock.gradeLevel.findUnique.mockResolvedValueOnce({
      ...row('lx', '6ème', 0),
      schoolId: 'school_OTHER',
    } as never);
    res = await PATCH(req('PATCH', '/api/school/grade-levels/lx', { name: '6e' }), params('lx'));
    expect(res.status).toBe(404);
    expect(prismaMock.gradeLevel.update).not.toHaveBeenCalled();
  });

  it('invalid body → 400 VALIDATION_FAILED', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue(row('l1', '6ème', 0) as never);
    const res = await PATCH(
      req('PATCH', '/api/school/grade-levels/l1', { name: '' }),
      params('l1'),
    );
    expect(res.status).toBe(400);
  });

  it('renaming to a name used by ANOTHER level → 409 LEVEL_NAME_TAKEN', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue(row('l1', '6ème', 0) as never);
    prismaMock.gradeLevel.findFirst.mockResolvedValue(row('l2', '5ème', 1) as never);
    const res = await PATCH(
      req('PATCH', '/api/school/grade-levels/l1', { name: '5ème' }),
      params('l1'),
    );
    expect(res.status).toBe(409);
    expect(prismaMock.gradeLevel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: 'school_1', name: '5ème', NOT: { id: 'l1' } },
      }),
    );
    expect(prismaMock.gradeLevel.update).not.toHaveBeenCalled();
  });

  it('renames → 200 { level }', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue(row('l1', '6ème', 0) as never);
    prismaMock.gradeLevel.findFirst.mockResolvedValue(null);
    prismaMock.gradeLevel.update.mockResolvedValue(row('l1', 'Sixième', 0) as never);
    const res = await PATCH(
      req('PATCH', '/api/school/grade-levels/l1', { name: '  Sixième ' }),
      params('l1'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({
      level: { id: 'l1', name: 'Sixième', order: 0, bulletinTemplateId: null },
    });
    expect(prismaMock.gradeLevel.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { name: 'Sixième' },
    });
  });

  it('empty body (no name, no bulletinTemplateId) → 400 VALIDATION_FAILED', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue(row('l1', '6ème', 0) as never);
    const res = await PATCH(req('PATCH', '/api/school/grade-levels/l1', {}), params('l1'));
    expect(res.status).toBe(400);
    expect(prismaMock.gradeLevel.update).not.toHaveBeenCalled();
  });

  it('unknown bulletinTemplateId → 404 TEMPLATE_NOT_FOUND', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue(row('l1', '6ème', 0) as never);
    prismaMock.bulletinTemplate.findUnique.mockResolvedValue(null);
    const res = await PATCH(
      req('PATCH', '/api/school/grade-levels/l1', { bulletinTemplateId: 'nope' }),
      params('l1'),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('TEMPLATE_NOT_FOUND');
    expect(prismaMock.gradeLevel.update).not.toHaveBeenCalled();
  });

  it("another school's own (non-global) template → 404 TEMPLATE_NOT_FOUND", async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue(row('l1', '6ème', 0) as never);
    prismaMock.bulletinTemplate.findUnique.mockResolvedValue({
      id: 'tpl1',
      schoolId: 'school_OTHER',
    } as never);
    const res = await PATCH(
      req('PATCH', '/api/school/grade-levels/l1', { bulletinTemplateId: 'tpl1' }),
      params('l1'),
    );
    expect(res.status).toBe(404);
    expect(prismaMock.gradeLevel.update).not.toHaveBeenCalled();
  });

  it('a global template is accepted → 200, bulletinTemplateId set', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue(row('l1', '6ème', 0) as never);
    prismaMock.bulletinTemplate.findUnique.mockResolvedValue({
      id: 'tpl-global',
      schoolId: null,
    } as never);
    prismaMock.gradeLevel.update.mockResolvedValue(row('l1', '6ème', 0, 'tpl-global') as never);
    const res = await PATCH(
      req('PATCH', '/api/school/grade-levels/l1', { bulletinTemplateId: 'tpl-global' }),
      params('l1'),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.gradeLevel.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { bulletinTemplateId: 'tpl-global' },
    });
  });

  it("the school's own template is accepted → 200, bulletinTemplateId set", async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue(row('l1', '6ème', 0) as never);
    prismaMock.bulletinTemplate.findUnique.mockResolvedValue({
      id: 'tpl-own',
      schoolId: 'school_1',
    } as never);
    prismaMock.gradeLevel.update.mockResolvedValue(row('l1', '6ème', 0, 'tpl-own') as never);
    const res = await PATCH(
      req('PATCH', '/api/school/grade-levels/l1', { bulletinTemplateId: 'tpl-own' }),
      params('l1'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({
      level: { id: 'l1', name: '6ème', order: 0, bulletinTemplateId: 'tpl-own' },
    });
    expect(prismaMock.gradeLevel.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { bulletinTemplateId: 'tpl-own' },
    });
  });

  it('bulletinTemplateId: null clears the assignment → 200', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue(row('l1', '6ème', 0, 'tpl-global') as never);
    prismaMock.gradeLevel.update.mockResolvedValue(row('l1', '6ème', 0, null) as never);
    const res = await PATCH(
      req('PATCH', '/api/school/grade-levels/l1', { bulletinTemplateId: null }),
      params('l1'),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.gradeLevel.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { bulletinTemplateId: null },
    });
  });
});

describe('DELETE /api/school/grade-levels/[id]', () => {
  it('missing CSRF → 403', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await DELETE(req('DELETE', '/api/school/grade-levels/l1'), params('l1'));
    expect(res.status).toBe(403);
  });

  it('rôle sans configuration.delete → 403 PERMISSION_DENIED', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    vi.mocked(requireSchoolPermission).mockResolvedValueOnce(deniedSchoolPermission());
    const res = await DELETE(req('DELETE', '/api/school/grade-levels/l1'), params('l1'));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('PERMISSION_DENIED');
    expect(prismaMock.gradeLevel.delete).not.toHaveBeenCalled();
  });

  it("another school's level → 404 NOT_FOUND", async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValueOnce({
      ...row('lx', '6ème', 0),
      schoolId: 'school_OTHER',
    } as never);
    const res = await DELETE(req('DELETE', '/api/school/grade-levels/lx'), params('lx'));
    expect(res.status).toBe(404);
    expect(prismaMock.gradeLevel.delete).not.toHaveBeenCalled();
  });

  it('deletes → 204', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue(row('l1', '6ème', 0) as never);
    prismaMock.gradeLevel.delete.mockResolvedValue(row('l1', '6ème', 0) as never);
    const res = await DELETE(req('DELETE', '/api/school/grade-levels/l1'), params('l1'));
    expect(res.status).toBe(204);
    expect(prismaMock.gradeLevel.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
  });
});

describe('POST /api/school/grade-levels/reorder', () => {
  const existing = [row('l1', '6ème', 0), row('l2', '5ème', 1), row('l3', '4ème', 2)];

  beforeEach(() => {
    prismaMock.gradeLevel.findMany.mockResolvedValue(existing as never);
    prismaMock.$transaction.mockResolvedValue([] as never);
  });

  it('missing CSRF → 403', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await REORDER(
      req('POST', '/api/school/grade-levels/reorder', { orderedIds: ['l1', 'l2', 'l3'] }),
    );
    expect(res.status).toBe(403);
  });

  it('rôle sans configuration.edit → 403 PERMISSION_DENIED', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    vi.mocked(requireSchoolPermission).mockResolvedValueOnce(deniedSchoolPermission());
    const res = await REORDER(
      req('POST', '/api/school/grade-levels/reorder', { orderedIds: ['l1', 'l2', 'l3'] }),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('PERMISSION_DENIED');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('non-array / empty body → 400 VALIDATION_FAILED', async () => {
    for (const body of [{}, { orderedIds: 'l1' }, { orderedIds: [] }]) {
      const res = await REORDER(req('POST', '/api/school/grade-levels/reorder', body));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('VALIDATION_FAILED');
    }
  });

  it('missing / extra / duplicate ids → 400 INVALID_LEVEL_SET', async () => {
    for (const orderedIds of [
      ['l1', 'l2'], // missing l3
      ['l1', 'l2', 'l3', 'l9'], // extra
      ['l1', 'l2', 'l2'], // duplicate (same length as existing)
    ]) {
      const res = await REORDER(req('POST', '/api/school/grade-levels/reorder', { orderedIds }));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('INVALID_LEVEL_SET');
    }
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rewrites order = array index in one $transaction → 200 { levels }', async () => {
    const res = await REORDER(
      req('POST', '/api/school/grade-levels/reorder', { orderedIds: ['l3', 'l1', 'l2'] }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({
      levels: [
        { id: 'l3', name: '4ème', order: 0 },
        { id: 'l1', name: '6ème', order: 1 },
        { id: 'l2', name: '5ème', order: 2 },
      ],
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.gradeLevel.update).toHaveBeenCalledTimes(3);
    expect(prismaMock.gradeLevel.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'l3' },
      data: { order: 0 },
    });
    expect(prismaMock.gradeLevel.update).toHaveBeenNthCalledWith(3, {
      where: { id: 'l2' },
      data: { order: 2 },
    });
  });
});
