'use client';

import {
  BarChart2,
  CalendarCheck,
  FileText,
  LayoutDashboard,
  Settings,
  Star,
  UserRound,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useMemo } from 'react';
import { Sidebar } from '../sidebar/Sidebar';
import type { NavSection } from '../sidebar/types';

// Student shell sidebar — fourth instance of the shared Sidebar bricks
// (SchoolSidebar, AdminSidebar and TeacherSidebar are the other three).
// Same `light` variant as the school and teacher shells so every surface
// reads as one product. Sections: Principal (Accueil, Mon profil) /
// Scolarité (added by Plan 2: Mes notes, Mes présences, Bulletins,
// Appréciations; Plan 3: Emploi du temps) / Compte (Paramètres). No role
// filtering: every student sees the same entries. Exposed as a hook for
// the same reason useTeacherSections is one — StudentTopbar needs the same
// translated sections for breadcrumbs and the command palette.
export function useStudentSections(): NavSection[] {
  const t = useTranslations('ElevePortal.nav');
  return useMemo<NavSection[]>(
    () => [
      {
        label: t('sectionLabel'),
        items: [
          { label: t('home'), href: '/eleve', icon: LayoutDashboard },
          { label: t('profile'), href: '/eleve/profil', icon: UserRound },
        ],
      },
      {
        label: t('schoolSectionLabel'),
        items: [
          { label: t('grades'), href: '/eleve/notes', icon: BarChart2 },
          { label: t('attendance'), href: '/eleve/presences', icon: CalendarCheck },
          { label: t('bulletins'), href: '/eleve/bulletins', icon: FileText },
          { label: t('appreciations'), href: '/eleve/appreciations', icon: Star },
        ],
      },
      {
        label: t('accountSectionLabel'),
        items: [{ label: t('settings'), href: '/eleve/parametres', icon: Settings }],
      },
    ],
    [t],
  );
}

interface StudentSidebarProps {
  onNavigate?: (() => void) | undefined;
  collapsed?: boolean;
  onToggleCollapse?: (() => void) | undefined;
}

export function StudentSidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: StudentSidebarProps) {
  const t = useTranslations('ElevePortal');
  const sections = useStudentSections();
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
      profileHref="/eleve/parametres"
      currentSpace="student"
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      onNavigate={onNavigate}
    />
  );
}
