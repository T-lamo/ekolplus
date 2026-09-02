// Client-side shape of GET /api/student/me (app/api/student/me/route.ts).
// Kept local to the (eleve) group, the way the teacher pages keep theirs.
import type { StudentStatus } from '@/app/(school)/eleves/types';

export interface StudentMeGuardian {
  id: string;
  name: string;
  relationship: string;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
}

export interface StudentMeStudent {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  dateOfBirth: string;
  placeOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
  address: string | null;
  motherTongue: string | null;
  phone: string | null;
  email: string | null;
  status: StudentStatus;
  enrolledAt: string;
  scholarship: boolean;
  guardians: StudentMeGuardian[];
}

export interface StudentMeSession {
  id: string;
  date: string;
  startMinutes: number;
  endMinutes: number;
  room: string | null;
  type: string;
  class: { id: string; name: string; color: string | null };
  subject: {
    id: string;
    name: string;
    abbreviation: string | null;
    color: string | null;
    icon: string | null;
  };
  teacher: { id: string; name: string; photoUrl: string | null } | null;
}

export interface StudentMeRecentGrade {
  evaluationId: string;
  label: string;
  subjectName: string;
  subjectIcon: string | null;
  subjectColor: string | null;
  date: string | null;
  score: number | null;
  maxScore: number;
  absent: boolean;
}

export interface StudentMeTerm {
  id: string;
  label: string;
  order: number;
  type: string;
  startDate: string;
  endDate: string;
}

export interface StudentMeResponse {
  student: StudentMeStudent;
  school: { id: string; name: string };
  class: { id: string; name: string; level: string } | null;
  homeroomTeacher: { id: string; name: string } | null;
  academicYear: { id: string; label: string } | null;
  terms: StudentMeTerm[];
  currentTermId: string | null;
  summary: {
    overallAverage: number | null;
    rank: number | null;
    rankedCount: number;
    attendanceRatePercent: number | null;
    absences: number;
  };
  thisWeekSessions: StudentMeSession[];
  recentGrades: StudentMeRecentGrade[];
}
