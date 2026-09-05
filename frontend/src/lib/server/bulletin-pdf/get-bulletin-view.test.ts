// getStudentBulletinView — the audience switch. prismaMock first
// (auto-hoists vi.mock for '@/lib/server/prisma').
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { getStudentBulletinView } from './get-bulletin-view';

const T_START = new Date('2025-09-01T00:00:00.000Z');
// Ends far in the future so resolveCurrentTerm picks it whatever the run date.
const T_END = new Date('2099-12-31T00:00:00.000Z');

beforeEach(() => {
  prismaMock.student.findUnique.mockResolvedValue({
    id: 'stu_1',
    schoolId: 'school_1',
    firstName: 'Nadia',
    lastName: 'Joseph',
    studentNumber: 'EL-2025-002',
    dateOfBirth: new Date('2012-03-04T00:00:00.000Z'),
  } as never);
  prismaMock.school.findUnique.mockResolvedValue({
    id: 'school_1',
    name: 'École Les Étoiles',
    address: null,
    phone: null,
    officialEmail: null,
    logoUrl: null,
    directorSignatureUrl: null,
  } as never);
  prismaMock.enrollment.findFirst.mockResolvedValue({
    studentId: 'stu_1',
    classId: 'cls_1',
    class: { id: 'cls_1', name: '6ème A', academicYearId: 'year_1', homeroomTeacher: null },
  } as never);
  prismaMock.term.findMany.mockResolvedValue([
    { id: 'term_1', label: '1er Trimestre', order: 1, startDate: T_START, endDate: T_END },
  ] as never);
  prismaMock.academicYear.findUnique.mockResolvedValue({
    id: 'year_1',
    label: '2025-2026',
  } as never);
  // Roster order (lastName asc): Alexis, Joseph (self), Louis.
  prismaMock.enrollment.findMany.mockResolvedValue([
    { studentId: 'stu_0', student: { id: 'stu_0', firstName: 'Frantz', lastName: 'Alexis' } },
    { studentId: 'stu_1', student: { id: 'stu_1', firstName: 'Nadia', lastName: 'Joseph' } },
    { studentId: 'stu_2', student: { id: 'stu_2', firstName: 'Paul', lastName: 'Louis' } },
  ] as never);
  prismaMock.bulletinTemplate.findFirst.mockResolvedValue({
    id: 'tpl_1',
    name: 'Standard',
    config: { pageFormat: 'A4', orientation: 'PORTRAIT' },
    isActive: true,
  } as never);
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
    { id: 'ap_gen', subjectId: null, text: 'Bon trimestre.', status: 'PUBLISHED' },
    { id: 'ap_math', subjectId: 'sub_1', text: 'Excellent.', status: 'PUBLISHED' },
  ] as never);
});

describe('getStudentBulletinView', () => {
  it('returns null for a student of another school', async () => {
    expect(await getStudentBulletinView('other_school', 'stu_1', null)).toBeNull();
  });

  it('staff audience (default) keeps the roster navigation and reads every appreciation', async () => {
    const view = await getStudentBulletinView('school_1', 'stu_1', null);
    expect(view).toMatchObject({
      studentIndex: 2,
      prevStudentId: 'stu_0',
      nextStudentId: 'stu_2',
      classSize: 3,
      rank: 2,
      rankedCount: 3,
      overallAverage: 14,
      generalAppreciation: 'Bon trimestre.',
    });
    expect(view?.subjects[0]).toMatchObject({
      subjectName: 'Mathématiques',
      average: 14,
      min: 10,
      max: 18,
      appreciation: 'Excellent.',
    });
    expect(
      (prismaMock.appreciation.findMany.mock.calls[0]?.[0]?.where as Record<string, unknown>)
        .status,
    ).toBeUndefined();
    expect(
      (prismaMock.evaluation.findMany.mock.calls[0]?.[0]?.where as Record<string, unknown>).status,
    ).toBeUndefined();
  });

  it('student audience nulls the roster navigation and reads PUBLISHED rows only', async () => {
    const view = await getStudentBulletinView('school_1', 'stu_1', null, 'student');
    expect(view).toMatchObject({
      studentIndex: null,
      prevStudentId: null,
      nextStudentId: null,
      classSize: 3,
      rank: 2,
      rankedCount: 3,
      classAverage: 14,
      generalAppreciation: 'Bon trimestre.',
    });
    expect(prismaMock.appreciation.findMany.mock.calls[0]?.[0]?.where).toEqual({
      studentId: 'stu_1',
      termId: 'term_1',
      status: 'PUBLISHED',
    });
    expect(
      (prismaMock.evaluation.findMany.mock.calls[0]?.[0]?.where as Record<string, unknown>).status,
    ).toBe('PUBLISHED');
  });

  it('loads only NUMERIC subjects into the grades table (qualitative ones never reach grades.ts)', async () => {
    const view = await getStudentBulletinView('school_1', 'stu_1', null);
    expect(prismaMock.classSubject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { classId: 'cls_1', subject: { evaluationMode: 'NUMERIC' } },
      }),
    );
    expect(view?.overallAverage).toBe(14);
    expect(view?.rank).toBe(2);
  });
});
