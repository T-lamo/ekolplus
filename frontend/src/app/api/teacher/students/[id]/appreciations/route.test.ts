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
import { GET, PUT, DELETE } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveIncludingTeacher = vi.mocked(resolveMySchoolIncludingTeacher);
const mockResolveMyTeacherProfile = vi.mocked(resolveMyTeacherProfile);

const authUser = { user: { sub: 'user_1', email: 'teacher@test.local' } };
const memberSchool = { schoolId: 'school_1' };
const subjectTeacher = { teacherId: 'teacher_1', classSubjectIds: ['cs_1'], homeroomClassIds: [] };
const homeroomTeacher = {
  teacherId: 'teacher_1',
  classSubjectIds: ['cs_1'],
  homeroomClassIds: ['cls_1'],
};

const callGet = async (id = 'stu_1', qs = '') => {
  const req = new NextRequest(
    `http://localhost:3000/api/teacher/students/${id}/appreciations${qs}`,
  );
  return GET(req, { params: Promise.resolve({ id }) });
};

function seedHappyPath() {
  prismaMock.classSubject.findMany.mockResolvedValue([
    {
      id: 'cs_1',
      classId: 'cls_1',
      subjectId: 'sub_1',
      coefficient: 3,
      subject: { name: 'Français' },
    },
  ] as never);
  prismaMock.enrollment.findFirst.mockResolvedValue({
    classId: 'cls_1',
    academicYearId: 'year_1',
    class: { id: 'cls_1', name: '3ème A', academicYearId: 'year_1' },
    student: {
      id: 'stu_1',
      firstName: 'Yolande',
      lastName: 'Cadet',
      studentNumber: 'EL-2025-020',
      schoolId: 'school_1',
    },
  } as never);
  prismaMock.term.findMany.mockResolvedValue([
    { id: 'term_1', label: '1er Trimestre', order: 1, startDate: null, endDate: null },
  ] as never);
  prismaMock.enrollment.findMany.mockResolvedValue([
    { studentId: 'stu_1', student: { id: 'stu_1', firstName: 'Yolande', lastName: 'Cadet' } },
    { studentId: 'stu_2', student: { id: 'stu_2', firstName: 'Frantz', lastName: 'Alexis' } },
  ] as never);
  prismaMock.evaluation.findMany.mockResolvedValue([] as never);
  prismaMock.appreciation.findMany.mockResolvedValue([] as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveIncludingTeacher.mockResolvedValue(memberSchool as never);
  mockResolveMyTeacherProfile.mockResolvedValue(subjectTeacher as never);
  seedHappyPath();
});

describe('GET /api/teacher/students/[id]/appreciations', () => {
  it('401s an unauthenticated caller', async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({}, { status: 401 }) as never);
    expect((await callGet()).status).toBe(401);
  });

  it('404s a non-teacher account', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    expect((await callGet()).status).toBe(404);
  });

  it('404s a student outside my classes without leaking existence', async () => {
    prismaMock.enrollment.findFirst.mockResolvedValue(null);
    const res = await callGet('stu_other');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NOT_FOUND');
  });

  it('404s an explicit termId from another year', async () => {
    expect((await callGet('stu_1', '?termId=term_evil')).status).toBe(404);
  });

  it('scopes subjects to my classSubjects and hides rank data when not homeroom', async () => {
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isMyHomeroom).toBe(false);
    expect(body.subjects.map((s: { subjectId: string }) => s.subjectId)).toEqual(['sub_1']);
    expect(body.general).toBeNull();
    expect(body.overallAverage).toBeNull();
    expect(body.rank).toBeNull();
    expect(body.rankedCount).toBe(0);
    expect(body.prevStudentId).toBeNull();
    expect(body.nextStudentId).toBe('stu_2');
  });

  it('never queries the general row for a non-homeroom teacher', async () => {
    await callGet();
    const apprCalls = prismaMock.appreciation.findMany.mock.calls;
    for (const call of apprCalls) {
      const where = (call[0] as { where: { OR?: { subjectId: unknown }[] } }).where;
      expect(where.OR?.some((c) => c.subjectId === null)).not.toBe(true);
    }
  });

  it('returns the general row and rank fields for the homeroom teacher', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(homeroomTeacher as never);
    prismaMock.appreciation.findMany.mockResolvedValue([
      {
        studentId: 'stu_1',
        subjectId: null,
        mention: 'BIEN',
        text: 'Bon trimestre',
        comportement: 'Excellent',
        investissement: null,
        assiduite: null,
        status: 'PUBLISHED',
        createdAt: new Date('2026-01-10'),
        updatedAt: new Date('2026-01-11'),
        author: { name: 'Carline Michel', email: null },
      },
    ] as never);
    const res = await callGet();
    const body = await res.json();
    expect(body.isMyHomeroom).toBe(true);
    expect(body.general).toMatchObject({ mention: 'BIEN', status: 'PUBLISHED' });
    expect(body.rankedCount).toBe(0);
  });
});

