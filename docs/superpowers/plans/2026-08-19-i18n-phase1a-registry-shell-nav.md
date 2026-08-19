# i18n Phase 1a — Registry Hardening + Shell & Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the message-namespace registry (before the namespace count triples), then translate the app shell — both sidebars, both topbars, and every shared navigation subcomponent — into French/Haitian Creole/English, following exactly the `next-intl` pattern Phase 0 already proved on `/login`.

**Architecture:** No new infrastructure. Every task adds a `useTranslations(namespace)` call to an existing component and a matching `fr`/`ht`/`en` message file, exactly like Phase 0's Login migration. The one new piece of design: `SCHOOL_SECTIONS`/`ADMIN_SECTIONS` are today module-level constant arrays consumed by both a sidebar AND its topbar (for the command palette and breadcrumb trail) — since translation requires a React hook, both become hook functions (`useSchoolSections()`/`useAdminSections()`) exported from the sidebar files, called by both the sidebar and its topbar.

**Tech Stack:** Same as Phase 0 — `next-intl`, Vitest, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-19-i18n-phase1-shell-nav-design.md` (also read `docs/superpowers/specs/2026-08-19-i18n-infrastructure-design.md` for the underlying Phase-0 architecture this plan builds on).

**Plan sequencing:** This is Plan 1a of three plans implementing the Phase-1 spec (1a: this plan — registry + shell/nav. 1b: the three auth pages. 1c: dashboards + verification + docs). 1b and 1c are written after 1a merges to `develop`, so they can build on whatever 1a's implementation actually lands (not just what this plan predicts).

## Global Constraints

- Locale keys: exactly `fr` (default), `ht`, `en` — no others (unchanged from Phase 0).
- Cookie name: `sg-locale` (unchanged).
- Every new namespace gets its `fr`/`ht`/`en` JSON files created in the SAME task that first consumes it — never a placeholder-then-fill split like Phase 0 needed (Phase 0 had exactly 2 tightly-coupled namespaces sharing one pilot screen; this phase's namespaces are independent, so each task is self-contained).
- **French register: vouvoiement throughout, no exceptions** — this is a fresh constraint for this phase (Phase 0's `/login` mixed registers; that screen is not touched by this plan, so it stays mixed until whichever future task revisits it — out of scope here).
- Haitian Creole strings get a `_review` key (excluded from the consistency test) — best-effort, not yet reviewed by a native speaker. Copy this project's established phrasing verbatim: `"Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production."`
- Language names are never translated (not directly relevant to this plan's files, but the constraint stands app-wide).
- Server-sourced dynamic content (notification `title`/`body` from the API, the active academic year's `label`) is explicitly OUT of scope — those strings come from the database/admin input, not app copy, and are covered by a later phase ("Server message normalization"). Do not attempt to translate them.
- Do **not** modify `frontend/src/lib/api.ts` (protected file).
- Every Route Handler touched (none expected in this plan) must keep `export const runtime = 'nodejs'`.
- Full gate before each task's commit: `pnpm exec prettier --write <files>`, `pnpm exec eslint <files>`, `pnpm exec tsc --noEmit`. Full gate (`pnpm format && pnpm lint && pnpm typecheck && pnpm test`) at the end of the plan, mirroring Phase 0's Task 13.

---

## Task 1: Message-namespace registry hardening

**Files:**
- Modify: `frontend/src/lib/locales.ts`
- Modify: `frontend/src/lib/locales.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `MESSAGE_NAMESPACES: readonly ['common', 'login']` (grows by one entry per later task in this plan), `type MessageNamespace`. `locales.test.ts` now scans `src/messages/fr/` on disk instead of hardcoding a 2-namespace list — no test-file edits needed when a later task adds a namespace, as long as that task also appends its namespace key to `MESSAGE_NAMESPACES`.

This task fixes Minor #3 from Phase 0's final whole-branch review: the namespace list was hand-maintained in 3 places (`i18n/request.ts`, `next-intl.d.ts`, `locales.test.ts`). `i18n/request.ts` and `next-intl.d.ts` keep their explicit per-namespace lines by design (Next.js's bundler and TypeScript's structural typing both need real, static declarations there — see `i18n/request.ts`'s own header comment, which already states this design choice deliberately). What this task actually fixes is the ONE place that was silently wrong instead of loudly wrong: the test file, which only checked 2 hardcoded namespaces and would not have caught a namespace present in `fr/` but missing in `ht/`/`en/` for any namespace added later. After this task, `locales.test.ts` scans the real `src/messages/fr/` directory and cross-checks it against `ht/`, `en/`, and the new `MESSAGE_NAMESPACES` constant — a forgotten or incomplete namespace now fails `pnpm test`.

- [ ] **Step 1: Add `MESSAGE_NAMESPACES` to the registry**

In `frontend/src/lib/locales.ts`, find:

```ts
export const LOCALES: readonly LocaleDef[] = [
  { key: 'fr', nativeName: 'Français' },
  { key: 'ht', nativeName: 'Kreyòl Ayisyen' },
  { key: 'en', nativeName: 'English' },
];

export function isLocaleKey(value: unknown): value is LocaleKey {
```

Insert between them:

```ts
export const LOCALES: readonly LocaleDef[] = [
  { key: 'fr', nativeName: 'Français' },
  { key: 'ht', nativeName: 'Kreyòl Ayisyen' },
  { key: 'en', nativeName: 'English' },
];

/** Every message namespace that ships today — the single source of truth
 * this app's message files are checked against. `src/i18n/request.ts`'s
 * import list and `src/types/next-intl.d.ts`'s `Messages` interface both
 * stay hand-written (Next.js's bundler and TypeScript's structural typing
 * both need real, static declarations there — this array can't replace
 * either), but `locales.test.ts` scans `src/messages/fr/` on disk and
 * fails `pnpm test` if this array or any locale's file set ever drifts
 * from it — a forgotten namespace, or one that exists in French but not
 * Creole/English, fails loudly here instead of throwing at request time
 * for non-French users. Add your namespace's key here in the same task
 * that creates its `fr`/`ht`/`en` JSON files. */
export const MESSAGE_NAMESPACES = ['common', 'login'] as const;
export type MessageNamespace = (typeof MESSAGE_NAMESPACES)[number];

export function isLocaleKey(value: unknown): value is LocaleKey {
```

- [ ] **Step 2: Rewrite the test file to scan disk instead of hardcoding**

Replace the full contents of `frontend/src/lib/locales.test.ts`:

```ts
// Locale registry — the accessibility/consistency guard behind
// « Paramètres › Langue » mirrors src/lib/themes.test.ts's role for
// themes. The first two describe blocks test the registry itself; the
// rest scan src/messages/ on disk against MESSAGE_NAMESPACES, so a
// namespace forgotten in one locale — or never registered at all — fails
// `pnpm test` instead of silently breaking at runtime for non-French
// users.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE_NAME,
  LOCALE_KEYS,
  MESSAGE_NAMESPACES,
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

  it("cookie name is app-owned, not next-intl's default", () => {
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

// This test file lives at src/lib/locales.test.ts; src/messages/ is a
// sibling of src/lib — same "__dirname-relative path" pattern already
// used in src/lib/server/observability/runtime-enforcement.test.ts.
const MESSAGES_DIR = join(__dirname, '..', 'messages');

function namespacesOnDisk(locale: string): string[] {
  return readdirSync(join(MESSAGES_DIR, locale))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

function readNamespace(locale: string, namespace: string): unknown {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, locale, `${namespace}.json`), 'utf8'));
}

describe('message-namespace registry stays in sync with disk', () => {
  it('MESSAGE_NAMESPACES matches the fr/ directory listing exactly', () => {
    expect([...MESSAGE_NAMESPACES].sort()).toEqual(namespacesOnDisk('fr'));
  });

  it.each(['ht', 'en'] as const)('%s/ has the exact same namespace files as fr/', (locale) => {
    expect(namespacesOnDisk(locale)).toEqual(namespacesOnDisk('fr'));
  });
});

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
  it.each(MESSAGE_NAMESPACES)('%s: fr/ht/en share the exact same key set', (namespace) => {
    const frKeys = keyPaths(readNamespace('fr', namespace))
      .filter((k) => k !== '_review')
      .sort();
    const htKeys = keyPaths(readNamespace('ht', namespace))
      .filter((k) => k !== '_review')
      .sort();
    const enKeys = keyPaths(readNamespace('en', namespace))
      .filter((k) => k !== '_review')
      .sort();
    expect(htKeys).toEqual(frKeys);
    expect(enKeys).toEqual(frKeys);
  });

  it.each(MESSAGE_NAMESPACES)('%s: no empty-string values in any locale', (namespace) => {
    for (const locale of ['fr', 'ht', 'en'] as const) {
      const tree = readNamespace(locale, namespace);
      const empties = keyPaths(tree).filter((path) => {
        const value = path.split('.').reduce<unknown>((acc, key) => {
          return acc && typeof acc === 'object'
            ? (acc as Record<string, unknown>)[key]
            : undefined;
        }, tree);
        return value === '';
      });
      expect(empties, `${locale}.${namespace} has empty values: ${empties.join(', ')}`).toEqual(
        [],
      );
    }
  });
});
```

