import { describe, expect, it } from 'vitest';
import { computeCheckInStatus } from './status';

const session = { date: '2026-08-18', startMinutes: 8 * 60, endMinutes: 9 * 60 }; // 08:00–09:00

function at(hh: number, mm: number): Date {
  // UTC-explicit date to match parseDay's UTC semantics (what @db.Date columns store).
  return new Date(`2026-08-18T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
}

describe('computeCheckInStatus', () => {
  it('is UPCOMING before the session ends with no check-in', () => {
    expect(computeCheckInStatus(session, null, at(7, 55))).toBe('UPCOMING');
    expect(computeCheckInStatus(session, null, at(8, 30))).toBe('UPCOMING');
  });

  it('is ABSENT once the session has ended with no check-in', () => {
    expect(computeCheckInStatus(session, null, at(9, 0))).toBe('ABSENT');
    expect(computeCheckInStatus(session, null, at(9, 30))).toBe('ABSENT');
  });

  it('is PRESENT when checked in within 10 minutes of the start', () => {
    expect(computeCheckInStatus(session, at(8, 0), at(8, 0))).toBe('PRESENT');
    expect(computeCheckInStatus(session, at(8, 10), at(8, 10))).toBe('PRESENT');
    // even checked in a bit early
    expect(computeCheckInStatus(session, at(7, 58), at(7, 58))).toBe('PRESENT');
  });

  it('is LATE when checked in more than 10 minutes after the start', () => {
    expect(computeCheckInStatus(session, at(8, 11), at(8, 11))).toBe('LATE');
    expect(computeCheckInStatus(session, at(8, 45), at(8, 45))).toBe('LATE');
  });

  it('a past check-in stays PRESENT/LATE regardless of "now"', () => {
    expect(computeCheckInStatus(session, at(8, 5), at(23, 0))).toBe('PRESENT');
    expect(computeCheckInStatus(session, at(8, 20), at(23, 0))).toBe('LATE');
  });

  it('works correctly with explicit UTC dates (parseDay-style)', () => {
    // Regression test: prove the function uses UTC-midnight (parseDay style)
    // and doesn't depend on local timezone. Use explicit Z-suffixed ISO strings.
    const utcSession = { date: '2026-08-18', startMinutes: 8 * 60, endMinutes: 9 * 60 };
    const nowUtc = new Date('2026-08-18T08:00:00Z'); // exactly session start, UTC
    const checkedInUtc = new Date('2026-08-18T08:05:00Z'); // 5 min late, UTC
    const nowAfterUtc = new Date('2026-08-18T09:30:00Z'); // after session end, UTC

    expect(computeCheckInStatus(utcSession, checkedInUtc, nowUtc)).toBe('PRESENT');
    expect(computeCheckInStatus(utcSession, null, nowAfterUtc)).toBe('ABSENT');
  });
});
