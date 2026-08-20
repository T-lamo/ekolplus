// Shared by StudentFormModal.tsx and [id]/page.tsx — both display the
// same 3 student statuses using the full-length wording. page.tsx (the
// list) uses its own shorter `Eleves.list.status` set instead — a
// pre-existing distinction in the original copy (narrower table/card
// cells), not something to collapse into one shared set.
import type { StudentStatus } from './types';

export type StudentStatusLabelT = (key: StudentStatus) => string;

/** `t` must be scoped to `Eleves.status` (`useTranslations('Eleves.status')`). */
export function studentStatusLabel(status: StudentStatus, t: StudentStatusLabelT): string {
  return t(status);
}
