import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return {
    ...actual,
    resolveMySchoolIncludingTeacher: vi.fn(),
    resolveMyTeacherProfile: vi.fn(),
  };
});

import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveIncludingTeacher = vi.mocked(resolveMySchoolIncludingTeacher);
const mockResolveMyTeacherProfile = vi.mocked(resolveMyTeacherProfile);

const authUser = { user: { sub: 'user_1', email: 'teacher@test.local' } };
const memberSchool = { schoolId: 'school_1' };
const memberTeacher = { teacherId: 'teacher_1', classSubjectIds: ['cs_1'], homeroomClassIds: [] };

const validBody = {
  classSubjectId: 'cs_1',
  termId: 'term_1',
  label: 'DS 1',
};

const call = async (body: unknown) => {
  const req = new NextRequest('http://localhost:3000/api/teacher/evaluations', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  return POST(req);
};

beforeEach(() => {
  vi.clearAllMocks();

  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveIncludingTeacher.mockResolvedValue(memberSchool as never);
  mockResolveMyTeacherProfile.mockResolvedValue(memberTeacher as never);

  prismaMock.classSubject.findUnique.mockResolvedValue({
    id: 'cs_1',
    classId: 'cls_1',
    class: { schoolId: 'school_1', academicYearId: 'year_1' },
    subject: { evaluationMode: 'NUMERIC' },
  } as never);
  prismaMock.term.findUnique.mockResolvedValue({
    id: 'term_1',
    academicYearId: 'year_1',
  } as never);
  prismaMock.evaluation.create.mockResolvedValue({
    id: 'eva_1',
    classSubjectId: 'cs_1',
    termId: 'term_1',
    label: 'DS 1',
    type: 'AUTRE',
    status: 'DRAFT',
  } as never);
});

describe('POST /api/teacher/evaluations', () => {
  it('401s an unauthenticated caller', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    expect((await call(validBody)).status).toBe(401);
  });

  it('404s a non-teacher account', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    expect((await call(validBody)).status).toBe(404);
  });

  it('404s when school resolve returns null, without touching the DB', async () => {
    mockResolveIncludingTeacher.mockResolvedValue(null);
    const res = await call(validBody);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('NOT_FOUND');
    expect(json.message).toBe('Not found');
    expect(prismaMock.classSubject.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.evaluation.create).not.toHaveBeenCalled();
  });

  it('404s a classSubject that is not one of my affectations, without touching the DB', async () => {
    const res = await call({ ...validBody, classSubjectId: 'cs_OTHER' });
    expect(res.status).toBe(404);
    expect(prismaMock.classSubject.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.evaluation.create).not.toHaveBeenCalled();
  });

  it('400s a term that does not belong to the class year', async () => {
    prismaMock.term.findUnique.mockResolvedValue({
      id: 'term_1',
      academicYearId: 'year_OTHER',
    } as never);
    const res = await call(validBody);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(prismaMock.evaluation.create).not.toHaveBeenCalled();
  });

  it('400s an invalid body', async () => {
    expect((await call({ classSubjectId: 'cs_1' })).status).toBe(400);
  });

  it('creates with defaults and returns 201', async () => {
    const res = await call(validBody);
    expect(res.status).toBe(201);
    expect((await res.json()).evaluation).toMatchObject({ id: 'eva_1' });
    expect(prismaMock.evaluation.create).toHaveBeenCalledWith({
      data: {
        classSubjectId: 'cs_1',
        termId: 'term_1',
        label: 'DS 1',
        type: 'AUTRE',
        maxScore: 20,
        coefficient: 1,
        countsTowardAverage: true,
        notes: null,
        order: 0,
        date: null,
      },
    });
  });

  it('stores an explicit null date as null, not the epoch (the modal sends date: null)', async () => {
    const res = await call({ ...validBody, date: null });
    expect(res.status).toBe(201);
    expect(prismaMock.evaluation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ date: null }),
    });
  });
});

describe('POST /api/teacher/evaluations (qualitative subject)', () => {
  it('409 SUBJECT_NOT_NUMERIC', async () => {
    prismaMock.classSubject.findUnique.mockResolvedValue({
      id: 'cs_1',
      class: { schoolId: 'school_1', academicYearId: 'year_1' },
      subject: { evaluationMode: 'QUALITATIVE' },
    } as never);
    prismaMock.term.findUnique.mockResolvedValue({
      id: 'term_1',
      academicYearId: 'year_1',
    } as never);
    const res = await POST(
      new NextRequest('http://localhost/api/teacher/evaluations', {
        method: 'POST',
        body: JSON.stringify({ classSubjectId: 'cs_1', termId: 'term_1', label: 'Devoir 1' }),
      }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'SUBJECT_NOT_NUMERIC' });
    expect(prismaMock.evaluation.create).not.toHaveBeenCalled();
  });
});
