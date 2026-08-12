'use client';

import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { SCHOOL_SECTIONS } from './SchoolSidebar';
import { AcademicYearSelector } from './topbar/AcademicYearSelector';
import { Breadcrumbs } from './topbar/Breadcrumbs';
import { getBreadcrumbTrail } from './topbar/breadcrumb';
import { CommandPalette } from './topbar/CommandPalette';
import { HelpMenu } from './topbar/HelpMenu';
import { NotificationsMenu } from './topbar/NotificationsMenu';

// Sub-pages not covered by SCHOOL_SECTIONS (detail views etc.) — extend as
// new ones land.
const EXTRA_LABELS: Record<string, string> = {};

export function SchoolTopbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const trail = getBreadcrumbTrail(pathname, SCHOOL_SECTIONS, EXTRA_LABELS);

  return (
    <header className="flex h-13 shrink-0 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Ouvrir le menu"
          className="flex h-11 w-11 items-center justify-center text-muted-foreground lg:hidden"
        >
          <Menu size={20} />
        </button>
        <Breadcrumbs root={<span>EkolSuite</span>} trail={trail} />
      </div>

      <div className="flex items-center gap-1.5">
        <CommandPalette sections={SCHOOL_SECTIONS} />
        <AcademicYearSelector />
        <NotificationsMenu />
        <HelpMenu />
      </div>
    </header>
  );
}
