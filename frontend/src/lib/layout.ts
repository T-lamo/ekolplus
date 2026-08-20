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

// Pages « liste » (élèves, enseignants, classes, matières, affectations,
// paiements, relances, présences, appréciations, carnet…). Décision
// utilisateur 2026-08-20, qui REMPLACE la précédente (2026-08-17 / 08-19,
// gardée ci-dessous pour mémoire) : plus d'« inner scrolling » — pas de boîte
// interne `overflow-auto` à hauteur contrainte pour le tableau/la grille. Sur
// un écran bas (viewport court, ou chrome au-dessus — titre, KPI, bannière,
// filtres — haut relativement à la fenêtre), une telle boîte pouvait se
// réduire à quasi 0 px et rendre le tableau presque invisible. La page suit
// maintenant le flux normal du document ; c'est le scroller natif déjà
// présent dans `(school)/layout.tsx` (le div `overflow-y-auto` autour de
// `{children}`) qui gère tout le défilement de la zone centrale — un seul
// scroller, un comportement natif du navigateur, jamais de contenu piégé
// dans une sous-boîte trop petite. Recette :
//   racine  `<div className={LIST_PAGE}>`               (flux normal, aucune hauteur imposée)
//   carte   `<Card>`                                     (hauteur naturelle du contenu)
//   zone    `<div className={TABLE_SCROLL}>` autour du <table> (scroll horizontal seulement, pour les tableaux plus larges que l'écran — ça ne masque jamais une ligne, contrairement au scroll vertical interne)
//   en-tête `<thead className={STICKY_THEAD}>` (`position: sticky` colle l'en-tête au scroller natif — ce n'est PAS un scroll imbriqué, donc ça reste)
//   grille  `<CardGrid className={GRID_SCROLL}>` en vue cartes (no-op désormais — la grille suit aussi le flux normal)
//
// Ancienne recette (2026-08-17 → 2026-08-19, abandonnée) : racine `flex h-full
// min-h-0 flex-col` + carte `min-h-0 flex-1` + zone `overflow-auto` +
// `lg:h-full` pour forcer le cap desktop. Le but était que « la page ne
// défile jamais dans son ensemble » ; la protection contre le mobile squeeze
// (`min-h-full` plutôt que `h-full` en dessous de `lg`) restait un correctif
// local au symptôme, pas à la cause — la boîte interne pouvait toujours finir
// trop petite. Le nouveau design supprime la cause : plus de hauteur imposée
// à aucun niveau, donc plus de boîte qui peut se réduire à rien.
export const LIST_PAGE = 'flex flex-col';
export const TABLE_SCROLL = 'overflow-x-auto';
export const GRID_SCROLL = '';
// Le filet sous l'en-tête est une ombre interne : en `border-collapse` la
// bordure du <tr> ne suit pas l'en-tête collant.
export const STICKY_THEAD =
  'sticky top-0 z-10 bg-card [&_th]:shadow-[inset_0_-1px_0_0_var(--color-border)]';
