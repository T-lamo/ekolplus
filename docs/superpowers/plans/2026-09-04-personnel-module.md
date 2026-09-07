# Module Personnel + connexion par nom d'utilisateur — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a unified "Personnel" module (list + fiche + création) covering teachers and admin staff, plus username-based login (no email) usable everywhere in the app, with zero regression to existing teacher/student data (a teacher's profile/matières/classes must keep rendering exactly as today).

**Architecture:** UI-level unification only — `Teacher` and `OrganizationMember` stay two separate Prisma models with all their existing invariants (multi-espaces, portal locking, RBAC). A new merged read model joins them by `userId` for the list/fiche. `User.email` becomes optional, `User.username` is added; login accepts either in one field. Initial passwords for username accounts are generated once and shown once, never emailed.

**Tech Stack:** Next.js 16 App Router, Prisma 5 / Postgres (Neon), Tailwind v4, next-intl, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-personnel-module-design.md` — every task below implements a numbered section of that spec; read it first, it has the full rationale.

Banani source HTML/CSS/theme for the 5 new screens (fetched today, flow `2oB_n5kLBeuy`) is split per-screen under `.planning/banani/fetches/personnel-module/`:
`personnel-list.html`, `personnel-fiche.html`, `ajouter-personnel.html`, `compte-cree.html`, `acces-eleve-bloc.html` (+ matching `.theme.json`). Each includes Banani's own sidebar/topbar chrome — **discard it**, the app's real shell (`SchoolSidebar`/`Topbar`) already exists; only the content region is new.

## Global Constraints

- Every new Route Handler: `export const runtime = 'nodejs'`, `requireAuth`/CSRF per existing middleware pattern (RUNTIME-01 tripwire fails CI otherwise).
- Every new `/api/school/*` route (except `accounts/*`, see Task 3) MUST call `requireSchoolPermission(userId, 'enseignants', action, requestId)` — RBAC-01 tripwire whitelist covers `accounts/*` and mirrors the existing `members/`/`roles/` exemption (role-rank gated, not grant-gated).
- No em dash in user-facing strings. French first; `_review` flag on Haitian Creole additions in `locales.test.ts`'s tolerated set.
- `frontend/src/lib/server/auth.ts` gets exactly **one** line changed (`TokenPayload.email: string | null`) — nothing else in that file. Every other protected file (`crypto.ts`, `logger.ts`, `redis.ts`, `rate-limit-store.ts`, `slug.ts`, `zod-helpers.ts`, `middleware/*`, `webhook/handler.ts`, `oauth/google.ts`, `outbox/dispatcher.ts`, `admin/audit.ts`, `observability/request-context.ts`, `instrumentation.ts`, `lib/api.ts`) is untouched.
- Mobile-first Tailwind (375px base, `md:`/`lg:` up) even though Banani shipped desktop-only mockups.
- `pnpm format && pnpm lint && pnpm typecheck && pnpm test` must pass after every task; the runtime-enforcement and RBAC-01 tripwires auto-cover new route files.
- Reuse existing primitives (`Modal`, `Field`, `Select`, `MultiSelect`, `Button`, `Card`, `Pager`, `FormStepsBar`/`WizardNav`) — do not fork them.

---

### Task 1: Data model — nullable email, username, generated password

**Files:**
- Modify: `frontend/prisma/schema.prisma` (`User` model, ~line 12-13)
- Create: `frontend/prisma/migrations/<timestamp>_user_username/migration.sql` (via `pnpm db:migrate:dev`)
- Create: `frontend/src/lib/username.ts`
- Create: `frontend/src/lib/username.test.ts`
- Create: `frontend/src/lib/server/initial-password.ts`
- Create: `frontend/src/lib/server/initial-password.test.ts`

**Interfaces:**
- Produces: `normalizeUsername(raw: string): string` (trim, lowercase), `USERNAME_REGEX = /^[a-z][a-z0-9._-]{2,29}$/`, `zUsername: z.ZodString` (`frontend/src/lib/username.ts`, pure, no `server-only`, importable client-side for the live-availability indicator).
- Produces: `generateInitialPassword(): string` (`frontend/src/lib/server/initial-password.ts`, `server-only`) — 12 chars from an alphabet excluding `0/O/1/l/I`, using `crypto.randomInt`, guaranteed at least one uppercase/lowercase/digit (retry-until-satisfied loop, not a fixed-position template — must not be guessable from length/position alone).
- Consumes (Task 3+): both helpers, plus `hashPassword` from `auth.ts` (already exported, untouched).

- [ ] **Step 1: Schema change**

```prisma
model User {
  email    String? @unique   // was String @unique — nullable for username-only accounts
  username String? @unique   // new
  ...
}
```

- [ ] **Step 2: Migrate**

Run: `pnpm db:migrate:dev --name user_username`
Expected: migration file created, applied to the dev DB, `email` column now nullable, `username` column added with a unique index.

- [ ] **Step 3: Write `username.ts` + failing tests**

```typescript
// frontend/src/lib/username.ts
import { z } from 'zod';

export const USERNAME_REGEX = /^[a-z][a-z0-9._-]{2,29}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export const zUsername = z
  .string()
  .transform(normalizeUsername)
  .refine((v) => USERNAME_REGEX.test(v), 'Invalid username');
```

Tests (`username.test.ts`): normalizes mixed case/whitespace; accepts `marie.k`, `jean_paul`, `a12`; rejects `@` (must never look like an email), rejects starting with a digit, rejects `<3` or `>30` chars, rejects uppercase after normalization check (i.e. confirms normalization ran).

- [ ] **Step 4: Run tests, confirm pass**

Run: `pnpm --filter frontend exec vitest run src/lib/username.test.ts`

- [ ] **Step 5: Write `initial-password.ts` + failing tests**

Tests (`initial-password.test.ts`): length is 12; matches `/^[A-HJ-NP-Za-hj-np-z2-9]+$/` (excludes `0OIl1`); contains at least one uppercase, one lowercase, one digit; 100 calls produce 100 distinct values (collision sanity, not a proof).

- [ ] **Step 6: Run tests, confirm pass, commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations frontend/src/lib/username.ts frontend/src/lib/username.test.ts frontend/src/lib/server/initial-password.ts frontend/src/lib/server/initial-password.test.ts
git commit -m "feat(personnel): nullable email, username field, initial-password helper"
```

---

### Task 2: Auth — login by email or username

**Files:**
- Modify: `frontend/src/lib/server/auth.ts` (ONLY `TokenPayload.email: string` → `string | null`, ~line 129-133)
- Modify: `frontend/src/app/api/auth/login/route.ts`
- Modify: `frontend/src/app/api/auth/login/route.test.ts`
- Modify: `frontend/src/app/login/page.tsx` (identifier field + submit payload)
- Modify: `frontend/src/messages/{fr,ht,en}/login.json`
- Read-only audit (do not modify unless a real null-unsafe read is found): every consumer of `auth.user.email` / decoded `TokenPayload.email` — `grep -rn "auth.user.email\|\.email\b" frontend/src/app/api frontend/src/lib/server/observability` and confirm each tolerates `null` (Sentry scope `setUser`, `GET /api/auth/me`, `withRequestContext` logging).

**Interfaces:**
- Consumes: `zUsername`, `USERNAME_REGEX` from Task 1; `hashPassword`/`verifyPassword`/`createAccessToken`/`createRefreshToken`/`setAuthCookies`/`setCsrfCookie` from `auth.ts` (unchanged signatures except the one type).
- Produces: `LoginSchema = z.object({ identifier: z.string().trim().min(1), password: z.string().min(1) })` — `email` key removed from the request body shape; `frontend/src/lib/api.ts` callers updated at the one call site in `login/page.tsx` (that file is not protected).

- [ ] **Step 1: Write failing tests in `login/route.test.ts`**

Add cases: login succeeds with a seeded username-only user (`email: null, username: 'marie.k'`) and correct password; wrong password on a username account returns `INVALID_CREDENTIALS` (not a 500 from a null email touching the rate limiter); unknown username returns the same `INVALID_CREDENTIALS` + timing as an unknown email (dummy bcrypt path); a username-only user is never blocked by `EMAIL_NOT_VERIFIED` even though `emailVerifiedAt` is null; an identifier containing `@` always takes the email path even if it also matches the username regex; JWT `email` claim is `null` for a username login (decode the returned cookie via `verifyToken`).

- [ ] **Step 2: Run, confirm new tests fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/auth/login/route.test.ts`
Expected: FAIL (route doesn't understand `identifier` yet).

- [ ] **Step 3: Implement**

In `auth.ts`, change only:

```typescript
export interface TokenPayload {
  sub: string;
  email: string | null;   // was: string
  tokenVersion: number;
}
```

In `login/route.ts`:
- `LoginSchema` gains `identifier`, drops `email`.
- Normalize: `const identifier = parsed.data.identifier.trim();`
- Branch: `const isEmailFormat = identifier.includes('@');`
- Email path: reuse `zEmail.safeParse(identifier.toLowerCase())` for format validation (invalid format → same `INVALID_CREDENTIALS`, not `VALIDATION_FAILED`, no enumeration signal), lookup `where: { email: identifier.toLowerCase() } }`.
- Username path: `zUsername.safeParse(identifier)`; on parse failure, treat as "no such user" (dummy bcrypt, `INVALID_CREDENTIALS`) rather than a distinct validation error; lookup `where: { username: normalizeUsername(identifier) } }`.
- Rate limiter / lockout: replace every `email` variable used as the limiter/lockout key with the raw `identifier` (post-normalization) — `createEmailLimiter`/`isLockedOut`/`recordFailure`/`recordSuccess` are keyed by an opaque string already, no changes needed there.
- Step 7 (`EMAIL_NOT_VERIFIED`): guard with `if (user.email && !user.emailVerifiedAt)`.
- `createAccessToken({ sub: user.id, email: user.email, tokenVersion })` — `user.email` is now `string | null`, matches the widened `TokenPayload`.
- Response body: `{ ok: true, user: { sub: user.id, email: user.email, username: user.username } }`.

In `login/page.tsx`: rename the state var and the `<Field>` to a generic identifier input (`type="text"`, `autoComplete="username"`), label/placeholder from new `Login.identifierLabel`/`Login.identifierPlaceholder` keys; POST body sends `{ identifier, password }`.

- [ ] **Step 4: Run tests, confirm pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/auth/login/route.test.ts`

- [ ] **Step 5: Update the 3 message files**

`login.json` (fr/ht/en): rename `emailLabel`/`emailPlaceholder` → `identifierLabel`/`identifierPlaceholder` (fr: "Email ou nom d'utilisateur" / "vous@ecole.com ou marie.k"), generic `errors.INVALID_CREDENTIALS` copy ("Identifiant ou mot de passe incorrect" — was "Email ou mot de passe incorrect"). Run `locales.test.ts` to confirm key-set parity across the 3 files.

- [ ] **Step 6: Manual audit of `TokenPayload.email` / `auth.user.email` consumers**

Grep, read each hit, confirm null-safe (optional chaining or already-guarded). Fix any real crash risk found (e.g. a template literal that would print `null` — cosmetic, low risk, fix inline) but do not restructure unrelated code.

- [ ] **Step 7: Full suite + commit**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
git add frontend/src/lib/server/auth.ts frontend/src/app/api/auth/login frontend/src/app/login/page.tsx frontend/src/messages/*/login.json
git commit -m "feat(auth): login by email or username in one field"
```

---

### Task 3: Backend — Personnel API (merged read model + unified creation + account management)

**Files:**
- Create: `frontend/src/lib/server/personnel/view.ts` (merged read model)
- Create: `frontend/src/lib/server/personnel/view.test.ts`
- Create: `frontend/src/app/api/school/personnel/route.ts` (GET list, POST create)
- Create: `frontend/src/app/api/school/personnel/route.test.ts`
- Create: `frontend/src/app/api/school/personnel/[id]/route.ts` (GET detail)
- Create: `frontend/src/app/api/school/personnel/[id]/route.test.ts`
- Create: `frontend/src/app/api/school/personnel/username-available/route.ts`
- Create: `frontend/src/app/api/school/personnel/username-available/route.test.ts`
- Create: `frontend/src/app/api/school/personnel/[id]/profiles/route.ts` (POST — add missing profile)
- Create: `frontend/src/app/api/school/personnel/[id]/profiles/route.test.ts`
- Create: `frontend/src/app/api/school/teachers/[id]/access/route.ts` (POST — username access for an existing teacher)
- Create: `frontend/src/app/api/school/teachers/[id]/access/route.test.ts`
- Create: `frontend/src/app/api/school/students/[id]/access/route.ts` (POST — username access for a student)
- Create: `frontend/src/app/api/school/students/[id]/access/route.test.ts`
- Create: `frontend/src/lib/server/school-accounts.ts` (`resolveSchoolAccount`)
- Create: `frontend/src/lib/server/school-accounts.test.ts`
- Create: `frontend/src/app/api/school/accounts/[userId]/route.ts` (PATCH — email/username)
- Create: `frontend/src/app/api/school/accounts/[userId]/route.test.ts`
- Create: `frontend/src/app/api/school/accounts/[userId]/reset-password/route.ts` (POST)
- Create: `frontend/src/app/api/school/accounts/[userId]/reset-password/route.test.ts`
- Modify: `frontend/src/lib/server/observability/school-permission-enforcement.test.ts` (whitelist `accounts/`)
- Read (do not modify): `frontend/src/app/api/school/members/route.ts`, `frontend/src/app/api/school/members/[userId]/route.ts`, `frontend/src/app/api/school/members/[userId]/invite/route.ts`, `frontend/src/lib/server/portal-invite.ts`, `frontend/src/app/api/school/teachers/[id]/invite/route.ts`, `frontend/src/app/api/school/students/[id]/invite/route.ts` — all reused as-is.

**Interfaces:**
- Consumes: `createPortalInvite` (email path, unchanged), `hashPassword`/`generateInitialPassword`/`zUsername`/`normalizeUsername`, `requireSchoolPermission`, `resolveMySchool`/`hasMinRole`.
- Produces: `getPersonnelList(schoolId, organizationId, opts): Promise<PersonnelRow[]>` and `getPersonnelDetail(schoolId, organizationId, id): Promise<PersonnelDetail | null>` in `personnel/view.ts` — shape:

```typescript
export interface PersonnelRow {
  id: string;              // teacher.id if a Teacher profile exists, else user.id
  userId: string | null;   // null when the teacher has no linked account yet
  name: string;
  avatarUrl: string | null;
  profiles: Array<'TEACHER' | 'ADMIN' | 'MEMBER'>; // ADMIN/MEMBER = OrganizationMember.role
  staffRoleNames: string[];
  accountStatus: 'NONE' | 'PENDING' | 'ACTIVE';
  loginMode: 'EMAIL' | 'USERNAME' | 'BOTH' | null;
}
export interface PersonnelDetail extends PersonnelRow {
  email: string | null;
  username: string | null;
  phone: string | null;
  teacher: TeacherDetail | null;       // exact shape already returned by GET /api/school/teachers/[id] — reuse that type
  organizationMember: { role: 'ADMIN' | 'MEMBER'; staffRoleIds: string[] } | null;
}
```
- `resolveSchoolAccount(userId, mySchool): Promise<{ kind: 'STAFF' | 'TEACHER_ONLY' | 'STUDENT'; requiredCheck: () => Promise<boolean> } | null>` in `school-accounts.ts` — used by both `accounts/*` routes to pick the right authorization rule (§7 of the spec).

- [ ] **Step 1: `personnel/view.ts` — write failing test first**

Test fixtures: a teacher with no `userId` (never invited) → one row, `accountStatus: 'NONE'`; a teacher invited by email, pending → `accountStatus: 'PENDING'`, `loginMode: 'EMAIL'`; an OrganizationMember-only admin (no Teacher row) → `profiles: ['ADMIN']`; a double-profile person (Teacher + OrganizationMember sharing `userId`) → **one row**, `profiles: ['TEACHER', 'MEMBER']`; a person with both `email` and `username` set → `loginMode: 'BOTH'`. Assert dedup: creating both a Teacher and an OrganizationMember for the same `userId` in the fixture must never produce two rows.

- [ ] **Step 2: Run, confirm fail**

Run: `pnpm --filter frontend exec vitest run src/lib/server/personnel/view.test.ts`

- [ ] **Step 3: Implement `personnel/view.ts`**

Query `Teacher.findMany({ where: { schoolId } })` and `OrganizationMember.findMany({ where: { organizationId }, include: { user: true, staffRoles: true } })` in parallel, merge in memory keyed by `userId` (teachers with `userId: null` never merge, they're their own row keyed by `teacher.id`). `accountStatus`: `NONE` if no `userId`; else `PENDING` if `!user.passwordHash && !user.username`; else `ACTIVE`. `loginMode`: derived from `user.email`/`user.username` presence.

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: `GET/POST /api/school/personnel` — write failing tests**

List: filters `profile=all|teacher|staff`, `q` (name/email/username substring), pagination (`page`, 20/page) — mirror the existing `students`/`teachers` list routes' pagination shape exactly. Create: each of the 3×2 combinations (teacher-only/staff-only/both profile × email/username/none login mode where applicable — "none" only valid for teacher-only); a MEMBER with `enseignants.create` but no ADMIN rank gets 403/absent-option when attempting the staff-profile checkbox (assert the route itself rejects `wantsStaffProfile: true` for a non-ADMIN caller, not just the UI hiding it); ADMIN role request from a non-OWNER caller → 403 (mirror existing `members/route.ts` rule); username collision → 409 `USERNAME_TAKEN`; email collision → 409 `EMAIL_ALREADY_IN_USE`.

- [ ] **Step 6: Run, confirm fail, implement, run, confirm pass**

`POST` body (discriminated on presence of nested objects, not a `mode` string, so the client can submit whichever blocks it filled in):

```typescript
const bodySchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: zPhone.optional(),
  teacherProfile: z.object({ matiereIds: z.array(zCuid), classIds: z.array(zCuid) }).optional(),
  staffProfile: z
    .object({ role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'), staffRoleIds: z.array(zCuid).max(50).default([]) })
    .optional(),
  login: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('none') }),
    z.object({ mode: z.literal('email'), email: zEmail }),
    z.object({ mode: z.literal('username'), username: zUsername }),
  ]),
});
```
One transaction: create `User` (if `login.mode !== 'none'` or `staffProfile` present — a staff profile always needs a `User`), create `Teacher` if `teacherProfile` present, create `OrganizationMember` + staff roles if `staffProfile` present, then apply the login mode (email → `createPortalInvite` mechanics reused; username → `passwordHash: await hashPassword(generateInitialPassword())` set directly, account active immediately, no `VerificationCode`, no outbox row). Username mode's response includes `{ temporaryPassword }` **only in that response, once**; email mode's response has no password field at all.

- [ ] **Step 7: Remaining routes — same TDD loop each**

`GET personnel/[id]`, `username-available` (checks both `User.username` collisions AND reserved-looking collisions are irrelevant — just a `findUnique`; never reveal *whose* it is, `{ available: boolean }` only), `personnel/[id]/profiles` (adds a `Teacher` or `OrganizationMember` to an existing `userId` — reuse the create logic's per-profile branches), `teachers/[id]/access` (username-only, mirrors §7 of spec: teacher must not already have a `userId`), `students/[id]/access` (same, `createOrgMembership: false`), `school-accounts.ts` + `accounts/[userId]` PATCH (email/username edits, `LAST_IDENTIFIER` 400 guard, `tokenVersion++` on username change) and `reset-password` (`ACCOUNT_HAS_EMAIL` 400 guard — refuse when `user.email != null`, generates + hashes new password, `tokenVersion++`, returns `{ temporaryPassword }` once).

- [ ] **Step 8: RBAC-01 whitelist**

Add `accounts/` to the whitelist array in `school-permission-enforcement.test.ts` (same exemption reasoning as `members/`/`roles/` — role-rank gated via `resolveSchoolAccount`, not grant-gated). Add a witness test there asserting `accounts/[userId]/route.ts` does NOT call `requireSchoolPermission` (documents the deliberate exemption, mirrors the existing witness pattern for `members/`).

- [ ] **Step 9: Full suite + commit**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
git add frontend/src/lib/server/personnel frontend/src/lib/server/school-accounts.ts frontend/src/lib/server/school-accounts.test.ts frontend/src/app/api/school/personnel frontend/src/app/api/school/teachers/\[id\]/access frontend/src/app/api/school/students/\[id\]/access frontend/src/app/api/school/accounts frontend/src/lib/server/observability/school-permission-enforcement.test.ts
git commit -m "feat(personnel): unified list/detail/creation API + account management"
```

---

### Task 4: Frontend — Personnel List (`/personnel`)

**Files:**
- Create: `frontend/src/app/(school)/personnel/page.tsx`
- Create: `frontend/src/app/(school)/personnel/PersonnelTable.tsx`
- Modify: `frontend/src/components/layout/SchoolSidebar.tsx` (rename `Enseignants` entry → `Personnel`, `href: '/enseignants'` → `/personnel`, keep `module: 'enseignants'`)
- Modify: `frontend/src/app/(school)/enseignants/page.tsx` → replace body with `redirect('/personnel')` (Next.js `redirect()` from `next/navigation`), keep the file (do not delete — old bookmarks/links must not 404)
- Modify: `frontend/src/lib/permissions.ts` — no key rename, only the **label** shown in the permission matrix / role picker (find the `enseignants` module's display string and change it to "Personnel" — check `Permissions.modules.enseignants` i18n key instead if the label is i18n-sourced, not hardcoded)
- Modify: `frontend/src/lib/route-match.ts` and `breadcrumb.test.ts` (`/enseignants` → `/personnel`, label "Personnel")
- Create/Modify: `frontend/src/messages/{fr,ht,en}/personnel.json` (new namespace)
- Modify: `frontend/src/lib/locales.ts` (`MESSAGE_NAMESPACES` — add `'personnel'`, 38th entry)

**Source:** `.planning/banani/fetches/personnel-module/personnel-list.html` + `.theme.json` (discard the sidebar/topbar markup inside the fetch, keep the toolbar + table).

**Interfaces:**
- Consumes: `GET /api/school/personnel?profile=&q=&page=` (Task 3).
- Reuses: `Pager`, `LIST_PAGE`/`TABLE_SCROLL`/`STICKY_THEAD` conventions from `students/page.tsx` or `enseignants/page.tsx` (read one of them first for the exact class names — CardGrid/list-page constants live in a shared file, grep `LIST_PAGE` to find it).

- [ ] **Step 1: Read the Banani HTML, map toolbar (segmented filter Tous/Enseignants/Personnel administratif + search) and table columns (Nom+avatar, Profils badges, Compte badge, Connexion icon, Actions ⋮) to Tailwind, per the token table in CLAUDE.md's banani skill.**

- [ ] **Step 2: Build `PersonnelTable.tsx`** — pure presentational component, props `{ rows: PersonnelRow[] }`, badge color mapping (`ACTIVE` green, `PENDING` orange, `NONE` gray — reuse existing status badge component if one exists, grep `StatusBadge`).

- [ ] **Step 3: Build `page.tsx`** — client component, fetches via `api<{ items: PersonnelRow[]; total: number }>('/api/school/personnel?...')`, filter segmented control (3 options), search input (debounced, mirror the existing Enseignants list's search debounce), `Pager`, empty state (illustration + "+ Ajouter"), `<AccessDenied />` when `!canSee('enseignants')`.

- [ ] **Step 4: Sidebar + redirect + route-match + breadcrumb**

- [ ] **Step 5: i18n** — new `personnel.json` (fr authored first, `ht`/`en` translated, `ht` gets `_review`), add to `MESSAGE_NAMESPACES`, run `locales.test.ts`.

- [ ] **Step 6: Dev-server check at 375px/768px/1280px against the Banani mockup** (per skill's mandatory verification — this session runs its own throwaway dev server on a non-3000 port, never the user's).

- [ ] **Step 7: Full suite + commit**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
git add frontend/src/app/\(school\)/personnel frontend/src/app/\(school\)/enseignants/page.tsx frontend/src/components/layout/SchoolSidebar.tsx frontend/src/lib/route-match.ts frontend/src/lib/locales.ts frontend/src/messages/*/personnel.json frontend/src/components/layout/topbar/breadcrumb.test.ts
git commit -m "feat(personnel): unified Personnel list screen — pixel parity"
```

---

### Task 5: Frontend — Personnel Fiche (`/personnel/[id]`)

**Files:**
- Create: `frontend/src/app/(school)/personnel/[id]/page.tsx`
- Create: `frontend/src/app/(school)/personnel/[id]/AccesRolesTab.tsx` (adapted from `AdministrateursTab.tsx`'s role picker — role select + `MultiSelect` staff roles)
- Create: `frontend/src/app/(school)/personnel/[id]/CompteTab.tsx` (3 states: pending/username/email-active)
- Modify: `frontend/src/app/(school)/enseignants/[id]/page.tsx` → `redirect(`/personnel/${teacherId}`)` (keep file)
- Modify: `frontend/src/lib/route-match.ts` (`/enseignants/[id]` pattern → `/personnel/[id]`)

**Source:** `.planning/banani/fetches/personnel-module/personnel-fiche.html` + `.theme.json` — the Infos/Enseignement tab layout in the Banani mockup should visually match the **existing** teacher profile page (same data); if Banani drew them differently, the existing app's layout wins for those two tabs (no regression — spec §6.3), Banani's mockup governs only Accès & rôles and Compte, which are genuinely new.

**Interfaces:**
- Consumes: `GET /api/school/personnel/[id]` (Task 3); existing `GET /api/school/teachers/[id]` for the Enseignement tab content (reuse the exact component tree from `enseignants/[id]/page.tsx`'s current Infos+Affectations tabs — extract them into shared components if not already, per the "no regression" requirement: **the fastest way to guarantee zero regression is to literally reuse the current teacher profile's Infos/Enseignement JSX**, not rebuild it from the Banani mockup).

- [ ] **Step 1: Extract the current teacher profile's "Infos" and "Assignments" tab bodies from `enseignants/[id]/page.tsx`** into two components if they aren't already isolated (`TeacherInfoTab.tsx`, `TeacherAssignmentsTab.tsx`) — pure refactor, no behavior change, run the existing teacher-profile tests after to confirm zero diff in behavior.

- [ ] **Step 2: Build the 4-tab shell in `personnel/[id]/page.tsx`** — header (avatar, name, profile badges, account status badge, "Donner un accès …" button per spec §6.3), tabs conditionally rendered: Infos + Enseignement only if `teacher != null`; Accès & rôles only if `organizationMember != null` (ADMIN+ gate, hide entirely for a MEMBER caller even if `enseignants.view` is granted — read `usePermissions()` role, not just module grant); Compte always visible to ADMIN+, else hidden.

- [ ] **Step 3: Build `AccesRolesTab.tsx`** — lift the role `Select` + staff-roles `MultiSelect` straight out of `AdministrateursTab.tsx`/`InviteMemberModal.tsx` (same props shape), wired to `PATCH /api/school/members/[userId]` (existing route, unchanged).

- [ ] **Step 4: Build `CompteTab.tsx`** three states from `personnel-fiche.html`'s Compte variants:
  - `PENDING` (email invite, not yet activated): "Renvoyer l'invitation" → `POST /api/school/members/[userId]/invite` (existing).
  - username-only (`email == null`): username shown read-only, "Réinitialiser le mot de passe" → confirm dialog (reuse `ConfirmContext`) → `POST /api/school/accounts/[userId]/reset-password` → `TemporaryPasswordPanel` (Task 7).
  - email-active: email shown, explanatory text, no reset button (spec §6.5 — admin must not bypass an existing recovery channel).

- [ ] **Step 5: redirect + route-match update**

- [ ] **Step 6: 375/768/1280 dev-server check, then real click-through**: open a real teacher's fiche in the throwaway dev server, confirm Infos + Enseignement (matières, classes) render identically to the pre-change `/enseignants/[id]` screenshot — this is the explicit no-regression check the user asked for, do not skip it.

- [ ] **Step 7: Full suite + commit**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
git add frontend/src/app/\(school\)/personnel/\[id\] frontend/src/app/\(school\)/enseignants/\[id\]/page.tsx frontend/src/lib/route-match.ts
git commit -m "feat(personnel): fiche employé — onglets adaptatifs, aucune régression enseignant"
```

