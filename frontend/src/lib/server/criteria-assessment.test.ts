// prismaMock first (auto-hoists vi.mock for '@/lib/server/prisma').
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSheet, loadSheetContext, saveSheet, type SheetContext } from './criteria-assessment';

const ctx: SheetContext = {
  id: 'cs_1',
  classId: 'cls_1',
  class: { name: 'Kindergarten A', academicYearId: 'year_1' },
  subject: {
    id: 'subj_1',
    name: 'Comportement',
    ratingScale: ['Toujours', 'Souvent', 'Parfois', 'Jamais'],
    criteria: [
      { id: 'cr_1', label: 'Respecte les consignes' },
      { id: 'cr_2', label: 'Partage' },
    ],
  },
};
const term = { id: 'term_1', label: '1er Trimestre', gradeEntryEnabled: true };
const roster = [
  { studentId: 'stu_2', student: { firstName: 'Ana', lastName: 'Baptiste' } },
  { studentId: 'stu_1', student: { firstName: 'Jimmy', lastName: 'Valcin' } },
];

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.term.findFirst.mockResolvedValue(term as never);
  prismaMock.term.findMany.mockResolvedValue([
    {
      ...term,
      order: 1,
      startDate: new Date('2025-09-01T00:00:00.000Z'),
      endDate: new Date('2099-12-31T00:00:00.000Z'),
    },
  ] as never);
  prismaMock.enrollment.findMany.mockResolvedValue(roster as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
});

describe('loadSheetContext', () => {
  it('returns null for a numeric subject or a class-subject of another school', async () => {
    prismaMock.classSubject.findFirst.mockResolvedValue(null);
    expect(await loadSheetContext('cs_x', 'school_1')).toBeNull();
    prismaMock.classSubject.findFirst.mockResolvedValue({
      id: 'cs_1',
      classId: 'cls_1',
      class: { name: 'A', academicYearId: 'year_1' },
      subject: { id: 's', name: 'Maths', evaluationMode: 'NUMERIC', ratingScale: [], criteria: [] },
    } as never);
    expect(await loadSheetContext('cs_1', 'school_1')).toBeNull();
    expect(prismaMock.classSubject.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 'cs_1', class: { schoolId: 'school_1' } } }),
    );
  });

  it('returns the context of a qualitative class-subject', async () => {
    prismaMock.classSubject.findFirst.mockResolvedValue({
      id: 'cs_1',
      classId: 'cls_1',
      class: { name: 'Kindergarten A', academicYearId: 'year_1' },
      subject: { ...ctx.subject, evaluationMode: 'QUALITATIVE' },
    } as never);
    expect(await loadSheetContext('cs_1', 'school_1')).toEqual(ctx);
  });
});

describe('loadSheet', () => {
  it('returns a virtual empty DRAFT sheet when nothing was saved, roster in name order', async () => {
    prismaMock.criteriaAssessment.findUnique.mockResolvedValue(null);
    const sheet = await loadSheet(ctx, 'term_1');
    expect(sheet).toEqual({
      id: null,
      status: 'DRAFT',
      term,
      terms: [{ id: 'term_1', label: '1er Trimestre' }],
      classSubject: { id: 'cs_1', className: 'Kindergarten A' },
      subject: ctx.subject,
      students: [
        { studentId: 'stu_2', firstName: 'Ana', lastName: 'Baptiste', ratings: {} },
        { studentId: 'stu_1', firstName: 'Jimmy', lastName: 'Valcin', ratings: {} },
      ],
    });
    expect(prismaMock.criteriaAssessment.create).not.toHaveBeenCalled();
    expect(prismaMock.criteriaAssessment.upsert).not.toHaveBeenCalled();
  });

  it('groups stored ticks per student', async () => {
    prismaMock.criteriaAssessment.findUnique.mockResolvedValue({
      id: 'ca_1',
      status: 'PUBLISHED',
      ratings: [
        { studentId: 'stu_1', criterionId: 'cr_1', level: 0 },
        { studentId: 'stu_1', criterionId: 'cr_2', level: 3 },
      ],
    } as never);
    const sheet = await loadSheet(ctx, 'term_1');
    expect(sheet?.id).toBe('ca_1');
    expect(sheet?.status).toBe('PUBLISHED');
    expect(sheet?.students[1]?.ratings).toEqual({ cr_1: 0, cr_2: 3 });
    expect(sheet?.students[0]?.ratings).toEqual({});
  });

  it('resolves the current term when termId is null, null for a term outside the class year', async () => {
    prismaMock.criteriaAssessment.findUnique.mockResolvedValue(null);
    expect((await loadSheet(ctx, null))?.term.id).toBe('term_1');
    expect(await loadSheet(ctx, 'term_other')).toBeNull();
    expect(prismaMock.term.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { academicYearId: 'year_1' } }),
    );
  });
});

