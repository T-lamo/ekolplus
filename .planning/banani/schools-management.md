# Schools Management — Banani → Next.js 16 / Tailwind v4

## Source
- Banani screen ID : `72UpLW9LHCiI` — fetché 2026-08-14 — `fetches/epic2/schools-management.{html,txt}`
- Route : `/admin/schools` (`src/app/admin/schools/page.tsx`) — cible du back-link de Create School

## Structure map
1. **Header** : « Écoles clientes » + sous-titre + `Exporter CSV` + `Créer une école` (→ `/admin/schools/new`).
2. **KPI ×4** : Total écoles, Abonnements actifs (n en attente/suspension), Total élèves, Revenu mensuel → `StatCard`.
3. **Barre de filtres** : recherche (nom école), select Plan (Tous/Premium/Essentiel/Starter), select Statut, select Pays, compteur « n résultats ».
4. **Table** : Avatar initiales + École (+ drapeau pays + ville), Plan (badge ⭐/📚/🚀), Statut (badge Actif/Suspendu/Inactif/Expire bientôt), Élèves, Revenu/mois, Admin responsable, Inscription (date), Dernier accès (relatif), Actions.
5. **Menu Actions par ligne** (`ui/ActionMenu`) : Voir le profil / Accéder à l'école / Modifier les infos / Gérer l'abonnement (→ subscriptions filtrée) / Réinitialiser mdp / Suspendre / Supprimer l'école.
6. **Pagination** : « Affichage de 1 à N sur X écoles » + pages → `ui/Pager`.

## Données
- `GET /api/admin/schools` (fondation) — cursor pagination, filtres serveur `q/plan/status`.
- « Dernier accès » = max(`User.lastLoginAt`) des membres — « — » si jamais.
- Pays : le modèle School a-t-il un champ pays/ville ? → vérifier ; sinon ajouter `country`/`city` String? à School dans la migration 18 (affiché « — » sur l'existant).

## Actions V1 vs différées (honnêteté)
- **V1 réel** : Voir le profil (→ modal ou page détail ? V1 : modal résumé), Modifier les infos (modal → `PATCH` à créer ou réutiliser PUT school ? — admin ≠ membre : nouvel endpoint admin), Suspendre/Réactiver (statut Subscription ou Organization ? → suspendre = Subscription.status SUSPENDED), Supprimer l'école (type-to-confirm, réutilise la mécanique DELETE /api/school mais côté admin — nouvel endpoint `DELETE /api/admin/schools/[id]` avec logAdminAction).
- **Différé (toast « bientôt »)** : Accéder à l'école (= impersonation, décision OVERVIEW différée), Réinitialiser mdp du owner.

## Composants
- **NEW** rien de spécifique — consomme la fondation (StatCard, Badge, Pager, ActionMenu, FilterSelect, SearchInput, Avatar).

## Responsive
- **Base 375px** : KPI 1→2 col ; filtres empilés pleine largeur ; table `overflow-x-auto` (min-w fixe) ; pager centré.
- **md** : KPI ×2, filtres en ligne wrap.
- **lg/xl** : KPI ×4, table pleine, fidèle au mockup.

## Interactions / états
- Debounce 300ms sur la recherche (précédent users/fees) ; skeleton table ; empty « Aucune école ne correspond aux filtres » ; erreurs toast + bandeau.
- Suppression : modal type-to-confirm (précédent Zone dangereuse settings école).

## Copy / i18n
- `ADMIN_SCHOOLS` dans constants.ts.

## Checklist
- [ ] `GET /api/admin/schools` + endpoints mutation (modifier/suspendre/supprimer) + tests
- [ ] Champs `country`/`city` si absents du modèle School
- [ ] Page mobile-first
- [ ] 375 / 768 / 1280
- [ ] Empty/loading/error + pagination réelle
- [ ] format/lint/typecheck/test/build

## Open questions
- « Voir le profil » : modal résumé (recommandé V1) ou page `/admin/schools/[id]` dédiée ?
