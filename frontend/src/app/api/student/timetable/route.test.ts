// GET /api/student/timetable. prismaMock first (auto-hoists vi.mock for
// '@/lib/server/prisma').
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware/require-student', () => ({ requireStudent: vi.fn() }));
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveActiveAcademicYear: vi.fn() };
});

import { requireStudent } from '@/lib/server/middleware/require-student';
import { resolveActiveAcademicYear } from '@/lib/server/school';
import { GET } from './route';

const mockRequireStudent = vi.mocked(requireStudent);
const mockResolveYear = vi.mocked(resolveActiveAcademicYear);
const groupByMock = prismaMock.timetableSession.groupBy as unknown as ReturnType<typeof vi.fn>;

const studentCtx = {
  user: { sub: 'user_1', email: 'eleve@test.local' },
  student: { studentId: 'stu_1', schoolId: 'school_1', classId: 'cls_1', academicYearId: 'year_1' },
};

function req(qs: string) {
  return new NextRequest(`http://localhost/api/student/timetable${qs}`);
}

const SESSION_ROW = {
  id: 'ses_1',
  academicYearId: 'year_1',
  classId: 'cls_1',
  class: { id: 'cls_1', name: '6ème A', color: null },
  subjectId: 'sub_1',
  subject: {
    id: 'sub_1',
    name: 'Mathématiques',
    abbreviation: 'MATH',
    color: '#123456',
    icon: null,
  },
  teacherId: 'tea_1',
  teacher: { id: 'tea_1', name: 'Carline Michel', photoUrl: null },
  room: ' B12 ',
  roomId: null,
  type: 'CM',
  color: null,
  date: new Date('2026-09-07T00:00:00.000Z'),
  startMinutes: 480,
  endMinutes: 570,
  description: null,
  meetingUrl: null,
  seriesId: 'series_1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudent.mockResolvedValue(studentCtx as never);
  mockResolveYear.mockResolvedValue({
    id: 'year_1',
    label: '2025-2026',
    startDate: new Date('2025-09-01T00:00:00.000Z'),
  });
  prismaMock.timetableSession.findMany.mockResolvedValue([SESSION_ROW] as never);
  groupByMock.mockResolvedValue([{ seriesId: 'series_1', _count: { _all: 12 } }]);
});

describe('GET /api/student/timetable', () => {
  it('passes the requireStudent response through without touching the DB', async () => {
    mockRequireStudent.mockResolvedValue(
      NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }) as never,
    );
    const res = await GET(req('?from=2026-09-07&to=2026-09-13'));
    expect(res.status).toBe(404);
    expect(prismaMock.timetableSession.findMany).not.toHaveBeenCalled();
  });

  it('rejects missing or malformed from/to', async () => {
    expect((await GET(req(''))).status).toBe(400);
    expect((await GET(req('?from=2026-09-07'))).status).toBe(400);
    expect((await GET(req('?from=07/09/2026&to=2026-09-13'))).status).toBe(400);
    expect(prismaMock.timetableSession.findMany).not.toHaveBeenCalled();
  });

  it('rejects a reversed range and a range wider than 62 days', async () => {
    expect((await GET(req('?from=2026-09-13&to=2026-09-07'))).status).toBe(400);
    expect((await GET(req('?from=2026-09-01&to=2026-11-03'))).status).toBe(400);
    expect((await GET(req('?from=2026-09-01&to=2026-11-02'))).status).toBe(200);
  });

  it('returns an empty payload without an active academic year', async () => {
    mockResolveYear.mockResolvedValue(null);
    const body = await (await GET(req('?from=2026-09-07&to=2026-09-13'))).json();
    expect(body).toEqual({ academicYear: null, sessions: [], rooms: [] });
    expect(prismaMock.timetableSession.findMany).not.toHaveBeenCalled();
  });

  it('returns no sessions without a current enrollment and never queries the DB', async () => {
    mockRequireStudent.mockResolvedValue({
      ...studentCtx,
      student: { ...studentCtx.student, classId: null, academicYearId: null },
    } as never);
    const body = await (await GET(req('?from=2026-09-07&to=2026-09-13'))).json();
    expect(body).toEqual({
      academicYear: { id: 'year_1', label: '2025-2026' },
      sessions: [],
      rooms: [],
    });
    expect(prismaMock.timetableSession.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query on the student's own class, school, year and range", async () => {
    const res = await GET(req('?from=2026-09-07&to=2026-09-13'));
    expect(res.status).toBe(200);
    expect(prismaMock.timetableSession.findMany.mock.calls[0]?.[0]?.where).toEqual({
      schoolId: 'school_1',
      academicYearId: 'year_1',
      classId: 'cls_1',
      date: {
        gte: new Date('2026-09-07T00:00:00.000Z'),
        lte: new Date('2026-09-13T00:00:00.000Z'),
      },
    });
    const body = await res.json();
    expect(body.academicYear).toEqual({ id: 'year_1', label: '2025-2026' });
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]).toMatchObject({
      id: 'ses_1',
      date: '2026-09-07',
      startMinutes: 480,
      endMinutes: 570,
      subject: { name: 'Mathématiques' },
      teacher: { name: 'Carline Michel' },
      class: { name: '6ème A' },
      color: '#123456',
      seriesCount: 12,
    });
    expect(body.rooms).toEqual(['B12']);
  });
});
