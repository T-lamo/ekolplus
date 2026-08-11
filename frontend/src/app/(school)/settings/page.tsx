'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { Tabs } from '@/components/ui/Tabs';
import { ProfilTab } from './ProfilTab';
import { EtablissementTab } from './EtablissementTab';
import { AnneeScolaireTab } from './AnneeScolaireTab';
import { AdministrateursTab } from './AdministrateursTab';
import type { SchoolResponse, TermData } from './types';

const TABS = [
  { key: 'profil', label: 'Profil' },
  { key: 'etablissement', label: 'Établissement' },
  { key: 'annee', label: 'Année scolaire' },
  { key: 'admins', label: 'Administrateurs' },
];

export default function SettingsPage() {
  const user = useUser();
  const router = useRouter();
  const [tab, setTab] = useState('profil');
  const [data, setData] = useState<SchoolResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api<SchoolResponse>('/api/school')
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        setError('Impossible de charger les informations de l’établissement.');
      })
      .finally(() => setLoading(false));
  }, [user, router]);

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-4">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </main>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">Paramètres</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Gère les informations de ton établissement, les préférences et la sécurité du compte.
        </p>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {!loading && !error && (
        <>
          {tab === 'profil' && <ProfilTab user={user} />}
          {tab === 'etablissement' && data && (
            <EtablissementTab
              school={data.school}
              onUpdated={(school) => setData((d) => (d ? { ...d, school } : d))}
            />
          )}
          {tab === 'annee' && (
            <AnneeScolaireTab
              academicYear={data?.academicYear ?? null}
              onTermAdded={(term: TermData) =>
                setData((d) => {
                  if (!d) return d;
                  if (d.academicYear) {
                    return {
                      ...d,
                      academicYear: { ...d.academicYear, terms: [...d.academicYear.terms, term] },
                    };
                  }
                  // First term ever added — refetch to pick up the
                  // auto-created AcademicYear rather than guessing its shape.
                  void api<SchoolResponse>('/api/school').then(setData);
                  return d;
                })
              }
            />
          )}
          {tab === 'admins' && data && <AdministrateursTab members={data.members} />}
        </>
      )}
    </div>
  );
}
