import type { LucideIcon } from 'lucide-react';

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
