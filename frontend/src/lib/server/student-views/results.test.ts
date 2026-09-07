// getStudentResults — the audience switch. prismaMock first (auto-hoists
// vi.mock for '@/lib/server/prisma').
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { getStudentResults } from './results';

const T_START = new Date('2025-09-01T00:00:00.000Z');
// Ends far in the future so resolveCurrentTerm picks it whatever the run date.
const T_END = new Date('2099-12-31T00:00:00.000Z');

function evaluation(id: string, status: 'PUBLISHED' | 'DRAFT', scores: [string, number][]) {
  return {
    id,
    label: id,
    classSubjectId: 'cs_1',
    coefficient: 1,
    maxScore: 20,
    status,
    countsTowardAverage: true,
    grades: scores.map(([studentId, score]) => ({ studentId, score, absent: false })),
  };
}

const baseInput = {
  schoolId: 'school_1',
  studentId: 'stu_1',
  academicYearId: null,
  termId: null,
};

beforeEach(() => {
  prismaMock.academicYear.findMany.mockResolvedValue([
    { id: 'year_1', label: '2025-2026', isActive: true, startDate: T_START },
  ] as never);
  prismaMock.term.findMany.mockResolvedValue([
    { id: 'term_1', label: '1er Trimestre', order: 1, startDate: T_START, endDate: T_END },
  ] as never);
  prismaMock.enrollment.findUnique.mockResolvedValue({
    studentId: 'stu_1',
    classId: 'cls_1',
    class: { id: 'cls_1', name: '6ème A' },
  } as never);
  prismaMock.classSubject.findMany.mockResolvedValue([
    {
      id: 'cs_1',
      classId: 'cls_1',
      subjectId: 'sub_1',
      coefficient: 2,
      subject: { name: 'Mathématiques', domain: 'Sciences' },
    },
  ] as never);
  prismaMock.evaluation.findMany.mockResolvedValue([
    evaluation('ev_pub', 'PUBLISHED', [
      ['stu_1', 12],
      ['stu_2', 16],
    ]),
    evaluation('ev_draft', 'DRAFT', [
      ['stu_1', 5],
      ['stu_2', 5],
    ]),
  ] as never);
  prismaMock.enrollment.findMany.mockResolvedValue([
    { studentId: 'stu_1', student: { id: 'stu_1', firstName: 'Nadia', lastName: 'Joseph' } },
    { studentId: 'stu_2', student: { id: 'stu_2', firstName: 'Paul', lastName: 'Louis' } },
  ] as never);
  prismaMock.goal.findMany.mockResolvedValue([]);
});

describe('getStudentResults', () => {
  it('staff audience keeps the nominative ranking and lists draft evaluations', async () => {
    const view = await getStudentResults({ ...baseInput, audience: 'staff' });
    expect(view.enrolled).toBe(true);
    expect(view.ranking.map((r) => [r.name, r.position, r.isSelf])).toEqual([
      ['Paul Louis', 1, false],
      ['Nadia Joseph', 2, true],
    ]);
    expect(view.subjects[0]?.evaluations.map((e) => e.id)).toEqual(['ev_pub', 'ev_draft']);
    const where = prismaMock.evaluation.findMany.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where.status).toBeUndefined();
  });

  it('student audience empties the ranking, keeps the rank, and asks only for PUBLISHED evaluations', async () => {
    const view = await getStudentResults({ ...baseInput, audience: 'student' });
    expect(view.ranking).toEqual([]);
    expect(view.rank).toBe(2);
    expect(view.rankedCount).toBe(2);
    expect(view.overallAverage).toBe(12);
    expect(view.classOverallAverage).toBe(14);
    expect(prismaMock.evaluation.findMany).toHaveBeenCalled();
    for (const call of prismaMock.evaluation.findMany.mock.calls) {
      expect((call[0]?.where as Record<string, unknown>).status).toBe('PUBLISHED');
    }
  });

  it('scopes the enrollment lookup on the given studentId and year', async () => {
    await getStudentResults({ ...baseInput, audience: 'student' });
    expect(prismaMock.enrollment.findUnique.mock.calls[0]?.[0]?.where).toEqual({
      studentId_academicYearId: { studentId: 'stu_1', academicYearId: 'year_1' },
    });
  });

  it('returns the empty shell when the student has no enrollment for the year', async () => {
    prismaMock.enrollment.findUnique.mockResolvedValue(null);
    const view = await getStudentResults({ ...baseInput, audience: 'student' });
    expect(view.enrolled).toBe(false);
    expect(view.resolvedAcademicYearId).toBe('year_1');
    expect(view.resolvedTermId).toBe('term_1');
    expect(view.subjects).toEqual([]);
    expect(view.ranking).toEqual([]);
  });

  it('returns termMode NONE and no years when the school has no academic year', async () => {
    prismaMock.academicYear.findMany.mockResolvedValue([]);
    const view = await getStudentResults({ ...baseInput, audience: 'staff' });
    expect(view).toMatchObject({ years: [], terms: [], termMode: 'NONE', enrolled: false });
  });

  it('loads only NUMERIC subjects', async () => {
    await getStudentResults({
      schoolId: 'school_1',
      studentId: 'stu_1',
      academicYearId: null,
      termId: null,
      audience: 'staff',
    });
    expect(prismaMock.classSubject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ subject: { evaluationMode: 'NUMERIC' } }),
      }),
    );
  });
});
