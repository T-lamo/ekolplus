'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useSchoolSections } from './SchoolSidebar';
import { AcademicYearBadge } from './topbar/AcademicYearBadge';
import { Breadcrumbs } from './topbar/Breadcrumbs';
import { getBreadcrumbTrail } from './topbar/breadcrumb';
import { CommandPalette } from './topbar/CommandPalette';
import { HelpMenu } from './topbar/HelpMenu';
import { NotificationsMenu } from './topbar/NotificationsMenu';

// Sub-pages not covered by useSchoolSections() (detail views etc.) — extend
// as new ones land.
const EXTRA_LABELS: Record<string, string> = {};

export function SchoolTopbar() {
  const t = useTranslations('SchoolTopbar');
  const pathname = usePathname();
  const sections = useSchoolSections();
  const trail = getBreadcrumbTrail(pathname, sections, EXTRA_LABELS);
  // Breadcrumbs only render from `sm` up — below that a phone gets this
  // single-line page title instead (there's no hamburger anymore, the
  // MobileBottomNav owns navigation, so the topbar's only job on a phone is
  // to say where you are).
  const pageTitle = trail[trail.length - 1] ?? t('defaultPageTitle');

  return (
    <header className="flex h-13 shrink-0 items-center justify-between px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate text-[15px] font-bold text-foreground sm:hidden">
          {pageTitle}
        </span>
        <Breadcrumbs root={<span>Schoolgesti</span>} trail={trail} />
      </div>

      <div className="flex items-center gap-2">
        <CommandPalette sections={sections} />
        <AcademicYearBadge />
        <NotificationsMenu />
        <HelpMenu />
      </div>
    </header>
  );
}
