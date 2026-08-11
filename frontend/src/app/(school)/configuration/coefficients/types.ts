export interface ClassSubjectRow {
  id: string;
  classId: string;
  subjectId: string;
  coefficient: number | null;
  weeklyHours: number | null;
  class: { id: string; name: string; level: string };
  subject: { id: string; name: string; code: string | null; domain: string | null };
  teacher: { id: string; name: string } | null;
}

export interface ClassOption {
  id: string;
  name: string;
}

export interface SubjectOption {
  id: string;
  name: string;
  code: string | null;
  domain: string | null;
}