- [ ] **Step 3: Run the test**

Run: `cd frontend && pnpm exec vitest run src/lib/locales.test.ts`
Expected: PASS — same 11 tests as Phase 0 shipped (4 registry + 3 Accept-Language + 2 disk-sync + 2 key-consistency, now driven by `MESSAGE_NAMESPACES`/disk-scan instead of hardcoded imports), all green against the existing 2 namespaces.

- [ ] **Step 4: Format, lint, typecheck**

```bash
cd frontend
pnpm exec prettier --write src/lib/locales.ts src/lib/locales.test.ts
pnpm exec eslint src/lib/locales.ts src/lib/locales.test.ts
pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/locales.ts frontend/src/lib/locales.test.ts
git commit -m "$(cat <<'EOF'
fix(i18n): harden message-namespace registry before Phase 1 triples it

locales.test.ts now scans src/messages/fr/ on disk and cross-checks it
against ht/, en/, and a new MESSAGE_NAMESPACES constant, instead of
hardcoding a 2-namespace list — a namespace forgotten in one locale (or
never registered) now fails `pnpm test` loudly instead of throwing at
request time for non-French users. Fixes Minor #3 from Phase 0's final
whole-branch review, timed for before the namespace count grows past 2.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `Shell` namespace — shared navigation chrome (8 files, batched)

**Files:**
- Modify: `frontend/src/components/layout/sidebar/SidebarUserProfile.tsx`
- Modify: `frontend/src/components/layout/sidebar/SidebarCollapseToggle.tsx`
- Modify: `frontend/src/components/layout/topbar/CommandPalette.tsx`
- Modify: `frontend/src/components/layout/topbar/HelpMenu.tsx`
- Modify: `frontend/src/components/layout/topbar/NotificationsMenu.tsx`
- Modify: `frontend/src/components/layout/mobile/MobileBottomNav.tsx`
- Modify: `frontend/src/app/(school)/layout.tsx`
- Modify: `frontend/src/app/admin/layout.tsx`
- Create: `frontend/src/messages/{fr,ht,en}/shell.json`

**Interfaces:**
- Consumes: `MESSAGE_NAMESPACES` from `@/lib/locales` (Task 1).
- Produces: `Shell` namespace, consumed here and by no other task in this plan (shared subcomponents are leaves — Tasks 3–5 do not need to import from these files' new translation calls, only from `useSchoolSections`/`useAdminSections`, which is a different mechanism introduced in Tasks 3–4).

These 8 files are batched into one task because each is a small, same-shape edit (add one `useTranslations('Shell')` call, replace 1–5 hardcoded strings) sharing one namespace — batching keeps the namespace's message file creation atomic instead of split across tasks.

**Two files touched here are OUTSIDE the file list in the design spec** (`(school)/layout.tsx`, `admin/layout.tsx`) — found during this plan's own file-by-file audit: both render a mobile drawer's close button with a hardcoded `aria-label="Fermer le menu"`, and `admin/layout.tsx` also has a hardcoded `"Chargement…"` loading state. These are genuinely shell chrome (the drawer wrapper), so they're included here rather than left as a gap. `(school)/layout.tsx`'s own loading state uses a `<Skeleton>` with no text — nothing to translate there.

**Two files initially suspected of needing translation turned out NOT to** (also found during the audit, so not in this plan's earlier estimate): `frontend/src/components/layout/topbar/Breadcrumbs.tsx` and `frontend/src/components/layout/topbar/AcademicYearBadge.tsx` are both fully prop-driven / API-driven with zero hardcoded copy — confirmed by reading both files in full. Do not add a Shell import to either.

- [ ] **Step 1: Create the message files**

Create `frontend/src/messages/fr/shell.json`:

```json
{
  "sidebarUserProfile": {
    "accountOf": "Compte de {email}",
    "myProfile": "Mon profil",
    "logout": "Déconnexion"
  },
  "collapseToggle": {
    "expand": "Étendre la barre latérale",
    "collapse": "Réduire la barre latérale"
  },
  "commandPalette": {
    "trigger": "Recherche globale...",
    "dialogLabel": "Recherche globale",
    "inputPlaceholder": "Rechercher une page...",
    "noResults": "Aucun résultat."
  },
  "helpMenu": {
    "ariaLabel": "Aide",
    "title": "Besoin d'aide ?",
    "body": "Contactez l'administrateur de votre établissement pour toute question sur Schoolgesti."
  },
  "notifications": {
    "ariaLabel": "Notifications",
    "heading": "Notifications",
    "markAllRead": "Tout marquer comme lu",
    "loading": "Chargement…",
    "empty": "Aucune nouvelle notification."
  },
  "mobileNav": {
    "ariaLabel": "Navigation principale",
    "home": "Accueil",
    "students": "Élèves",
    "grades": "Notes",
    "tuition": "Scolarité",
    "more": "Plus",
    "moreAriaLabel": "Plus de menus"
  },
  "closeMenu": "Fermer le menu"
}
```

Create `frontend/src/messages/en/shell.json`:

```json
{
  "sidebarUserProfile": {
    "accountOf": "Account of {email}",
    "myProfile": "My profile",
    "logout": "Log out"
  },
  "collapseToggle": {
    "expand": "Expand sidebar",
    "collapse": "Collapse sidebar"
  },
  "commandPalette": {
    "trigger": "Global search...",
    "dialogLabel": "Global search",
    "inputPlaceholder": "Search for a page...",
    "noResults": "No results."
  },
  "helpMenu": {
    "ariaLabel": "Help",
    "title": "Need help?",
    "body": "Contact your school's administrator with any questions about Schoolgesti."
  },
  "notifications": {
    "ariaLabel": "Notifications",
    "heading": "Notifications",
    "markAllRead": "Mark all as read",
    "loading": "Loading…",
    "empty": "No new notifications."
  },
  "mobileNav": {
    "ariaLabel": "Main navigation",
    "home": "Home",
    "students": "Students",
    "grades": "Grades",
    "tuition": "Tuition",
    "more": "More",
    "moreAriaLabel": "More menus"
  },
  "closeMenu": "Close menu"
}
```

Create `frontend/src/messages/ht/shell.json`:

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "sidebarUserProfile": {
    "accountOf": "Kont {email}",
    "myProfile": "Pwofil mwen",
    "logout": "Dekonekte"
  },
  "collapseToggle": {
    "expand": "Elaji ba lateral la",
    "collapse": "Redwi ba lateral la"
  },
  "commandPalette": {
    "trigger": "Rechèch global...",
    "dialogLabel": "Rechèch global",
    "inputPlaceholder": "Chèche yon paj...",
    "noResults": "Pa gen rezilta."
  },
  "helpMenu": {
    "ariaLabel": "Èd",
    "title": "Ou bezwen èd?",
    "body": "Kontakte administratè etablisman ou pou nenpòt kesyon sou Schoolgesti."
  },
  "notifications": {
    "ariaLabel": "Notifikasyon",
    "heading": "Notifikasyon",
    "markAllRead": "Make tout kòm li",
    "loading": "Ap chaje…",
    "empty": "Pa gen nouvo notifikasyon."
  },
  "mobileNav": {
    "ariaLabel": "Navigasyon prensipal",
    "home": "Akèy",
    "students": "Elèv",
    "grades": "Nòt",
    "tuition": "Eskolarite",
    "more": "Plis",
    "moreAriaLabel": "Plis meni"
  },
  "closeMenu": "Fèmen meni a"
}
```

- [ ] **Step 2: Register the namespace**

In `frontend/src/lib/locales.ts`, change:

```ts
export const MESSAGE_NAMESPACES = ['common', 'login'] as const;
```

to:

```ts
export const MESSAGE_NAMESPACES = ['common', 'login', 'shell'] as const;
```

- [ ] **Step 3: Wire the namespace into `i18n/request.ts` and `next-intl.d.ts`**

In `frontend/src/i18n/request.ts`, change:

```ts
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
```

to:

```ts
  const [common, login, shell] = await Promise.all([
    import(`../messages/${locale}/common.json`),
    import(`../messages/${locale}/login.json`),
    import(`../messages/${locale}/shell.json`),
  ]);

  return {
    locale,
    messages: {
      Common: common.default,
      Login: login.default,
      Shell: shell.default,
    },
  };
```

In `frontend/src/types/next-intl.d.ts`, change:

