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

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';

const authUser = { user: { sub: 'user_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };

function req(method: string, url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(authUser as never);
  vi.mocked(verifyCsrf).mockReturnValue(null);
  vi.mocked(resolveMySchool).mockResolvedValue(adminSchool);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

import { GET, PATCH } from './route';

const numericSubject = {
  id: 'subj_1',
  schoolId: 'school_1',
  name: 'Comportement',
  code: null,
  maxScore: 20,
  passingScore: 10,
  eliminatoryScore: null,
  evaluationMode: 'NUMERIC',
  ratingScale: [] as string[],
};
const qualitativeSubject = {
  ...numericSubject,
  evaluationMode: 'QUALITATIVE',
  ratingScale: ['Toujours', 'Souvent', 'Parfois', 'Jamais'],
};
const params = { params: Promise.resolve({ id: 'subj_1' }) };

function patch(body: unknown) {
  return PATCH(req('PATCH', '/api/school/subjects/subj_1', body), params);
}

describe('PATCH /api/school/subjects/[id] (qualitative profile)', () => {
  beforeEach(() => {
    prismaMock.subject.findUnique.mockResolvedValue(numericSubject as never);
    prismaMock.subject.update.mockResolvedValue({ id: 'subj_1' } as never);
  });

  it('writes a normalized scale when switching a fresh subject to QUALITATIVE', async () => {
    prismaMock.evaluation.count.mockResolvedValue(0);
    const res = await patch({ evaluationMode: 'QUALITATIVE', ratingScale: [' Oui ', 'Non'] });
    expect(res.status).toBe(200);
    expect(prismaMock.subject.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evaluationMode: 'QUALITATIVE',
          ratingScale: ['Oui', 'Non'],
        }),
      }),
    );
  });

  it('400s an invalid scale before touching the database', async () => {
    const res = await patch({ evaluationMode: 'QUALITATIVE', ratingScale: ['Seul'] });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'VALIDATION_FAILED' });
    expect(prismaMock.subject.update).not.toHaveBeenCalled();
  });

  it('409 SUBJECT_HAS_EVALUATIONS when evaluations exist', async () => {
    prismaMock.evaluation.count.mockResolvedValue(3);
    const res = await patch({ evaluationMode: 'QUALITATIVE', ratingScale: ['A', 'B'] });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'SUBJECT_HAS_EVALUATIONS' });
    expect(prismaMock.subject.update).not.toHaveBeenCalled();
  });

  it('409 SUBJECT_HAS_RATINGS when going back to NUMERIC with ratings', async () => {
    prismaMock.subject.findUnique.mockResolvedValue(qualitativeSubject as never);
    prismaMock.criteriaRating.count.mockResolvedValue(1);
    const res = await patch({ evaluationMode: 'NUMERIC' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'SUBJECT_HAS_RATINGS' });
  });

  it('409 SCALE_LEVEL_IN_USE when a removed level is ticked; renaming is free', async () => {
    prismaMock.subject.findUnique.mockResolvedValue(qualitativeSubject as never);
    prismaMock.criteriaRating.count.mockResolvedValue(1);
    const shrink = await patch({ ratingScale: ['Toujours', 'Souvent', 'Parfois'] });
    expect(shrink.status).toBe(409);
    expect(await shrink.json()).toMatchObject({ error: 'SCALE_LEVEL_IN_USE' });

    const rename = await patch({ ratingScale: ['Always', 'Often', 'Sometimes', 'Never'] });
    expect(rename.status).toBe(200);
    expect(prismaMock.subject.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ratingScale: ['Always', 'Often', 'Sometimes', 'Never'] }),
      }),
    );
  });

  it('a PATCH without mode/scale leaves both untouched', async () => {
    await patch({ name: 'Conduite' });
    const call = prismaMock.subject.update.mock.calls[0]?.[0];
    expect(call?.data).not.toHaveProperty('evaluationMode');
    expect(call?.data).not.toHaveProperty('ratingScale');
  });
});

describe('GET /api/school/subjects/[id]', () => {
  it('returns criteria in order plus hasRatings', async () => {
    prismaMock.subject.findFirst.mockResolvedValue({
      ...qualitativeSubject,
      responsibleTeacher: null,
      prerequisites: [],
      _count: { chapters: 0 },
      criteria: [
        { id: 'cr_1', label: 'Respecte les consignes', order: 0, _count: { ratings: 2 } },
        { id: 'cr_2', label: 'Partage', order: 1, _count: { ratings: 0 } },
      ],
    } as never);
    prismaMock.academicYear.findFirst.mockResolvedValue(null);
    prismaMock.class.findMany.mockResolvedValue([]);
    prismaMock.classSubject.findMany.mockResolvedValue([]);
    const res = await GET(req('GET', '/api/school/subjects/subj_1'), params);
    expect(res.status).toBe(200);
    const { subject } = await res.json();
    expect(subject.criteria).toEqual([
      { id: 'cr_1', label: 'Respecte les consignes', order: 0, ratingCount: 2 },
      { id: 'cr_2', label: 'Partage', order: 1, ratingCount: 0 },
    ]);
    expect(subject.hasRatings).toBe(true);
    expect(subject.ratingScale).toEqual(['Toujours', 'Souvent', 'Parfois', 'Jamais']);
  });
});
