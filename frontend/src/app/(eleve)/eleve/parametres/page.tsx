'use client';

// Paramètres élève — the personal subset of the school Paramètres screen
// (profile + password, appearance, language), reusing the exact same tab
// components the teacher portal reuses. The school-scoped tabs have no
// meaning for a student account and their APIs are deny-by-default
// anyway; the three tabs here only talk to /api/auth/* (PATCH
// /api/auth/me, change-password), which is user-scoped.
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useUser } from '@/contexts/AuthContext';
import { Tabs } from '@/components/ui/Tabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { ProfilTab } from '@/app/(school)/settings/ProfilTab';
import { ApparenceTab } from '@/app/(school)/settings/ApparenceTab';
import { LangueTab } from '@/app/(school)/settings/LangueTab';

const TAB_KEYS = ['profil', 'apparence', 'langue'];

export default function EleveParametresPage() {
  return (
    <Suspense fallback={null}>
      <EleveParametresForm />
    </Suspense>
  );
}

function EleveParametresForm() {
  const t = useTranslations('Settings');
  const tPortal = useTranslations('ElevePortal');
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
  ];

  function changeTab(next: string) {
    setTab(next);
    router.replace(next === 'profil' ? '/eleve/parametres' : `/eleve/parametres?tab=${next}`, {
      scroll: false,
    });
  }

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-4">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{tPortal('settings.subtitle')}</p>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={changeTab} />

      {tab === 'profil' && (
        <ProfilTab
          user={user}
          myRole={null}
          subtitle={tPortal('settings.profileSubtitle')}
          roleDisplay={tPortal('roleLabel')}
        />
      )}
      {tab === 'apparence' && <ApparenceTab />}
      {tab === 'langue' && <LangueTab />}
    </div>
  );
}
