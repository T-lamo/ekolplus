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
const params = (classId: string) => ({ params: Promise.resolve({ classId }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveIncludingTeacher.mockResolvedValue(memberSchool);
  mockResolveMyTeacherProfile.mockResolvedValue({
    teacherId: 'tea_1',
    classSubjectIds: [],
    homeroomClassIds: ['cls_1'],
  });
  prismaMock.class.findUniqueOrThrow.mockResolvedValue({
    id: 'cls_1',
    name: '3ème A',
    level: '3ème',
    academicYearId: 'year_1',
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

describe('GET /api/teacher/classes/homeroom/[classId]', () => {
  it('404s an account with no school membership at all', async () => {
    mockResolveIncludingTeacher.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/x'), params('cls_1'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'NOT_FOUND', message: 'Not found' });
  });

  it("404s a class that is not this teacher's own homeroom", async () => {
    const res = await GET(new NextRequest('http://localhost/x'), params('cls_OTHER'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'NOT_FOUND', message: 'Not found' });
  });

  it('404s a non-teacher account', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/x'), params('cls_1'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'NOT_FOUND', message: 'Not found' });
  });

  it("returns the class header and roster for the caller's own homeroom class", async () => {
    const res = await GET(new NextRequest('http://localhost/x'), params('cls_1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.class).toEqual({ id: 'cls_1', name: '3ème A', level: '3ème' });
    expect(json.students).toEqual([
      { id: 'stu_1', firstName: 'Jean', lastName: 'Baptiste', studentNumber: 'EL-2024-001' },
    ]);
    const where = prismaMock.enrollment.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ classId: 'cls_1', academicYearId: 'year_1' });
  });
});
