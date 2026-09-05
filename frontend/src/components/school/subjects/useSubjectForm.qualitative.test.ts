import { describe, it, expect } from 'vitest';
import { initialValues, toBody, validate } from './useSubjectForm';

const base = initialValues(null, []);

describe('subject form, qualitative fields', () => {
  it('defaults to NUMERIC with an empty scale', () => {
    expect(base.evaluationMode).toBe('NUMERIC');
    expect(base.ratingScale).toEqual([]);
    expect(toBody(base, 'ACTIVE')).toMatchObject({ evaluationMode: 'NUMERIC', ratingScale: [] });
  });

  it('flags an invalid scale only in QUALITATIVE mode', () => {
    const bad = { ...base, evaluationMode: 'QUALITATIVE' as const, ratingScale: ['Oui', ''] };
    expect(validate(bad).codes.ratingScale).toBe('ratingScaleInvalid');
    const numericWithJunk = { ...base, ratingScale: ['Oui', ''] };
    expect(validate(numericWithJunk).codes.ratingScale).toBeUndefined();
  });

  it('sends a trimmed scale in QUALITATIVE mode and an empty one otherwise', () => {
    const q = { ...base, evaluationMode: 'QUALITATIVE' as const, ratingScale: [' Oui ', 'Non'] };
    expect(toBody(q, 'ACTIVE')).toMatchObject({
      evaluationMode: 'QUALITATIVE',
      ratingScale: ['Oui', 'Non'],
    });
    expect(toBody({ ...q, evaluationMode: 'NUMERIC' }, 'ACTIVE')).toMatchObject({
      evaluationMode: 'NUMERIC',
      ratingScale: [],
    });
  });
});
