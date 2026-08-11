'use client';

import { Bell, CircleHelp, Menu, Search } from 'lucide-react';
import { usePathname } from 'next/navigation';

// Extended as new school-shell pages land.
const BREADCRUMB_LABELS: Record<string, string> = {
  '/dashboard': 'Tableau de bord',
  '/eleves': 'Élèves',
  '/enseignants': 'Enseignants',
  '/settings': 'Paramètres',
};

export function SchoolTopbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
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
          <span>EkolSuite</span>
          {label && (
            <>
              <span className="text-border">›</span>
              <span className="font-medium text-foreground">{label}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="hidden min-w-[180px] items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground sm:flex"
        >
          <Search size={13} />
          <span>Recherche globale...</span>
        </button>
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex h-11 w-11 items-center justify-center text-muted-foreground"
        >
          <Bell size={17} />
          <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full border-2 border-card bg-destructive-foreground" />
        </button>
        <button
          type="button"
          aria-label="Aide"
          className="hidden h-11 w-11 items-center justify-center text-muted-foreground sm:flex"
        >
          <CircleHelp size={17} />
        </button>
      </div>
    </header>
  );
}
