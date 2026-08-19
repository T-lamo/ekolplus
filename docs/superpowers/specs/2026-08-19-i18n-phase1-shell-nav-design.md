# i18n Phase 1 — Shell & Navigation + Auth Pages + Dashboards — Design Spec

## Problem

Phase 0 shipped the `next-intl` infrastructure (locale registry, `sg-locale`
cookie, `User.locale`, `LocaleProvider`, message-file convention, typed
translation keys) and translated exactly one screen — `/login` — to prove
the pattern. Every other screen still reads hardcoded French, either from
inline JSX strings or from `frontend/src/lib/constants.ts`.

Per Phase 0's spec (`2026-08-19-i18n-infrastructure-design.md`, "Rollout
notes"), Phase 1 is the highest-traffic surface after login itself: the
app shell (sidebars, topbar, shared navigation chrome), the three
remaining auth pages (forgot-password, reset-password, verify-email — the
pilot's siblings, explicitly deferred in Phase 0 because they still
depended on `AUTH_LOGIN`), and the two dashboards (school + admin).

## Scope (this spec)

**In scope — full file/component list:**

*Shell & navigation (16 files, ~235 strings):*
- `frontend/src/components/layout/SchoolSidebar.tsx`
- `frontend/src/components/layout/AdminSidebar.tsx`
- `frontend/src/components/layout/SchoolTopbar.tsx`
- `frontend/src/components/layout/AdminTopbar.tsx`
- `frontend/src/components/layout/sidebar/{Sidebar,SidebarItem,SidebarSection,SidebarUserProfile,SidebarCollapseToggle}.tsx`
- `frontend/src/components/layout/topbar/{Breadcrumbs,CommandPalette,NotificationsMenu,HelpMenu,AcademicYearBadge}.tsx`
- `frontend/src/components/layout/mobile/MobileBottomNav.tsx`

*Auth pages (3 files, ~50 strings, siblings of the `/login` pilot):*
- `frontend/src/app/forgot-password/page.tsx`
- `frontend/src/app/reset-password/page.tsx`
- `frontend/src/app/verify-email/page.tsx`

*Dashboards (3 files, ~114 strings):*
- `frontend/src/app/(school)/dashboard/page.tsx`
- `frontend/src/app/(school)/dashboard/activites/page.tsx`
- `frontend/src/app/admin/page.tsx` (the admin dashboard — no separate
  `/admin/dashboard` route exists)

**Explicitly out of scope (future phases per the Phase 0 roadmap):**
Paramètres tabs beyond Apparence/Langue, the Pédagogie module, Scolarité/
Élèves/Enseignants, the rest of `/admin/*` (users, orders, withdrawals,
billing, system settings, audit log), server-side error-message
normalization for the ~100 other API routes not touched by this phase's
pages, the landing page (and its static-rendering question), bulletin
PDFs, and Resend emails.

## Decisions carried from user sign-off (this phase)

- **Shell scope is the full subsystem**, not just the 4 top-level files —
  a translated sidebar with an untranslated `Breadcrumbs`/
  `NotificationsMenu`/`MobileBottomNav` reads as broken, not "not yet
  done."
- **French register: vouvoiement throughout**, no exceptions. This also
  retroactively fixes `/login`'s Phase-0 copy, which mixed "vous"
  (headline/subline) and "tu" (error messages) — `fr/login.json`'s error
  strings get corrected to "vous" as part of this phase's message-file
  work, even though `/login`'s code isn't otherwise touched.
- **Message-namespace registry hardening lands first**, as this phase's
  Task 1, before the namespace count triples from 2 to 12.
- **`constants.ts` dead-code cleanup**: `AUTH_LOGIN`, `AUTH_FORGOT_PASSWORD`,
  `AUTH_RESET_PASSWORD`, `AUTH_VERIFY_EMAIL`, `DASHBOARD`, `ADMIN_DASHBOARD`
  are deleted from `constants.ts` once their last importer is migrated —
  confirmed via `grep` immediately before deletion, not assumed.

## Current state (as found)

