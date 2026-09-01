'use client';

// Page « Choisissez votre espace » (multi-casquettes, spec 2026-09-01 §6).
// Rendue seulement aux comptes multi-espaces : un compte mono-espace (ou
// sans espace) est redirigé immédiatement, la page est donc sûre en favori.
// ?pref=admin|teacher|student (onglet choisi au login) met la carte
// correspondante en tête avec un accent, sans bloquer les autres.
import { Suspense, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, GraduationCap, School as SchoolIcon, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

type SpaceKey = 'school' | 'teacher' | 'student';

const SPACE_HREF: Record<SpaceKey, string> = {
  school: '/dashboard',
  teacher: '/espace-enseignant',
  student: '/eleve',
};
const SPACE_ICONS = { school: SchoolIcon, teacher: GraduationCap, student: Users } as const;
const PREF_TO_SPACE: Record<string, SpaceKey> = {
  admin: 'school',
  teacher: 'teacher',
  student: 'student',
};

function EspacesContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations('Spaces');

  const available = useMemo<SpaceKey[]>(() => {
    const s = user?.spaces;
    return [
      ...(s?.school ? (['school'] as const) : []),
      ...(s?.teacher ? (['teacher'] as const) : []),
      ...(s?.student ? (['student'] as const) : []),
    ];
  }, [user]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
    } else if (available.length === 1) {
      router.replace(SPACE_HREF[available[0]!]);
    } else if (available.length === 0) {
      router.replace('/dashboard');
    }
  }, [loading, user, available, router]);

  if (loading || !user || available.length < 2) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  const pref = PREF_TO_SPACE[params.get('pref') ?? ''] ?? null;
  const ordered =
    pref && available.includes(pref) ? [pref, ...available.filter((k) => k !== pref)] : available;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <Image
        src="/logos/schoolgesti-lockup.svg"
        alt="Schoolgesti"
        width={164}
        height={44}
        className="mb-8 h-11 w-auto"
        priority
      />
      <h1 className="mb-1.5 text-center text-[22px] font-extrabold tracking-tight text-foreground sm:text-[26px]">
        {t('chooser.title')}
      </h1>
      <p className="mb-8 max-w-md text-center text-[13px] leading-relaxed text-muted-foreground">
        {t('chooser.subtitle')}
      </p>
      <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((key) => {
          const Icon = SPACE_ICONS[key];
          const highlighted = key === pref;
          return (
            <Card
              key={key}
              className={`flex flex-col items-start gap-3 p-5 ${
                highlighted ? 'ring-2 ring-primary' : ''
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                <Icon size={18} className="text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-bold text-foreground">{t(`cards.${key}.title`)}</h2>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {t(`cards.${key}.subtitle`)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push(SPACE_HREF[key])}
                className="inline-flex min-h-12 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-[13px] font-semibold text-primary-foreground"
              >
                {t('chooser.enter')}
                <ArrowRight size={14} />
              </button>
            </Card>
          );
        })}
      </div>
    </main>
  );
}

export default function EspacesPage() {
  return (
    <Suspense fallback={null}>
      <EspacesContent />
    </Suspense>
  );
}