```ts
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

to:

```ts
import type common from '@/messages/fr/common.json';
import type login from '@/messages/fr/login.json';
import type shell from '@/messages/fr/shell.json';
import type { LOCALE_KEYS } from '@/lib/locales';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof LOCALE_KEYS)[number];
    Messages: {
      Common: typeof common;
      Login: typeof login;
      Shell: typeof shell;
    };
  }
}
```

- [ ] **Step 4: `SidebarUserProfile.tsx`**

In `frontend/src/components/layout/sidebar/SidebarUserProfile.tsx`, change the import block:

```tsx
'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { LogOut, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/contexts/AuthContext';
```

to:

```tsx
'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { LogOut, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/contexts/AuthContext';
```

Change the component body's opening:

```tsx
export function SidebarUserProfile({
  variant,
  collapsed,
  roleLabel,
  profileHref = '/settings',
}: SidebarUserProfileProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const email = user?.email ?? '';
```

to:

```tsx
export function SidebarUserProfile({
  variant,
  collapsed,
  roleLabel,
  profileHref = '/settings',
}: SidebarUserProfileProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const t = useTranslations('Shell.sidebarUserProfile');
  const email = user?.email ?? '';
```

Change the three occurrences of hardcoded text:

```tsx
          aria-label={`Compte de ${email}`}
```

to:

```tsx
          aria-label={t('accountOf', { email })}
```

```tsx
            <UserRound size={14} />
            Mon profil
          </DropdownMenu.Item>
```

to:

```tsx
            <UserRound size={14} />
            {t('myProfile')}
          </DropdownMenu.Item>
```

```tsx
            <LogOut size={14} />
            Déconnexion
          </DropdownMenu.Item>
```

to:

```tsx
            <LogOut size={14} />
            {t('logout')}
          </DropdownMenu.Item>
```

- [ ] **Step 5: `SidebarCollapseToggle.tsx`**

In `frontend/src/components/layout/sidebar/SidebarCollapseToggle.tsx`, change:

```tsx
'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface SidebarCollapseToggleProps {
```

to:

```tsx
'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface SidebarCollapseToggleProps {
```

Change:

```tsx
export function SidebarCollapseToggle({
  collapsed,
  onToggle,
  variant,
}: SidebarCollapseToggleProps) {
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const colorClasses =
    variant === 'light'
      ? 'text-muted-foreground hover:text-foreground'
      : 'text-white/50 hover:text-white';

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? 'Étendre la barre latérale' : 'Réduire la barre latérale'}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${colorClasses}`}
    >
```

to:

```tsx
export function SidebarCollapseToggle({
  collapsed,
  onToggle,
  variant,
}: SidebarCollapseToggleProps) {
  const t = useTranslations('Shell.collapseToggle');
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const colorClasses =
    variant === 'light'
      ? 'text-muted-foreground hover:text-foreground'
      : 'text-white/50 hover:text-white';

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? t('expand') : t('collapse')}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${colorClasses}`}
    >
```

- [ ] **Step 6: `CommandPalette.tsx`**

In `frontend/src/components/layout/topbar/CommandPalette.tsx`, change:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { NavSection } from '../sidebar/types';

export function CommandPalette({ sections }: { sections: NavSection[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
```

to:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { NavSection } from '../sidebar/types';

export function CommandPalette({ sections }: { sections: NavSection[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const t = useTranslations('Shell.commandPalette');
```

Change:

```tsx
        <Search size={13} />
        <span className="flex-1 text-left">Recherche globale...</span>
```

to:

```tsx
        <Search size={13} />
        <span className="flex-1 text-left">{t('trigger')}</span>
```

Change:

```tsx
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Recherche globale"
        className="fixed top-[15%] left-1/2 z-50 w-full max-w-md -translate-x-1/2 rounded-lg border border-border bg-card p-2 shadow-xl"
      >
        <Command.Input
          placeholder="Rechercher une page..."
          className="w-full border-b border-border bg-transparent px-2 py-2 text-sm text-foreground outline-none"
        />
        <Command.List className="max-h-80 overflow-y-auto py-2">
          <Command.Empty className="px-2 py-4 text-center text-sm text-muted-foreground">
            Aucun résultat.
          </Command.Empty>
```

to:

```tsx
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label={t('dialogLabel')}
        className="fixed top-[15%] left-1/2 z-50 w-full max-w-md -translate-x-1/2 rounded-lg border border-border bg-card p-2 shadow-xl"
      >
        <Command.Input
          placeholder={t('inputPlaceholder')}
          className="w-full border-b border-border bg-transparent px-2 py-2 text-sm text-foreground outline-none"
        />
        <Command.List className="max-h-80 overflow-y-auto py-2">
          <Command.Empty className="px-2 py-4 text-center text-sm text-muted-foreground">
            {t('noResults')}
          </Command.Empty>
```

Note: `section.label`/`item.label` inside this file are already rendered dynamically (from `SCHOOL_SECTIONS`/`ADMIN_SECTIONS`, translated by Tasks 3–4) — do not touch those lines here.

- [ ] **Step 7: `HelpMenu.tsx`**

In `frontend/src/components/layout/topbar/HelpMenu.tsx`, change:

```tsx
'use client';

import * as Popover from '@radix-ui/react-popover';
import { CircleHelp } from 'lucide-react';

export function HelpMenu() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Aide"
          className="hidden h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:flex"
        >
          <CircleHelp size={17} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-64 rounded-lg border border-border bg-card p-3 text-sm shadow-xl"
        >
          <p className="font-semibold text-foreground">Besoin d&apos;aide ?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Contactez l&apos;administrateur de votre établissement pour toute question sur
            Schoolgesti.
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

to:

```tsx
'use client';

import * as Popover from '@radix-ui/react-popover';
import { CircleHelp } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function HelpMenu() {
  const t = useTranslations('Shell.helpMenu');
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={t('ariaLabel')}
          className="hidden h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:flex"
        >
          <CircleHelp size={17} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-64 rounded-lg border border-border bg-card p-3 text-sm shadow-xl"
        >
          <p className="font-semibold text-foreground">{t('title')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('body')}</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

- [ ] **Step 8: `NotificationsMenu.tsx`**

In `frontend/src/components/layout/topbar/NotificationsMenu.tsx`, change the import block:

```tsx
'use client';

import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bell } from 'lucide-react';
import { api } from '@/lib/api';
import { invalidateCache, useApi } from '@/lib/useApi';
```

to:

```tsx
'use client';

import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { invalidateCache, useApi } from '@/lib/useApi';
```

Change the component body's opening:

```tsx
export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const { data: countData, refresh: refreshCount } = useApi<NotificationsCountResponse>(COUNT_PATH);
```

to:

```tsx
export function NotificationsMenu() {
  const t = useTranslations('Shell.notifications');
  const [open, setOpen] = useState(false);
  const { data: countData, refresh: refreshCount } = useApi<NotificationsCountResponse>(COUNT_PATH);
```

Change:

```tsx
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
```

to:

```tsx
        <button
          type="button"
          aria-label={t('ariaLabel')}
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
```

Change:

```tsx
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markRead('all')}
                className="text-xs font-medium text-primary"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>
          {loading && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">Chargement…</div>
          )}
          {!loading && (listData?.items.length ?? 0) === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              Aucune nouvelle notification.
            </div>
          )}
```

to:

```tsx
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-sm font-semibold text-foreground">{t('heading')}</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markRead('all')}
                className="text-xs font-medium text-primary"
              >
                {t('markAllRead')}
              </button>
            )}
          </div>
          {loading && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              {t('loading')}
            </div>
          )}
          {!loading && (listData?.items.length ?? 0) === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              {t('empty')}
            </div>
          )}
```

Note: `n.title`/`n.body` further down (rendering individual notifications) come from the API and stay untouched — out of scope per this plan's Global Constraints.

- [ ] **Step 9: `MobileBottomNav.tsx`**

Replace the full contents of `frontend/src/components/layout/mobile/MobileBottomNav.tsx`:

```tsx
'use client';

// Phone-native bottom tab bar — replaces the topbar hamburger below `lg`
// (matches the sidebar's own `hidden lg:flex` cutoff). Curated to the 4
// screens staff reach for most on a phone; everything else (Enseignants,
// Présences, Emploi du temps, Bulletins, Appréciations, Configuration,
// Abonnement, Paramètres) stays one tap away behind « Plus », which opens
// the same drawer the sidebar used to reach via the hamburger.
import { LayoutDashboard, Menu, NotebookPen, Users, Wallet, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActiveRoute } from '../sidebar/route-match';

interface BottomNavLink {
  key: 'home' | 'students' | 'grades' | 'tuition';
  href: string;
  icon: LucideIcon;
}

const LINK_DEFS: BottomNavLink[] = [
  { key: 'home', href: '/dashboard', icon: LayoutDashboard },
  { key: 'students', href: '/eleves', icon: Users },
  { key: 'grades', href: '/pedagogie/carnet-de-notes', icon: NotebookPen },
  { key: 'tuition', href: '/scolarite', icon: Wallet },
];

