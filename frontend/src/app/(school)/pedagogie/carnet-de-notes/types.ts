import type { EvaluationMode } from '@/lib/qualitative';

export type EvaluationType = 'DS' | 'INTERROGATION' | 'EXAMEN' | 'AUTRE';
export type EvaluationStatus = 'DRAFT' | 'PUBLISHED';

export interface ClassSubjectOption {
  id: string;
  classId: string;
  subjectId: string;
  class: { id: string; name: string };
  subject: { id: string; name: string; evaluationMode?: EvaluationMode };
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

// "Toutes les matières" view — GET /api/school/classes/[id]/notebook. Same
// class-wide shape as NotebookData (classAverage/bestScore/worstScore/
// gradedCount/totalCount mean the same thing, computed from each student's
// GENERAL weighted average instead of a single subject's average) but
// `subjects` replaces the single subjectName/evaluations, and each student
// row carries one grade block + sub-average per subject.
export interface CombinedSubjectBlock {
  classSubjectId: string;
  subjectId: string;
  subjectName: string;
  subjectCoefficient: number | null;
  evaluations: EvaluationListItem[];
}

export interface CombinedStudentSubjectCell {
  classSubjectId: string;
  grades: NotebookGradeCell[];
  average: number | null;
}

export interface CombinedStudentRow {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  subjects: CombinedStudentSubjectCell[];
  generalAverage: number | null;
  rank: number | null;
}

export interface CombinedNotebookData {
  classId: string;
  className: string;
  terms: TermOption[];
  resolvedTermId: string | null;
  subjects: CombinedSubjectBlock[];
  students: CombinedStudentRow[];
  classAverage: number | null;
  bestScore: number | null;
  worstScore: number | null;
  gradedCount: number;
  totalCount: number;
}

// Unified render model the page builds from either NotebookData (single
// subject wrapped as a 1-element array) or CombinedNotebookData — lets the
// table/sticky-columns/kebab/CSV-export code be written once. `subjectId`/
// `singleClassSubjectId` distinguish "one real subject selected" (kebab can
// deep-link a "Saisir des notes" create flow, no subject group header row
// needed) from "combined" (group header row + per-subject sub-average
// column shown, since subjects.length > 1).
export interface UnifiedSubjectBlock {
  classSubjectId: string;
  subjectName: string;
  evaluations: EvaluationListItem[];
}

export interface UnifiedStudentRow {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  bySubject: Record<string, CombinedStudentSubjectCell>;
  generalAverage: number | null;
  rank: number | null;
}

export interface UnifiedNotebookData {
  combined: boolean;
  className: string;
  terms: TermOption[];
  resolvedTermId: string | null;
  subjects: UnifiedSubjectBlock[];
  students: UnifiedStudentRow[];
  classAverage: number | null;
  bestScore: number | null;
  worstScore: number | null;
  gradedCount: number;
  totalCount: number;
}
