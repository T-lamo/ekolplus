// Pure helpers of the Emploi du temps screen (emploi-du-temps.md): day
// arithmetic on 'YYYY-MM-DD' strings, week/month ranges, the derived grid
// rows (one per distinct start slot), recurrence summary, weekly volume, CSV
// rows. No React, no DOM — see timetable-utils.test.ts.
import { format, type Locale } from 'date-fns';
import { enUS, fr } from 'date-fns/locale';
import { LOCALE_BCP47, type LocaleKey } from '@/lib/locales';
import { subjectAccentColor } from '@/lib/subject-visuals';
import type { SessionType, TimetableSession } from './types';

// ─── Days ('YYYY-MM-DD', handled at UTC midnight so DST never shifts a day) ──
const DAY_MS = 86_400_000;

export function fromDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}
export function toDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(day: string, n: number): string {
  return toDay(new Date(fromDay(day).getTime() + n * DAY_MS));
}
/** Local calendar "today" as 'YYYY-MM-DD'. */
export function todayDay(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
/** ISO weekday 1 (Mon) … 7 (Sun). */
export function isoWeekday(day: string): number {
  const wd = fromDay(day).getUTCDay();
  return wd === 0 ? 7 : wd;
}
export function mondayOf(day: string): string {
  return addDays(day, 1 - isoWeekday(day));
}
/** Mon–Fri of the week containing `day`, + Saturday when asked. */
export function weekDays(day: string, withSaturday = false): string[] {
  const monday = mondayOf(day);
  return Array.from({ length: withSaturday ? 6 : 5 }, (_, i) => addDays(monday, i));
}
export function firstOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}
export function addMonths(day: string, n: number): string {
  const d = fromDay(firstOfMonth(day));
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  return toDay(next);
}
/** 6 rows × 7 columns (Mon → Sun) covering the month of `day`. */
export function monthGrid(day: string): string[][] {
  const start = mondayOf(firstOfMonth(day));
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)),
  );
}

// ─── Labels ────────────────────────────────────────────────────────────────
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// Haitian Creole has no distinct calendar-formatting convention in wide
// practical use (same reasoning as locales.ts's LOCALE_BCP47 and
// DateField.tsx's own CALENDAR_LOCALE: 'ht' maps to the French locale, not a
// bare 'ht' the engine would silently fall back on), so day/month names stay
// French between fr/ht and only switch for en.
const CALENDAR_LOCALE: Record<LocaleKey, Locale> = {
  fr,
  ht: fr,
  en: enUS,
};

