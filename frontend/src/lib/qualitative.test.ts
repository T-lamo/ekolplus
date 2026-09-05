import { describe, it, expect } from 'vitest';
import { normalizeRatingScale } from './qualitative';

describe('normalizeRatingScale', () => {
  it('trims labels and accepts 2 to 6 distinct non-empty ones', () => {
    expect(normalizeRatingScale([' Toujours ', 'Souvent', 'Parfois', 'Jamais'])).toEqual({
      ok: true,
      scale: ['Toujours', 'Souvent', 'Parfois', 'Jamais'],
    });
    expect(normalizeRatingScale(['A', 'B']).ok).toBe(true);
    expect(normalizeRatingScale(['A', 'B', 'C', 'D', 'E', 'F']).ok).toBe(true);
  });

  it('refuses fewer than 2 or more than 6 labels', () => {
    expect(normalizeRatingScale(['Seul'])).toEqual({ ok: false, error: 'TOO_FEW' });
    expect(normalizeRatingScale(['A', 'B', 'C', 'D', 'E', 'F', 'G'])).toEqual({
      ok: false,
      error: 'TOO_MANY',
    });
  });

  it('refuses empty, over-long and duplicate labels (after trim)', () => {
    expect(normalizeRatingScale(['A', '   '])).toEqual({ ok: false, error: 'EMPTY_LABEL' });
    expect(normalizeRatingScale(['A', 'x'.repeat(31)])).toEqual({
      ok: false,
      error: 'LABEL_TOO_LONG',
    });
    expect(normalizeRatingScale(['Bien', ' Bien '])).toEqual({
      ok: false,
      error: 'DUPLICATE_LABEL',
    });
  });
});
