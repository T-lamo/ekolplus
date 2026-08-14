export type StudentStatus = 'ENROLLED' | 'REPEATED_ABSENCES' | 'SUSPENDED';

export interface StudentListItem {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
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
  photoUrl: string | null;
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

// ── Epic 6 — Appréciations ─────────────────────────────────────────────────

export type Mention = 'TRES_BIEN' | 'BIEN' | 'ASSEZ_BIEN' | 'PASSABLE' | 'INSUFFISANT' | 'FAIBLE';
export type AppreciationStatus = 'NONE' | 'DRAFT' | 'PUBLISHED';

export const MENTION_LABEL: Record<Mention, string> = {
  TRES_BIEN: 'Très Bien',
  BIEN: 'Bien',
  ASSEZ_BIEN: 'Assez Bien',
  PASSABLE: 'Passable',
  INSUFFISANT: 'Insuffisant',
  FAIBLE: 'Faible',
};

export interface GeneralAppreciation {
  mention: Mention | null;
  text: string | null;
  comportement: string | null;
  investissement: string | null;
  assiduite: string | null;
  status: AppreciationStatus;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectAppreciationRow {
  classSubjectId: string;
  subjectId: string;
  subjectName: string;
  coefficient: number | null;
  teacherName: string | null;
  average: number | null;
  mention: Mention | null;
  text: string | null;
  status: AppreciationStatus;
}

export interface StudentAppreciationData {
  studentId: string;
  terms: { id: string; label: string; order: number }[];
  resolvedTermId: string | null;
  overallAverage: number | null;
  classAverage: number | null;
  rank: number | null;
  rankedCount: number;
  general: GeneralAppreciation | null;
  subjects: SubjectAppreciationRow[];
}
