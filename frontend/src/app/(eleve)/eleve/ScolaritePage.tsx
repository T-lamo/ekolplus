'use client';

// Shared frame of the Espace Élève's Scolarité screens (Mes notes, Mes
// présences, Appréciations, Bulletins): page header + the /api/student/me
// read the fiche tabs need (the student's id and name), handed to the
// screen through a render prop. /api/student/me is served from useApi's
// in-memory cache after the Accueil, so this costs no extra round trip in
// the common path.
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useApi } from '@/lib/useApi';
import { Skeleton } from '@/components/ui/Skeleton';
import type { StudentMeResponse } from './types';

export function ScolaritePage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: (me: StudentMeResponse) => ReactNode;
}) {
  const t = useTranslations('ElevePortal');
  const { data, loading, error } = useApi<StudentMeResponse>('/api/student/me');

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{title}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {loading && !data ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : error || !data ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {t('loadError')}
        </p>
      ) : (
        children(data)
      )}
    </div>
  );
}
