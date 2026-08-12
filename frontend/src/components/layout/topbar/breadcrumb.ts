import { findActiveItem } from '../sidebar/route-match';
import type { NavSection } from '../sidebar/types';

export function getBreadcrumbTrail(
  pathname: string,
  sections: NavSection[],
  extraLabels: Record<string, string> = {},
): string[] {
  const active = findActiveItem(pathname, sections);
  const trail: string[] = [];

  if (active) {
    const section = sections.find((s) => s.items.includes(active));
    if (section) trail.push(section.label);
    trail.push(active.label);
  }

  const extra = extraLabels[pathname];
  if (extra) trail.push(extra);

  return trail;
}
