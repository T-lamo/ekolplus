// GET/PATCH/DELETE /api/teacher/evaluations/[id] — read, edit, publish and
// delete ONE of my own evaluations. Ownership is the evaluation's
// classSubject.teacherId, re-read from the DB per request. prismaMock first.
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
import { GET, PATCH, DELETE } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveIncludingTeacher = vi.mocked(resolveMySchoolIncludingTeacher);
const mockResolveMyTeacherProfile = vi.mocked(resolveMyTeacherProfile);

const authUser = { user: { sub: 'user_1', email: 'teacher@test.local' } };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };

const ownedEvaluation = {
  id: 'eva_1',
  classSubjectId: 'cs_1',
  termId: 'term_1',
  label: 'DS 1',
  type: 'DS',
  maxScore: 20,
  coefficient: 2,
  countsTowardAverage: true,
  status: 'DRAFT',
  notes: null,
  order: 0,
  date: null,
  classSubject: {
    teacherId: 'tea_1',
    class: { id: 'cls_1', name: '3ème A', schoolId: 'school_1', academicYearId: 'year_1' },
    subject: { id: 'sub_1', name: 'Mathématiques' },
    teacher: { id: 'tea_1', name: 'Carline Michel' },
  },
  term: { id: 'term_1', label: '1er Trimestre' },
};

function reqFor(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/teacher/evaluations/eva_1', {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const params = { params: Promise.resolve({ id: 'eva_1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveIncludingTeacher.mockResolvedValue(memberSchool);
  mockResolveMyTeacherProfile.mockResolvedValue({
    teacherId: 'tea_1',
    classSubjectIds: ['cs_1'],
    homeroomClassIds: [],
  });
  prismaMock.evaluation.findUnique.mockResolvedValue(ownedEvaluation as never);
  prismaMock.grade.findFirst.mockResolvedValue(null);
  prismaMock.evaluation.update.mockResolvedValue({
    ...ownedEvaluation,
    status: 'PUBLISHED',
  } as never);
  prismaMock.evaluation.delete.mockResolvedValue(ownedEvaluation as never);
});

describe('/api/teacher/evaluations/[id]', () => {
  it('401s an unauthenticated caller', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    expect((await GET(reqFor('GET'), params)).status).toBe(401);
  });

  it('404s a non-teacher account', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    expect((await GET(reqFor('GET'), params)).status).toBe(404);
  });

  it("404s another teacher's evaluation on all three verbs", async () => {
    prismaMock.evaluation.findUnique.mockResolvedValue({
      ...ownedEvaluation,
      classSubject: { ...ownedEvaluation.classSubject, teacherId: 'tea_OTHER' },
    } as never);
    expect((await GET(reqFor('GET'), params)).status).toBe(404);
    expect((await PATCH(reqFor('PATCH', { label: 'X' }), params)).status).toBe(404);
    expect((await DELETE(reqFor('DELETE'), params)).status).toBe(404);
    expect(prismaMock.evaluation.update).not.toHaveBeenCalled();
    expect(prismaMock.evaluation.delete).not.toHaveBeenCalled();
  });

  it('GET returns the evaluation with class, subject and term meta', async () => {
    const res = await GET(reqFor('GET'), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.evaluation).toMatchObject({
      id: 'eva_1',
      classSubjectId: 'cs_1',
      termId: 'term_1',
      classSubject: {
        class: { id: 'cls_1', name: '3ème A' },
        subject: { id: 'sub_1', name: 'Mathématiques' },
      },
      term: { id: 'term_1', label: '1er Trimestre' },
    });
  });

  it('PATCH publishes an evaluation', async () => {
    const res = await PATCH(reqFor('PATCH', { status: 'PUBLISHED' }), params);
    expect(res.status).toBe(200);
    expect(prismaMock.evaluation.update).toHaveBeenCalledWith({
      where: { id: 'eva_1' },
      data: { status: 'PUBLISHED' },
    });
  });

  it('PATCH refuses to move the evaluation to a classSubject that is not mine', async () => {
    const res = await PATCH(reqFor('PATCH', { classSubjectId: 'cs_OTHER' }), params);
    expect(res.status).toBe(404);
    expect(prismaMock.evaluation.update).not.toHaveBeenCalled();
  });

  it('409s a move onto a qualitative classSubject that IS in my affectations', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue({
      teacherId: 'tea_1',
      classSubjectIds: ['cs_1', 'cs_2'],
      homeroomClassIds: [],
    });
    prismaMock.classSubject.findUnique.mockResolvedValue({
      class: { academicYearId: 'year_1' },
      subject: { evaluationMode: 'QUALITATIVE' },
    } as never);
    const res = await PATCH(reqFor('PATCH', { classSubjectId: 'cs_2' }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('SUBJECT_NOT_NUMERIC');
    expect(prismaMock.evaluation.update).not.toHaveBeenCalled();
  });

  it('allows a move onto a numeric classSubject in my affectations', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue({
      teacherId: 'tea_1',
      classSubjectIds: ['cs_1', 'cs_2'],
      homeroomClassIds: [],
    });
    prismaMock.classSubject.findUnique.mockResolvedValue({
      class: { academicYearId: 'year_1' },
      subject: { evaluationMode: 'NUMERIC' },
    } as never);
    const res = await PATCH(reqFor('PATCH', { classSubjectId: 'cs_2' }), params);
    expect(res.status).toBe(200);
    expect(prismaMock.evaluation.update).toHaveBeenCalled();
  });

  it('PATCH refuses to lower maxScore below an existing grade', async () => {
    prismaMock.grade.findFirst.mockResolvedValue({ id: 'gr_1', score: 18 } as never);
    const res = await PATCH(reqFor('PATCH', { maxScore: 10 }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(prismaMock.evaluation.update).not.toHaveBeenCalled();
  });

  it('PATCH validates a termId change against the class year', async () => {
    prismaMock.term.findUnique.mockResolvedValue({
      id: 'term_X',
      academicYearId: 'year_OTHER',
    } as never);
    const res = await PATCH(reqFor('PATCH', { termId: 'term_X' }), params);
    expect(res.status).toBe(400);
    expect(prismaMock.evaluation.update).not.toHaveBeenCalled();
  });

  it('DELETE removes my evaluation and returns 204', async () => {
    const res = await DELETE(reqFor('DELETE'), params);
    expect(res.status).toBe(204);
    expect(prismaMock.evaluation.delete).toHaveBeenCalledWith({ where: { id: 'eva_1' } });
  });
});
