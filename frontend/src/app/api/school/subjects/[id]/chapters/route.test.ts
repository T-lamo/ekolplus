// Annual programme chapters (programme-annuel.md) — GET lists the active
// year's terms + chapters, POST appends to a term with order = last + 1.
// prismaMock first (auto-hoists vi.mock for '@/lib/server/prisma').
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
import { PUT as REORDER } from './reorder/route';
import { PATCH, DELETE } from './[chapterId]/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);

const authUser = { user: { sub: 'user_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };
const params = (id = 'subj_1') => ({ params: Promise.resolve({ id }) });
const chapterParams = (chapterId = 'ch_1', id = 'subj_1') => ({
  params: Promise.resolve({ id, chapterId }),
});

const activeYear = {
  id: 'year_1',
  label: '2024-2025',
  terms: [
    {
      id: 'term_1',
      label: '1er Trimestre',
      order: 1,
      startDate: new Date('2024-09-01'),
      endDate: new Date('2024-12-20'),
      type: 'TRIMESTRE',
    },
    {
      id: 'term_2',
      label: '2ème Trimestre',
      order: 2,
      startDate: new Date('2025-01-06'),
      endDate: new Date('2025-03-28'),
      type: 'TRIMESTRE',
    },
  ],
};

function req(method: string, url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(adminSchool);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.all(cb as Promise<unknown>[]) as Promise<unknown>;
  });
});

describe('GET /api/school/subjects/[id]/chapters', () => {
  it('returns the active year terms and the subject chapters', async () => {
    prismaMock.subject.findFirst.mockResolvedValue({ id: 'subj_1', name: 'Maths' } as never);
    prismaMock.academicYear.findFirst.mockResolvedValue(activeYear as never);
    prismaMock.subjectChapter.findMany.mockResolvedValue([
      { id: 'ch_1', subjectId: 'subj_1', termId: 'term_1', order: 1, title: 'Ensembles' },
    ] as never);

    const res = await GET(req('GET', '/api/school/subjects/subj_1/chapters'), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activeYear).toEqual({ id: 'year_1', label: '2024-2025' });
    expect(body.terms).toHaveLength(2);
    expect(body.chapters[0].title).toBe('Ensembles');
    // Only chapters of the active year's terms are queried.
    expect(prismaMock.subjectChapter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subjectId: 'subj_1', termId: { in: ['term_1', 'term_2'] } },
      }),
    );
  });

  it('404s for a subject outside the caller school', async () => {
    prismaMock.subject.findFirst.mockResolvedValue(null);
    const res = await GET(req('GET', '/api/school/subjects/other/chapters'), params('other'));
    expect(res.status).toBe(404);
    expect(prismaMock.subjectChapter.findMany).not.toHaveBeenCalled();
  });

  it('bubbles the auth failure', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const res = await GET(req('GET', '/api/school/subjects/subj_1/chapters'), params());
    expect(res.status).toBe(401);
  });
});

describe('POST /api/school/subjects/[id]/chapters', () => {
  it('appends a chapter with order = last + 1 (201)', async () => {
    prismaMock.subject.findFirst.mockResolvedValue({ id: 'subj_1', name: 'Maths' } as never);
    prismaMock.academicYear.findFirst.mockResolvedValue(activeYear as never);
    prismaMock.subjectChapter.findFirst.mockResolvedValue({ order: 3 } as never);
    prismaMock.subjectChapter.create.mockResolvedValue({
      id: 'ch_4',
      subjectId: 'subj_1',
      termId: 'term_1',
      order: 4,
      title: 'Nouveau chapitre',
    } as never);

    const res = await POST(
      req('POST', '/api/school/subjects/subj_1/chapters', {
        termId: 'term_1',
        title: 'Nouveau chapitre',
      }),
      params(),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.subjectChapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subjectId: 'subj_1', termId: 'term_1', order: 4 }),
      }),
    );
  });

  it('refuses a termId that is not part of the active year (400)', async () => {
    prismaMock.subject.findFirst.mockResolvedValue({ id: 'subj_1', name: 'Maths' } as never);
    prismaMock.academicYear.findFirst.mockResolvedValue(activeYear as never);
    const res = await POST(
      req('POST', '/api/school/subjects/subj_1/chapters', { termId: 'term_old', title: 'X' }),
      params(),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.subjectChapter.create).not.toHaveBeenCalled();
  });

  it('MEMBER cannot write (404, existence not leaked)', async () => {
    mockResolveMySchool.mockResolvedValue(memberSchool);
    const res = await POST(
      req('POST', '/api/school/subjects/subj_1/chapters', { termId: 'term_1', title: 'X' }),
      params(),
    );
    expect(res.status).toBe(404);
  });

  it('CSRF failure short-circuits', async () => {
    mockVerifyCsrf.mockReturnValue(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const res = await POST(
      req('POST', '/api/school/subjects/subj_1/chapters', { termId: 'term_1', title: 'X' }),
      params(),
    );
    expect(res.status).toBe(403);
  });
});

