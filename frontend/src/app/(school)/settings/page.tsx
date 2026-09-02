'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useUser } from '@/contexts/AuthContext';
import { Tabs } from '@/components/ui/Tabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { ProfilTab } from './ProfilTab';
import { EtablissementTab } from './EtablissementTab';
import { AnneeScolaireTab } from './AnneeScolaireTab';
import { AdministrateursTab } from './AdministrateursTab';
import { NotificationsTab } from './NotificationsTab';
import { ApparenceTab } from './ApparenceTab';
import { LangueTab } from './LangueTab';
import { ZoneDangereuseSection } from './ZoneDangereuseSection';
import type { SchoolResponse, TermData } from './types';

const TAB_KEYS = [
  'profil',
  'apparence',
  'langue',
  'etablissement',
  'annee',
  'admins',
  'notifications',
];
// « Abonnement » left this page on 2026-08-18 — it is now its own screen at
// /abonnement (sidebar Compte › Abonnement); next.config.ts redirects the
// old ?tab=subscription deep links there.

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsForm />
    </Suspense>
  );
}

function SettingsForm() {
  const t = useTranslations('Settings');
  const user = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState(
    initialTab && TAB_KEYS.includes(initialTab) ? initialTab : 'profil',
  );

  const TABS = [
    { key: 'profil', label: t('tabs.profil') },
    { key: 'apparence', label: t('tabs.apparence') },
    { key: 'langue', label: t('tabs.langue') },
    { key: 'etablissement', label: t('tabs.etablissement') },
    { key: 'annee', label: t('tabs.annee') },
    { key: 'admins', label: t('tabs.admins') },
    { key: 'notifications', label: t('tabs.notifications') },
  ];

  function changeTab(next: string) {
    setTab(next);
    router.replace(next === 'profil' ? '/settings' : `/settings?tab=${next}`, { scroll: false });
  }
  const [error, setError] = useState<string | null>(null);
  const { data, loading, mutate } = useApi<SchoolResponse>('/api/school', {
    skip: !user,
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
        router.replace('/');
        return true;
      }
      setError(t('loadError'));
      return true;
    },
  });

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-4">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  const myRole = data?.members.find((m) => m.userId === user.id)?.role ?? null;

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={changeTab} />

      {loading && (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {!loading && !error && (
        <>
          {tab === 'profil' && <ProfilTab user={user} myRole={myRole} />}
          {tab === 'apparence' && <ApparenceTab />}
          {tab === 'langue' && <LangueTab />}
          {tab === 'etablissement' && data && (
            <div className="flex flex-col gap-5">
              <EtablissementTab
                school={data.school}
                members={data.members}
                onUpdated={(school) => mutate({ ...data, school })}
              />
              {myRole === 'OWNER' && <ZoneDangereuseSection schoolName={data.school.name} />}
            </div>
          )}
          {tab === 'annee' && (
            <AnneeScolaireTab
              academicYear={data?.academicYear ?? null}
              role={myRole}
              onTermAdded={(term: TermData) => {
                if (!data) return;
                if (data.academicYear) {
                  mutate({
                    ...data,
                    academicYear: {
                      ...data.academicYear,
                      terms: [...data.academicYear.terms, term],
                    },
                  });
                  return;
                }
                // First term ever added — refetch to pick up the
                // auto-created AcademicYear rather than guessing its shape.
                void api<SchoolResponse>('/api/school').then((res) => mutate(res));
              }}
              onTermUpdated={(term: TermData) => {
                if (!data?.academicYear) return;
                mutate({
                  ...data,
                  academicYear: {
                    ...data.academicYear,
                    terms: data.academicYear.terms.map((t) => (t.id === term.id ? term : t)),
                  },
                });
              }}
              onGradingScaleUpdated={(gradingScale: string | null) => {
                if (!data?.academicYear) return;
                mutate({ ...data, academicYear: { ...data.academicYear, gradingScale } });
              }}
            />
          )}
          {tab === 'admins' && data && (
            <AdministrateursTab members={data.members} myRole={myRole} />
          )}
          {tab === 'notifications' && <NotificationsTab />}
        </>
      )}
    </div>
  );
}
