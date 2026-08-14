export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface WeekDay {
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
  weekStart: string;
  weekDays: WeekDay[];
  students: AttendanceStudentRow[];
  summary: AttendanceSummary;
}
