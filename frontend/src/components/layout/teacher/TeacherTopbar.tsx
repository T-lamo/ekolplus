'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { Breadcrumbs } from '../topbar/Breadcrumbs';
import { getBreadcrumbTrail } from '../topbar/breadcrumb';
import { CommandPalette } from '../topbar/CommandPalette';
import { HelpMenu } from '../topbar/HelpMenu';
import { NotificationsMenu } from '../topbar/NotificationsMenu';
import { OfflineIndicator } from '../topbar/OfflineIndicator';
import { TeacherAcademicYearBadge } from './TeacherAcademicYearBadge';
import { useTeacherSections } from './TeacherSidebar';

// Teacher twin of SchoolTopbar — same widgets, teacher nav sections, and the
// teacher-safe year badge (see TeacherAcademicYearBadge). NotificationsMenu
// talks to /api/notifications, which is user-scoped, not school-scoped, so
// it works for teacher accounts as-is.
const EXTRA_LABELS: Record<string, string> = {};

export function TeacherTopbar() {
  const t = useTranslations('TeacherPortal.topbar');
  const pathname = usePathname();
  const sections = useTeacherSections();
  const trail = getBreadcrumbTrail(pathname, sections, EXTRA_LABELS);
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
        <OfflineIndicator />
        <CommandPalette sections={sections} />
        <TeacherAcademicYearBadge />
        <NotificationsMenu />
        <HelpMenu />
      </div>
    </header>
  );
}
