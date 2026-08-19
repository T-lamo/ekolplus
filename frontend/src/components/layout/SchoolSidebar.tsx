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
import Image from 'next/image';
import { useMemo } from 'react';
import { SidebarPlanCard } from '@/components/school/billing/SidebarPlanCard';
import { useSchoolPlan } from '@/contexts/SchoolPlanContext';
import { Sidebar } from './sidebar/Sidebar';
import { filterSectionsByRole, type NavSection } from './sidebar/types';

// Spec: .planning/banani/epic-0-shell.md — school shell sidebar (light).
export const SCHOOL_SECTIONS: NavSection[] = [
  {
    label: 'Principal',
    items: [
      { label: 'Tableau de bord', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Élèves', href: '/eleves', icon: Users },
      { label: 'Enseignants', href: '/enseignants', icon: UserCheck },
    ],
  },
  {
    label: 'Pédagogie',
    items: [
      { label: 'Carnet de notes', href: '/pedagogie/carnet-de-notes', icon: NotebookPen },
      { label: 'Présences', href: '/pedagogie/presences', icon: CalendarCheck },
      { label: 'Emploi du temps', href: '/pedagogie/emploi-du-temps', icon: CalendarDays },
      { label: 'Bulletins', href: '/bulletins', icon: FileText },
      { label: 'Appréciations', href: '/pedagogie/appreciations', icon: Star },
    ],
  },
  {
    label: 'Scolarité',
    items: [{ label: 'Frais & Scolarité', href: '/scolarite', icon: Wallet }],
  },
  {
    label: 'Configuration',
    items: [
      { label: 'Classes', href: '/configuration/classes', icon: SchoolIcon },
      { label: 'Niveaux', href: '/configuration/niveaux', icon: ListOrdered },
      { label: 'Salles', href: '/configuration/salles', icon: DoorOpen },
      { label: 'Matières', href: '/configuration/matieres', icon: BookOpen },
      { label: 'Modèle de bulletin', href: '/configuration/modele-bulletin', icon: LayoutTemplate },
    ],
  },
  {
    label: 'Compte',
    items: [
      // OWNER/ADMIN only — amounts and invoices (server: GET /api/school/billing → 403 for MEMBER).
      { label: 'Abonnement', href: '/abonnement', icon: CreditCard, minRole: 'ADMIN' },
      { label: 'Paramètres', href: '/settings', icon: Settings },
    ],
  },
];

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
  const { role } = useSchoolPlan();
  const sections = useMemo(() => filterSectionsByRole(SCHOOL_SECTIONS, role), [role]);
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
      roleLabel="Administratrice"
      profileHref="/settings"
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      onNavigate={onNavigate}
      footer={<SidebarPlanCard onNavigate={onNavigate} />}
      footerCollapsed={<SidebarPlanCard collapsed onNavigate={onNavigate} />}
    />
  );
}