const callPut = async (body: unknown, id = 'stu_1') => {
  const req = new NextRequest(`http://localhost:3000/api/teacher/students/${id}/appreciations`, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  return PUT(req, { params: Promise.resolve({ id }) });
};
const callDelete = async (qs: string, id = 'stu_1') => {
  const req = new NextRequest(
    `http://localhost:3000/api/teacher/students/${id}/appreciations${qs}`,
    { method: 'DELETE' },
  );
  return DELETE(req, { params: Promise.resolve({ id }) });
};

describe('PUT /api/teacher/students/[id]/appreciations', () => {
  const validSubjectBody = {
    termId: 'term_1',
    subjectId: 'sub_1',
    text: 'Bon travail',
    status: 'DRAFT',
  };

  beforeEach(() => {
    prismaMock.term.findUnique.mockResolvedValue({
      id: 'term_1',
      academicYearId: 'year_1',
    } as never);
  });

  it('404s a subjectId outside my subjects in this class', async () => {
    const res = await callPut({ ...validSubjectBody, subjectId: 'sub_other' });
    expect(res.status).toBe(404);
    expect(prismaMock.appreciation.create).not.toHaveBeenCalled();
  });

  it('404s the general row for a non-homeroom teacher', async () => {
    const res = await callPut({ termId: 'term_1', subjectId: null, mention: 'BIEN' });
    expect(res.status).toBe(404);
  });

  it('400s a termId outside the enrollment year', async () => {
    prismaMock.term.findUnique.mockResolvedValue(null);
    const res = await callPut({ ...validSubjectBody, termId: 'term_evil' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('creates a subject row with my userId as author when none exists', async () => {
    prismaMock.appreciation.findFirst.mockResolvedValue(null);
    prismaMock.appreciation.create.mockResolvedValue({ id: 'appr_1' } as never);
    const res = await callPut(validSubjectBody);
    expect(res.status).toBe(200);
    expect(prismaMock.appreciation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: 'stu_1',
        termId: 'term_1',
        subjectId: 'sub_1',
        text: 'Bon travail',
        status: 'DRAFT',
        authorId: 'user_1',
      }),
    });
  });

  it('updates in place when a row exists (find-then-branch, no NULL-dedupe upsert)', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(homeroomTeacher as never);
    prismaMock.appreciation.findFirst.mockResolvedValue({ id: 'appr_1' } as never);
    prismaMock.appreciation.update.mockResolvedValue({ id: 'appr_1' } as never);
    const res = await callPut({ termId: 'term_1', subjectId: null, mention: 'BIEN' });
    expect(res.status).toBe(200);
    expect(prismaMock.appreciation.update).toHaveBeenCalledWith({
      where: { id: 'appr_1' },
      data: expect.objectContaining({ mention: 'BIEN', authorId: 'user_1' }),
    });
    expect(prismaMock.appreciation.create).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/teacher/students/[id]/appreciations', () => {
  it('400s without termId', async () => {
    expect((await callDelete('')).status).toBe(400);
  });

  it('404s the general row for a non-homeroom teacher', async () => {
    expect((await callDelete('?termId=term_1')).status).toBe(404);
  });

  it('deletes my subject row and returns 204', async () => {
    prismaMock.appreciation.findFirst.mockResolvedValue({ id: 'appr_1' } as never);
    prismaMock.appreciation.delete.mockResolvedValue({} as never);
    const res = await callDelete('?termId=term_1&subjectId=sub_1');
    expect(res.status).toBe(204);
    expect(prismaMock.appreciation.delete).toHaveBeenCalledWith({ where: { id: 'appr_1' } });
  });
});
