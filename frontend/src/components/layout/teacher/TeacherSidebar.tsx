'use client';

import {
  CalendarDays,
  LayoutDashboard,
  NotebookPen,
  School as SchoolIcon,
  Settings,
  Star,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useMemo } from 'react';
import { Sidebar } from '../sidebar/Sidebar';
import type { NavSection } from '../sidebar/types';

// Teacher shell sidebar — third instance of the shared Sidebar bricks
// (SchoolSidebar and AdminSidebar are the other two). Same `light` variant
// as the school shell so both surfaces read as one product. Section layout
// (Principal / Pédagogie / Compte) mirrors useSchoolSections's grouping —
// Timetable and Gradebook sit together under Pédagogie there too, and
// Settings gets its own Compte section instead of sitting among the daily
// screens. No role filtering: every teacher sees the same sections. Exposed
// as a hook for the same reason useSchoolSections is one — TeacherTopbar
// needs the same translated sections for breadcrumbs and the command
// palette.
export function useTeacherSections(): NavSection[] {
  const t = useTranslations('TeacherPortal.nav');
  return useMemo<NavSection[]>(
    () => [
      {
        label: t('sectionLabel'),
        items: [
          { label: t('home'), href: '/espace-enseignant', icon: LayoutDashboard },
          { label: t('classes'), href: '/espace-enseignant/classes', icon: SchoolIcon },
          { label: t('students'), href: '/espace-enseignant/eleves', icon: Users },
        ],
      },
      {
        label: t('pedagogySectionLabel'),
        items: [
          {
            label: t('timetable'),
            href: '/espace-enseignant/emploi-du-temps',
            icon: CalendarDays,
          },
          {
            label: t('gradebook'),
            href: '/espace-enseignant/carnet-de-notes',
            icon: NotebookPen,
          },
          {
            label: t('appreciations'),
            href: '/espace-enseignant/appreciations',
            icon: Star,
          },
        ],
      },
      {
        label: t('accountSectionLabel'),
        items: [{ label: t('settings'), href: '/espace-enseignant/parametres', icon: Settings }],
      },
    ],
    [t],
  );
}

interface TeacherSidebarProps {
  onNavigate?: (() => void) | undefined;
  collapsed?: boolean;
  onToggleCollapse?: (() => void) | undefined;
}

export function TeacherSidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: TeacherSidebarProps) {
  const t = useTranslations('TeacherPortal');
  const sections = useTeacherSections();
  return (
    <Sidebar
      sections={sections}
      variant="light"
      brand={
        <Image
          src="/logos/schoolgesti-lockup.svg"
          alt="Schoolgesti"
          width={164}
          height={44}
          className="h-10 w-auto"
          priority
        />
      }
      brandCollapsed={
        <Image src="/logos/schoolgesti-monogramme.svg" alt="Schoolgesti" width={34} height={34} />
      }
      roleLabel={t('roleLabel')}
      profileHref="/espace-enseignant/parametres"
      currentSpace="teacher"
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      onNavigate={onNavigate}
    />
  );
}
