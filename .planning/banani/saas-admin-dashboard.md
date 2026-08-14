# SaaS Admin Dashboard — Banani → Next.js 16 / Tailwind v4

## Source
- Banani screen ID : `VZVQxm_1YTAi` — fetché 2026-08-14 — `fetches/epic2/saas-admin-dashboard.{html,txt}`
- Route : `/admin` (`src/app/admin/page.tsx`) — remplace le 404 actuel, ferme le bug post-login SUPERADMIN

## Structure map
1. **Header** : « Tableau de bord Administration » + sous-titre avec horodatage « Dernière mise à jour » + actions `Exporter le rapport` (CSV client) et `Créer une école` (→ `/admin/schools/new`).
2. **Rangée KPI ×5** : Écoles actives, Utilisateurs totaux, Utilisateurs actifs (% du total), Abonnements actifs (n expirent bientôt), Revenus du mois (+% vs mois dernier) → `StatCard`.
3. **Évolution des revenus** : bar chart 6 mois + footer 3 stats (Total 6 mois / Moy. mensuelle / Croissance) → `BarChart`.
4. **Utilisateurs récents** (colonne droite du chart) : 5 dernières inscriptions (nom, école · rôle, badge statut, ancienneté relative) + « Voir tout » → `/admin/users`.
5. **Écoles clientes** : table compacte (École+code, Pays/Ville, Plan, Élèves, Utilisateurs, Facturation/mois, Statut, Renouvellement), recherche + « Nouvelle école », 5 lignes + « Voir tout » → `/admin/schools`.
6. **Transactions récentes** : mini-table (École+plan·élèves, Montant, Date, badge Statut) → `/admin/billing/transactions`.
7. **Codes promotionnels** : mini-table (Code, Réduction, Utilisations x/y, Expiration, Statut) + « Nouveau coupon » → `/admin/billing/coupons`.

## Données
- Un seul appel : `GET /api/admin/stats/overview` (shape définie dans epic-2-admin-foundation.md).
- « Écoles actives » = Subscription ACTIVE|TRIAL ; « Revenus du mois » = Σ transactions SUCCEEDED du mois courant ; série 6 mois idem par mois.
- Base neuve ⇒ zéros et tables courtes : chaque bloc a un empty state réel (« Aucune école », « Aucune transaction »…) — pas les données de démo du mockup.

## Composants
- **NEW** `admin/StatCard`, `admin/charts/BarChart`, `admin/AdminPageHeader`, `ui/Badge` (fondation)
- **REUSE** `ui/Card`, `ui/Button`, `ui/SearchInput`, `ui/Avatar`, shell admin existant

## Responsive
- **Base 375px** : tout empilé 1 colonne ; KPI en grille 1→2 col (`grid-cols-1 sm:grid-cols-2`) ; chart pleine largeur scrollable si besoin ; tables en `overflow-x-auto` ; actions header pleine largeur empilées.
- **md 768px** : KPI 2–3 col ; chart + Utilisateurs récents encore empilés.
- **lg 1024px** : KPI 5 col ; chart 2/3 + Utilisateurs récents 1/3 (`lg:grid-cols-[2fr_1fr]`) ; Transactions + Coupons côte à côte.
- **xl 1280px** : fidèle au mockup (conteneur max, paddings larges).

## Interactions / états
- Loading : skeletons par bloc (`ui/Skeleton`). Erreur : bandeau par bloc avec retry. Empty : cf. ci-dessus.
- « Exporter le rapport » : CSV client des KPIs+tables (précédent `exportToCsv`).
- Hover lignes tables → bg-muted ; focus visible sur toutes les actions.

## Copy / i18n
- Français, constantes dans `src/lib/constants.ts` (`ADMIN_DASHBOARD`).

## Checklist
- [ ] `GET /api/admin/stats/overview` + tests
- [ ] Page mobile-first + composants
- [ ] Redirect post-login par rôle (login/page.tsx) + retrait TODO
- [ ] 375 / 768 / 1280 vérifiés au dev server
- [ ] Empty/loading/error réels
- [ ] `pnpm format && lint && typecheck && test && build`

## Open questions
- Aucune propre à cet écran — dépend de Q1/Q4 (fondation).
