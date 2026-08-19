# i18n Infrastructure (FR/HT/EN) — Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `next-intl` into the app with a per-user, no-URL-routing locale preference (French / Haitian Creole / English), and fully translate one pilot screen (`/login`) end-to-end to prove the pattern before it's stamped across the remaining ~51 pages in later, separately-planned phases.

**Architecture:** Locale is resolved server-side on every request from a `sg-locale` cookie (falling back to `Accept-Language`, falling back to French) via `next-intl`'s "without routing" mode — no `/fr /ht /en` URL segments, zero change to the App Router route tree. A `LocaleProvider` client context (mirroring the `ThemeProvider` shipped earlier the same day) lets a signed-in user change their language from Settings; the choice persists to `User.locale` and follows them across devices. Message files are namespaced per screen (`Common`, `Login`), mirroring `constants.ts`'s existing per-screen object convention.

**Tech Stack:** `next-intl@^4.13` (Next.js 16 / React 19 compatible — confirmed via `npm view next-intl peerDependencies`), Prisma migration, Vitest, Puppeteer (scratch E2E, not committed — matches this session's established verification pattern).

**Spec:** `docs/superpowers/specs/2026-08-19-i18n-infrastructure-design.md`

## Global Constraints

- No locale-prefixed routing (`/fr`, `/en`, `/ht`) — locale is a cookie + `User.locale` preference only.
- Cookie name: `sg-locale` (not next-intl's default `NEXT_LOCALE` — matches the `sg-theme` naming already shipped).
- Locale keys: exactly `fr` (default), `ht`, `en` — no others.
- Every Route Handler touched must keep `export const runtime = 'nodejs'`.
- Do **not** modify `frontend/src/lib/api.ts` (protected file) — compare `ApiError.code` against plain string literals; the existing `ApiErrorCode | (string & {}) | ''` type already accepts this without a union edit.
- Do **not** delete or edit `constants.ts`'s `AUTH_LOGIN` export — `forgot-password`, `verify-email`, and `reset-password` pages still import `AUTH_LOGIN.headline`/`.subline` from it and are **not** migrated in this phase. Only `login/page.tsx` stops importing it.
- Language names are never translated — a picker always shows "Français / Kreyòl Ayisyen / English" regardless of the active locale (standard practice — a user must recognize their language even when the UI is currently in the wrong one).
- Haitian Creole strings use standard IPN orthography; every Creole message file gets a header comment flagging it for native-speaker review before this reaches real users (per the spec — best-effort, not silently final).
- `PlatformSettings.locale` (admin-configurable platform default, `fr`/`en`, singleton row) is a **different, unrelated field** — do not touch it, do not confuse it with `User.locale`.
- Full gate before the final commit: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`.

---

## Task 1: Locale registry (`src/lib/locales.ts`)

**Files:**
- Create: `frontend/src/lib/locales.ts`
- Test: `frontend/src/lib/locales.test.ts`

**Interfaces:**
- Produces: `LOCALE_KEYS: readonly ['fr','ht','en']`, `type LocaleKey`, `DEFAULT_LOCALE: LocaleKey`, `LOCALE_COOKIE_NAME: 'sg-locale'`, `interface LocaleDef { key: LocaleKey; nativeName: string }`, `LOCALES: readonly LocaleDef[]`, `isLocaleKey(value: unknown): value is LocaleKey`, `resolveLocaleKey(value: unknown): LocaleKey`, `matchAcceptLanguage(header: string | null | undefined): LocaleKey`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/locales.test.ts`:

```ts
// Locale registry — the accessibility/consistency guard behind
// « Paramètres › Langue » mirrors src/lib/themes.test.ts's role for
// themes. This file's first describe block only needs the registry
// itself; a second block (added once the message JSON files exist, in a
// later task) asserts the three message trees stay key-for-key identical.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE_NAME,
  LOCALE_KEYS,
  isLocaleKey,
  matchAcceptLanguage,
  resolveLocaleKey,
} from './locales';

describe('locale registry', () => {
  it('lists exactly fr, ht, en — French default first', () => {
    expect(LOCALE_KEYS).toEqual(['fr', 'ht', 'en']);
    expect(DEFAULT_LOCALE).toBe('fr');
    expect(LOCALES.map((l) => l.key)).toEqual(['fr', 'ht', 'en']);
  });

  it('every locale has its own native name, never translated', () => {
    const names = Object.fromEntries(LOCALES.map((l) => [l.key, l.nativeName]));
    expect(names).toEqual({ fr: 'Français', ht: 'Kreyòl Ayisyen', en: 'English' });
  });

  it('validates keys strictly and falls back to French', () => {
    expect(isLocaleKey('ht')).toBe(true);
    expect(isLocaleKey('es')).toBe(false);
    expect(isLocaleKey(null)).toBe(false);
    expect(resolveLocaleKey('en')).toBe('en');
    expect(resolveLocaleKey('xx')).toBe('fr');
    expect(resolveLocaleKey(undefined)).toBe('fr');
  });

  it('cookie name is app-owned, not next-intl\'s default', () => {
    expect(LOCALE_COOKIE_NAME).toBe('sg-locale');
  });
});

describe('matchAcceptLanguage', () => {
  it('matches the first supported language in preference order', () => {
    expect(matchAcceptLanguage('en-US,en;q=0.9,fr;q=0.8')).toBe('en');
    expect(matchAcceptLanguage('fr-FR,fr;q=0.9')).toBe('fr');
    expect(matchAcceptLanguage('de-DE,de;q=0.9,en;q=0.8')).toBe('en');
  });

  it('falls back to French when nothing matches or the header is absent', () => {
    expect(matchAcceptLanguage('de-DE,es-ES')).toBe('fr');
    expect(matchAcceptLanguage(null)).toBe('fr');
    expect(matchAcceptLanguage(undefined)).toBe('fr');
    expect(matchAcceptLanguage('')).toBe('fr');
  });

  it('matches on the primary subtag (fr-CA still matches fr)', () => {
    expect(matchAcceptLanguage('fr-CA')).toBe('fr');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm exec vitest run src/lib/locales.test.ts`
Expected: FAIL — `Cannot find module './locales'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/locales.ts`:

```ts
// UI language registry — shared by the server locale resolver
// (src/i18n/request.ts), the LocaleProvider client context, and the
// LanguagePicker. Mirrors src/lib/themes.ts's shape for the equivalent
// per-user colour preference; the one real difference is that a locale
// must be knowable by the SERVER on every request (to pick the right
// message file for SSR), so this preference travels via a cookie —
// themes stay purely client-side (CSS custom properties).
//
// Client-safe: no server imports.

export const LOCALE_KEYS = ['fr', 'ht', 'en'] as const;
export type LocaleKey = (typeof LOCALE_KEYS)[number];

export const DEFAULT_LOCALE: LocaleKey = 'fr';

/** Cookie read by src/i18n/request.ts on every request and written by
 * LocaleContext on the client — app-owned name, not next-intl's default
 * `NEXT_LOCALE`, to match the sg-theme naming convention. */
export const LOCALE_COOKIE_NAME = 'sg-locale';

export interface LocaleDef {
  key: LocaleKey;
  /** Always the language's own name for itself — never translated, so a
   * user can find their language regardless of which one is active. */
  nativeName: string;
}

export const LOCALES: readonly LocaleDef[] = [
  { key: 'fr', nativeName: 'Français' },
  { key: 'ht', nativeName: 'Kreyòl Ayisyen' },
  { key: 'en', nativeName: 'English' },
];

export function isLocaleKey(value: unknown): value is LocaleKey {
  return typeof value === 'string' && (LOCALE_KEYS as readonly string[]).includes(value);
}

/** Normalises any stored/received value to a known locale (French otherwise). */
export function resolveLocaleKey(value: unknown): LocaleKey {
  return isLocaleKey(value) ? value : DEFAULT_LOCALE;
}

/**
 * Picks the first of the visitor's preferred languages (RFC 4647 loosely —
 * order-of-appearance, no q-value math needed across just 3 locales) that
 * we support, matching on the primary subtag so `fr-CA`/`fr-FR` both hit
 * `fr`. Used only for anonymous visitors with no `sg-locale` cookie yet.
 */
export function matchAcceptLanguage(header: string | null | undefined): LocaleKey {
  if (!header) return DEFAULT_LOCALE;
  const tags = header
    .split(',')
    .map((part) => part.split(';')[0]?.trim().toLowerCase())
    .filter((tag): tag is string => Boolean(tag));
  for (const tag of tags) {
    const primary = tag.split('-')[0];
    const match = LOCALE_KEYS.find((key) => key === primary);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm exec vitest run src/lib/locales.test.ts`
Expected: PASS — 4 + 3 = 7 tests green.

- [ ] **Step 5: Format, lint, typecheck**

```bash
cd frontend
pnpm exec prettier --write src/lib/locales.ts src/lib/locales.test.ts
pnpm exec eslint src/lib/locales.ts src/lib/locales.test.ts
pnpm exec tsc --noEmit
```

Expected: all clean (0 errors).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/locales.ts frontend/src/lib/locales.test.ts
git commit -m "$(cat <<'EOF'
feat(i18n): locale registry (fr/ht/en)

Client-safe registry mirroring lib/themes.ts's shape — keys, default,
cookie name, native-name picker labels (never translated), and an
Accept-Language matcher for anonymous visitors before they have a
sg-locale cookie.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `User.locale` — Prisma migration + schema field

**Files:**
- Modify: `frontend/prisma/schema.prisma`
- Create: `frontend/prisma/migrations/31_user_locale/migration.sql`

**Interfaces:**
- Consumes: nothing (leaf task).
- Produces: `User.locale String?` — nullable, no default (null = "never chosen", resolved to French by the app layer via `resolveLocaleKey`, exactly like `User.theme`).

- [ ] **Step 1: Add the field to the schema**

In `frontend/prisma/schema.prisma`, find the `theme` field on `model User` (added earlier the same day for the colour-theme feature):

```prisma
  // Colour theme chosen in Paramètres › Apparence — a key of
  // src/lib/themes.ts (lavande | ocean | foret | ardoise | terracotta);
  // null = never chosen (default). Per user, not per school: a personal
  // display preference that follows the account across devices.
  theme             String?
```

Insert immediately after it:

```prisma
  // Colour theme chosen in Paramètres › Apparence — a key of
  // src/lib/themes.ts (lavande | ocean | foret | ardoise | terracotta);
  // null = never chosen (default). Per user, not per school: a personal
  // display preference that follows the account across devices.
  theme             String?
  // UI language chosen in Paramètres › Langue — a key of
  // src/lib/locales.ts (fr | ht | en); null = never chosen (default:
  // French). Per user, not per school. Unlike `theme` (purely a client
  // CSS concern), the SERVER must know this on every request to pick the
  // right message file for SSR — it reads the `sg-locale` cookie
  // (src/i18n/request.ts), not this column directly. This column exists
  // only to carry the choice across devices, exactly like `theme`.
  locale            String?
```

- [ ] **Step 2: Write the migration**

Create `frontend/prisma/migrations/31_user_locale/migration.sql`:

```sql
-- Langue de l'interface (Paramètres › Langue) — préférence PAR UTILISATEUR,
-- clé de src/lib/locales.ts (fr | ht | en). NULL = jamais choisi → langue
-- par défaut (français). Contrairement au thème (purement côté client), la
-- langue doit être connue du SERVEUR à chaque requête (next-intl résout le
-- fichier de messages via le cookie sg-locale, voir src/i18n/request.ts) ;
-- cette colonne sert à retrouver le choix sur un autre appareil.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "locale" TEXT;
```

- [ ] **Step 3: Format the schema, apply the migration, regenerate the client**

```bash
cd frontend
pnpm exec prisma format
pnpm exec prisma migrate deploy
pnpm exec prisma generate
```

Expected: `prisma format` reports no changes beyond what you wrote; `migrate deploy` reports `31_user_locale` applied ("All migrations have been successfully applied."); `generate` reports the client regenerated.

- [ ] **Step 4: Verify against the dev DB**

```bash
pnpm exec prisma migrate status
```

Expected: "Database schema is up to date!" — no pending migrations.

- [ ] **Step 5: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/31_user_locale/
git commit -m "$(cat <<'EOF'
feat(i18n): User.locale column

Per-user UI language preference (fr/ht/en, null = French default),
mirroring User.theme's shape. Migration 31, applied to the dev DB.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: next-intl install + server locale resolution

**Files:**
- Modify: `frontend/package.json` (via `pnpm add`)
- Modify: `frontend/next.config.ts`
- Create: `frontend/src/i18n/request.ts`

**Interfaces:**
- Consumes: `LOCALE_COOKIE_NAME`, `matchAcceptLanguage`, `resolveLocaleKey` from `@/lib/locales` (Task 1).
- Produces: a working next-intl request config resolving `{ locale, messages: { Common, Login } }` on every server request; `next.config.ts` wrapped with the next-intl plugin.

- [ ] **Step 1: Install next-intl**

```bash
cd frontend
pnpm add next-intl
```

Expected: `next-intl@^4.13.x` added to `frontend/package.json` dependencies; `pnpm-lock.yaml` updated.

- [ ] **Step 2: Wrap `next.config.ts` with the next-intl plugin**

In `frontend/next.config.ts`, add the import at the top:

```ts
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';
```

At the bottom, replace:

```ts
// Sentry build-time wrapper. Uploads source maps when SENTRY_AUTH_TOKEN +
// SENTRY_ORG + SENTRY_PROJECT are present (typically only in CI). Without
// those env vars the wrapper still works — it just skips the upload step.
// silent:true keeps the build log clean when nothing is configured.
export default withSentryConfig(config, {
```

with:

```ts
// next-intl plugin — links src/i18n/request.ts (the default location it
// looks for) so Server Components can resolve messages per request. Must
// wrap `config` BEFORE the Sentry wrapper below (order doesn't matter
// functionally here, but this keeps the innermost config — the one both
// wrappers actually see — closest to its own definition).
const withNextIntl = createNextIntlPlugin();

// Sentry build-time wrapper. Uploads source maps when SENTRY_AUTH_TOKEN +
// SENTRY_ORG + SENTRY_PROJECT are present (typically only in CI). Without
// those env vars the wrapper still works — it just skips the upload step.
// silent:true keeps the build log clean when nothing is configured.
export default withSentryConfig(withNextIntl(config), {
```

- [ ] **Step 3: Write the request config**

Create `frontend/src/i18n/request.ts`:

```ts
// Server-side locale resolution — next-intl's "without routing" pattern
// (docs: https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing).
// Runs once per request (React `cache`-wrapped internally by next-intl);
// the first Server Component that needs a translation triggers it.
//
// Resolution order: sg-locale cookie (set by LocaleContext once a visitor
// has ever picked a language) → Accept-Language header (first visit,
// anonymous) → French.
//
// Phase 0 has two message namespaces (Common, Login); later phases add
// more `import()` + object-spread entries here as each screen migrates —
// there is no directory-scan helper by design, so every namespace this
// file serves is explicit and grep-able.
import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALE_COOKIE_NAME, matchAcceptLanguage, resolveLocaleKey } from '@/lib/locales';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const locale = cookieValue
    ? resolveLocaleKey(cookieValue)
    : matchAcceptLanguage((await headers()).get('accept-language'));

  const [common, login] = await Promise.all([
    import(`../messages/${locale}/common.json`),
    import(`../messages/${locale}/login.json`),
  ]);

  return {
    locale,
    messages: {
      Common: common.default,
      Login: login.default,
    },
  };
});
```

Note: the imported `../messages/${locale}/*.json` files don't exist yet — they're created in Task 7. This task's build/typecheck will fail on the missing files until then; that's expected and resolved by Task 7, not a mistake in this task.

- [ ] **Step 4: Create placeholder message files so this task is independently verifiable**

Since Task 7 owns the real message content, create minimal placeholders now so Tasks 3-6 can build/typecheck without waiting on Task 7 (they get overwritten with real content in Task 7 — not a throwaway, just sequencing):

```bash
mkdir -p frontend/src/messages/fr frontend/src/messages/ht frontend/src/messages/en
```

Create `frontend/src/messages/fr/common.json`, `frontend/src/messages/ht/common.json`, `frontend/src/messages/en/common.json` — each:

```json
{
  "errors": {
    "generic": "placeholder",
    "network": "placeholder"
  }
}
```

Create `frontend/src/messages/fr/login.json`, `frontend/src/messages/ht/login.json`, `frontend/src/messages/en/login.json` — each:

```json
{
  "placeholder": "placeholder"
}
```

- [ ] **Step 5: Verify the build picks up the plugin and config without error**

```bash
cd frontend
pnpm exec tsc --noEmit
pnpm build
```

Expected: both succeed. A successful `next build` is the real verification here — a broken next-intl plugin wiring or a request-config that throws fails the build immediately (there's no unit-testable surface for Next's own plugin system).

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/next.config.ts frontend/src/i18n/request.ts frontend/src/messages/
git commit -m "$(cat <<'EOF'
feat(i18n): install next-intl, resolve locale server-side (no routing)

next-intl wired via the "without i18n routing" pattern: locale comes from
the sg-locale cookie, falling back to Accept-Language, falling back to
French — no /fr /ht /en URL segments. Placeholder message files so the
build is green; real content lands in a follow-up task.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `/api/auth/me` — `locale` support

**Files:**
- Modify: `frontend/src/app/api/auth/me/route.ts`
- Modify: `frontend/src/app/api/auth/me/route.test.ts`
- Modify: `frontend/src/contexts/AuthContext.tsx`

**Interfaces:**
- Consumes: `LOCALE_KEYS`, `isLocaleKey` from `@/lib/locales` (Task 1).
- Produces: `GET /api/auth/me` response `user.locale: string | null`; `PATCH /api/auth/me { locale }` accepts a known key or `null`, 400 otherwise. `AuthContext`'s `User.locale: string | null`.

- [ ] **Step 1: Write the failing tests**

In `frontend/src/app/api/auth/me/route.test.ts`, append at the end of the file (after the existing `GET /api/auth/me — theme` describe block):

```ts

// PATCH — UI language (Paramètres › Langue). Same contract as `theme`:
// only a known key is stored, null resets to French, anything else 400s.
describe('PATCH /api/auth/me — locale', () => {
  beforeEach(() => {
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'u1', email: 'a@b.com', tokenVersion: 0 });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
    } as never);
    prismaMock.user.update.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: null,
      avatarUrl: null,
      phone: null,
      theme: null,
      locale: 'ht',
    } as never);
  });

  it('stores a known locale key', async () => {
    const res = await PATCH(makePatch({ locale: 'ht' }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: { locale: 'ht' } }),
    );
    expect(await res.json()).toMatchObject({ user: { locale: 'ht' } });
  });

  it('null resets to the default (French)', async () => {
    const res = await PATCH(makePatch({ locale: null }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { locale: null } }),
    );
  });

  it('rejects an unknown locale key (400) without touching the DB', async () => {
    const res = await PATCH(makePatch({ locale: 'es' }));
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe('GET /api/auth/me — locale', () => {
  it('exposes the stored locale, normalising unknown legacy values to null', async () => {
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'u1', email: 'a@b.com', tokenVersion: 0 });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
      locale: 'en',
    } as never);
    let res = await GET(makeReq({ bearer: 'valid-access-token' }));
    expect(await res.json()).toMatchObject({ user: { locale: 'en' } });

    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
      locale: 'legacy-value',
    } as never);
    res = await GET(makeReq({ bearer: 'valid-access-token' }));
    expect(await res.json()).toMatchObject({ user: { locale: null } });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && pnpm exec vitest run src/app/api/auth/me/route.test.ts`
Expected: FAIL — `PATCH`/`GET` don't yet accept/return `locale`; the new assertions fail (`locale` missing from the response, `z.enum` rejects the unknown-field body as unrecognized rather than 400ing on the right key, etc.).

- [ ] **Step 3: Implement in the route**

In `frontend/src/app/api/auth/me/route.ts`, change the import line:

```ts
import { THEME_KEYS, isThemeKey } from '@/lib/themes';
```

to:

```ts
import { THEME_KEYS, isThemeKey } from '@/lib/themes';
import { LOCALE_KEYS, isLocaleKey } from '@/lib/locales';
```

Add a second normalizer right after `resolveStoredTheme`:

```ts
function resolveStoredTheme(value: string | null | undefined): string | null {
  return isThemeKey(value) ? value : null;
}

function resolveStoredLocale(value: string | null | undefined): string | null {
  return isLocaleKey(value) ? value : null;
}
```

In the `GET` handler's `select`, change:

```ts
        phone: true,
        theme: true,
        emailVerifiedAt: true,
```

to:

```ts
        phone: true,
        theme: true,
        locale: true,
        emailVerifiedAt: true,
```

In the `user` object construction, change:

```ts
      theme: resolveStoredTheme(dbUser?.theme),
      emailVerifiedAt: dbUser?.emailVerifiedAt
```

to:

```ts
      theme: resolveStoredTheme(dbUser?.theme),
      locale: resolveStoredLocale(dbUser?.locale),
      emailVerifiedAt: dbUser?.emailVerifiedAt
```

In `UpdateMeBody`, change:

```ts
  // Colour theme (Paramètres › Apparence) — only a known key is stored;
  // null resets to the default theme.
  theme: z.enum(THEME_KEYS).nullable().optional(),
});
```

to:

```ts
  // Colour theme (Paramètres › Apparence) — only a known key is stored;
  // null resets to the default theme.
  theme: z.enum(THEME_KEYS).nullable().optional(),
  // UI language (Paramètres › Langue) — only a known key is stored; null
  // resets to the default (French).
  locale: z.enum(LOCALE_KEYS).nullable().optional(),
});
```

In the `PATCH` handler's final `select`, change:

```ts
      select: { id: true, email: true, name: true, avatarUrl: true, phone: true, theme: true },
```

to:

```ts
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        phone: true,
        theme: true,
        locale: true,
      },
```

Update the file's top comment (line 18) from:

```ts
// PATCH /api/auth/me — self-service profile edit (name/phone/avatarUrl/theme).
```

to:

```ts
// PATCH /api/auth/me — self-service profile edit (name/phone/avatarUrl/theme/locale).
```

- [ ] **Step 4: Add `locale` to `AuthContext`'s `User` type**

In `frontend/src/contexts/AuthContext.tsx`, change:

```ts
  /** Colour theme key (src/lib/themes.ts) chosen in Paramètres › Apparence;
   * null = never chosen (default theme). Applied by ThemeProvider. */
  theme: string | null;
}
```

to:

```ts
  /** Colour theme key (src/lib/themes.ts) chosen in Paramètres › Apparence;
   * null = never chosen (default theme). Applied by ThemeProvider. */
  theme: string | null;
  /** UI language key (src/lib/locales.ts) chosen in Paramètres › Langue;
   * null = never chosen (default: French). Applied by LocaleProvider. */
  locale: string | null;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd frontend && pnpm exec vitest run src/app/api/auth/me/route.test.ts`
Expected: PASS — all tests green (existing theme tests + the 4 new locale tests).

- [ ] **Step 6: Format, lint, typecheck**

```bash
cd frontend
pnpm exec prettier --write src/app/api/auth/me/route.ts src/app/api/auth/me/route.test.ts src/contexts/AuthContext.tsx
pnpm exec eslint src/app/api/auth/me/route.ts src/contexts/AuthContext.tsx
pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/api/auth/me/route.ts frontend/src/app/api/auth/me/route.test.ts frontend/src/contexts/AuthContext.tsx
git commit -m "$(cat <<'EOF'
feat(i18n): /api/auth/me carries the user's language preference

GET/PATCH /api/auth/me now read/write locale (fr/ht/en, null = French),
same contract as theme: unknown values 400 on write, normalise to null
on read. AuthContext.User gains `locale`.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `LocaleContext.tsx` (client provider)

**Files:**
- Create: `frontend/src/contexts/LocaleContext.tsx`

**Interfaces:**
- Consumes: `DEFAULT_LOCALE`, `LOCALE_COOKIE_NAME`, `resolveLocaleKey`, `type LocaleKey` from `@/lib/locales` (Task 1); `useAuth` from `@/contexts/AuthContext` (Task 4 added `user.locale`); `api` from `@/lib/api`; `useRouter` from `next/navigation`.
- Produces: `LocaleProvider({ children, initialLocale })`, `useLocalePreference(): { locale: LocaleKey; setLocale: (next: LocaleKey) => Promise<void> }`. Named `useLocalePreference`, not `useLocale`, to avoid colliding with next-intl's own exported `useLocale` hook (which returns just the read-only server-resolved locale string) — the two coexist in the same files once screens migrate.

No dedicated unit test for this file: it's a thin client context wired to `document.cookie` + `router.refresh()`, the same category of file as `ThemeContext.tsx`, which also has no unit test in this codebase — both are verified through the E2E task at the end of this plan instead (a precedent already established this same session for `ThemeContext.tsx`, not a new gap).

- [ ] **Step 1: Write the provider**

Create `frontend/src/contexts/LocaleContext.tsx`:

```tsx
'use client';

// UI language (Paramètres › Langue) — per-user preference.
//
// Unlike the colour theme, there's no flash-of-wrong-language to prevent:
// the server already resolves the locale from the `sg-locale` cookie on
// the very first response (src/i18n/request.ts), so whatever language the
// initial HTML renders in is already correct — no pre-paint script needed
// the way THEME_INIT_SCRIPT is for colours.
//
// This provider's job is narrower: track the current value for the
// LanguagePicker, write the cookie + persist `User.locale` when it
// changes, and force a `router.refresh()` so already-rendered Server
// Components (which read next-intl's server-side request config, not
// this client context) re-render in the new language — a plain client
// state update alone would never reach them.
//
// Registry (keys, native names): src/lib/locales.ts.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, resolveLocaleKey, type LocaleKey } from '@/lib/locales';

interface LocaleContextValue {
  locale: LocaleKey;
  /** Applies immediately (cookie + refresh); persists to the account when
   * signed in. Resolves once the server write is done (rejects on
   * failure — the UI already shows the new language, callers decide
   * whether to revert). */
  setLocale: (next: LocaleKey) => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function storeCookieLocale(locale: LocaleKey): void {
  // Plain (non-httpOnly) cookie, 1 year, root-scoped — read server-side by
  // src/i18n/request.ts on every request via `cookies()`.
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  /** The locale the server actually rendered this page in (from
   * next-intl's `getLocale()` in the root layout), passed down so the
   * client provider's first render always agrees with the DOM — never
   * guessed independently on the client. */
  initialLocale: LocaleKey;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [locale, setLocaleState] = useState<LocaleKey>(initialLocale);
  const syncedForUser = useRef<string | null>(null);

  // Server truth (User.locale) wins once per signed-in user — new device,
  // cleared cookie, or a change made from another device — including
  // `null` → French, so a shared computer never keeps a previous user's
  // language after switching accounts.
  useEffect(() => {
    if (!user) {
      syncedForUser.current = null;
      return;
    }
    if (syncedForUser.current === user.id) return;
    syncedForUser.current = user.id;
    const serverLocale = resolveLocaleKey(user.locale);
    if (serverLocale !== locale) {
      storeCookieLocale(serverLocale);
      setLocaleState(serverLocale);
      router.refresh();
    }
    // `locale` intentionally excluded: this effect only reacts to `user`
    // changing (login/logout/account switch), not to `locale` itself —
    // including it would re-run this sync loop on every language change
    // made via `setLocale` below, fighting the user's own click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router]);

  const setLocale = useCallback(
    async (next: LocaleKey) => {
      storeCookieLocale(next);
      setLocaleState(next);
      router.refresh();
      if (!user) return;
      await api('/api/auth/me', { method: 'PATCH', body: { locale: next } });
    },
    [router, user],
  );

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

const SSR_STUB: LocaleContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: async () => {},
};

export function useLocalePreference(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    if (typeof window === 'undefined') return SSR_STUB;
    throw new Error('useLocalePreference must be used inside a LocaleProvider');
  }
  return ctx;
}
```

- [ ] **Step 2: Format, lint, typecheck**

```bash
cd frontend
pnpm exec prettier --write src/contexts/LocaleContext.tsx
pnpm exec eslint src/contexts/LocaleContext.tsx
pnpm exec tsc --noEmit
```

Expected: clean. `tsc` will still fail at this point only if Task 3/4 weren't completed first (missing `@/lib/locales` exports or `user.locale`) — both are prerequisites already done.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/contexts/LocaleContext.tsx
git commit -m "$(cat <<'EOF'
feat(i18n): LocaleProvider client context

Mirrors ThemeContext's shape (cookie write, server-wins-once-per-user
sync, useLocalePreference — named to avoid colliding with next-intl's own
useLocale). The one real difference from the theme system: setLocale
calls router.refresh() so already-rendered Server Components pick up the
new next-intl request config.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Wire `NextIntlClientProvider` + `LocaleProvider` into the root layout

**Files:**
- Modify: `frontend/src/app/layout.tsx`

**Interfaces:**
- Consumes: `NextIntlClientProvider` from `next-intl`; `getLocale` from `next-intl/server`; `LocaleProvider` from `@/contexts/LocaleContext` (Task 5).
- Produces: every page renders inside a working next-intl context (`useTranslations`/`getTranslations` become callable anywhere), `<html lang>` reflects the resolved locale, `LocaleProvider` is mounted with the server-resolved `initialLocale`.

- [ ] **Step 1: Rewrite the layout**

In `frontend/src/app/layout.tsx`, change the imports:

```tsx
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/contexts/ToastContext';
import { ConfirmProvider } from '@/contexts/ConfirmContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { THEME_INIT_SCRIPT } from '@/lib/themes';
import { resolvePrintBaseUrl } from '@/lib/server/bulletin-pdf/print-base-url';
```

to:

```tsx
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { ToastProvider } from '@/contexts/ToastContext';
import { ConfirmProvider } from '@/contexts/ConfirmContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { THEME_INIT_SCRIPT } from '@/lib/themes';
import { resolvePrintBaseUrl } from '@/lib/server/bulletin-pdf/print-base-url';
```

Change the component itself from:

```tsx
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `suppressHydrationWarning`: the pre-paint script below stamps
  // data-theme on <html> from localStorage BEFORE React hydrates, so the
  // server markup (no attribute) legitimately differs from the client DOM.
  // Scoped to this element only — React does not propagate it to children.
  return (
    <html lang="fr" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Colour theme (Paramètres › Apparence) — applied before first
            paint so a reload never flashes the default palette. Source:
            src/lib/themes.ts THEME_INIT_SCRIPT (tested in themes.test.ts). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={inter.className}>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <ThemeProvider>{children}</ThemeProvider>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
```

to:

```tsx
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved server-side from the sg-locale cookie / Accept-Language (see
  // src/i18n/request.ts) — the very first response already renders in the
  // right language, so <html lang> is correct from the start (no client
  // patch-up needed the way the colour theme needs one).
  const locale = await getLocale();

  // `suppressHydrationWarning`: the pre-paint script below stamps
  // data-theme on <html> from localStorage BEFORE React hydrates, so the
  // server markup (no attribute) legitimately differs from the client DOM.
  // Scoped to this element only — React does not propagate it to children.
  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Colour theme (Paramètres › Apparence) — applied before first
            paint so a reload never flashes the default palette. Source:
            src/lib/themes.ts THEME_INIT_SCRIPT (tested in themes.test.ts). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={inter.className}>
        {/* No `locale`/`messages` props: rendered from a Server Component,
            NextIntlClientProvider automatically inherits both from the
            request config resolved in src/i18n/request.ts. */}
        <NextIntlClientProvider>
          <ToastProvider>
            <ConfirmProvider>
              <AuthProvider>
                <ThemeProvider>
                  <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>
                </ThemeProvider>
              </AuthProvider>
            </ConfirmProvider>
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Format, lint, typecheck, build**

```bash
cd frontend
pnpm exec prettier --write src/app/layout.tsx
pnpm exec eslint src/app/layout.tsx
pnpm exec tsc --noEmit
pnpm build
```

Expected: all clean; `pnpm build` succeeding is the real integration check here (an async layout with a broken provider tree fails the build, not just a lint rule).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/layout.tsx
git commit -m "$(cat <<'EOF'
feat(i18n): mount NextIntlClientProvider + LocaleProvider in the root layout

RootLayout becomes async to resolve the server locale (getLocale()) for
<html lang> and to hand LocaleProvider a trustworthy initialLocale.
NextIntlClientProvider wraps everything with no explicit locale/messages
props — it inherits both from src/i18n/request.ts automatically.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Message files (Common + Login × fr/ht/en) + TypeScript key safety

**Files:**
- Modify: `frontend/src/messages/{fr,ht,en}/common.json` (replace Task 3's placeholders)
- Modify: `frontend/src/messages/{fr,ht,en}/login.json` (replace Task 3's placeholders)
- Create: `frontend/src/types/next-intl.d.ts`
- Modify: `frontend/src/lib/locales.test.ts` (add the consistency guard)

**Interfaces:**
- Produces: real FR/HT/EN copy for the `Common` and `Login` namespaces; compile-time errors on a typo'd `t('...')` key or a missing translation argument (via next-intl's `AppConfig` augmentation); a test that fails if any of the 6 files ever drifts out of key-for-key sync with the others.

- [ ] **Step 1: Write the real message content**

Replace `frontend/src/messages/fr/common.json`:

```json
{
  "errors": {
    "generic": "Une erreur est survenue. Réessaie.",
    "network": "Erreur réseau. Réessaie."
  }
}
```

Replace `frontend/src/messages/en/common.json`:

```json
{
  "errors": {
    "generic": "Something went wrong. Try again.",
    "network": "Network error. Try again."
  }
}
```

Replace `frontend/src/messages/ht/common.json` — **flagged for native-speaker review before this reaches real users** (see the header comment convention below, mirrored in every Creole file this plan creates):

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "errors": {
    "generic": "Gen yon erè ki pase. Eseye ankò.",
    "network": "Erè rezo. Eseye ankò."
  }
}
```

Replace `frontend/src/messages/fr/login.json` (source content — matches `AUTH_LOGIN` in `constants.ts`, which `forgot-password`/`verify-email`/`reset-password` keep using unchanged until their own migration phase):

```json
{
  "headline": "Gérez votre école, simplement.",
  "subline": "La plateforme tout-en-un pour les établissements scolaires : notes, présences, bulletins et bien plus.",
  "features": {
    "grades": "Saisie et gestion des notes par matière",
    "attendance": "Suivi des présences en temps réel",
    "bulletins": "Génération automatique des bulletins",
    "stats": "Statistiques et rapports détaillés"
  },
  "welcome": "Bienvenue 👋",
  "formSubtitle": "Connectez-vous à votre espace pour accéder au tableau de bord de votre établissement.",
  "accountTypeLabel": "Type de compte",
  "roleTabs": {
    "admin": "Administrateur",
    "teacher": "Enseignant",
    "studentParent": "Élève / Parent"
  },
  "emailLabel": "Adresse e-mail",
  "passwordLabel": "Mot de passe",
  "showPassword": "Afficher le mot de passe",
  "hidePassword": "Masquer le mot de passe",
  "forgotPassword": "Mot de passe oublié ?",
  "rememberMe": "Se souvenir de moi sur cet appareil",
  "submit": "Se connecter",
  "submitting": "Connexion…",
  "noAccount": "Pas encore de compte ?",
  "contactAdmin": "Contacter l'administrateur",
  "securityNote": "Connexion sécurisée — vos données sont chiffrées",
  "errors": {
    "TOO_MANY_LOGIN_ATTEMPTS": "Trop de tentatives. Réessaie dans quelques minutes.",
    "LOCKED_OUT": "Compte temporairement verrouillé après plusieurs échecs. Réessaie dans quelques minutes.",
    "INVALID_CREDENTIALS": "E-mail ou mot de passe incorrect.",
    "EMAIL_NOT_VERIFIED": "Vérifie d'abord ton adresse e-mail avant de te connecter.",
    "ACCOUNT_SUSPENDED": "Ce compte a été suspendu. Contacte le support."
  }
}
```

Replace `frontend/src/messages/en/login.json`:

```json
{
  "headline": "Manage your school, simply.",
  "subline": "The all-in-one platform for schools: grades, attendance, report cards and more.",
  "features": {
    "grades": "Enter and manage grades by subject",
    "attendance": "Real-time attendance tracking",
    "bulletins": "Automatic report card generation",
    "stats": "Detailed statistics and reports"
  },
  "welcome": "Welcome 👋",
  "formSubtitle": "Sign in to your workspace to access your school's dashboard.",
  "accountTypeLabel": "Account type",
  "roleTabs": {
    "admin": "Administrator",
    "teacher": "Teacher",
    "studentParent": "Student / Parent"
  },
  "emailLabel": "Email address",
  "passwordLabel": "Password",
  "showPassword": "Show password",
  "hidePassword": "Hide password",
  "forgotPassword": "Forgot password?",
  "rememberMe": "Remember me on this device",
  "submit": "Sign in",
  "submitting": "Signing in…",
  "noAccount": "Don't have an account yet?",
  "contactAdmin": "Contact the administrator",
  "securityNote": "Secure connection — your data is encrypted",
  "errors": {
    "TOO_MANY_LOGIN_ATTEMPTS": "Too many attempts. Try again in a few minutes.",
    "LOCKED_OUT": "Account temporarily locked after several failed attempts. Try again in a few minutes.",
    "INVALID_CREDENTIALS": "Incorrect email or password.",
    "EMAIL_NOT_VERIFIED": "Please verify your email address before signing in.",
    "ACCOUNT_SUSPENDED": "This account has been suspended. Contact support."
  }
}
```

Replace `frontend/src/messages/ht/login.json` — **flagged for native-speaker review**:

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "headline": "Jere lekòl ou, fasil.",
  "subline": "Platfòm tout-an-yon pou etablisman eskolè yo : nòt, prezans, bilten ak plis ankò.",
  "features": {
    "grades": "Antre ak jere nòt pa matyè",
    "attendance": "Swiv prezans an tan reyèl",
    "bulletins": "Kreye bilten otomatikman",
    "stats": "Estatistik ak rapò detaye"
  },
  "welcome": "Byenveni 👋",
  "formSubtitle": "Konekte nan espas ou pou jwenn tablodbò etablisman ou.",
  "accountTypeLabel": "Kalite kont",
  "roleTabs": {
    "admin": "Administratè",
    "teacher": "Pwofesè",
    "studentParent": "Elèv / Paran"
  },
  "emailLabel": "Adrès imel",
  "passwordLabel": "Modpas",
  "showPassword": "Montre modpas",
  "hidePassword": "Kache modpas",
  "forgotPassword": "Ou bliye modpas ou?",
  "rememberMe": "Sonje m sou aparèy sa a",
  "submit": "Konekte",
  "submitting": "Ap konekte…",
  "noAccount": "Ou pa gen kont ankò?",
  "contactAdmin": "Kontakte administratè a",
  "securityNote": "Koneksyon an sekirize — done ou yo kripte",
  "errors": {
    "TOO_MANY_LOGIN_ATTEMPTS": "Twòp tantativ. Eseye ankò nan kèk minit.",
    "LOCKED_OUT": "Kont lan bloke pou kèk tan apre plizyè eseye ki echwe. Eseye ankò nan kèk minit.",
    "INVALID_CREDENTIALS": "Imel oswa modpas pa kòrèk.",
    "EMAIL_NOT_VERIFIED": "Tanpri verifye imel ou anvan ou konekte.",
    "ACCOUNT_SUSPENDED": "Kont sa a sispann. Kontakte sipò a."
  }
}
```

- [ ] **Step 2: TypeScript key safety (`AppConfig` augmentation)**

`resolveJsonModule` is already `true` in `tsconfig.base.json` (checked — no tsconfig change needed).

Create `frontend/src/types/next-intl.d.ts`:

```ts
// Type-safe translation keys: augments next-intl's AppConfig so
// `useTranslations('Login')` only accepts real keys from Login.json, and
// a typo like `t('sumbit')` is a compile error instead of a silent
// "sumbit" rendered to real users. French is the source of truth for the
// KEY SET (all 3 locales are asserted identical in locales.test.ts, so
// any locale would do here — French is simply this app's original
// language). See https://next-intl.dev/docs/workflows/typescript.
import type common from '@/messages/fr/common.json';
import type login from '@/messages/fr/login.json';
import type { LOCALE_KEYS } from '@/lib/locales';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof LOCALE_KEYS)[number];
    Messages: {
      Common: typeof common;
      Login: typeof login;
    };
  }
}
```

- [ ] **Step 3: Extend the consistency test**

In `frontend/src/lib/locales.test.ts`, add these imports at the top (alongside the existing ones):

```ts
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE_NAME,
  LOCALE_KEYS,
  isLocaleKey,
  matchAcceptLanguage,
  resolveLocaleKey,
} from './locales';
import frCommon from '../messages/fr/common.json';
import htCommon from '../messages/ht/common.json';
import enCommon from '../messages/en/common.json';
import frLogin from '../messages/fr/login.json';
import htLogin from '../messages/ht/login.json';
import enLogin from '../messages/en/login.json';
```

Append this new describe block at the end of the file:

```ts

// Deep key-set equality per namespace — a message added to French but
// forgotten in Creole/English must fail `pnpm test`, not silently render
// as a missing-key fallback (or worse, leak the raw key) in production.
function keyPaths(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe('message files stay in sync across locales', () => {
  const namespaces = [
    { name: 'common', fr: frCommon, ht: htCommon, en: enCommon },
    { name: 'login', fr: frLogin, ht: htLogin, en: enLogin },
  ];

  it.each(namespaces)('$name: fr/ht/en share the exact same key set', ({ fr, ht, en }) => {
    const frKeys = keyPaths(fr).filter((k) => k !== '_review').sort();
    const htKeys = keyPaths(ht)
      .filter((k) => k !== '_review')
      .sort();
    const enKeys = keyPaths(en).filter((k) => k !== '_review').sort();
    expect(htKeys).toEqual(frKeys);
    expect(enKeys).toEqual(frKeys);
  });

  it.each(namespaces)('$name: no empty-string values in any locale', ({ fr, ht, en }) => {
    for (const [label, tree] of [
      ['fr', fr],
      ['ht', ht],
      ['en', en],
    ] as const) {
      const empties = keyPaths(tree).filter((path) => {
        const value = path.split('.').reduce<unknown>((acc, key) => {
          return acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined;
        }, tree);
        return value === '';
      });
      expect(empties, `${label}.${namespaces[0].name} has empty values: ${empties.join(', ')}`).toEqual([]);
    }
  });
});
```

- [ ] **Step 4: Run the full locales test file**

Run: `cd frontend && pnpm exec vitest run src/lib/locales.test.ts`
Expected: PASS — the original registry tests (Task 1) plus the two new `it.each` blocks (2 namespaces × 2 checks = 4 tests) all green.

- [ ] **Step 5: Format, lint, typecheck, build**

```bash
cd frontend
pnpm exec prettier --write src/messages src/types/next-intl.d.ts src/lib/locales.test.ts
pnpm exec eslint src/lib/locales.test.ts
pnpm exec tsc --noEmit
pnpm build
```

Expected: clean. `tsc --noEmit` is the real check for the type augmentation — to confirm it actually catches a typo, temporarily change one `it('...')` call site (none exist yet; this is verified for real once Task 8 writes `t('...')` calls against these types) — no action needed here beyond a clean typecheck.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/messages frontend/src/types/next-intl.d.ts frontend/src/lib/locales.test.ts
git commit -m "$(cat <<'EOF'
feat(i18n): Common + Login message trees (fr/ht/en) + type-safe keys

Real copy for the two Phase-0 namespaces. Creole files carry an explicit
_review flag (excluded from the key-consistency check) — best-effort
translation, not shipped as silently final. TypeScript AppConfig
augmentation makes a typo'd or missing translation key a compile error.
locales.test.ts now also asserts all 3 locales share the exact same key
set per namespace, with no empty values.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `LanguagePicker` + `LocaleQuickSwitcher` components

**Files:**
- Create: `frontend/src/components/settings/LanguagePicker.tsx`

**Interfaces:**
- Consumes: `useLocalePreference` from `@/contexts/LocaleContext` (Task 5); `LOCALES`, `LOCALE_KEYS`, `type LocaleKey` from `@/lib/locales` (Task 1); `useToast` from `@/contexts/ToastContext`.
- Produces: `LanguagePicker({ className? })` — full radiogroup for Settings; `LocaleQuickSwitcher({ className? })` — compact 3-link switcher for public/pre-auth pages (the Login page in Task 9).

No dedicated unit test — same rationale as `ThemePicker.tsx` (no test file exists for it either): a keyboard-interactive visual component like this is verified through the E2E task, not a component-test harness this codebase doesn't otherwise use.

- [ ] **Step 1: Write the components**

Create `frontend/src/components/settings/LanguagePicker.tsx`:

```tsx
'use client';

// Language picker (Paramètres › Langue, and the « Langue » card of the
// SaaS admin settings) + a compact variant for pages reachable before
// login (the Login page itself — a Creole-speaking visitor may never get
// past a French-only sign-in screen otherwise, and most OSes don't even
// offer Haitian Creole in their language list, so Accept-Language alone
// isn't enough).
//
// Same roving-tabindex keyboard contract as ThemePicker/PlanCards:
// ←/→/↑/↓ move and select, Space/Enter select. Language names are never
// translated — every tile always shows the language's own name for
// itself, so a user can find their language regardless of which one is
// currently active.
import { useId, useState, type KeyboardEvent } from 'react';
import { Check, Languages } from 'lucide-react';
import { useLocalePreference } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { LOCALES, LOCALE_KEYS, type LocaleKey } from '@/lib/locales';
import { cn } from '@/lib/utils';

// Not sourced from message files on purpose (see file header): a picker
// whose own labels depend on the current language defeats its purpose.
const TOAST_APPLIED: Record<LocaleKey, string> = {
  fr: 'Langue appliquée : Français.',
  ht: 'Lang aplike : Kreyòl Ayisyen.',
  en: 'Language applied: English.',
};
const SAVE_ERROR: Record<LocaleKey, string> = {
  fr: 'Langue appliquée sur cet appareil, mais impossible de l’enregistrer sur ton compte.',
  ht: 'Lang lan aplike sou aparèy sa a, men nou pa t kapab anrejistre l sou kont ou.',
  en: 'Language applied on this device, but we couldn’t save it to your account.',
};

function useApplyLocale() {
  const { locale, setLocale } = useLocalePreference();
  const { toast } = useToast();
  const [busy, setBusy] = useState<LocaleKey | null>(null);

  async function apply(next: LocaleKey) {
    if (next === locale || busy) return;
    setBusy(next);
    try {
      await setLocale(next);
      toast(TOAST_APPLIED[next], 'success');
    } catch {
      toast(SAVE_ERROR[locale], 'warning');
    } finally {
      setBusy(null);
    }
  }

  return { locale, busy, apply };
}

export function LanguagePicker({ className }: { className?: string }) {
  const { locale, busy, apply } = useApplyLocale();
  const groupId = useId();

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, key: LocaleKey) {
    const idx = LOCALE_KEYS.indexOf(key);
    let next: LocaleKey | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
      next = LOCALE_KEYS[(idx + 1) % LOCALE_KEYS.length] ?? null;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = LOCALE_KEYS[(idx - 1 + LOCALE_KEYS.length) % LOCALE_KEYS.length] ?? null;
    else if (e.key === ' ' || e.key === 'Enter') next = key;
    if (!next) return;
    e.preventDefault();
    void apply(next);
    document.getElementById(`${groupId}-${next}`)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Langue de l'application"
      className={cn('grid gap-3 sm:grid-cols-3', className)}
    >
      {LOCALES.map((l) => {
        const selected = locale === l.key;
        return (
          <button
            key={l.key}
            type="button"
            id={`${groupId}-${l.key}`}
            role="radio"
            aria-checked={selected}
            aria-busy={busy === l.key || undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => void apply(l.key)}
            onKeyDown={(e) => onKeyDown(e, l.key)}
            className={cn(
              'flex items-center justify-between gap-2 rounded-xl border bg-card p-3.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              selected
                ? 'border-primary ring-2 ring-primary ring-offset-1'
                : 'border-border hover:border-primary/50',
            )}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Languages size={15} className="shrink-0 text-muted-foreground" />
              {l.nativeName}
            </span>
            <span
              aria-hidden
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background',
              )}
            >
              {selected && <Check size={12} strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Three text links — for pages reachable before login. No toast, no
 * busy-state chrome: a full page navigation (router.refresh) follows
 * immediately, which is feedback enough on a page this small. */
export function LocaleQuickSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLocalePreference();
  return (
    <div className={cn('flex items-center gap-2 text-xs font-medium', className)}>
      {LOCALES.map((l, i) => (
        <span key={l.key} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="text-border">
            ·
          </span>}
          <button
            type="button"
            onClick={() => void setLocale(l.key)}
            aria-current={locale === l.key ? 'true' : undefined}
            className={cn(
              'rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary',
              locale === l.key ? 'text-foreground underline' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {l.nativeName}
          </button>
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Format, lint, typecheck**

```bash
cd frontend
pnpm exec prettier --write src/components/settings/LanguagePicker.tsx
pnpm exec eslint src/components/settings/LanguagePicker.tsx
pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/settings/LanguagePicker.tsx
git commit -m "$(cat <<'EOF'
feat(i18n): LanguagePicker (Settings) + LocaleQuickSwitcher (pre-auth)

Radiogroup picker mirroring ThemePicker's keyboard contract, plus a
compact 3-link switcher for pages reachable before login — most OSes
don't offer Haitian Creole in their language list, so a visible switcher
on the sign-in screen is the only reliable way many users reach it.
Language names are always native, never translated.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Wire the language picker into school Settings

**Files:**
- Create: `frontend/src/app/(school)/settings/LangueTab.tsx`
- Modify: `frontend/src/app/(school)/settings/page.tsx`

**Interfaces:**
- Consumes: `LanguagePicker` from `@/components/settings/LanguagePicker` (Task 8).

- [ ] **Step 1: Create the tab**

Create `frontend/src/app/(school)/settings/LangueTab.tsx`:

```tsx
'use client';

// Paramètres › Langue — UI language of the app (per-user preference).
// The picker applies the language immediately via LocaleProvider and
// persists it on the account; there is no Save button, same as Apparence.
import { Card } from '@/components/ui/Card';
import { LanguagePicker } from '@/components/settings/LanguagePicker';

export function LangueTab() {
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-sm font-bold text-foreground">Langue de l'interface</h2>
      <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
        Choisis la langue de l'application. Préférence personnelle : elle s'applique
        immédiatement, sur tous tes appareils, et ne change rien pour les autres membres.
      </p>
      <LanguagePicker />
    </Card>
  );
}
```

- [ ] **Step 2: Register the tab**

In `frontend/src/app/(school)/settings/page.tsx`, change:

```tsx
import { ApparenceTab } from './ApparenceTab';
import { APPEARANCE } from '@/lib/constants';
```

to:

```tsx
import { ApparenceTab } from './ApparenceTab';
import { LangueTab } from './LangueTab';
import { APPEARANCE } from '@/lib/constants';
```

Change:

```tsx
const TABS = [
  { key: 'profil', label: 'Profil' },
  { key: 'apparence', label: APPEARANCE.tab },
  { key: 'etablissement', label: 'Établissement' },
```

to:

```tsx
const TABS = [
  { key: 'profil', label: 'Profil' },
  { key: 'apparence', label: APPEARANCE.tab },
  { key: 'langue', label: 'Langue' },
  { key: 'etablissement', label: 'Établissement' },
```

Change:

```tsx
          {tab === 'profil' && <ProfilTab user={user} myRole={myRole} />}
          {tab === 'apparence' && <ApparenceTab />}
```

to:

```tsx
          {tab === 'profil' && <ProfilTab user={user} myRole={myRole} />}
          {tab === 'apparence' && <ApparenceTab />}
          {tab === 'langue' && <LangueTab />}
```

- [ ] **Step 3: Format, lint, typecheck**

```bash
cd frontend
pnpm exec prettier --write "src/app/(school)/settings/LangueTab.tsx" "src/app/(school)/settings/page.tsx"
pnpm exec eslint "src/app/(school)/settings/LangueTab.tsx" "src/app/(school)/settings/page.tsx"
pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(school)/settings/LangueTab.tsx" "frontend/src/app/(school)/settings/page.tsx"
git commit -m "$(cat <<'EOF'
feat(i18n): "Langue" tab in school Settings

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Wire the language picker into `/admin/system/settings`

**Files:**
- Modify: `frontend/src/app/admin/system/settings/page.tsx`

**Interfaces:**
- Consumes: `LanguagePicker` from `@/components/settings/LanguagePicker` (Task 8).

- [ ] **Step 1: Add the import and nav entry**

In `frontend/src/app/admin/system/settings/page.tsx`, change:

```tsx
import { ThemePicker } from '@/components/settings/ThemePicker';
```

to:

```tsx
import { ThemePicker } from '@/components/settings/ThemePicker';
import { LanguagePicker } from '@/components/settings/LanguagePicker';
```

Change:

```tsx
    { id: 'general', label: T.nav.general },
    { id: 'appearance', label: APPEARANCE.adminNav },
    { id: 'billing', label: T.nav.billing },
```

to:

```tsx
    { id: 'general', label: T.nav.general },
    { id: 'appearance', label: APPEARANCE.adminNav },
    { id: 'language', label: 'Langue' },
    { id: 'billing', label: T.nav.billing },
```

- [ ] **Step 2: Add the section**

Change:

```tsx
          {/* Per-user colour theme — applies immediately through ThemeProvider,
              independent of the Save button (not a PlatformSettings field). */}
          <SettingsSection
            id="appearance"
            title={APPEARANCE.title}
            description={APPEARANCE.description}
          >
            <ThemePicker />
          </SettingsSection>
```

to:

```tsx
          {/* Per-user colour theme — applies immediately through ThemeProvider,
              independent of the Save button (not a PlatformSettings field). */}
          <SettingsSection
            id="appearance"
            title={APPEARANCE.title}
            description={APPEARANCE.description}
          >
            <ThemePicker />
          </SettingsSection>

          {/* Per-user UI language — same pattern as Apparence above, and
              likewise independent of the Save button / PlatformSettings.
              Distinct from PlatformSettings.locale (below, under General)
              which is an unrelated platform-wide default. */}
          <SettingsSection
            id="language"
            title="Langue"
            description="Langue de l'interface pour ton propre compte."
          >
            <LanguagePicker />
          </SettingsSection>
```

- [ ] **Step 3: Format, lint, typecheck**

```bash
cd frontend
pnpm exec prettier --write src/app/admin/system/settings/page.tsx
pnpm exec eslint src/app/admin/system/settings/page.tsx
pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/admin/system/settings/page.tsx
git commit -m "$(cat <<'EOF'
feat(i18n): "Langue" section in /admin/system/settings

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Migrate `/login` to next-intl (the pilot)

**Files:**
- Modify: `frontend/src/app/login/page.tsx`

**Interfaces:**
- Consumes: `useTranslations` from `next-intl`; `LocaleQuickSwitcher` from `@/components/settings/LanguagePicker` (Task 8); the `Login`/`Common` message namespaces (Task 7).

This is the centerpiece deliverable: the first screen translated end-to-end, including the error-code path normalization the spec calls for.

- [ ] **Step 1: Rewrite the page**

Replace the full contents of `frontend/src/app/login/page.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  BarChart2,
  BookOpen,
  Check,
  ClipboardCheck,
  Eye,
  EyeOff,
  FileText,
  Lock,
  LogIn,
  Mail,
  Shield,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { LocaleQuickSwitcher } from '@/components/settings/LanguagePicker';

const ROLE_TAB_KEYS = ['admin', 'teacher', 'studentParent'] as const;
const ROLE_TAB_ICONS = { admin: Shield, teacher: User, studentParent: Users } as const;
const FEATURE_KEYS = ['grades', 'attendance', 'bulletins', 'stats'] as const;
const FEATURE_ICONS = { grades: BookOpen, attendance: ClipboardCheck, bulletins: FileText, stats: BarChart2 } as const;

// ApiError.code values this screen knows how to translate — everything
// else (VALIDATION_FAILED and any future/unmapped code) falls through to
// Common.errors.generic. Kept local to this screen rather than in a
// shared table: only /login ever returns these particular codes today
// (see frontend/src/app/api/auth/login/route.ts).
export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const t = useTranslations('Login');
  const tCommon = useTranslations('Common');
  const [role, setRole] = useState<(typeof ROLE_TAB_KEYS)[number]>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      const me = await refresh();
      // Platform staff (ADMIN/SUPERADMIN) land on the SaaS back-office;
      // school users land on their dashboard. `/` stays the public
      // marketing landing — a logged-in user must never land there.
      const isPlatformStaff = me?.role === 'SUPERADMIN' || me?.role === 'ADMIN';
      router.push(isPlatformStaff ? '/admin' : '/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        // Static, literal keys on purpose — next-intl's typed t() (see
        // Task 7's AppConfig augmentation) validates each one against the
        // real Login.errors.* keys at compile time; a dynamically built
        // key (`t(`errors.${code}`)`) would bypass that check.
        switch (err.code) {
          case 'TOO_MANY_LOGIN_ATTEMPTS':
            setError(t('errors.TOO_MANY_LOGIN_ATTEMPTS'));
            break;
          case 'LOCKED_OUT':
            setError(t('errors.LOCKED_OUT'));
            break;
          case 'INVALID_CREDENTIALS':
            setError(t('errors.INVALID_CREDENTIALS'));
            break;
          case 'EMAIL_NOT_VERIFIED':
            setError(t('errors.EMAIL_NOT_VERIFIED'));
            break;
          case 'ACCOUNT_SUSPENDED':
            setError(t('errors.ACCOUNT_SUSPENDED'));
            break;
          default:
            setError(tCommon('errors.generic'));
        }
      } else {
        setError(tCommon('errors.network'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      {/* Branding panel — full feature showcase on lg+, compact header band on mobile */}
      <div className="relative flex shrink-0 flex-col items-start justify-center overflow-hidden bg-sidebar-dark px-6 py-8 text-white lg:w-[60%] lg:items-center lg:px-10 lg:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-24 hidden h-85 w-85 rounded-full border border-primary/20 lg:block"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -left-16 hidden h-55 w-55 rounded-full border border-primary/10 lg:block"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-16 -right-20 hidden h-70 w-70 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--color-primary)_25%,transparent)_0%,transparent_70%)] lg:block"
        />

        <div className="absolute top-4 right-4 z-20 lg:top-6 lg:right-8">
          <LocaleQuickSwitcher className="text-white/70 [&_button[aria-current]]:text-white" />
        </div>

        <div className="relative z-10 flex w-full max-w-md flex-col items-start">
          <div className="mb-4 flex items-center lg:mb-12">
            <Image
              src="/logos/schoolgesti-lockup-blanc.svg"
              alt="Schoolgesti"
              width={164}
              height={44}
              className="h-13 w-auto"
              priority
            />
          </div>

          <h1 className="mb-3 hidden text-[32px] leading-tight font-extrabold tracking-tight lg:block">
            {t('headline')}
          </h1>
          <p className="mb-10 hidden text-sm leading-relaxed text-white/50 lg:block">{t('subline')}</p>

          <div className="mb-4 hidden w-full flex-col gap-4 lg:flex">
            {FEATURE_KEYS.map((key) => {
              const Icon = FEATURE_ICONS[key];
              return (
                <div key={key} className="flex items-center gap-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/35">
                    <Icon size={15} className="text-sidebar-dark-foreground" />
                  </div>
                  <span className="text-[13px] font-medium text-white/78">{t(`features.${key}`)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-background p-4 sm:p-6 lg:p-10">
        <Card className="w-full max-w-[430px] px-6 py-7 sm:px-9 sm:pt-9 sm:pb-7">
          <div className="mb-2 flex items-center justify-between gap-3">
            <Image
              src="/logos/schoolgesti-lockup.svg"
              alt="Schoolgesti"
              width={164}
              height={44}
              className="h-11 w-auto"
            />
            <LocaleQuickSwitcher className="lg:hidden" />
          </div>

          <h2 className="mb-1.5 text-[26px] font-extrabold tracking-tight text-foreground">
            {t('welcome')}
          </h2>
          <p className="mb-6 text-[13px] leading-relaxed text-muted-foreground">{t('formSubtitle')}</p>

          <div
            role="tablist"
            aria-label={t('accountTypeLabel')}
            className="mb-6 flex gap-0.5 rounded-md bg-muted p-1"
          >
            {ROLE_TAB_KEYS.map((key) => {
              const Icon = ROLE_TAB_ICONS[key];
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={role === key}
                  onClick={() => setRole(key)}
                  className={`flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-sm px-1.5 text-[11px] font-semibold whitespace-nowrap ${
                    role === key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  <Icon size={11} />
                  {t(`roleTabs.${key}`)}
                </button>
              );
            })}
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field
              label={t('emailLabel')}
              type="email"
              name="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail size={14} />}
            />

            <div className="flex flex-col gap-1">
              <Field
                label={t('passwordLabel')}
                type={showPassword ? 'text' : 'password'}
                name="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<Lock size={14} className="text-muted-foreground" />}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                    className="flex h-12 w-12 shrink-0 items-center justify-center text-muted-foreground"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                }
              />
              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="inline-flex items-center py-1.5 text-[11px] font-semibold text-primary"
                >
                  {t('forgotPassword')}
                </Link>
              </div>
            </div>

            <label className="flex min-h-12 cursor-pointer items-center gap-2">
              <span
                onClick={() => setRememberMe((v) => !v)}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm ${
                  rememberMe ? 'bg-primary' : 'border border-border'
                }`}
              >
                {rememberMe && <Check size={10} className="text-white" />}
              </span>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="sr-only"
              />
              <span className="text-xs text-muted-foreground">{t('rememberMe')}</span>
            </label>

            {error && (
              <p role="alert" className="text-sm text-destructive-foreground">
                {error}
              </p>
            )}

            <Button type="submit" loading={submitting}>
              <LogIn size={16} />
              {submitting ? t('submitting') : t('submit')}
            </Button>
          </form>

          <p className="mb-3.5 text-center text-xs leading-relaxed text-muted-foreground">
            {t('noAccount')}{' '}
            <Link href="/#contact-demo" className="font-semibold text-primary">
              {t('contactAdmin')}
            </Link>
          </p>

          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2.5 text-[11px] text-muted-foreground">
            <ShieldCheck size={13} className="shrink-0 text-success-foreground" />
            <span>{t('securityNote')}</span>
          </div>
        </Card>
      </div>
    </main>
  );
}
```

Note what deliberately did **not** change: `alt="Schoolgesti"` on both logos stays a hardcoded literal — it's the brand name, not translatable content, matching the logo's own visible wordmark in every locale. `AUTH_LOGIN` is no longer imported here, but stays exported from `constants.ts` untouched — `forgot-password`, `verify-email`, and `reset-password` still read `AUTH_LOGIN.headline`/`.subline` from it.

- [ ] **Step 2: Format, lint, typecheck**

```bash
cd frontend
pnpm exec prettier --write src/app/login/page.tsx
pnpm exec eslint src/app/login/page.tsx
pnpm exec tsc --noEmit
```

Expected: clean. If `tsc` flags a translation key as invalid, it caught a real typo against the `AppConfig` augmentation from Task 7 — fix the key, don't suppress.

- [ ] **Step 3: Confirm the other 3 auth pages still typecheck and still import `AUTH_LOGIN`**

```bash
grep -n "AUTH_LOGIN" src/app/forgot-password/page.tsx src/app/verify-email/page.tsx src/app/reset-password/page.tsx
```

Expected: 2 matches per file (`headline`, `subline`) — unchanged, confirming this task didn't touch their shared dependency.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/login/page.tsx
git commit -m "$(cat <<'EOF'
feat(i18n): migrate /login to next-intl (pilot screen)

The first screen fully translated FR/HT/EN end-to-end: page copy via
useTranslations('Login'), a LocaleQuickSwitcher so a visitor can pick
their language before ever signing in, and every real ApiError.code the
login route returns (TOO_MANY_LOGIN_ATTEMPTS, LOCKED_OUT,
INVALID_CREDENTIALS, EMAIL_NOT_VERIFIED, ACCOUNT_SUSPENDED) mapped to a
translated message instead of the previous two-way TOO_MANY/default
split — LOCKED_OUT/EMAIL_NOT_VERIFIED/ACCOUNT_SUSPENDED users previously
saw a generic "wrong password" message that misdescribed why they were
blocked.

constants.ts's AUTH_LOGIN is untouched — forgot-password/verify-email/
reset-password still depend on its headline/subline until their own
migration phase.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: End-to-end verification (browser, all 3 locales)

**Files:**
- Create (scratchpad only, not committed — matches this session's established pattern for Puppeteer verification scripts): `<scratchpad>/e2e-i18n-login.js`

No production files are created by this task. Its deliverable is a verification run whose console output gets pasted into the task's completion notes.

- [ ] **Step 1: Restart the dev server so it picks up the new Prisma client**

The `User.locale` column and regenerated Prisma client from Task 2 require a fresh `next dev` process — a server started before that migration will 500 on `/api/auth/me` with an empty body (same failure mode documented for the `theme` column earlier the same day). Confirm the running dev server was started *after* Task 2's `prisma generate`; if unsure, restart it and wait for "Ready".

- [ ] **Step 2: Write the verification script**

```js
// Scratch E2E — Login page in FR/HT/EN: html lang, translated copy,
// LocaleQuickSwitcher, translated login error, persistence across
// reload, no visual overflow at 375px in the two longest locales.
'use strict';
const path = require('path');
const ROOT = '/home/amos-dorceus/Documents/SaaSManagement/ekolplus2/frontend';
const OUT = __dirname;
const BASE = process.env.BASE || 'http://localhost:3000';

const fails = [];
function check(cond, label) {
  console.log(`${cond ? '✓' : '✗'} ${label}`);
  if (!cond) fails.push(label);
}

const EXPECT = {
  fr: { headline: 'Gérez votre école, simplement.', submit: 'Se connecter', invalid: 'E-mail ou mot de passe incorrect.' },
  ht: { headline: 'Jere lekòl ou, fasil.', submit: 'Konekte', invalid: 'Imel oswa modpas pa kòrèk.' },
  en: { headline: 'Manage your school, simply.', submit: 'Sign in', invalid: 'Incorrect email or password.' },
};

(async () => {
  const puppeteer = require(path.join(ROOT, 'node_modules/puppeteer-core'));
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars'],
  });
  try {
    for (const [locale, expect_] of Object.entries(EXPECT)) {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      const consoleErrors = [];
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0', timeout: 60000 });
      // Force the locale via the cookie the same way LocaleContext does,
      // then reload — exercises the real server-resolution path.
      await page.evaluate((l) => {
        document.cookie = `sg-locale=${l}; path=/; max-age=31536000; SameSite=Lax`;
      }, locale);
      await page.reload({ waitUntil: 'networkidle0', timeout: 60000 });

      const htmlLang = await page.$eval('html', (h) => h.getAttribute('lang'));
      check(htmlLang === locale, `[${locale}] html lang="${locale}" (got "${htmlLang}")`);

      const headline = await page.$eval('h1', (h) => h.textContent.trim()).catch(() => null);
      check(headline === expect_.headline, `[${locale}] headline matches (got "${headline}")`);

      const submitText = await page.$eval('button[type="submit"]', (b) => b.textContent.trim());
      check(submitText.includes(expect_.submit), `[${locale}] submit button "${expect_.submit}" (got "${submitText}")`);

      // Trigger a real INVALID_CREDENTIALS and check the translated message.
      await page.type('input[name="email"]', 'nobody-i18n-test@example.com');
      await page.type('input[name="password"]', 'wrong-password-123');
      const respP = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'), { timeout: 15000 });
      await page.click('button[type="submit"]');
      await respP;
      await new Promise((r) => setTimeout(r, 400));
      const errorText = await page.$eval('[role="alert"]', (p) => p.textContent.trim()).catch(() => null);
      check(errorText === expect_.invalid, `[${locale}] INVALID_CREDENTIALS translated (got "${errorText}")`);

      // 375px overflow check (Creole/French run longer than English).
      await page.setViewport({ width: 375, height: 800 });
      await page.reload({ waitUntil: 'networkidle0', timeout: 60000 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      check(!overflow, `[${locale}] no horizontal overflow at 375px`);
      await page.screenshot({ path: path.join(OUT, `i18n-login-${locale}-375.png`) });
      await page.setViewport({ width: 1440, height: 900 });

      console.log(`[${locale}] console errors:`, consoleErrors.length ? consoleErrors.join(' | ') : 'none');
      await ctx.close();
    }

    // LocaleQuickSwitcher: click Kreyòl from a fresh FR load, confirm it
    // actually switches (cookie + reload), not just a visual toggle.
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0', timeout: 60000 });
    const links = await page.$$eval('button', (btns) =>
      btns.filter((b) => b.textContent.trim() === 'Kreyòl Ayisyen').map((b) => b.textContent),
    );
    check(links.length > 0, 'Kreyòl Ayisyen switcher link is present and untranslated (native name)');
    const [switcher] = await page.$x("//button[contains(., 'Kreyòl Ayisyen')]");
    if (switcher) {
      await switcher.click();
      await new Promise((r) => setTimeout(r, 800));
      const langAfter = await page.$eval('html', (h) => h.getAttribute('lang'));
      check(langAfter === 'ht', `LocaleQuickSwitcher click switches to ht (got "${langAfter}")`);
    } else {
      check(false, 'LocaleQuickSwitcher Kreyòl button not found');
    }
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(fails.length ? `\nFAILED ${fails.length}: ${fails.join(' ; ')}` : '\nALL CHECKS PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
```

- [ ] **Step 3: Run it**

Save the script above to your scratchpad directory and run:

```bash
node <scratchpad>/e2e-i18n-login.js
```

Expected: `ALL CHECKS PASSED`, 0 exit code. If `INVALID_CREDENTIALS translated` fails, check that the login route's rate limiter isn't already tripped from earlier manual testing (`TOO_MANY_LOGIN_ATTEMPTS` would return instead) — wait a few minutes or use a fresh IP/context.

- [ ] **Step 4: Signed-in persistence check (manual, since it needs a real seeded account)**

Using the credentials in `frontend/CREDENTIALS.local.md` (school owner account):
1. Log in while on French (default).
2. Go to Paramètres → Langue, pick Kreyòl Ayisyen. Confirm the toast, confirm `<html lang="ht">`, confirm the sidebar/dashboard text is still French (not migrated yet — expected, only Login is translated this phase) but the Langue tab's own labels and the picker itself behave correctly.
3. Log out, log back in on a fresh browser context (or clear cookies) — confirm the Login page renders in French again (no cookie yet) but the account's stored preference is `ht`.
4. Log in again — confirm the app switches to Kreyòl Ayisyen automatically after login (server-wins-once-per-user sync from `LocaleContext`), then reset the account back to French for cleanliness (Paramètres → Langue → Français).

- [ ] **Step 5: Lighthouse, all 3 locales, on a local production build**

The stock `pnpm lighthouse` script audits pages via a header-only auth cookie, which never satisfies `AuthProvider`'s client-side check — for `/login` specifically this doesn't matter (it's a public, unauthenticated page), so the stock script's simpler `extraHeaders` approach isn't even needed here; a plain Lighthouse run against the URL with the right cookie set at launch is enough.

Build and serve a local production bundle (mirrors the verification done for the colour-theme feature earlier the same day — shadow the prod env file with the dev one so this never touches the real database or live Stripe keys):

```bash
cd frontend
set -a; source ./.env; source ./.env.local; set +a
export APP_URL=http://localhost:3001
pnpm exec next build
export PORT=3001
nohup pnpm exec next start --port 3001 > /tmp/i18n-lh-3001.log 2>&1 &
sleep 5
```

Save this as `<scratchpad>/lh-i18n-login.mjs`:

```js
// Lighthouse accessibility/best-practices audit of /login in each of the
// 3 locales — a longer Creole/French string must not push a touch target
// below size or break color-contrast via unexpected wrapping.
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const BASE = process.env.LIGHTHOUSE_BASE_URL || 'http://localhost:3001';
const LOCALES = ['fr', 'ht', 'en'];

const chrome = await launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'] });
const summary = [];
try {
  for (const locale of LOCALES) {
    const { lhr } = await lighthouse(`${BASE}/login`, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['accessibility', 'best-practices'],
      formFactor: 'desktop',
      screenEmulation: { disabled: true },
      throttlingMethod: 'simulate',
      extraHeaders: { Cookie: `sg-locale=${locale}` },
    });
    const a11y = Math.round((lhr.categories.accessibility?.score ?? 0) * 100);
    const bp = Math.round((lhr.categories['best-practices']?.score ?? 0) * 100);
    const cc = lhr.audits['color-contrast'];
    const failing = Object.values(lhr.audits)
      .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode === 'binary')
      .map((a) => a.id);
    summary.push({ locale, a11y, bp, contrast: cc?.score, failing, url: lhr.finalDisplayedUrl });
    console.log(`\n== ${locale} → a11y ${a11y} · best-practices ${bp} · color-contrast ${cc?.score} ${lhr.finalDisplayedUrl}`);
    if (failing.length) console.log('   failing audits:', failing.join(', '));
  }
} finally {
  await chrome.kill();
}
console.log('\nSUMMARY');
for (const s of summary) {
  console.log(`${s.locale.padEnd(3)} a11y=${s.a11y} bp=${s.bp} contrast=${s.contrast} fails=[${s.failing.join(',')}]`);
}
```

Run it:

```bash
node <scratchpad>/lh-i18n-login.mjs
```

Expected: `a11y=100 bp=100 contrast=1 fails=[]` for all three locales. Then stop the local prod server (`pkill -f "next start --port 3001"` or kill the PID from `nohup`'s output) — it isn't needed again after this task.

- [ ] **Step 6: No commit for this task** (scratch verification only — nothing in the repo changes).

---

## Task 13: Full gate + documentation

**Files:**
- Modify: `/CLAUDE.md` (repo root)

**Interfaces:** none — closing task.

- [ ] **Step 1: Full repo gate**

```bash
cd /home/amos-dorceus/Documents/SaaSManagement/ekolplus2
pnpm format
pnpm lint
pnpm typecheck
pnpm test
```

Expected: all four green. `pnpm test` should show the new `locales.test.ts` (11 tests: 4 registry + 3 Accept-Language + 4 message-consistency) and the 4 new `route.test.ts` locale cases, on top of everything already passing.

- [ ] **Step 2: Document the convention in CLAUDE.md**

In `/CLAUDE.md`, find the paragraph added earlier the same day for colour themes:

```md
**Colour themes (Paramètres › Apparence).** Schoolgesti's UI only uses the `@theme` tokens of [globals.css](frontend/src/app/globals.css) — never hardcode a brand hex in a component (`text-primary`, `bg-secondary`, `bg-sidebar-dark`, …). A theme is a `:root[data-theme='x']` block overriding the 16 brand/tint tokens; registry + pre-paint script in [frontend/src/lib/themes.ts](frontend/src/lib/themes.ts), provider in `contexts/ThemeContext.tsx`, persisted per user (`User.theme`). [themes.test.ts](frontend/src/lib/themes.test.ts) parses the CSS and fails if any text/background pair of any theme drops under WCAG AA 4.5:1 — run it after touching a token. Status (success/warning/destructive/info/gold), chart and data colours are deliberately NOT themed. See [.planning/banani/appearance-themes.md](.planning/banani/appearance-themes.md).
```

Insert immediately after it:

```md

**Internationalisation (FR/Créole haïtien/EN).** Phase 0 shipped: `next-intl` resolves the UI language server-side from a `sg-locale` cookie (falling back to `Accept-Language`, falling back to French) — **no locale-prefixed URLs** (`/fr /ht /en` don't exist and shouldn't). Registry: [frontend/src/lib/locales.ts](frontend/src/lib/locales.ts). Client provider: `contexts/LocaleContext.tsx` (`useLocalePreference()` — **not** `useLocale`, which is next-intl's own read-only hook; the two coexist). Persisted per user (`User.locale`, distinct from the unrelated `PlatformSettings.locale` admin default). Message files live under `frontend/src/messages/{fr,ht,en}/<namespace>.json`, one namespace per screen (mirrors `constants.ts`'s per-screen objects — e.g. `Login.json` next to `AUTH_LOGIN`, until a screen fully migrates and its `constants.ts` entry is retired). [locales.test.ts](frontend/src/lib/locales.test.ts) fails `pnpm test` if any locale's key set drifts from the other two. Only `/login` is migrated so far (the pilot) — every other screen still reads French from `constants.ts` unchanged; see [docs/superpowers/specs/2026-08-19-i18n-infrastructure-design.md](docs/superpowers/specs/2026-08-19-i18n-infrastructure-design.md) for the phased roadmap covering the rest of the app. Haitian Creole strings carry a `_review` flag in their JSON files (excluded from the consistency test) — best-effort translations, not yet reviewed by a native speaker.
```

- [ ] **Step 3: Format, final gate re-run**

```bash
cd /home/amos-dorceus/Documents/SaaSManagement/ekolplus2
pnpm exec prettier --write CLAUDE.md
pnpm format && pnpm lint && pnpm typecheck && pnpm test
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(i18n): document the FR/HT/EN convention in CLAUDE.md

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Report to the user**

Summarize: what shipped (infrastructure + fully-translated Login pilot in FR/HT/EN), the E2E + Lighthouse results from Task 12, the explicit Haitian Creole "needs native review" flag, and the phased roadmap for the remaining ~51 pages (from the spec's Rollout notes section) as follow-up work — each future phase gets its own brainstorming → spec → plan cycle, not a single giant next step. Do **not** push to `origin/develop` unless the user explicitly asks (matches this session's established working pattern — commits stay local until an explicit "commit et pusser" instruction).
