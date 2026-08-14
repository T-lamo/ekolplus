# System Settings — Banani → Next.js 16 / Tailwind v4

## Source
- Banani screen ID : `wYzeYOvmfsoL` — fetché 2026-08-14 — `fetches/epic2/system-settings.{html,txt}`
- Route : `/admin/system/settings` — accès **SUPERADMIN uniquement** (mutations)

## Structure map (mockup : nav latérale d'ancres + sections empilées)
1. **Header** : « Paramètres Système » + `Réinitialiser` + `Enregistrer les modifications` (form global, dirty-state).
2. **Nav d'ancres** : Général / Facturation & Stripe / Emails & Notifications / Sécurité & Accès / Bulletins & Templates / Sauvegardes & Données / API & Intégrations — V1 : seules les sections réellement câblées sont listées (Q3).
3. **Identité de la plateforme** : Nom, Domaine principal, Email de support, Fuseau horaire, Langue, Logo (upload — réutilise `ui/ImageUploader`), Version (lecture seule — depuis package.json).
4. **Plans & Tarification** : Devise (lecture seule USD V1), tarif par élève/mois **par plan** (Starter/Essentiel/Premium — édite `SubscriptionPlan.pricePerStudentCents`), Période d'essai (jours), bloc Passerelle Stripe : **état réel** depuis l'env (Connecté/Non configuré + mode) — lecture seule.
5. **Notifications & Alertes** : 5 switches (nouvel abonnement, paiement échoué, rapport hebdo, expiration -7j, mode maintenance) — stockés en base ; **les canaux d'envoi ne sont pas câblés en V1** → sous-texte honnête « prendra effet à l'activation du canal d'envoi » sur ceux sans consommateur. Mode maintenance : réel ? → Open questions.
6. **Sécurité & Accès** : email admin principal (lecture seule = premier SUPERADMIN), 2FA (**différé** — n'existe pas, affiché « bientôt »), clé API (**différé** — pas d'API publique), durée de session + tentatives max (lecture seule — pilotés par le code auth protégé : JWT 15min/7j, lockout existant).
7. **Sauvegardes & Données** : **différé entièrement** (les sauvegardes sont chez Neon, pas pilotables d'ici) — carte informative honnête, pas de faux statut de backup.
8. **Zone de danger** : Vider le cache (**différé**), Réinitialiser les paramètres (réel — reset du singleton aux défauts, type-to-confirm, logAdminAction).

## Données
- `GET/PUT /api/admin/system/settings` — singleton `PlatformSettings` (id fixe, upsert) : platformName, domain, supportEmail, timezone, locale, logoUploadId?, trialDays, notifyNewSubscription, notifyFailedPayment, weeklyReport, expiryReminders, maintenanceMode.
- Tarifs plans : `PUT` met aussi à jour `SubscriptionPlan` (dans la même tx, logAdminAction).
- Lecture Stripe : présence des env `STRIPE_*` (jamais les valeurs).

## Composants
- Fondation + `ui/Switch`, `ui/Field`, `ui/Select`, `ui/ImageUploader`, `ui/Card` existants ; `admin/SettingsSection` (titre + description + children) locale.

## Responsive
- **Base 375px** : nav d'ancres → select sticky ou chips scrollables ; sections empilées, champs pleine largeur.
- **md** : champs 2 col. **lg/xl** : nav latérale sticky + contenu — mockup fidèle.

## Interactions / états
- Form global avec dirty tracking → barre `Enregistrer` activée ; PUT → toast succès ; erreurs Zod par champ.
- Chaque bloc différé = affichage honnête (« bientôt » / lecture seule), jamais un contrôle mort qui semble fonctionner.

## Copy / i18n
- `ADMIN_SETTINGS` dans constants.ts.

## Checklist
- [ ] Modèle PlatformSettings + routes + tests (SUPERADMIN only, logAdminAction, reset)
- [ ] Page mobile-first
- [ ] 375 / 768 / 1280
- [ ] format/lint/typecheck/test/build

## Open questions
- **Mode maintenance** : le rendre réel en V1 (un middleware qui affiche une page de maintenance aux non-admins — petit mais transversal) ou différé ? Recommandation : **différé** (switch masqué V1).
- Périmètre exact V1 = Q3 de la fondation.
