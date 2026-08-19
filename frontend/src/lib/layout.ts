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
// paiements, relances, présences, appréciations, carnet…) — décision
// utilisateur 2026-08-17 : la page ne défile JAMAIS dans son ensemble ; le
// tableau (ou la grille de cartes) défile dans sa propre zone, l'en-tête, la
// recherche et les filtres restent visibles. Recette :
//   racine  `flex h-full min-h-0 flex-col …`  (LIST_PAGE : hauteur = <main>)
//   carte   `<Card className="min-h-0 flex-1">`
//   zone    `<div className={TABLE_SCROLL}>` autour du <table> (défile en x et y)
//   en-tête `<thead className={STICKY_THEAD}>` (reste visible en défilant)
//   grille  `<CardGrid className={GRID_SCROLL}>` en vue cartes
// `min-h-full` not `h-full` below `lg`: on a page whose header/KPI/filter
// chrome is tall relative to a short mobile viewport, a hard `h-full` forces
// the `min-h-0 flex-1` Card down to near-zero height, and content that isn't
// part of its own internal scroll area (the Pager, sitting beside
// TABLE_SCROLL) then paints past that squeezed box into territory the outer
// scroller doesn't count toward its scrollable height — reachable by no
// amount of scrolling, and covered by the fixed mobile bottom nav (confirmed
// via elementFromPoint on /scolarite/paiements at 360×760). `min-h-full`
// behaves identically whenever content actually fits (the common case) and
// only kicks in to let the page grow — and become scrollable — instead of
// silently trapping content when it doesn't.
//
// `lg:h-full` restores the hard cap on desktop (user decision 2026-08-19):
// with a `min-height`-only root, a flex container whose own height is
// indeterminate sizes its `flex-1` children to their natural content height
// instead of the remaining space, so TABLE_SCROLL/GRID_SCROLL never actually
// clip+scroll — the outer shell scroller ends up scrolling the whole page
// (header, KPIs, search) as one blob instead of just the table. Desktop has
// enough width for header chrome to lay out in one row (no wrapping stack
// like mobile), so the near-zero-squeeze failure mode above doesn't recur
// there — the hard cap is safe from `lg` up and makes the header/search
// truly sticky while only the table/card area scrolls.
export const LIST_PAGE = 'flex min-h-full flex-col lg:h-full';
export const TABLE_SCROLL = 'min-h-0 flex-1 overflow-auto';
export const GRID_SCROLL = 'min-h-0 flex-1 overflow-y-auto';
// Le filet sous l'en-tête est une ombre interne : en `border-collapse` la
// bordure du <tr> ne suit pas l'en-tête collant.
export const STICKY_THEAD =
  'sticky top-0 z-10 bg-card [&_th]:shadow-[inset_0_-1px_0_0_var(--color-border)]';
