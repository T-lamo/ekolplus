// GET /api/student/me — the Espace Élève's one aggregate read. prismaMock
// first (auto-hoists vi.mock for '@/lib/server/prisma').
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

function req() {
  return new NextRequest('http://localhost/api/student/me');
}

const T1_START = new Date('2025-09-01T00:00:00.000Z');
// Ends far in the future so resolveCurrentTerm picks it whatever the run date.
const T1_END = new Date('2099-12-31T00:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudent.mockResolvedValue(studentCtx as never);
  mockResolveYear.mockResolvedValue({ id: 'year_1', label: '2025-2026', startDate: T1_START });
  prismaMock.student.findUniqueOrThrow.mockResolvedValue({
    id: 'stu_1',
    studentNumber: 'EL-2025-001',
    firstName: 'Nadia',
    lastName: 'Joseph',
    photoUrl: null,
    dateOfBirth: new Date('2012-03-04T00:00:00.000Z'),
    placeOfBirth: 'Port-au-Prince',
    gender: 'Féminin',
    nationality: 'Haïtienne',
    address: 'Delmas 33',
    motherTongue: 'Créole',
    phone: null,
    email: 'nadia.joseph@eleves.test.local',
    status: 'ENROLLED',
    enrolledAt: new Date('2025-09-02T00:00:00.000Z'),
    scholarship: false,
    guardians: [
      {
        id: 'g_1',
        name: 'Marie Joseph',
        relationship: 'Mère',
        phone: '+509 3700 0000',
        email: null,
        isPrimary: true,
      },
    ],
  } as never);
  prismaMock.school.findUniqueOrThrow.mockResolvedValue({
    id: 'school_1',
    name: 'École Les Étoiles',
  } as never);
  prismaMock.class.findUnique.mockResolvedValue({
    id: 'cls_1',
    name: '6ème A',
    level: '6ème',
    homeroomTeacher: { id: 'tea_1', name: 'Carline Michel' },
  } as never);
  prismaMock.term.findMany.mockResolvedValue([
    {
      id: 'term_1',
      label: '1er Trimestre',
      order: 1,
      type: 'TRIMESTRE',
      startDate: T1_START,
      endDate: T1_END,
    },
  ] as never);
  prismaMock.timetableSession.findMany.mockResolvedValue([]);
  groupByMock.mockResolvedValue([]);
  prismaMock.classSubject.findMany.mockResolvedValue([
    { id: 'cs_1', classId: 'cls_1', subjectId: 'sub_1', coefficient: 2 },
  ] as never);
  prismaMock.enrollment.findMany.mockResolvedValue([
    { studentId: 'stu_1' },
    { studentId: 'stu_2' },
  ] as never);
  prismaMock.attendance.findMany.mockResolvedValue([
    { status: 'PRESENT' },
    { status: 'PRESENT' },
    { status: 'ABSENT' },
    { status: 'LATE' },
  ] as never);
  prismaMock.evaluation.findMany.mockResolvedValue([
    {
      id: 'ev_1',
      classSubjectId: 'cs_1',
      coefficient: 1,
      maxScore: 20,
      status: 'PUBLISHED',
      countsTowardAverage: true,
      grades: [
        { studentId: 'stu_1', score: 14, absent: false },
        { studentId: 'stu_2', score: 16, absent: false },
      ],
    },
  ] as never);
  prismaMock.grade.findMany.mockResolvedValue([]);
});

