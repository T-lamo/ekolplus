import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getStudentQualitativeGrids, loadPublishedGrids } from './criteria';

const T_START = new Date('2025-09-01T00:00:00.000Z');
const T_END = new Date('2099-12-31T00:00:00.000Z');

const sheets = [
  {
    classSubjectId: 'cs_1',
    classSubject: {
      subject: {
        name: 'Comportement',
        ratingScale: ['Toujours', 'Souvent', 'Parfois', 'Jamais'],
        criteria: [
          { id: 'cr_1', label: 'Respecte les consignes' },
          { id: 'cr_2', label: 'Partage' },
        ],
      },
    },
    ratings: [{ criterionId: 'cr_2', level: 1 }],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.criteriaAssessment.findMany.mockResolvedValue(sheets as never);
  prismaMock.term.findMany.mockResolvedValue([
    { id: 'term_1', label: '1er Trimestre', order: 1, startDate: T_START, endDate: T_END },
    { id: 'term_2', label: '2e Trimestre', order: 2, startDate: T_END, endDate: T_END },
  ] as never);
});

describe('loadPublishedGrids', () => {
  it('reads PUBLISHED sheets of the class, the student own ticks only, criteria in order', async () => {
    const grids = await loadPublishedGrids({
      classId: 'cls_1',
      studentId: 'stu_1',
      termId: 'term_1',
    });
    expect(grids).toEqual([
      {
        classSubjectId: 'cs_1',
        subjectName: 'Comportement',
        ratingScale: ['Toujours', 'Souvent', 'Parfois', 'Jamais'],
        criteria: [
          { id: 'cr_1', label: 'Respecte les consignes', level: null },
          { id: 'cr_2', label: 'Partage', level: 1 },
        ],
      },
    ]);
    const call = prismaMock.criteriaAssessment.findMany.mock.calls[0]?.[0];
    expect(call?.where).toEqual({
      termId: 'term_1',
      status: 'PUBLISHED',
      classSubject: { classId: 'cls_1', subject: { evaluationMode: 'QUALITATIVE' } },
    });
    expect(call?.orderBy).toEqual({ classSubject: { createdAt: 'asc' } });
    expect((call?.select as { ratings: { where: unknown } }).ratings.where).toEqual({
      studentId: 'stu_1',
    });
  });
});

describe('getStudentQualitativeGrids', () => {
  it('resolves the current term when termId is null', async () => {
    const view = await getStudentQualitativeGrids({
      academicYearId: 'year_1',
      classId: 'cls_1',
      studentId: 'stu_1',
      termId: null,
    });
    expect(view.term).toEqual({ id: 'term_1', label: '1er Trimestre' });
    expect(view.terms).toEqual([
      { id: 'term_1', label: '1er Trimestre' },
      { id: 'term_2', label: '2e Trimestre' },
    ]);
    expect(view.grids).toHaveLength(1);
  });

  it('uses the requested term, and returns no grids for an unknown one', async () => {
    const view = await getStudentQualitativeGrids({
      academicYearId: 'year_1',
      classId: 'cls_1',
      studentId: 'stu_1',
      termId: 'term_2',
    });
    expect(view.term?.id).toBe('term_2');
    const unknown = await getStudentQualitativeGrids({
      academicYearId: 'year_1',
      classId: 'cls_1',
      studentId: 'stu_1',
      termId: 'term_ghost',
    });
    expect(unknown.term).toBeNull();
    expect(unknown.grids).toEqual([]);
  });
});
