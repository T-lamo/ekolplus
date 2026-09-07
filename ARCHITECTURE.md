# Architecture

Vue d'ensemble du système pour quelqu'un qui découvre le projet. Pour les invariants précis et les règles à ne pas casser (fichiers protégés, patterns obligatoires), voir [CLAUDE.md](CLAUDE.md) — ce document-ci reste volontairement plus haut niveau.

## Vue d'ensemble

SchoolGesti est une application unique Next.js 16 (App Router), sans backend séparé : les Route Handlers sous `frontend/src/app/api/` et les Server Actions font office de backend, colocalisés avec les pages dans le même projet. Une seule base de code, un seul déploiement par environnement.

```
Navigateur
   │  cookies httpOnly (access/refresh/csrf)
   ▼
Next.js (Vercel) ── App Router ─┬─ Pages (React 19, Server + Client Components)
                                 └─ Route Handlers (/api/**) ── Prisma ── Postgres (Neon)
                                                              ├─ Upstash Redis (rate-limit, cache)
                                                              ├─ Cloudinary (uploads)
                                                              ├─ Resend (email)
                                                              ├─ Stripe (facturation)
                                                              └─ Sentry (observabilité)
```

## Multi-tenant

Chaque établissement scolaire est une `School` isolée. Un utilisateur (`User`) accède à une école via `OrganizationMember` (rôle OWNER/ADMIN/MEMBER) ; les routes école résolvent systématiquement l'établissement courant via `resolveMySchool()`, qui refuse par défaut (aucune école résolue = 404, jamais de fuite d'existence). Un rôle SUPERADMIN transverse (`User.role`) donne accès au back-office (`/admin`) qui gère l'ensemble des écoles clientes, indépendamment de toute appartenance à une école.

## Multi-espaces

Un même compte peut cumuler plusieurs profils : école (staff), portail enseignant, portail élève. `resolveMySpaces()` calcule les espaces actifs pour l'utilisateur courant ; 0 espace retombe sur un dashboard neutre, 1 espace atterrit directement dessus, 2+ espaces ouvrent un sélecteur (`/espaces`). Chaque espace a son propre shell (sidebar/topbar/nav mobile) et sa propre famille de routes API (`/api/school/*`, `/api/teacher/*`, `/api/student/*`), avec des règles d'audience différentes (par exemple un élève ne voit jamais une évaluation en brouillon).

## RBAC (permissions école)

Un registre unique de modules/actions (`frontend/src/lib/permissions.ts`) définit les droits possibles (élèves, notes, présences, paiements, configuration...). Un `StaffRole` par école regroupe des droits sous un nom ("comptable", "secrétariat"...) et est assigné à un ou plusieurs membres — les droits effectifs d'un membre sont l'union de tous ses rôles. Chaque route `/api/school/*` appelle `requireSchoolPermission()`, contrôlé par un test de garde en CI qui échoue si une nouvelle route l'oublie.

## Authentification

JWT d'accès (15 min) + JWT de rafraîchissement (7 j, scopé à `/api/auth`) + jeton CSRF en double-soumission, tous en cookies `httpOnly`/`Secure`/`SameSite=Lax`. L'inscription ne pose aucun cookie et répond identiquement qu'un email existe déjà ou non (résistant à l'énumération) ; la session démarre à la vérification de l'email. Connexion Google disponible en option (OAuth 2.0 + PKCE via `arctic`).

## Domaines métier principaux

- **Élèves & scolarité** — dossiers élèves, inscriptions, tuteurs, frais et paiements par tranche, relances.
- **Pédagogie** — classes, matières (notation numérique ou par grille de critères qualitatifs), évaluations et notes, moyennes pondérées par coefficient, appréciations, présences, emploi du temps.
- **Bulletins** — moteur de mise en page par blocs typés (en-tête, notes, absences, texte libre enrichi, signatures, carnets annuels...), un modèle de bulletin étant assignable par niveau scolaire ; génération PDF côté serveur.
- **Facturation SaaS** — abonnement par école sur Stripe (checkout, portail client, synchronisation quotidienne des sièges facturés sur l'effectif réel d'élèves).
- **Back-office SUPERADMIN** — écoles clientes, comptes, abonnements, journal d'audit.

## Tâches de fond

Pas de worker persistant (incompatible avec le runtime serverless de Vercel) : le travail asynchrone passe par des routes **Vercel Cron** (`/api/cron/*`, protégées par un jeton bearer) et par un **pattern outbox** — les effets de bord d'un webhook (email, notification) sont écrits dans la même transaction que l'événement métier, puis drainés par un cron dédié, plutôt que déclenchés en fire-and-forget.

## Internationalisation

Résolution de la langue (français / créole haïtien / anglais) côté serveur via un cookie, sans préfixe d'URL (`next-intl`). Les bulletins imprimés restent en français par défaut : ce sont des documents administratifs officiels.

## Tests

Vitest côté serveur (2220 tests), aucun framework E2E en v1 — un script de fumée (`pnpm smoke:auth`) couvre le parcours d'authentification de bout en bout contre une instance `pnpm dev` réelle. Voir [CONTRIBUTING.md](CONTRIBUTING.md) pour les conventions de test.

## Pour aller plus loin

- [README.md](README.md) — démarrage, commandes, variables d'environnement
- [CLAUDE.md](CLAUDE.md) — invariants détaillés, fichiers protégés, conventions strictes
- [API.md](API.md) — référence des routes
- [DEPLOY.md](DEPLOY.md) — déploiement et environnements
- `docs/superpowers/specs/` — spécifications des fonctionnalités majeures
