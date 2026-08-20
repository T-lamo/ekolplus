export type Mention = 'TRES_BIEN' | 'BIEN' | 'ASSEZ_BIEN' | 'PASSABLE' | 'INSUFFISANT' | 'FAIBLE';
export type AppreciationStatus = 'NONE' | 'DRAFT' | 'PUBLISHED';

/** Display order for every mention picker, filter and chart in this module.
 * The labels themselves live in the `appreciations.mention.*` message
 * namespace — read them with `useTranslations('Appreciations.mention')`
 * and `t(mention)`. */
export const MENTIONS: Mention[] = [
  'TRES_BIEN',
  'BIEN',
  'ASSEZ_BIEN',
  'PASSABLE',
  'INSUFFISANT',
  'FAIBLE',
];

/** @deprecated Being replaced by `MENTIONS` + the `appreciations.mention.*`
 * message namespace. Still imported by the files this module's i18n
 * migration has not reached yet; deleted once the last one migrates. */
export const MENTION_LABEL: Record<Mention, string> = {
  TRES_BIEN: 'Très Bien',
  BIEN: 'Bien',
  ASSEZ_BIEN: 'Assez Bien',
  PASSABLE: 'Passable',
  INSUFFISANT: 'Insuffisant',
  FAIBLE: 'Faible',
};

export interface TermOption {
  id: string;
  label: string;
  order: number;
}

export interface ClassOption {
  id: string;
  name: string;
}

export interface ListStudentRow {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  average: number | null;
  rank: number | null;
  mention: Mention | null;
  text: string | null;
  status: AppreciationStatus;
  authorName: string | null;
}

export interface SubjectSummaryRow {
  classSubjectId: string;
  subjectId: string;
  subjectName: string;
  teacherName: string | null;
  coefficient: number | null;
  classAverage: number | null;
  saisieCount: number;
  totalCount: number;
}

export interface AppreciationsListData {
  classId: string;
  className: string;
  homeroomTeacherName: string | null;
  terms: TermOption[];
  resolvedTermId: string | null;
  students: ListStudentRow[];
  subjects: SubjectSummaryRow[];
  totalCount: number;
  saisieCount: number;
  positiveCount: number;
  alertCount: number;
}

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
  firstName: string;
  lastName: string;
  studentNumber: string;
  classId: string;
  className: string;
  homeroomTeacherName: string | null;
  terms: TermOption[];
  resolvedTermId: string | null;
  studentIndex: number | null;
  classSize: number;
  prevStudentId: string | null;
  nextStudentId: string | null;
  overallAverage: number | null;
  classAverage: number | null;
  rank: number | null;
  rankedCount: number;
  general: GeneralAppreciation | null;
  subjects: SubjectAppreciationRow[];
}
