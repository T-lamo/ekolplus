import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse, NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/school', () => ({ resolveMyStudentProfile: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { resolveMyStudentProfile } from '@/lib/server/school';
import { requireStudent } from './require-student';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveMyStudentProfile = vi.mocked(resolveMyStudentProfile);

function req() {
  return new NextRequest('http://localhost/api/student/me');
}

beforeEach(() => vi.clearAllMocks());

describe('requireStudent', () => {
  it('returns the 401 from requireAuth unchanged when unauthenticated', async () => {
    const unauth = NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    mockRequireAuth.mockResolvedValue(unauth);
    const result = await requireStudent(req());
    expect(result).toBe(unauth);
  });

  it('returns 404 when the account has no linked Student', async () => {
    mockRequireAuth.mockResolvedValue({ user: { sub: 'user_1', email: 'x@test.local' } } as never);
    mockResolveMyStudentProfile.mockResolvedValue(null);
    const result = await requireStudent(req());
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(404);
  });

  it('returns the student context when linked', async () => {
    mockRequireAuth.mockResolvedValue({ user: { sub: 'user_1', email: 'x@test.local' } } as never);
    mockResolveMyStudentProfile.mockResolvedValue({
      studentId: 'student_1',
      schoolId: 'school_1',
      classId: 'class_1',
      academicYearId: 'year_1',
    });
    const result = await requireStudent(req());
    expect(result).toEqual({
      user: { sub: 'user_1', email: 'x@test.local' },
      student: {
        studentId: 'student_1',
        schoolId: 'school_1',
        classId: 'class_1',
        academicYearId: 'year_1',
      },
    });
  });
});
