'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

interface TeacherClassesResponse {
  homeroomClasses: { id: string; name: string; level: string }[];
  classSubjects: { id: string; className: string; classLevel: string; subjectName: string }[];
}

export default function EspaceEnseignantClassesPage() {
  const t = useTranslations('TeacherClasses');
  const tPortal = useTranslations('TeacherPortal');
  const { data, loading, error } = useApi<TeacherClassesResponse>('/api/teacher/me');

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{tPortal('loadError')}</p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-foreground">{t('myHomerooms')}</h2>
            {data!.homeroomClasses.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noHomerooms')}</p>
            ) : (
              data!.homeroomClasses.map((c) => (
                <Link key={c.id} href={`/espace-enseignant/classes/homeroom/${c.id}`}>
                  <Card className="p-3.5">
                    <p className="text-sm font-semibold text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.level}</p>
                  </Card>
                </Link>
              ))
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-foreground">{t('mySubjects')}</h2>
            {data!.classSubjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noSubjects')}</p>
            ) : (
              data!.classSubjects.map((cs) => (
                <Link key={cs.id} href={`/espace-enseignant/classes/${cs.id}`}>
                  <Card className="p-3.5">
                    <p className="text-sm font-semibold text-foreground">{cs.subjectName}</p>
                    <p className="text-xs text-muted-foreground">
                      {cs.className} · {cs.classLevel}
                    </p>
                  </Card>
                </Link>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
