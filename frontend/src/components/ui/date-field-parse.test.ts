import { describe, expect, it } from 'vitest';
import { formatTyped, maskDateInput, parseTypedDate } from './date-field-parse';

describe('parseTypedDate (typed text → ISO yyyy-MM-dd)', () => {
  it('accepts jj/mm/aaaa and its lenient variants', () => {
    expect(parseTypedDate('16/06/2025')).toBe('2025-06-16');
    expect(parseTypedDate('6/6/2025')).toBe('2025-06-06');
    expect(parseTypedDate('16-06-2025')).toBe('2025-06-16');
    expect(parseTypedDate('16.06.2025')).toBe('2025-06-16');
    expect(parseTypedDate('16 06 2025')).toBe('2025-06-16');
    expect(parseTypedDate('  16/06/2025 ')).toBe('2025-06-16');
  });
  it('accepts 8 bare digits (jjmmaaaa) and ISO', () => {
    expect(parseTypedDate('16062025')).toBe('2025-06-16');
    expect(parseTypedDate('2025-06-16')).toBe('2025-06-16');
  });
  it('is not capped to the current year — far past and far future both work', () => {
    expect(parseTypedDate('01/01/1931')).toBe('1931-01-01');
    expect(parseTypedDate('31/12/2049')).toBe('2049-12-31');
    expect(parseTypedDate('15/08/2100')).toBe('2100-08-15');
  });
  it('rejects impossible or incomplete dates', () => {
    expect(parseTypedDate('31/02/2025')).toBeNull();
    expect(parseTypedDate('00/01/2025')).toBeNull();
    expect(parseTypedDate('12/13/2025')).toBeNull();
    expect(parseTypedDate('16/06/25')).toBeNull(); // 2-digit year is ambiguous → refused
    expect(parseTypedDate('16/06')).toBeNull();
    expect(parseTypedDate('abc')).toBeNull();
    expect(parseTypedDate('')).toBeNull();
  });
  it('respects inclusive min/max bounds when given', () => {
    expect(parseTypedDate('16/06/2025', { min: '2025-06-16' })).toBe('2025-06-16');
    expect(parseTypedDate('15/06/2025', { min: '2025-06-16' })).toBeNull();
    expect(parseTypedDate('17/06/2025', { max: '2025-06-16' })).toBeNull();
  });
});

describe('maskDateInput (progressive jj/mm/aaaa mask while typing)', () => {
  it('inserts the slashes as digits come in, max 8 digits', () => {
    expect(maskDateInput('1')).toBe('1');
    expect(maskDateInput('16')).toBe('16');
    expect(maskDateInput('160')).toBe('16/0');
    expect(maskDateInput('1606')).toBe('16/06');
    expect(maskDateInput('16062')).toBe('16/06/2');
    expect(maskDateInput('16062025')).toBe('16/06/2025');
    expect(maskDateInput('160620259')).toBe('16/06/2025');
  });
  it('keeps user-typed slashes idempotent and leaves other separators alone', () => {
    expect(maskDateInput('16/06/2025')).toBe('16/06/2025');
    expect(maskDateInput('16/0')).toBe('16/0');
    expect(maskDateInput('2025-06-16')).toBe('2025-06-16');
    expect(maskDateInput('16.06.2025')).toBe('16.06.2025');
    expect(maskDateInput('')).toBe('');
  });
});

describe('formatTyped (ISO → jj/mm/aaaa for the edit box)', () => {
  it('formats and tolerates empty/invalid', () => {
    expect(formatTyped('2025-06-16')).toBe('16/06/2025');
    expect(formatTyped('')).toBe('');
    expect(formatTyped('garbage')).toBe('');
  });
});
