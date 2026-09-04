// Shared by ProfilTab.tsx and EtablissementTab.tsx (both display a
// member's role) and formerly also by the now-retired AdministrateursTab.tsx,
// which previously held a shared `ROLE_LABEL` constant the other two
// imported directly. Extracted to its own file so neither imports from
// another tab's module.
import type { MemberData } from './types';

export type RoleLabelT = (key: 'OWNER' | 'ADMIN' | 'MEMBER') => string;

/** `t` must be scoped to `Common.roles` (`useTranslations('Common.roles')`). */
export function roleLabel(role: MemberData['role'], t: RoleLabelT): string {
  return t(role);
}
