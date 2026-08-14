# Admin Users — Banani → Next.js 16 / Tailwind v4

## Source
- Banani screen ID : `Znvh5ZdXvT5j` — fetché 2026-08-14 — `fetches/epic2/admin-users.{html,txt}`
- Route : `/admin/users` (`src/app/admin/users/page.tsx`)

## Structure map
1. **Header** : « Utilisateurs » + sous-titre + `Exporter` (CSV client) — le bouton mockup « Ajouter un utilisateur » est **retiré en V1** (les comptes naissent via création d'école / signup ; pas d'endpoint admin-create, et en créer un sans flow d'email de bienvenue serait un piège).
2. **KPI ×4** : Utilisateurs totaux, Utilisateurs actifs (%), Admins d'école, Comptes suspendus → `StatCard`.
3. **Filtres** : recherche, select École (searchable — « Toutes les écoles »), select Rôle (mockup : Admin/Directeur/Enseignant/Comptable — voir Open questions), select Statut, bouton Réinitialiser, compteur résultats.
4. **Card liste** : onglets Tous/Actifs/Suspendus + table : Utilisateur (avatar, nom, email), École (initiales+nom), Rôle, Statut badge, Dernière connexion, Inscrit le, Actions.
5. **Menu Actions** : Voir le profil / Modifier / Réinitialiser le mot de passe / Se connecter en tant que… / Suspendre-Réactiver / Supprimer.
6. **Pagination** `ui/Pager`.

## Données
- `GET /api/admin/users` existe (q/status/role/cursor) — à **étendre** : `lastLoginAt` dans USER_SELECT (whitelist PII : OK, ce n'est pas un secret), filtre `schoolId` (join OrganizationMember→Organization→School), et l'école de chaque user dans la réponse.
- KPI : `GET /api/admin/stats/overview` partiel ou endpoint léger dédié `GET /api/admin/users/stats` — décider à l'implémentation (préférence : agrégats dans la réponse liste, 1 seul appel).
- Rôles réels du système : `User.role` global (USER/ADMIN/SUPERADMIN) + `OrganizationMember.role` (OWNER/ADMIN/MEMBER). Les rôles métier du mockup (Directeur/Enseignant/Comptable) n'existent pas sur User — l'école-side a Teacher. Mapping V1 : afficher le rôle org (Propriétaire/Admin/Membre) + « Enseignant » si un Teacher lié existe. Filtre Rôle = rôles org.
- **Suspendre** : `PATCH /api/admin/users/[id]/status` existe (ADMIN-04). **Rôle** : `[id]/role` existe (SUPERADMIN).

## Actions V1 vs différées
- **V1 réel** : Voir le profil (modal — réutilise `GET /api/admin/users/[id]`), Suspendre/Réactiver (endpoint existant), Supprimer (nouvel endpoint ? — voir Open questions).
- **Différé (toast « bientôt »)** : Modifier (édition PII par admin = surface sensible), Réinitialiser le mot de passe (nécessite flow email), Se connecter en tant que… (impersonation différée, décision OVERVIEW).

## Composants
- Fondation uniquement (StatCard, Badge, Pager, ActionMenu, SearchInput, FilterSelect, Avatar, Tabs).

## Responsive
- **Base 375px** : KPI 1→2 col, filtres empilés, table overflow-x-auto, onglets scrollables.
- **md** : KPI ×2 ; **lg/xl** : KPI ×4, mockup fidèle.

## Interactions / états
- Debounce recherche ; onglets = raccourcis du filtre statut ; skeleton/empty/error par précédent fees.

## Copy / i18n
- `ADMIN_USERS` dans constants.ts.

## Checklist
- [ ] Étendre GET /api/admin/users (lastLoginAt, école, filtre école, agrégats) + tests
- [ ] Page mobile-first
- [ ] 375 / 768 / 1280
- [ ] format/lint/typecheck/test/build

## Open questions
- Suppression définitive d'un utilisateur par l'admin : l'autoriser en V1 (cascade sur ses données école ?) ou différer ? Recommandation : **différer** (toast « bientôt ») — la suspension couvre le besoin réel et une suppression cascade mal pensée est irréversible.
