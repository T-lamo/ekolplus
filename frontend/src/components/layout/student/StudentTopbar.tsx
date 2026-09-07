'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { Breadcrumbs } from '../topbar/Breadcrumbs';
import { getBreadcrumbTrail } from '../topbar/breadcrumb';
import { CommandPalette } from '../topbar/CommandPalette';
import { HelpMenu } from '../topbar/HelpMenu';
import { NotificationsMenu } from '../topbar/NotificationsMenu';
import { OfflineIndicator } from '../topbar/OfflineIndicator';
import { StudentAcademicYearBadge } from './StudentAcademicYearBadge';
import { useStudentSections } from './StudentSidebar';

// Student twin of TeacherTopbar — same widgets, student nav sections, and
// the student-safe year badge (see StudentAcademicYearBadge).
// NotificationsMenu talks to /api/notifications, which is user-scoped, not
// school-scoped, so it works for student accounts as-is.
const EXTRA_LABELS: Record<string, string> = {};

export function StudentTopbar() {
  const t = useTranslations('ElevePortal.topbar');
  const pathname = usePathname();
  const sections = useStudentSections();
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
        <StudentAcademicYearBadge />
        <NotificationsMenu />
        <HelpMenu />
      </div>
    </header>
  );
}
