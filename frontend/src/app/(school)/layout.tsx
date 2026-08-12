'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useUser } from '@/contexts/AuthContext';
import { SchoolSidebar } from '@/components/layout/SchoolSidebar';
import { SchoolTopbar } from '@/components/layout/SchoolTopbar';
import { useSidebarCollapse } from '@/components/layout/sidebar/useSidebarCollapse';

// Basic auth gate here (any logged-in user) — school-membership itself is
// checked by individual pages that need it (e.g. /settings via GET
// /api/school's NO_SCHOOL response), not the shell. See
// .planning/banani/school-settings.md.
export default function SchoolLayout({ children }: { children: ReactNode }) {
  const user = useUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useSidebarCollapse();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </main>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="relative z-50 flex h-full w-[195px]">
            <SchoolSidebar onNavigate={() => setDrawerOpen(false)} />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Fermer le menu"
              className="absolute top-3 -right-11 flex h-9 w-9 items-center justify-center rounded-md bg-black/60 text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="hidden lg:flex">
        <SchoolSidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <SchoolTopbar onMenuClick={() => setDrawerOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-7 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
