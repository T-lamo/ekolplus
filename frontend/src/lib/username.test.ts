import { describe, it, expect } from 'vitest';
import { normalizeUsername, USERNAME_REGEX, zUsername } from './username';

describe('normalizeUsername', () => {
  it('trims and lowercases', () => {
    expect(normalizeUsername('  Marie.K  ')).toBe('marie.k');
    expect(normalizeUsername('JEAN_PAUL')).toBe('jean_paul');
  });
});

describe('USERNAME_REGEX', () => {
  it('accepts valid usernames', () => {
    for (const v of ['marie.k', 'jean_paul', 'a12', 'sec-retaire', 'abc']) {
      expect(USERNAME_REGEX.test(v)).toBe(true);
    }
  });

  it('rejects an "@" (must never look like an email)', () => {
    expect(USERNAME_REGEX.test('marie@k')).toBe(false);
  });

  it('rejects a username starting with a digit', () => {
    expect(USERNAME_REGEX.test('1marie')).toBe(false);
  });

  it('rejects fewer than 3 characters', () => {
    expect(USERNAME_REGEX.test('ab')).toBe(false);
  });

  it('rejects more than 30 characters', () => {
    expect(USERNAME_REGEX.test('a'.repeat(31))).toBe(false);
  });

  it('accepts exactly 30 characters', () => {
    expect(USERNAME_REGEX.test('a'.repeat(30))).toBe(true);
  });

  it('rejects uppercase (only normalized input should pass)', () => {
    expect(USERNAME_REGEX.test('Marie.K')).toBe(false);
  });
});

describe('zUsername', () => {
  it('normalizes then validates', () => {
    const r = zUsername.safeParse('  Marie.K  ');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('marie.k');
  });

  it('fails on an invalid format even after normalization', () => {
    expect(zUsername.safeParse('a@b').success).toBe(false);
    expect(zUsername.safeParse('1abc').success).toBe(false);
  });
});
