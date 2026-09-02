import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware/require-student', () => ({ requireStudent: vi.fn() }));
vi.mock('@/lib/server/student-views/appreciations', () => ({
  getStudentAppreciations: vi.fn(),
}));

import { requireStudent } from '@/lib/server/middleware/require-student';
import { getStudentAppreciations } from '@/lib/server/student-views/appreciations';
import { GET } from './route';

const mockRequireStudent = vi.mocked(requireStudent);
const mockView = vi.mocked(getStudentAppreciations);

const studentCtx = {
  user: { sub: 'user_1', email: 'eleve@test.local' },
  student: { studentId: 'stu_1', schoolId: 'school_1', classId: 'cls_1', academicYearId: 'year_1' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudent.mockResolvedValue(studentCtx as never);
  mockView.mockResolvedValue({
    studentId: 'stu_1',
    prevStudentId: null,
    nextStudentId: null,
    general: null,
    subjects: [],
  } as never);
});

describe('GET /api/student/appreciations', () => {
  it('passes the requireStudent response through without building the view', async () => {
    mockRequireStudent.mockResolvedValue(
      NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }) as never,
    );
    const res = await GET(new NextRequest('http://localhost/api/student/appreciations'));
    expect(res.status).toBe(404);
    expect(mockView).not.toHaveBeenCalled();
  });

  it('builds the student-audience view for the session student', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/student/appreciations?termId=term_1'),
    );
    expect(res.status).toBe(200);
    expect(mockView).toHaveBeenCalledWith({
      studentId: 'stu_1',
      termId: 'term_1',
      audience: 'student',
    });
    expect(await res.json()).toMatchObject({ prevStudentId: null, nextStudentId: null });
  });

  it('returns 404 when the student has no enrollment', async () => {
    mockView.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/api/student/appreciations'));
    expect(res.status).toBe(404);
  });
});
