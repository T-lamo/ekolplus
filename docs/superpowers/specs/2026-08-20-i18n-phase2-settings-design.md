# i18n Phase 2 — Paramètres (Settings) Tabs — Design Spec

## Problem

Phase 1 (shipped: shell/nav, the 3 auth-page siblings, both dashboards,
`SidebarPlanCard`) closed out Phase 1 of the i18n rollout. Per the Phase 0
roadmap, the next highest-traffic surface is `/settings` — the tabbed
Paramètres screen every school-owner/admin account touches to manage their
profile, school record, academic year, admin roster, and notification
preferences.

CLAUDE.md's Internationalisation paragraph currently describes this area as
"Paramètres tabs beyond Apparence/Langue" — implying Apparence and Langue
are already done. Direct inspection for this phase found that's inaccurate:
`ApparenceTab.tsx` and `LangueTab.tsx` are both still fully French-hardcoded
(the former via `constants.ts`'s `APPEARANCE` object, the latter via inline
JSX strings). This spec corrects that gap alongside the roadmap's originally
intended scope.

## Scope (this spec)

**In scope — full file list (9 files):**

- `frontend/src/app/(school)/settings/page.tsx` — the tab shell/router
- `frontend/src/app/(school)/settings/ProfilTab.tsx`
- `frontend/src/app/(school)/settings/ApparenceTab.tsx`
- `frontend/src/app/(school)/settings/LangueTab.tsx`
- `frontend/src/app/(school)/settings/EtablissementTab.tsx`
- `frontend/src/app/(school)/settings/AnneeScolaireTab.tsx`
- `frontend/src/app/(school)/settings/AdministrateursTab.tsx`
- `frontend/src/app/(school)/settings/NotificationsTab.tsx`
- `frontend/src/app/(school)/settings/ZoneDangereuseSection.tsx` (nested
  inside the Établissement tab's render, gated on `myRole === 'OWNER'` —
  not a standalone `TABS` entry, but a full section with its own two
  confirmation modals)

**Explicitly out of scope (deferred to their own future phases):**

- `frontend/src/app/(school)/settings/nouvelle-annee/**` — the year-end
  rollover wizard (7 files, ~1870 lines including business logic and its
  own unit tests). Functionally distinct from the tabs above; gets its own
  brainstorm → spec → plan cycle.
- `frontend/src/app/admin/system/settings/page.tsx` (605 lines,
  superadmin-only) — deferred to the future "Admin back-office" phase,
  alongside the other 7 not-yet-migrated `/admin/*` pages.

## Decisions carried from user sign-off (this phase)

- **Apparence + Langue are folded into this phase**, correcting the
  roadmap's inaccurate "already done" implication. Both files are small
  (18 and 20 lines) and their translation work is self-contained.
- **Vouvoiement throughout**, no exceptions — same standing convention as
  every prior phase. This phase's files carry more tutoiement violations
  than any prior phase (see "Current state" below); all get corrected as
  part of the message-file work, even in files whose surrounding code
  isn't otherwise touched.
- **Shared, cross-phase constants are fenced off, not migrated** — where a
  constant in `constants.ts` is consumed by both an in-scope file here and
  a file that belongs to a deferred phase, the constant stays in
  `constants.ts` untouched (still French) and the in-scope component
  consumes it as-is. This mirrors the `ADMIN_SAAS` carve-out from Phase 1c.
  See "Cross-dependency fences" below for the full list.

## Current state (as found)

**No shared `constants.ts` object for these tabs' own copy.** Unlike
Phase 1c's dashboards (which ported an existing `DASHBOARD`/
`ADMIN_DASHBOARD` object 1:1), grepping `constants.ts` for
`SETTINGS|PARAMETRES|ETABLISSEMENT|ANNEE|ADMINISTRATEUR|NOTIFICATION|
PROFIL|DANGER` turns up only `ADMIN_SETTINGS` (the deferred admin page).
This phase's migration pattern is Phase 1a's "inline JSX string →
`useTranslations()`" — not Phase 1c's "port an existing constants object."

