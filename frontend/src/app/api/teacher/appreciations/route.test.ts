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

const call = async (qs = '') =>
  GET(new NextRequest(`http://localhost:3000/api/teacher/appreciations${qs}`));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveIncludingTeacher.mockResolvedValue({ schoolId: 'school_1' } as never);
  mockResolveMyTeacherProfile.mockResolvedValue({
    teacherId: 'teacher_1',
    classSubjectIds: ['cs_1'],
    homeroomClassIds: ['cls_2'],
  } as never);
  prismaMock.academicYear.findFirst.mockResolvedValue({ id: 'year_1' } as never);
  prismaMock.term.findMany.mockResolvedValue([
    { id: 'term_1', label: '1er Trimestre', order: 1, startDate: null, endDate: null },
  ] as never);
  prismaMock.classSubject.findMany.mockResolvedValue([
    {
      id: 'cs_1',
      classId: 'cls_1',
      subjectId: 'sub_1',
      subject: { name: 'Français' },
      class: { id: 'cls_1', name: '3ème A', level: '3ème', academicYearId: 'year_1' },
    },
  ] as never);
  prismaMock.class.findMany.mockResolvedValue([
    { id: 'cls_2', name: 'Seconde B', level: 'Seconde', academicYearId: 'year_1' },
  ] as never);
  prismaMock.enrollment.findMany.mockResolvedValue([
    {
      classId: 'cls_1',
      studentId: 'stu_1',
      student: { id: 'stu_1', firstName: 'Frantz', lastName: 'Alexis' },
    },
    {
      classId: 'cls_2',
      studentId: 'stu_2',
      student: { id: 'stu_2', firstName: 'Yolande', lastName: 'Cadet' },
    },
  ] as never);
  prismaMock.appreciation.findMany.mockResolvedValue([
    { studentId: 'stu_1', subjectId: 'sub_1', status: 'PUBLISHED' },
    { studentId: 'stu_2', subjectId: null, status: 'DRAFT' },
  ] as never);
});

describe('GET /api/teacher/appreciations', () => {
  it('401s an unauthenticated caller', async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({}, { status: 401 }) as never);
    expect((await call()).status).toBe(401);
  });

  it('404s a non-teacher account', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it('404s an unknown explicit termId', async () => {
    expect((await call('?termId=term_evil')).status).toBe(404);
  });

  it('lists my classes with per-scope saisie progress', async () => {
    const res = await call('?termId=term_1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resolvedTermId).toBe('term_1');
    const byId = Object.fromEntries(body.classes.map((c: { classId: string }) => [c.classId, c]));
    expect(byId.cls_1).toMatchObject({
      className: '3ème A',
      isMyHomeroom: false,
      studentCount: 1,
      firstStudentId: 'stu_1',
      generalSaisieCount: null,
      subjects: [{ subjectId: 'sub_1', subjectName: 'Français', saisieCount: 1 }],
    });
    expect(byId.cls_2).toMatchObject({
      className: 'Seconde B',
      isMyHomeroom: true,
      studentCount: 1,
      firstStudentId: 'stu_2',
      generalSaisieCount: 0,
      subjects: [],
    });
  });

  it('returns empty classes when the school has no active year', async () => {
    prismaMock.academicYear.findFirst.mockResolvedValue(null);
    const res = await call();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.classes).toEqual([]);
    expect(body.resolvedTermId).toBeNull();
  });
});
