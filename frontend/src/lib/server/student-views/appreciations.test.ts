// getStudentAppreciations — the audience switch. prismaMock first
// (auto-hoists vi.mock for '@/lib/server/prisma').
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { getStudentAppreciations } from './appreciations';

const T_START = new Date('2025-09-01T00:00:00.000Z');
// Ends far in the future so resolveCurrentTerm picks it whatever the run date.
const T_END = new Date('2099-12-31T00:00:00.000Z');

const NOW = new Date('2025-10-01T00:00:00.000Z');

beforeEach(() => {
  prismaMock.student.findUniqueOrThrow.mockResolvedValue({
    firstName: 'Nadia',
    lastName: 'Joseph',
    studentNumber: 'EL-2025-002',
  } as never);
  prismaMock.enrollment.findFirst.mockResolvedValue({
    studentId: 'stu_1',
    classId: 'cls_1',
    class: {
      id: 'cls_1',
      name: '6ème A',
      academicYearId: 'year_1',
      homeroomTeacher: { id: 'tea_1', name: 'Carline Michel' },
    },
  } as never);
  prismaMock.term.findMany.mockResolvedValue([
    { id: 'term_1', label: '1er Trimestre', order: 1, startDate: T_START, endDate: T_END },
  ] as never);
  // Roster order (lastName asc): Alexis, Joseph (self), Louis.
  prismaMock.enrollment.findMany.mockResolvedValue([
    { studentId: 'stu_0', student: { id: 'stu_0', firstName: 'Frantz', lastName: 'Alexis' } },
    { studentId: 'stu_1', student: { id: 'stu_1', firstName: 'Nadia', lastName: 'Joseph' } },
    { studentId: 'stu_2', student: { id: 'stu_2', firstName: 'Paul', lastName: 'Louis' } },
  ] as never);
  prismaMock.classSubject.findMany.mockResolvedValue([
    {
      id: 'cs_1',
      classId: 'cls_1',
      subjectId: 'sub_1',
      coefficient: 2,
      subject: { name: 'Mathématiques', domain: 'Sciences' },
      teacher: { id: 'tea_1', name: 'Carline Michel' },
    },
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
        { studentId: 'stu_0', score: 10, absent: false },
        { studentId: 'stu_1', score: 14, absent: false },
        { studentId: 'stu_2', score: 18, absent: false },
      ],
    },
  ] as never);
  prismaMock.appreciation.findMany.mockResolvedValue([
    {
      id: 'ap_gen',
      subjectId: null,
      termId: 'term_1',
      mention: 'BIEN',
      text: 'Bon trimestre.',
      comportement: 'Bon',
      investissement: 'Sérieux',
      assiduite: 'Régulière',
      status: 'PUBLISHED',
      author: { name: 'Carline Michel', email: 'c@x' },
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'ap_math',
      subjectId: 'sub_1',
      termId: 'term_1',
      mention: 'TRES_BIEN',
      text: 'Excellent.',
      status: 'PUBLISHED',
      author: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ] as never);
});

describe('getStudentAppreciations', () => {
  it('returns null without any enrollment', async () => {
    prismaMock.enrollment.findFirst.mockResolvedValue(null);
    expect(
      await getStudentAppreciations({ studentId: 'stu_1', termId: null, audience: 'staff' }),
    ).toBeNull();
  });

  it('staff audience computes prev/next from the roster order and reads drafts too', async () => {
    const view = await getStudentAppreciations({
      studentId: 'stu_1',
      termId: null,
      audience: 'staff',
    });
    expect(view).toMatchObject({
      studentIndex: 2,
      classSize: 3,
      prevStudentId: 'stu_0',
      nextStudentId: 'stu_2',
      rank: 2,
      rankedCount: 3,
      overallAverage: 14,
      classAverage: 14,
    });
    for (const call of prismaMock.appreciation.findMany.mock.calls) {
      expect((call[0]?.where as Record<string, unknown>).status).toBeUndefined();
    }
  });

  it('student audience nulls the roster navigation and reads PUBLISHED appreciations only', async () => {
    const view = await getStudentAppreciations({
      studentId: 'stu_1',
      termId: null,
      audience: 'student',
    });
    expect(view).toMatchObject({
      studentIndex: null,
      prevStudentId: null,
      nextStudentId: null,
      classSize: 3,
      rank: 2,
      rankedCount: 3,
      classAverage: 14,
    });
    expect(view?.general?.text).toBe('Bon trimestre.');
    expect(view?.subjects[0]).toMatchObject({ subjectName: 'Mathématiques', mention: 'TRES_BIEN' });
    expect(prismaMock.appreciation.findMany).toHaveBeenCalled();
    for (const call of prismaMock.appreciation.findMany.mock.calls) {
      expect((call[0]?.where as Record<string, unknown>).status).toBe('PUBLISHED');
      expect((call[0]?.where as Record<string, unknown>).studentId).toBe('stu_1');
    }
  });

  it('honours an explicit termId and returns the empty body for an unknown one', async () => {
    const view = await getStudentAppreciations({
      studentId: 'stu_1',
      termId: 'nope',
      audience: 'student',
    });
    expect(view?.resolvedTermId).toBeNull();
    expect(view?.general).toBeNull();
    expect(view?.subjects).toEqual([]);
    expect(prismaMock.appreciation.findMany).not.toHaveBeenCalled();
  });
});
