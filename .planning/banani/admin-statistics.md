# Admin Statistics — Banani → Next.js 16 / Tailwind v4

## Source
- Banani screen ID : `nSYPhOOZgccA` — fetché 2026-08-14 — `fetches/epic2/admin-statistics.{html,txt}`
- Route : `/admin/statistics` (`src/app/admin/statistics/page.tsx`)

## Structure map
1. **Header** : « Statistiques de la plateforme » + horodatage + segmented control période (7 jours/30 jours/6 mois/1 an) + `Exporter`.
2. **KPI ×5** : Total écoles, Total élèves, Taux de rétention, Revenu annuel (ARR), Rev. par élève/mois → `StatCard`.
3. **Évolution des revenus mensuels** : bar chart 12 mois avec axe Y gradué + tooltip valeur + footer 4 stats (Total 12 mois / Moy. mensuelle / Pic / Croissance YoY) → `BarChart`.
4. **Répartition des plans** : donut (n écoles au centre) + légende Premium/Essentiel/Starter avec counts et % → `DonutChart`.
5. **Métriques de croissance** : 6 tuiles (Nouvelles écoles, Nouveaux élèves, Bulletins générés, Notes saisies, Taux de désabonnement, LTV).
6. **Répartition géographique** : liste pays (drapeau, nom, n écoles, revenu) avec barres proportionnelles.
7. **Activité hebdomadaire** : heatmap jours × créneaux (Matin/Après-midi/Soir) + légende Faible→Élevé.

## Données — calculable vs non (Q2)
- **Réel dès V1** : Total écoles, Total élèves, ARR (=MRR actif ×12), Rev./élève/mois (tarifs plans), série 12 mois (BillingTransaction), répartition plans (Subscription), répartition géo (School.country), Nouvelles écoles/mois, Nouveaux élèves/mois, Bulletins générés (count Appreciation? non — count exports ? V1 : count `Grade`+`Appreciation` saisis ce mois est réel ; « Bulletins générés » sans table d'export → afficher Notes saisies + Appréciations à la place, ou compter les templates ? → à trancher à l'implémentation avec honnêteté).
- **Décision utilisateur : tracking réel construit** — `LoginEvent` + `SubscriptionStatusChange` (voir fondation, Q2). Rétention, churn, LTV et heatmap calculés depuis ces logs ; « — » affiché tant que l'historique est insuffisant (ex. LTV sans churn observé), jamais de valeur inventée.
- Endpoint : `GET /api/admin/stats/detailed?period=...` (fondation). Le segmented control pilote la fenêtre des séries.

## Composants
- **NEW** `admin/charts/DonutChart`, `admin/charts/Heatmap` (si Q2 = tracking, sinon différé) ; réutilise `BarChart`, `StatCard`.
- Suivre le skill `dataviz` avant d'écrire les charts (palette, axes, a11y, tooltips).

## Responsive
- **Base 375px** : tout empilé ; segmented control scrollable ; chart 12 mois → scroll horizontal interne ; donut centré ; heatmap overflow-x-auto.
- **md** : KPI ×2–3 ; chart + donut empilés.
- **lg/xl** : KPI ×5 ; chart 2/3 + donut 1/3 ; métriques ×3 col ; géo + heatmap côte à côte — mockup fidèle.

## Interactions / états
- Changement de période → refetch avec skeleton ; export CSV des agrégats affichés ; tooltips au survol ET valeurs visibles en dur (mobile sans hover).

## Copy / i18n
- `ADMIN_STATS` dans constants.ts.

## Checklist
- [ ] `GET /api/admin/stats/detailed` + tests
- [ ] Charts SVG (dataviz skill) a11y
- [ ] Page mobile-first ; 375 / 768 / 1280
- [ ] KPI non calculables : affichage honnête
- [ ] format/lint/typecheck/test/build

## Open questions
- « Bulletins générés » : pas de table d'export des bulletins — remplacer par « Notes saisies » + « Appréciations » (réels) ? (recommandé)
