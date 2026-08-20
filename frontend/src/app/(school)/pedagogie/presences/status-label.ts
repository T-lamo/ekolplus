// Shared by page.tsx and AttendanceEditModal.tsx — both display the same
// 4 attendance statuses and previously duplicated the label strings.
import type { AttendanceStatus } from './types';

export type StatusLabelT = (key: AttendanceStatus) => string;

/** `t` must be scoped to `Presences.status` (`useTranslations('Presences.status')`). */
export function statusLabel(status: AttendanceStatus, t: StatusLabelT): string {
  return t(status);
}
