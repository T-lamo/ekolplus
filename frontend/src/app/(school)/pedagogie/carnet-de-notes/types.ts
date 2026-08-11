export type EvaluationType = 'DS' | 'INTERROGATION' | 'EXAMEN' | 'AUTRE';
export type EvaluationStatus = 'DRAFT' | 'PUBLISHED';

export interface ClassSubjectOption {
  id: string;
  classId: string;
  subjectId: string;
  class: { id: string; name: string };
  subject: { id: string; name: string };
  teacher: { id: string; name: string } | null;
  coefficient: number | null;
}

export interface TermOption {
  id: string;
  label: string;
  order: number;
}

export interface EvaluationConfig {
  id?: string;
  classSubjectId: string;
  termId: string;
  label: string;
  type: EvaluationType;
  maxScore: number;
  coefficient: number;
  countsTowardAverage: boolean;
  notes: string | null;
  date: string | null;
}

export interface EvaluationListItem {
  id: string;
  label: string;
  type: EvaluationType;
  maxScore: number;
  coefficient: number;
  countsTowardAverage: boolean;
  status: EvaluationStatus;
  date: string | null;
}

export interface NotebookGradeCell {
  evaluationId: string;
  score: number | null;
  absent: boolean;
  comment: string | null;
}

export interface NotebookStudentRow {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  grades: NotebookGradeCell[];
  average: number | null;
  rank: number | null;
}

export interface NotebookData {
  classSubjectId: string;
  className: string;
  subjectName: string;
  subjectCoefficient: number | null;
  terms: TermOption[];
  resolvedTermId: string | null;
  evaluations: EvaluationListItem[];
  students: NotebookStudentRow[];
  classAverage: number | null;
  bestScore: number | null;
  worstScore: number | null;
  absentCount: number;
  gradedCount: number;
  totalCount: number;
}
