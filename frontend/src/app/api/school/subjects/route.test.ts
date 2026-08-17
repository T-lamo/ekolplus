// Subject catalog + creation with the full profile (add-matiere.md).
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
import { PATCH } from './[id]/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);

const authUser = { user: { sub: 'user_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };

function req(method: string, url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const createdRow = {
  id: 'subj_new',
  name: 'Physique',
  code: 'PHY-001',
  domain: 'Sciences',
  isActive: true,
  status: 'ACTIVE',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(adminSchool);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('GET /api/school/subjects', () => {
  it('excludes DRAFT subjects by default and includes them with ?includeDrafts=1', async () => {
    prismaMock.subject.findMany.mockResolvedValue([]);
    await GET(req('GET', '/api/school/subjects'));
    expect(prismaMock.subject.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { schoolId: 'school_1', status: { not: 'DRAFT' } },
      }),
    );
    await GET(req('GET', '/api/school/subjects?includeDrafts=1'));
    expect(prismaMock.subject.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { schoolId: 'school_1' } }),
    );
  });

  it('flattens the pivot into classes / teacherNames / coefficients', async () => {
    prismaMock.subject.findMany.mockResolvedValue([
      {
        ...createdRow,
        classSubjects: [
          { coefficient: 4, class: { id: 'c1', name: '3ème A' }, teacher: { name: 'M. Dupont' } },
          { coefficient: null, class: { id: 'c2', name: '4ème B' }, teacher: null },
        ],
      },
    ] as never);
    const res = await GET(req('GET', '/api/school/subjects'));
    const { subjects } = await res.json();
    expect(subjects[0].classes).toEqual([
      { id: 'c1', name: '3ème A' },
      { id: 'c2', name: '4ème B' },
    ]);
    expect(subjects[0].teacherNames).toEqual(['M. Dupont']);
    expect(subjects[0].coefficients).toEqual([4]);
    expect(subjects[0].status).toBe('ACTIVE');
  });
});

describe('POST /api/school/subjects', () => {
  it('creates the subject with its profile and attaches the quick-picked classes in one tx', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({ schoolId: 'school_1' } as never);
    prismaMock.class.count.mockResolvedValue(2);
    prismaMock.subject.count.mockResolvedValue(0);
    prismaMock.subject.create.mockResolvedValue(createdRow as never);
    prismaMock.classSubject.createMany.mockResolvedValue({ count: 2 });

    const res = await POST(
      req('POST', '/api/school/subjects', {
        name: 'Physique',
        code: 'PHY-001',
        domain: 'Sciences',
        defaultCoefficient: 3,
        maxScore: 20,
        passingScore: 10,
        responsibleTeacherId: 'teach_1',
        icon: 'atom',
        color: '#00897b',
        status: 'ACTIVE',
        classIds: ['c1', 'c2'],
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.subject.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: 'school_1',
          name: 'Physique',
          code: 'PHY-001',
          defaultCoefficient: 3,
          icon: 'atom',
          color: '#00897b',
          status: 'ACTIVE',
          isActive: true,
        }),
      }),
    );
    expect(prismaMock.classSubject.createMany).toHaveBeenCalledWith({
      data: [
        { classId: 'c1', subjectId: 'subj_new', coefficient: 3 },
        { classId: 'c2', subjectId: 'subj_new', coefficient: 3 },
      ],
      skipDuplicates: true,
    });
  });

  it('DRAFT status derives isActive=true, ARCHIVED derives isActive=false', async () => {
    prismaMock.subject.count.mockResolvedValue(0);
    prismaMock.subject.create.mockResolvedValue(createdRow as never);
    await POST(req('POST', '/api/school/subjects', { name: 'Brouillon', status: 'DRAFT' }));
    expect(prismaMock.subject.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DRAFT', isActive: true }),
      }),
    );
    await POST(req('POST', '/api/school/subjects', { name: 'Vieille', status: 'ARCHIVED' }));
    expect(prismaMock.subject.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ARCHIVED', isActive: false }),
      }),
    );
  });

  it('409 SUBJECT_CODE_TAKEN when the code already exists in the school', async () => {
    prismaMock.subject.count.mockResolvedValue(1);
    const res = await POST(req('POST', '/api/school/subjects', { name: 'Maths', code: 'MAT-001' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('SUBJECT_CODE_TAKEN');
    expect(prismaMock.subject.create).not.toHaveBeenCalled();
  });

  it('400 when passingScore exceeds maxScore', async () => {
    const res = await POST(
      req('POST', '/api/school/subjects', { name: 'Maths', maxScore: 10, passingScore: 12 }),
    );
    expect(res.status).toBe(400);
  });

  it('400 when the responsible teacher belongs to another school', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({ schoolId: 'school_other' } as never);
    const res = await POST(
      req('POST', '/api/school/subjects', { name: 'Maths', responsibleTeacherId: 'teach_x' }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.subject.create).not.toHaveBeenCalled();
  });

  it('CSRF failure short-circuits', async () => {
    mockVerifyCsrf.mockReturnValue(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const res = await POST(req('POST', '/api/school/subjects', { name: 'Maths' }));
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/school/subjects/[id]', () => {
  const existing = {
    id: 'subj_1',
    schoolId: 'school_1',
    code: 'MAT-001',
    maxScore: 20,
    passingScore: 10,
    eliminatoryScore: null,
  };

  it('replaces the prerequisite set and syncs isActive from status', async () => {
    prismaMock.subject.findUnique.mockResolvedValue(existing as never);
    prismaMock.subject.count.mockResolvedValue(2);
    prismaMock.subject.update.mockResolvedValue({
      ...createdRow,
      status: 'ARCHIVED',
      isActive: false,
    } as never);
    const res = await PATCH(
      req('PATCH', '/api/school/subjects/subj_1', {
        status: 'ARCHIVED',
        prerequisiteIds: ['p1', 'p2'],
      }),
      { params: Promise.resolve({ id: 'subj_1' }) },
    );
    expect(res.status).toBe(200);
    expect(prismaMock.subject.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'subj_1' },
        data: expect.objectContaining({
          status: 'ARCHIVED',
          isActive: false,
          prerequisites: { set: [{ id: 'p1' }, { id: 'p2' }] },
        }),
      }),
    );
  });

  it('refuses a subject as its own prerequisite (400)', async () => {
    prismaMock.subject.findUnique.mockResolvedValue(existing as never);
    const res = await PATCH(
      req('PATCH', '/api/school/subjects/subj_1', { prerequisiteIds: ['subj_1'] }),
      { params: Promise.resolve({ id: 'subj_1' }) },
    );
    expect(res.status).toBe(400);
    expect(prismaMock.subject.update).not.toHaveBeenCalled();
  });
});
