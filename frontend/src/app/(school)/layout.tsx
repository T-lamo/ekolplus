'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useUser } from '@/contexts/AuthContext';
import { SchoolSidebar } from '@/components/layout/SchoolSidebar';
import { SchoolTopbar } from '@/components/layout/SchoolTopbar';
import { SIDEBAR_WIDTH_CLASS } from '@/components/layout/sidebar/width';
import { useSidebarCollapse } from '@/components/layout/sidebar/useSidebarCollapse';
import { Skeleton } from '@/components/ui/Skeleton';

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
        <Skeleton className="h-10 w-10 rounded-full" />
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
          <div className={`relative z-50 flex h-full p-3 ${SIDEBAR_WIDTH_CLASS}`}>
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

      {/* "Floating panel" shell: sidebar and content are two rounded white
          cards on the grey page background, 16px gutters all around; the bare
          topbar sits on the grey, its row aligned with the sidebar's brand row
          (both h-13, both start 16px from the top on lg). */}
      <div className="hidden lg:flex lg:py-4 lg:pl-4">
        <SchoolSidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col lg:pt-4">
        <SchoolTopbar onMenuClick={() => setDrawerOpen(true)} />
        {/* The inner div is the scroller — the panel itself never scrolls, so
            its rounded corners always clip the content. Pages built on
            LIST_PAGE (h-full) size themselves against that inner div. */}
        <main className="mx-3 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border bg-card sm:mx-4 sm:mb-4">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-7 lg:py-7">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
