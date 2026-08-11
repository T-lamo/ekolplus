'use client';

import { Bell, Menu, Search, Shield } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

// Extended as new /admin pages land — see AdminSidebar's SECTIONS for the
// canonical route list.
const BREADCRUMB_LABELS: Record<string, string> = {
  '/admin': 'Tableau de bord',
  '/admin/statistics': 'Statistiques',
  '/admin/schools': 'Écoles',
  '/admin/schools/new': 'Créer une école',
  '/admin/users': 'Utilisateurs',
};

export function AdminTopbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const label = BREADCRUMB_LABELS[pathname] ?? '';

  return (
    <header className="flex h-13 shrink-0 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Ouvrir le menu"
          className="flex h-11 w-11 items-center justify-center text-muted-foreground lg:hidden"
        >
          <Menu size={20} />
        </button>
        <div className="hidden items-center gap-1.5 text-[13px] text-muted-foreground sm:flex">
          <Shield size={13} className="text-primary" />
          <span>Administration</span>
          {label && (
            <>
              <span className="text-border">›</span>
              <span className="font-medium text-foreground">{label}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="hidden min-w-[180px] items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground sm:flex"
        >
          <Search size={13} />
          <span>Rechercher une école...</span>
        </button>
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex h-11 w-11 items-center justify-center text-muted-foreground"
        >
          <Bell size={16} />
          <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full border-2 border-card bg-destructive-foreground" />
        </button>
        <button type="button" className="flex min-h-11 items-center gap-1.5 rounded-md px-2 py-1">
          <div className="flex h-[26px] w-[26px] items-center justify-center overflow-hidden rounded-full bg-primary text-[11px] font-bold text-white">
            {(user?.email ?? '?').slice(0, 1).toUpperCase()}
          </div>
        </button>
      </div>
    </header>
  );
}
