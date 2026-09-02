'use client';

// Page « Choisissez votre espace » (multi-casquettes, spec 2026-09-01 §6).
// Rendue seulement aux comptes multi-espaces : un compte mono-espace (ou
// sans espace) est redirigé immédiatement, la page est donc sûre en favori.
// ?pref=admin|teacher|student (onglet choisi au login) met la carte
// correspondante en tête avec le badge « Accès principal », sans bloquer
// les autres. Design Banani (screen « Space Selector ») traduit avec 3
// écarts délibérés (voir .planning/banani/espaces-chooser.md) : la carte
// « Espace parent » du design est retirée (l'app n'a que 3 espaces, /eleve
// sert élève ET tuteur), les couleurs par carte du mock deviennent les
// tokens de statut (primary/info/warning) au lieu de teintes arbitraires,
// et les tags de chaque carte listent des modules réels de l'app.
import { Suspense, useEffect, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, Building2, GraduationCap, BookOpen, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

type SpaceKey = 'school' | 'teacher' | 'student';

const SPACE_HREF: Record<SpaceKey, string> = {
  school: '/dashboard',
  teacher: '/espace-enseignant',
  student: '/eleve',
};
const SPACE_ICONS: Record<SpaceKey, LucideIcon> = {
  school: Building2,
  teacher: GraduationCap,
  student: BookOpen,
};
// Tokens de statut de l'app (jamais themés) plutôt que des teintes propres à
// chaque carte — c'est le seul jeu de couleurs "par catégorie" de la charte.
const SPACE_TINT: Record<SpaceKey, { icon: string }> = {
  school: { icon: 'text-primary' },
  teacher: { icon: 'text-info-foreground' },
  student: { icon: 'text-warning-foreground' },
};
const PREF_TO_SPACE: Record<string, SpaceKey> = {
  admin: 'school',
  teacher: 'teacher',
  student: 'student',
};

function EspacesContent() {
  const { user, loading, logout } = useAuth();
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
  const displayName = user.name ?? user.email;

  return (
    <main className="relative flex min-h-screen flex-col items-center overflow-hidden bg-background px-4 py-12 sm:px-6">
      {/* Fond décoratif du design Banani (3 formes floues) — purement visuel */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-48 -left-48 h-[500px] w-[500px] rounded-full bg-primary opacity-10 blur-[120px] sm:h-[800px] sm:w-[800px]" />
        <div className="absolute -right-32 -bottom-24 h-[320px] w-[320px] rounded-full bg-info-foreground opacity-10 blur-[100px] sm:h-[500px] sm:w-[500px]" />
        <div className="absolute top-[35%] left-[55%] hidden h-[400px] w-[400px] rounded-full bg-success-foreground opacity-10 blur-[100px] lg:block" />
      </div>

      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center gap-10 lg:max-w-[1080px]">
        <div className="flex flex-col items-center gap-4 text-center">
          <Image
            src="/logos/schoolgesti-lockup.svg"
            alt="Schoolgesti"
            width={164}
            height={44}
            className="h-9 w-auto"
            priority
          />

          <div className="flex items-center gap-2.5 rounded-full border border-border bg-card py-1.5 pr-4 pl-1.5 shadow-sm">
            <Avatar name={displayName} size={32} src={user.avatarUrl} />
            <div className="flex flex-col items-start">
              <span className="text-xs font-semibold text-foreground">{displayName}</span>
              {user.name && <span className="text-2xs text-muted-foreground">{user.email}</span>}
            </div>
          </div>

          <h1 className="text-[26px] font-extrabold tracking-tight text-foreground sm:text-4xl">
            {t('chooser.title')}
          </h1>
          <p className="max-w-[520px] text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
            {t('chooser.subtitle')}
          </p>
        </div>

        {/* flex + justify-center plutôt qu'une grille : un compte à 2 espaces
            (le cas le plus fréquent) doit voir ses 2 cartes centrées, pas
            calées à gauche des 3 colonnes d'une grille CSS classique. Les
            largeurs par palier reproduisent visuellement les mêmes colonnes
            qu'une grille (1 / 2 / 3), seul le comportement de centrage change. */}
        <div className="flex w-full flex-wrap justify-center gap-5">
          {ordered.map((key) => {
            const Icon = SPACE_ICONS[key];
            const tint = SPACE_TINT[key];
            const featured = key === pref;
            return (
              <Card
                key={key}
                className={`relative flex w-full flex-none flex-col gap-5 overflow-hidden px-6 pt-8 pb-6 shadow-[0_18px_40px_rgba(15,23,36,0.08),0_6px_18px_rgba(15,23,36,0.05)] sm:w-[calc(50%-10px)] lg:w-[calc(33.333%-14px)] ${
                  featured
                    ? 'shadow-[0_22px_48px_rgba(15,23,36,0.10),0_8px_22px_rgba(15,23,36,0.06)]'
                    : ''
                }`}
              >
                <div
                  aria-hidden
                  className="absolute top-0 right-6 left-6 h-[3px] rounded-full bg-foreground/[0.06]"
                />
                <Icon
                  aria-hidden
                  size={100}
                  className={`pointer-events-none absolute -right-2.5 -bottom-2.5 opacity-5 ${tint.icon}`}
                />

                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-secondary shadow-[0_10px_24px_rgba(15,23,36,0.06)]">
                    <Icon size={24} className={tint.icon} />
                  </div>
                  {featured && (
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-foreground">
                      {t('chooser.preferredBadge')}
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-1.5">
                  <h2 className="text-[17px] font-bold text-foreground">
                    {t(`cards.${key}.title`)}
                  </h2>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {t(`cards.${key}.subtitle`)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(['one', 'two', 'three'] as const).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-muted-foreground"
                      >
                        {t(`cards.${key}.tags.${tag}`)}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => router.push(SPACE_HREF[key])}
                  className="relative z-10 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_10px_20px_rgba(108,99,255,0.18)]"
                >
                  {t('chooser.enter')}
                  <ArrowRight size={16} />
                </button>
              </Card>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2.5 text-[13px] text-muted-foreground">
          <span>{t('footer.wrongAccount')}</span>
          <span aria-hidden className="opacity-35">
            ·
          </span>
          <button
            type="button"
            onClick={async () => {
              await logout();
              router.replace('/login');
            }}
            className="font-medium text-primary"
          >
            {t('footer.logout')}
          </button>
          <span aria-hidden className="opacity-35">
            ·
          </span>
          <Link href="/#contact" className="font-medium text-primary">
            {t('footer.help')}
          </Link>
          <span aria-hidden className="opacity-35">
            ·
          </span>
          <span>{t('footer.copyright', { year: new Date().getFullYear() })}</span>
        </div>
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
