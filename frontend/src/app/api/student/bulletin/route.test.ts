import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware/require-student', () => ({ requireStudent: vi.fn() }));
vi.mock('@/lib/server/bulletin-pdf/get-bulletin-view', () => ({
  getStudentBulletinView: vi.fn(),
}));

import { requireStudent } from '@/lib/server/middleware/require-student';
import { getStudentBulletinView } from '@/lib/server/bulletin-pdf/get-bulletin-view';
import { GET } from './route';

const mockRequireStudent = vi.mocked(requireStudent);
const mockView = vi.mocked(getStudentBulletinView);

const studentCtx = {
  user: { sub: 'user_1', email: 'eleve@test.local' },
  student: { studentId: 'stu_1', schoolId: 'school_1', classId: 'cls_1', academicYearId: 'year_1' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudent.mockResolvedValue(studentCtx as never);
  mockView.mockResolvedValue({ studentId: 'stu_1', prevStudentId: null, subjects: [] } as never);
});

describe('GET /api/student/bulletin', () => {
  it('passes the requireStudent response through without building the view', async () => {
    mockRequireStudent.mockResolvedValue(
      NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }) as never,
    );
    const res = await GET(new NextRequest('http://localhost/api/student/bulletin?termId=t1'));
    expect(res.status).toBe(404);
    expect(mockView).not.toHaveBeenCalled();
  });

  it('builds the student-audience view for the session student and term', async () => {
    const res = await GET(new NextRequest('http://localhost/api/student/bulletin?termId=t1'));
    expect(res.status).toBe(200);
    expect(mockView).toHaveBeenCalledWith('school_1', 'stu_1', 't1', 'student');
    expect(await res.json()).toMatchObject({ studentId: 'stu_1', prevStudentId: null });
  });

  it('returns 404 when the view is unavailable', async () => {
    mockView.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/api/student/bulletin'));
    expect(res.status).toBe(404);
    expect(mockView).toHaveBeenCalledWith('school_1', 'stu_1', null, 'student');
  });
});
