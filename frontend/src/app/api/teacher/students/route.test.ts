// GET /api/teacher/students — every student enrolled (active year) in a
// class this teacher teaches or homerooms. prismaMock first (auto-hoists
// vi.mock for '@/lib/server/prisma').
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

function req() {
  return new NextRequest('http://localhost/api/teacher/students');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveIncludingTeacher.mockResolvedValue(memberSchool);
  mockResolveMyTeacherProfile.mockResolvedValue({
    teacherId: 'tea_1',
    classSubjectIds: ['cs_1'],
    homeroomClassIds: ['cls_2'],
  });
  prismaMock.classSubject.findMany.mockResolvedValue([{ classId: 'cls_1' }] as never);
  prismaMock.enrollment.findMany.mockResolvedValue([
    {
      classId: 'cls_1',
      class: { name: '3ème A', level: '3ème' },
      student: {
        id: 'stu_1',
        firstName: 'Nadia',
        lastName: 'Alexis',
        studentNumber: 'EL-2026-001',
        photoUrl: null,
        status: 'ENROLLED',
      },
    },
    {
      classId: 'cls_2',
      class: { name: '4ème B', level: '4ème' },
      student: {
        id: 'stu_2',
        firstName: 'Jean',
        lastName: 'Baptiste',
        studentNumber: 'EL-2026-002',
        photoUrl: null,
        status: 'ENROLLED',
      },
    },
  ] as never);
});

describe('GET /api/teacher/students', () => {
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

  it('returns flattened students scoped to my homeroom and taught classes, active year only', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.students).toEqual([
      {
        id: 'stu_1',
        firstName: 'Nadia',
        lastName: 'Alexis',
        studentNumber: 'EL-2026-001',
        photoUrl: null,
        status: 'ENROLLED',
        classId: 'cls_1',
        className: '3ème A',
        classLevel: '3ème',
      },
      {
        id: 'stu_2',
        firstName: 'Jean',
        lastName: 'Baptiste',
        studentNumber: 'EL-2026-002',
        photoUrl: null,
        status: 'ENROLLED',
        classId: 'cls_2',
        className: '4ème B',
        classLevel: '4ème',
      },
    ]);
    const where = prismaMock.enrollment.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toEqual({
      classId: { in: ['cls_2', 'cls_1'] },
      academicYear: { isActive: true },
    });
  });

  it('returns an empty list without querying enrollments when the teacher has no classes', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue({
      teacherId: 'tea_1',
      classSubjectIds: [],
      homeroomClassIds: [],
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).students).toEqual([]);
    expect(prismaMock.enrollment.findMany).not.toHaveBeenCalled();
  });
});