describe('GET /api/student/me', () => {
  it('passes the requireStudent response through without touching the DB', async () => {
    mockRequireStudent.mockResolvedValue(
      NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }) as never,
    );
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect(prismaMock.student.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('reads the session student only and never the staff-only notes field', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const call = prismaMock.student.findUniqueOrThrow.mock.calls[0]?.[0];
    expect(call?.where).toEqual({ id: 'stu_1' });
    const select = call?.select as Record<string, unknown>;
    expect(select.notes).toBeUndefined();
    expect(select.userId).toBeUndefined();
    const body = await res.json();
    expect(body.student).toMatchObject({
      id: 'stu_1',
      studentNumber: 'EL-2025-001',
      firstName: 'Nadia',
      lastName: 'Joseph',
      dateOfBirth: '2012-03-04T00:00:00.000Z',
      enrolledAt: '2025-09-02T00:00:00.000Z',
    });
    expect(body.student.notes).toBeUndefined();
    expect(body.student.guardians).toEqual([
      {
        id: 'g_1',
        name: 'Marie Joseph',
        relationship: 'Mère',
        phone: '+509 3700 0000',
        email: null,
        isPrimary: true,
      },
    ]);
  });

  it('returns school, class, homeroom teacher, academic year, terms and currentTermId', async () => {
    const body = await (await GET(req())).json();
    expect(body.school).toEqual({ id: 'school_1', name: 'École Les Étoiles' });
    expect(body.class).toEqual({ id: 'cls_1', name: '6ème A', level: '6ème' });
    expect(body.homeroomTeacher).toEqual({ id: 'tea_1', name: 'Carline Michel' });
    expect(body.academicYear).toEqual({ id: 'year_1', label: '2025-2026' });
    expect(body.terms).toEqual([
      {
        id: 'term_1',
        label: '1er Trimestre',
        order: 1,
        type: 'TRIMESTRE',
        startDate: T1_START.toISOString(),
        endDate: T1_END.toISOString(),
      },
    ]);
    expect(body.currentTermId).toBe('term_1');
    expect(prismaMock.class.findUnique.mock.calls[0]?.[0]?.where).toEqual({ id: 'cls_1' });
  });

  it("scopes this week's sessions to the student's own class, school and active year", async () => {
    await GET(req());
    const where = prismaMock.timetableSession.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({
      schoolId: 'school_1',
      academicYearId: 'year_1',
      classId: 'cls_1',
    });
  });

  it('computes the current-term summary from PUBLISHED evaluations and the term attendance rows', async () => {
    const body = await (await GET(req())).json();
    expect(prismaMock.evaluation.findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      termId: 'term_1',
      status: 'PUBLISHED',
    });
    expect(prismaMock.attendance.findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      studentId: 'stu_1',
      date: { gte: T1_START, lte: T1_END },
    });
    expect(body.summary).toEqual({
      overallAverage: 14,
      rank: 2,
      rankedCount: 2,
      attendanceRatePercent: 75,
      absences: 1,
    });
  });

  it('returns the 5 most recent PUBLISHED grades, dated ones newest first, undated last', async () => {
    const row = (id: string, date: Date | null, updatedAt: Date) => ({
      score: 12,
      absent: false,
      evaluation: {
        id,
        label: id,
        date,
        updatedAt,
        maxScore: 20,
        classSubject: { subject: { name: 'Maths', icon: null, color: null } },
      },
    });
    prismaMock.grade.findMany.mockResolvedValue([
      row('undated_new', null, new Date('2026-02-01T00:00:00.000Z')),
      row('old', new Date('2026-01-05T00:00:00.000Z'), new Date('2026-01-05T00:00:00.000Z')),
      row('new', new Date('2026-01-20T00:00:00.000Z'), new Date('2026-01-20T00:00:00.000Z')),
      row('undated_old', null, new Date('2026-01-01T00:00:00.000Z')),
      row('mid', new Date('2026-01-10T00:00:00.000Z'), new Date('2026-01-10T00:00:00.000Z')),
      row('oldest', new Date('2025-12-01T00:00:00.000Z'), new Date('2025-12-01T00:00:00.000Z')),
    ] as never);
    const body = await (await GET(req())).json();
    expect(prismaMock.grade.findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      studentId: 'stu_1',
      evaluation: { status: 'PUBLISHED', term: { academicYearId: 'year_1' } },
    });
    expect(body.recentGrades.map((g: { evaluationId: string }) => g.evaluationId)).toEqual([
      'new',
      'mid',
      'old',
      'oldest',
      'undated_new',
    ]);
    expect(body.recentGrades[0]).toEqual({
      evaluationId: 'new',
      label: 'new',
      subjectName: 'Maths',
      subjectIcon: null,
      subjectColor: null,
      date: '2026-01-20T00:00:00.000Z',
      score: 12,
      maxScore: 20,
      absent: false,
    });
  });

  it('degrades gracefully without a current enrollment: no class, no sessions, empty summary', async () => {
    mockRequireStudent.mockResolvedValue({
      ...studentCtx,
      student: { ...studentCtx.student, classId: null, academicYearId: null },
    } as never);
    const body = await (await GET(req())).json();
    expect(body.class).toBeNull();
    expect(body.homeroomTeacher).toBeNull();
    expect(body.thisWeekSessions).toEqual([]);
    expect(body.summary).toEqual({
      overallAverage: null,
      rank: null,
      rankedCount: 0,
      attendanceRatePercent: null,
      absences: 0,
    });
    expect(prismaMock.class.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.timetableSession.findMany).not.toHaveBeenCalled();
    expect(prismaMock.evaluation.findMany).not.toHaveBeenCalled();
  });

  it('returns empty terms, null currentTermId and no recent grades when no academic year is active', async () => {
    mockResolveYear.mockResolvedValue(null);
    const body = await (await GET(req())).json();
    expect(body.academicYear).toBeNull();
    expect(body.terms).toEqual([]);
    expect(body.currentTermId).toBeNull();
    expect(body.recentGrades).toEqual([]);
    expect(prismaMock.term.findMany).not.toHaveBeenCalled();
    expect(prismaMock.grade.findMany).not.toHaveBeenCalled();
  });
});
