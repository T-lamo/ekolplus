# Create School — Banani → Next.js 16

## Source
- Banani screen ID: `iAq5FwOgzwir`
- Fetched: 2026-08-11

## Scope decision (confirmed with user)
Real screen is a 3-step wizard (Informations → Plan & Accès/Stripe → Confirmation+credentials), all rendered as one long scrolling page behind a decorative step-bar (not a real client-side wizard — Banani ships one static mockup). **V1 builds Section 1 only**: École info + Administrateur responsable. Plan/coupon/trial/subdomain (Section 3 "Plan d'abonnement", "Options supplémentaires", the right-column "Récapitulatif"/"Identifiants générés" summary) are dropped — they depend on Stripe billing, which isn't built yet (locked decision #3, deferred to the Epic 2 remainder pass). Showing that UI now, unwired, would be a dead end for the user. The step-bar is dropped too — showing "Plan & Accès"/"Confirmation" as pending steps that go nowhere is misleading.

**Layout deviation from Banani**: source uses a 2-column grid (`1fr 320px` — form left, sticky summary right). V1 drops the right column entirely (it only held Plan/Confirmation content) and uses a single column. Documented here per "translate, don't paste" — the two-column layout only existed to host content this pass isn't building.

**Subdomain-per-school** (`etoiles.ekolsuite.com`): out of scope entirely for this project at this stage — no wildcard-DNS/subdomain-routing infra exists in the starter, and it wasn't part of any locked architecture decision. Schools stay path-scoped (`Organization.slug`), consistent with the rest of the starter.

## System answers (Step 0)
1. **Route**: `/admin/schools/new`, gated to `User.role >= ADMIN` (EkolPlus platform staff — Thomas persona). First real consumer of the SaaS admin shell (dark sidebar).
2. **Data written**: `POST /api/admin/schools` (new route) — creates `Organization` + `School` (new model) + owner `User` (or reuses an existing one by email) + `OrganizationMember(role=OWNER)`, in one transaction, plus `logAdminAction`.
3. **Navigation**: success → for now, show the generated temp password inline (toast/panel) and redirect to `/admin` (Schools Management list, `/admin/schools`, doesn't exist yet either — another `TODO(epic-2-remainder)`). Cancel/"Retour aux écoles" → same fallback.
4. **Reused components**: `Card`, `Field`, `Button` (Epic 0). New: `Select` (native `<select>` styled to match `.form-select` — first real consumer, small enough not to need a headless-UI dependency).
5. **Empty/loading/error states**: submit disabled + loading while in flight; inline error banner on failure (email-already-owner-of-another-school is NOT an error — see backend logic); field-level required-validation via native HTML5 + a top summary of missing fields on submit attempt.

## Backend design
- **`School` model** (new, 1:1 `Organization` via `organizationId @unique`): `name`, `shortName?`, `country`, `city`, `schoolType`, `primaryLanguage?`, `address?`, `phone?`, `estimatedStudents?`. Free-form strings for `country`/`schoolType`/`primaryLanguage` for now — no enum catalog exists yet (Banani shows a flag-emoji country picker and a handful of school types; not worth hard-coding an enum from a single mockup, revisit when Epic 3's School Settings needs the same picker).
- **Owner provisioning**: look up `User` by the submitted email first.
  - **Exists** → just add an `OrganizationMember(role=OWNER)` row for them on the new org (a person can legitimately run multiple schools). No password generated, no credentials to show.
  - **Doesn't exist** → create the `User` (name = `${firstName} ${lastName}`, `emailVerifiedAt` = now — admin-provisioned accounts skip the email-verify loop that self-signup requires), generate a random temp password, hash it with the existing `hashPassword` from `auth.ts`, return the plaintext temp password **once**, in the response only (never stored in plaintext, never logged).
  - **Not implemented this pass**: forced password-change-on-first-login (Banani's "L'administrateur devra changer son mot de passe" note) and "send credentials by email" — both are real features, deliberately deferred rather than half-built (would need a `mustChangePassword` flag threaded through login and a new email template). Noted as a follow-up in STATUS.md.
- **Slug**: `ensureUniqueSlug(slugify(schoolName), ...)` from the existing (protected) `slug.ts` helper — exactly what it's for.
- **Auth gate**: `requireAdmin('ADMIN')` — Schools management is a Clients-section action, not SUPERADMIN-only.
- **Side effect needed elsewhere**: `/api/auth/me` doesn't currently return `role`. Extended it (additive, non-breaking) so the frontend can gate `/admin/*` — this route was never in the protected list.

## Component breakdown
- **REUSE** `Card`, `Field`, `Button` (Epic 0)
- **NEW** `Select` (`src/components/ui/Select.tsx`) — native select styled to match `.form-select`, first real consumer (rule-of-three doesn't block a primitive when the alternative is inlining the same markup 3 times in one form — `Pays`, `Type d'établissement`, `Langue principale`, `Rôle` are 4 immediate uses)
- **NEW, page-local** `AdminSidebar`/`AdminTopbar` (`src/components/layout/`) — spec from `epic-0-shell.md`, first real consumer
- **NEW** `src/app/admin/layout.tsx` — wraps all `/admin/*` routes, client-side gated via a new `useAdminUser()` hook (mirrors `useUser()` in `AuthContext.tsx`, redirects non-admins to `/login`)

## Token mapping
Standard Epic 0 tokens. Section-card icon backgrounds use two ad-hoc colors from the source (`--secondary`/`--primary` for the school icon, `#e0f0ff`/`#2563eb` for the admin icon) — kept as inline arbitrary values, not worth new tokens for a two-off.

## Responsive plan
- **Base (375px)**: single column (already true even at desktop for V1's simplified layout). Form rows (`Pays`/`Ville`, `Prénom`/`Nom`, etc.) stack to one field per row below `sm`.
- **sm (640px)**: two-field rows start (matches `.form-row`'s 2-col grid).
- **lg (1024px+)**: admin shell sidebar becomes persistent (per `epic-0-shell.md`'s shared responsive plan — off-canvas below `lg`).
- Touch targets ≥48px on all inputs/selects/buttons on mobile.

## Interactions / state
- All fields controlled React state, single flat form object.
- Submit: client-side required-field check (mirrors the `*` markers) → `POST /api/admin/schools` → on success, show temp password (if any) in an inline `Card` with a copy button, since there's no email-send yet.
- Logo upload: **not wired this pass** — `FileUpload`/Cloudinary integration for school logos is a real feature (needs a target field on `School`, e.g. `logoUrl`), left as a disabled-looking upload zone matching the design with a `TODO` — wiring it now would duplicate the existing `/api/upload` flow for a field that doesn't do anything with the result yet (no school exists to attach it to before submit).

## Copy / i18n
French strings added to `constants.ts` under `ADMIN_CREATE_SCHOOL`.

## Implementation checklist
- [ ] `School` Prisma model + migration
- [ ] `/api/auth/me` returns `role`; `AuthContext.User` + `useAdminUser()` extended
- [ ] `POST /api/admin/schools` route
- [ ] `Select` primitive
- [ ] `AdminSidebar`/`AdminTopbar` + `src/app/admin/layout.tsx`
- [ ] `/admin/schools/new` page — mobile-first
- [ ] 375px / 640px / 1024px checks
- [ ] Touch targets ≥48px
- [ ] `pnpm format && pnpm lint && pnpm typecheck && pnpm build && pnpm test`, dev server check
