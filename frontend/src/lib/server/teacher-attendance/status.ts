// Shared status computation for a teacher's per-session check-in — used by
// both the teacher portal's "today" view and the admin history view so the
// two never drift (see docs/superpowers/specs/2026-08-18-teacher-self-checkin-design.md).
import 'server-only';

import { parseDay } from '@/lib/server/timetable';

export type CheckInStatus = 'UPCOMING' | 'PRESENT' | 'LATE' | 'ABSENT';

const LATE_THRESHOLD_MINUTES = 10;

// Also consumed by /api/teacher/checkins (the window a check-in is still
// accepted) — single source of truth so the "still checkable" window here
// and the button/ABSENT-chip logic there can never disagree.
export const GRACE_MINUTES = 15;

export function computeCheckInStatus(
  session: { date: string; startMinutes: number; endMinutes: number },
  checkedInAt: Date | null,
  now: Date,
): CheckInStatus {
  const dayStart = parseDay(session.date);
  const sessionStart = new Date(dayStart.getTime() + session.startMinutes * 60_000);
  const sessionEnd = new Date(dayStart.getTime() + session.endMinutes * 60_000);
  const absentAt = new Date(sessionEnd.getTime() + GRACE_MINUTES * 60_000);

  if (checkedInAt) {
    const lateByMinutes = (checkedInAt.getTime() - sessionStart.getTime()) / 60_000;
    return lateByMinutes > LATE_THRESHOLD_MINUTES ? 'LATE' : 'PRESENT';
  }

  return now.getTime() >= absentAt.getTime() ? 'ABSENT' : 'UPCOMING';
}
