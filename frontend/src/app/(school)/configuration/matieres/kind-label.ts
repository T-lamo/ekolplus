import type { SubjectKind } from './subject-form.constants';

export type SubjectKindLabelT = (key: 'REQUIRED' | 'ELECTIVE' | 'OPTIONAL') => string;

export function subjectKindLabel(kind: SubjectKind, t: SubjectKindLabelT): string {
  return t(kind);
}
