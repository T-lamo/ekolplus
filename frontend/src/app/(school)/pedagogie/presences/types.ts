export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface AttendanceDay {
  date: string;
  isToday: boolean;
  isFuture: boolean;
}

export interface DayRecord {
  status: AttendanceStatus;
  justification: string | null;
}

export interface AttendanceStudentRow {
  id: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  days: Record<string, DayRecord | null>;
  rate: number | null;
  absences: number;
}

export interface ClassOption {
  id: string;
  name: string;
}

export interface AttendanceSummary {
  totalStudents: number;
  className: string | null;
  yearLabel: string | null;
  presentToday: number;
  absentToday: number;
  absentTodayUnjustified: number;
  lateThisMonth: number;
  lateThisMonthDelta: number;
  attendanceRatePercent: number | null;
}

export interface AttendanceResponse {
  classes: ClassOption[];
  resolvedClassId: string | null;
  view: 'week' | 'month';
  rangeStart: string;
  days: AttendanceDay[];
  students: AttendanceStudentRow[];
  summary: AttendanceSummary;
}

export interface AttendanceTermOption {
  id: string;
  label: string;
  order: number;
}

export interface AttendanceStatsResponse {
  classes: ClassOption[];
  resolvedClassId: string | null;
  terms: AttendanceTermOption[];
  resolvedTermId: string | null;
  distribution: {
    present: number;
    absent: number;
    late: number;
    excused: number;
    recorded: number;
  };
  weeklyTrend: { label: string; value: number }[];
  overallRatePercent: number | null;
}

export interface StudentAttendanceDay {
  date: string;
  status: AttendanceStatus;
  justification: string | null;
}

export interface StudentAttendanceResponse {
  studentId: string;
  firstName: string;
  lastName: string;
  terms: AttendanceTermOption[];
  resolvedTermId: string | null;
  summary: { present: number; absent: number; late: number; excused: number; recorded: number };
  ratePercent: number | null;
  absences: number;
  days: StudentAttendanceDay[];
}
