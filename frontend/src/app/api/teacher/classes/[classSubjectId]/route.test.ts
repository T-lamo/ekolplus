// GET /api/teacher/classes/[classSubjectId] — roster of a taught
// class-subject. prismaMock first (auto-hoists vi.mock for
// '@/lib/server/prisma').
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchoolIncludingTeacher: vi.fn(), resolveMyTeacherProfile: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveIncludingTeacher = vi.mocked(resolveMySchoolIncludingTeacher);
const mockResolveMyTeacherProfile = vi.mocked(resolveMyTeacherProfile);

const authUser = { user: { sub: 'user_1', email: 'teacher@test.local' } };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };
const params = (classSubjectId: string) => ({ params: Promise.resolve({ classSubjectId }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveIncludingTeacher.mockResolvedValue(memberSchool);
  mockResolveMyTeacherProfile.mockResolvedValue({
    teacherId: 'tea_1',
    classSubjectIds: ['cs_1'],
    homeroomClassIds: [],
  });
  prismaMock.classSubject.findUniqueOrThrow.mockResolvedValue({
    id: 'cs_1',
    classId: 'cls_1',
    class: { id: 'cls_1', name: '3ème A', level: '3ème', academicYearId: 'year_1' },
    subjectId: 'sub_1',
    subject: { id: 'sub_1', name: 'Mathématiques' },
  } as never);
  prismaMock.enrollment.findMany.mockResolvedValue([
    {
      student: {
        id: 'stu_1',
        firstName: 'Jean',
        lastName: 'Baptiste',
        studentNumber: 'EL-2024-001',
      },
    },
  ] as never);
});

describe('GET /api/teacher/classes/[classSubjectId]', () => {
  it("404s a class-subject that is not this teacher's own", async () => {
    const res = await GET(new NextRequest('http://localhost/x'), params('cs_OTHER'));
    expect(res.status).toBe(404);
  });

  it('404s a non-teacher account', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/x'), params('cs_1'));
    expect(res.status).toBe(404);
  });

  it("returns the class-subject header and roster for the caller's own class-subject", async () => {
    const res = await GET(new NextRequest('http://localhost/x'), params('cs_1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.classSubject).toEqual({
      id: 'cs_1',
      classId: 'cls_1',
      className: '3ème A',
      classLevel: '3ème',
      subjectId: 'sub_1',
      subjectName: 'Mathématiques',
    });
    expect(json.students).toEqual([
      { id: 'stu_1', firstName: 'Jean', lastName: 'Baptiste', studentNumber: 'EL-2024-001' },
    ]);
    const where = prismaMock.enrollment.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ classId: 'cls_1', academicYearId: 'year_1' });
  });
});
