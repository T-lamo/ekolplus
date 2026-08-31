// PUT /api/teacher/evaluations/[id]/grades — bulk grade upsert for one of
// my own evaluations, mirroring the school route's guards. prismaMock first.
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
import { PUT } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveIncludingTeacher = vi.mocked(resolveMySchoolIncludingTeacher);
const mockResolveMyTeacherProfile = vi.mocked(resolveMyTeacherProfile);

const authUser = { user: { sub: 'user_1', email: 'teacher@test.local' } };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };

const ownedEvaluation = {
  id: 'eva_1',
  maxScore: 20,
  classSubject: {
    teacherId: 'tea_1',
    classId: 'cls_1',
    class: { schoolId: 'school_1' },
  },
  term: { gradeEntryEnabled: true },
};

function call(body: unknown) {
  return PUT(
    new NextRequest('http://localhost/api/teacher/evaluations/eva_1/grades', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'eva_1' }) },
  );
}

const validBody = { grades: [{ studentId: 'stu_1', score: 15, absent: false, comment: null }] };

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
  prismaMock.enrollment.count.mockResolvedValue(1);
  prismaMock.$transaction.mockResolvedValue([] as never);
  prismaMock.grade.findMany.mockResolvedValue([
    { id: 'gr_1', evaluationId: 'eva_1', studentId: 'stu_1', score: 15, absent: false },
  ] as never);
});

describe('PUT /api/teacher/evaluations/[id]/grades', () => {
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

  it("404s another teacher's evaluation", async () => {
    prismaMock.evaluation.findUnique.mockResolvedValue({
      ...ownedEvaluation,
      classSubject: { ...ownedEvaluation.classSubject, teacherId: 'tea_OTHER' },
    } as never);
    expect((await call(validBody)).status).toBe(404);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('403s with GRADE_ENTRY_DISABLED when the term lock is on', async () => {
    prismaMock.evaluation.findUnique.mockResolvedValue({
      ...ownedEvaluation,
      term: { gradeEntryEnabled: false },
    } as never);
    const res = await call(validBody);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('GRADE_ENTRY_DISABLED');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('400s a score above the evaluation maxScore', async () => {
    const res = await call({ grades: [{ studentId: 'stu_1', score: 25, absent: false }] });
    expect(res.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('400s a student who is not enrolled in the class', async () => {
    prismaMock.enrollment.count.mockResolvedValue(0);
    const res = await call(validBody);
    expect(res.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    const where = prismaMock.enrollment.count.mock.calls[0]?.[0]?.where;
    expect(where).toEqual({ classId: 'cls_1', studentId: { in: ['stu_1'] } });
  });

  it('upserts the batch in a transaction and returns the fresh grades', async () => {
    const res = await call(validBody);
    expect(res.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.grades).toHaveLength(1);
  });
});
