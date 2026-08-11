'use client';

import {
  ArrowLeft,
  Activity,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  LayoutTemplate,
  Receipt,
  School,
  Settings,
  Tag,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

// Spec: .planning/banani/epic-0-shell.md — SaaS admin shell sidebar.
const SECTIONS: NavSection[] = [
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
      { label: 'Créer une école', href: '/admin/schools/new', icon: UserPlus },
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

export function AdminSidebar({ onNavigate = () => {} }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col bg-sidebar-dark text-sidebar-dark-foreground">
      <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-4 py-4">
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-primary">
          <GraduationCap size={15} className="text-white" />
        </div>
        <div className="flex flex-col gap-px">
          <div className="text-[13px] font-extrabold text-white">EkolSuite</div>
          <div className="w-fit rounded-full bg-primary/22 px-1.5 py-px text-[9px] font-bold tracking-wide text-primary uppercase">
            Administration
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto">
        {SECTIONS.map((section) => (
          <div key={section.label} className="px-2 pt-3 pb-0.5">
            <div className="mb-0.5 px-2 text-[9px] font-bold tracking-wide text-white/28 uppercase">
              {section.label}
            </div>
            {section.items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`mb-px flex min-h-11 items-center gap-2 rounded-md px-2.5 text-xs font-medium ${
                    active ? 'bg-white/10 text-white' : 'text-white/50'
                  }`}
                >
                  <Icon size={14} className="shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.07] p-2">
        <Link
          href="/"
          className="mb-2 flex min-h-11 items-center gap-2 rounded-md px-2.5 text-[11px] text-white/38"
        >
          <ArrowLeft size={12} className="shrink-0" />
          Retour à l&apos;interface école
        </Link>
        <div className="flex items-center gap-2 px-1">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-primary/50 bg-primary text-[11px] font-bold text-white">
            {(user?.email ?? '?').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-white">{user?.email}</div>
            <div className="text-[10px] text-white/40">Propriétaire SaaS</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
