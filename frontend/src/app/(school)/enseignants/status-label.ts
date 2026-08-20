// Shared by page.tsx, TeacherFormModal.tsx, and [id]/page.tsx — all 3
// display the same 3 teacher statuses and previously duplicated the label
// strings.
import type { TeacherStatus } from './types';

export type TeacherStatusLabelT = (key: TeacherStatus) => string;

/** `t` must be scoped to `Enseignants.status` (`useTranslations('Enseignants.status')`). */
export function teacherStatusLabel(status: TeacherStatus, t: TeacherStatusLabelT): string {
  return t(status);
}