- Shell/nav files: zero `constants.ts` imports — every string is inline
  JSX. Zero `useTranslations`/`getTranslations` usage anywhere in this
  phase's file set (confirmed by grep against all candidate files).
- The 3 auth pages already import `AUTH_LOGIN.headline`/`.subline`
  (kept alive by Phase 0's explicit "don't touch" constraint) plus their
  own page-specific constant (`AUTH_FORGOT_PASSWORD`, `AUTH_RESET_PASSWORD`,
  `AUTH_VERIFY_EMAIL`).
- Error-handling shape varies across the 3 auth pages — this is a real
  finding, not just migration mechanics:
  - `forgot-password`: single `if (err.code === 'TOO_MANY_FORGOT_ATTEMPTS')`
    check, falls through to `.errors.default` / `.errors.network` — same
    shape `/login` already has (a simple if/else chain, not yet a switch
    either — Phase 0 converted `/login`'s to an explicit switch; this
    phase does the same for all three auth pages).
  - `reset-password`: **dynamic key lookup** — `err.code in
    AUTH_RESET_PASSWORD.errors` — covering 6 codes
    (`VERIFICATION_CODE_INVALID`, `VERIFICATION_CODE_EXPIRED`,
    `TOO_MANY_RESET_ATTEMPTS`, `PASSWORD_BANNED`, `PASSWORD_TOO_SHORT`,
    `PASSWORD_PWNED`).
  - `verify-email`: **two handlers**. `onVerify` uses the same dynamic
    lookup as reset-password (3 codes:
    `VERIFICATION_CODE_INVALID`/`VERIFICATION_CODE_EXPIRED`/
    `TOO_MANY_VERIFY_ATTEMPTS`). `onSetPassword` special-cases
    `PASSWORD_ALREADY_SET` (silently advances to `done`) and otherwise
    falls back to **raw `err.message` from the API response** — not a
    constants.ts-sourced string at all.
- Dashboards: cleanly constants-driven (`DASHBOARD`, `ADMIN_DASHBOARD`),
  no stray inline strings found outside those objects.
- The message-namespace registry (Phase 0's final review, Minor #3) is
  hand-maintained in 3 places: the `Promise.all([import(...)])` list in
  `src/i18n/request.ts`, the `Messages` interface in
  `src/types/next-intl.d.ts`, and the `namespaces` array in
  `src/lib/locales.test.ts`. Only the last one is actually fixed by this
  phase (see below) — the other two structurally need an explicit,
  static list for Next.js's bundler and TypeScript's type system, so they
  keep their explicit lists, just verified against reality by the
  hardened test.

## Architecture (unchanged from Phase 0 — this phase adds no new infrastructure)

Same `next-intl` "without routing" pattern: `sg-locale` cookie →
`Accept-Language` → French, resolved in `src/i18n/request.ts`,
`useTranslations`/`getTranslations` calls per component, message files
under `src/messages/{fr,ht,en}/<namespace>.json`, typed keys via
`AppConfig` augmentation in `src/types/next-intl.d.ts`.

**Namespace inventory (10 new, bringing the total to 12):**

| Namespace | Covers |
|---|---|
| `Shell` | The 12 shared subcomponents (Breadcrumbs, CommandPalette, NotificationsMenu, HelpMenu, SidebarUserProfile, SidebarCollapseToggle, MobileBottomNav, AcademicYearBadge) — cross-cutting, used by both school and admin shells |
| `SchoolSidebar` | `SchoolSidebar.tsx` only |
| `AdminSidebar` | `AdminSidebar.tsx` only |
| `SchoolTopbar` | `SchoolTopbar.tsx` only |
| `AdminTopbar` | `AdminTopbar.tsx` only |
| `ForgotPassword` | `forgot-password/page.tsx` (replaces `AUTH_FORGOT_PASSWORD`) |
| `ResetPassword` | `reset-password/page.tsx` (replaces `AUTH_RESET_PASSWORD`) |
| `VerifyEmail` | `verify-email/page.tsx` (replaces `AUTH_VERIFY_EMAIL`) |
| `Dashboard` | `(school)/dashboard/page.tsx` + `activites/page.tsx` (replaces `DASHBOARD`) |
| `AdminDashboard` | `admin/page.tsx` (replaces `ADMIN_DASHBOARD`) |

`Sidebar.tsx`/`SidebarItem.tsx`/`SidebarSection.tsx` (the generic,
reusable primitives with no French text of their own — they render
children/props passed in by `SchoolSidebar`/`AdminSidebar`) need no
namespace; confirm during implementation that they're genuinely prop-driven
with zero inline copy before skipping them.

**Error-handling normalization (all 3 auth pages, matching `/login`'s
Phase-0 precedent):**

Every dynamic `err.code in X.errors` lookup and the raw-`err.message`
fallback becomes an explicit `switch (err.code)` with static literal
`t('errors.CODE')` calls per case, a `default` case falling to
`tCommon('errors.generic')`, and a separate non-`ApiError` branch falling
to `tCommon('errors.network')` — identical shape to `/login`'s Task-11
pattern. This is not optional stylistic conformity: a dynamic
`t(\`errors.${code}\`)` bypasses next-intl's compile-time typed-key
checking, which is the entire reason Phase 0 chose the explicit-switch
pattern over the dynamic one already in use here. `verify-email`'s
`onSetPassword` gains a real `default` case (translated) instead of
surfacing raw, always-French `err.message` text in an EN/HT UI — this
closes a pre-existing translation gap, not just a refactor.

**Message-namespace registry hardening (Task 1, before any namespace is
added):**

Extend `src/lib/locales.test.ts`'s consistency guard: directory-scan
`src/messages/fr/` (via `fs.readdirSync`) to get the canonical namespace
list, then assert (a) every namespace file exists in `ht/` and `en/` too
— generalizing the existing hardcoded 2-namespace check to however many
exist — and (b) the directory-derived list matches a single new exported
`MESSAGE_NAMESPACES` constant in `src/lib/locales.ts`, which
`src/i18n/request.ts`'s import list and `src/types/next-intl.d.ts`'s
`Messages` interface are both written to satisfy explicitly (kept as
static, explicit lists there — required for Next.js's bundler and
TypeScript's structural typing — but now cross-checked against disk
reality by the test, so a forgotten namespace fails `pnpm test` loudly
instead of throwing a 500 at request time for non-French users).

## Data flow

Unchanged from Phase 0 — no new data flow. Every migrated component reads
translations via `useTranslations(namespace)` (client) or
`getTranslations(namespace)` (server), same as `/login`.

## Testing plan

- `locales.test.ts`'s directory-scan hardening (above) covers all 12
  namespaces automatically — no per-namespace test code needed going
  forward.
- Per-page/component: no new unit-test surface beyond what Phase 0
  established (no dedicated component tests existed before, matching the
  `ThemePicker`/`LanguagePicker` precedent) — translation correctness is
  verified via the same E2E + Lighthouse pattern Phase 0 used for
  `/login`, extended to cover this phase's pages. Exact script scope
  (which pages, which viewport/locale combinations) is a plan-level
  decision, not a spec-level one — Phase 0's Task 12 script is the
  template to extend.
- `pnpm test`'s full-suite pass count will grow by the new namespace
  files' worth of consistency-check assertions; no other test file needs
  editing.

## Rollout notes

No change to Phase 0's roadmap numbering — this spec implements item 1
("Shell & navigation") from `2026-08-19-i18n-infrastructure-design.md`'s
Rollout notes exactly as scoped there (sidebars, topbar, the 3 auth-page
siblings, dashboard were always one item, not split across phases). This
spec adds detail Phase 0 didn't need to work out yet: the full shell
subsystem's actual file list, the `constants.ts` cleanup this phase's
completion unlocks (deleting `AUTH_LOGIN` requires all of its consumers —
including the 3 auth pages — to be migrated first, which only happens
now), and the auth pages' error-handling inconsistencies discovered while
scoping. Remaining future phases (Paramètres tabs, Pédagogie, Scolarité,
admin back-office, server message normalization, landing page, bulletin
PDFs) are unchanged and still each get their own brainstorm → spec → plan
cycle.
