// Pure helpers of the Emploi du temps screen (emploi-du-temps.md): day
// arithmetic on 'YYYY-MM-DD' strings, week/month ranges, the derived grid
// rows (start slots + PAUSE / DÉJEUNER rows), recurrence summary, weekly
// volume, CSV rows. No React, no DOM — see timetable-utils.test.ts.
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
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

export function formatLong(day: string): string {
  // "Lundi 17 août 2026"
  return cap(format(fromDay(day), 'EEEE d MMMM yyyy', { locale: fr }));
}
export function formatDayName(day: string): string {
  return cap(format(fromDay(day), 'EEEE', { locale: fr }));
}
export function formatDayShort(day: string): string {
  // "17 Août" — the mock capitalises the month in the column head
  const [n, ...rest] = format(fromDay(day), 'd MMMM', { locale: fr }).split(' ');
  return `${n} ${cap(rest.join(' '))}`;
}
export function formatMonthYear(day: string): string {
  return cap(format(fromDay(day), 'MMMM yyyy', { locale: fr }));
}
/** "16 – 20 Juin 2025" or "29 Sept. – 3 Oct. 2025" across two months. */
export function formatWeekRange(days: string[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return '';
  const a = fromDay(first);
  const b = fromDay(last);
  const month = (d: Date) => cap(format(d, 'MMMM', { locale: fr }));
  const monthShort = (d: Date) => cap(format(d, 'MMM', { locale: fr }));
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()} – ${b.getUTCDate()} ${month(a)} ${b.getUTCFullYear()}`;
  }
  return `${a.getUTCDate()} ${monthShort(a)} – ${b.getUTCDate()} ${monthShort(b)} ${b.getUTCFullYear()}`;
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
export const TYPE_META: Record<
  SessionType,
  { short: string; label: string; badge: string; active: string }
> = {
  CM: {
    short: 'CM',
    label: 'Cours magistral',
    badge: 'bg-[#ddd6fe] text-[#5b21b6]',
    active: 'border-[#7c3aed] bg-[#ede9fb] text-[#5b21b6]',
  },
  TD: {
    short: 'TD',
    label: 'Travaux dirigés',
    badge: 'bg-[#d1fae5] text-[#065f46]',
    active: 'border-[#059669] bg-[#d1fae5] text-[#065f46]',
  },
  TP: {
    short: 'TP',
    label: 'Travaux pratiques',
    badge: 'bg-[#fee2e2] text-[#991b1b]',
    active: 'border-[#e11d48] bg-[#fee2e2] text-[#991b1b]',
  },
  EXAM: {
    short: 'EXAM',
    label: 'Examen',
    badge: 'bg-[#fef3c7] text-[#92400e]',
    active: 'border-[#d97706] bg-[#fef3c7] text-[#92400e]',
  },
};
export function typeMeta(type: string) {
  return TYPE_META[(SESSION_TYPES as string[]).includes(type) ? (type as SessionType) : 'CM'];
}

/** Colour trio of a course card from the session's accent colour. */
export const DEFAULT_SESSION_COLOR = '#6c2bd9';
export function cardColors(color: string | null): {
  background: string;
  color: string;
  band: string;
} {
  const c = color ?? DEFAULT_SESSION_COLOR;
  return {
    background: `color-mix(in srgb, ${c} 12%, white)`,
    color: `color-mix(in srgb, ${c} 72%, black)`,
    band: c,
  };
}

// ─── Grid rows ─────────────────────────────────────────────────────────────
export const DEFAULT_ROW_STARTS = [7 * 60 + 30, 9 * 60, 11 * 60, 14 * 60, 15 * 60 + 30];
const BREAK_MIN_GAP = 30;
const LUNCH_MIN_GAP = 45;
const NOON = 12 * 60;
const AFTER_LUNCH = 14 * 60;

export type GridRow =
  | { kind: 'slot'; start: number; cells: Map<string, TimetableSession[]> }
  | { kind: 'break'; start: number; label: 'PAUSE' | 'DÉJEUNER' };

/**
 * Rows = every distinct start time of the visible sessions (the mock's rows
 * are start slots, not proportional hours), each holding the sessions that
 * start then, per day. A PAUSE / DÉJEUNER row is inserted when every session
 * of a row has ended ≥ 30 min before the next row starts (≥ 45 min gap
 * touching 12:00–14:00 → DÉJEUNER). Empty range → the default 5 rows.
 */
export function buildRows(sessions: TimetableSession[], days: string[]): GridRow[] {
  const daySet = new Set(days);
  const visible = sessions.filter((s) => daySet.has(s.date));
  const starts = [...new Set(visible.map((s) => s.startMinutes))].sort((a, b) => a - b);
  const slotStarts = starts.length > 0 ? starts : DEFAULT_ROW_STARTS;
  const rows: GridRow[] = [];
  slotStarts.forEach((start, i) => {
    const cells = new Map<string, TimetableSession[]>();
    for (const day of days) cells.set(day, []);
    const inRow = visible.filter((s) => s.startMinutes === start);
    for (const s of inRow) cells.get(s.date)?.push(s);
    for (const list of cells.values()) {
      list.sort((a, b) => a.class.name.localeCompare(b.class.name, 'fr'));
    }
    rows.push({ kind: 'slot', start, cells });
    const next = slotStarts[i + 1];
    if (next === undefined) return;
    const rowEnd = inRow.length > 0 ? Math.max(...inRow.map((s) => s.endMinutes)) : start + 60;
    const gap = next - rowEnd;
    if (gap >= BREAK_MIN_GAP) {
      const lunch = gap >= LUNCH_MIN_GAP && rowEnd <= AFTER_LUNCH - 30 && next >= NOON + 30;
      rows.push({ kind: 'break', start: rowEnd, label: lunch ? 'DÉJEUNER' : 'PAUSE' });
    }
  });
  return rows;
}

export function sessionsOn(sessions: TimetableSession[], day: string): TimetableSession[] {
  return sessions
    .filter((s) => s.date === day)
    .sort(
      (a, b) => a.startMinutes - b.startMinutes || a.class.name.localeCompare(b.class.name, 'fr'),
    );
}

/** Distinct subjects of the visible sessions, for the legend. */
export function legendSubjects(
  sessions: TimetableSession[],
): { id: string; name: string; color: string }[] {
  const seen = new Map<string, { id: string; name: string; color: string }>();
  for (const s of sessions) {
    if (!seen.has(s.subjectId)) {
      seen.set(s.subjectId, {
        id: s.subjectId,
        name: s.subject.name,
        color: s.color ?? DEFAULT_SESSION_COLOR,
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

// ─── Recurrence ────────────────────────────────────────────────────────────
export const RECURRENCE_DAYS: { value: number; short: string; plural: string }[] = [
  { value: 1, short: 'L', plural: 'lundis' },
  { value: 2, short: 'Ma', plural: 'mardis' },
  { value: 3, short: 'Me', plural: 'mercredis' },
  { value: 4, short: 'J', plural: 'jeudis' },
  { value: 5, short: 'V', plural: 'vendredis' },
  { value: 6, short: 'Sa', plural: 'samedis' },
];

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

export function recurrenceDaysLabel(days: number[]): string {
  const names = RECURRENCE_DAYS.filter((d) => days.includes(d.value)).map((d) => d.plural);
  if (names.length === 0) return '—';
  if (names.length === 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
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
export const CSV_HEADERS = [
  'Date',
  'Jour',
  'Début',
  'Fin',
  'Classe',
  'Matière',
  'Type',
  'Enseignant',
  'Salle',
  'Description',
];
export function csvRows(sessions: TimetableSession[]): (string | number)[][] {
  return [...sessions]
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes)
    .map((s) => [
      s.date,
      formatDayName(s.date),
      minutesToHHMM(s.startMinutes),
      minutesToHHMM(s.endMinutes),
      s.class.name,
      s.subject.name,
      typeMeta(s.type).short,
      s.teacher?.name ?? '',
      s.room ?? '',
      s.description ?? '',
    ]);
}
