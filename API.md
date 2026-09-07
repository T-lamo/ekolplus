# Référence API

Toutes les routes sont des Route Handlers Next.js sous `frontend/src/app/api/`, exécutées en runtime Node.js (`export const runtime = 'nodejs'` sur chacune). Aucun serveur séparé : ce document reflète l'arborescence réelle du dossier `api/`.

## Conventions

**Base URL** : `http://localhost:3000` en dev · `https://testing.schoolgesti.com` (staging) · `https://schoolgesti.com` (prod)

**Authentification** — cookies `httpOnly` posés par `/api/auth/login` ou `/api/auth/verify-email` :
- jeton d'accès (15 min), jeton de rafraîchissement (7 j, scopé à `/api/auth`), jeton CSRF (7 j)
- toute requête de mutation doit échoer l'en-tête `x-csrf-token` avec la valeur du cookie `<préfixe>-csrf`
- un 401 déclenche un rafraîchissement automatique côté client (`frontend/src/lib/api.ts`), à verrou unique

**Format des réponses** — `NextResponse.json(...)` uniquement, jamais de HTML. Les erreurs renvoient un code stable dans le corps (ex. `{ "error": "PERMISSION_DENIED" }`) : le frontend distingue les cas sur ce code, jamais sur le message.

**Autorisation** — chaque route applique une des middleware HOF (`requireAuth`, `requireAdmin`, `requireSuperadmin`, `requireOrgRole`, `requireSchoolPermission`, `requireStudent`) avant tout accès aux données ; une école ou un droit absent renvoie 404 (jamais 403) pour ne pas révéler l'existence d'une ressource à qui n'y a pas droit.

---

## Auth — `/api/auth`