describe('PATCH / DELETE /api/school/subjects/[id]/chapters/[chapterId]', () => {
  it('PATCH updates only the provided fields', async () => {
    prismaMock.subjectChapter.findFirst.mockResolvedValue({ id: 'ch_1' } as never);
    prismaMock.subjectChapter.update.mockResolvedValue({
      id: 'ch_1',
      title: 'Algèbre',
      hours: 10,
    } as never);
    const res = await PATCH(
      req('PATCH', '/api/school/subjects/subj_1/chapters/ch_1', { title: 'Algèbre', hours: 10 }),
      chapterParams(),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.subjectChapter.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ch_1' }, data: { title: 'Algèbre', hours: 10 } }),
    );
  });

  it('PATCH 404s when the chapter belongs to another school/subject', async () => {
    prismaMock.subjectChapter.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      req('PATCH', '/api/school/subjects/subj_1/chapters/ch_x', { title: 'X' }),
      chapterParams('ch_x'),
    );
    expect(res.status).toBe(404);
    expect(prismaMock.subjectChapter.update).not.toHaveBeenCalled();
  });

  it('DELETE removes the chapter (204)', async () => {
    prismaMock.subjectChapter.findFirst.mockResolvedValue({ id: 'ch_1' } as never);
    prismaMock.subjectChapter.delete.mockResolvedValue({} as never);
    const res = await DELETE(
      req('DELETE', '/api/school/subjects/subj_1/chapters/ch_1'),
      chapterParams(),
    );
    expect(res.status).toBe(204);
    expect(prismaMock.subjectChapter.delete).toHaveBeenCalledWith({ where: { id: 'ch_1' } });
  });
});

describe('PUT /api/school/subjects/[id]/chapters/reorder', () => {
  it('renumbers the whole term sequence 1..n in one transaction', async () => {
    prismaMock.subject.findFirst.mockResolvedValue({ id: 'subj_1', name: 'Maths' } as never);
    prismaMock.subjectChapter.findMany.mockResolvedValue([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ] as never);
    prismaMock.subjectChapter.update.mockImplementation((({
      where,
      data,
    }: {
      where: { id: string };
      data: { order: number };
    }) => Promise.resolve({ id: where.id, order: data.order })) as never);
    const res = await REORDER(
      req('PUT', '/api/school/subjects/subj_1/chapters/reorder', {
        termId: 'term_1',
        ids: ['c', 'a', 'b'],
      }),
      params(),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const calls = prismaMock.subjectChapter.update.mock.calls.map((c) => c[0]);
    expect(calls).toEqual([
      expect.objectContaining({ where: { id: 'c' }, data: { order: 1 } }),
      expect.objectContaining({ where: { id: 'a' }, data: { order: 2 } }),
      expect.objectContaining({ where: { id: 'b' }, data: { order: 3 } }),
    ]);
  });

  it('refuses a partial or duplicated id list (400, no write)', async () => {
    prismaMock.subject.findFirst.mockResolvedValue({ id: 'subj_1', name: 'Maths' } as never);
    prismaMock.subjectChapter.findMany.mockResolvedValue([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ] as never);
    const partial = await REORDER(
      req('PUT', '/api/school/subjects/subj_1/chapters/reorder', {
        termId: 'term_1',
        ids: ['a', 'b'],
      }),
      params(),
    );
    expect(partial.status).toBe(400);
    const dup = await REORDER(
      req('PUT', '/api/school/subjects/subj_1/chapters/reorder', {
        termId: 'term_1',
        ids: ['a', 'a', 'b'],
      }),
      params(),
    );
    expect(dup.status).toBe(400);
    expect(prismaMock.subjectChapter.update).not.toHaveBeenCalled();
  });
});
