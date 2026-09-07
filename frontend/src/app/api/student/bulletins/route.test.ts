import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware/require-student', () => ({ requireStudent: vi.fn() }));
vi.mock('@/lib/server/student-views/bulletins', () => ({
  getStudentBulletinSummaries: vi.fn(),
}));

import { requireStudent } from '@/lib/server/middleware/require-student';
import { getStudentBulletinSummaries } from '@/lib/server/student-views/bulletins';
import { GET } from './route';

const mockRequireStudent = vi.mocked(requireStudent);
const mockView = vi.mocked(getStudentBulletinSummaries);

const studentCtx = {
  user: { sub: 'user_1', email: 'eleve@test.local' },
  student: { studentId: 'stu_1', schoolId: 'school_1', classId: 'cls_1', academicYearId: 'year_1' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudent.mockResolvedValue(studentCtx as never);
  mockView.mockResolvedValue({
    terms: [{ termId: 't1', label: 'T1', order: 1, overallAverage: 14, rank: 2, rankedCount: 20 }],
  });
});

describe('GET /api/student/bulletins', () => {
  it('passes the requireStudent response through without building the view', async () => {
    mockRequireStudent.mockResolvedValue(
      NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }) as never,
    );
    const res = await GET(new NextRequest('http://localhost/api/student/bulletins'));
    expect(res.status).toBe(404);
    expect(mockView).not.toHaveBeenCalled();
  });

  it('lists the session student bulletins for the student audience', async () => {
    const res = await GET(new NextRequest('http://localhost/api/student/bulletins'));
    expect(res.status).toBe(200);
    expect(mockView).toHaveBeenCalledWith({ studentId: 'stu_1', audience: 'student' });
    expect(await res.json()).toEqual({
      terms: [
        { termId: 't1', label: 'T1', order: 1, overallAverage: 14, rank: 2, rankedCount: 20 },
      ],
    });
  });
});
