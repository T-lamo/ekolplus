import type { NavItem, NavSection } from './types';

export function isActiveRoute(pathname: string, href: string): boolean {
  const path = href.split('?')[0]!;
  if (
    path === '/dashboard' ||
    path === '/admin' ||
    path === '/espace-enseignant' ||
    path === '/eleve'
  )
    return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * Some hrefs are prefixes of others (e.g. '/admin/schools' vs
 * '/admin/schools/new'), so a naive per-item check would flag both as
 * active simultaneously. Resolve to a single "most specific" match: among
 * matches, drop any with a query string (a query-bearing href like
 * '/settings?tab=annee' would be a shortcut into a page another item
 * already owns — the plain page link wins the highlight; no shipped nav item
 * uses one since Abonnement became /abonnement, the rule is kept for the
 * next one), then take the longest remaining href.
 */
export function findActiveItem(pathname: string, sections: NavSection[]): NavItem | null {
  const candidates = sections
    .flatMap((s) => s.items)
    .filter((item) => isActiveRoute(pathname, item.href));
  const withoutQuery = candidates.filter((item) => !item.href.includes('?'));
  const pool = withoutQuery.length > 0 ? withoutQuery : candidates;
  return [...pool].sort((a, b) => b.href.length - a.href.length)[0] ?? null;
}

export function findActiveSection(pathname: string, sections: NavSection[]): string | null {
  const active = findActiveItem(pathname, sections);
  if (!active) return null;
  return sections.find((s) => s.items.includes(active))?.label ?? null;
}
