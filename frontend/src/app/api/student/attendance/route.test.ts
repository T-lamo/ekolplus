import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware/require-student', () => ({ requireStudent: vi.fn() }));
vi.mock('@/lib/server/student-views/attendance', () => ({ getStudentAttendance: vi.fn() }));

import { requireStudent } from '@/lib/server/middleware/require-student';
import { getStudentAttendance } from '@/lib/server/student-views/attendance';
import { GET } from './route';

const mockRequireStudent = vi.mocked(requireStudent);
const mockView = vi.mocked(getStudentAttendance);

const studentCtx = {
  user: { sub: 'user_1', email: 'eleve@test.local' },
  student: { studentId: 'stu_1', schoolId: 'school_1', classId: 'cls_1', academicYearId: 'year_1' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudent.mockResolvedValue(studentCtx as never);
  mockView.mockResolvedValue({ studentId: 'stu_1', days: [], absences: 0 } as never);
});

describe('GET /api/student/attendance', () => {
  it('passes the requireStudent response through without building the view', async () => {
    mockRequireStudent.mockResolvedValue(
      NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }) as never,
    );
    const res = await GET(new NextRequest('http://localhost/api/student/attendance'));
    expect(res.status).toBe(404);
    expect(mockView).not.toHaveBeenCalled();
  });

  it('builds the view for the session student with the requested term', async () => {
    const res = await GET(new NextRequest('http://localhost/api/student/attendance?termId=term_2'));
    expect(res.status).toBe(200);
    expect(mockView).toHaveBeenCalledWith({ studentId: 'stu_1', termId: 'term_2' });
    expect(await res.json()).toEqual({ studentId: 'stu_1', days: [], absences: 0 });
  });

  it('returns 404 when the student has no enrollment', async () => {
    mockView.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/api/student/attendance'));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
  });
});
