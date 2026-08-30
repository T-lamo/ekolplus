'use client';

import { type ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { TeacherBottomNav } from '@/components/layout/teacher/TeacherBottomNav';

// Mobile-first shell for the teacher-facing portal — deliberately NOT the
// admin (school)/layout.tsx (no SchoolSidebar/SchoolTopbar). Phase 1 ships
// this bare; the bottom tab bar + Mes classes/Notes/Appréciations nav is
// built in later phases per docs/superpowers/specs/2026-08-30-espace-enseignant-design.md.
// The lightweight header below is the one essential control this bare
// shell can't ship without: a teacher-only account never renders the
// (school) admin shell (it's bounced out of it), so SidebarUserProfile's
// logout is otherwise unreachable — on a shared school device there would
// be no way to end the session.
export default function TeacherLayout({ children }: { children: ReactNode }) {
  const user = useUser();
  const { logout } = useAuth();
  const router = useRouter();
  const t = useTranslations('TeacherPortal');

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-6 pb-24">
      <header className="mb-4 flex items-center justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={async () => {
            await logout();
            router.replace('/login');
          }}
        >
          <LogOut size={14} />
          {t('logout')}
        </Button>
      </header>
      {children}
      <TeacherBottomNav />
    </div>
  );
}
