// Mises en page partagées de l'app école — une seule largeur de colonne latérale
// pour toutes les pages « contenu + panneau droit » (fiche matière, dashboard,
// relances, appréciations, notes élève…). Décision 2026-08-17 : la fiche
// matière (360 px en lg, 420 px en xl) est la référence ; le garde-fou
// `layout.test.ts` refuse toute largeur `grid-cols-[1fr_NNNpx]` codée en dur
// ailleurs sous `src/app/(school)` et `src/components/school`.
//
// Usage : `<div className={cn(ASIDE_GRID, 'items-start')}>` — la colonne
// principale d'abord, le panneau droit ensuite. Ajouter `items-start` quand
// les deux colonnes ne doivent pas s'étirer à la même hauteur (formulaires) ;
// le laisser de côté quand deux cartes côte à côte doivent rester alignées en
// bas (dashboard).
export const ASIDE_GRID =
  'grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_420px]';
