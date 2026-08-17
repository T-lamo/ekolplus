// Emploi du temps — pure helpers shared by /api/school/timetable routes
// (emploi-du-temps.md). A "session" is one dated slot; a weekly recurrence
// is expanded at creation into one row per occurrence sharing a `seriesId`,
// so reads are plain range queries and "delete this one / the whole series"
// are trivial. Kept free of Prisma so the recurrence and overlap rules can
// be unit-tested without a DB.

export const SESSION_TYPES = ['CM', 'TD', 'TP', 'EXAM'] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' → UTC-midnight Date (what `@db.Date` columns store). */
export function parseDay(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

/** Date → 'YYYY-MM-DD' (UTC). */
export function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** ISO weekday 1 (Monday) … 7 (Sunday). */
export function isoWeekday(d: Date): number {
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
}

export interface Recurrence {
  /** ISO weekdays 1..6 (Mon..Sat) on which the session repeats. */
  days: number[];
  /** Last day of the series, inclusive ('YYYY-MM-DD'). */
  until: string;
}

/**
 * The dates a session covers: the base `date` itself, plus every later day
 * up to `until` (inclusive) whose weekday is in `days`. Sorted ascending,
 * no duplicates. Capped so a bad `until` can't fan out into thousands of
 * rows (52 weeks × 6 days is already a full year).
 */
export const MAX_OCCURRENCES = 320;

export function expandRecurrence(date: string, recurrence?: Recurrence | null): Date[] {
  const base = parseDay(date);
  if (!recurrence || recurrence.days.length === 0) return [base];
  const until = parseDay(recurrence.until);
  const days = new Set(recurrence.days);
  const out: Date[] = [base];
  for (let d = new Date(base.getTime() + DAY_MS); d <= until; d = new Date(d.getTime() + DAY_MS)) {
    if (days.has(isoWeekday(d))) out.push(d);
    if (out.length >= MAX_OCCURRENCES) break;
  }
  return out;
}

/** Half-open interval overlap on minutes-of-day. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export interface ConflictCandidate {
  id: string;
  date: Date;
  startMinutes: number;
  endMinutes: number;
  classId: string;
  teacherId: string | null;
  room: string | null;
}

export interface ConflictKind {
  kind: 'class' | 'teacher' | 'room';
  sessionId: string;
}

/**
 * Which existing sessions collide with a candidate slot. `existing` is
 * expected to be pre-filtered to the candidate dates by the caller (one
 * indexed query); this only applies the business rule: same class, same
 * teacher or same room at an overlapping time on the same day. Rooms are
 * compared case-insensitively after trimming ("Salle 12" == "salle 12 ").
 */
export function detectConflicts(
  candidate: {
    dates: Date[];
    startMinutes: number;
    endMinutes: number;
    classId: string;
    teacherId: string | null;
    room: string | null;
  },
  existing: ConflictCandidate[],
  excludeIds: ReadonlySet<string> = new Set(),
): (ConflictKind & { session: ConflictCandidate })[] {
  const dates = new Set(candidate.dates.map((d) => d.getTime()));
  const room = normalizeRoom(candidate.room);
  const out: (ConflictKind & { session: ConflictCandidate })[] = [];
  for (const s of existing) {
    if (excludeIds.has(s.id)) continue;
    if (!dates.has(s.date.getTime())) continue;
    if (!overlaps(candidate.startMinutes, candidate.endMinutes, s.startMinutes, s.endMinutes)) {
      continue;
    }
    if (s.classId === candidate.classId) {
      out.push({ kind: 'class', sessionId: s.id, session: s });
    } else if (candidate.teacherId && s.teacherId === candidate.teacherId) {
      out.push({ kind: 'teacher', sessionId: s.id, session: s });
    } else if (room && normalizeRoom(s.room) === room) {
      out.push({ kind: 'room', sessionId: s.id, session: s });
    }
  }
  return out;
}

export function normalizeRoom(room: string | null | undefined): string | null {
  const r = room?.trim().toLowerCase();
  return r ? r : null;
}

/** "08:00" for 480. */
export function minutesToHHMM(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
