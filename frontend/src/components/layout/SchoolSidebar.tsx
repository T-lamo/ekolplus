// frontend/src/components/layout/SchoolSidebar.tsx
'use client';

import {
  DoorOpen,
  BookOpen,
  CalendarCheck,
  CreditCard,
  FileText,
  GraduationCap,
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
import { Sidebar } from './sidebar/Sidebar';
import type { NavSection } from './sidebar/types';

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
      { label: 'Abonnement', href: '/settings?tab=subscription', icon: CreditCard },
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
  return (
    <Sidebar
      sections={SCHOOL_SECTIONS}
      variant="light"
      brandIcon={<GraduationCap size={15} className="text-white" />}
      brandText={<span className="text-[15px] font-bold text-foreground">Schoolgesti</span>}
      roleLabel="Administratrice"
      profileHref="/settings"
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      onNavigate={onNavigate}
    />
  );
}