export function MobileBottomNav({ onMoreClick }: { onMoreClick: () => void }) {
  const t = useTranslations('Shell.mobileNav');
  const pathname = usePathname();
  const activeHref = LINK_DEFS.find((l) => isActiveRoute(pathname, l.href))?.href ?? null;
  // Nothing in the curated 4 matched — user is in one of the "Plus" screens,
  // so the More tab reads as active too (always somewhere highlighted).
  const moreActive = activeHref === null;

  return (
    <nav
      aria-label={t('ariaLabel')}
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch bg-sidebar-light pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(26,26,46,0.08)] lg:hidden"
    >
      {LINK_DEFS.map((item) => {
        const active = item.href === activeHref;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 ${
              active ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 2} />
            <span className={`text-[10px] ${active ? 'font-semibold' : 'font-medium'}`}>
              {t(item.key)}
            </span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMoreClick}
        aria-label={t('moreAriaLabel')}
        className={`flex flex-1 flex-col items-center justify-center gap-0.5 ${
          moreActive ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        <Menu size={22} strokeWidth={moreActive ? 2.5 : 2} />
        <span className={`text-[10px] ${moreActive ? 'font-semibold' : 'font-medium'}`}>
          {t('more')}
        </span>
      </button>
    </nav>
  );
}
```

Note the `label: string` field on `BottomNavLink` became `key: 'home' | 'students' | 'grades' | 'tuition'` (a literal union matching `shell.json`'s `mobileNav` keys) instead of a hardcoded string — `t(item.key)` resolves the label at render time. The constant was also renamed `LINKS` → `LINK_DEFS` since it's no longer literally the display labels, just the route/icon/key data — confirmed via `grep -rn "MobileBottomNav" frontend/src` (Task 2's own research) that nothing outside this file imports the old `LINKS` export, so this rename is safe.

- [ ] **Step 10: `(school)/layout.tsx`**

In `frontend/src/app/(school)/layout.tsx`, change the import block:

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useUser } from '@/contexts/AuthContext';
```

to:

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useUser } from '@/contexts/AuthContext';
```

Change the component body's opening:

```tsx
export default function SchoolLayout({ children }: { children: ReactNode }) {
  const user = useUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
```

to:

```tsx
export default function SchoolLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('Shell');
  const user = useUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
```

Change:

```tsx
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Fermer le menu"
                className="absolute top-3 -right-11 flex h-9 w-9 items-center justify-center rounded-md bg-black/60 text-white"
              >
```

to:

```tsx
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label={t('closeMenu')}
                className="absolute top-3 -right-11 flex h-9 w-9 items-center justify-center rounded-md bg-black/60 text-white"
              >
```

- [ ] **Step 11: `admin/layout.tsx`**

In `frontend/src/app/admin/layout.tsx`, change the import block:

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useAdminUser } from '@/contexts/AuthContext';
```

to:

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAdminUser } from '@/contexts/AuthContext';
```

Change:

```tsx
export default function AdminLayout({ children }: { children: ReactNode }) {
  const admin = useAdminUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useSidebarCollapse();

  if (!admin) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </main>
    );
  }
```

to:

```tsx
export default function AdminLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('Shell');
  const admin = useAdminUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useSidebarCollapse();

  if (!admin) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">{t('notifications.loading')}</p>
      </main>
    );
  }
```

Change:

```tsx
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Fermer le menu"
              className="absolute top-3 -right-11 flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-white"
            >
```

to:

```tsx
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label={t('closeMenu')}
              className="absolute top-3 -right-11 flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-white"
            >
```

- [ ] **Step 12: Run the locale consistency test**

Run: `cd frontend && pnpm exec vitest run src/lib/locales.test.ts`
Expected: PASS — now covers 3 namespaces (`common`, `login`, `shell`).

- [ ] **Step 13: Format, lint, typecheck, build**

```bash
cd frontend
pnpm exec prettier --write src/lib/locales.ts src/i18n/request.ts src/types/next-intl.d.ts src/messages/*/shell.json src/components/layout/sidebar/SidebarUserProfile.tsx src/components/layout/sidebar/SidebarCollapseToggle.tsx src/components/layout/topbar/CommandPalette.tsx src/components/layout/topbar/HelpMenu.tsx src/components/layout/topbar/NotificationsMenu.tsx src/components/layout/mobile/MobileBottomNav.tsx "src/app/(school)/layout.tsx" src/app/admin/layout.tsx
pnpm exec eslint src/components/layout/sidebar/SidebarUserProfile.tsx src/components/layout/sidebar/SidebarCollapseToggle.tsx src/components/layout/topbar/CommandPalette.tsx src/components/layout/topbar/HelpMenu.tsx src/components/layout/topbar/NotificationsMenu.tsx src/components/layout/mobile/MobileBottomNav.tsx "src/app/(school)/layout.tsx" src/app/admin/layout.tsx
pnpm exec tsc --noEmit
pnpm build
```

Expected: all clean. `pnpm build` is the real integration check — a missing translation key or a broken `useTranslations` call in a client component fails the build, not just a lint rule. Sidebars/topbars are not yet migrated (Tasks 3–5), so their own untranslated strings are expected and not a regression here.

- [ ] **Step 14: Commit**

```bash
git add frontend/src/lib/locales.ts frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts frontend/src/messages/fr/shell.json frontend/src/messages/ht/shell.json frontend/src/messages/en/shell.json frontend/src/components/layout/sidebar/SidebarUserProfile.tsx frontend/src/components/layout/sidebar/SidebarCollapseToggle.tsx frontend/src/components/layout/topbar/CommandPalette.tsx frontend/src/components/layout/topbar/HelpMenu.tsx frontend/src/components/layout/topbar/NotificationsMenu.tsx frontend/src/components/layout/mobile/MobileBottomNav.tsx "frontend/src/app/(school)/layout.tsx" frontend/src/app/admin/layout.tsx
git commit -m "$(cat <<'EOF'
feat(i18n): Shell namespace — shared navigation chrome (FR/HT/EN)

Translates every cross-cutting shell subcomponent shared by both the
school and admin shells: the sidebar user-profile menu, the collapse
toggle, the command palette (Cmd+K), the help popover, the notifications
menu's static chrome (dynamic notification title/body stay server-driven,
out of scope), the mobile bottom nav, and both shells' drawer close
button — including 2 files not in the original file inventory
(app/(school)/layout.tsx, app/admin/layout.tsx) found while auditing this
task, and excluding 2 files that turned out to have no hardcoded copy
(Breadcrumbs, AcademicYearBadge — both fully prop/API-driven).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `SchoolSidebar` — school-side sidebar + section-data hook

**Files:**
- Modify: `frontend/src/components/layout/SchoolSidebar.tsx`
- Modify: `frontend/src/components/layout/SchoolTopbar.tsx` (import-site fix only — full translation happens in Task 5)
- Create: `frontend/src/messages/{fr,ht,en}/schoolSidebar.json`

**Interfaces:**
- Consumes: `MESSAGE_NAMESPACES` from `@/lib/locales` (Task 1).
- Produces: `useSchoolSections(): NavSection[]` — a hook, replacing the module-level `SCHOOL_SECTIONS` constant. `SchoolTopbar.tsx` (Task 5's file) and any future consumer must call this as a hook, not import a static array.

`SCHOOL_SECTIONS` today is a module-level array consumed by both `SchoolSidebar.tsx` (its own nav) and `SchoolTopbar.tsx` (`getBreadcrumbTrail` + `CommandPalette`). Since translated labels require `useTranslations` — a hook, callable only inside a component/hook body — the array becomes a hook. This task converts it and fixes `SchoolTopbar.tsx`'s two call sites (mechanical: swap the import and call the hook) so the build stays green; `SchoolTopbar.tsx`'s OWN remaining strings (`pageTitle` fallback, `"Schoolgesti"` root label) are Task 5's job, not this one's — `SchoolTopbar.tsx` is intentionally touched by both tasks.

- [ ] **Step 1: Create the message files**

Create `frontend/src/messages/fr/schoolSidebar.json`:

```json
{
  "roleLabel": "Administratrice",
  "sections": {
    "main": {
      "label": "Principal",
      "dashboard": "Tableau de bord",
      "students": "Élèves",
      "teachers": "Enseignants"
    },
    "pedagogy": {
      "label": "Pédagogie",
      "gradebook": "Carnet de notes",
      "attendance": "Présences",
      "timetable": "Emploi du temps",
      "reportCards": "Bulletins",
      "assessments": "Appréciations"
    },
    "tuition": {
      "label": "Scolarité",
      "feesAndTuition": "Frais & Scolarité"
    },
    "configuration": {
      "label": "Configuration",
      "classes": "Classes",
      "gradeLevels": "Niveaux",
      "rooms": "Salles",
      "subjects": "Matières",
      "reportCardTemplate": "Modèle de bulletin"
    },
    "account": {
      "label": "Compte",
      "subscription": "Abonnement",
      "settings": "Paramètres"
    }
  }
}
```

Create `frontend/src/messages/en/schoolSidebar.json`:

```json
{
  "roleLabel": "Administrator",
  "sections": {
    "main": {
      "label": "Main",
      "dashboard": "Dashboard",
      "students": "Students",
      "teachers": "Teachers"
    },
    "pedagogy": {
      "label": "Teaching",
      "gradebook": "Gradebook",
      "attendance": "Attendance",
      "timetable": "Timetable",
      "reportCards": "Report cards",
      "assessments": "Assessments"
    },
    "tuition": {
      "label": "Tuition",
      "feesAndTuition": "Fees & Tuition"
    },
    "configuration": {
      "label": "Configuration",
      "classes": "Classes",
      "gradeLevels": "Grade levels",
      "rooms": "Rooms",
      "subjects": "Subjects",
      "reportCardTemplate": "Report card template"
    },
    "account": {
      "label": "Account",
      "subscription": "Subscription",
      "settings": "Settings"
    }
  }
}
```

Create `frontend/src/messages/ht/schoolSidebar.json`:

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "roleLabel": "Administratris",
  "sections": {
    "main": {
      "label": "Prensipal",
      "dashboard": "Tablodbò",
      "students": "Elèv",
      "teachers": "Pwofesè"
    },
    "pedagogy": {
      "label": "Pedagoji",
      "gradebook": "Kanè nòt",
      "attendance": "Prezans",
      "timetable": "Orè klas",
      "reportCards": "Bilten",
      "assessments": "Apresyasyon"
    },
    "tuition": {
      "label": "Eskolarite",
      "feesAndTuition": "Frè & Eskolarite"
    },
    "configuration": {
      "label": "Konfigirasyon",
      "classes": "Klas",
      "gradeLevels": "Nivo",
      "rooms": "Sal",
      "subjects": "Matyè",
      "reportCardTemplate": "Modèl bilten"
    },
    "account": {
      "label": "Kont",
      "subscription": "Abònman",
      "settings": "Paramèt"
    }
  }
}
```

- [ ] **Step 2: Register the namespace**

In `frontend/src/lib/locales.ts`, change:

```ts
export const MESSAGE_NAMESPACES = ['common', 'login', 'shell'] as const;
```

to:

```ts
export const MESSAGE_NAMESPACES = ['common', 'login', 'shell', 'schoolSidebar'] as const;
```

- [ ] **Step 3: Wire the namespace into `i18n/request.ts` and `next-intl.d.ts`**

In `frontend/src/i18n/request.ts`, change:

```ts
  const [common, login, shell] = await Promise.all([
    import(`../messages/${locale}/common.json`),
    import(`../messages/${locale}/login.json`),
    import(`../messages/${locale}/shell.json`),
  ]);

  return {
    locale,
    messages: {
      Common: common.default,
      Login: login.default,
      Shell: shell.default,
    },
  };
```

to:

```ts
  const [common, login, shell, schoolSidebar] = await Promise.all([
    import(`../messages/${locale}/common.json`),
    import(`../messages/${locale}/login.json`),
    import(`../messages/${locale}/shell.json`),
    import(`../messages/${locale}/schoolSidebar.json`),
  ]);

  return {
    locale,
    messages: {
      Common: common.default,
      Login: login.default,
      Shell: shell.default,
      SchoolSidebar: schoolSidebar.default,
    },
  };
```

In `frontend/src/types/next-intl.d.ts`, change:

```ts
import type common from '@/messages/fr/common.json';
import type login from '@/messages/fr/login.json';
import type shell from '@/messages/fr/shell.json';
import type { LOCALE_KEYS } from '@/lib/locales';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof LOCALE_KEYS)[number];
    Messages: {
      Common: typeof common;
      Login: typeof login;
      Shell: typeof shell;
    };
  }
}
```

to:

```ts
import type common from '@/messages/fr/common.json';
import type login from '@/messages/fr/login.json';
import type shell from '@/messages/fr/shell.json';
import type schoolSidebar from '@/messages/fr/schoolSidebar.json';
import type { LOCALE_KEYS } from '@/lib/locales';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof LOCALE_KEYS)[number];
    Messages: {
      Common: typeof common;
      Login: typeof login;
      Shell: typeof shell;
      SchoolSidebar: typeof schoolSidebar;
    };
  }
}
```

- [ ] **Step 4: Rewrite `SchoolSidebar.tsx`**

Replace the full contents of `frontend/src/components/layout/SchoolSidebar.tsx`:

```tsx
// frontend/src/components/layout/SchoolSidebar.tsx
'use client';

import {
  DoorOpen,
  BookOpen,
  CalendarCheck,
  CreditCard,
  FileText,
  LayoutDashboard,
  LayoutTemplate,
  ListOrdered,
  NotebookPen,
  School as SchoolIcon,
  Settings,
  Star,
  UserCheck,
  Users,
  Wallet,
  CalendarDays,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useMemo } from 'react';
import { SidebarPlanCard } from '@/components/school/billing/SidebarPlanCard';
import { useSchoolPlan } from '@/contexts/SchoolPlanContext';
import { Sidebar } from './sidebar/Sidebar';
import { filterSectionsByRole, type NavSection } from './sidebar/types';

// Spec: .planning/banani/epic-0-shell.md — school shell sidebar (light).
// SCHOOL_SECTIONS used to be a static module-level array; translated
// labels need next-intl's useTranslations, a hook, so this is now a hook
// too — called by this file's own SchoolSidebar AND by SchoolTopbar.tsx
// (breadcrumbs + command palette both need the same translated sections).
export function useSchoolSections(): NavSection[] {
  const t = useTranslations('SchoolSidebar.sections');
  return useMemo<NavSection[]>(
    () => [
      {
        label: t('main.label'),
        items: [
          { label: t('main.dashboard'), href: '/dashboard', icon: LayoutDashboard },
          { label: t('main.students'), href: '/eleves', icon: Users },
          { label: t('main.teachers'), href: '/enseignants', icon: UserCheck },
        ],
      },
      {
        label: t('pedagogy.label'),
        items: [
          {
            label: t('pedagogy.gradebook'),
            href: '/pedagogie/carnet-de-notes',
            icon: NotebookPen,
          },
          { label: t('pedagogy.attendance'), href: '/pedagogie/presences', icon: CalendarCheck },
          {
            label: t('pedagogy.timetable'),
            href: '/pedagogie/emploi-du-temps',
            icon: CalendarDays,
          },
          { label: t('pedagogy.reportCards'), href: '/bulletins', icon: FileText },
          { label: t('pedagogy.assessments'), href: '/pedagogie/appreciations', icon: Star },
        ],
      },
      {
        label: t('tuition.label'),
        items: [{ label: t('tuition.feesAndTuition'), href: '/scolarite', icon: Wallet }],
      },
      {
        label: t('configuration.label'),
        items: [
          { label: t('configuration.classes'), href: '/configuration/classes', icon: SchoolIcon },
          {
            label: t('configuration.gradeLevels'),
            href: '/configuration/niveaux',
            icon: ListOrdered,
          },
          { label: t('configuration.rooms'), href: '/configuration/salles', icon: DoorOpen },
          { label: t('configuration.subjects'), href: '/configuration/matieres', icon: BookOpen },
          {
            label: t('configuration.reportCardTemplate'),
            href: '/configuration/modele-bulletin',
            icon: LayoutTemplate,
          },
        ],
      },
      {
        label: t('account.label'),
        items: [
          // OWNER/ADMIN only — amounts and invoices (server: GET /api/school/billing → 403 for MEMBER).
          {
            label: t('account.subscription'),
            href: '/abonnement',
            icon: CreditCard,
            minRole: 'ADMIN',
          },
          { label: t('account.settings'), href: '/settings', icon: Settings },
        ],
      },
    ],
    [t],
  );
}

interface SchoolSidebarProps {
  onNavigate?: (() => void) | undefined;
  collapsed?: boolean;
  onToggleCollapse?: (() => void) | undefined;
}

export function SchoolSidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: SchoolSidebarProps) {
  const t = useTranslations('SchoolSidebar');
  const { role } = useSchoolPlan();
  const sections = useSchoolSections();
  const filteredSections = useMemo(
    () => filterSectionsByRole(sections, role),
    [sections, role],
  );
  return (
    <Sidebar
      sections={filteredSections}
      variant="light"
      brand={
        <Image
          src="/logos/schoolgesti-lockup.svg"
          alt="Schoolgesti"
          width={164}
          height={44}
          className="h-10 w-auto"
          priority
        />
      }
      brandCollapsed={
        <Image src="/logos/schoolgesti-monogramme.svg" alt="Schoolgesti" width={34} height={34} />
      }
      roleLabel={t('roleLabel')}
      profileHref="/settings"
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      onNavigate={onNavigate}
      footer={<SidebarPlanCard onNavigate={onNavigate} />}
      footerCollapsed={<SidebarPlanCard collapsed onNavigate={onNavigate} />}
    />
  );
}
```

Note what changed beyond string replacement: `SCHOOL_SECTIONS` (module-level array export) became `useSchoolSections()` (an exported hook using `useMemo` so the array isn't rebuilt every render — `t` is a stable reference across renders for the same locale, so `[t]` as the dependency is correct and matches how a translated derived value is normally memoized). `filterSectionsByRole(SCHOOL_SECTIONS, role)` inline became a `sections`/`filteredSections` two-step (`useSchoolSections()` then `filterSectionsByRole`) since a hook can't be called with a value that was itself just computed by another hook in the same expression under React's rules — this is a mechanical restructuring, not a behavior change.

- [ ] **Step 5: Fix `SchoolTopbar.tsx`'s import site (mechanical only — full translation is Task 5)**

In `frontend/src/components/layout/SchoolTopbar.tsx`, change:

```tsx
'use client';

import { usePathname } from 'next/navigation';
import { SCHOOL_SECTIONS } from './SchoolSidebar';
import { AcademicYearBadge } from './topbar/AcademicYearBadge';
```

to:

```tsx
'use client';

import { usePathname } from 'next/navigation';
import { useSchoolSections } from './SchoolSidebar';
import { AcademicYearBadge } from './topbar/AcademicYearBadge';
```

Change:

```tsx
export function SchoolTopbar() {
  const pathname = usePathname();
  const trail = getBreadcrumbTrail(pathname, SCHOOL_SECTIONS, EXTRA_LABELS);
```

to:

```tsx
export function SchoolTopbar() {
  const pathname = usePathname();
  const sections = useSchoolSections();
  const trail = getBreadcrumbTrail(pathname, sections, EXTRA_LABELS);
```

Change:

```tsx
        <CommandPalette sections={SCHOOL_SECTIONS} />
```

to:

```tsx
        <CommandPalette sections={sections} />
```

This is the ONLY change this task makes to `SchoolTopbar.tsx` — its `pageTitle` fallback string and the `<span>Schoolgesti</span>` root label are untouched here (Task 5's job). This keeps the build green after this task without pulling Task 5's work forward.

- [ ] **Step 6: Run the locale consistency test**

Run: `cd frontend && pnpm exec vitest run src/lib/locales.test.ts`
Expected: PASS — now covers 4 namespaces.

- [ ] **Step 7: Format, lint, typecheck, build**

```bash
cd frontend
pnpm exec prettier --write src/lib/locales.ts src/i18n/request.ts src/types/next-intl.d.ts src/messages/*/schoolSidebar.json src/components/layout/SchoolSidebar.tsx src/components/layout/SchoolTopbar.tsx
pnpm exec eslint src/components/layout/SchoolSidebar.tsx src/components/layout/SchoolTopbar.tsx
pnpm exec tsc --noEmit
pnpm build
```

Expected: all clean.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/locales.ts frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts frontend/src/messages/fr/schoolSidebar.json frontend/src/messages/ht/schoolSidebar.json frontend/src/messages/en/schoolSidebar.json frontend/src/components/layout/SchoolSidebar.tsx frontend/src/components/layout/SchoolTopbar.tsx
git commit -m "$(cat <<'EOF'
feat(i18n): SchoolSidebar — school shell navigation (FR/HT/EN)

SCHOOL_SECTIONS becomes useSchoolSections(), a hook — translated labels
need useTranslations, which only works inside a component/hook body.
SchoolTopbar.tsx's two call sites (breadcrumbs, command palette) switch
to calling the hook; SchoolTopbar's own remaining strings land in a later
task in this plan.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `AdminSidebar` — admin shell navigation + section-data hook

**Files:**
- Modify: `frontend/src/components/layout/AdminSidebar.tsx`
- Modify: `frontend/src/components/layout/AdminTopbar.tsx` (import-site fix only — full translation happens in Task 5)
- Create: `frontend/src/messages/{fr,ht,en}/adminSidebar.json`

**Interfaces:**
- Consumes: `MESSAGE_NAMESPACES` from `@/lib/locales` (Task 1).
- Produces: `useAdminSections(): NavSection[]` — same pattern as Task 3's `useSchoolSections()`.

Same shape as Task 3, applied to the admin shell.

- [ ] **Step 1: Create the message files**

Create `frontend/src/messages/fr/adminSidebar.json`:

```json
{
  "roleLabel": "Propriétaire SaaS",
  "footerBackToSchool": "Retour à l'interface école",
  "sections": {
    "overview": {
      "label": "Vue globale",
      "dashboard": "Tableau de bord",
      "statistics": "Statistiques"
    },
    "customers": {
      "label": "Clients",
      "schools": "Écoles",
      "users": "Utilisateurs"
    },
    "billing": {
      "label": "Facturation",
      "subscriptions": "Abonnements",
      "transactions": "Transactions",
      "coupons": "Coupons"
    },
    "system": {
      "label": "Système",
      "reportCardTemplates": "Modèles de bulletin",
      "systemSettings": "Paramètres système"
    }
  }
}
```

Create `frontend/src/messages/en/adminSidebar.json`:

```json
{
  "roleLabel": "SaaS Owner",
  "footerBackToSchool": "Back to the school interface",
  "sections": {
    "overview": {
      "label": "Overview",
      "dashboard": "Dashboard",
      "statistics": "Statistics"
    },
    "customers": {
      "label": "Customers",
      "schools": "Schools",
      "users": "Users"
    },
    "billing": {
      "label": "Billing",
      "subscriptions": "Subscriptions",
      "transactions": "Transactions",
      "coupons": "Coupons"
    },
    "system": {
      "label": "System",
      "reportCardTemplates": "Report card templates",
      "systemSettings": "System settings"
    }
  }
}
```

Create `frontend/src/messages/ht/adminSidebar.json`:

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "roleLabel": "Pwopriyetè SaaS",
  "footerBackToSchool": "Retounen nan entèfas lekòl la",
  "sections": {
    "overview": {
      "label": "Vi jeneral",
      "dashboard": "Tablodbò",
      "statistics": "Estatistik"
    },
    "customers": {
      "label": "Kliyan",
      "schools": "Lekòl",
      "users": "Itilizatè"
    },
    "billing": {
      "label": "Faktirasyon",
      "subscriptions": "Abònman",
      "transactions": "Tranzaksyon",
      "coupons": "Koupon"
    },
    "system": {
      "label": "Sistèm",
      "reportCardTemplates": "Modèl bilten",
      "systemSettings": "Paramèt sistèm"
    }
  }
}
```

- [ ] **Step 2: Register the namespace**

In `frontend/src/lib/locales.ts`, change:

```ts
export const MESSAGE_NAMESPACES = ['common', 'login', 'shell', 'schoolSidebar'] as const;
```

to:

```ts
export const MESSAGE_NAMESPACES = [
  'common',
  'login',
  'shell',
  'schoolSidebar',
  'adminSidebar',
] as const;
```

- [ ] **Step 3: Wire the namespace into `i18n/request.ts` and `next-intl.d.ts`**

In `frontend/src/i18n/request.ts`, change:

```ts
  const [common, login, shell, schoolSidebar] = await Promise.all([
    import(`../messages/${locale}/common.json`),
    import(`../messages/${locale}/login.json`),
    import(`../messages/${locale}/shell.json`),
    import(`../messages/${locale}/schoolSidebar.json`),
  ]);

  return {
    locale,
    messages: {
      Common: common.default,
      Login: login.default,
      Shell: shell.default,
      SchoolSidebar: schoolSidebar.default,
    },
  };
```

to:

```ts
  const [common, login, shell, schoolSidebar, adminSidebar] = await Promise.all([
    import(`../messages/${locale}/common.json`),
    import(`../messages/${locale}/login.json`),
    import(`../messages/${locale}/shell.json`),
    import(`../messages/${locale}/schoolSidebar.json`),
    import(`../messages/${locale}/adminSidebar.json`),
  ]);

  return {
    locale,
    messages: {
      Common: common.default,
      Login: login.default,
      Shell: shell.default,
      SchoolSidebar: schoolSidebar.default,
      AdminSidebar: adminSidebar.default,
    },
  };
```

In `frontend/src/types/next-intl.d.ts`, change:

```ts
import type common from '@/messages/fr/common.json';
import type login from '@/messages/fr/login.json';
import type shell from '@/messages/fr/shell.json';
import type schoolSidebar from '@/messages/fr/schoolSidebar.json';
import type { LOCALE_KEYS } from '@/lib/locales';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof LOCALE_KEYS)[number];
    Messages: {
      Common: typeof common;
      Login: typeof login;
      Shell: typeof shell;
      SchoolSidebar: typeof schoolSidebar;
    };
  }
}
```

to:

```ts
import type common from '@/messages/fr/common.json';
import type login from '@/messages/fr/login.json';
import type shell from '@/messages/fr/shell.json';
import type schoolSidebar from '@/messages/fr/schoolSidebar.json';
import type adminSidebar from '@/messages/fr/adminSidebar.json';
import type { LOCALE_KEYS } from '@/lib/locales';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof LOCALE_KEYS)[number];
    Messages: {
      Common: typeof common;
      Login: typeof login;
      Shell: typeof shell;
      SchoolSidebar: typeof schoolSidebar;
      AdminSidebar: typeof adminSidebar;
    };
  }
}
```

- [ ] **Step 4: Rewrite `AdminSidebar.tsx`**

Replace the full contents of `frontend/src/components/layout/AdminSidebar.tsx`:

```tsx
// frontend/src/components/layout/AdminSidebar.tsx
'use client';

