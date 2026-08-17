import type { ReactNode } from 'react';
import { CARD_GRID, CARD_GRID_CONTAINER } from '@/lib/layout';
import { cn } from '@/lib/utils';

/** Grille des cartes de liste (élèves, enseignants, classes, matières,
 * affectations…) — le wrapper est le conteneur des container queries de
 * `CARD_GRID`, la grille en est l'enfant (un élément ne peut pas interroger
 * sa propre largeur). Ne JAMAIS poser `@container` plus haut (ex. sur
 * `<main>`) : le confinement de mise en page qu'il implique casserait les
 * modales `position: fixed` rendues dans les pages. */
export function CardGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(CARD_GRID_CONTAINER, className)}>
      <div className={CARD_GRID}>{children}</div>
    </div>
  );
}
