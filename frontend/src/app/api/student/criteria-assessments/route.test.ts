import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware/require-student', () => ({ requireStudent: vi.fn() }));
vi.mock('@/lib/server/student-views/criteria', () => ({ getStudentQualitativeGrids: vi.fn() }));

import { requireStudent } from '@/lib/server/middleware/require-student';
import { getStudentQualitativeGrids } from '@/lib/server/student-views/criteria';
import { GET } from './route';

const studentCtx = {
  user: { sub: 'user_1', email: 'eleve@test.local' },
  student: { studentId: 'stu_1', schoolId: 'school_1', classId: 'cls_1', academicYearId: 'year_1' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireStudent).mockResolvedValue(studentCtx as never);
  vi.mocked(getStudentQualitativeGrids).mockResolvedValue({ terms: [], term: null, grids: [] });
});

describe('GET /api/student/criteria-assessments', () => {
  it('passes the requireStudent response through', async () => {
    vi.mocked(requireStudent).mockResolvedValue(
      NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }) as never,
    );
    const res = await GET(new NextRequest('http://localhost/api/student/criteria-assessments'));
    expect(res.status).toBe(404);
    expect(getStudentQualitativeGrids).not.toHaveBeenCalled();
  });

  it('builds the view for the session student only (studentId never a parameter)', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/student/criteria-assessments?termId=term_2'),
    );
    expect(res.status).toBe(200);
    expect(getStudentQualitativeGrids).toHaveBeenCalledWith({
      academicYearId: 'year_1',
      classId: 'cls_1',
      studentId: 'stu_1',
      termId: 'term_2',
    });
    await GET(new NextRequest('http://localhost/api/student/criteria-assessments'));
    expect(vi.mocked(getStudentQualitativeGrids).mock.calls[1]?.[0]?.termId).toBeNull();
  });
});
