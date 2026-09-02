// GET /api/teacher/class-subjects/[id]/notebook — the school notebook
// aggregate, restricted to MY OWN class-subject. Averages and ranks come
// from the real grades helpers (not mocked). prismaMock first.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
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
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveIncludingTeacher = vi.mocked(resolveMySchoolIncludingTeacher);
const mockResolveMyTeacherProfile = vi.mocked(resolveMyTeacherProfile);

const authUser = { user: { sub: 'user_1', email: 'teacher@test.local' } };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };

function call(id = 'cs_1', qs = '') {
  return GET(new NextRequest(`http://localhost/api/teacher/class-subjects/${id}/notebook${qs}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveIncludingTeacher.mockResolvedValue(memberSchool);
  mockResolveMyTeacherProfile.mockResolvedValue({
    teacherId: 'tea_1',
    classSubjectIds: ['cs_1'],
    homeroomClassIds: [],
  });
  prismaMock.classSubject.findUnique.mockResolvedValue({
    id: 'cs_1',
    classId: 'cls_1',
    coefficient: 4,
    class: { id: 'cls_1', name: '3ème A', schoolId: 'school_1', academicYearId: 'year_1' },
    subject: { id: 'sub_1', name: 'Mathématiques' },
  } as never);
  prismaMock.term.findMany.mockResolvedValue([
    {
      id: 'term_1',
      label: '1er Trimestre',
      order: 1,
      startDate: new Date('2025-09-01T00:00:00.000Z'),
      endDate: new Date('2025-12-20T00:00:00.000Z'),
    },
  ] as never);
  prismaMock.evaluation.findMany.mockResolvedValue([
    {
      id: 'eva_1',
      label: 'DS 1',
      type: 'DS',
      maxScore: 20,
      coefficient: 1,
      countsTowardAverage: true,
      status: 'PUBLISHED',
      date: null,
      grades: [
        { studentId: 'stu_1', score: 16, absent: false, comment: null },
        { studentId: 'stu_2', score: 10, absent: false, comment: null },
      ],
    },
  ] as never);
  prismaMock.enrollment.findMany.mockResolvedValue([
    {
      studentId: 'stu_1',
      student: { id: 'stu_1', firstName: 'Nadia', lastName: 'Alexis', studentNumber: 'EL-1' },
    },
    {
      studentId: 'stu_2',
      student: { id: 'stu_2', firstName: 'Jean', lastName: 'Baptiste', studentNumber: 'EL-2' },
    },
  ] as never);
});

describe('GET /api/teacher/class-subjects/[id]/notebook', () => {
  it('401s an unauthenticated caller', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    expect((await call()).status).toBe(401);
  });

  it('404s a non-teacher account', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it('404s a classSubject that is not mine, without touching the DB', async () => {
    expect((await call('cs_OTHER')).status).toBe(404);
    expect(prismaMock.classSubject.findUnique).not.toHaveBeenCalled();
  });

  it('returns the notebook with real averages and ranks', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      classSubjectId: 'cs_1',
      className: '3ème A',
      subjectName: 'Mathématiques',
      subjectCoefficient: 4,
      resolvedTermId: 'term_1',
      classAverage: 13,
      bestScore: 16,
      worstScore: 10,
      gradedCount: 2,
      totalCount: 2,
    });
    expect(body.terms).toEqual([{ id: 'term_1', label: '1er Trimestre', order: 1 }]);
    expect(body.students[0]).toMatchObject({
      studentId: 'stu_1',
      average: 16,
      rank: 1,
      grades: [{ evaluationId: 'eva_1', score: 16, absent: false, comment: null }],
    });
    expect(body.students[1]).toMatchObject({ studentId: 'stu_2', average: 10, rank: 2 });
    const enrollWhere = prismaMock.enrollment.findMany.mock.calls[0]?.[0]?.where;
    expect(enrollWhere).toEqual({ classId: 'cls_1', academicYearId: 'year_1' });
  });

  it('returns the empty shell when the requested termId is not in the class year', async () => {
    const res = await call('cs_1', '?termId=term_OTHER');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resolvedTermId).toBeNull();
    expect(body.evaluations).toEqual([]);
    expect(body.students).toEqual([]);
    expect(prismaMock.evaluation.findMany).not.toHaveBeenCalled();
  });
});
