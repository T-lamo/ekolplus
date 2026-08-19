# Internationalisation (FR / Créole haïtien / EN) — Phase 0, infrastructure — Design Spec

Date: 2026-08-19
Status: Approved by user 2026-08-19 ("lancer le chantier") — pending plan + implementation.

## Problem

The user wants the whole app translated into French, Haitian Creole and
English. A repo-wide survey (not guessed — grepped) shows this is a large,
multi-layered surface, not a single `t()` wrapping pass:

- `src/lib/constants.ts` is 1398 lines / 23 exported `as const` objects,
  imported by 52 files.
- 124 additional files carry literal French UI strings outside that file.
- 101 API route files return French validation/error messages directly;
  67 client call sites render `err.message` from the server verbatim
  (bypassing the `ApiError.code` convention CLAUDE.md already recommends).
- Printed bulletin PDFs and Resend email templates also embed French
  labels server-side.
- Zero i18n library, zero locale routing, zero `User` field for a language
  preference exist today.

Translating ~52 pages / 99 components / thousands of strings, plus
normalizing 101 server routes, is not a single implementation pass. Per
the brainstorming skill's decomposition rule, this spec covers only the
**first sub-project — infrastructure + one fully-translated pilot
screen** — proving the pattern before it is stamped across the rest of
the app in later, separately-planned phases (roadmap at the bottom).

Decided with the user (AskUserQuestion, 2026-08-19) before this design:
1. **No locale-prefixed routing** (`/fr`, `/en`, `/ht`). Locale is a
   per-user preference — cookie + `User.locale` — with zero change to the
   App Router route tree. Chosen over URL prefixing specifically to avoid
   restructuring 52 pages; the app is entirely behind `noindex` except the
   landing page, so there is no SEO case for locale subpaths today.
2. **V1 scope = everything visibly on screen**, including normalizing the
   67 raw-`err.message` sites to translated error codes. Printed bulletin
   PDFs and outbound emails are explicitly deferred (different risk
   profile — administrative documents / deliverability — separate spec).
3. **Translations**: the assistant drafts all three languages; Haitian
   Creole is flagged per-file as "needs native-speaker review" rather than
   shipped as silently final, since it cannot be verified the way French/
   English can.

## Scope (this spec)

In scope:
- `next-intl` installed and wired for the **no-routing** pattern (locale
  resolved server-side from a cookie, no URL segments).
- `User.locale` column (migration, mirrors `User.theme` from the theme
  feature shipped 2026-08-19) + `GET`/`PATCH /api/auth/me` support.
