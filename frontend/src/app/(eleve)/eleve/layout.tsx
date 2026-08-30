'use client';

import { type ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';

// Mobile-first shell for the student-facing portal, deliberately NOT the
// admin (school)/layout.tsx (no SchoolSidebar/SchoolTopbar), matching the
// Espace Enseignant portal's own shell choice. Phase 1 ships this bare;
// the bottom tab bar + Notes/Presences/Bulletins nav is built in later
// phases per docs/superpowers/specs/2026-08-30-espace-eleve-design.md.
// The lightweight header below is the one essential control this bare
// shell can't ship without: a student-only account never renders the
// (school) admin shell (it's bounced out of it), so SidebarUserProfile's
// logout is otherwise unreachable, on a shared school device there would
// be no way to end the session (same reasoning as the teacher portal's
// own header, see (teacher)/espace-enseignant/layout.tsx).
export default function EleveLayout({ children }: { children: ReactNode }) {
  const user = useUser();
  const { logout } = useAuth();
  const router = useRouter();
  const t = useTranslations('ElevePortal');

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-6">
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
    </div>
  );
}
