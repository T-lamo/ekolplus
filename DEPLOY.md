# Déploiement

## Topologie

Deux projets Vercel distincts, tous deux avec `frontend/` comme root directory, chacun branché sur sa propre branche Git :

| Environnement | Branche | Domaine | Base de données |
|---|---|---|---|
| Production | `main` | schoolgesti.com | Neon "prod", vide au départ, migrée à chaque déploiement |
| Test / staging | `develop` | testing.schoolgesti.com | Neon "dev/test", partagée avec `pnpm dev` en local |

Il n'y a pas d'environnement Preview séparé : chaque projet Vercel ne suit qu'une seule branche, pour éviter qu'une preview écrive dans la même base que la production.

## Build

Chaque déploiement Vercel exécute `pnpm vercel-build`, défini dans `frontend/package.json` :

```bash
prisma migrate deploy && next build && serwist build serwist.config.mjs
```

Les migrations Prisma s'appliquent donc automatiquement à chaque déploiement, avant le build Next.js. Une migration qui échoue bloque le déploiement (le site reste sur la version précédente) plutôt que de démarrer avec un schéma incohérent.

## Variables d'environnement

Référence complète, groupée et commentée : [.env.example](.env.example) à la racine (validé au démarrage par un schéma zod, `frontend/src/lib/server/env.ts` — l'app refuse de démarrer si une variable requise manque ou est mal formée).

À minima pour un déploiement fonctionnel : `DATABASE_URL` (URL `-pooler` Neon), `DIRECT_URL` (URL directe, requise pour les migrations), `JWT_SECRET`, `CRON_SECRET`. Les groupes optionnels (Stripe, Cloudinary, Resend, Google OAuth, Sentry, Upstash) rendent leurs fonctionnalités respectives inertes (404/503) plutôt que de bloquer le démarrage quand ils sont absents.

`APP_URL` peut rester vide sur Vercel : `VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL` sont utilisées automatiquement.

Chaque variable est à dupliquer dans les réglages du projet Vercel correspondant (Production utilise ses propres clés live, Test/staging ses clés de test) — notamment `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_ID_PRO*`, qui sont partitionnées entre mode test et mode live et ne doivent jamais être mélangées entre les deux projets.

## Base de données (Neon)

- `DATABASE_URL` : connexion via le pooler PgBouncer (`?pgbouncer=true&connection_limit=1&pool_timeout=15&sslmode=require`) — `connection_limit=1` est nécessaire en serverless, chaque instance de fonction ouvrant son propre pool.
- `DIRECT_URL` : connexion directe (non poolée), utilisée uniquement par `prisma migrate deploy` au moment du build.
- Migrer manuellement si besoin : `pnpm db:migrate:deploy` (depuis un poste ayant les deux URL en variables d'environnement).
- Statut des migrations : `pnpm db:migrate:status`.

## Cron (Vercel Cron)

Déclarés dans `frontend/vercel.json`, enregistrés automatiquement par Vercel à chaque déploiement :

| Route | Fréquence |
|---|---|
| `/api/cron/outbox-drain` | chaque minute |
| `/api/cron/email-queue-drain` | chaque minute |
| `/api/cron/verification-cleanup` | toutes les heures |
| `/api/cron/order-expiration` | toutes les 5 min |
| `/api/cron/webhook-log-purge` | quotidien, minuit |
| `/api/cron/email-job-purge` | quotidien, minuit |
| `/api/cron/fee-reminders` | quotidien, 06:00 |
| `/api/cron/stripe-sync` | quotidien, 03:00 |

Chaque route vérifie `Authorization: Bearer ${CRON_SECRET}` — un appel sans ce jeton (ou avec le mauvais) est refusé, ce qui empêche un déclenchement manuel non autorisé.

## Webhook Stripe

Après création du endpoint dans le Dashboard Stripe (`https://<domaine>/api/webhooks/stripe`), enregistrer les événements suivants et copier le secret de signature dans `STRIPE_WEBHOOK_SECRET` du projet Vercel concerné :

`checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`

En local, `stripe listen --forward-to localhost:3000/api/webhooks/stripe` imprime un secret `whsec_…` équivalent pour le développement.

## Bootstrap du premier compte SUPERADMIN

Une fois la base migrée et un premier compte inscrit et vérifié sur l'environnement cible :

```bash
pnpm db:make-superadmin vous@example.com
```

Idempotent — relancer sur un compte déjà SUPERADMIN ne fait rien. La promotion est journalisée (`AdminAction`, action `BOOTSTRAP_SUPERADMIN`).

## Sondes de disponibilité

`GET /api/health` et `GET /api/readyz` répondent sans authentification — utilisables pour un contrôle de santé externe (uptime monitor, load balancer) indépendant de Vercel.

## Rollback

Vercel conserve chaque déploiement précédent : un rollback applicatif se fait depuis le Dashboard Vercel (« Instant Rollback ») sans repasser par Git. Attention : un rollback ne défait pas une migration Prisma déjà appliquée — une migration qui modifie le schéma de façon incompatible avec la version précédente du code doit être pensée rétro-compatible (ajout de colonne nullable, jamais de suppression destructive dans le même déploiement qu'un rollback possible).

## Observabilité

Sentry (`@sentry/nextjs`) s'initialise dans `frontend/instrumentation.ts` — sans DSN configuré, no-op silencieux. `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` (CI uniquement) permettent l'upload des source maps pour des stack traces symbolisées.
