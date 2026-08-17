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

// Grille des cartes de liste (`ListCard`) — via `<CardGrid>`
// (src/components/school/CardGrid.tsx). Décision utilisateur 2026-08-17 :
// « quatre éléments par ligne » → colonnes plafonnées à 4, carte ≥ ~277 px, et
// le nombre de colonnes suit la LARGEUR DU CONTENU (container query sur le
// wrapper `CARD_GRID_CONTAINER`, pas la fenêtre : sidebar dépliée/repliée =
// 240 px de différence). Repères : 1280 → 3 ; 1440 et au-delà → 4.
// `content-start` : les lignes ne s'étirent pas quand il y a peu de résultats.
export const CARD_GRID_CONTAINER = '@container/cards';
export const CARD_GRID =
  'grid grid-cols-1 content-start gap-3 @min-[566px]/cards:grid-cols-2 @min-[855px]/cards:grid-cols-3 @min-[1144px]/cards:grid-cols-4';