import {
  Activity,
  ArrowLeft,
  CreditCard,
  LayoutDashboard,
  LayoutTemplate,
  Receipt,
  School,
  Settings,
  Tag,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';
import { Sidebar } from './sidebar/Sidebar';
import type { NavSection } from './sidebar/types';

// Spec: .planning/banani/epic-0-shell.md — SaaS admin shell sidebar.
// ADMIN_SECTIONS used to be a static module-level array; translated
// labels need next-intl's useTranslations, a hook, so this is now a hook
// too — called by this file's own AdminSidebar AND by AdminTopbar.tsx
// (breadcrumbs + command palette both need the same translated sections).
export function useAdminSections(): NavSection[] {
  const t = useTranslations('AdminSidebar.sections');
  return useMemo<NavSection[]>(
    () => [
      {
        label: t('overview.label'),
        items: [
          { label: t('overview.dashboard'), href: '/admin', icon: LayoutDashboard },
          { label: t('overview.statistics'), href: '/admin/statistics', icon: Activity },
        ],
      },
      {
        label: t('customers.label'),
        items: [
          { label: t('customers.schools'), href: '/admin/schools', icon: School },
          { label: t('customers.users'), href: '/admin/users', icon: Users },
        ],
      },
      {
        label: t('billing.label'),
        items: [
          {
            label: t('billing.subscriptions'),
            href: '/admin/billing/subscriptions',
            icon: CreditCard,
          },
          { label: t('billing.transactions'), href: '/admin/billing/transactions', icon: Receipt },
          { label: t('billing.coupons'), href: '/admin/billing/coupons', icon: Tag },
        ],
      },
      {
        label: t('system.label'),
        items: [
          {
            label: t('system.reportCardTemplates'),
            href: '/admin/system/bulletin-templates',
            icon: LayoutTemplate,
          },
          { label: t('system.systemSettings'), href: '/admin/system/settings', icon: Settings },
        ],
      },
    ],
    [t],
  );
}

interface AdminSidebarProps {
  onNavigate?: (() => void) | undefined;
  collapsed?: boolean;
  onToggleCollapse?: (() => void) | undefined;
}

export function AdminSidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: AdminSidebarProps) {
  const t = useTranslations('AdminSidebar');
  const sections = useAdminSections();
  return (
    <Sidebar
      sections={sections}
      variant="dark"
      brand={
        <div className="flex flex-col gap-0.5">
          <Image
            src="/logos/schoolgesti-lockup-blanc.svg"
            alt="Schoolgesti"
            width={164}
            height={44}
            className="h-7 w-auto"
            priority
          />
          <div className="w-fit rounded-full bg-primary/22 px-1.5 py-px text-[9px] font-bold tracking-wide text-primary uppercase">
            Administration
          </div>
        </div>
      }
      brandCollapsed={
        <Image
          src="/logos/schoolgesti-monogramme-blanc.svg"
          alt="Schoolgesti"
          width={34}
          height={34}
        />
      }
      roleLabel={t('roleLabel')}
      // /admin has no page.tsx yet (hard 404); /settings NO_SCHOOL-redirects
      // to / gracefully for an admin with no school membership — the lesser
      // of two broken destinations until a real admin profile page exists.
      profileHref="/settings"
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      footer={
        <Link
          href="/"
          className="mb-2 flex min-h-11 items-center gap-2 rounded-md px-2.5 text-2xs text-white/38"
        >
          <ArrowLeft size={12} className="shrink-0" />
          {t('footerBackToSchool')}
        </Link>
      }
      onNavigate={onNavigate}
    />
  );
}
```

Note: `"Administration"` (the small badge under the logo) is left hardcoded here on purpose — it reads the same way in French and English, and is arguably closer to a product-area label than a translatable sentence; it is NOT in `adminSidebar.json`. Flag this in your self-review rather than silently deciding — if you disagree, note it as a concern in your report rather than changing it unilaterally, since this exact word choice was a judgment call made while writing this plan, not verified against the design spec.

- [ ] **Step 5: Fix `AdminTopbar.tsx`'s import site (mechanical only — full translation is Task 5)**

In `frontend/src/components/layout/AdminTopbar.tsx`, change:

```tsx
'use client';