---

### Task 6: Frontend — Personnel Création (`/personnel/nouveau`) + Compte Créé panel

**Files:**
- Create: `frontend/src/app/(school)/personnel/nouveau/page.tsx`
- Create: `frontend/src/components/personnel/TemporaryPasswordPanel.tsx` (shared, per spec §6.6)
- Create: `frontend/src/components/personnel/UsernameField.tsx` (input + live availability dot, debounced `GET .../username-available`)
- Modify: `frontend/src/app/(school)/settings/AdministrateursTab.tsx` — its "+ Inviter un membre" button now links to `/personnel/nouveau` instead of opening `InviteMemberModal`; the modal component stays (still used by nothing else after this — delete it and its now-dead route test in Task 9's cleanup pass, not here, to keep this task's diff focused on additive UI)

**Source:** `.planning/banani/fetches/personnel-module/ajouter-personnel.html` (3-step form) and `.planning/banani/fetches/personnel-module/compte-cree.html` (panel).

**Interfaces:**
- Consumes: `POST /api/school/personnel` (Task 3).
- Reuses: `FormStepsBar`/`WizardNav` (grep the emploi-du-temps wizard for the exact import path), the teacher form's matières/classes picker (extract from `TeacherFormModal.tsx` if not already standalone).

- [ ] **Step 1: `TemporaryPasswordPanel.tsx`** — props `{ name: string; username: string; temporaryPassword: string; onClose: () => void }`, pixel-matches `compte-cree.html` (success icon, credentials block with 2 copy buttons using `navigator.clipboard.writeText`, warning banner, close button). No network calls — purely presentational, the value is passed in and never persisted client-side beyond component state.

