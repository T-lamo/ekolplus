// GET /api/teacher/me — the Espace Enseignant home screen's one aggregate
// read. prismaMock first (auto-hoists vi.mock for '@/lib/server/prisma').
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
    resolveActiveAcademicYear: vi.fn(),
  };
});

import { requireAuth } from '@/lib/server/middleware';
import {
  resolveMySchoolIncludingTeacher,
  resolveMyTeacherProfile,
  resolveActiveAcademicYear,
} from '@/lib/server/school';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveIncludingTeacher = vi.mocked(resolveMySchoolIncludingTeacher);
const mockResolveMyTeacherProfile = vi.mocked(resolveMyTeacherProfile);
const mockResolveYear = vi.mocked(resolveActiveAcademicYear);

const authUser = { user: { sub: 'user_1', email: 'teacher@test.local' } };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };
const groupByMock = prismaMock.timetableSession.groupBy as unknown as ReturnType<typeof vi.fn>;

function req() {
  return new NextRequest('http://localhost/api/teacher/me');
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
  mockResolveYear.mockResolvedValue({
    id: 'year_1',
    label: '2025-2026',
    startDate: new Date('2025-09-01T00:00:00.000Z'),
  });
  prismaMock.teacher.findUniqueOrThrow.mockResolvedValue({
    id: 'tea_1',
    name: 'Carline Michel',
    email: 'carline.michel@lesetoiles.edu.ht',
  } as never);
  prismaMock.class.findMany.mockResolvedValue([
    { id: 'cls_1', name: '3ème A', level: '3ème' },
  ] as never);
  prismaMock.classSubject.findMany.mockResolvedValue([
    {
      id: 'cs_1',
      classId: 'cls_1',
      class: { name: '3ème A', level: '3ème' },
      subjectId: 'sub_1',
      subject: { name: 'Mathématiques' },
    },
  ] as never);
  prismaMock.timetableSession.findMany.mockResolvedValue([]);
  groupByMock.mockResolvedValue([]);
});

describe('GET /api/teacher/me', () => {
  it('401s an unauthenticated caller', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    expect((await GET(req())).status).toBe(401);
  });

  it('404s a non-teacher account', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(404);
  });

  it('404s an account with no school membership at all', async () => {
    mockResolveIncludingTeacher.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(404);
  });

  it('returns identity, homeroom classes, taught class-subjects and academic year', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.teacher).toEqual({
      id: 'tea_1',
      name: 'Carline Michel',
      email: 'carline.michel@lesetoiles.edu.ht',
    });
    expect(json.homeroomClasses).toEqual([{ id: 'cls_1', name: '3ème A', level: '3ème' }]);
    expect(json.classSubjects).toEqual([
      {
        id: 'cs_1',
        classId: 'cls_1',
        className: '3ème A',
        classLevel: '3ème',
        subjectId: 'sub_1',
        subjectName: 'Mathématiques',
      },
    ]);
    expect(json.academicYear).toEqual({ id: 'year_1', label: '2025-2026' });
    expect(json.thisWeekSessions).toEqual([]);
    const where = prismaMock.class.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ id: { in: ['cls_1'] } });
  });

  it("scopes this-week sessions to the caller's own teacherId", async () => {
    await GET(req());
    const where = prismaMock.timetableSession.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ schoolId: 'school_1', teacherId: 'tea_1' });
  });
});
