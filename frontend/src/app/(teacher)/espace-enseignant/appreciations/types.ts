// Teacher-side shapes for the Appréciations screens. Mention/status enums
// and MENTIONS ordering are shared with the school module (pure module, no
// fetches) — do not duplicate them.
import type {
  AppreciationStatus,
  GeneralAppreciation,
  Mention,
  TermOption,
} from '@/app/(school)/pedagogie/appreciations/types';

export interface TeacherApprClassCard {
  classId: string;
  className: string;
  level: string | null;
  studentCount: number;
  isMyHomeroom: boolean;
  firstStudentId: string | null;
  generalSaisieCount: number | null;
  subjects: { subjectId: string; subjectName: string; saisieCount: number }[];
}

export interface TeacherAppreciationsListData {
  terms: TermOption[];
  resolvedTermId: string | null;
  classes: TeacherApprClassCard[];
}

export interface TeacherClassmateRow {
  studentId: string;
  firstName: string;
  lastName: string;
  saisieStatus: AppreciationStatus;
}

export interface TeacherSubjectApprRow {
  classSubjectId: string;
  subjectId: string;
  subjectName: string;
  coefficient: number | null;
  average: number | null;
  mention: Mention | null;
  text: string | null;
  status: AppreciationStatus;
}

export interface TeacherStudentAppreciationData {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  classId: string;
  className: string;
  isMyHomeroom: boolean;
  terms: TermOption[];
  resolvedTermId: string | null;
  studentIndex: number | null;
  classSize: number;
  prevStudentId: string | null;
  nextStudentId: string | null;
  classmates: TeacherClassmateRow[];
  overallAverage: number | null;
  classAverage: number | null;
  rank: number | null;
  rankedCount: number;
  general: GeneralAppreciation | null;
  subjects: TeacherSubjectApprRow[];
}
