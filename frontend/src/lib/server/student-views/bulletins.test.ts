// getStudentBulletinSummaries. prismaMock first (auto-hoists vi.mock for
// '@/lib/server/prisma').
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { getStudentBulletinSummaries } from './bulletins';

beforeEach(() => {
  prismaMock.enrollment.findFirst.mockResolvedValue({
    classId: 'cls_1',
    class: { academicYearId: 'year_1' },
  } as never);
  prismaMock.term.findMany.mockResolvedValue([
    { id: 'term_1', label: '1er Trimestre', order: 1 },
    { id: 'term_2', label: '2e Trimestre', order: 2 },
  ] as never);
  prismaMock.classSubject.findMany.mockResolvedValue([
    { id: 'cs_1', classId: 'cls_1', subjectId: 'sub_1', coefficient: 1 },
  ] as never);
  prismaMock.enrollment.findMany.mockResolvedValue([
    { studentId: 'stu_1' },
    { studentId: 'stu_2' },
  ] as never);
  prismaMock.evaluation.findMany.mockImplementation((async (args: { where: { termId: string } }) =>
    args.where.termId === 'term_1'
      ? [
          {
            id: 'ev_1',
            classSubjectId: 'cs_1',
            coefficient: 1,
            maxScore: 20,
            status: 'PUBLISHED',
            countsTowardAverage: true,
            grades: [
              { studentId: 'stu_1', score: 15, absent: false },
              { studentId: 'stu_2', score: 11, absent: false },
            ],
          },
        ]
      : []) as never);
});

describe('getStudentBulletinSummaries', () => {
  it('returns no rows without enrollment', async () => {
    prismaMock.enrollment.findFirst.mockResolvedValue(null);
    expect(await getStudentBulletinSummaries({ studentId: 'stu_1', audience: 'staff' })).toEqual({
      terms: [],
    });
  });

  it('builds one summary row per term with the student rank', async () => {
    const { terms } = await getStudentBulletinSummaries({ studentId: 'stu_1', audience: 'staff' });
    expect(terms).toEqual([
      {
        termId: 'term_1',
        label: '1er Trimestre',
        order: 1,
        overallAverage: 15,
        rank: 1,
        rankedCount: 2,
      },
      {
        termId: 'term_2',
        label: '2e Trimestre',
        order: 2,
        overallAverage: null,
        rank: null,
        rankedCount: 0,
      },
    ]);
    for (const call of prismaMock.evaluation.findMany.mock.calls) {
      expect((call[0]?.where as Record<string, unknown>).status).toBeUndefined();
    }
  });

  it('student audience asks for PUBLISHED evaluations on every term', async () => {
    await getStudentBulletinSummaries({ studentId: 'stu_1', audience: 'student' });
    expect(prismaMock.evaluation.findMany).toHaveBeenCalledTimes(2);
    for (const call of prismaMock.evaluation.findMany.mock.calls) {
      expect((call[0]?.where as Record<string, unknown>).status).toBe('PUBLISHED');
    }
  });
});
