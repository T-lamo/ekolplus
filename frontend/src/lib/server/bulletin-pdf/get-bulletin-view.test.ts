// getStudentBulletinView — the audience switch. prismaMock first
// (auto-hoists vi.mock for '@/lib/server/prisma').
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { getStudentBulletinView } from './get-bulletin-view';
import {
  DEFAULT_BULLETIN_CONFIG,
  DEFAULT_PAGE_NUMBER_FORMAT,
} from '@/lib/server/bulletin-templates';

const T_START = new Date('2025-09-01T00:00:00.000Z');
// Ends far in the future so resolveCurrentTerm picks it whatever the run date.
const T_END = new Date('2099-12-31T00:00:00.000Z');

// Same pages-shaped config the beforeEach gives tpl_1 — the grade-level
// resolution tests below only assert on `template.id`, so any template
// object normalizeConfig already accepts works here.
const pagesConfig = {
  pageFormat: 'A4',
  orientation: 'PORTRAIT',
  pages: [
    {
      id: 'page-1',
      layout: 'full',
      showPageNumber: false,
      blocks: [{ id: 'header', type: 'header', visible: true }],
    },
  ],
};

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
  // Already pages-shaped (post-migration) so normalizeConfig short-circuits
  // and returns it unchanged — the legacy-shape path is exercised by its own
  // dedicated test below.
  prismaMock.bulletinTemplate.findFirst.mockResolvedValue({
    id: 'tpl_1',
    name: 'Standard',
    config: {
      pageFormat: 'A4',
      orientation: 'PORTRAIT',
      pages: [
        {
          id: 'page-1',
          layout: 'full',
          showPageNumber: false,
          blocks: [{ id: 'header', type: 'header', visible: true }],
        },
      ],
    },
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
  prismaMock.criteriaAssessment.findMany.mockResolvedValue([] as never);
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
      termLabel: '1er Trimestre',
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
      termLabel: '1er Trimestre',
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

  it('carries the published qualitative grids of the student as qualitativeSubjects', async () => {
    prismaMock.criteriaAssessment.findMany.mockResolvedValue([
      {
        classSubjectId: 'cs_q',
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
        ratings: [{ criterionId: 'cr_1', level: 0 }],
      },
    ] as never);
    const view = await getStudentBulletinView('school_1', 'stu_1', null, 'student');
    expect(view?.qualitativeSubjects).toEqual([
      {
        subjectName: 'Comportement',
        ratingScale: ['Toujours', 'Souvent', 'Parfois', 'Jamais'],
        criteria: [
          { label: 'Respecte les consignes', level: 0 },
          { label: 'Partage', level: null },
        ],
      },
    ]);
    const where = prismaMock.criteriaAssessment.findMany.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where.status).toBe('PUBLISHED');
    expect(where.termId).toBe('term_1');
  });

  it('normalizes a template still stored in the old flat-blocks shape (Ruling: normalizeConfig is mandatory here)', async () => {
    prismaMock.bulletinTemplate.findFirst.mockResolvedValue({
      id: 'tpl_legacy',
      name: 'Ancien modèle',
      config: {
        primaryColor: '#000000',
        pageFormat: 'LETTER',
        orientation: 'LANDSCAPE',
        blocks: [{ id: 'header', visible: true }],
        columns: {},
        signatures: {},
        typography: {},
        content: { title: 'X', footerMessage: null },
        layout: {},
      },
      isActive: true,
    } as never);

    const view = await getStudentBulletinView('school_1', 'stu_1', null);

    expect(view?.template?.config).toEqual({
      primaryColor: '#000000',
      pageFormat: 'LETTER',
      orientation: 'LANDSCAPE',
      pages: [
        {
          id: 'page-1',
          layout: 'full',
          showPageNumber: false,
          blocks: [{ id: 'header', type: 'header', visible: true }],
        },
      ],
      columns: {},
      signatures: {},
      typography: {},
      content: { title: 'X', footerMessage: null, pageNumberFormat: DEFAULT_PAGE_NUMBER_FORMAT },
      layout: {},
    });
  });

  it("prefers the enrolled class's grade-level template over the school's active one", async () => {
    prismaMock.enrollment.findFirst.mockResolvedValueOnce({
      studentId: 'stu_1',
      classId: 'cls_1',
      class: {
        id: 'cls_1',
        name: '6ème A',
        academicYearId: 'year_1',
        homeroomTeacher: null,
        gradeLevel: {
          bulletinTemplate: {
            id: 'tpl-level',
            name: 'Livret préscolaire',
            config: pagesConfig,
            isActive: false,
          },
        },
      },
    } as never);
    prismaMock.bulletinTemplate.findFirst
      .mockResolvedValueOnce({
        id: 'tpl-active',
        name: 'Actif',
        config: pagesConfig,
        isActive: true,
      } as never)
      .mockResolvedValueOnce({
        id: 'tpl-global',
        name: 'Global',
        config: pagesConfig,
        isActive: false,
      } as never);

    const view = await getStudentBulletinView('school_1', 'stu_1', null);
    expect(view?.template?.id).toBe('tpl-level');
  });

  it("falls back to the school's active template when the class has no grade-level template", async () => {
    prismaMock.enrollment.findFirst.mockResolvedValueOnce({
      studentId: 'stu_1',
      classId: 'cls_1',
      class: {
        id: 'cls_1',
        name: '6ème A',
        academicYearId: 'year_1',
        homeroomTeacher: null,
        gradeLevel: null,
      },
    } as never);
    prismaMock.bulletinTemplate.findFirst
      .mockResolvedValueOnce({
        id: 'tpl-active',
        name: 'Actif',
        config: pagesConfig,
        isActive: true,
      } as never)
      .mockResolvedValueOnce({
        id: 'tpl-global',
        name: 'Global',
        config: pagesConfig,
        isActive: false,
      } as never);

    const view = await getStudentBulletinView('school_1', 'stu_1', null);
    expect(view?.template?.id).toBe('tpl-active');
  });

  it("resolves the level's template through the class's level label when the class is not linked to a grade level", async () => {
    prismaMock.enrollment.findFirst.mockResolvedValueOnce({
      studentId: 'stu_1',
      classId: 'cls_1',
      class: {
        id: 'cls_1',
        name: '3ème A',
        level: '3ème',
        academicYearId: 'year_1',
        homeroomTeacher: null,
        gradeLevel: null,
      },
    } as never);
    prismaMock.gradeLevel.findFirst.mockResolvedValueOnce({
      bulletinTemplate: {
        id: 'tpl-level-by-label',
        name: 'Carnet',
        config: pagesConfig,
        isActive: false,
      },
    } as never);
    prismaMock.bulletinTemplate.findFirst
      .mockResolvedValueOnce({
        id: 'tpl-active',
        name: 'Actif',
        config: pagesConfig,
        isActive: true,
      } as never)
      .mockResolvedValueOnce(null as never);

    const view = await getStudentBulletinView('school_1', 'stu_1', null);
    expect(view?.template?.id).toBe('tpl-level-by-label');
    expect(prismaMock.gradeLevel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: 'school_1', name: '3ème' } }),
    );
  });

  it('does not look a level up by label when the class is already linked to one', async () => {
    prismaMock.enrollment.findFirst.mockResolvedValueOnce({
      studentId: 'stu_1',
      classId: 'cls_1',
      class: {
        id: 'cls_1',
        name: '3ème A',
        level: '3ème',
        academicYearId: 'year_1',
        homeroomTeacher: null,
        gradeLevel: { bulletinTemplate: null },
      },
    } as never);
    prismaMock.bulletinTemplate.findFirst
      .mockResolvedValueOnce({
        id: 'tpl-active',
        name: 'Actif',
        config: pagesConfig,
        isActive: true,
      } as never)
      .mockResolvedValueOnce(null as never);

    const view = await getStudentBulletinView('school_1', 'stu_1', null);
    expect(view?.template?.id).toBe('tpl-active');
    expect(prismaMock.gradeLevel.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to the oldest global template when the level has none and the school has no active one', async () => {
    prismaMock.enrollment.findFirst.mockResolvedValueOnce({
      studentId: 'stu_1',
      classId: 'cls_1',
      class: {
        id: 'cls_1',
        name: '6ème A',
        academicYearId: 'year_1',
        homeroomTeacher: null,
        gradeLevel: { bulletinTemplate: null },
      },
    } as never);
    prismaMock.bulletinTemplate.findFirst
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({
        id: 'tpl-global',
        name: 'Global',
        config: pagesConfig,
        isActive: false,
      } as never);

    const view = await getStudentBulletinView('school_1', 'stu_1', null);
    expect(view?.template?.id).toBe('tpl-global');
  });

  it('computes no annual payload and queries only the current term when the template has no annual block', async () => {
    const view = await getStudentBulletinView('school_1', 'stu_1', 'term_1');
    expect(view?.year).toBeUndefined();
    expect(view?.nisu).toBeNull();
    expect(
      (prismaMock.evaluation.findMany.mock.calls[0]?.[0]?.where as Record<string, unknown>).termId,
    ).toBe('term_1');
  });

  it('computes the annual payload over every term of the year when the template holds an annual block', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 'stu_1',
      schoolId: 'school_1',
      firstName: 'Nadia',
      lastName: 'Joseph',
      studentNumber: 'EL-2025-002',
      nisu: '0123456789',
      dateOfBirth: null,
    } as never);
    prismaMock.term.findMany.mockResolvedValue([
      { id: 'term_1', label: '1er contrôle', order: 1, startDate: T_START, endDate: T_END },
      { id: 'term_2', label: '2ème contrôle', order: 2, startDate: T_END, endDate: T_END },
    ] as never);
    // normalizeConfig falls back to the DEFAULT config when a pages-shaped
    // config fails the schema, so the mock must be a complete valid config.
    prismaMock.bulletinTemplate.findFirst.mockResolvedValue({
      id: 'tpl_year',
      name: 'Carnet',
      config: {
        ...DEFAULT_BULLETIN_CONFIG,
        pages: [
          {
            id: 'p',
            layout: 'full',
            showPageNumber: false,
            blocks: [{ id: 'g', type: 'yearGrid', visible: true }],
          },
        ],
      },
      isActive: true,
    } as never);
    prismaMock.classSubject.findMany.mockResolvedValue([
      {
        id: 'cs_1',
        classId: 'cls_1',
        subjectId: 'sub_1',
        coefficient: 4,
        subject: { name: 'Mathématiques', domain: 'Sciences', maxScore: 10 },
        teacher: null,
      },
    ] as never);
    prismaMock.evaluation.findMany.mockResolvedValue([
      {
        id: 'ev_1',
        classSubjectId: 'cs_1',
        termId: 'term_1',
        coefficient: 1,
        maxScore: 20,
        status: 'PUBLISHED',
        countsTowardAverage: true,
        grades: [
          { studentId: 'stu_0', score: 10, absent: false },
          { studentId: 'stu_1', score: 16, absent: false },
        ],
      },
      {
        id: 'ev_2',
        classSubjectId: 'cs_1',
        termId: 'term_2',
        coefficient: 1,
        maxScore: 20,
        status: 'PUBLISHED',
        countsTowardAverage: true,
        grades: [{ studentId: 'stu_1', score: 10, absent: false }],
      },
    ] as never);

    const view = await getStudentBulletinView('school_1', 'stu_1', 'term_1');

    expect(view?.nisu).toBe('0123456789');
    expect(
      (prismaMock.evaluation.findMany.mock.calls[0]?.[0]?.where as Record<string, unknown>).termId,
    ).toEqual({ in: ['term_1', 'term_2'] });
    // The per-term table still only sees the current term's evaluations.
    expect(view?.subjects[0]?.average).toBe(16);
    expect(view?.year?.terms.map((t) => t.label)).toEqual(['1er contrôle', '2ème contrôle']);
    expect(view?.year?.terms[0]?.subjects[0]).toEqual({
      subjectName: 'Mathématiques',
      domain: 'Sciences',
      points: 32,
      maxPoints: 40,
    });
    expect(view?.year?.terms[0]?.average10).toBe(8);
    expect(view?.year?.terms[0]?.rank).toBe(1);
    expect(view?.year?.terms[1]?.average10).toBe(5);
    expect(view?.year?.generalAverage).toBe(13);
    expect(view?.year?.generalCoefficient).toBe(8);
  });

  it('computes the annual payload with a student audience, PUBLISHED rows only', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 'stu_1',
      schoolId: 'school_1',
      firstName: 'Nadia',
      lastName: 'Joseph',
      studentNumber: 'EL-2025-002',
      nisu: '0123456789',
      dateOfBirth: null,
    } as never);
    prismaMock.term.findMany.mockResolvedValue([
      { id: 'term_1', label: '1er contrôle', order: 1, startDate: T_START, endDate: T_END },
      { id: 'term_2', label: '2ème contrôle', order: 2, startDate: T_END, endDate: T_END },
    ] as never);
    // normalizeConfig falls back to the DEFAULT config when a pages-shaped
    // config fails the schema, so the mock must be a complete valid config.
    prismaMock.bulletinTemplate.findFirst.mockResolvedValue({
      id: 'tpl_year',
      name: 'Carnet',
      config: {
        ...DEFAULT_BULLETIN_CONFIG,
        pages: [
          {
            id: 'p',
            layout: 'full',
            showPageNumber: false,
            blocks: [{ id: 'g', type: 'yearGrid', visible: true }],
          },
        ],
      },
      isActive: true,
    } as never);
    prismaMock.classSubject.findMany.mockResolvedValue([
      {
        id: 'cs_1',
        classId: 'cls_1',
        subjectId: 'sub_1',
        coefficient: 4,
        subject: { name: 'Mathématiques', domain: 'Sciences', maxScore: 10 },
        teacher: null,
      },
    ] as never);
    prismaMock.evaluation.findMany.mockResolvedValue([
      {
        id: 'ev_1',
        classSubjectId: 'cs_1',
        termId: 'term_1',
        coefficient: 1,
        maxScore: 20,
        status: 'PUBLISHED',
        countsTowardAverage: true,
        grades: [
          { studentId: 'stu_0', score: 10, absent: false },
          { studentId: 'stu_1', score: 16, absent: false },
        ],
      },
      {
        id: 'ev_2',
        classSubjectId: 'cs_1',
        termId: 'term_2',
        coefficient: 1,
        maxScore: 20,
        status: 'PUBLISHED',
        countsTowardAverage: true,
        grades: [{ studentId: 'stu_1', score: 10, absent: false }],
      },
    ] as never);

    const view = await getStudentBulletinView('school_1', 'stu_1', 'term_1', 'student');

    expect(view?.year?.terms.map((t) => t.label)).toEqual(['1er contrôle', '2ème contrôle']);
    const evalWhere = prismaMock.evaluation.findMany.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(evalWhere.termId).toEqual({ in: ['term_1', 'term_2'] });
    expect(evalWhere.status).toBe('PUBLISHED');
    expect(prismaMock.appreciation.findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      status: 'PUBLISHED',
    });
  });
});