| Route | Description |
|---|---|
| `POST /signup` | Inscription (réponse identique que l'email existe déjà ou non) |
| `POST /verify-email` | Consomme le code reçu par email, ouvre la session |
| `POST /login` | Connexion (email ou nom d'utilisateur) |
| `POST /logout` | Invalide la session courante |
| `POST /refresh`, `POST /refresh-and-return` | Renouvellement du jeton d'accès |
| `GET /me` | Identité courante, rôle, espaces actifs (`spaces`) |
| `POST /change-password`, `POST /set-password` | Gestion du mot de passe |
| `POST /forgot-password`, `POST /reset-password` | Réinitialisation par email |
| `POST /resend-verification` | Renvoi du code de vérification |
| `POST /student-invite/accept`, `POST /teacher-invite/accept` | Activation d'un compte élève/enseignant invité |
| `GET/POST /oauth/google/start`, `/oauth/google/callback` | Connexion avec Google (OAuth 2.0 + PKCE) |
| `POST /withdrawal-pin` | Hérité du starter, non utilisé par SchoolGesti |

## École — `/api/school`

Toutes protégées par `requireSchoolPermission(module, action)` (staff de l'école courante uniquement).

**Élèves & tuteurs** — `students`, `students/[id]`, `students/[id]/access`, `students/[id]/invite`, `students/[id]/documents`, `students/[id]/documents/[type]/file`, `students/[id]/goals`, `students/[id]/results`, `students/[id]/attendance`, `students/[id]/appreciations`, `students/[id]/bulletin`, `students/[id]/bulletin/pdf`, `students/[id]/bulletins`

**Enseignants** — `teachers`, `teachers/[id]`, `teachers/[id]/access`, `teachers/[id]/invite`, `teachers/[id]/send-whatsapp`

**Personnel (comptes staff, avec ou sans email)** — `personnel`, `personnel/[id]`, `personnel/[id]/profiles`, `personnel/username-available`

**Classes & niveaux** — `classes`, `classes/[id]`, `classes/[id]/appreciations`, `classes/[id]/bulletins`, `classes/[id]/notebook`, `grade-levels`, `grade-levels/[id]`, `grade-levels/reorder`, `rooms`, `rooms/[id]`

**Matières** — `subjects`, `subjects/[id]`, `subjects/[id]/chapters`, `subjects/[id]/chapters/[chapterId]`, `subjects/[id]/chapters/reorder`, `subjects/[id]/criteria`, `subjects/[id]/criteria/[criterionId]`, `subjects/[id]/criteria/reorder`

**Notes & évaluations** — `class-subjects`, `class-subjects/[id]`, `class-subjects/[id]/notebook`, `class-subjects/[id]/criteria-assessment`, `evaluations`, `evaluations/[id]`, `evaluations/[id]/grades`

**Présences** — `attendance`, `attendance/stats`

**Emploi du temps** — `timetable`, `timetable/[id]`

**Bulletins** — `bulletin-templates`, `bulletin-templates/[id]`, `bulletin-templates/[id]/fork`, `bulletin-templates/[id]/preview-pdf`

**Scolarité (frais & paiements)** — `fees/overview`, `fees/payments`, `fees/structures`, `fees/structures/[classId]`, `fees/structures/[classId]/copy-from`, `fees/disputes`, `fees/disputes/[id]`, `fees/overdue`, `fees/automation-settings`, `fees/students/[id]/history`, `fees/students/[id]/send-whatsapp`

**Rôles & permissions** — `roles`, `roles/[id]`, `members`, `members/[userId]`, `members/[userId]/invite`

**Comptes** — `accounts/[userId]`, `accounts/[userId]/reset-password`

**Établissement & année scolaire** — `academic-year`, `academic-year-rollover`, `academic-year-rollover/confirm`, `terms`, `terms/[id]`, `reset-year`

**Facturation** — `billing`, `billing/plan`, `billing/checkout`, `billing/portal`, `billing/subscription`

**Autres** — `dashboard`, `activity`, `export`

## Portail enseignant — `/api/teacher`

Lecture/écriture scopée aux classes et matières de l'enseignant courant (`resolveMyTeacherProfile()`).

`me`, `students`, `students/[id]`, `students/[id]/appreciations`, `classes/[classSubjectId]`, `classes/homeroom/[classId]`, `class-subjects/[id]/notebook`, `class-subjects/[id]/criteria-assessment`, `evaluations`, `evaluations/[id]`, `evaluations/[id]/grades`, `appreciations`

## Portail élève — `/api/student`

Lecture seule, jamais de `studentId` en paramètre (résolu depuis la session) ; ne renvoie jamais un brouillon, un classement de classe ou les notes internes d'un enseignant.

`me`, `results`, `attendance`, `appreciations`, `bulletins`, `bulletin`, `bulletin/pdf`, `timetable`, `criteria-assessments`

## Back-office — `/api/admin`

Réservé aux rôles `ADMIN`/`SUPERADMIN` applicatifs ; toute mutation est journalisée (`AdminAction`).

`me`, `users`, `users/[id]`, `users/[id]/role`, `users/[id]/status`, `schools`, `schools/[id]`, `audit-log`, `stats/overview`, `stats/detailed`, `system/settings`, `email-queue`, `outbox`, `rate-limits`, `billing/subscriptions`, `billing/subscriptions/[id]`, `billing/coupons`, `billing/coupons/[id]`, `billing/transactions`, `billing/transactions/[id]/refund`, `orders`, `withdrawals`, `withdrawals/[id]/cancel`

## Cron — `/api/cron`

Déclenchées par Vercel Cron, protégées par `Authorization: Bearer ${CRON_SECRET}`.

| Route | Fréquence | Rôle |
|---|---|---|
| `outbox-drain` | 1 min | Vide la file d'événements outbox (emails, notifications) |
| `email-queue-drain` | 1 min | Envoie les emails en attente |
| `verification-cleanup` | horaire | Purge les codes de vérification expirés |
| `fee-reminders` | quotidien 06:00 | Relances de frais impayés |
| `stripe-sync` | quotidien 03:00 | Réaligne chaque abonnement Stripe sur l'effectif réel |
| `webhook-log-purge`, `email-job-purge` | quotidien | Purge des journaux |
| `order-expiration` | 5 min | Hérité du starter, non utilisé par SchoolGesti |

## Webhooks — `/api/webhooks`

`stripe` (facturation SaaS, source de vérité pour les abonnements) · `bictorys` (hérité du starter, non branché à un flux SchoolGesti)

## Divers

`GET /health`, `GET /readyz` — sondes de disponibilité · `POST /upload` — upload Cloudinary (503 si non configuré) · `GET/POST /notifications`, `GET /notifications/count`, `/notifications/prefs` · `POST /demo-requests` — formulaire public de demande de démo · `GET/POST /orders`, `/withdrawals`, `GET /pay-redirect` — surfaces héritées du starter, non utilisées par SchoolGesti (voir [PRUNING.md](PRUNING.md))
