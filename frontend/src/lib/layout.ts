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

// Grille des cartes de liste (`ListCard`) : colonnes auto-fill de 270 px min —
// 4 colonnes à 1440 (sidebar dépliée), 3 à 1280, 5 à 1920, 1 sur mobile.
// `content-start` : les lignes ne s'étirent pas quand la grille est `flex-1`
// (pagination ancrée en bas) et qu'il y a peu de résultats — sinon deux
// cartes remplissaient tout l'écran en hauteur.
export const CARD_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] content-start gap-3';
