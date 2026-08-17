// Companion unit test for `scripts/seed-dev-school.ts` — same contract as
// seed-dev.test.ts (production refusal before any prisma call) plus the two
// pure helpers the dataset's freshness and consistency depend on:
// `schoolCalendar` (school year / terms relative to "now") and
// `buildTimetable` (weekly grid with no class / teacher / room overlap).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import {
  main,
  schoolCalendar,
  buildTimetable,
  CLASSES,
  SUBJECTS,
  teacherKeyFor,
} from './seed-dev-school';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;
const ORIG_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = ORIG_NODE_ENV;
  vi.restoreAllMocks();
});

describe('scripts/seed-dev-school', () => {
  it('refuses to run with NODE_ENV=production before any prisma call', async () => {
    process.env.NODE_ENV = 'production';
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit:${code}__`);
    }) as never);

    await expect(main([], { prisma: prismaMock })).rejects.toThrow('__exit:1__');
    expect(errSpy).toHaveBeenCalledWith(expect.stringMatching(/production/i));
    expect(prismaMock.user.upsert).not.toHaveBeenCalled();
    expect(prismaMock.organization.create).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  describe('schoolCalendar', () => {
    it('picks the Sept→Aug year containing "now" and keeps a term in progress', () => {
      const cal = schoolCalendar(new Date('2026-08-17T12:00:00Z'));
      expect(cal.label).toBe('2025-2026');
      expect(cal.start.toISOString()).toBe('2025-09-01T00:00:00.000Z');
      expect(cal.end.toISOString()).toBe('2026-08-31T00:00:00.000Z');
      expect(cal.terms.map((t) => t.label)).toEqual([
        '1er Trimestre',
        '2e Trimestre',
        '3e Trimestre',
      ]);
      const now = new Date('2026-08-17T00:00:00Z');
      expect(cal.terms.some((t) => t.start <= now && now <= t.end)).toBe(true);
    });

    it('rolls over to the next label from September', () => {
      expect(schoolCalendar(new Date('2026-09-15T00:00:00Z')).label).toBe('2026-2027');
      expect(schoolCalendar(new Date('2027-03-01T00:00:00Z')).label).toBe('2026-2027');
    });
  });

  describe('buildTimetable', () => {
    const today = new Date('2026-08-17T00:00:00Z');
    const cal = schoolCalendar(today);
    const classes = CLASSES.map((seed, i) => ({
      id: `class-${i}`,
      seed,
      subjects: SUBJECTS.filter((s) => s.levels.includes(seed.level)).map((s) => ({
        key: s.key,
        classSubjectId: `cs-${i}-${s.key}`,
        teacherKey: teacherKeyFor(s, seed.level),
      })),
    }));
    const sessions = buildTimetable(classes, {
      schoolId: 'school',
      academicYearId: 'year',
      today,
      yearStart: cal.start,
      yearEnd: cal.end,
      sid: (k) => `subject-${k}`,
      tid: (k) => `teacher-${k}`,
    });

    it('never overlaps a class, a teacher or a room', () => {
      const overlaps = (
        keyOf: (s: (typeof sessions)[number]) => string | null | undefined,
      ): number => {
        const byKey = new Map<string, { start: number; end: number }[]>();
        let n = 0;
        for (const s of sessions) {
          const key = keyOf(s);
          if (!key) continue;
          const k = `${key}|${s.date.toISOString()}`;
          const list = byKey.get(k) ?? [];
          if (list.some((o) => s.startMinutes < o.end && o.start < s.endMinutes)) n++;
          list.push({ start: s.startMinutes, end: s.endMinutes });
          byKey.set(k, list);
        }
        return n;
      };
      expect(sessions.length).toBeGreaterThan(0);
      expect(overlaps((s) => s.classId)).toBe(0);
      expect(overlaps((s) => s.teacherId)).toBe(0);
      expect(overlaps((s) => s.room)).toBe(0);
    });

    it('stays inside the school year, on weekdays, within 08:00–15:00', () => {
      for (const s of sessions) {
        expect(s.date >= cal.start && s.date <= cal.end).toBe(true);
        expect(s.date.getUTCDay()).toBeGreaterThanOrEqual(1);
        expect(s.date.getUTCDay()).toBeLessThanOrEqual(5);
        expect(s.startMinutes).toBeGreaterThanOrEqual(8 * 60);
        expect(s.endMinutes).toBeLessThanOrEqual(15 * 60);
        expect(s.endMinutes - s.startMinutes).toBeGreaterThan(0);
      }
    });

    it('covers each class’s weekly hours on a full week (30-slot grid)', () => {
      // 2026-08-10 → 08-14 is a full week inside the year.
      const weekStart = new Date('2026-08-10T00:00:00Z');
      const weekEnd = new Date('2026-08-14T00:00:00Z');
      classes.forEach((c) => {
        const expected = Math.min(
          30,
          c.subjects.reduce((n, cs) => n + (SUBJECTS.find((s) => s.key === cs.key)?.hours ?? 0), 0),
        );
        const hours = sessions
          .filter((s) => s.classId === c.id && s.date >= weekStart && s.date <= weekEnd)
          .reduce((n, s) => n + (s.endMinutes - s.startMinutes) / 60, 0);
        expect(hours, c.seed.name).toBeGreaterThanOrEqual(expected - 2);
        expect(hours, c.seed.name).toBeLessThanOrEqual(30);
      });
    });
  });
});
