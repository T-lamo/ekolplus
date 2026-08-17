// Largeur dépliée partagée par les deux sidebars (école + admin) et leurs
// tiroirs mobiles. `SIDEBAR_WIDTH_CLASS` doit rester égal à `SIDEBAR_WIDTH`
// (Tailwind ne lit pas les valeurs calculées — `width.test.ts` le vérifie).
// 220 → 240 le 2026-08-17 sur retour utilisateur (« un peu trop petit »).
export const SIDEBAR_WIDTH = 240;
export const SIDEBAR_WIDTH_CLASS = 'w-[240px]';
