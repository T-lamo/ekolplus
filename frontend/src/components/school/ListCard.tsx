'use client';

import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

// Gabarit unique des cartes de liste (matières, classes, élèves, enseignants,
// affectations…) — décision 2026-08-17 après retour utilisateur (« cartes
// trop grosses, trop d'espace, cadre pas beau ») :
//   • tuile 38 px · titre 14 px · sous-titre 12 px · menu ⋯ dans l'en-tête ;
//   • une ligne « méta » : personne / info à gauche, statut à droite ;
//   • pied séparé par un filet, deux extrémités ;
//   • aucune couleur par carte — la tuile est la seule touche de couleur ;
//   • cadre `rounded-xl border` comme partout, léger relief au survol.
// À poser dans `CARD_GRID` (src/lib/layout.ts) : grille auto-fill 270 px min,
// `content-start` pour que les lignes ne s'étirent pas quand il y a peu de
// résultats (le conteneur est `flex-1` pour ancrer la pagination en bas).

export interface ListCardProps {
  tile?: ReactNode;
  title: string;
  /** Rend le titre cliquable (fiche détail). */
  href?: string;
  subtitle?: ReactNode;
  menu?: ReactNode;
  metaLeft?: ReactNode;
  metaRight?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  className?: string;
}

export function ListCard({
  tile,
  title,
  href,
  subtitle,
  menu,
  metaLeft,
  metaRight,
  footerLeft,
  footerRight,
  className,
}: ListCardProps) {
  const hasMeta = metaLeft !== undefined || metaRight !== undefined;
  const hasFooter = footerLeft !== undefined || footerRight !== undefined;
  const titleClass = 'block truncate text-sm leading-5 font-bold text-foreground';
  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border border-border bg-card transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-sm',
        className,
      )}
    >
      <div className="flex items-start gap-3 px-4 pt-3.5">
        {tile}
        <div className="min-w-0 flex-1 pt-px">
          {href ? (
            <Link href={href} className={cn(titleClass, 'hover:text-primary')} title={title}>
              {title}
            </Link>
          ) : (
            <div className={titleClass} title={title}>
              {title}
            </div>
          )}
          {subtitle !== undefined && (
            <div className="mt-px truncate text-xs text-muted-foreground">{subtitle}</div>
          )}
        </div>
        {menu && <div className="-mt-1 -mr-1.5 shrink-0">{menu}</div>}
      </div>

      {hasMeta && (
        <div className="mt-3 flex items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-foreground">
            {metaLeft}
          </div>
          {metaRight !== undefined && <div className="shrink-0">{metaRight}</div>}
        </div>
      )}

      {hasFooter ? (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-xs">
          <div className="flex min-w-0 items-center gap-1.5">{footerLeft}</div>
          {footerRight !== undefined && (
            <div className="shrink-0 text-muted-foreground">{footerRight}</div>
          )}
        </div>
      ) : (
        <div className="pb-3.5" />
      )}
    </div>
  );
}

/** Tuile 38 px de l'en-tête (icône matière colorée, icône neutre `bg-secondary text-primary`…). */
export function ListCardTile({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        'flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg',
        className,
      )}
      {...(style ? { style } : {})}
    >
      {children}
    </div>
  );
}

/** Personne en ligne « méta » : avatar 20 px + nom (+ suffixe muet), ou libellé vide en italique. */
export function ListCardPerson({
  name,
  photoUrl,
  suffix,
  emptyLabel = 'Non assigné',
}: {
  name?: string | null | undefined;
  photoUrl?: string | null | undefined;
  suffix?: ReactNode;
  emptyLabel?: string;
}) {
  if (!name) {
    return <span className="text-muted-foreground italic">{emptyLabel}</span>;
  }
  return (
    <>
      <Avatar name={name} size={20} src={photoUrl} />
      {/* Nom + suffixe dans un seul span tronqué : c'est la fin du suffixe
          qui est coupée, jamais le nom. */}
      <span className="truncate">
        {name}
        {suffix !== undefined && <span className="text-muted-foreground"> {suffix}</span>}
      </span>
    </>
  );
}
