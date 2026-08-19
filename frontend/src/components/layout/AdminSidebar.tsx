// frontend/src/components/layout/AdminSidebar.tsx
'use client';

import {
  Activity,
  ArrowLeft,
  CreditCard,
  LayoutDashboard,
  LayoutTemplate,
  Receipt,
  School,
  Settings,
  Tag,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Sidebar } from './sidebar/Sidebar';
import type { NavSection } from './sidebar/types';

// Spec: .planning/banani/epic-0-shell.md — SaaS admin shell sidebar.
export const ADMIN_SECTIONS: NavSection[] = [
  {
    label: 'Vue globale',
    items: [
      { label: 'Tableau de bord', href: '/admin', icon: LayoutDashboard },
      { label: 'Statistiques', href: '/admin/statistics', icon: Activity },
    ],
  },
  {
    label: 'Clients',
    items: [
      { label: 'Écoles', href: '/admin/schools', icon: School },
      { label: 'Utilisateurs', href: '/admin/users', icon: Users },
    ],
  },
  {
    label: 'Facturation',
    items: [
      { label: 'Abonnements', href: '/admin/billing/subscriptions', icon: CreditCard },
      { label: 'Transactions', href: '/admin/billing/transactions', icon: Receipt },
      { label: 'Coupons', href: '/admin/billing/coupons', icon: Tag },
    ],
  },
  {
    label: 'Système',
    items: [
      {
        label: 'Modèles de bulletin',
        href: '/admin/system/bulletin-templates',
        icon: LayoutTemplate,
      },
      { label: 'Paramètres système', href: '/admin/system/settings', icon: Settings },
    ],
  },
];

interface AdminSidebarProps {
  onNavigate?: (() => void) | undefined;
  collapsed?: boolean;
  onToggleCollapse?: (() => void) | undefined;
}

export function AdminSidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: AdminSidebarProps) {
  return (
    <Sidebar
      sections={ADMIN_SECTIONS}
      variant="dark"
      brand={
        <div className="flex flex-col gap-0.5">
          <Image
            src="/logos/schoolgesti-lockup-blanc.svg"
            alt="Schoolgesti"
            width={150}
            height={44}
            className="h-7 w-auto"
            priority
          />
          <div className="w-fit rounded-full bg-primary/22 px-1.5 py-px text-[9px] font-bold tracking-wide text-primary uppercase">
            Administration
          </div>
        </div>
      }
      brandCollapsed={
        <Image
          src="/logos/schoolgesti-monogramme-blanc.svg"
          alt="Schoolgesti"
          width={34}
          height={34}
        />
      }
      roleLabel="Propriétaire SaaS"
      // /admin has no page.tsx yet (hard 404); /settings NO_SCHOOL-redirects
      // to / gracefully for an admin with no school membership — the lesser
      // of two broken destinations until a real admin profile page exists.
      profileHref="/settings"
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      footer={
        <Link
          href="/"
          className="mb-2 flex min-h-11 items-center gap-2 rounded-md px-2.5 text-2xs text-white/38"
        >
          <ArrowLeft size={12} className="shrink-0" />
          Retour à l&apos;interface école
        </Link>
      }
      onNavigate={onNavigate}
    />
  );
}
