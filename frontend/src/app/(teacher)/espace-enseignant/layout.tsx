'use client';

import { type ReactNode } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/Skeleton';

// Mobile-first shell for the teacher-facing portal — deliberately NOT the
// admin (school)/layout.tsx (no SchoolSidebar/SchoolTopbar). Phase 1 ships
// this bare; the bottom tab bar + Mes classes/Notes/Appréciations nav is
// built in later phases per docs/superpowers/specs/2026-08-30-espace-enseignant-design.md.
export default function TeacherLayout({ children }: { children: ReactNode }) {
  const user = useUser();
  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }
  return <div className="mx-auto min-h-screen max-w-lg px-4 py-6">{children}</div>;
}
