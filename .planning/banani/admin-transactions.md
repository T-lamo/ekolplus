# Admin Transactions — Banani → Next.js 16 / Tailwind v4

## Source
- Banani screen ID : `Csehe4Ndlnml` — fetché 2026-08-14 — `fetches/epic2/admin-transactions.{html,txt}`
- Route : `/admin/billing/transactions`

## Structure map
1. **Header** : « Transactions » + sous-titre + `Exporter CSV` (client) + `Rapport PDF` (**différé** — toast « bientôt », pas d'infra PDF serveur pour ce module).
2. **KPI ×4** : Revenus totaux (année), Revenus ce mois (MRR), Transactions ce mois, Remboursements en cours ($ à traiter) → `StatCard`.
3. **Revenus mensuels (année)** : bar chart + footer (Meilleur mois / Cumul YTD) → `BarChart`.
4. **Répartition des paiements** (colonne droite) : mockup Stripe/PayPal/Virement — adapté aux méthodes réelles (`STRIPE`/`MANUAL`/`BANK_TRANSfer` de l'enum) + 4 mini-stats (réussies, échouées, remboursements, ticket moyen).
5. **Filtres** : recherche (école, référence TXN), mois, selects Statut / Moyen / Plan.
6. **Table** : onglets Réussie/Remboursée/Échouée + ID Transaction (mono), École (avatar + n élèves · plan), Plan badge, Montant (négatif rouge = remboursement), Moyen, Date, Période couverte, Statut badge, action `Voir` (`Relancer` si échouée → **différé**, toast).
7. **Pagination** `ui/Pager`.

## Données
- `GET /api/admin/billing/transactions` (filtres serveur : mois, statut, méthode, plan, q) + `POST` (enregistrement manuel d'un paiement — modal depuis `Voir tous` ? Non : bouton discret « Enregistrer un paiement » ajouté au header — le mockup ne l'a pas mais sans Stripe c'est la seule source de données ; à valider en confirmation).
- « Voir » : modal détail transaction (référence, école, montant, méthode, période, statut, horodatages, lien abonnement).
- Remboursement : action dans le modal détail → crée une transaction négative REFUNDED liée (pattern signé du mockup).

## Composants
- Fondation (StatCard, Badge, BarChart, Pager, Modal, FilterSelect, SearchInput, Avatar, Tabs).

## Responsive
- **Base 375px** : KPI 1→2 ; chart puis répartition empilés ; filtres empilés ; table overflow-x-auto (colonnes nombreuses → min-w large) ; pager centré.
- **md** : KPI ×2. **lg/xl** : KPI ×4 ; chart 2/3 + répartition 1/3 ; mockup fidèle.

## Interactions / états
- Base neuve ⇒ empty state central « Aucune transaction — les paiements enregistrés apparaîtront ici » + CTA enregistrement manuel.
- Montants toujours `formatés depuis cents` ; jamais de float.

## Copy / i18n
- `ADMIN_TRANSACTIONS` dans constants.ts.

## Checklist
- [ ] Routes transactions + tests (référence unique TXN-YYYYMMDD-NNNN, montant signé, refund lié)
- [ ] Page mobile-first + modal détail
- [ ] 375 / 768 / 1280
- [ ] format/lint/typecheck/test/build

## Open questions
- Bouton « Enregistrer un paiement » (hors mockup, nécessaire sans Stripe) : OK ? (recommandé oui)
