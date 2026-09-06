'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import * as Tooltip from '@radix-ui/react-tooltip';
import { usePathname } from 'next/navigation';
import { findActiveItem, findActiveSection } from './route-match';
import { SidebarCollapseToggle } from './SidebarCollapseToggle';
import { SidebarSection } from './SidebarSection';
import { SidebarUserProfile } from './SidebarUserProfile';
import type { NavSection } from './types';
import { SIDEBAR_WIDTH } from './width';
import type { SpaceKey } from '../SpaceSwitcher';

const COLLAPSED_WIDTH = 72;

interface SidebarProps {
  sections: NavSection[];
  variant: 'light' | 'dark';
  width?: number;
  /** Full brand lockup shown in the expanded brand row. */
  brand: ReactNode;
  /** Icon-only counterpart of `brand` for the 72px collapsed rail. */
  brandCollapsed: ReactNode;
  roleLabel: string;
  profileHref: string;
  collapsed?: boolean;
  onToggleCollapse?: (() => void) | undefined;
  /** Rendered above the profile block when expanded (e.g. the school plan card). */
  footer?: ReactNode;
  /** Icon-only counterpart of `footer` for the 72px collapsed rail. */
  footerCollapsed?: ReactNode;
  onNavigate?: (() => void) | undefined;
  /** Espace courant du shell : active le bloc « Mes espaces » dans le menu
   * utilisateur. Absent = pas de sélecteur (shell admin plateforme). */
  currentSpace?: SpaceKey | undefined;
}

export function Sidebar({
  sections,
  variant,
  width = SIDEBAR_WIDTH,
  brand,
  brandCollapsed,
  roleLabel,
  profileHref,
  collapsed = false,
  onToggleCollapse,
  footer,
  footerCollapsed,
  onNavigate,
  currentSpace,
}: SidebarProps) {
  const pathname = usePathname();
  // Several sections can be open at once: a section the user opened stays
  // open until the user closes it (no accordion that swaps one for another).
  // Navigation only guarantees that the section of the current page is open.
  const [openSections, setOpenSections] = useState<string[]>(() => {
    const active = findActiveSection(pathname, sections);
    return active ? [active] : [];
  });

  // `sections` is rebuilt (new array/object references) whenever the role or
  // permission-derived filtering recomputes — e.g. the school plan snapshot
  // resolving right after login — which happens independently of navigation.
  // Resyncing on every `sections` change (rather than only on real pathname
  // changes) closed a section the user had just manually opened, the instant
  // one of those unrelated recomputes landed. A ref keeps this effect scoped
  // to actual navigation while still reading the latest sections.
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  useEffect(() => {
    const active = findActiveSection(pathname, sectionsRef.current);
    if (!active) return;
    setOpenSections((prev) => (prev.includes(active) ? prev : [...prev, active]));
  }, [pathname]);

  const activeHref = findActiveItem(pathname, sections)?.href ?? null;
  const bgClass =
    variant === 'light'
      ? 'bg-sidebar-light text-sidebar-light-foreground'
      : 'bg-sidebar-dark text-sidebar-dark-foreground';
  // Light shell: the sidebar merges with the topbar into one flat surface on
  // the page background (no hairlines) and the rounded content panel nests in
  // that L (see (school)/layout.tsx); the profile block at the bottom is a
  // small white card. Dark shell keeps its flush column + hairlines.
  const light = variant === 'light';
  const edgeClass = light ? '' : 'border-r border-white/[0.07]';
  const brandEdgeClass = light ? '' : 'border-b border-white/[0.07]';
  const footerClass = light
    ? 'm-2.5 rounded-2xl border border-border bg-card p-1.5'
    : 'border-t border-white/[0.07] p-2.5';

  return (
    <Tooltip.Provider delayDuration={300}>
      <aside
        style={{ width: collapsed ? COLLAPSED_WIDTH : width }}
        className={`flex h-full shrink-0 flex-col overflow-hidden transition-[width] duration-200 ease-in-out ${edgeClass} ${bgClass}`}
      >
        {/* Same h-13 as the topbar so the brand row and the breadcrumbs share
            one baseline. */}
        <div
          className={`flex h-13 shrink-0 items-center ${brandEdgeClass} ${
            collapsed ? 'justify-center' : 'justify-between gap-2 px-4'
          }`}
        >
          <div className="flex min-w-0 items-center">{collapsed ? brandCollapsed : brand}</div>
          {!collapsed && onToggleCollapse && (
            <SidebarCollapseToggle
              collapsed={false}
              onToggle={onToggleCollapse}
              variant={variant}
            />
          )}
        </div>
        {collapsed && onToggleCollapse && (
          <div className="flex shrink-0 justify-center pt-2 pb-0.5">
            <SidebarCollapseToggle collapsed onToggle={onToggleCollapse} variant={variant} />
          </div>
        )}

        {/* min-h-0 lets the nav shrink and scroll inside the column, so the
            footer (plan card + profile) always stays in view. */}
        <nav className="min-h-0 flex-1 overflow-y-auto">
          {collapsed ? (
            sections.map((section) => (
              <SidebarSection
                key={section.label}
                section={section}
                variant={variant}
                collapsed
                activeHref={activeHref}
                onNavigate={onNavigate}
              />
            ))
          ) : (
            <Accordion.Root type="multiple" value={openSections} onValueChange={setOpenSections}>
              {sections.map((section) => (
                <SidebarSection
                  key={section.label}
                  section={section}
                  variant={variant}
                  collapsed={false}
                  open={openSections.includes(section.label)}
                  activeHref={activeHref}
                  onNavigate={onNavigate}
                />
              ))}
            </Accordion.Root>
          )}
        </nav>

        <div className={`shrink-0 ${footerClass}`}>
          {collapsed ? footerCollapsed : footer}
          <SidebarUserProfile
            variant={variant}
            collapsed={collapsed}
            roleLabel={roleLabel}
            profileHref={profileHref}
            currentSpace={currentSpace}
          />
        </div>
      </aside>
    </Tooltip.Provider>
  );
}