describe('saveSheet', () => {
  const valid = {
    termId: 'term_1',
    status: 'DRAFT' as const,
    ratings: [{ studentId: 'stu_1', criterionId: 'cr_1', level: 1 }],
  };

  beforeEach(() => {
    prismaMock.criteriaAssessment.upsert.mockResolvedValue({ id: 'ca_1' } as never);
    prismaMock.criteriaAssessment.findUnique.mockResolvedValue({
      id: 'ca_1',
      status: 'DRAFT',
      ratings: [{ studentId: 'stu_1', criterionId: 'cr_1', level: 1 }],
    } as never);
  });

  it('refuses when grade entry is disabled for the term', async () => {
    prismaMock.term.findFirst.mockResolvedValue({ ...term, gradeEntryEnabled: false } as never);
    expect(await saveSheet(ctx, valid)).toEqual({ ok: false, error: 'GRADE_ENTRY_DISABLED' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('validates students, criteria and levels before writing', async () => {
    expect(
      await saveSheet(ctx, {
        ...valid,
        ratings: [{ studentId: 'ghost', criterionId: 'cr_1', level: 0 }],
      }),
    ).toEqual({ ok: false, error: 'UNKNOWN_STUDENT' });
    expect(
      await saveSheet(ctx, {
        ...valid,
        ratings: [{ studentId: 'stu_1', criterionId: 'cr_x', level: 0 }],
      }),
    ).toEqual({ ok: false, error: 'UNKNOWN_CRITERION' });
    expect(
      await saveSheet(ctx, {
        ...valid,
        ratings: [{ studentId: 'stu_1', criterionId: 'cr_1', level: 4 }],
      }),
    ).toEqual({ ok: false, error: 'LEVEL_OUT_OF_RANGE' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('upserts the sheet, upserts ticks, deletes null ticks, then reloads', async () => {
    const result = await saveSheet(ctx, {
      termId: 'term_1',
      status: 'PUBLISHED',
      ratings: [
        { studentId: 'stu_1', criterionId: 'cr_1', level: 1 },
        { studentId: 'stu_1', criterionId: 'cr_2', level: null },
      ],
    });
    expect(prismaMock.criteriaAssessment.upsert).toHaveBeenCalledWith({
      where: { classSubjectId_termId: { classSubjectId: 'cs_1', termId: 'term_1' } },
      create: { classSubjectId: 'cs_1', termId: 'term_1', status: 'PUBLISHED' },
      update: { status: 'PUBLISHED' },
      select: { id: true },
    });
    expect(prismaMock.criteriaRating.upsert).toHaveBeenCalledWith({
      where: {
        assessmentId_studentId_criterionId: {
          assessmentId: 'ca_1',
          studentId: 'stu_1',
          criterionId: 'cr_1',
        },
      },
      create: { assessmentId: 'ca_1', studentId: 'stu_1', criterionId: 'cr_1', level: 1 },
      update: { level: 1 },
    });
    expect(prismaMock.criteriaRating.deleteMany).toHaveBeenCalledWith({
      where: { assessmentId: 'ca_1', studentId: 'stu_1', criterionId: 'cr_2' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sheet.students[1]?.ratings).toEqual({ cr_1: 1 });
  });
});
