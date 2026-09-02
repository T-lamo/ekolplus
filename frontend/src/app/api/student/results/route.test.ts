import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware/require-student', () => ({ requireStudent: vi.fn() }));
vi.mock('@/lib/server/student-views/results', () => ({ getStudentResults: vi.fn() }));

import { requireStudent } from '@/lib/server/middleware/require-student';
import { getStudentResults } from '@/lib/server/student-views/results';
import { GET } from './route';

const mockRequireStudent = vi.mocked(requireStudent);
const mockView = vi.mocked(getStudentResults);

const studentCtx = {
  user: { sub: 'user_1', email: 'eleve@test.local' },
  student: { studentId: 'stu_1', schoolId: 'school_1', classId: 'cls_1', academicYearId: 'year_1' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudent.mockResolvedValue(studentCtx as never);
  mockView.mockResolvedValue({ enrolled: true, ranking: [], subjects: [] } as never);
});

describe('GET /api/student/results', () => {
  it('passes the requireStudent response through without building the view', async () => {
    mockRequireStudent.mockResolvedValue(
      NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }) as never,
    );
    const res = await GET(new NextRequest('http://localhost/api/student/results'));
    expect(res.status).toBe(404);
    expect(mockView).not.toHaveBeenCalled();
  });

  it('builds the student-audience view for the session student and echoes the query params', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/student/results?academicYearId=year_0&termId=all'),
    );
    expect(res.status).toBe(200);
    expect(mockView).toHaveBeenCalledWith({
      schoolId: 'school_1',
      studentId: 'stu_1',
      academicYearId: 'year_0',
      termId: 'all',
      audience: 'student',
    });
    expect(await res.json()).toEqual({ enrolled: true, ranking: [], subjects: [] });
  });

  it('passes null query params when absent', async () => {
    await GET(new NextRequest('http://localhost/api/student/results'));
    expect(mockView.mock.calls[0]?.[0]).toMatchObject({ academicYearId: null, termId: null });
  });
});
