// getStudentAttendance. prismaMock first (auto-hoists vi.mock for
// '@/lib/server/prisma').
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { getStudentAttendance } from './attendance';

const T1_START = new Date('2025-09-01T00:00:00.000Z');
const T1_END = new Date('2025-11-30T00:00:00.000Z');
const T2_START = new Date('2025-12-01T00:00:00.000Z');
// Ends far in the future so resolveCurrentTerm picks it whatever the run date.
const T2_END = new Date('2099-12-31T00:00:00.000Z');

beforeEach(() => {
  prismaMock.student.findUniqueOrThrow.mockResolvedValue({
    firstName: 'Nadia',
    lastName: 'Joseph',
  } as never);
  prismaMock.enrollment.findFirst.mockResolvedValue({
    class: { academicYearId: 'year_1' },
  } as never);
  prismaMock.term.findMany.mockResolvedValue([
    { id: 'term_1', label: '1er Trimestre', order: 1, startDate: T1_START, endDate: T1_END },
    { id: 'term_2', label: '2e Trimestre', order: 2, startDate: T2_START, endDate: T2_END },
  ] as never);
  prismaMock.attendance.findMany.mockResolvedValue([
    {
      date: new Date('2025-12-02T00:00:00.000Z'),
      status: 'PRESENT',
      justification: null,
    },
    {
      date: new Date('2025-12-03T00:00:00.000Z'),
      status: 'ABSENT',
      justification: 'Malade',
    },
    {
      date: new Date('2025-12-04T00:00:00.000Z'),
      status: 'LATE',
      justification: null,
    },
    {
      date: new Date('2025-12-05T00:00:00.000Z'),
      status: 'EXCUSED',
      justification: 'Rendez-vous',
    },
  ] as never);
});

describe('getStudentAttendance', () => {
  it('returns null when the student has no enrollment', async () => {
    prismaMock.enrollment.findFirst.mockResolvedValue(null);
    expect(await getStudentAttendance({ studentId: 'stu_1', termId: null })).toBeNull();
    expect(prismaMock.attendance.findMany).not.toHaveBeenCalled();
  });

  it('resolves the current term by default and scopes the rows on the student and the term window', async () => {
    const view = await getStudentAttendance({ studentId: 'stu_1', termId: null });
    expect(view?.resolvedTermId).toBe('term_2');
    expect(prismaMock.attendance.findMany.mock.calls[0]?.[0]?.where).toEqual({
      studentId: 'stu_1',
      date: { gte: T2_START, lte: T2_END },
    });
    expect(view).toMatchObject({
      studentId: 'stu_1',
      firstName: 'Nadia',
      lastName: 'Joseph',
      summary: { present: 1, absent: 1, late: 1, excused: 1, recorded: 4 },
      // absenceCount counts ABSENT + EXCUSED (a justification explains an
      // absence, it doesn't erase it); attendanceRate counts PRESENT + LATE.
      absences: 2,
      ratePercent: 50,
    });
    expect(view?.days).toEqual([
      { date: '2025-12-02', status: 'PRESENT', justification: null },
      { date: '2025-12-03', status: 'ABSENT', justification: 'Malade' },
      { date: '2025-12-04', status: 'LATE', justification: null },
      { date: '2025-12-05', status: 'EXCUSED', justification: 'Rendez-vous' },
    ]);
    expect(view?.terms.map((t) => t.id)).toEqual(['term_1', 'term_2']);
  });

  it('honours an explicit termId', async () => {
    const view = await getStudentAttendance({ studentId: 'stu_1', termId: 'term_1' });
    expect(view?.resolvedTermId).toBe('term_1');
    expect(prismaMock.attendance.findMany.mock.calls[0]?.[0]?.where).toEqual({
      studentId: 'stu_1',
      date: { gte: T1_START, lte: T1_END },
    });
  });

  it('returns the empty summary for an unknown termId', async () => {
    const view = await getStudentAttendance({ studentId: 'stu_1', termId: 'nope' });
    expect(view?.resolvedTermId).toBeNull();
    expect(view?.days).toEqual([]);
    expect(view?.ratePercent).toBeNull();
    expect(prismaMock.attendance.findMany).not.toHaveBeenCalled();
  });
});
