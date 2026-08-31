'use client';

import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { format } from 'date-fns';
import { enUS, fr, type Locale } from 'date-fns/locale';
import { useUser } from '@/contexts/AuthContext';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import type { LocaleKey } from '@/lib/locales';

// 'ht' has no distinct date-formatting convention in wide practical use —
// maps to French, mirroring locales.ts's LOCALE_BCP47 and the admin
// Emploi du temps module's own CALENDAR_LOCALE.
const CALENDAR_LOCALE: Record<LocaleKey, Locale> = { fr, ht: fr, en: enUS };

function minutesToHHMM(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

interface TeacherMeResponse {
  thisWeekSessions: {
    id: string;
    date: string;
    startMinutes: number;
    endMinutes: number;
    class: { name: string };
    subject: { name: string };
  }[];
}

export default function EspaceEnseignantHomePage() {
  const t = useTranslations('TeacherPortal');
  const locale = useLocale() as LocaleKey;
  const user = useUser();
  const { data, loading, error } = useApi<TeacherMeResponse>('/api/teacher/me');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('welcome', { name: user?.name ?? user?.email ?? '' })}
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{t('loadError')}</p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-foreground">{t('home.thisWeek')}</h2>
            {data!.thisWeekSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('home.noSessions')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {data!.thisWeekSessions.map((s) => (
                  <Card key={s.id} className="gap-1 p-3.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      {format(new Date(`${s.date}T00:00:00`), 'EEEE d MMMM', {
                        locale: CALENDAR_LOCALE[locale],
                      })}
                      {' · '}
                      {minutesToHHMM(s.startMinutes)}-{minutesToHHMM(s.endMinutes)}
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {s.subject.name} · {s.class.name}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <Link
            href="/espace-enseignant/classes"
            className="rounded-2xl border border-border bg-card p-3.5 text-sm font-semibold text-foreground"
          >
            {t('home.myClasses')}
          </Link>
          <Link
            href="/espace-enseignant/emploi-du-temps"
            className="rounded-2xl border border-border bg-card p-3.5 text-sm font-semibold text-foreground"
          >
            {t('home.viewTimetable')}
          </Link>
        </>
      )}
    </div>
  );
}
