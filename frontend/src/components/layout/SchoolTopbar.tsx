'use client';

import { usePathname } from 'next/navigation';
import { SCHOOL_SECTIONS } from './SchoolSidebar';
import { AcademicYearBadge } from './topbar/AcademicYearBadge';
import { Breadcrumbs } from './topbar/Breadcrumbs';
import { getBreadcrumbTrail } from './topbar/breadcrumb';
import { CommandPalette } from './topbar/CommandPalette';
import { HelpMenu } from './topbar/HelpMenu';
import { NotificationsMenu } from './topbar/NotificationsMenu';
import { OfflineIndicator } from './topbar/OfflineIndicator';

// Sub-pages not covered by SCHOOL_SECTIONS (detail views etc.) — extend as
// new ones land.
const EXTRA_LABELS: Record<string, string> = {};

export function SchoolTopbar() {
  const pathname = usePathname();
  const trail = getBreadcrumbTrail(pathname, SCHOOL_SECTIONS, EXTRA_LABELS);
  // Breadcrumbs only render from `sm` up — below that a phone gets this
  // single-line page title instead (there's no hamburger anymore, the
  // MobileBottomNav owns navigation, so the topbar's only job on a phone is
  // to say where you are).
  const pageTitle = trail[trail.length - 1] ?? 'Tableau de bord';

  return (
    <header className="flex h-13 shrink-0 items-center justify-between px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate text-[15px] font-bold text-foreground sm:hidden">
          {pageTitle}
        </span>
        <Breadcrumbs root={<span>Schoolgesti</span>} trail={trail} />
      </div>

      <div className="flex items-center gap-2">
        <OfflineIndicator />
        <CommandPalette sections={SCHOOL_SECTIONS} />
        <AcademicYearBadge />
        <NotificationsMenu />
        <HelpMenu />
      </div>
    </header>
  );
}
