'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useUser } from '@/contexts/AuthContext';
import { SchoolPlanProvider } from '@/contexts/SchoolPlanContext';
import { MobileBottomNav } from '@/components/layout/mobile/MobileBottomNav';
import { SchoolSidebar } from '@/components/layout/SchoolSidebar';
import { SchoolTopbar } from '@/components/layout/SchoolTopbar';
import { SIDEBAR_WIDTH_CLASS } from '@/components/layout/sidebar/width';
import { useSidebarCollapse } from '@/components/layout/sidebar/useSidebarCollapse';
import { Skeleton } from '@/components/ui/Skeleton';

// Basic auth gate here (any logged-in user) — school-membership itself is
// checked by individual pages that need it (e.g. /settings via GET
// /api/school's NO_SCHOOL response), not the shell.
//
// A purely teacher-linked account (isTeacherOnly) is bounced to
// /espace-enseignant, and a purely student-linked account (isStudentOnly)
// is bounced to /eleve — belt-and-suspenders on top of the login-time
// redirect (login/page.tsx), so a stale bookmark/tab can't land on the
// admin shell. An admin who is ALSO teacher-linked or student-linked is
// never redirected here (isTeacherOnly/isStudentOnly are false for them) —
// see resolveMySchool()'s deny-by-default check in lib/server/school.ts,
// which the client mirrors via GET /api/auth/me's isTeacherOnly and
// isStudentOnly fields.
export default function SchoolLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('Shell');
  const user = useUser();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useSidebarCollapse();

  useEffect(() => {
    if (user?.isTeacherOnly) {
      router.replace('/espace-enseignant');
    } else if (user?.isStudentOnly) {
      router.replace('/eleve');
    }
  }, [user, router]);

  if (!user || user.isTeacherOnly || user.isStudentOnly) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  return (
    <SchoolPlanProvider>
      <div className="flex h-screen overflow-hidden bg-sidebar-light">
        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setDrawerOpen(false)}
              aria-hidden
            />
            <div className={`relative z-50 flex h-full ${SIDEBAR_WIDTH_CLASS}`}>
              <SchoolSidebar onNavigate={() => setDrawerOpen(false)} />
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

        {/* "Floating panel" shell, inverted: the sidebar and the topbar are one
          flat white surface (same bg, no hairlines — their h-13
          brand/breadcrumb rows share a baseline), and the content is a grey
          24px-rounded panel with a soft shadow nested in that L. */}
        <div className="hidden lg:flex">
          <SchoolSidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <SchoolTopbar />
          {/* The inner div is the scroller — the panel itself never scrolls, so
            its rounded corners always clip the content. Pages built on
            LIST_PAGE (h-full) size themselves against that inner div. Below
            `lg` the extra bottom padding clears the fixed MobileBottomNav
            (h-16 + safe-area) so the last row of content is never hidden
            under it. */}
          <main className="mx-3 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-background shadow-[0_1px_2px_rgba(26,26,46,0.04),0_8px_28px_-10px_rgba(26,26,46,0.14)] sm:mx-4 sm:mb-4 lg:ml-3">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-28 sm:px-6 sm:pt-6 sm:pb-28 lg:px-7 lg:py-7">
              {children}
            </div>
          </main>
          <MobileBottomNav onMoreClick={() => setDrawerOpen(true)} />
        </div>
      </div>
    </SchoolPlanProvider>
  );
}
