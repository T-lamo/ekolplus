# Schoolgesti

**Schoolgesti** est un système d'information scolaire (SIS) tout-en-un : gestion des dossiers élèves, inscriptions, notes et bulletins officiels, présences, emploi du temps, frais de scolarité et paiements, réunis dans une seule application. Pensé pour les écoles en Haïti, en Afrique francophone et en Europe.

Site : [schoolgesti.com](https://schoolgesti.com)

Une seule app Next.js 16 full-stack — pas de backend séparé. Multi-établissement (chaque école a son propre espace), avec un back-office SUPERADMIN pour gérer l'ensemble des écoles clientes, leurs abonnements et leur facturation.

## Fonctionnalités

- **Élèves & Enseignants** — dossiers, classes, matières enseignées, statut (actif / en congé)
- **Pédagogie** — emploi du temps, présences, carnet de notes (évaluations + moyennes pondérées par coefficient), appréciations (commentaires de bulletin)
- **Bulletins** — génération PDF à partir d'un modèle de bulletin configurable par école
- **Scolarité** — structure de frais par tranche, suivi des paiements, relances, litiges
- **Configuration** — niveaux, classes, salles, matières, modèle de bulletin, année scolaire (avec assistant de passage d'année)
- **Espace parents / élèves** — accès dédié en lecture sur le dossier de l'élève
- **Back-office SUPERADMIN** (`/admin`) — écoles clientes, utilisateurs, abonnements & facturation Stripe, statistiques globales, réglages système
- **Multi-devises** — HTG, USD, XOF, XAF, EUR
- **Multilingue** — français / créole haïtien / anglais, résolu par cookie (`next-intl`, sans préfixe d'URL)
- **Thèmes** — palette de couleurs personnalisable par école (Paramètres → Apparence)
- **PWA installable** — utilisable hors-ligne sur mobile (service worker via Serwist)

## Stack technique

- **App :** Next.js 16 (App Router) + React 19 + TypeScript — Route Handlers sous `frontend/src/app/api/` + Server Actions, tout dans une seule app
- **Base de données :** Prisma 5 sur Postgres ([Neon](https://neon.tech) serverless — URL `-pooler` pour l'app, `DIRECT_URL` pour les migrations)
- **Auth :** cookies httpOnly + CSRF + JWT (access 15 min / refresh 7 j), Google OAuth (`arctic`)
- **Facturation SaaS :** Stripe (abonnements écoles, coupons, portail client) — inerte sans `STRIPE_SECRET_KEY`
- **Infra optionnelle (env-gated) :** Upstash Redis (rate-limit, leader election, outbox), Cloudinary (uploads), Resend (email)
- **Observabilité :** Sentry (`@sentry/nextjs`), `@vercel/otel`
- **Outils :** workspace pnpm, Vitest (1449 tests), ESLint 9 flat config, Prettier, Node ≥ 20

## Démarrage

```bash
git clone git@github.com:T-lamo/ekolplus.git
cd ekolplus
cp .env.example frontend/.env.local        # DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, CRON_SECRET au minimum
pnpm install
pnpm db:migrate:deploy                      # applique les migrations sur ta DB Neon
pnpm dev                                    # http://localhost:3000
```

Pour peupler une base de dev avec une école complète + comptes de test :

```bash
pnpm seed:dev-school            # ajoute --reset pour repartir de zéro
```

Pour créer le premier compte SUPERADMIN :

```bash
pnpm db:make-superadmin you@example.com
```

## Commandes

| Tâche | Commande |
|---|---|
| Dev (Next.js sur :3000, Turbopack) | `pnpm dev` |
| Build | `pnpm build` |
| Appliquer le schema Prisma (itération dev) | `pnpm db:push` |
| Migrations versionnées | `pnpm db:migrate:dev` (local) / `pnpm db:migrate:deploy` (CI/prod) |
| Prisma Studio (:5555) | `pnpm db:studio` |
| Jeu de données de dev (école complète) | `pnpm seed:dev-school -- --reset` |
| Tests unitaires (Vitest) | `pnpm test` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Format | `pnpm format` |
| Smoke test auth (contre `pnpm dev`) | `pnpm smoke:auth` |

Avant tout commit : `pnpm format && pnpm lint && pnpm typecheck && pnpm test` — doivent tous passer.

## Variables d'environnement

Référence complète et documentée : [`.env.example`](.env.example) à la racine.

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | URL pooler Neon (`?pgbouncer=true&connection_limit=1&pool_timeout=15&sslmode=require`) |
| `DIRECT_URL` | URL Neon directe (non-poolée), requise pour `prisma migrate` |
| `JWT_SECRET` | ≥ 32 caractères — `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | 32 bytes base64 — `openssl rand -base64 32` |
| `CRON_SECRET` | Bearer token requis par `/api/cron/*` |
| `APP_URL` | Base pour les liens email et le callback OAuth ; défaut `http://localhost:3000` |

Groupes optionnels (absents = fonctionnalité inerte, l'app démarre quand même) :

| Groupe | Vars | Comportement si absent |
|---|---|---|
| Stripe (abonnements écoles) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_PRO_ANNUAL` | `/api/school/billing/*` renvoie 503, l'onglet Abonnement affiche un état neutre |
| Storage (Cloudinary) | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | `/api/upload` renvoie 503 |
| Email (Resend) | `RESEND_API_KEY`, `EMAIL_FROM` | Les emails restent en file et partent au prochain cron dès que la clé est ajoutée |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | `/api/auth/oauth/google/*` renvoie 404 |
| Sentry | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | No-op silencieux |
| Upstash Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate-limit fallback en mémoire (⚠️ ne pas lancer en prod multi-instance sans Upstash) |

## Structure du projet

```
ekolplus/
├── frontend/
│   ├── prisma/schema.prisma        Modèles réels : School, Student, Teacher, Class, Grade,
│   │                                Attendance, FeeStructure/FeePayment, Subscription, ...
│   ├── src/app/
│   │   ├── (school)/               Espace école : dashboard, eleves, enseignants, pedagogie/,
│   │   │                            scolarite/, bulletins, configuration/, settings, abonnement
│   │   ├── admin/                  Back-office SUPERADMIN : schools, users, billing, statistics
│   │   └── api/
│   │       ├── auth/, admin/       Auth (JWT/CSRF/OAuth), routes admin
│   │       ├── school/             Domaine métier : students, teachers, classes, fees, timetable, ...
│   │       ├── webhooks/, cron/    Stripe webhook, tâches planifiées Vercel Cron
│   │       └── ...
│   └── src/lib/server/             Logique serveur (auth, payments, notifications, outbox, ...)
├── examples/frontend-pages/        Pages Tailwind de référence
└── .planning/                      Notes de specs et de migration ponctuelles
```

## Déploiement

Deux projets Vercel séparés, tous deux avec `frontend/` comme root directory :

- **Production** — branche `main` → schoolgesti.com
- **Test / staging** — branche `develop` → testing.schoolgesti.com

`frontend/vercel.json` déclare les schedules cron ; Vercel les enregistre automatiquement au déploiement.

## Tests

`pnpm test` lance la suite Vitest (1449 tests, focalisée sur `lib/server/**` et les invariants critiques — pas de framework E2E en v1). `pnpm smoke:auth` vérifie le parcours auth complet contre une instance `pnpm dev` qui tourne.

## Licence

UNLICENSED — projet privé.
