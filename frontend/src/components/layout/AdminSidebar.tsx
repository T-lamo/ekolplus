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
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';
import { Sidebar } from './sidebar/Sidebar';
import type { NavSection } from './sidebar/types';

// Spec: .planning/banani/epic-0-shell.md — SaaS admin shell sidebar.
// ADMIN_SECTIONS used to be a static module-level array; translated
// labels need next-intl's useTranslations, a hook, so this is now a hook
// too — called by this file's own AdminSidebar AND by AdminTopbar.tsx
// (breadcrumbs + command palette both need the same translated sections).
export function useAdminSections(): NavSection[] {
  const t = useTranslations('AdminSidebar.sections');
  return useMemo<NavSection[]>(
    () => [
      {
        label: t('overview.label'),
        items: [
          { label: t('overview.dashboard'), href: '/admin', icon: LayoutDashboard },
          { label: t('overview.statistics'), href: '/admin/statistics', icon: Activity },
        ],
      },
      {
        label: t('customers.label'),
        items: [
          { label: t('customers.schools'), href: '/admin/schools', icon: School },
          { label: t('customers.users'), href: '/admin/users', icon: Users },
        ],
      },
      {
        label: t('billing.label'),
        items: [
          {
            label: t('billing.subscriptions'),
            href: '/admin/billing/subscriptions',
            icon: CreditCard,
          },
          { label: t('billing.transactions'), href: '/admin/billing/transactions', icon: Receipt },
          { label: t('billing.coupons'), href: '/admin/billing/coupons', icon: Tag },
        ],
      },
      {
        label: t('system.label'),
        items: [
          {
            label: t('system.reportCardTemplates'),
            href: '/admin/system/bulletin-templates',
            icon: LayoutTemplate,
          },
          { label: t('system.systemSettings'), href: '/admin/system/settings', icon: Settings },
        ],
      },
    ],
    [t],
  );
}

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
  const t = useTranslations('AdminSidebar');
  const sections = useAdminSections();
  return (
    <Sidebar
      sections={sections}
      variant="dark"
      brand={
        <div className="flex flex-col gap-0.5">
          <Image
            src="/logos/schoolgesti-lockup-blanc.svg"
            alt="Schoolgesti"
            width={164}
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
      roleLabel={t('roleLabel')}
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
          {t('footerBackToSchool')}
        </Link>
      }
      onNavigate={onNavigate}
    />
  );
}
