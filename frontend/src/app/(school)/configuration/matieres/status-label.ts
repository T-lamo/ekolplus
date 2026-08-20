import type { SubjectStatus } from './subject-form.constants';

export type SubjectStatusLabelT = (key: 'ACTIVE' | 'DRAFT' | 'ARCHIVED') => string;

export function subjectStatusLabel(status: SubjectStatus, t: SubjectStatusLabelT): string {
  return t(status);
}
