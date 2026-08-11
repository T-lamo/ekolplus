'use client';

import {
  BookOpen,
  CalendarCheck,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LayoutTemplate,
  Link as LinkIcon,
  NotebookPen,
  Percent,
  School as SchoolIcon,
  Settings,
  Star,
  UserCheck,
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

// Spec: .planning/banani/epic-0-shell.md — school shell sidebar (light).
const SECTIONS: NavSection[] = [
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
      { label: 'Bulletins', href: '/bulletins', icon: FileText },
      { label: 'Appréciations', href: '/pedagogie/appreciations', icon: Star },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { label: 'Classes', href: '/configuration/classes', icon: SchoolIcon },
      { label: 'Matières', href: '/configuration/matieres', icon: BookOpen },
      { label: 'Affectations', href: '/configuration/affectations', icon: LinkIcon },
      { label: 'Coefficients', href: '/configuration/coefficients', icon: Percent },
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

export function SchoolSidebar({ onNavigate = () => {} }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <aside className="flex h-full w-[195px] shrink-0 flex-col bg-sidebar-light text-sidebar-light-foreground">
      <div className="flex items-center gap-2 border-b border-border px-4 pt-[18px] pb-3.5">
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-primary">
          <GraduationCap size={15} className="text-white" />
        </div>
        <span className="text-[15px] font-bold text-foreground">EkolSuite</span>
      </div>

      <nav className="flex-1 overflow-y-auto">
        {SECTIONS.map((section) => (
          <div key={section.label} className="px-2.5 pt-3.5 pb-0.5">
            <div className="mb-1 px-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              {section.label}
            </div>
            {section.items.map((item) => {
              const active = pathname === item.href.split('?')[0];
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`mb-px flex min-h-11 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium ${
                    active ? 'bg-secondary text-primary' : 'text-muted-foreground'
                  }`}
                >
                  <Icon size={15} className="shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-2.5">
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
          <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-foreground">{user?.email}</div>
            <div className="text-[11px] text-muted-foreground">Administratrice</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
