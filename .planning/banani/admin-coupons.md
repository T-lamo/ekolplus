# Admin Coupons — Banani → Next.js 16 / Tailwind v4

## Source
- Banani screen ID : `zNn8It52QEEh` — fetché 2026-08-14 — `fetches/epic2/admin-coupons.{html,txt}`
- Route : `/admin/billing/coupons`

## Structure map
1. **Header** : « Coupons & Codes Promo » + sous-titre + `Exporter` + `Créer un coupon`.
2. **KPI ×4** : Coupons actifs, Utilisations totales, Remises accordées ($), Coupons expirés → `StatCard`.
3. **Formulaire « Nouveau coupon »** (le mockup le montre inline ouvert — implémenté en `Modal`, cohérent avec le reste de l'app) : sélecteur de type en 3 cartes radio (% Pourcentage / $ Montant fixe / 🎁 Mois offert), Code (avec bouton générer), Valeur (suffixe % ou $), Durée (mois, vide = permanent), Plan applicable, Limite d'utilisation (vide = illimité), Date d'expiration, Description interne, Restriction par école (select searchable optionnel).
4. **Filtres** : recherche code, selects Type / Statut / Plan.
5. **Table** : compteurs (n actifs · n expirés) + Code (mono + copie), Type (icône), Remise (25% / -$50 / 1 mois + durée), Plan, Utilisations (x / y avec barre), Limite, Expiration, Statut badge (Actif / Bientôt expiré / Épuisé / Expiré), Actions (Modifier / Dupliquer / Désactiver / Supprimer).
6. **Pagination** `ui/Pager`.

## Données
- CRUD fondation : `GET/POST /api/admin/billing/coupons`, `PATCH/DELETE .../[id]`.
- Statut dérivé serveur : expiré (date), épuisé (usedCount ≥ maxUses), bientôt expiré (≤30j), sinon actif.
- `usedCount` incrémenté quand un coupon est attaché à un abonnement (V1 manuel) ; « Remises accordées » = Σ remises appliquées sur transactions du coupon (approximation V1 : calcul à partir des abonnements liés — à préciser à l'implémentation, honnêteté d'abord).
- Suppression refusée si coupon attaché à ≥1 abonnement actif → proposer Désactiver.

## Composants
- Fondation (StatCard, Badge, Pager, ActionMenu, Modal, FilterSelect, SearchInput) + cartes radio du type (locales à l'écran).

## Responsive
- **Base 375px** : KPI 1→2 ; modal plein écran mobile ; cartes radio empilées ; table overflow-x-auto.
- **md** : KPI ×2 ; cartes radio ×3. **lg/xl** : KPI ×4 ; mockup fidèle.

## Interactions / états
- Génération de code : slug aléatoire lisible (A-Z0-9, 8-10 chars) côté client, éditable.
- Validation Zod : PERCENT 1-100 ; FIXED > 0 cents ; FREE_MONTH → durée ≥1 ; code unique (409 → erreur champ).
- Copie du code : bouton presse-papiers + toast.
- Empty : « Aucun coupon — créez votre premier code promo ».

## Copy / i18n
- `ADMIN_COUPONS` dans constants.ts.

## Checklist
- [ ] Routes coupons + tests (unicité code, statuts dérivés, garde suppression)
- [ ] Page mobile-first + modal création/édition/duplication
- [ ] 375 / 768 / 1280
- [ ] format/lint/typecheck/test/build

## Open questions
- Aucune propre à l'écran — dépend de Q1.