- `LocaleProvider` client context mirroring `ThemeContext` (same
  session's pattern): applies `<html lang>`, persists cookie +
  `PATCH /api/auth/me`, browser `Accept-Language` fallback for anonymous
  visitors.
- Message-file convention: one JSON per locale per screen-namespace
  (mirrors `constants.ts`'s existing per-screen objects), under
  `src/messages/{fr,en,ht}/*.json`.
- A `LanguagePicker` component (radiogroup, same visual contract as
  `ThemePicker`) wired into Paramètres and `/admin/system/settings`,
  reusing the "Apparence" section pattern already shipped this session —
  ships as a new "Langue" section, not folded into "Apparence" (language
  is not a colour preference; keeping them visually distinct avoids
  implying they're the same kind of setting).
- Client-side error-code → translated-message table, and the **pattern**
  (not all 101 files) for converting a raw-`err.message` site to it,
  demonstrated on the pilot screen.
- **Pilot screen, fully translated FR/EN/HT**: the Login page
  (`/login`) — highest-traffic, self-contained, small enough to serve as
  the end-to-end proof (page copy, validation errors, the two lockup logo
  alt texts, the auth-mode tabs, forgot-password link).
- A consistency test (mirrors `themes.test.ts`) asserting the three
  message trees have identical key sets — a missing translation must fail
  `pnpm test`, not surface as English text leaking into a French screen.
- Real verification: rendered in the browser in all three languages,
  `pnpm lighthouse`, and an explicit overflow check — Haitian Creole and
  French run measurably longer than English, and this app already has one
  precedent (bulletin panel width) where untested text length broke a
  layout.

Out of scope (separate future specs, roadmap below):
- Translating the remaining 51 pages / 98 components / `constants.ts`'s
  other 22 objects.
- Normalizing the other 100 API route files' validation messages.
- Bulletin PDF templates, Resend email templates.
- Landing page marketing copy (public, currently French-only; will need
  its own SEO conversation given it's the one `index: true` surface).
- `PlatformSettings.locale` (admin-configurable platform default,
  singleton row, already exists, `fr`/`en` only) — a **different,
  unrelated field** for platform-wide metadata, not the per-user UI
  language this spec adds. Left untouched; not to be confused with
  `User.locale`.

## Current state (as found)

- `next-intl@4.13.7` (latest) declares `next: '^12 || ^13 || ^14 || ^15 ||
  ^16'`, `react: '^16.8 || ^17 || ^18 || ^19'` — compatible with this
  repo's `next@^16.3.0` / `react@^19.2.3` (checked via `npm view`, not
  assumed).
- Theme feature (shipped 2026-08-19, same session) is the direct template
  for the mechanics here: `src/lib/themes.ts` (registry + pre-paint
  script), `src/contexts/ThemeContext.tsx` (provider, cookie + PATCH
  /api/auth/me sync, "server wins once per signed-in user" rule),
  `prisma/migrations/30_user_theme/`, `components/settings/ThemePicker.tsx`,
  `src/lib/themes.test.ts` (consistency guard). This spec's `locales.ts` /
  `LocaleContext.tsx` / migration `31_user_locale` / `LanguagePicker.tsx` /
  `messages.test.ts` mirror that shape file-for-file.
- `src/app/api/auth/me/route.ts` already has the exact seam to extend:
  `UpdateMeBody` zod schema, `resolveStoredTheme`-style normalizer, `GET`
  select list. `User.theme` was added there as `z.enum(THEME_KEYS)
  .nullable().optional()`; `User.locale` follows the identical shape.
- `frontend/AGENTS.md` (auto-generated by `next dev`, re-added on every
  dev-server start) warns this Next.js version has breaking API changes
  from training data — `next-intl`'s own docs (fetched fresh, not
  recalled) will be consulted for the exact App Router integration API
  during implementation, not assumed from memory.
- CSP (`next.config.ts`) already allows `'unsafe-inline'` scripts (needed
  by the RSC hydration payload) — the same allowance the theme pre-paint
  script relies on; no CSP change needed here.
- No `Accept-Language` handling exists anywhere today (grepped).

## Architecture

**Locale resolution (server, per request)**: a `next-intl` config reads a
single app-owned cookie, `sg-locale` (named consistently with the theme
feature's `sg-theme`, not next-intl's default `NEXT_LOCALE` name — one
naming convention for both preferences), falling back to `Accept-Language`
parsing, falling back to `fr`. This happens once per request in a server
entry point (`i18n/request.ts`, next-intl's documented seam for the
no-routing setup) — verified against next-intl's current docs during
implementation rather than assumed.

**Client mechanics** (mirrors `ThemeContext.tsx` precisely):
- `src/lib/locales.ts`: `LOCALE_KEYS = ['fr', 'ht', 'en']`,
  `DEFAULT_LOCALE = 'fr'`, `LOCALE_STORAGE_KEY = 'sg-locale'`,
  `isLocaleKey`, `resolveLocaleKey` — same shape as `themes.ts`'s
  `THEME_KEYS`/`isThemeKey`/`resolveThemeKey`.
- `src/contexts/LocaleContext.tsx`: `LocaleProvider` under `AuthProvider`
  (order: `AuthProvider > ThemeProvider > LocaleProvider`, or the reverse
  of Theme/Locale — order between Theme and Locale doesn't matter, both
  only need `AuthProvider`'s `user`). `setLocale(next)` writes the cookie,
  calls `PATCH /api/auth/me`, and — because a locale swap changes which
  message file is active — triggers `router.refresh()` so Server
  Components re-render with the new `next-intl` context (this is the one
  real mechanical difference from the theme system: colour tokens are
  pure CSS and need no server round-trip, translated text comes from a
  server-resolved provider).
- No pre-paint script is needed the way `THEME_INIT_SCRIPT` was: there is
  no FOUC-equivalent for text (the server already renders in the correct
  language from the cookie on the very first response), so this is
  simpler than the theme system in that one respect.

**Message files**: `src/messages/{fr,ht,en}/<namespace>.json`, one
namespace per screen or shared concern to start (`common.json` for
cross-cutting strings — buttons, nav, error-code table — plus
`login.json` for the pilot). Namespacing mirrors `constants.ts`'s
per-screen objects (`ADMIN_COUPONS`, `DASHBOARD`, …) so the eventual
per-screen migration (later phases) is mechanical: one `constants.ts`
object → one namespace JSON × 3 locales.

**Error-code translation**: `common.json`'s `errors` namespace maps known
`ApiError.code` values (`PIN_REQUIRED`, `CODE_TAKEN`, `COUPON_IN_USE`, …)
to translated strings per locale; an `errors.generic` fallback covers
unmapped codes (replacing the current raw-`err.message` fallback). The
pilot screen (Login) demonstrates the conversion on its own error paths
(`INVALID_CREDENTIALS`, `ACCOUNT_SUSPENDED`, network-error fallback) —
the remaining 66 sites are follow-up work, tracked in the roadmap, not
this spec.

## Data flow

1. Anonymous visitor, no cookie → server parses `Accept-Language` →
   renders in the closest supported locale (`fr`/`ht`/`en`) → 3-way
   match falls back to `fr`.
2. Visitor changes language via `LanguagePicker` before login → cookie
   set client-side, no account to persist to yet, persists across the
   session via the cookie alone.
3. User logs in → `AuthProvider` fetches `/api/auth/me` → if
   `user.locale` is set and differs from the current cookie, the server
   value wins (same "once per signed-in session" rule as the theme
   system) → cookie updated, `router.refresh()`.
4. Signed-in user changes language in Paramètres → `PATCH /api/auth/me
   { locale }` → cookie updated → `router.refresh()` → every Server
   Component re-renders in the new language on the next paint.

## Testing plan

- `src/lib/locales.test.ts` (mirrors `themes.test.ts`'s intent, different
  mechanics — no CSS to parse): loads all message JSON files for the 3
  locales × N namespaces, asserts identical key sets (deep, including
  ICU plural/select sub-keys), asserts no empty-string values, asserts
  `LOCALE_KEYS`/`DEFAULT_LOCALE` match the registry used by the picker.
- `src/app/api/auth/me/route.test.ts`: extend with `locale` PATCH/GET
  cases, same shape as the `theme` cases added earlier this session
  (known-key accepted, `null` resets, unknown key → 400, legacy DB value
  normalized to `null` on read).
- Pilot screen E2E (Puppeteer, matching this session's `e2e-themes.js`
  pattern): load `/login` in each of the 3 locales (cookie set before
  navigation), assert `<html lang>` matches, assert the visible copy
  matches the expected message file content (not just "looks non-empty"),
  assert no visual overflow of the auth card / dark panel at 375px and
  1280px widths in the two longest locales (fr, ht), trigger a login
  error and assert the translated (not raw-server) message renders.
- `pnpm lighthouse` against the pilot screen in each locale (same
  `next build` + local prod-server pattern used to verify the theme
  feature) — accessibility must stay 100 in every locale (a longer
  Creole/French string must not push interactive elements below
  the touch-target size or break `color-contrast` via unexpected
  wrapping).
- Full gate: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`.

## Rollout notes / roadmap (future phases, NOT part of this spec)

Each phase below gets its own brainstorming → spec → plan cycle once
Phase 0 ships and its pattern is confirmed to hold up:

1. **Shell & navigation** — sidebars (school + admin), topbar, auth pages
   (forgot/reset/verify — same lockup/CSRF/error shape as the pilot),
   dashboard. Highest-traffic surfaces after login itself.
2. **Paramètres + Apparence/Langue** (the settings shell already exists;
   this phase is the remaining tabs — Établissement, Année scolaire,
   Administrateurs, Notifications).
3. **Pédagogie module** (carnet de notes, appréciations, emploi du temps,
   présences) — the largest single module by string count.
4. **Scolarité / Élèves / Enseignants**.
5. **Admin back-office** (`/admin/*` — users, orders, withdrawals,
   billing/coupons, system settings, audit log).
6. **Server message normalization** — the remaining ~100 API route files'
   zod/custom error messages converted to stable codes, each mapped in
   `common.json`'s error table as it's encountered (not a big-bang
   rewrite — done screen-by-screen as each screen above is migrated,
   since a screen's errors are only worth translating once its UI is).
7. **Landing page** — deferred pending an explicit SEO/routing decision
   (this is the one page where locale-prefixed URLs would have a real
   payoff — worth revisiting once the authenticated app is fully
   translated and that decision can be made on its own merits).
8. **Bulletin PDFs + Resend emails** — explicitly out of scope until a
   policy question is answered: does a printed bulletin follow the
   viewing user's language, or stay pinned to the school's own
   administrative language (likely French, given Haitian schools'
   official record-keeping conventions)? Needs its own short design
   conversation, not a default assumption.
9. **Static rendering for the landing page** — cookie-based locale
   resolution in the root layout made the whole app dynamically rendered
   (no static prerendering anywhere, landing page included). Since the
   landing page is already deferred to phase 7 for translation, a future
   phase should weigh pulling it out of the shared locale-resolution path
   (e.g. a route-group-local layout that skips `getLocale()`) to regain
   static rendering there.

Each phase is scoped to be small enough to review and ship on its own —
attempting the whole app in one plan would produce a review the user
cannot meaningfully vet in one pass, and a body of AI-drafted Creole large
enough that "needs native review" stops being a real, actionable flag.
