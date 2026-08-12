'use client';

import { type ReactNode, useEffect, useState } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import * as Tooltip from '@radix-ui/react-tooltip';
import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { findActiveItem, findActiveSection } from './route-match';
import { SidebarCollapseToggle } from './SidebarCollapseToggle';
import { SidebarSection } from './SidebarSection';
import { SidebarUserProfile } from './SidebarUserProfile';
import type { NavSection } from './types';

const COLLAPSED_WIDTH = 72;

interface SidebarProps {
  sections: NavSection[];
  variant: 'light' | 'dark';
  width: number;
  brandIcon: ReactNode;
  brandText: ReactNode;
  roleLabel: string;
  profileHref: string;
  collapsed?: boolean;
  onToggleCollapse?: (() => void) | undefined;
  footer?: ReactNode;
  onNavigate?: (() => void) | undefined;
}

export function Sidebar({
  sections,
  variant,
  width,
  brandIcon,
  brandText,
  roleLabel,
  profileHref,
  collapsed = false,
  onToggleCollapse,
  footer,
  onNavigate,
}: SidebarProps) {
  const pathname = usePathname();
  const [openSection, setOpenSection] = useState<string | null>(() =>
    findActiveSection(pathname, sections),
  );

  useEffect(() => {
    setOpenSection(findActiveSection(pathname, sections));
  }, [pathname, sections]);

  const activeHref = findActiveItem(pathname, sections)?.href ?? null;
  const bgClass =
    variant === 'light'
      ? 'bg-sidebar-light text-sidebar-light-foreground'
      : 'bg-sidebar-dark text-sidebar-dark-foreground';
  const borderClass = variant === 'light' ? 'border-border' : 'border-white/[0.07]';

  return (
    <Tooltip.Provider delayDuration={300}>
      <motion.aside
        animate={{ width: collapsed ? COLLAPSED_WIDTH : width }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className={`flex h-full shrink-0 flex-col overflow-hidden border-r ${borderClass} ${bgClass}`}
      >
        <div
          className={`flex shrink-0 border-b ${borderClass} ${
            collapsed
              ? 'flex-col items-center gap-2 py-3'
              : 'items-center justify-between gap-2 px-4 pt-[18px] pb-3.5'
          }`}
        >
          <div
            className={collapsed ? 'flex flex-col items-center gap-2' : 'flex items-center gap-2'}
          >
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-primary">
              {brandIcon}
            </div>
            {!collapsed && brandText}
          </div>
          {onToggleCollapse && (
            <SidebarCollapseToggle
              collapsed={collapsed}
              onToggle={onToggleCollapse}
              variant={variant}
            />
          )}
        </div>

        <nav className="flex-1 overflow-y-auto">
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
            <Accordion.Root
              type="single"
              collapsible
              value={openSection ?? ''}
              onValueChange={(v) => setOpenSection(v === '' ? null : v)}
            >
              {sections.map((section) => (
                <SidebarSection
                  key={section.label}
                  section={section}
                  variant={variant}
                  collapsed={false}
                  open={openSection === section.label}
                  activeHref={activeHref}
                  onNavigate={onNavigate}
                />
              ))}
            </Accordion.Root>
          )}
        </nav>

        <div className={`border-t ${borderClass} p-2.5`}>
          {!collapsed && footer}
          <SidebarUserProfile
            variant={variant}
            collapsed={collapsed}
            roleLabel={roleLabel}
            profileHref={profileHref}
          />
        </div>
      </motion.aside>
    </Tooltip.Provider>
  );
}
