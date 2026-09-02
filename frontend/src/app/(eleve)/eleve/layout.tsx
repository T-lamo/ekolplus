'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useUser } from '@/contexts/AuthContext';
import { StudentMobileBottomNav } from '@/components/layout/student/StudentMobileBottomNav';
import { StudentSidebar } from '@/components/layout/student/StudentSidebar';
import { StudentTopbar } from '@/components/layout/student/StudentTopbar';
import { SIDEBAR_WIDTH_CLASS } from '@/components/layout/sidebar/width';
import { useSidebarCollapse } from '@/components/layout/sidebar/useSidebarCollapse';
import { Skeleton } from '@/components/ui/Skeleton';

// Student shell — same floating-panel structure as (school)/layout.tsx and
// (teacher)/espace-enseignant/layout.tsx (one flat sidebar+topbar surface,
// grey rounded content panel, bottom nav below lg) so the portal reads as
// the same product as the admin app. No SchoolPlanProvider: its
// /api/school/billing/plan read is deny-by-default for a student account.
// No reverse redirect either: the login and /espaces already route a
// student-only account here, and a multi-space account may open this
// portal deliberately. Logout lives in the sidebar's SidebarUserProfile,
// same as the other shells. See
// docs/superpowers/specs/2026-09-02-espace-eleve-phase2-design.md.
export default function EleveLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('Shell');
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
    <div className="flex h-screen overflow-hidden bg-sidebar-light">
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className={`relative z-50 flex h-full ${SIDEBAR_WIDTH_CLASS}`}>
            <StudentSidebar onNavigate={() => setDrawerOpen(false)} />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label={t('closeMenu')}
              className="absolute top-3 -right-11 flex h-9 w-9 items-center justify-center rounded-md bg-black/60 text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="hidden lg:flex">
        <StudentSidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <StudentTopbar />
        <main className="mx-3 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-background shadow-[0_1px_2px_rgba(26,26,46,0.04),0_8px_28px_-10px_rgba(26,26,46,0.14)] sm:mx-4 sm:mb-4 lg:ml-3">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-28 sm:px-6 sm:pt-6 sm:pb-28 lg:px-7 lg:py-7">
            {children}
          </div>
        </main>
        <StudentMobileBottomNav onMoreClick={() => setDrawerOpen(true)} />
      </div>
    </div>
  );
}
