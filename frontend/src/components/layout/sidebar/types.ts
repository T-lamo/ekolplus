import type { LucideIcon } from 'lucide-react';
import { hasGrant, type PermissionModuleKey } from '@/lib/permissions';

/** Org roles of the school shell (mirrors lib/server/middleware/require-org-role). */
export type NavRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Minimum org role that sees the entry (default: everyone). `ADMIN` hides
   * it from plain MEMBERs — e.g. « Abonnement » (amounts, invoices). The
   * server still enforces the rule (403); this only keeps the menu honest.
   */
  minRole?: 'ADMIN' | 'OWNER';
  /**
   * RBAC module this entry belongs to. Entries with no `module` (e.g.
   * « Abonnement », « Paramètres ») are always kept by
   * `filterSectionsByPermissions` — they are role-gated, not permission-gated.
   */
  module?: PermissionModuleKey;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

const ROLE_RANK: Record<NavRole, number> = { MEMBER: 0, ADMIN: 1, OWNER: 2 };

/**
 * Drops the items whose `minRole` the viewer does not reach and the sections
 * left empty. `role === null` (unknown / loading) keeps everything: a menu
 * that flickers is worse than a 403 page for the rare MEMBER click.
 */
export function filterSectionsByRole(sections: NavSection[], role: NavRole | null): NavSection[] {
  if (role === null) return sections;
  const rank = ROLE_RANK[role];
  return sections
    .map((s) => ({
      ...s,
      items: s.items.filter((it) => !it.minRole || rank >= ROLE_RANK[it.minRole]),
    }))
    .filter((s) => s.items.length > 0);
}

/**
 * Drops the items whose `module` the viewer has no `view` grant for and the
 * sections left empty. `permissions === null` (still loading) keeps
 * everything, same anti-flicker convention as `usePermissions`/`computeCan`.
 * Items with no `module` (Abonnement, Paramètres) are always kept: they are
 * role-gated by `filterSectionsByRole`, not permission-gated.
 */
export function filterSectionsByPermissions(
  sections: NavSection[],
  permissions: 'ALL' | string[] | null,
): NavSection[] {
  if (permissions === null) return sections;
  return sections
    .map((s) => ({
      ...s,
      items: s.items.filter((it) => !it.module || hasGrant(permissions, it.module, 'view')),
    }))
    .filter((s) => s.items.length > 0);
}
