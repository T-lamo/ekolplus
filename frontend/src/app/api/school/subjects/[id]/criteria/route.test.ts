// Criteria CRUD + reorder routes. prismaMock first (auto-hoists vi.mock for
// '@/lib/server/prisma'). School route preamble: requireAuth → requireSchoolPermission.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, beforeEach, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/server/school-permissions', () => ({
  requireSchoolPermission: vi.fn(),
}));

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { GET, POST } from './route';
import { PATCH, DELETE } from './[criterionId]/route';
import { PUT } from './reorder/route';

const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireSchoolPermission = vi.mocked(requireSchoolPermission);

function req(method: string, url: string, body?: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const subjectParams = { params: Promise.resolve({ id: 'subj_1' }) };
const criterionParams = { params: Promise.resolve({ id: 'subj_1', criterionId: 'cr_1' }) };
const ownedSubject = { id: 'subj_1' };
const rows = [
  { id: 'cr_1', label: 'Respecte les consignes', order: 0 },
  { id: 'cr_2', label: 'Partage avec les autres', order: 1 },
];

beforeEach(() => {
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue({ user: { sub: 'user_1' } } as never);
  mockRequireSchoolPermission.mockResolvedValue({
    ok: true,
    mySchool: { schoolId: 'school_1' },
    response: null,
  } as never);
  prismaMock.subject.findFirst.mockResolvedValue(ownedSubject as never);
  prismaMock.subjectCriterion.findMany.mockResolvedValue(rows as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('GET /api/school/subjects/[id]/criteria', () => {
  it('404s a subject of another school', async () => {
    prismaMock.subject.findFirst.mockResolvedValue(null);
    const res = await GET(req('GET', '/api/school/subjects/subj_1/criteria'), subjectParams);
    expect(res.status).toBe(404);
    expect(prismaMock.subject.findFirst).toHaveBeenCalledWith({
      where: { id: 'subj_1', schoolId: 'school_1' },
      select: { id: true },
    });
  });

  it('lists the criteria in order', async () => {
    const res = await GET(req('GET', '/api/school/subjects/subj_1/criteria'), subjectParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ criteria: rows });
    expect(prismaMock.subjectCriterion.findMany).toHaveBeenCalledWith({
      where: { subjectId: 'subj_1' },
      orderBy: { order: 'asc' },
      select: { id: true, label: true, order: true },
    });
  });
});

describe('POST /api/school/subjects/[id]/criteria', () => {
  it('400s an empty or over-long label', async () => {
    expect(
      (
        await POST(
          req('POST', '/api/school/subjects/subj_1/criteria', { label: '   ' }),
          subjectParams,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          req('POST', '/api/school/subjects/subj_1/criteria', { label: 'x'.repeat(81) }),
          subjectParams,
        )
      ).status,
    ).toBe(400);
    expect(prismaMock.subjectCriterion.create).not.toHaveBeenCalled();
  });

  it('appends after the last criterion (order = last + 1, 0 when none)', async () => {
    prismaMock.subjectCriterion.findFirst.mockResolvedValue({ order: 4 } as never);
    prismaMock.subjectCriterion.create.mockResolvedValue({
      id: 'cr_new',
      label: 'Range son matériel',
      order: 5,
    } as never);
    const res = await POST(
      req('POST', '/api/school/subjects/subj_1/criteria', { label: '  Range son matériel ' }),
      subjectParams,
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      criterion: { id: 'cr_new', label: 'Range son matériel', order: 5 },
    });
    expect(prismaMock.subjectCriterion.create).toHaveBeenCalledWith({
      data: { subjectId: 'subj_1', label: 'Range son matériel', order: 5 },
      select: { id: true, label: true, order: true },
    });

    prismaMock.subjectCriterion.findFirst.mockResolvedValue(null);
    await POST(
      req('POST', '/api/school/subjects/subj_1/criteria', { label: 'Premier' }),
      subjectParams,
    );
    expect(prismaMock.subjectCriterion.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { subjectId: 'subj_1', label: 'Premier', order: 0 } }),
    );
  });
});

