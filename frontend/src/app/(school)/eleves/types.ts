export type StudentStatus = 'ENROLLED' | 'REPEATED_ABSENCES' | 'SUSPENDED';

export interface StudentListItem {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  status: StudentStatus;
  class: { id: string; name: string } | null;
  guardianCount: number;
}

export interface GuardianData {
  id?: string;
  name: string;
  relationship: string;
  phone: string | null;
  email: string | null;
  profession: string | null;
  isPrimary: boolean;
}

export interface StudentDetail {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  placeOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
  address: string | null;
  enrolledAt: string;
  status: StudentStatus;
  guardians: GuardianData[];
  class: { id: string; name: string } | null;
  homeroomTeacher: { id: string; name: string } | null;
}

export interface ClassOption {
  id: string;
  name: string;
}

// ── Epic 6 — Notes & Résultats ────────────────────────────────────────────

export interface EvaluationScore {
  id: string;
  label: string;
  maxScore: number;
  score: number | null;
}

export interface SubjectResult {
  subjectId: string;
  subjectName: string;
  domain: string;
  coefficient: number | null;
  evaluations: EvaluationScore[];
  average: number | null;
  classAverage: number | null;
  trend: { direction: 'up' | 'down' | 'flat' | null; delta: number | null };
  appreciation: string | null;
}

export interface RankingRow {
  studentId: string;
  name: string;
  average: number;
  position: number;
  isSelf: boolean;
}

export interface GoalRow {
  id: string;
  subjectId: string | null;
  subjectName: string;
  targetScore: number;
  current: number | null;
}

export interface StudentResults {
  years: { id: string; label: string; isActive: boolean }[];
  terms: { id: string; label: string; order: number }[];
  resolvedAcademicYearId: string | null;
  resolvedTermId: string | null;
  termMode: 'SPECIFIC' | 'ALL' | 'NONE';
  enrolled: boolean;
  className: string | null;
  subjects: SubjectResult[];
  overallAverage: number | null;
  classOverallAverage: number | null;
  rank: number | null;
  rankedCount: number;
  bestSubject: { name: string; average: number } | null;
  worstSubject: { name: string; average: number } | null;
  alertSubjects: { name: string; average: number }[];
  ranking: RankingRow[];
  goals: GoalRow[] | null;
}
