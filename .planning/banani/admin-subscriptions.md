# Admin Subscriptions — Banani → Next.js 16 / Tailwind v4

## Source
- Banani screen ID : `M0FRcZpAIEZQ` — fetché 2026-08-14 — `fetches/epic2/admin-subscriptions.{html,txt}`
- Route : `/admin/billing/subscriptions` (breadcrumb Banani : Administration › Facturation › Abonnements)

## Structure map
1. **Header** : « Abonnements » + sous-titre + `Exporter` + `Nouvel abonnement` (modal).
2. **KPI ×4** : Abonnements actifs, Revenus mensuels (MRR), Renouvellements ce mois (+ prochaine date), Abonnements expirés (Action requise) → `StatCard`.
3. **Répartition par plan** : donut (n écoles) + légende avec counts/% + ligne « Expirés » → `DonutChart`.
4. **Revenus des 6 derniers mois** : bar chart MRR + footer (Ce mois / Croissance) → `BarChart`.
5. **Filtres** : recherche école, selects Plan / Statut / Renouvellement.
6. **Table** : onglets Actif/Essai/Expiré + École (avatar initiales + ville), Plan (badge émoji), Élèves, Tarif/mois ($x.xx / élève), Montant (calculé), Renouvellement (date, « dans N jours » en warning), Utilisation (barre % — voir Open questions), Statut, action `Gérer` (Relancer si expiré).
7. **Bandeau d'alerte bas de page** : « N abonnements arrivent à échéance dans les 30 prochains jours » + `Envoyer rappels` + `Voir tous`.

## Données
- CRUD fondation : `GET/POST /api/admin/billing/subscriptions`, `PATCH .../[id]`.
- Montant = élèves actifs (Enrollment) × pricePerStudentCents du plan − remise coupon active.
- « Nouvel abonnement » : modal — école (sans abonnement) + plan + statut initial (TRIAL avec date fin / ACTIVE) + date renouvellement + coupon optionnel.
- « Gérer » : modal — changer plan/statut/renouvellement, détacher coupon ; historique min (createdAt, coupon).
- **Différé** : `Envoyer rappels` (toast « bientôt » — pas de canal d'envoi câblé, précédent frais-scolarite).

## Composants
- Fondation (StatCard, Badge, DonutChart, BarChart, Pager, ActionMenu, Modal, FilterSelect, SearchInput, Avatar, Tabs).

## Responsive
- **Base 375px** : KPI 1→2 ; donut et chart empilés ; filtres empilés ; table overflow-x-auto ; bandeau alerte empilé avec CTA pleine largeur.
- **md** : KPI ×2 ; donut+chart empilés encore. **lg/xl** : KPI ×4 ; donut 1/3 + chart 2/3 ; mockup fidèle.

## Interactions / états
- Statuts dérivés à l'affichage : TRIAL→« Essai », renouvellement <30j → warning « dans N jours », EXPIRED → destructive + action `Relancer` (rouvre le modal Gérer).
- Empty : « Aucun abonnement » + CTA Nouvel abonnement. Skeleton/erreur standard.

## Copy / i18n
- `ADMIN_SUBSCRIPTIONS` dans constants.ts.

## Checklist
- [ ] Routes subscriptions + tests (création refusée si école a déjà un abonnement, montants integer cents)
- [ ] Page mobile-first + modals
- [ ] 375 / 768 / 1280
- [ ] format/lint/typecheck/test/build

## Open questions
- Colonne « Utilisation » (78%…) : le mockup ne définit pas la métrique. Interprétation recommandée : % d'élèves actifs vs capacité déclarée de l'école — mais aucune capacité n'existe sur School. Proposition V1 : **omettre la colonne** (honnêteté) ou afficher le ratio élèves inscrits/élèves actifs ? À trancher.