describe('PATCH/DELETE /api/school/subjects/[id]/criteria/[criterionId]', () => {
  it('404s a criterion that is not on this subject', async () => {
    prismaMock.subjectCriterion.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      req('PATCH', '/api/school/subjects/subj_1/criteria/cr_1', { label: 'Nouveau' }),
      criterionParams,
    );
    expect(res.status).toBe(404);
    expect(prismaMock.subjectCriterion.findFirst).toHaveBeenCalledWith({
      where: { id: 'cr_1', subjectId: 'subj_1' },
      select: { id: true },
    });
  });

  it('renames a criterion', async () => {
    prismaMock.subjectCriterion.findFirst.mockResolvedValue({ id: 'cr_1' } as never);
    prismaMock.subjectCriterion.update.mockResolvedValue({
      id: 'cr_1',
      label: 'Nouveau',
      order: 0,
    } as never);
    const res = await PATCH(
      req('PATCH', '/api/school/subjects/subj_1/criteria/cr_1', { label: ' Nouveau ' }),
      criterionParams,
    );
    expect(res.status).toBe(200);
    expect(prismaMock.subjectCriterion.update).toHaveBeenCalledWith({
      where: { id: 'cr_1' },
      data: { label: 'Nouveau' },
      select: { id: true, label: true, order: true },
    });
  });

  it('409 CRITERION_IN_USE when a rating references it, deletes otherwise', async () => {
    prismaMock.subjectCriterion.findFirst.mockResolvedValue({ id: 'cr_1' } as never);
    prismaMock.criteriaRating.count.mockResolvedValue(1);
    const blocked = await DELETE(
      req('DELETE', '/api/school/subjects/subj_1/criteria/cr_1'),
      criterionParams,
    );
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ error: 'CRITERION_IN_USE' });
    expect(prismaMock.subjectCriterion.delete).not.toHaveBeenCalled();

    prismaMock.criteriaRating.count.mockResolvedValue(0);
    const ok = await DELETE(
      req('DELETE', '/api/school/subjects/subj_1/criteria/cr_1'),
      criterionParams,
    );
    expect(ok.status).toBe(200);
    expect(prismaMock.subjectCriterion.delete).toHaveBeenCalledWith({ where: { id: 'cr_1' } });
  });
});

describe('PUT /api/school/subjects/[id]/criteria/reorder', () => {
  it('400s unless ids is exactly the current set', async () => {
    prismaMock.subjectCriterion.findMany.mockResolvedValueOnce([
      { id: 'cr_1' },
      { id: 'cr_2' },
    ] as never);
    const res = await PUT(
      req('PUT', '/api/school/subjects/subj_1/criteria/reorder', { ids: ['cr_2', 'cr_ghost'] }),
      subjectParams,
    );
    expect(res.status).toBe(400);
    expect(prismaMock.subjectCriterion.update).not.toHaveBeenCalled();
  });

  it('writes order = index and returns the new list', async () => {
    prismaMock.subjectCriterion.findMany
      .mockResolvedValueOnce([{ id: 'cr_1' }, { id: 'cr_2' }] as never)
      .mockResolvedValueOnce([rows[1], rows[0]] as never);
    const res = await PUT(
      req('PUT', '/api/school/subjects/subj_1/criteria/reorder', { ids: ['cr_2', 'cr_1'] }),
      subjectParams,
    );
    expect(res.status).toBe(200);
    expect(prismaMock.subjectCriterion.update).toHaveBeenCalledWith({
      where: { id: 'cr_2' },
      data: { order: 0 },
    });
    expect(prismaMock.subjectCriterion.update).toHaveBeenCalledWith({
      where: { id: 'cr_1' },
      data: { order: 1 },
    });
    expect(await res.json()).toEqual({ criteria: [rows[1], rows[0]] });
  });
});
