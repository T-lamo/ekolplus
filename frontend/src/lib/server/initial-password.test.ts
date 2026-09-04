import { describe, it, expect } from 'vitest';
import { generateInitialPassword } from './initial-password';

describe('generateInitialPassword', () => {
  it('is 12 characters long', () => {
    expect(generateInitialPassword()).toHaveLength(12);
  });

  it('excludes ambiguous characters (0 O I 1 l)', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateInitialPassword()).toMatch(/^[A-HJ-NP-Za-hj-np-z2-9]+$/);
    }
  });

  it('always contains at least one uppercase, one lowercase and one digit', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateInitialPassword();
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[2-9]/);
    }
  });

  it('produces distinct values across many calls (collision sanity check)', () => {
    const seen = new Set(Array.from({ length: 100 }, () => generateInitialPassword()));
    expect(seen.size).toBe(100);
  });
});
