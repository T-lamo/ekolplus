// Shared by AdministrateursTab.tsx, ProfilTab.tsx, and EtablissementTab.tsx
// — all three display a member's role and previously imported a shared
// `ROLE_LABEL` constant from AdministrateursTab.tsx directly. Extracted to
// its own file so none of the three imports from another tab's module.
import type { MemberData } from './types';

export type RoleLabelT = (key: 'OWNER' | 'ADMIN' | 'MEMBER') => string;

/** `t` must be scoped to `Common.roles` (`useTranslations('Common.roles')`). */
export function roleLabel(role: MemberData['role'], t: RoleLabelT): string {
  return t(role);
}