- [ ] **Step 2: `UsernameField.tsx`** — controlled text input, suggests `prenom.nom` from props on mount (only if the user hasn't typed yet), 400ms-debounced call to `username-available`, green check / red cross indicator, disables submit while checking or when taken.

- [ ] **Step 3: Build the 3-step page** — Step 1 Identité (prénom/nom/téléphone/email-optionnel, reuse `Field`/`PhoneInput`), Step 2 Profils (2 checkable cards; checking "Enseigne" reveals the matières/classes picker; checking "Accès de gestion" reveals role `Select` + staff roles `MultiSelect`, this card only rendered for an ADMIN+ caller), Step 3 Connexion (3 selectable cards: Pas de compte [only enabled if teacher-profile-only], Par email [requires email filled in step 1], Par nom d'utilisateur [renders `UsernameField`]).

- [ ] **Step 4: Submit** — `POST /api/school/personnel`; on `login.mode === 'username'` success, render `TemporaryPasswordPanel` with the response's `temporaryPassword`, then on close navigate to `/personnel/[id]`; on `email`/`none` success, toast + navigate directly.

- [ ] **Step 5: Wire the Administrateurs tab's button** to `router.push('/personnel/nouveau')`.

- [ ] **Step 6: 375/768/1280 dev-server check against the Banani mockup.**

- [ ] **Step 7: Full suite + commit**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
git add frontend/src/app/\(school\)/personnel/nouveau frontend/src/components/personnel frontend/src/app/\(school\)/settings/AdministrateursTab.tsx
git commit -m "feat(personnel): création unifiée + panneau compte créé — pixel parity"
```

---

### Task 7: Frontend — Fiche élève, bloc Accès

**Files:**
- Modify: `frontend/src/app/(school)/eleves/[id]/page.tsx` (the existing invite block — add the username option beside it)
- Modify: `frontend/src/messages/{fr,ht,en}/eleves.json` (extend the existing `Eleves.invite` group, don't fork a namespace — spec §9 records this as an intentional borrow)

**Source:** `.planning/banani/fetches/personnel-module/acces-eleve-bloc.html` + `.theme.json` — two states (no account: two side-by-side action cards; username account exists: status line + reset button).

**Interfaces:**
- Consumes: `POST /api/school/students/[id]/access` (Task 3), `POST /api/school/accounts/[userId]/reset-password` (Task 3), reuses `TemporaryPasswordPanel` (Task 6).

- [ ] **Step 1: Read the current invite block's JSX** (around the `tInvite`/`inviteSending` state found earlier in `eleves/[id]/page.tsx`) to slot the new card beside the existing "Envoyer l'invitation" one without disturbing it.

- [ ] **Step 2: Add the "Créer un accès par nom d'utilisateur" card** — `UsernameField` (Task 6, suggested from the student's name) + submit button → `POST students/[id]/access` → `TemporaryPasswordPanel`.

- [ ] **Step 3: Add the "compte sans email actif" state** — status line + "Réinitialiser le mot de passe" (confirm dialog → reset-password → panel), gated `eleves.edit`.

- [ ] **Step 4: 375/768/1280 dev-server check; confirm the pre-existing email-invite path (and everything else on the fiche élève — notes, présences, appréciations tabs) is visually and functionally untouched** — this is the second explicit no-regression check.

- [ ] **Step 5: Full suite + commit**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
git add "frontend/src/app/(school)/eleves/[id]/page.tsx" frontend/src/messages/*/eleves.json
git commit -m "feat(personnel): accès élève par nom d'utilisateur — bloc Accès"
```

---

### Task 8: Navigation cleanup — retire the Administrateurs tab

**Files:**
- Modify: `frontend/src/app/(school)/settings/page.tsx` (remove the `AdministrateursTab` import/render + its entry in the tabs array)
- Delete: `frontend/src/app/(school)/settings/AdministrateursTab.tsx`
- Delete: `frontend/src/app/(school)/settings/InviteMemberModal.tsx` (superseded by `/personnel/nouveau`)
- Delete or fold their `*.test.ts` files (whichever assertions are still meaningful move to `personnel` test files; duplicate ones are dropped)
- Modify: `frontend/src/messages/{fr,ht,en}/settings.json` (drop the now-orphaned `administrateurs` group only after confirming no other consumer — grep first)

- [ ] **Step 1: Grep for every remaining reference** to `AdministrateursTab`/`InviteMemberModal`/`Settings.administrateurs` before deleting anything — confirm the only references left are the ones this task removes.

- [ ] **Step 2: Remove the tab, delete the two files, fold tests, prune the orphaned i18n group.**

- [ ] **Step 3: Full suite + commit**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
git add -A frontend/src/app/\(school\)/settings frontend/src/messages
git commit -m "chore(personnel): retire the Administrateurs tab, absorbed into Personnel"
```

---

### Task 9: Final verification, seed, STATUS.md, and delivery

**Files:**
- Modify: `frontend/scripts/seed-dev-school.ts` (add one username-only staff account for manual QA)
- Modify: `frontend/CREDENTIALS.local.md` (gitignored — record the new seeded account)
- Modify: `.planning/banani/STATUS.md` (move the 5 screens to Done, note the merged-list architecture decision, mark `teachers-list.md`/`add-teacher.md`/`create-role.md`'s assignment section as superseded)

- [ ] **Step 1: Seed a username-only staff account** (e.g. `secretaire.demo`, no email, a StaffRole with a couple of grants) via the seed script, `--reset` run, credentials recorded locally.

- [ ] **Step 2: Full gate**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
```

- [ ] **Step 3: Real-browser verification (own throwaway dev server, never the user's port 3000)** — per this project's established discipline:
  1. Log in as the seeded username-only account (`secretaire.demo` + its password) — lands correctly, no `EMAIL_NOT_VERIFIED` loop.
  2. From Personnel, create a brand-new teacher with a username login — panel shows the password once, closing it does not re-show it.
  3. Log out, log back in with that new username — succeeds.
  4. From Paramètres › Profil, change that user's password — succeeds (existing self-service flow, untouched).
  5. Open an **existing, previously-seeded teacher's** fiche (`/personnel/[id]`) — confirm Infos + Enseignement show the exact same matières/classes as before this feature (the explicit no-regression bar).
  6. Open an existing student's fiche, confirm notes/présences/appréciations tabs are unaffected, and the new Accès block renders.
  7. Log in with an existing **email** account exactly as before — unaffected.
  8. 375px pass on `/personnel`, `/personnel/[id]`, `/personnel/nouveau`, the élève Accès block, and `/login`.

- [ ] **Step 4: Update STATUS.md, commit**

```bash
git add frontend/scripts/seed-dev-school.ts .planning/banani/STATUS.md
git commit -m "chore(personnel): seed username-only test account, close out Banani status"
```

- [ ] **Step 5: Report to the user** — screens fetched/implemented, files touched, the one `auth.ts` line changed, verification performed (§ above, be honest about anything not exercised — e.g. if Resend/Cloudinary aren't configured in this environment, say so rather than assume), and push `develop` (this session's established norm all along this conversation — commit-and-push after every verified slice).
