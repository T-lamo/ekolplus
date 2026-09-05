// prismaMock first (auto-hoists vi.mock for '@/lib/server/prisma').
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NUMERIC_SUBJECT_FILTER,
  findQualitativeConflict,
  resolveQualitativeProfile,
} from './qualitative';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveQualitativeProfile', () => {
  it('NUMERIC always stores an empty scale', () => {
    expect(
      resolveQualitativeProfile({ evaluationMode: 'NUMERIC', ratingScale: ['A', 'B'] }),
    ).toEqual({ ok: true, profile: { evaluationMode: 'NUMERIC', ratingScale: [] } });
  });

  it('QUALITATIVE normalizes the scale or says why it is invalid', () => {
    expect(
      resolveQualitativeProfile({ evaluationMode: 'QUALITATIVE', ratingScale: [' Bien', 'Mal '] }),
    ).toEqual({
      ok: true,
      profile: { evaluationMode: 'QUALITATIVE', ratingScale: ['Bien', 'Mal'] },
    });
    expect(
      resolveQualitativeProfile({ evaluationMode: 'QUALITATIVE', ratingScale: ['Seul'] }),
    ).toEqual({ ok: false, message: 'ratingScale needs at least 2 labels' });
  });
});

describe('findQualitativeConflict', () => {
  const numeric = { evaluationMode: 'NUMERIC', ratingScale: [] as string[] };
  const qualitative = { evaluationMode: 'QUALITATIVE', ratingScale: ['A', 'B', 'C'] };
  const toQualitative = { evaluationMode: 'QUALITATIVE' as const, ratingScale: ['A', 'B'] };

  it('NUMERIC to QUALITATIVE is refused while evaluations exist', async () => {
    prismaMock.evaluation.count.mockResolvedValue(2);
    expect(await findQualitativeConflict('subj_1', numeric, toQualitative)).toBe(
      'SUBJECT_HAS_EVALUATIONS',
    );
    expect(prismaMock.evaluation.count).toHaveBeenCalledWith({
      where: { classSubject: { subjectId: 'subj_1' } },
    });
    prismaMock.evaluation.count.mockResolvedValue(0);
    expect(await findQualitativeConflict('subj_1', numeric, toQualitative)).toBeNull();
  });

  it('QUALITATIVE to NUMERIC is refused while ratings exist', async () => {
    prismaMock.criteriaRating.count.mockResolvedValue(1);
    expect(
      await findQualitativeConflict('subj_1', qualitative, {
        evaluationMode: 'NUMERIC',
        ratingScale: [],
      }),
    ).toBe('SUBJECT_HAS_RATINGS');
    expect(prismaMock.criteriaRating.count).toHaveBeenCalledWith({
      where: { criterion: { subjectId: 'subj_1' } },
    });
  });

  it('shrinking the scale is refused only when a removed level is in use', async () => {
    prismaMock.criteriaRating.count.mockResolvedValue(1);
    expect(await findQualitativeConflict('subj_1', qualitative, toQualitative)).toBe(
      'SCALE_LEVEL_IN_USE',
    );
    expect(prismaMock.criteriaRating.count).toHaveBeenCalledWith({
      where: { criterion: { subjectId: 'subj_1' }, level: { gte: 2 } },
    });
    prismaMock.criteriaRating.count.mockResolvedValue(0);
    expect(await findQualitativeConflict('subj_1', qualitative, toQualitative)).toBeNull();
  });

  it('reordering the scale (same labels, different order) is refused while any rating exists', async () => {
    prismaMock.criteriaRating.count.mockResolvedValue(1);
    const reordered = { evaluationMode: 'QUALITATIVE' as const, ratingScale: ['B', 'A', 'C'] };
    expect(await findQualitativeConflict('subj_1', qualitative, reordered)).toBe(
      'SCALE_LEVEL_IN_USE',
    );
    expect(prismaMock.criteriaRating.count).toHaveBeenCalledWith({
      where: { criterion: { subjectId: 'subj_1' } },
    });
    prismaMock.criteriaRating.count.mockResolvedValue(0);
    expect(await findQualitativeConflict('subj_1', qualitative, reordered)).toBeNull();
  });

  it('a multi-word relabel that reflows across word boundaries is not mistaken for a reorder', async () => {
    // Sorted+space-joined, ['A B','C'] and ['A','B C'] both collapse to
    // "A B C" — a real trap for a naive space-delimited fingerprint. Neither
    // scale shares a label with the other, so this must stay a free rename.
    expect(
      await findQualitativeConflict(
        'subj_1',
        { evaluationMode: 'QUALITATIVE', ratingScale: ['A B', 'C'] },
        { evaluationMode: 'QUALITATIVE', ratingScale: ['A', 'B C'] },
      ),
    ).toBeNull();
    expect(prismaMock.criteriaRating.count).not.toHaveBeenCalled();
  });

  it('renaming or growing the scale never queries', async () => {
    expect(
      await findQualitativeConflict('subj_1', qualitative, {
        evaluationMode: 'QUALITATIVE',
        ratingScale: ['X', 'Y', 'Z', 'W'],
      }),
    ).toBeNull();
    expect(prismaMock.criteriaRating.count).not.toHaveBeenCalled();
    expect(prismaMock.evaluation.count).not.toHaveBeenCalled();
  });

  it('exposes the filter numeric consumers spread into their ClassSubject where', () => {
    expect(NUMERIC_SUBJECT_FILTER).toEqual({ subject: { evaluationMode: 'NUMERIC' } });
  });
});