export function formatLong(day: string, locale: LocaleKey): string {
  // "Lundi 17 août 2026" / "Monday 17 August 2026"
  return cap(format(fromDay(day), 'EEEE d MMMM yyyy', { locale: CALENDAR_LOCALE[locale] }));
}
export function formatDayName(day: string, locale: LocaleKey): string {
  return cap(format(fromDay(day), 'EEEE', { locale: CALENDAR_LOCALE[locale] }));
}
export function formatDayShort(day: string, locale: LocaleKey): string {
  // "17 Août" — the mock capitalises the month in the column head
  const [n, ...rest] = format(fromDay(day), 'd MMMM', {
    locale: CALENDAR_LOCALE[locale],
  }).split(' ');
  return `${n} ${cap(rest.join(' '))}`;
}
export function formatMonthYear(day: string, locale: LocaleKey): string {
  return cap(format(fromDay(day), 'MMMM yyyy', { locale: CALENDAR_LOCALE[locale] }));
}
/** "16 – 20 Juin 2025" or "29 Sept. – 3 Oct. 2025" across two months. */
export function formatWeekRange(days: string[], locale: LocaleKey): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return '';
  const a = fromDay(first);
  const b = fromDay(last);
  const dateLocale = CALENDAR_LOCALE[locale];
  const month = (d: Date) => cap(format(d, 'MMMM', { locale: dateLocale }));
  const monthShort = (d: Date) => cap(format(d, 'MMM', { locale: dateLocale }));
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()} – ${b.getUTCDate()} ${month(a)} ${b.getUTCFullYear()}`;
  }
  return `${a.getUTCDate()} ${monthShort(a)} – ${b.getUTCDate()} ${monthShort(b)} ${b.getUTCFullYear()}`;
}

// Any real Monday works — only the weekday names are read off it. Routed
// through mondayOf() so the constant stays a Monday even if someone edits it.
const HEADER_WEEK_MONDAY = mondayOf('2026-08-17');
/**
 * Mon → Sun column heads of the month view — « Lun · Mar … » in fr/ht,
 * « Mon · Tue … » in en. date-fns's 'EEE' yields 'lun.' (lowercase, trailing
 * period) in French and 'Mon' in English; cap() + the period strip normalise
 * both to the style the month grid has always shown (the fixups are no-ops
 * for English). Replaces TimetableMonth.tsx's hardcoded French array.
 */
export function weekdayHeaders(locale: LocaleKey): string[] {
  const dateLocale = CALENDAR_LOCALE[locale];
  return Array.from({ length: 7 }, (_, i) =>
    cap(
      format(fromDay(addDays(HEADER_WEEK_MONDAY, i)), 'EEE', { locale: dateLocale }).replace(
        /\.$/,
        '',
      ),
    ),
  );
}
export function minutesToHHMM(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
export function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
/** "1h30", "2h", "45 min". */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0 min';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}
/** 07:00 → 19:00 by 15-minute steps, for the start/end pickers. */
export const TIME_OPTIONS: number[] = Array.from(
  { length: (19 - 7) * 4 + 1 },
  (_, i) => 7 * 60 + i * 15,
);

// ─── Session types ─────────────────────────────────────────────────────────
export const SESSION_TYPES: SessionType[] = ['CM', 'TD', 'TP', 'EXAM'];
/** Visual metadata of a session type. The user-visible long label is NOT
 * here — it lives in the `timetable.sessionType.*` message group so it can
 * be translated; `short` is the persisted API code and stays as-is. */
export const TYPE_META: Record<SessionType, { short: string; badge: string; active: string }> = {
  CM: {
    short: 'CM',
    badge: 'bg-[#ddd6fe] text-[#5b21b6]',
    active: 'border-[#7c3aed] bg-[#ede9fb] text-[#5b21b6]',
  },
  TD: {
    short: 'TD',
    badge: 'bg-[#d1fae5] text-[#065f46]',
    active: 'border-[#059669] bg-[#d1fae5] text-[#065f46]',
  },
  TP: {
    short: 'TP',
    badge: 'bg-[#fee2e2] text-[#991b1b]',
    active: 'border-[#e11d48] bg-[#fee2e2] text-[#991b1b]',
  },
  EXAM: {
    short: 'EXAM',
    badge: 'bg-[#fef3c7] text-[#92400e]',
    active: 'border-[#d97706] bg-[#fef3c7] text-[#92400e]',
  },
};
export function typeMeta(type: string) {
  return TYPE_META[(SESSION_TYPES as string[]).includes(type) ? (type as SessionType) : 'CM'];
}

/**
 * Accent colour of a session: explicit per-session override, else the
 * subject's identity colour — the SAME one the Matières list shows (stored
 * swatch, else name-derived default), so a subject never wears one colour
 * in Configuration and another on the grid.
 */
export function sessionColor(s: Pick<TimetableSession, 'color' | 'subject'>): string {
  return s.color ?? subjectAccentColor(s.subject.name, s.subject.color);
}

/** Colour trio of a course card from the session's accent colour. */
export function cardColors(color: string): {
  background: string;
  color: string;
  band: string;
} {
  return {
    background: `color-mix(in srgb, ${color} 12%, white)`,
    color: `color-mix(in srgb, ${color} 72%, black)`,
    band: color,
  };
}

// ─── Grid rows ─────────────────────────────────────────────────────────────
export const DEFAULT_ROW_STARTS = [7 * 60 + 30, 9 * 60, 11 * 60, 14 * 60, 15 * 60 + 30];

export interface GridRow {
  start: number;
  cells: Map<string, TimetableSession[]>;
}

/**
 * Rows = every distinct start time of the visible sessions (the mock's rows
 * are start slots, not proportional hours), each holding the sessions that
 * start then, per day. No break/lunch row is ever inserted — gaps between
 * slots (including the whole default range when nothing is scheduled) just
 * render as blank cells. Empty range → the default 5 rows.
 */
export function buildRows(
  sessions: TimetableSession[],
  days: string[],
  locale: LocaleKey,
): GridRow[] {
  const collation = LOCALE_BCP47[locale];
  const daySet = new Set(days);
  const visible = sessions.filter((s) => daySet.has(s.date));
  const starts = [...new Set(visible.map((s) => s.startMinutes))].sort((a, b) => a - b);
  const slotStarts = starts.length > 0 ? starts : DEFAULT_ROW_STARTS;
  return slotStarts.map((start) => {
    const cells = new Map<string, TimetableSession[]>();
    for (const day of days) cells.set(day, []);
    const inRow = visible.filter((s) => s.startMinutes === start);
    for (const s of inRow) cells.get(s.date)?.push(s);
    for (const list of cells.values()) {
      list.sort((a, b) => a.class.name.localeCompare(b.class.name, collation));
    }
    return { start, cells };
  });
}

export function sessionsOn(
  sessions: TimetableSession[],
  day: string,
  locale: LocaleKey,
): TimetableSession[] {
  const collation = LOCALE_BCP47[locale];
  return sessions
    .filter((s) => s.date === day)
    .sort(
      (a, b) =>
        a.startMinutes - b.startMinutes || a.class.name.localeCompare(b.class.name, collation),
    );
}

/** Distinct subjects of the visible sessions, for the legend. */
export function legendSubjects(
  sessions: TimetableSession[],
  locale: LocaleKey,
): { id: string; name: string; color: string }[] {
  const seen = new Map<string, { id: string; name: string; color: string }>();
  for (const s of sessions) {
    if (!seen.has(s.subjectId)) {
      seen.set(s.subjectId, {
        id: s.subjectId,
        name: s.subject.name,
        color: sessionColor(s),
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, LOCALE_BCP47[locale]));
}

// ─── Recurrence ────────────────────────────────────────────────────────────
/** Mon–Sat — the only weekdays a weekly recurrence may target. These ISO
 * numbers are sent to the API verbatim (persisted values, never translated);
 * their visible labels live in the `timetable.sessionForm.recurrence.dayShort.*`
 * and `.dayPlural.*` message groups. */
export type RecurrenceDay = 1 | 2 | 3 | 4 | 5 | 6;
export const RECURRENCE_DAYS: readonly RecurrenceDay[] = [1, 2, 3, 4, 5, 6];

/** Same rule as the server: base date + every selected weekday until `until`. */
export function countOccurrences(date: string, days: number[], until: string): number {
  if (!date || !until || until < date) return 1;
  const set = new Set(days);
  let n = 1;
  for (let d = addDays(date, 1); d <= until; d = addDays(d, 1)) {
    if (set.has(isoWeekday(d))) n += 1;
    if (n >= 320) break;
  }
  return n;
}

/** « lundis, mercredis et vendredis » — `names` are already translated by
 * the caller and `and` is the locale's list conjunction, because this module
 * stays React/next-intl free. Empty selection renders an em dash. */
export function joinDayNames(names: string[], and: string): string {
  if (names.length === 0) return '—';
  if (names.length === 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
}

/** Sum of the class × subject sessions in the ISO week of `day` (minutes). */
export function weeklyVolume(
  sessions: TimetableSession[],
  classId: string,
  subjectId: string,
  day: string,
  excludeId?: string,
): number {
  const week = new Set(weekDays(day, true));
  week.add(addDays(mondayOf(day), 6));
  return sessions
    .filter(
      (s) =>
        s.classId === classId &&
        s.subjectId === subjectId &&
        week.has(s.date) &&
        s.id !== excludeId,
    )
    .reduce((n, s) => n + (s.endMinutes - s.startMinutes), 0);
}

// ─── Export ────────────────────────────────────────────────────────────────
export function csvRows(sessions: TimetableSession[], locale: LocaleKey): (string | number)[][] {
  return (
    [...sessions]
      // Chronological, not lexicographic-by-locale: 'YYYY-MM-DD' ordinal
      // comparison is intentionally locale-independent here.
      .sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes)
      .map((s) => [
        s.date,
        formatDayName(s.date, locale),
        minutesToHHMM(s.startMinutes),
        minutesToHHMM(s.endMinutes),
        s.class.name,
        s.subject.name,
        typeMeta(s.type).short,
        s.teacher?.name ?? '',
        s.room ?? '',
        s.description ?? '',
      ])
  );
}
