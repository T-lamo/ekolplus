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

## Miroir Stripe (2026-08-19) — le code saisi dans l'admin est saisissable sur checkout.stripe.com
- Pourquoi : `createCheckoutSession` a `allow_promotion_codes: true`, mais Stripe ne connaît que SES codes. Un coupon créé dans `/admin/billing/coupons` est donc mirroré en **Stripe Coupon** (termes : `percent_off` / `amount_off` USD, `duration` forever | repeating `durationMonths` ; FREE_MONTH = 100 % repeating N mois) + **Promotion Code** (même texte de code, `max_redemptions`, `expires_at`, `customer` si le coupon est restreint à une école → Customer Stripe créé à la volée). Ids persistés dans `Coupon.stripeCouponId` / `stripePromotionCodeId` (migration 29 `coupon_stripe_ids`).
- Lib : `lib/server/billing/coupons.ts` (`reconcileStripeCoupon(db, after, before)` → `created` / `replaced` (termes modifiés → ancienne paire désactivée + supprimée, nouvelle créée — les objets Stripe sont immuables) / `toggled` (`active`) / `removed` (plan hors Stripe) / `skipped` (Stripe non configuré) / `unchanged` ; `removeStripeCoupon`), 18 tests.
- Routes : POST → ligne créée puis miroir (échec Stripe = ligne gardée, `stripe.synced:false` + `error`) ; PATCH → Stripe AVANT la BDD (échec = 502 `STRIPE_ERROR`, rien n'est écrit) ; `PATCH {}` = « Synchroniser avec Stripe » ; DELETE → Stripe d'abord (tolère `resource_missing`). GET expose `stripe: { synced, redeemable }` par ligne + `stripeConfigured`.
- Portée : seul le plan **Établissement Pro** passe par Stripe → un coupon restreint à Starter/Enterprise reste back-office (« Hors Stripe »), « Tous les plans » ou Pro est mirroré. Code = `lib/coupon-code.ts` (`A-Z0-9-`, 3-30, même alphabet que Stripe).
- Usage : le webhook/cron (`syncSubscriptionFromStripe`) lit `subscription.discounts[0]` (promotion_code ou coupon) → relie `Subscription.couponId` et incrémente `usedCount` une seule fois par abonnement ; un code créé directement dans le Dashboard Stripe marche aussi mais n'est pas compté ici.
- UI : colonne « Checkout Stripe » (Saisissable / À synchroniser / Hors Stripe / Stripe inactif, tooltip), action « Synchroniser avec Stripe » sur les lignes à synchroniser, toast d'avertissement si la création n'a pas pu être mirrorée, hint d'alphabet sous le champ code.
- Backfill : `pnpm stripe:sync-coupons` (`-- --dry-run`, `:live` charge `.env.production.local`) — tourne avec `tsx --conditions=react-server` pour charger les modules `server-only` ; **à lancer une fois en prod après le déploiement de la migration 29** pour les coupons existants. Vérifié en test le 2026-08-19 (coupon `76RUGCSS` 30 % → `promo_…`, re-run = 0 à faire).

## Checklist
- [ ] Routes coupons + tests (unicité code, statuts dérivés, garde suppression)
- [ ] Page mobile-first + modal création/édition/duplication
- [ ] 375 / 768 / 1280
- [ ] format/lint/typecheck/test/build

## Open questions
- Aucune propre à l'écran — dépend de Q1.
