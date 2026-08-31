// GET /api/teacher/students/[id] — lightweight student profile scoped to
// the caller's own subjects. prismaMock first (auto-hoists vi.mock for
// '@/lib/server/prisma').
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

function call(id = 'stu_1', qs = '') {
  return GET(new NextRequest(`http://localhost/api/teacher/students/${id}${qs}`), {
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
    homeroomClassIds: ['cls_1'],
  });
  prismaMock.classSubject.findMany.mockResolvedValue([
    { id: 'cs_1', classId: 'cls_1', subjectId: 'sub_1', subject: { name: 'Mathématiques' } },
  ] as never);
  prismaMock.enrollment.findFirst.mockResolvedValue({
    classId: 'cls_1',
    academicYearId: 'year_1',
    class: { id: 'cls_1', name: '3ème A', level: '3ème', academicYearId: 'year_1' },
    student: {
      id: 'stu_1',
      firstName: 'Nadia',
      lastName: 'Alexis',
      studentNumber: 'EL-2026-001',
      photoUrl: null,
      status: 'ENROLLED',
      schoolId: 'school_1',
    },
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
      classSubjectId: 'cs_1',
      label: 'DS 1',
      type: 'DS',
      date: new Date('2025-10-10T00:00:00.000Z'),
      maxScore: 20,
      coefficient: 2,
      status: 'PUBLISHED',
      countsTowardAverage: true,
      grades: [{ studentId: 'stu_1', score: 15, absent: false, comment: null }],
    },
    {
      id: 'eva_2',
      classSubjectId: 'cs_1',
      label: 'Interro 1',
      type: 'INTERROGATION',
      date: null,
      maxScore: 20,
      coefficient: 1,
      status: 'DRAFT',
      countsTowardAverage: true,
      grades: [{ studentId: 'stu_1', score: 8, absent: false, comment: null }],
    },
  ] as never);
  prismaMock.appreciation.findMany.mockResolvedValue([
    {
      subjectId: 'sub_1',
      mention: 'BIEN',
      text: 'Bon trimestre.',
      comportement: null,
      investissement: null,
      assiduite: null,
      status: 'PUBLISHED',
    },
    {
      subjectId: null,
      mention: 'BIEN',
      text: 'Ensemble satisfaisant.',
      comportement: 'Bon',
      investissement: 'Soutenu',
      assiduite: 'Régulière',
      status: 'DRAFT',
    },
  ] as never);
});

