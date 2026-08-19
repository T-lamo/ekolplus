// Pure helpers of the Emploi du temps screen: day/week arithmetic, labels,
// derived grid rows, recurrence count + summary, weekly volume.
import { describe, it, expect } from 'vitest';
import {
  addDays,
  buildRows,
  countOccurrences,
  formatDayShort,
  formatDuration,
  formatLong,
  formatWeekRange,
  isoWeekday,
  legendSubjects,
  mondayOf,
  monthGrid,
  recurrenceDaysLabel,
  sessionColor,
  weekDays,
  weeklyVolume,
} from './timetable-utils';
import type { TimetableSession } from './types';
import { getSubjectVisual } from '@/lib/subject-visuals';

function session(
  over: Partial<TimetableSession> & { date: string; startMinutes: number; endMinutes: number },
): TimetableSession {
  return {
    id: `${over.date}-${over.startMinutes}-${over.classId ?? 'c1'}`,
    academicYearId: 'y',
    classId: 'c1',
    class: { id: 'c1', name: '3ème A', color: null },
    subjectId: 's1',
    subject: { id: 's1', name: 'Mathématiques', abbreviation: 'MATH', color: '#2563eb' },
    teacherId: 't1',
    teacher: { id: 't1', name: 'M. Jean', photoUrl: null },
    room: 'Salle 12',
    roomId: null,
    type: 'CM',
    color: '#2563eb',
    colorOverride: null,
    description: null,
    meetingUrl: null,
    seriesId: null,
    seriesCount: 1,
    ...over,
  };
}

describe('days & labels', () => {
  it('computes weekdays, mondays and week ranges', () => {
    expect(isoWeekday('2026-08-16')).toBe(7);
    expect(mondayOf('2026-08-19')).toBe('2026-08-17');
    expect(weekDays('2026-08-19')).toEqual([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
    ]);
    expect(weekDays('2026-08-19', true)).toHaveLength(6);
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(formatWeekRange(weekDays('2025-06-17'))).toBe('16 – 20 Juin 2025');
    expect(formatWeekRange(weekDays('2025-10-01'))).toBe(
      '29 sept. – 3 oct. 2025'.replace('29 sept.', '29 Sept.').replace('3 oct.', '3 Oct.'),
    );
    expect(formatLong('2026-08-17')).toBe('Lundi 17 août 2026');
    expect(formatDayShort('2025-06-16')).toBe('16 Juin');
    expect(formatDuration(90)).toBe('1h30');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(45)).toBe('45 min');
  });

  it('builds a 6×7 month grid starting on a Monday', () => {
    const grid = monthGrid('2026-08-17');
    expect(grid).toHaveLength(6);
    expect(grid[0]).toHaveLength(7);
    expect(grid[0]?.[0]).toBe('2026-07-27'); // Aug 1st 2026 is a Saturday
    expect(isoWeekday(grid[0]?.[0] ?? '')).toBe(1);
  });
});

describe('buildRows', () => {
  const days = weekDays('2026-08-17');
  it('falls back to the default rows on an empty range', () => {
    const rows = buildRows([], days);
    expect(rows.map((r) => r.start)).toEqual([450, 540, 660, 840, 930]);
  });

  it('never inserts a break/lunch row — gaps between start slots stay blank', () => {
    const sessions = [
      session({ date: '2026-08-17', startMinutes: 450, endMinutes: 540 }),
      session({ date: '2026-08-18', startMinutes: 540, endMinutes: 630 }),
      session({ date: '2026-08-17', startMinutes: 660, endMinutes: 750 }),
      session({ date: '2026-08-19', startMinutes: 840, endMinutes: 930 }),
    ];
    const rows = buildRows(sessions, days);
    expect(rows.map((r) => r.start)).toEqual([450, 540, 660, 840]);
    expect(rows[0]?.cells.get('2026-08-17')?.length).toBe(1);
  });

  it('stacks two classes starting at the same time in the same cell, sorted by class', () => {
    const rows = buildRows(
      [
        session({
          date: '2026-08-17',
          startMinutes: 480,
          endMinutes: 540,
          classId: 'c2',
          class: { id: 'c2', name: '4ème A', color: null },
        }),
        session({ date: '2026-08-17', startMinutes: 480, endMinutes: 540 }),
      ],
      days,
    );
    const row = rows[0];
    expect(row?.cells.get('2026-08-17')?.map((s) => s.class.name)).toEqual(['3ème A', '4ème A']);
  });
});

describe('recurrence & volume', () => {
  it('counts occurrences like the server (base + selected weekdays until inclusive)', () => {
    expect(countOccurrences('2026-08-17', [1], '2026-09-07')).toBe(4);
    expect(countOccurrences('2026-08-17', [], '2026-09-07')).toBe(1);
    expect(countOccurrences('2026-08-17', [1], '2026-08-10')).toBe(1);
  });
  it('labels the selected days in French', () => {
    expect(recurrenceDaysLabel([1])).toBe('lundis');
    expect(recurrenceDaysLabel([1, 3])).toBe('lundis et mercredis');
    expect(recurrenceDaysLabel([1, 3, 5])).toBe('lundis, mercredis et vendredis');
  });
  it('sums the class × subject minutes of the week', () => {
    const sessions = [
      session({ date: '2026-08-17', startMinutes: 480, endMinutes: 600 }),
      session({ date: '2026-08-19', startMinutes: 480, endMinutes: 540 }),
      session({ date: '2026-08-24', startMinutes: 480, endMinutes: 540 }), // next week
      session({
        date: '2026-08-18',
        startMinutes: 480,
        endMinutes: 540,
        subjectId: 's2',
        subject: { id: 's2', name: 'Anglais', abbreviation: 'ANG', color: '#1976d2' },
      }),
    ];
    expect(weeklyVolume(sessions, 'c1', 's1', '2026-08-20')).toBe(180);
    expect(weeklyVolume(sessions, 'c1', 's1', '2026-08-20', '2026-08-17-480-c1')).toBe(60);
    expect(legendSubjects(sessions).map((s) => s.name)).toEqual(['Anglais', 'Mathématiques']);
  });
});

// The colour that identifies a subject on the grid must be the SAME one the
// Matières list shows for it (user request 2026-08-19): explicit session
// override > colour chosen on the subject form > name-derived default.
describe('sessionColor', () => {
  const base = { date: '2026-08-17', startMinutes: 480, endMinutes: 540 };

  it('an explicit session override wins', () => {
    const s = session({ ...base, color: '#e65100', colorOverride: '#e65100' });
    expect(sessionColor(s)).toBe('#e65100');
  });

  it('falls back to the colour chosen on the subject form', () => {
    const s = session({
      ...base,
      color: '#2563eb',
      subject: { id: 's1', name: 'Truc', abbreviation: null, color: '#2563eb' },
    });
    expect(sessionColor(s)).toBe('#2563eb');
  });

  it('a subject without a stored colour gets the same default as the Matières list', () => {
    const s = session({
      ...base,
      color: null,
      subject: { id: 's9', name: 'Philosophie', abbreviation: null, color: null },
    });
    expect(sessionColor(s)).toBe(getSubjectVisual('Philosophie').iconFg);
    // Deterministic: the same name always yields the same colour.
    expect(sessionColor(s)).toBe(sessionColor(session({ ...base, ...s })));
  });

  it('legend swatches follow the same resolution', () => {
    const s = session({
      ...base,
      color: null,
      subject: { id: 's9', name: 'Philosophie', abbreviation: null, color: null },
    });
    expect(legendSubjects([s])[0]?.color).toBe(getSubjectVisual('Philosophie').iconFg);
  });
});
