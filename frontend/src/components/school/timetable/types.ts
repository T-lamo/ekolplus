// Client-side shapes of /api/school/timetable (emploi-du-temps.md).
export type SessionType = 'CM' | 'TD' | 'TP' | 'EXAM';

export interface TimetableSession {
  id: string;
  academicYearId: string;
  classId: string;
  class: { id: string; name: string; color: string | null };
  subjectId: string;
  subject: { id: string; name: string; abbreviation: string | null; color: string | null };
  teacherId: string | null;
  teacher: { id: string; name: string; photoUrl: string | null } | null;
  room: string | null;
  type: string;
  /** Effective colour (override or the subject's) — may be null for a
   * subject without identity colour; the UI then falls back to primary. */
  color: string | null;
  date: string; // YYYY-MM-DD
  startMinutes: number;
  endMinutes: number;
  description: string | null;
  meetingUrl: string | null;
  seriesId: string | null;
  seriesCount: number;
}

export interface TimetableResponse {
  academicYear: { id: string; label: string } | null;
  sessions: TimetableSession[];
  rooms: string[];
}

export type TimetableView = 'month' | 'week' | 'day' | 'agenda';

export interface TimetableFilters {
  classId: string;
  teacherId: string;
  room: string;
  subjectId: string;
}

export interface ClassOption {
  id: string;
  name: string;
  color: string | null;
  room: string | null;
}
export interface TeacherOption {
  id: string;
  name: string;
  photoUrl: string | null;
}
export interface SubjectOption {
  id: string;
  name: string;
  abbreviation: string | null;
  color: string | null;
}
/** ClassSubject pivot — default teacher + weekly hours per class × subject. */
export interface ClassSubjectLink {
  classId: string;
  subjectId: string;
  teacherId: string | null;
  weeklyHours: number | null;
}

export interface ConflictDetail {
  kind: 'class' | 'teacher' | 'room';
  date: string;
  startMinutes: number;
  endMinutes: number;
  subject: string;
  class: string;
  teacher: string | null;
  room: string | null;
  message: string;
}
