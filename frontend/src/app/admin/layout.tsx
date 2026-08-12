'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useAdminUser } from '@/contexts/AuthContext';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { AdminTopbar } from '@/components/layout/AdminTopbar';
import { useSidebarCollapse } from '@/components/layout/sidebar/useSidebarCollapse';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const admin = useAdminUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useSidebarCollapse();

  if (!admin) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </main>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Off-canvas drawer below lg — Banani only shipped the 1280px desktop
          mockup, mobile/tablet behavior designed per epic-0-shell.md. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="relative z-50 flex h-full w-[220px]">
            <AdminSidebar onNavigate={() => setDrawerOpen(false)} />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Fermer le menu"
              className="absolute top-3 -right-11 flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="hidden lg:flex">
        <AdminSidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar onMenuClick={() => setDrawerOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-7 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
