'use client';

// Sélecteur « Mes espaces » (multi-casquettes, spec 2026-09-01 §7) : liste
// les espaces du compte, marque l'espace courant, navigue directement vers
// les URL d'entrée. Rendu nul pour un compte mono-espace. Deux formes : des
// items de menu Radix pour le menu utilisateur des sidebars (école,
// enseignant) et des liens inline pour le header du portail élève, qui n'a
// pas de menu utilisateur.
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, GraduationCap, School as SchoolIcon, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useUser } from '@/contexts/AuthContext';

export type SpaceKey = 'school' | 'teacher' | 'student';

const SPACE_HREF: Record<SpaceKey, string> = {
  school: '/dashboard',
  teacher: '/espace-enseignant',
  student: '/eleve',
};
const SPACE_ICONS = { school: SchoolIcon, teacher: GraduationCap, student: Users } as const;

export function useMySpaces(): SpaceKey[] {
  const user = useUser();
  const s = user?.spaces;
  return [
    ...(s?.school ? (['school'] as const) : []),
    ...(s?.teacher ? (['teacher'] as const) : []),
    ...(s?.student ? (['student'] as const) : []),
  ];
}

export function SpaceSwitcherMenuItems({ current }: { current: SpaceKey }) {
  const available = useMySpaces();
  const router = useRouter();
  const t = useTranslations('Spaces');
  if (available.length < 2) return null;
  return (
    <>
      <DropdownMenu.Separator className="my-1 h-px bg-border" />
      <DropdownMenu.Label className="px-2 pt-1 pb-0.5 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
        {t('switcher.label')}
      </DropdownMenu.Label>
      {available.map((key) => {
        const Icon = SPACE_ICONS[key];
        const isCurrent = key === current;
        return (
          <DropdownMenu.Item
            key={key}
            disabled={isCurrent}
            onSelect={() => router.push(SPACE_HREF[key])}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-none data-[disabled]:opacity-60 data-[highlighted]:bg-secondary data-[highlighted]:text-primary"
          >
            <Icon size={14} />
            <span className="flex-1">{t(`cards.${key}.title`)}</span>
            {isCurrent && <Check size={14} className="text-primary" />}
          </DropdownMenu.Item>
        );
      })}
      <DropdownMenu.Separator className="my-1 h-px bg-border" />
    </>
  );
}

export function SpaceSwitcherInline({ current }: { current: SpaceKey }) {
  const available = useMySpaces();
  const t = useTranslations('Spaces');
  if (available.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {available
        .filter((key) => key !== current)
        .map((key) => {
          const Icon = SPACE_ICONS[key];
          return (
            <Link
              key={key}
              href={SPACE_HREF[key]}
              className="inline-flex min-h-12 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-primary"
            >
              <Icon size={14} />
              {t(`cards.${key}.title`)}
            </Link>
          );
        })}
    </div>
  );
}
