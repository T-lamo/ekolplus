// frontend/src/components/layout/AdminTopbar.tsx
'use client';

import { Menu, Shield } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { ADMIN_SECTIONS } from './AdminSidebar';
import { Breadcrumbs } from './topbar/Breadcrumbs';
import { getBreadcrumbTrail } from './topbar/breadcrumb';
import { CommandPalette } from './topbar/CommandPalette';
import { HelpMenu } from './topbar/HelpMenu';
import { NotificationsMenu } from './topbar/NotificationsMenu';

// Sub-pages not covered by ADMIN_SECTIONS (detail views etc.) — extend as
// new ones land.
const EXTRA_LABELS: Record<string, string> = {};

export function AdminTopbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const trail = getBreadcrumbTrail(pathname, ADMIN_SECTIONS, EXTRA_LABELS);

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
        <Breadcrumbs
          root={
            <span className="flex items-center gap-1.5">
              <Shield size={13} className="text-primary" />
              Administration
            </span>
          }
          trail={trail}
        />
      </div>

      <div className="flex items-center gap-2">
        <CommandPalette sections={ADMIN_SECTIONS} />
        <NotificationsMenu />
        <HelpMenu />
      </div>
    </header>
  );
}