describe('GET /api/teacher/students/[id]', () => {
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

  it('404s a student outside my classes, and scoped the lookup to them', async () => {
    prismaMock.enrollment.findFirst.mockResolvedValue(null);
    expect((await call('stu_other')).status).toBe(404);
    const where = prismaMock.enrollment.findFirst.mock.calls[0]?.[0]?.where;
    expect(where).toEqual({
      studentId: 'stu_other',
      academicYear: { isActive: true },
      classId: { in: ['cls_1'] },
    });
  });

  it('404s a student from another school even when enrolled in a matching class id', async () => {
    prismaMock.enrollment.findFirst.mockResolvedValue({
      classId: 'cls_1',
      academicYearId: 'year_1',
      class: { id: 'cls_1', name: '3ème A', level: '3ème' },
      student: {
        id: 'stu_1',
        firstName: 'X',
        lastName: 'Y',
        studentNumber: 'EL-1',
        photoUrl: null,
        status: 'ENROLLED',
        schoolId: 'school_OTHER',
      },
    } as never);
    expect((await call()).status).toBe(404);
  });

  it('returns identity, my subjects with a PUBLISHED-only average, and my appreciations', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.student).toEqual({
      id: 'stu_1',
      firstName: 'Nadia',
      lastName: 'Alexis',
      studentNumber: 'EL-2026-001',
      photoUrl: null,
      status: 'ENROLLED',
    });
    expect(body.class).toEqual({ id: 'cls_1', name: '3ème A', level: '3ème' });
    expect(body.isMyHomeroom).toBe(true);
    expect(body.term).toEqual({ id: 'term_1', label: '1er Trimestre' });
    expect(body.subjects).toHaveLength(1);
    expect(body.subjects[0]).toMatchObject({
      classSubjectId: 'cs_1',
      subjectId: 'sub_1',
      subjectName: 'Mathématiques',
      average: 15, // the DRAFT Interro (8/20) must not drag it down
    });
    expect(body.subjects[0].evaluations).toEqual([
      {
        id: 'eva_1',
        label: 'DS 1',
        type: 'DS',
        date: '2025-10-10T00:00:00.000Z',
        maxScore: 20,
        coefficient: 2,
        status: 'PUBLISHED',
        score: 15,
        absent: false,
        comment: null,
      },
      {
        id: 'eva_2',
        label: 'Interro 1',
        type: 'INTERROGATION',
        date: null,
        maxScore: 20,
        coefficient: 1,
        status: 'DRAFT',
        score: 8,
        absent: false,
        comment: null,
      },
    ]);
    expect(body.appreciations).toEqual([
      {
        subjectId: 'sub_1',
        mention: 'BIEN',
        text: 'Bon trimestre.',
        comportement: null,
        investissement: null,
        assiduite: null,
        status: 'PUBLISHED',
      },
      {
        subjectId: null,
        mention: 'BIEN',
        text: 'Ensemble satisfaisant.',
        comportement: 'Bon',
        investissement: 'Soutenu',
        assiduite: 'Régulière',
        status: 'DRAFT',
      },
    ]);
    expect(body.terms).toEqual([{ id: 'term_1', label: '1er Trimestre' }]);
    const evalWhere = prismaMock.evaluation.findMany.mock.calls[0]?.[0]?.where;
    expect(evalWhere).toEqual({ classSubjectId: { in: ['cs_1'] }, termId: 'term_1' });
  });

  it('omits the general appreciation clause for a non-homeroom teacher', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue({
      teacherId: 'tea_1',
      classSubjectIds: ['cs_1'],
      homeroomClassIds: [],
    });
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isMyHomeroom).toBe(false);
    const where = prismaMock.appreciation.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toEqual({
      studentId: 'stu_1',
      termId: 'term_1',
      OR: [{ subjectId: { in: ['sub_1'] } }],
    });
  });

  it('404s an explicit termId that does not belong to the student year', async () => {
    expect((await call('stu_1', '?termId=term_OTHER')).status).toBe(404);
  });

  it('serves a homeroom-only teacher: no subjects, no evaluation query, general appreciation still returned', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue({
      teacherId: 'tea_1',
      classSubjectIds: [],
      homeroomClassIds: ['cls_1'],
    });
    prismaMock.appreciation.findMany.mockResolvedValue([
      {
        subjectId: null,
        mention: 'BIEN',
        text: 'Ensemble satisfaisant.',
        comportement: 'Bon',
        investissement: 'Soutenu',
        assiduite: 'Régulière',
        status: 'DRAFT',
      },
    ] as never);
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isMyHomeroom).toBe(true);
    expect(body.subjects).toEqual([]);
    expect(prismaMock.evaluation.findMany).not.toHaveBeenCalled();
    expect(body.appreciations).toHaveLength(1);
    expect(body.appreciations[0]?.subjectId).toBeNull();
    const where = prismaMock.appreciation.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toEqual({
      studentId: 'stu_1',
      termId: 'term_1',
      OR: [{ subjectId: null }],
    });
  });

  it('404s without querying enrollments when the teacher has no classes at all', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue({
      teacherId: 'tea_1',
      classSubjectIds: [],
      homeroomClassIds: [],
    });
    expect((await call()).status).toBe(404);
    expect(prismaMock.enrollment.findFirst).not.toHaveBeenCalled();
  });

  it('404s when the enrollment year and the class year disagree', async () => {
    prismaMock.enrollment.findFirst.mockResolvedValue({
      classId: 'cls_1',
      academicYearId: 'year_1',
      class: { id: 'cls_1', name: '3ème A', level: '3ème', academicYearId: 'year_OLD' },
      student: {
        id: 'stu_1',
        firstName: 'Nadia',
        lastName: 'Alexis',
        studentNumber: 'EL-2026-001',
        photoUrl: null,
        status: 'ENROLLED',
        schoolId: 'school_1',
      },
    } as never);
    expect((await call()).status).toBe(404);
  });
});
