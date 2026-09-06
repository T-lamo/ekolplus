import { describe, it, expect } from 'vitest';
import { buildYearData, type BuildYearDataInput, type YearEvaluation } from './year-data';

const terms = [
  { id: 't1', label: '1er contrôle', order: 1 },
  { id: 't2', label: '2ème contrôle', order: 2 },
  { id: 't3', label: '3ème contrôle', order: 3 },
];
// Maths: max 10, coef 4 → Sur 40. Français: max 20, coef 2 → Sur 40.
// Anglais: max 50, coef null (counts as 1) → Sur 50.
const classSubjects = [
  { id: 'cs_math', subjectName: 'Mathématiques', domain: 'Sciences', maxScore: 10, coefficient: 4 },
  { id: 'cs_fr', subjectName: 'Français', domain: 'Lettres', maxScore: 20, coefficient: 2 },
  { id: 'cs_en', subjectName: 'Anglais', domain: null, maxScore: 50, coefficient: null },
];
const ev = (
  termId: string,
  classSubjectId: string,
  maxScore: number,
  scores: Record<string, number | null>,
  extra: Partial<YearEvaluation> = {},
): YearEvaluation => ({
  termId,
  classSubjectId,
  coefficient: 1,
  maxScore,
  status: 'PUBLISHED',
  countsTowardAverage: true,
  grades: Object.entries(scores).map(([studentId, score]) => ({ studentId, score, absent: false })),
  ...extra,
});
const base: BuildYearDataInput = {
  terms,
  classSubjects,
  evaluations: [
    // t1: self 8/10 in maths (→ 32/40), 15/20 in français (→ 30/40), 40/50 in anglais (→ 40/50).
    ev('t1', 'cs_math', 10, { self: 8, mate: 5 }),
    ev('t1', 'cs_fr', 20, { self: 15, mate: 15 }),
    ev('t1', 'cs_en', 50, { self: 40, mate: 20 }),
    // t2: only maths graded, self 7/10 (→ 28/40), mate absent.
    ev('t2', 'cs_math', 10, { self: 7, mate: null }),
    // t3: a draft evaluation must not count.
    ev('t3', 'cs_math', 10, { self: 10, mate: 10 }, { status: 'DRAFT' }),
  ],
  studentId: 'self',
  classmateIds: ['self', 'mate'],
};

describe('buildYearData', () => {
  it('Sur = maxScore × coefficient (1 when unset), identical for every period', () => {
    const year = buildYearData(base);
    expect(year.terms.map((t) => t.subjects.map((s) => s.maxPoints))).toEqual([
      [40, 40, 50],
      [40, 40, 50],
      [40, 40, 50],
    ]);
    expect(year.terms.every((t) => t.totalMax === 130)).toBe(true);
    expect(year.terms.every((t) => t.coefficientSum === 7)).toBe(true);
  });

  it('Notes = average on 20 brought to Sur, rounded to a tenth; Total, Moyenne and Place per period', () => {
    const t1 = buildYearData(base).terms[0]!;
    expect(t1.subjects.map((s) => s.points)).toEqual([32, 30, 40]);
    expect(t1.totalPoints).toBe(102);
    expect(t1.average10).toBe(7.8); // 102 / 130 × 10 = 7.846…
    expect(t1.hasGrades).toBe(true);
    expect(t1.rank).toBe(1);
    expect(t1.rankedCount).toBe(2);
  });

  it('an ungraded subject prints empty but keeps its Sur in the total', () => {
    const t2 = buildYearData(base).terms[1]!;
    expect(t2.subjects.map((s) => s.points)).toEqual([28, null, null]);
    expect(t2.totalPoints).toBe(28);
    expect(t2.totalMax).toBe(130);
    expect(t2.average10).toBe(2.2); // 28 / 130 × 10 = 2.15…
    // The classmate has no grade at all this period: ranked alone.
    expect(t2.rank).toBe(1);
    expect(t2.rankedCount).toBe(1);
  });

  it('a period with no published grade in the class stays entirely empty', () => {
    const t3 = buildYearData(base).terms[2]!;
    expect(t3.hasGrades).toBe(false);
    expect(t3.subjects.every((s) => s.points === null)).toBe(true);
    expect(t3.totalPoints).toBeNull();
    expect(t3.average10).toBeNull();
    expect(t3.rank).toBeNull();
    expect(t3.rankedCount).toBe(0);
  });

  it('a student without any grade in a graded period gets null values but the period keeps hasGrades', () => {
    const year = buildYearData({
      ...base,
      studentId: 'ghost',
      classmateIds: ['self', 'mate', 'ghost'],
    });
    const t1 = year.terms[0]!;
    expect(t1.hasGrades).toBe(true);
    expect(t1.totalPoints).toBeNull();
    expect(t1.average10).toBeNull();
    expect(t1.rank).toBeNull();
    expect(t1.rankedCount).toBe(2);
  });

  it('a student with no grade in a graded period keeps that period out of generalAverage and generalCoefficient', () => {
    const year = buildYearData({
      ...base,
      terms: [terms[0]!, terms[1]!],
      evaluations: [
        // t1: self and mate both graded. t2: mate graded, self has no row at all.
        ev('t1', 'cs_math', 10, { self: 8, mate: 5 }),
        ev('t2', 'cs_math', 10, { mate: 6 }),
      ],
      studentId: 'self',
      classmateIds: ['self', 'mate'],
    });
    expect(year.terms[1]!.hasGrades).toBe(true);
    expect(year.terms[1]!.average10).toBeNull();
    expect(year.terms[1]!.rank).toBeNull();
    expect(year.generalCoefficient).toBe(year.terms[0]!.coefficientSum);
  });

  it('shares the rank between tied classmates (competition ranking)', () => {
    const year = buildYearData({
      ...base,
      evaluations: [ev('t1', 'cs_math', 10, { self: 8, mate: 8, third: 2 })],
      classmateIds: ['self', 'mate', 'third'],
    });
    expect(year.terms[0]!.rank).toBe(1);
    expect(year.terms[0]!.rankedCount).toBe(3);
    const third = buildYearData({
      ...base,
      studentId: 'third',
      evaluations: [ev('t1', 'cs_math', 10, { self: 8, mate: 8, third: 2 })],
      classmateIds: ['self', 'mate', 'third'],
    });
    expect(third.terms[0]!.rank).toBe(3);
  });

  it('Moyenne Générale sums the averages of the graded periods, its coefficient sums theirs', () => {
    const year = buildYearData(base);
    expect(year.generalAverage).toBe(10); // 7.8 + 2.2
    expect(year.generalCoefficient).toBe(14);
    const empty = buildYearData({ ...base, evaluations: [] });
    expect(empty.generalAverage).toBeNull();
    expect(empty.generalCoefficient).toBe(0);
  });

  it('keeps the periods in order and the subjects in the given order', () => {
    const year = buildYearData({ ...base, terms: [terms[2]!, terms[0]!, terms[1]!] });
    expect(year.terms.map((t) => t.label)).toEqual([
      '1er contrôle',
      '2ème contrôle',
      '3ème contrôle',
    ]);
    expect(year.terms[0]!.subjects.map((s) => s.subjectName)).toEqual([
      'Mathématiques',
      'Français',
      'Anglais',
    ]);
  });
});