**`page.tsx` (the shell, 170 lines):** a `TABS` array of 7 entries
(`profil`, `apparence`, `langue`, `etablissement`, `annee`, `admins`,
`notifications`) drives the tab UI — `apparence`'s label already reads
`APPEARANCE.tab` from constants.ts, the other 6 are hardcoded French
strings. Page-level copy includes an `<h1>Paramètres</h1>`, a subtitle
with a tutoiement violation ("Gère les informations de ton établissement,
les préférences et la sécurité du compte."), and an error string
(`"Impossible de charger les informations de l'établissement."`).
`ZoneDangereuseSection` renders conditionally inside the `'etablissement'`
tab's block, not from the `TABS` array.

**`ProfilTab.tsx` (363 lines):** two cards — `ProfileInfoCard` (name,
phone, role display, avatar upload) and `PasswordCard` (change/set
password, strength meter, generator, "you'll be logged out of all
sessions" warning). Carries several tutoiement instances
("Modifie ton mot de passe", "Tu t'es connecté via Google...",
"tu seras déconnecté·e"). `formatLastChanged()` hardcodes
`toLocaleDateString('fr-FR', ...)` and produces relative-time strings
("Aujourd'hui" / "Il y a 1 mois" / "Il y a N mois") needing `.one`/`.other`
plural keys, mirroring `activity-shared.ts`'s existing `relativeTime()`
helper from Phase 1c. Imports `ROLE_LABEL` from `AdministrateursTab.tsx`.

**`ApparenceTab.tsx` (18 lines):** renders `APPEARANCE.title`/
`.description` (from constants.ts) above `<ThemePicker />`. `APPEARANCE`
is also consumed by the deferred `admin/system/settings/page.tsx` — a
cross-dependency fence (see below). The tab's own two strings get
translated directly in the component; `APPEARANCE` itself stays untouched.

**`LangueTab.tsx` (20 lines):** fully inline hardcoded French, including a
tutoiement violation ("Choisis la langue... tous tes appareils..."). No
shared-constant entanglement — the simplest file in scope.

**`EtablissementTab.tsx` (196 lines):** school-identity form (name,
official code, statute, school type, address, phone, official email,
website, logo, director display). Imports `ADMIN_CREATE_SCHOOL.schoolTypes`
and `SCHOOL_STATUTES` from constants.ts for two `<Select>`s — both are
literal enum-like values submitted to the API as the `statute`/`schoolType`
fields, not just display labels, and both are shared with deferred
admin-back-office files (`admin/schools/page.tsx`,
`components/admin/CreateSchoolModal.tsx`) — cross-dependency fences.

**`AnneeScolaireTab.tsx` (621 lines, the largest tab):** large because of
UI surface (three modals: grading-scale editor, term editor, new-term
creator), not hidden business logic. Imports `TERM_TYPES`, `ORDINAL_LABELS`,
and `ACADEMIC_YEAR_ROLLOVER` from constants.ts — all three shared with the
deferred `nouvelle-annee/` wizard (4 files) — cross-dependency fences. Its
local `fmt()` hardcodes `toLocaleDateString('fr-FR', ...)`.

**`AdministrateursTab.tsx` (49 lines):** read-only roster list (V1 has no
add/remove flow). Defines and exports `ROLE_LABEL: Record<Role, string>`,
imported by both `ProfilTab.tsx` and `EtablissementTab.tsx` — a genuine
cross-file shared value, not a false-shared constant like the fenced-off
ones above. Its local `fmt()` also hardcodes `toLocaleDateString('fr-FR')`.

**`NotificationsTab.tsx` (139 lines):** a local `EVENT_TYPES` array (5
entries, label + description each) drives toggle rows for email/in-app
notification preferences. Fully self-contained — no `constants.ts`
entanglement. One tutoiement violation.

**`ZoneDangereuseSection.tsx` (209 lines):** export/reset-year/delete-school
danger actions, each behind a type-the-school-name confirmation modal.
Mixed register within the same file (e.g. "Procédez avec précaution" is
already vouvoiement while "Ton compte utilisateur restera actif" is
tutoiement) — needs full normalization to vouvoiement.

**Existing, empty `common` namespace:** `frontend/src/messages/{fr,ht,en}/
common.json` already exists with `errors.generic`/`errors.network` keys but
has zero real consumers anywhere in the app yet. Nearly every file in this
phase's scope has a hardcoded `'Erreur réseau. Réessaie.'` (or similar)
catch-block fallback that should consume `common.errors.network` instead of
duplicating the string — which also fixes those instances' tutoiement for
free, since the existing key already reads "Réessayez."

## Architecture (unchanged from Phase 0/1 — this phase adds no new infrastructure)

Same `next-intl` machinery: `useTranslations('<namespace>')` in client
components, message files under `frontend/src/messages/{fr,ht,en}/
<namespace>.json`, registry additions in `frontend/src/lib/locales.ts`
(`MESSAGE_NAMESPACES`), `frontend/src/i18n/request.ts`, and
`frontend/src/types/next-intl.d.ts` — all three cross-checked by the
registry-hardening tests `locales.test.ts` gained in Phase 1c. No new
registry-hardening work is needed this phase; the existing tests already
cover any namespace this phase adds.

## Namespace & message-file design

**One `settings` namespace for all 9 in-scope files**, nested per
tab/section — mirroring Phase 1c's `dashboard` namespace, which covered
one page plus 8 card components under a single JSON file with per-component
nested keys (`kpis.*`, `averagesTrend.*`, `levelDistribution.*`, etc.).
Settings' tab-switching is client-side state on one route, not separate
Next.js pages, making it the same "one screen, many panels" shape as the
dashboard — unlike `SidebarPlanCard` (reused globally in the sidebar) or
the admin dashboard (a genuinely separate page), which each earned their
own namespace in Phase 1c.

Proposed top-level keys inside `settings.json`:

```
settings.tabs.{profil,apparence,langue,etablissement,annee,admins,notifications}
settings.title, settings.subtitle, settings.loadError
settings.profil.*           (ProfilTab.tsx — profile card + password card)
settings.apparence.*        (ApparenceTab.tsx's own title/description)
settings.langue.*           (LangueTab.tsx)
settings.etablissement.*    (EtablissementTab.tsx)
settings.anneeScolaire.*    (AnneeScolaireTab.tsx — the largest subtree)
settings.administrateurs.*  (AdministrateursTab.tsx)
settings.notifications.*    (NotificationsTab.tsx, incl. the 5 EVENT_TYPES)
settings.zoneDangereuse.*   (ZoneDangereuseSection.tsx — top-level key
                              despite its nested render position, since
                              it's a full section with its own 2 modals)
```

**`common` namespace gains its first real consumers this phase:**
- `common.errors.network` — wired into every catch-block fallback across
  all 9 files currently hardcoding `'Erreur réseau. Réessaie.'` or similar.
- `common.roles.{OWNER,ADMIN,MEMBER}` — new keys, replacing the exported
  `ROLE_LABEL` constant in `AdministrateursTab.tsx`. `ROLE_LABEL` becomes a
  small function taking a translator (same "pure function + translator
  argument" pattern `plan-presentation.ts` established in Phase 1c),
  imported and called by all three consumers (`AdministrateursTab.tsx`,
  `ProfilTab.tsx`, `EtablissementTab.tsx`), each supplying its own
  `useTranslations('common')` instance.

## Cross-dependency fences (constants that stay French, untouched)

These `constants.ts` exports are consumed by both an in-scope file in this
phase and a file belonging to a deferred phase. None are migrated; each
in-scope component keeps consuming them as literal French values:

| Constant | In-scope consumer | Deferred consumer(s) |
|---|---|---|
| `APPEARANCE` | `ApparenceTab.tsx` (only its `.tab`/`.title`/`.description` keys — the tab's *own* surrounding copy is still translated) | `admin/system/settings/page.tsx` |
| `TERM_TYPES`, `ORDINAL_LABELS`, `ACADEMIC_YEAR_ROLLOVER` | `AnneeScolaireTab.tsx` | `nouvelle-annee/{page,Step1NewYear,Step3Decisions,Step2Promotion,Step4Summary}.tsx` |
| `ADMIN_CREATE_SCHOOL.schoolTypes`, `SCHOOL_STATUTES` | `EtablissementTab.tsx` (`<Select>` option values, submitted to the API as-is) | `admin/schools/page.tsx`, `components/admin/CreateSchoolModal.tsx` |

Net effect: the term-type picker (Trimestre/Semestre/Période libre) and its
descriptions, the ordinal labels (1er/2e/3e…), the "Configurer l'année
suivante" button text, the school statute/type dropdown options, and
`admin/system/settings`'s copy of the appearance picker all stay French in
this phase. Everything else in the 9 in-scope files is translated.

## Data flow

Unchanged from Phase 0/1: `next-intl` resolves messages server-side from
the `sg-locale` cookie in the root layout; client components call
`useTranslations('<namespace>')`. Components needing locale-aware date
formatting (the three `fmt()` helpers in `AdministrateursTab.tsx`,
`AnneeScolaireTab.tsx`, and `ProfilTab.tsx`'s `formatLastChanged`) read the
active locale via `useLocalePreference()` (`LocaleContext.tsx`) and index
into `LOCALE_BCP47` (added in Phase 1c) instead of hardcoding `'fr-FR'`.
`ProfilTab.tsx`'s relative-time phrasing (`formatLastChanged`) is rewritten
to accept a translator and use `.one`/`.other` keys, following the exact
signature Phase 1c's `activity-shared.ts` `relativeTime(iso, locale, t)`
established — not ICU plural syntax, to preserve the existing `n === 0`
edge-case behavior ("Aujourd'hui" for 0 months).

## Testing plan

- `locales.test.ts` (unchanged, from Phase 1c) automatically covers the new
  `settings` namespace once it's added to `MESSAGE_NAMESPACES` — disk
  parity across fr/ht/en, plus `request.ts`/`next-intl.d.ts` registry
  cross-checks. No test-file changes needed for the registry itself.
- Any pure function whose signature changes (`ROLE_LABEL` → a function
  taking `t`; `formatLastChanged` → accepting `t/locale`) gets its existing
  unit tests (if any exist) rewired to build a real translator via
  `createTranslator` against the real `fr/settings.json`, per the precedent
  `plan-presentation.test.ts` set in Phase 1c — not hand-typed stub
  strings.
- `pnpm typecheck && pnpm lint && pnpm test` must stay green throughout —
  standard project gate, no phase-specific additions.
- No new E2E/Lighthouse script is planned for this phase; Phase 1c's
  Task 6 already proved the locale-switching mechanism works end-to-end
  through the real Language picker, and this phase's LangueTab.tsx is that
  same picker's host, unchanged in behavior.

## Rollout notes

After this phase, remaining Phase 0-roadmap items: the year-end rollover
wizard (`nouvelle-annee/`, its own phase), the Pédagogie module, Scolarité/
Élèves/Enseignants, the rest of `/admin/*` (an "Admin back-office" phase —
now also responsible for `admin/system/settings/page.tsx`'s remaining
untranslated `APPEARANCE`-derived copy and the `ADMIN_CREATE_SCHOOL`/
`SCHOOL_STATUTES` dropdowns whenever that phase migrates them), server
message normalization, the landing page + static rendering, and bulletin
PDFs + Resend emails.
