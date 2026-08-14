# Epic 2 — Fondation SaaS Admin (partagée par les 8 écrans)

## Source
- Flow Banani : « Separate Screen Regen » (`2oB_n5kLBeuy`), 8 écrans fetchés le 2026-08-14
- Exports bruts : `.planning/banani/fetches/epic2/*.html` + `.txt` (outlines texte) + `theme.json` — gitignorés
- Thème Banani : « Admin Slate » (primary #0EA5A4 teal, sidebar #0B1220)

## Écrans du lot (breadcrumbs Banani → routes)

| Écran | Banani ID | Route | Backend |
|---|---|---|---|
| SaaS Admin Dashboard | `VZVQxm_1YTAi` | `/admin` | new `GET /api/admin/stats/overview` |
| Admin Statistics | `nSYPhOOZgccA` | `/admin/statistics` | new `GET /api/admin/stats/detailed` |
| Schools Management | `72UpLW9LHCiI` | `/admin/schools` | new `GET /api/admin/schools` |
| Admin Users | `Znvh5ZdXvT5j` | `/admin/users` | existing `GET /api/admin/users` (+`lastLoginAt`) |
| Admin Subscriptions | `M0FRcZpAIEZQ` | `/admin/billing/subscriptions` | new models + routes |
| Admin Transactions | `Csehe4Ndlnml` | `/admin/billing/transactions` | new models + routes |
| Admin Coupons | `zNn8It52QEEh` | `/admin/billing/coupons` | new models + routes |
| System Settings | `wYzeYOvmfsoL` | `/admin/system/settings` | new `PlatformSettings` singleton |

Les hrefs existent déjà tous dans `AdminSidebar.ADMIN_SECTIONS` — zéro changement de nav
(sauf : `/admin/billing/plans` n'existe pas dans la sidebar ni dans ce lot ; la gestion des
plans vit dans System Settings → Plans & Tarification).

## Token mapping (Banani « Admin Slate » → projet « Lavender SaaS »)

Décision : **on garde la palette Lavender existante** (`--color-primary: #6c2bd9`) — le shell
admin (AdminSidebar/AdminTopbar/layout) est déjà construit et vérifié avec ces tokens depuis
Create School. Le thème teal du fetch est une divergence Banani, pas une refonte demandée.

| Banani (Admin Slate) | Projet |
|---|---|
| `--primary #0EA5A4` | `primary` (#6c2bd9) |
| `--secondary #E6F7F6` | `secondary` (#ede9fb) |
| `--sidebar #0B1220` | `sidebar-dark` (#16102e) — déjà appliqué par le shell |
| `--success #10B981` (solide) | `success`/`success-foreground` existants (paire soft) |
| `--warning #F59E0B` | `warning`/`warning-foreground` existants |
| `--destructive #EF4444` | `destructive`/`destructive-foreground` existants |
| `--muted-foreground #8B939C` | `muted-foreground` (#696582, AA-corrigé) |
| radii 4/6/8/12 | `--radius-sm/md/lg/xl` identiques — rien à faire |
| Inter | déjà la fonte du layout racine |

Couleurs de graphiques (barres/donut/heatmap) : suivre le skill `dataviz` au moment de coder
les charts ; base = primary + variantes, pas de teal.

## Nouveaux modèles Prisma (migration `18_saas_billing`)

**Décision utilisateur requise (Q1)** — hypothèse recommandée : modèles réels, gestion
manuelle par le superadmin, Stripe branché plus tard (OVERVIEW confirme Stripe-only à terme).

- `SubscriptionPlan` — `id`, `key` enum-like unique (`STARTER`|`ESSENTIEL`|`PREMIUM`), `name`,
  `pricePerStudentCents Int`, `currency` (défaut `USD`), `active Boolean`, `sortOrder Int`.
  Seedé (0.30 / 0.50 / 0.80 $). Montant mensuel d'une école = élèves actifs × tarif plan.
- `Subscription` — `id`, `schoolId @unique`, `planId`, `status` enum (`TRIAL`|`ACTIVE`|
  `EXPIRED`|`SUSPENDED`|`CANCELED`), `startedAt`, `renewsAt`, `trialEndsAt?`, `couponId?`,
  timestamps. Pas de snapshot élèves : calculé live via `Enrollment` count.
- `Coupon` — `id`, `code @unique`, `type` enum (`PERCENT`|`FIXED`|`FREE_MONTH`), `value Int`
  (points de % ou cents), `durationMonths Int?` (null = permanent), `planId?` (null = tous),
  `maxUses Int?` (null = ∞), `usedCount Int @default(0)`, `expiresAt?`, `schoolId?`
  (restriction), `description?`, timestamps. Statut dérivé (actif / bientôt expiré ≤30j /
  épuisé / expiré) — pas de champ stocké.
- `BillingTransaction` — `id`, `reference @unique` (`TXN-YYYYMMDD-NNNN`), `schoolId`,
  `subscriptionId?`, `amountCents Int` (négatif = remboursement), `method` enum (`STRIPE`|
  `MANUAL`|`BANK_TRANSFER`), `status` enum (`SUCCEEDED`|`PENDING`|`FAILED`|`REFUNDED`),
  `paidAt`, `periodStart DateTime` (mois couvert), timestamps.
- `User.lastLoginAt DateTime?` — stampé dans `POST /api/auth/login` (étape 8, après
  recordSuccess). **Gap assumé** : le callback OAuth Google est un fichier protégé → les
  connexions Google ne stampent pas ce champ en V1 (affichage « — »).

Montants : **integer cents USD** (invariant CLAUDE.md « smallest currency unit »).

## Nouveaux endpoints (tous : `runtime='nodejs'`, `requireAdmin('ADMIN')` lecture /
`requireAdmin('SUPERADMIN')` + `verifyCsrf` mutations, `enforceAdminRateLimit`,
`logAdminAction` sur toute mutation, listes vides → 200 `{items:[], nextCursor:null}`)

- `GET /api/admin/schools` — liste + filtres `q/plan/status` + cursor pagination ; par école :
  school, orga, owner (nom), plan+statut d'abonnement, compte élèves actifs, revenu mensuel
  calculé, `lastAccessAt` = max(lastLoginAt des membres), `createdAt`.
- `GET /api/admin/stats/overview` — KPIs dashboard + série revenus 6 mois + 5 derniers
  utilisateurs + 5 écoles + 5 transactions + 4 coupons (un seul appel hydrate `/admin`).
- `GET /api/admin/stats/detailed` — KPIs statistiques + série 12 mois + répartition plans +
  répartition pays + métriques de croissance (nouvelles écoles, élèves, bulletins générés,
  notes saisies — comptables depuis les modèles existants).
- `GET/POST /api/admin/billing/subscriptions` + `PATCH /api/admin/billing/subscriptions/[id]`
  (changer plan/statut/renouvellement).
- `GET /api/admin/billing/transactions` + `POST` (enregistrement manuel) ; export CSV côté
  client comme les pages école.
- `GET/POST /api/admin/billing/coupons` + `PATCH/DELETE /api/admin/billing/coupons/[id]`.
- `GET/PUT /api/admin/system/settings` — singleton `PlatformSettings` (upsert id='singleton').

## Composants partagés à extraire (`src/components/admin/` + `ui/`)

- **NEW** `ui/Badge` — enfin ≥3 consommateurs (statuts école/abonnement/transaction/coupon/
  utilisateur). Généraliser depuis `school/fees/badges.tsx` sans casser ses consommateurs.
- **NEW** `admin/StatCard` — KPI (label, valeur, delta ±, sous-texte, icône) — présent sur 7
  des 8 écrans. C'est LE composant de l'epic.
- **NEW** `admin/AdminPageHeader` — titre + sous-titre + zone d'actions (les 8 écrans).
- **NEW** `admin/charts/BarChart` + `DonutChart` — SVG maison (pas de lib), thème Lavender,
  a11y (aria + valeurs textuelles). Consommés par dashboard/statistics/subscriptions/
  transactions.
- **REUSE** `school/fees/Pager` → déplacer vers `ui/Pager` (3 tables paginées ici) en gardant
  un ré-export à l'ancien emplacement.
- **REUSE** `ui/SearchInput`, `ui/FilterSelect`, `ui/ActionMenu`, `ui/Modal`, `ui/Card`,
  `ui/Button`, `ui/Field`, `ui/Select`, `ui/Avatar`, `ui/Switch`, `ui/Tabs`.
- Table : pas de primitive Table générique pour l'instant (chaque table a des cellules trop
  spécifiques) — on suit le pattern overflow-x-auto des pages fees.

## Post-login redirect (correction du bug de session précédente)

`/admin` existant enfin, `login/page.tsx` branche sur le rôle après `refresh()` :
`role === 'SUPERADMIN' || 'ADMIN'` → `router.push('/admin')`, sinon `/configuration/classes`.
Le rôle vient de `GET /api/auth/me` (renvoie déjà `role`). Retirer le TODO(epic-2/3).

## Données honnêtes (règle maison, précédent frais-scolarite)

Jamais de faux succès ni de fausses données. Tout KPI/graph calculable depuis la base est
calculé ; tout ce qui exige une infra absente est soit omis, soit affiché « — » / « bientôt
disponible » (voir Q2/Q3 par écran). Les données de démo des mockups (47 écoles, $14 205…)
ne sont PAS reproduites.

## Ordre d'implémentation

1. Migration + seed plans + `lastLoginAt` + Badge/StatCard/AdminPageHeader/Pager move
2. `/admin` (dashboard) + stats/overview + redirect post-login par rôle
3. `/admin/schools` + GET schools
4. `/admin/users` (backend déjà prêt)
5. `/admin/statistics` + stats/detailed
6. `/admin/billing/subscriptions`
7. `/admin/billing/transactions`
8. `/admin/billing/coupons`
9. `/admin/system/settings`

Chaque écran : commit atomique `feat(banani): <slug> — pixel parity` + STATUS.md à jour +
vérif 375/768/1280 au dev server avant de passer au suivant.

## Décisions utilisateur (2026-08-14)

- **Q1 Facturation** : ✅ modèles réels sans Stripe, gestion manuelle superadmin, Stripe branché plus tard.
- **Q2 Métriques** : ✅ **construire le tracking d'événements** — ajouté à la migration :
  - `LoginEvent` { id, userId, createdAt } — inséré à chaque login réussi (route login,
    même endroit que le stamp `lastLoginAt`). Index sur (createdAt), (userId, createdAt).
  - `SubscriptionStatusChange` { id, subscriptionId, fromStatus?, toStatus, createdAt } —
    écrit à chaque création/PATCH de statut d'abonnement (même tx).
  - Calculs : heatmap = LoginEvent groupé jour-semaine × créneau (Matin <12h / Après-midi
    12-18h / Soir >18h) sur 30 j ; rétention = % users avec login <30j parmi les comptes
    de >30j ; churn mensuel = passages vers EXPIRED|CANCELED du mois ÷ actifs en début de
    mois (via le log) ; LTV = ARPU mensuel ÷ churn (affiché « — » tant que churn = 0).
- **Q3 System Settings** : ✅ cœur réel (identité, tarifs plans, essai, switches notifs),
  Stripe = état env, sécurité/sauvegardes read-only honnête, maintenance différée.
- **Q4 Devise** : ✅ USD, montants en cents (integer).
