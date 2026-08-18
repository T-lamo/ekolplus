'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/Skeleton';

export default function TeacherPortalLayout({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!user.teacherId) {
      router.replace('/dashboard');
    }
  }, [loading, user, router]);

  if (loading || !user || !user.teacherId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <div className="text-sm font-bold text-foreground">Schoolgesti</div>
        <button
          type="button"
          onClick={() => void logout()}
          className="text-sm font-medium text-muted-foreground"
        >
          Déconnexion
        </button>
      </header>
      <main className="mx-auto max-w-lg px-4 py-5">{children}</main>
    </div>
  );
}