import { Menu, Shield } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { ADMIN_SECTIONS } from './AdminSidebar';
import { Breadcrumbs } from './topbar/Breadcrumbs';
```

to:

```tsx
'use client';

import { Menu, Shield } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useAdminSections } from './AdminSidebar';
import { Breadcrumbs } from './topbar/Breadcrumbs';
```

Change:

```tsx
export function AdminTopbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const trail = getBreadcrumbTrail(pathname, ADMIN_SECTIONS, EXTRA_LABELS);
```

to:

```tsx
export function AdminTopbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const sections = useAdminSections();
  const trail = getBreadcrumbTrail(pathname, sections, EXTRA_LABELS);
```

Change:

```tsx
        <CommandPalette sections={ADMIN_SECTIONS} />
```

to:

```tsx
        <CommandPalette sections={sections} />
```

This is the ONLY change this task makes to `AdminTopbar.tsx` — its `"Ouvrir le menu"` aria-label and `"Administration"` root label are untouched here (Task 5's job).

- [ ] **Step 6: Run the locale consistency test**

Run: `cd frontend && pnpm exec vitest run src/lib/locales.test.ts`
Expected: PASS — now covers 5 namespaces.

- [ ] **Step 7: Format, lint, typecheck, build**

```bash
cd frontend
pnpm exec prettier --write src/lib/locales.ts src/i18n/request.ts src/types/next-intl.d.ts src/messages/*/adminSidebar.json src/components/layout/AdminSidebar.tsx src/components/layout/AdminTopbar.tsx
pnpm exec eslint src/components/layout/AdminSidebar.tsx src/components/layout/AdminTopbar.tsx
pnpm exec tsc --noEmit
pnpm build
```

Expected: all clean.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/locales.ts frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts frontend/src/messages/fr/adminSidebar.json frontend/src/messages/ht/adminSidebar.json frontend/src/messages/en/adminSidebar.json frontend/src/components/layout/AdminSidebar.tsx frontend/src/components/layout/AdminTopbar.tsx
git commit -m "$(cat <<'EOF'
feat(i18n): AdminSidebar — SaaS admin shell navigation (FR/HT/EN)

Same pattern as SchoolSidebar: ADMIN_SECTIONS becomes useAdminSections(),
a hook, since translated labels need useTranslations. AdminTopbar.tsx's
two call sites switch to calling the hook; its own remaining strings
land in the next task.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `SchoolTopbar` + `AdminTopbar` — remaining topbar strings (batched)

**Files:**
- Modify: `frontend/src/components/layout/SchoolTopbar.tsx`
- Modify: `frontend/src/components/layout/AdminTopbar.tsx`
- Create: `frontend/src/messages/{fr,ht,en}/schoolTopbar.json`
- Create: `frontend/src/messages/{fr,ht,en}/adminTopbar.json`

**Interfaces:**
- Consumes: `MESSAGE_NAMESPACES` from `@/lib/locales` (Task 1); `useSchoolSections`/`useAdminSections` already wired in by Tasks 3–4 (unchanged here).
- Produces: `SchoolTopbar`/`AdminTopbar` namespaces — leaves, nothing later in this plan consumes them.

Both files are tiny (one remaining string each on `SchoolTopbar`, two on `AdminTopbar`) — batched into one task since each is a same-shape one-line edit, following this plan's own precedent (Task 2).

- [ ] **Step 1: Create the message files**

Create `frontend/src/messages/fr/schoolTopbar.json`:

```json
{
  "defaultPageTitle": "Tableau de bord"
}
```

Create `frontend/src/messages/en/schoolTopbar.json`:

```json
{
  "defaultPageTitle": "Dashboard"
}
```

Create `frontend/src/messages/ht/schoolTopbar.json`:

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "defaultPageTitle": "Tablodbò"
}
```

Create `frontend/src/messages/fr/adminTopbar.json`:

```json
{
  "openMenuAriaLabel": "Ouvrir le menu",
  "rootLabel": "Administration"
}
```

Create `frontend/src/messages/en/adminTopbar.json`:

```json
{
  "openMenuAriaLabel": "Open menu",
  "rootLabel": "Administration"
}
```

Create `frontend/src/messages/ht/adminTopbar.json`:

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "openMenuAriaLabel": "Ouvri meni a",
  "rootLabel": "Administrasyon"
}
```

- [ ] **Step 2: Register both namespaces**

In `frontend/src/lib/locales.ts`, change:

```ts
export const MESSAGE_NAMESPACES = [
  'common',
  'login',
  'shell',
  'schoolSidebar',
  'adminSidebar',
] as const;
```

to:

```ts
export const MESSAGE_NAMESPACES = [
  'common',
  'login',
  'shell',
  'schoolSidebar',
  'adminSidebar',
  'schoolTopbar',
  'adminTopbar',
] as const;
```

- [ ] **Step 3: Wire both namespaces into `i18n/request.ts` and `next-intl.d.ts`**

In `frontend/src/i18n/request.ts`, change:

```ts
  const [common, login, shell, schoolSidebar, adminSidebar] = await Promise.all([
    import(`../messages/${locale}/common.json`),
    import(`../messages/${locale}/login.json`),
    import(`../messages/${locale}/shell.json`),
    import(`../messages/${locale}/schoolSidebar.json`),
    import(`../messages/${locale}/adminSidebar.json`),
  ]);

  return {
    locale,
    messages: {
      Common: common.default,
      Login: login.default,
      Shell: shell.default,
      SchoolSidebar: schoolSidebar.default,
      AdminSidebar: adminSidebar.default,
    },
  };
```

to:

```ts
  const [common, login, shell, schoolSidebar, adminSidebar, schoolTopbar, adminTopbar] =
    await Promise.all([
      import(`../messages/${locale}/common.json`),
      import(`../messages/${locale}/login.json`),
      import(`../messages/${locale}/shell.json`),
      import(`../messages/${locale}/schoolSidebar.json`),
      import(`../messages/${locale}/adminSidebar.json`),
      import(`../messages/${locale}/schoolTopbar.json`),
      import(`../messages/${locale}/adminTopbar.json`),
    ]);

  return {
    locale,
    messages: {
      Common: common.default,
      Login: login.default,
      Shell: shell.default,
      SchoolSidebar: schoolSidebar.default,
      AdminSidebar: adminSidebar.default,
      SchoolTopbar: schoolTopbar.default,
      AdminTopbar: adminTopbar.default,
    },
  };
```

In `frontend/src/types/next-intl.d.ts`, change:

```ts
import type common from '@/messages/fr/common.json';
import type login from '@/messages/fr/login.json';
import type shell from '@/messages/fr/shell.json';
import type schoolSidebar from '@/messages/fr/schoolSidebar.json';
import type adminSidebar from '@/messages/fr/adminSidebar.json';
import type { LOCALE_KEYS } from '@/lib/locales';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof LOCALE_KEYS)[number];
    Messages: {
      Common: typeof common;
      Login: typeof login;
      Shell: typeof shell;
      SchoolSidebar: typeof schoolSidebar;
      AdminSidebar: typeof adminSidebar;
    };
  }
}
```

to:

```ts
import type common from '@/messages/fr/common.json';
import type login from '@/messages/fr/login.json';
import type shell from '@/messages/fr/shell.json';
import type schoolSidebar from '@/messages/fr/schoolSidebar.json';
import type adminSidebar from '@/messages/fr/adminSidebar.json';
import type schoolTopbar from '@/messages/fr/schoolTopbar.json';
import type adminTopbar from '@/messages/fr/adminTopbar.json';
import type { LOCALE_KEYS } from '@/lib/locales';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof LOCALE_KEYS)[number];
    Messages: {
      Common: typeof common;
      Login: typeof login;
      Shell: typeof shell;
      SchoolSidebar: typeof schoolSidebar;
      AdminSidebar: typeof adminSidebar;
      SchoolTopbar: typeof schoolTopbar;
      AdminTopbar: typeof adminTopbar;
    };
  }
}
```

- [ ] **Step 4: `SchoolTopbar.tsx`'s remaining string**

In `frontend/src/components/layout/SchoolTopbar.tsx`, change the import block:

```tsx
'use client';

import { usePathname } from 'next/navigation';
import { useSchoolSections } from './SchoolSidebar';
import { AcademicYearBadge } from './topbar/AcademicYearBadge';
import { Breadcrumbs } from './topbar/Breadcrumbs';
import { getBreadcrumbTrail } from './topbar/breadcrumb';
import { CommandPalette } from './topbar/CommandPalette';
import { HelpMenu } from './topbar/HelpMenu';
import { NotificationsMenu } from './topbar/NotificationsMenu';
```

to:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useSchoolSections } from './SchoolSidebar';
import { AcademicYearBadge } from './topbar/AcademicYearBadge';
import { Breadcrumbs } from './topbar/Breadcrumbs';
import { getBreadcrumbTrail } from './topbar/breadcrumb';
import { CommandPalette } from './topbar/CommandPalette';
import { HelpMenu } from './topbar/HelpMenu';
import { NotificationsMenu } from './topbar/NotificationsMenu';
```

Change:

```tsx
export function SchoolTopbar() {
  const pathname = usePathname();
  const sections = useSchoolSections();
  const trail = getBreadcrumbTrail(pathname, sections, EXTRA_LABELS);
  // Breadcrumbs only render from `sm` up — below that a phone gets this
  // single-line page title instead (there's no hamburger anymore, the
  // MobileBottomNav owns navigation, so the topbar's only job on a phone is
  // to say where you are).
  const pageTitle = trail[trail.length - 1] ?? 'Tableau de bord';
```

to:

```tsx
export function SchoolTopbar() {
  const t = useTranslations('SchoolTopbar');
  const pathname = usePathname();
  const sections = useSchoolSections();
  const trail = getBreadcrumbTrail(pathname, sections, EXTRA_LABELS);
  // Breadcrumbs only render from `sm` up — below that a phone gets this
  // single-line page title instead (there's no hamburger anymore, the
  // MobileBottomNav owns navigation, so the topbar's only job on a phone is
  // to say where you are).
  const pageTitle = trail[trail.length - 1] ?? t('defaultPageTitle');
```

`"Schoolgesti"` in `<Breadcrumbs root={<span>Schoolgesti</span>} trail={trail} />` stays hardcoded — it's the brand name, matching the `alt="Schoolgesti"` precedent from `/login` (Phase 0). Do not touch that line.

- [ ] **Step 5: `AdminTopbar.tsx`'s remaining strings**

In `frontend/src/components/layout/AdminTopbar.tsx`, change the import block:

```tsx
'use client';

import { Menu, Shield } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useAdminSections } from './AdminSidebar';
import { Breadcrumbs } from './topbar/Breadcrumbs';
import { getBreadcrumbTrail } from './topbar/breadcrumb';
import { CommandPalette } from './topbar/CommandPalette';
import { HelpMenu } from './topbar/HelpMenu';
import { NotificationsMenu } from './topbar/NotificationsMenu';
```

to:

```tsx
'use client';

import { Menu, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useAdminSections } from './AdminSidebar';
import { Breadcrumbs } from './topbar/Breadcrumbs';
import { getBreadcrumbTrail } from './topbar/breadcrumb';
import { CommandPalette } from './topbar/CommandPalette';
import { HelpMenu } from './topbar/HelpMenu';
import { NotificationsMenu } from './topbar/NotificationsMenu';
```

Change:

```tsx
export function AdminTopbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const sections = useAdminSections();
  const trail = getBreadcrumbTrail(pathname, sections, EXTRA_LABELS);

  return (
    <header className="flex h-13 shrink-0 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Ouvrir le menu"
          className="flex h-11 w-11 items-center justify-center text-muted-foreground lg:hidden"
        >
          <Menu size={20} />
        </button>
        <Breadcrumbs
          root={
            <span className="flex items-center gap-1.5">
              <Shield size={13} className="text-primary" />
              Administration
            </span>
          }
          trail={trail}
        />
      </div>
```

to:

```tsx
export function AdminTopbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const t = useTranslations('AdminTopbar');
  const pathname = usePathname();
  const sections = useAdminSections();
  const trail = getBreadcrumbTrail(pathname, sections, EXTRA_LABELS);

  return (
    <header className="flex h-13 shrink-0 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label={t('openMenuAriaLabel')}
          className="flex h-11 w-11 items-center justify-center text-muted-foreground lg:hidden"
        >
          <Menu size={20} />
        </button>
        <Breadcrumbs
          root={
            <span className="flex items-center gap-1.5">
              <Shield size={13} className="text-primary" />
              {t('rootLabel')}
            </span>
          }
          trail={trail}
        />
      </div>
```

- [ ] **Step 6: Run the locale consistency test**

Run: `cd frontend && pnpm exec vitest run src/lib/locales.test.ts`
Expected: PASS — now covers 7 namespaces.

- [ ] **Step 7: Format, lint, typecheck, build**

```bash
cd frontend
pnpm exec prettier --write src/lib/locales.ts src/i18n/request.ts src/types/next-intl.d.ts src/messages/*/schoolTopbar.json src/messages/*/adminTopbar.json src/components/layout/SchoolTopbar.tsx src/components/layout/AdminTopbar.tsx
pnpm exec eslint src/components/layout/SchoolTopbar.tsx src/components/layout/AdminTopbar.tsx
pnpm exec tsc --noEmit
pnpm build
```

Expected: all clean.

- [ ] **Step 8: Full-repo gate**

```bash
cd /home/amos-dorceus/Documents/SaaSManagement/ekolplus2
pnpm format
pnpm lint
pnpm typecheck
pnpm test
```

Expected: all four green. This is the closing task of Plan 1a — confirm nothing outside this plan's own files regressed.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/locales.ts frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts frontend/src/messages/fr/schoolTopbar.json frontend/src/messages/ht/schoolTopbar.json frontend/src/messages/en/schoolTopbar.json frontend/src/messages/fr/adminTopbar.json frontend/src/messages/ht/adminTopbar.json frontend/src/messages/en/adminTopbar.json frontend/src/components/layout/SchoolTopbar.tsx frontend/src/components/layout/AdminTopbar.tsx
git commit -m "$(cat <<'EOF'
feat(i18n): SchoolTopbar + AdminTopbar remaining strings (FR/HT/EN)

Closes Plan 1a: both topbars' own last hardcoded strings (page-title
fallback, "open menu" aria-label, "Administration" root label) are now
translated. The whole app shell — both sidebars, both topbars, every
shared navigation subcomponent — is fully translated FR/HT/EN as of this
commit. "Schoolgesti" stays hardcoded (brand name, not translated, same
precedent as /login's logo alt text).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 10: Report to the user**

Summarize what shipped (full shell translated, 7 namespaces total including Phase 0's 2), the `useSchoolSections`/`useAdminSections` hook conversion (a real architectural finding from this plan, not anticipated by the spec at that level of detail), the 2 files added to scope and 2 removed during the file-by-file audit, and that Plans 1b (auth pages) and 1c (dashboards + verification) are written next, informed by whatever this plan's execution actually surfaces. Do **not** push to `origin/develop` unless the user explicitly asks — matches this project's established working pattern.
