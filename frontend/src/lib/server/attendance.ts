// Shared helpers for the Attendance Tracking read/write routes — date-only
// (UTC-midnight) handling since Attendance is day-granular (see
// .planning/banani/attendance-tracking.md), plus the rate/absence formula
// applied consistently by the per-row Taux/Absences columns and the
// aggregate "Taux de présence" summary card.
import 'server-only';

export const SCHOOL_WEEK_DAYS = 5; // Lun–Ven, matches the Banani grid

export function dateOnlyUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function mondayOf(date: Date): Date {
  const d = dateOnlyUTC(date);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift Sunday back to the prior Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

// Every school day (Mon–Fri) in the calendar month containing `monthStart`
// — the day-column set for Présences' "Vue mensuelle", same Mon–Fri
// convention as the weekly grid (SCHOOL_WEEK_DAYS), just one month wide.
export function weekdaysInMonth(monthStart: Date): Date[] {
  const first = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1));
  const daysInMonth = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const days: Date[] = [];
  for (let i = 0; i < daysInMonth; i++) {
    const d = addDays(first, i);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(d);
  }
  return days;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isFutureDate(date: Date): boolean {
  return dateOnlyUTC(date).getTime() > dateOnlyUTC(new Date()).getTime();
}

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

// "Taux": PRESENT + LATE count as attended; recorded = every explicit
// status (EXCUSED absences still lower the rate — a justification explains
// an absence, it doesn't erase it). null when nothing is recorded yet.
export function attendanceRate(rows: { status: string }[]): number | null {
  const recorded = rows.length;
  if (recorded === 0) return null;
  const attended = rows.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
  return Math.round((attended / recorded) * 100);
}

// "Absences": both plain and justified absences count — a justification
// explains why the student wasn't there, it doesn't undo the absence.
export function absenceCount(rows: { status: string }[]): number {
  return rows.filter((r) => r.status === 'ABSENT' || r.status === 'EXCUSED').length;
}
