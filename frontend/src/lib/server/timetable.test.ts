// Pure timetable rules (emploi-du-temps.md): recurrence expansion, overlap,
// conflict classification (class > teacher > room precedence, room compared
// case-insensitively, excluded ids ignored).
import { describe, it, expect } from 'vitest';
import {
  detectConflicts,
  expandRecurrence,
  formatDay,
  isoWeekday,
  minutesToHHMM,
  overlaps,
  parseDay,
  MAX_OCCURRENCES,
} from './timetable';

describe('expandRecurrence', () => {
  it('returns only the base date without recurrence', () => {
    expect(expandRecurrence('2026-08-17', null).map(formatDay)).toEqual(['2026-08-17']);
    expect(
      expandRecurrence('2026-08-17', { days: [], until: '2026-12-31' }).map(formatDay),
    ).toEqual(['2026-08-17']);
  });

  it('keeps the base date and adds every selected weekday up to `until` inclusive', () => {
    // 2026-08-17 is a Monday; Mondays until Sept 7 → 17, 24, 31, 07 (4 occurrences).
    const dates = expandRecurrence('2026-08-17', { days: [1], until: '2026-09-07' }).map(formatDay);
    expect(dates).toEqual(['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07']);
    // Base Monday + Wednesdays: base always first, then only Wednesdays.
    const wed = expandRecurrence('2026-08-17', { days: [3], until: '2026-08-31' }).map(formatDay);
    expect(wed).toEqual(['2026-08-17', '2026-08-19', '2026-08-26']);
  });

  it('caps the fan-out', () => {
    const dates = expandRecurrence('2026-01-01', { days: [1, 2, 3, 4, 5, 6], until: '2036-01-01' });
    expect(dates.length).toBe(MAX_OCCURRENCES);
  });
});

describe('overlaps / minutesToHHMM / isoWeekday', () => {
  it('half-open intervals: touching slots do not overlap', () => {
    expect(overlaps(480, 540, 540, 600)).toBe(false);
    expect(overlaps(480, 600, 540, 660)).toBe(true);
    expect(overlaps(540, 600, 480, 660)).toBe(true);
  });
  it('formats minutes and weekdays', () => {
    expect(minutesToHHMM(450)).toBe('07:30');
    expect(minutesToHHMM(840)).toBe('14:00');
    expect(isoWeekday(parseDay('2026-08-16'))).toBe(7); // Sunday
    expect(isoWeekday(parseDay('2026-08-17'))).toBe(1); // Monday
  });
});

describe('detectConflicts', () => {
  const existing = [
    {
      id: 's1',
      date: parseDay('2026-08-17'),
      startMinutes: 480,
      endMinutes: 600,
      classId: 'c1',
      teacherId: 't1',
      room: 'Salle 12',
    },
    {
      id: 's2',
      date: parseDay('2026-08-18'),
      startMinutes: 480,
      endMinutes: 540,
      classId: 'c2',
      teacherId: 't2',
      room: 'Labo',
    },
  ];

  it('flags the class first, then the teacher, then the room', () => {
    const base = { dates: [parseDay('2026-08-17')], startMinutes: 540, endMinutes: 600 };
    expect(
      detectConflicts({ ...base, classId: 'c1', teacherId: 't9', room: null }, existing).map(
        (c) => c.kind,
      ),
    ).toEqual(['class']);
    expect(
      detectConflicts({ ...base, classId: 'c3', teacherId: 't1', room: null }, existing).map(
        (c) => c.kind,
      ),
    ).toEqual(['teacher']);
    expect(
      detectConflicts({ ...base, classId: 'c3', teacherId: null, room: ' salle 12' }, existing).map(
        (c) => c.kind,
      ),
    ).toEqual(['room']);
  });

  it('ignores other dates, non-overlapping times and excluded ids', () => {
    const base = { classId: 'c1', teacherId: 't1', room: 'Salle 12' };
    expect(
      detectConflicts(
        { ...base, dates: [parseDay('2026-08-19')], startMinutes: 480, endMinutes: 600 },
        existing,
      ),
    ).toEqual([]);
    expect(
      detectConflicts(
        { ...base, dates: [parseDay('2026-08-17')], startMinutes: 600, endMinutes: 660 },
        existing,
      ),
    ).toEqual([]);
    expect(
      detectConflicts(
        { ...base, dates: [parseDay('2026-08-17')], startMinutes: 480, endMinutes: 600 },
        existing,
        new Set(['s1']),
      ),
    ).toEqual([]);
  });
});
