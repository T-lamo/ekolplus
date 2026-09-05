export type BulletinStatus = 'GENERATED' | 'PENDING';

export interface TermOption {
  id: string;
  label: string;
  order: number;
}

export interface ListStudentRow {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  average: number | null;
  rank: number | null;
  appreciation: string | null;
  status: BulletinStatus;
}

export interface BulletinsListData {
  classId: string;
  className: string;
  terms: TermOption[];
  resolvedTermId: string | null;
  students: ListStudentRow[];
  totalCount: number;
  generatedCount: number;
  pendingCount: number;
  classAverage: number | null;
  strugglingCount: number;
}

export interface BulletinSubjectRow {
  subjectName: string;
  teacherName: string | null;
  coefficient: number | null;
  average: number | null;
  classAverage: number | null;
  min: number | null;
  max: number | null;
  appreciation: string | null;
}

export interface BulletinTemplateRef {
  id: string;
  name: string;
  config: import('../configuration/modele-bulletin/types').BulletinTemplateConfig;
  isActive: boolean;
}

export interface StudentBulletinData {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  dateOfBirth: string;
  classId: string;
  className: string;
  classSize: number;
  homeroomTeacherName: string | null;
  schoolName: string;
  schoolAddress: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
  schoolLogoUrl: string | null;
  directorSignatureUrl: string | null;
  academicYearLabel: string;
  termLabel: string;
  terms: TermOption[];
  resolvedTermId: string | null;
  studentIndex: number | null;
  prevStudentId: string | null;
  nextStudentId: string | null;
  template: BulletinTemplateRef | null;
  overallAverage: number | null;
  classAverage: number | null;
  rank: number | null;
  rankedCount: number;
  subjects: BulletinSubjectRow[];
  qualitativeSubjects: {
    subjectName: string;
    ratingScale: string[];
    criteria: { label: string; level: number | null }[];
  }[];
  generalAppreciation: string | null;
}
