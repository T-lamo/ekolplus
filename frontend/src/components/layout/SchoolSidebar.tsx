// frontend/src/components/layout/SchoolSidebar.tsx
'use client';

import {
  DoorOpen,
  BookOpen,
  CalendarCheck,
  CreditCard,
  FileText,
  LayoutDashboard,
  LayoutTemplate,
  ListOrdered,
  NotebookPen,
  School as SchoolIcon,
  Settings,
  Star,
  UserCheck,
  Users,
  Wallet,
  CalendarDays,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useMemo } from 'react';
import { SidebarPlanCard } from '@/components/school/billing/SidebarPlanCard';
import { useSchoolPlan } from '@/contexts/SchoolPlanContext';
import { Sidebar } from './sidebar/Sidebar';
import {
  filterSectionsByPermissions,
  filterSectionsByRole,
  type NavSection,
} from './sidebar/types';

// Spec: .planning/banani/epic-0-shell.md — school shell sidebar (light).
// SCHOOL_SECTIONS used to be a static module-level array; translated
// labels need next-intl's useTranslations, a hook, so this is now a hook
// too — called by this file's own SchoolSidebar AND by SchoolTopbar.tsx
// (breadcrumbs + command palette both need the same translated sections).
export function useSchoolSections(): NavSection[] {
  const t = useTranslations('SchoolSidebar.sections');
  return useMemo<NavSection[]>(
    () => [
      {
        label: t('main.label'),
        items: [
          {
            label: t('main.dashboard'),
            href: '/dashboard',
            icon: LayoutDashboard,
            module: 'dashboard',
          },
          { label: t('main.students'), href: '/eleves', icon: Users, module: 'eleves' },
          {
            label: t('main.teachers'),
            href: '/enseignants',
            icon: UserCheck,
            module: 'enseignants',
          },
        ],
      },
      {
        label: t('pedagogy.label'),
        items: [
          {
            label: t('pedagogy.timetable'),
            href: '/pedagogie/emploi-du-temps',
            icon: CalendarDays,
            module: 'emploiDuTemps',
          },
          {
            label: t('pedagogy.attendance'),
            href: '/pedagogie/presences',
            icon: CalendarCheck,
            module: 'presences',
          },
          {
            label: t('pedagogy.gradebook'),
            href: '/pedagogie/carnet-de-notes',
            icon: NotebookPen,
            module: 'notes',
          },
          {
            label: t('pedagogy.reportCards'),
            href: '/bulletins',
            icon: FileText,
            module: 'notes',
          },
          {
            label: t('pedagogy.assessments'),
            href: '/pedagogie/appreciations',
            icon: Star,
            module: 'appreciations',
          },
        ],
      },
      {
        label: t('tuition.label'),
        items: [
          {
            label: t('tuition.feesAndTuition'),
            href: '/scolarite',
            icon: Wallet,
            module: 'paiements',
          },
        ],
      },
      {
        label: t('configuration.label'),
        items: [
          {
            label: t('configuration.gradeLevels'),
            href: '/configuration/niveaux',
            icon: ListOrdered,
            module: 'configuration',
          },
          {
            label: t('configuration.classes'),
            href: '/configuration/classes',
            icon: SchoolIcon,
            module: 'configuration',
          },
          {
            label: t('configuration.rooms'),
            href: '/configuration/salles',
            icon: DoorOpen,
            module: 'configuration',
          },
          {
            label: t('configuration.subjects'),
            href: '/configuration/matieres',
            icon: BookOpen,
            module: 'configuration',
          },
          {
            label: t('configuration.reportCardTemplate'),
            href: '/configuration/modele-bulletin',
            icon: LayoutTemplate,
            module: 'configuration',
          },
        ],
      },
      {
        label: t('account.label'),
        items: [
          // OWNER/ADMIN only — amounts and invoices (server: GET /api/school/billing → 403 for MEMBER).
          {
            label: t('account.subscription'),
            href: '/abonnement',
            icon: CreditCard,
            minRole: 'ADMIN',
          },
          { label: t('account.settings'), href: '/settings', icon: Settings },
        ],
      },
    ],
    [t],
  );
}

interface SchoolSidebarProps {
  onNavigate?: (() => void) | undefined;
  collapsed?: boolean;
  onToggleCollapse?: (() => void) | undefined;
}

export function SchoolSidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: SchoolSidebarProps) {
  const t = useTranslations('SchoolSidebar');
  const { role, permissions } = useSchoolPlan();
  const sections = useSchoolSections();
  const filteredSections = useMemo(
    () => filterSectionsByPermissions(filterSectionsByRole(sections, role), permissions),
    [sections, role, permissions],
  );
  return (
    <Sidebar
      sections={filteredSections}
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
      profileHref="/settings"
      currentSpace="school"
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      onNavigate={onNavigate}
      footer={<SidebarPlanCard onNavigate={onNavigate} />}
      footerCollapsed={<SidebarPlanCard collapsed onNavigate={onNavigate} />}
    />
  );
}
