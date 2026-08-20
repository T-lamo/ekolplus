# i18n Phase 2 — Paramètres (Settings) Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the `/settings` screen (9 files: the tab shell + 8 tab/section
components) into French/Haitian Creole/English via `next-intl`, closing the
Phase 0 roadmap's "Paramètres tabs" item and correcting CLAUDE.md's inaccurate
claim that Apparence/Langue are already done.

**Architecture:** Same `next-intl` machinery as Phases 0/1 — no new
infrastructure. One new `settings` message namespace (grown incrementally,
one task at a time, mirroring how Phase 1c's `dashboard` namespace grew
across its page + 8 card-component tasks). The already-registered but
previously unconsumed `common` namespace gains its first real consumers
(`errors.network`, new `roles.*` keys). A new small pure-function file,
`role-label.ts`, replaces a `Record` constant three files were importing
directly from each other.

**Tech Stack:** Next.js 16 App Router, `next-intl`, TypeScript strict,
Vitest, Tailwind.

**Spec:** [docs/superpowers/specs/2026-08-20-i18n-phase2-settings-design.md](../specs/2026-08-20-i18n-phase2-settings-design.md)

## Global Constraints

- **Vouvoiement throughout, no exceptions.** Every tutoiement instance found
  in the 9 in-scope files gets corrected to vouvoiement as part of this
  plan's message-file work, even in files whose surrounding code isn't
  otherwise touched by a given task. Use the inclusive middle-dot form for
  gendered participles (`connecté·e`, `déconnecté·e`), matching the one
  instance already using it in this codebase (`ZoneDangereuseSection.tsx`'s
  warning text).
- **Cross-dependency fences — do NOT touch, do NOT translate:**
  `APPEARANCE` (constants.ts — shared with `admin/system/settings/page.tsx`),
  `TERM_TYPES`/`ORDINAL_LABELS`/`ACADEMIC_YEAR_ROLLOVER` (constants.ts —
  shared with the deferred `nouvelle-annee/` wizard), `ADMIN_CREATE_SCHOOL.
  schoolTypes`/`SCHOOL_STATUTES` (constants.ts — shared with the deferred
  admin back-office, and are literal `<Select>` values submitted to the
  API, not just display labels). `AnneeScolaireTab.tsx`'s local
  `TERM_TYPE_LABEL` constant also stays French — it composites with the
  fenced `ORDINAL_LABELS` to build generated term names (e.g. "1er
  Trimestre") and translating it alone would produce mixed-language output.
- **Haitian Creole `_review` flag** — every new `ht/*.json` file's top-level
  object starts with exactly:
  `"_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production."`
- **`n > 1 ? plural : singular` semantics use `.one`/`.other` keys**, never
  ICU `{n, plural, ...}` syntax — matches the exact JS ternary condition
  being replaced, including any `n === 0` edge case, to preserve existing
  behavior exactly.
- **Locale-aware date formatting**: any `date.toLocaleDateString('fr-FR',
  ...)` / `toLocaleTimeString('fr-FR', ...)` call being touched must use
  `LOCALE_BCP47[locale]` (`frontend/src/lib/locales.ts`) instead of the
  hardcoded tag, with `locale` obtained via `useLocale()` from `'next-intl'`.
- **Server-sourced dynamic content stays out of scope** — `err.message`
  from `ApiError` (server-provided, already localized or not per the
  server's own i18n status, out of scope for this phase) is never wrapped
  in a translation call; only the hardcoded *fallback* strings around it
  are translated.
- **`pnpm format && pnpm lint && pnpm typecheck && pnpm test` must pass**
  before every commit — the project-wide pre-commit gate.
- **Every message namespace this plan adds must be registered in all
  three of** `frontend/src/lib/locales.ts` (`MESSAGE_NAMESPACES`),
  `frontend/src/i18n/request.ts`, and `frontend/src/types/next-intl.d.ts`
  — Phase 1c's registry-hardening tests in `locales.test.ts` fail loudly
  if any one of the three is forgotten. No changes to `locales.test.ts`
  itself are needed this phase — it already covers any namespace added to
  `MESSAGE_NAMESPACES`.

---

## Reference: full French source text this plan translates from

The tables inside each task below give the exact old string → new code
substitution. Every French value in a JSON snippet is the vouvoiement-
corrected, ready-to-use final string — no further editorial judgment is
needed from the implementer.

---

### Task 1: Registry scaffolding + `common.roles` + `role-label.ts` + `AdministrateursTab.tsx`

**Files:**
- Create: `frontend/src/messages/fr/settings.json`
- Create: `frontend/src/messages/ht/settings.json`
- Create: `frontend/src/messages/en/settings.json`
- Modify: `frontend/src/messages/fr/common.json`
- Modify: `frontend/src/messages/ht/common.json`
- Modify: `frontend/src/messages/en/common.json`
- Modify: `frontend/src/lib/locales.ts` (`MESSAGE_NAMESPACES` array)
- Modify: `frontend/src/i18n/request.ts`
- Modify: `frontend/src/types/next-intl.d.ts`
- Create: `frontend/src/app/(school)/settings/role-label.ts`
- Modify: `frontend/src/app/(school)/settings/AdministrateursTab.tsx`
- Modify: `frontend/src/app/(school)/settings/ProfilTab.tsx` (single call site only — see Step 8)
- Modify: `frontend/src/app/(school)/settings/EtablissementTab.tsx` (single call site only — see Step 8)

**Interfaces:**
- Produces: `settings` message namespace, registered and consumable via
  `useTranslations('Settings.<key>')` in every later task of this plan.
  This task seeds it with only the `administrateurs.*` subtree; later
  tasks each add their own top-level key to the same 3 JSON files.
- Produces: `common.roles.{OWNER,ADMIN,MEMBER}` keys, consumable via
  `useTranslations('Common.roles')`.
- Produces: `frontend/src/app/(school)/settings/role-label.ts` exporting
  `export type RoleLabelT = (key: 'OWNER' | 'ADMIN' | 'MEMBER') => string;`
  and `export function roleLabel(role: MemberData['role'], t: RoleLabelT): string`.
  Tasks 4 (`ProfilTab.tsx`) and 5 (`EtablissementTab.tsx`) both already
  import this from this task; no further wiring needed there beyond what
  those tasks add for their own screens.

- [ ] **Step 1: Create `frontend/src/messages/fr/settings.json`**

```json
{
  "administrateurs": {
    "title": "Administrateurs",
    "description": "Comptes ayant accès à l'espace de gestion de l'établissement.",
    "since": "Depuis le {date}"
  }
}
```

- [ ] **Step 2: Create `frontend/src/messages/en/settings.json`**

```json
{
  "administrateurs": {
    "title": "Administrators",
    "description": "Accounts with access to the school's management workspace.",
    "since": "Since {date}"
  }
}
```

- [ ] **Step 3: Create `frontend/src/messages/ht/settings.json`**

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "administrateurs": {
    "title": "Administratè yo",
    "description": "Kont ki gen aksè nan espas jesyon lekòl la.",
    "since": "Depi {date}"
  }
}
```

- [ ] **Step 4: Add `roles` to all 3 `common.json` files**

In `frontend/src/messages/fr/common.json`, add a `roles` key alongside the
existing `errors` key (result — full file):

```json
{
  "errors": {
    "generic": "Une erreur est survenue. Réessayez.",
    "network": "Erreur réseau. Réessayez."
  },
  "roles": {
    "OWNER": "Directeur / Directrice",
    "ADMIN": "Administrateur / Administratrice",
    "MEMBER": "Membre"
  }
}
```

In `frontend/src/messages/en/common.json` (full file):

```json
{
  "errors": {
    "generic": "Something went wrong. Try again.",
    "network": "Network error. Try again."
  },
  "roles": {
    "OWNER": "Director",
    "ADMIN": "Administrator",
    "MEMBER": "Member"
  }
}
```

In `frontend/src/messages/ht/common.json` (full file — `_review` key
already present, keep it):

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "errors": {
    "generic": "Gen yon erè ki pase. Eseye ankò.",
    "network": "Erè rezo. Eseye ankò."
  },
  "roles": {
    "OWNER": "Direktè / Direktris",
    "ADMIN": "Administratè / Administratris",
    "MEMBER": "Manm"
  }
}
```

- [ ] **Step 5: Register the `settings` namespace in `frontend/src/lib/locales.ts`**

Change:

```ts
export const MESSAGE_NAMESPACES = [
  'common',
  'login',
  'shell',
  'schoolSidebar',
  'adminSidebar',
  'schoolTopbar',
  'adminTopbar',
  'forgotPassword',
  'resetPassword',
  'verifyEmail',
  'dashboard',
  'adminDashboard',
  'schoolPlanCard',
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
  'forgotPassword',
  'resetPassword',
  'verifyEmail',
  'dashboard',
  'adminDashboard',
  'schoolPlanCard',
  'settings',
] as const;
```

- [ ] **Step 6: Register `settings` in `frontend/src/i18n/request.ts`**

Add `settings` to the destructured import list and the `Promise.all` array
(matching the existing `schoolPlanCard` entry's position — append after it),
and to the returned `messages` object as `Settings: settings.default`.
Full resulting file:

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

  const [
    common,
    login,
    shell,
    schoolSidebar,
    adminSidebar,
    schoolTopbar,
    adminTopbar,
    forgotPassword,
    resetPassword,
    verifyEmail,
    dashboard,
    adminDashboard,
    schoolPlanCard,
    settings,
  ] = await Promise.all([
    import(`../messages/${locale}/common.json`),
    import(`../messages/${locale}/login.json`),
    import(`../messages/${locale}/shell.json`),
    import(`../messages/${locale}/schoolSidebar.json`),
    import(`../messages/${locale}/adminSidebar.json`),
    import(`../messages/${locale}/schoolTopbar.json`),
    import(`../messages/${locale}/adminTopbar.json`),
    import(`../messages/${locale}/forgotPassword.json`),
    import(`../messages/${locale}/resetPassword.json`),
    import(`../messages/${locale}/verifyEmail.json`),
    import(`../messages/${locale}/dashboard.json`),
    import(`../messages/${locale}/adminDashboard.json`),
    import(`../messages/${locale}/schoolPlanCard.json`),
    import(`../messages/${locale}/settings.json`),
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
      ForgotPassword: forgotPassword.default,
      ResetPassword: resetPassword.default,
      VerifyEmail: verifyEmail.default,
      Dashboard: dashboard.default,
      AdminDashboard: adminDashboard.default,
      SchoolPlanCard: schoolPlanCard.default,
      Settings: settings.default,
    },
  };
});
```

- [ ] **Step 7: Register `settings` in `frontend/src/types/next-intl.d.ts`**

Full resulting file:

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
import type shell from '@/messages/fr/shell.json';
import type schoolSidebar from '@/messages/fr/schoolSidebar.json';
import type adminSidebar from '@/messages/fr/adminSidebar.json';
import type schoolTopbar from '@/messages/fr/schoolTopbar.json';
import type adminTopbar from '@/messages/fr/adminTopbar.json';
import type forgotPassword from '@/messages/fr/forgotPassword.json';
import type resetPassword from '@/messages/fr/resetPassword.json';
import type verifyEmail from '@/messages/fr/verifyEmail.json';
import type dashboard from '@/messages/fr/dashboard.json';
import type adminDashboard from '@/messages/fr/adminDashboard.json';
import type schoolPlanCard from '@/messages/fr/schoolPlanCard.json';
import type settings from '@/messages/fr/settings.json';
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
      ForgotPassword: typeof forgotPassword;
      ResetPassword: typeof resetPassword;
      VerifyEmail: typeof verifyEmail;
      Dashboard: typeof dashboard;
      AdminDashboard: typeof adminDashboard;
      SchoolPlanCard: typeof schoolPlanCard;
      Settings: typeof settings;
    };
  }
}
```

- [ ] **Step 8: Create `frontend/src/app/(school)/settings/role-label.ts`**

```ts
// Shared by AdministrateursTab.tsx, ProfilTab.tsx, and EtablissementTab.tsx
// — all three display a member's role and previously imported a shared
// `ROLE_LABEL` constant from AdministrateursTab.tsx directly. Extracted to
// its own file so none of the three imports from another tab's module.
import type { MemberData } from './types';

export type RoleLabelT = (key: 'OWNER' | 'ADMIN' | 'MEMBER') => string;

/** `t` must be scoped to `Common.roles` (`useTranslations('Common.roles')`). */
export function roleLabel(role: MemberData['role'], t: RoleLabelT): string {
  return t(role);
}
```

- [ ] **Step 9: Migrate `frontend/src/app/(school)/settings/AdministrateursTab.tsx`**

Replace the whole file:

```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { LOCALE_BCP47 } from '@/lib/locales';
import { roleLabel } from './role-label';
import type { MemberData } from './types';

// Read-only for V1 — add/remove is an invite flow, deferred (see
// school-settings.md).
export function AdministrateursTab({ members }: { members: MemberData[] }) {
  const t = useTranslations('Settings.administrateurs');
  const tRoles = useTranslations('Common.roles');
  const locale = useLocale();

  function fmt(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(LOCALE_BCP47[locale], {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  return (
    <Card>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-caption font-bold text-foreground">{t('title')}</h2>
        <p className="text-2xs text-muted-foreground">{t('description')}</p>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {members.map((m) => (
          <div key={m.userId} className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">
                {m.name ?? m.email}
              </div>
              <div className="truncate text-xs text-muted-foreground">{m.email}</div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="rounded-full bg-secondary px-2.5 py-1 text-2xs font-semibold text-secondary-foreground">
                {roleLabel(m.role, tRoles)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {t('since', { date: fmt(m.joinedAt) })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

Note this file no longer exports `ROLE_LABEL`.

- [ ] **Step 10: Fix the two call sites that imported `ROLE_LABEL` from `AdministrateursTab.tsx`**

In `frontend/src/app/(school)/settings/ProfilTab.tsx`, change the import:

```ts
import { ROLE_LABEL } from './AdministrateursTab';
```

to:

```ts
import { useTranslations } from 'next-intl';
import { roleLabel } from './role-label';
```

(the `useTranslations` import may already exist once Task 4 runs; for this
task, add it fresh). Inside `ProfilTab`'s component body (the exported
`ProfilTab` function, not `ProfileInfoCard`), the role is read inside
`ProfileInfoCard` — add `const tRoles = useTranslations('Common.roles');`
at the top of `ProfileInfoCard`, and change:

```tsx
{myRole ? ROLE_LABEL[myRole] : '—'}
```

to:

```tsx
{myRole ? roleLabel(myRole, tRoles) : '—'}
```

In `frontend/src/app/(school)/settings/EtablissementTab.tsx`, change the import:

```ts
import { ROLE_LABEL } from './AdministrateursTab';
```

to:

```ts
import { useTranslations } from 'next-intl';
import { roleLabel } from './role-label';
```

Add `const tRoles = useTranslations('Common.roles');` at the top of the
`EtablissementTab` component body, and change:

```tsx
<span className="text-xs font-semibold text-foreground">{ROLE_LABEL.OWNER}</span>
```

to:

```tsx
<span className="text-xs font-semibold text-foreground">{roleLabel('OWNER', tRoles)}</span>
```

Nothing else in either file changes in this task — their remaining French
strings are migrated in Tasks 4 and 5.

- [ ] **Step 11: Verify**

Run: `pnpm --filter frontend exec vitest run src/lib/locales.test.ts`
Expected: PASS (the new `settings` namespace is picked up automatically by
the existing registry-hardening tests).

Run: `pnpm typecheck && pnpm lint`
Expected: both clean. (No `pnpm test` full run yet — cheaper to catch a
typo now; the full suite runs at the end of every task from here on.)

- [ ] **Step 12: Commit**

```bash
git add frontend/src/messages/fr/settings.json frontend/src/messages/en/settings.json frontend/src/messages/ht/settings.json frontend/src/messages/fr/common.json frontend/src/messages/en/common.json frontend/src/messages/ht/common.json frontend/src/lib/locales.ts frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts frontend/src/app/\(school\)/settings/role-label.ts frontend/src/app/\(school\)/settings/AdministrateursTab.tsx frontend/src/app/\(school\)/settings/ProfilTab.tsx frontend/src/app/\(school\)/settings/EtablissementTab.tsx
git commit -m "feat(i18n): settings namespace scaffolding + AdministrateursTab + shared role-label helper"
```

---

### Task 2: `page.tsx` shell

**Files:**
- Modify: `frontend/src/app/(school)/settings/page.tsx`
- Modify: `frontend/src/messages/{fr,ht,en}/settings.json`

**Interfaces:**
- Consumes: `settings` namespace (Task 1), specifically adds `title`,
  `subtitle`, `loadError`, `tabs.*` to the same 3 JSON files.
- Produces: nothing new consumed by later tasks — `page.tsx` is the leaf
  that renders every other tab component.

- [ ] **Step 1: Add keys to `frontend/src/messages/fr/settings.json`**

Add these top-level keys alongside the existing `administrateurs` key:

```json
  "title": "Paramètres",
  "subtitle": "Gérez les informations de votre établissement, les préférences et la sécurité du compte.",
  "loadError": "Impossible de charger les informations de l'établissement.",
  "tabs": {
    "profil": "Profil",
    "apparence": "Apparence",
    "langue": "Langue",
    "etablissement": "Établissement",
    "annee": "Année scolaire",
    "admins": "Administrateurs",
    "notifications": "Notifications"
  },
```

- [ ] **Step 2: Add keys to `frontend/src/messages/en/settings.json`**

```json
  "title": "Settings",
  "subtitle": "Manage your school's information, preferences, and account security.",
  "loadError": "Unable to load the school's information.",
  "tabs": {
    "profil": "Profile",
    "apparence": "Appearance",
    "langue": "Language",
    "etablissement": "School",
    "annee": "School year",
    "admins": "Administrators",
    "notifications": "Notifications"
  },
```

- [ ] **Step 3: Add keys to `frontend/src/messages/ht/settings.json`**

```json
  "title": "Paramèt",
  "subtitle": "Jere enfòmasyon lekòl ou, preferans ak sekirite kont lan.",
  "loadError": "Nou pa ka chaje enfòmasyon lekòl la.",
  "tabs": {
    "profil": "Pwofil",
    "apparence": "Aparans",
    "langue": "Lang",
    "etablissement": "Lekòl",
    "annee": "Ane eskolè",
    "admins": "Administratè yo",
    "notifications": "Notifikasyon"
  },
```

- [ ] **Step 4: Migrate `frontend/src/app/(school)/settings/page.tsx`**

Replace the whole file:

```tsx
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { Tabs } from '@/components/ui/Tabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { ProfilTab } from './ProfilTab';
import { EtablissementTab } from './EtablissementTab';
import { AnneeScolaireTab } from './AnneeScolaireTab';
import { AdministrateursTab } from './AdministrateursTab';
import { NotificationsTab } from './NotificationsTab';
import { ApparenceTab } from './ApparenceTab';
import { LangueTab } from './LangueTab';
import { ZoneDangereuseSection } from './ZoneDangereuseSection';
import type { SchoolResponse, TermData } from './types';

const TAB_KEYS = [
  'profil',
  'apparence',
  'langue',
  'etablissement',
  'annee',
  'admins',
  'notifications',
];
// « Abonnement » left this page on 2026-08-18 — it is now its own screen at
// /abonnement (sidebar Compte › Abonnement); next.config.ts redirects the
// old ?tab=subscription deep links there.

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsForm />
    </Suspense>
  );
}

function SettingsForm() {
  const t = useTranslations('Settings');
  const user = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState(
    initialTab && TAB_KEYS.includes(initialTab) ? initialTab : 'profil',
  );

  const TABS = [
    { key: 'profil', label: t('tabs.profil') },
    { key: 'apparence', label: t('tabs.apparence') },
    { key: 'langue', label: t('tabs.langue') },
    { key: 'etablissement', label: t('tabs.etablissement') },
    { key: 'annee', label: t('tabs.annee') },
    { key: 'admins', label: t('tabs.admins') },
    { key: 'notifications', label: t('tabs.notifications') },
  ];

  function changeTab(next: string) {
    setTab(next);
    router.replace(next === 'profil' ? '/settings' : `/settings?tab=${next}`, { scroll: false });
  }
  const [data, setData] = useState<SchoolResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api<SchoolResponse>('/api/school')
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        setError(t('loadError'));
      })
      .finally(() => setLoading(false));
  }, [user, router, t]);

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-4">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  const myRole = data?.members.find((m) => m.userId === user.id)?.role ?? null;

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={changeTab} />

      {loading && (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {!loading && !error && (
        <>
          {tab === 'profil' && <ProfilTab user={user} myRole={myRole} />}
          {tab === 'apparence' && <ApparenceTab />}
          {tab === 'langue' && <LangueTab />}
          {tab === 'etablissement' && data && (
            <div className="flex flex-col gap-5">
              <EtablissementTab
                school={data.school}
                members={data.members}
                onUpdated={(school) => setData((d) => (d ? { ...d, school } : d))}
              />
              {myRole === 'OWNER' && <ZoneDangereuseSection schoolName={data.school.name} />}
            </div>
          )}
          {tab === 'annee' && (
            <AnneeScolaireTab
              academicYear={data?.academicYear ?? null}
              role={myRole}
              onTermAdded={(term: TermData) =>
                setData((d) => {
                  if (!d) return d;
                  if (d.academicYear) {
                    return {
                      ...d,
                      academicYear: { ...d.academicYear, terms: [...d.academicYear.terms, term] },
                    };
                  }
                  // First term ever added — refetch to pick up the
                  // auto-created AcademicYear rather than guessing its shape.
                  void api<SchoolResponse>('/api/school').then(setData);
                  return d;
                })
              }
              onTermUpdated={(term: TermData) =>
                setData((d) => {
                  if (!d?.academicYear) return d;
                  return {
                    ...d,
                    academicYear: {
                      ...d.academicYear,
                      terms: d.academicYear.terms.map((t) => (t.id === term.id ? term : t)),
                    },
                  };
                })
              }
              onGradingScaleUpdated={(gradingScale: string | null) =>
                setData((d) => {
                  if (!d?.academicYear) return d;
                  return { ...d, academicYear: { ...d.academicYear, gradingScale } };
                })
              }
            />
          )}
          {tab === 'admins' && data && <AdministrateursTab members={data.members} />}
          {tab === 'notifications' && <NotificationsTab />}
        </>
      )}
    </div>
  );
}
```

Note the `TABS` array moved inside the component (each `label` calls `t()`
with a literal key — not a dynamic template-literal key, which next-intl's
typed translator would reject at compile time); `TAB_KEYS` stays a plain
module-level array of the same 7 key strings for the `includes()` check
before `TABS` exists.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: both clean.

Run: `pnpm --filter frontend exec vitest run src/lib/locales.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/\(school\)/settings/page.tsx frontend/src/messages/fr/settings.json frontend/src/messages/en/settings.json frontend/src/messages/ht/settings.json
git commit -m "feat(i18n): translate settings page shell (title, subtitle, tabs)"
```

---

### Task 3: `ApparenceTab.tsx` + `LangueTab.tsx`

**Files:**
- Modify: `frontend/src/app/(school)/settings/ApparenceTab.tsx`
- Modify: `frontend/src/app/(school)/settings/LangueTab.tsx`
- Modify: `frontend/src/messages/{fr,ht,en}/settings.json`

**Interfaces:**
- Consumes: `settings` namespace (Task 1/2's registry work already done).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add keys to `frontend/src/messages/fr/settings.json`**

```json
  "apparence": {
    "title": "Thème de couleur",
    "description": "Choisissez la palette de l'application. Préférence personnelle : elle s'applique immédiatement, sur tous vos appareils, et ne change rien pour les autres membres."
  },
  "langue": {
    "title": "Langue de l'interface",
    "description": "Choisissez la langue de l'application. Préférence personnelle : elle s'applique immédiatement, sur tous vos appareils, et ne change rien pour les autres membres."
  },
```

- [ ] **Step 2: Add keys to `frontend/src/messages/en/settings.json`**

```json
  "apparence": {
    "title": "Colour theme",
    "description": "Choose the app's colour palette. Personal preference: it applies immediately, on all your devices, and doesn't change anything for other members."
  },
  "langue": {
    "title": "Interface language",
    "description": "Choose the app's language. Personal preference: it applies immediately, on all your devices, and doesn't change anything for other members."
  },
```

- [ ] **Step 3: Add keys to `frontend/src/messages/ht/settings.json`**

```json
  "apparence": {
    "title": "Tèm koulè",
    "description": "Chwazi palèt koulè aplikasyon an. Preferans pèsonèl : li aplike imedyatman, sou tout aparèy ou yo, e li pa chanje anyen pou lòt manm yo."
  },
  "langue": {
    "title": "Lang enèfas la",
    "description": "Chwazi lang aplikasyon an. Preferans pèsonèl : li aplike imedyatman, sou tout aparèy ou yo, e li pa chanje anyen pou lòt manm yo."
  },
```

- [ ] **Step 4: Migrate `frontend/src/app/(school)/settings/ApparenceTab.tsx`**

Replace the whole file. Note `APPEARANCE` is a cross-dependency fence
(shared with `admin/system/settings/page.tsx`) — its import is removed
entirely from this file, not translated:

```tsx
'use client';

// Paramètres › Apparence — colour theme of the app (per-user preference).
// The picker applies the theme immediately via ThemeProvider and persists
// it on the account; there is no Save button on purpose.
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { ThemePicker } from '@/components/settings/ThemePicker';

export function ApparenceTab() {
  const t = useTranslations('Settings.apparence');
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-sm font-bold text-foreground">{t('title')}</h2>
      <p className="mt-0.5 mb-4 text-xs text-muted-foreground">{t('description')}</p>
      <ThemePicker />
    </Card>
  );
}
```

- [ ] **Step 5: Migrate `frontend/src/app/(school)/settings/LangueTab.tsx`**

Replace the whole file:

```tsx
'use client';

// Paramètres › Langue — UI language of the app (per-user preference).
// The picker applies the language immediately via LocaleProvider and
// persists it on the account; there is no Save button, same as Apparence.
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { LanguagePicker } from '@/components/settings/LanguagePicker';

export function LangueTab() {
  const t = useTranslations('Settings.langue');
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-sm font-bold text-foreground">{t('title')}</h2>
      <p className="mt-0.5 mb-4 text-xs text-muted-foreground">{t('description')}</p>
      <LanguagePicker />
    </Card>
  );
}
```

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/\(school\)/settings/ApparenceTab.tsx frontend/src/app/\(school\)/settings/LangueTab.tsx frontend/src/messages/fr/settings.json frontend/src/messages/en/settings.json frontend/src/messages/ht/settings.json
git commit -m "feat(i18n): translate ApparenceTab and LangueTab"
```

---

### Task 4: `ProfilTab.tsx`

**Files:**
- Modify: `frontend/src/app/(school)/settings/ProfilTab.tsx`
- Modify: `frontend/src/messages/{fr,ht,en}/settings.json`

**Interfaces:**
- Consumes: `common.errors.network` (Task 1), `settings` namespace.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add keys to `frontend/src/messages/fr/settings.json`**

```json
  "profil": {
    "info": {
      "title": "Mon profil",
      "subtitle": "Informations du compte administrateur",
      "avatarLabel": "Photo de profil",
      "avatarHint": "PNG, JPG ou WebP",
      "nameLabel": "Nom complet",
      "emailLabel": "Adresse courriel",
      "phoneLabel": "Téléphone",
      "roleLabel": "Rôle",
      "avatarUpdated": "Photo de profil mise à jour.",
      "profileUpdated": "Profil mis à jour.",
      "save": "Enregistrer les modifications",
      "saving": "Enregistrement…"
    },
    "password": {
      "strength": {
        "weak": "Faible",
        "medium": "Moyen",
        "strong": "Fort"
      },
      "lastChangedToday": "Aujourd'hui",
      "lastChangedMonthsAgo": {
        "one": "Il y a 1 mois",
        "other": "Il y a {months} mois"
      },
      "showPassword": "Afficher le mot de passe",
      "hidePassword": "Masquer le mot de passe",
      "titleChange": "Mot de passe",
      "titleSet": "Définir un mot de passe",
      "subtitleChange": "Modifiez votre mot de passe de connexion",
      "subtitleSet": "Vous vous êtes connecté·e via Google. Définissez un mot de passe pour pouvoir aussi vous connecter par email.",
      "lastChangedLabel": "Dernière modification",
      "currentPasswordLabel": "Mot de passe actuel",
      "newPasswordLabel": "Nouveau mot de passe",
      "confirmPasswordLabel": "Confirmer le nouveau mot de passe",
      "hint": "Min. 8 caractères, une majuscule, un chiffre",
      "passwordsMatch": "Les mots de passe correspondent",
      "errorMissingNew": "Saisissez un nouveau mot de passe.",
      "errorMismatch": "La confirmation ne correspond pas au nouveau mot de passe.",
      "updatedToast": "Mot de passe mis à jour.",
      "setToast": "Mot de passe défini. Vous pouvez maintenant vous connecter par email.",
      "errors": {
        "invalidCredentials": "Mot de passe actuel incorrect.",
        "passwordBanned": "Ce mot de passe est trop courant.",
        "passwordTooShort": "Mot de passe trop court.",
        "passwordPwned": "Ce mot de passe a fuité — choisissez-en un autre.",
        "passwordAlreadySet": "Un mot de passe est déjà défini. Utilisez « changer le mot de passe ».",
        "validationFailed": "Champs invalides."
      },
      "save": "Enregistrer le mot de passe",
      "define": "Définir le mot de passe",
      "saving": "Enregistrement…",
      "generate": "Générer un mot de passe",
      "logoutWarning": "Après modification, vous serez déconnecté·e de toutes les sessions actives."
    }
  },
```

- [ ] **Step 2: Add keys to `frontend/src/messages/en/settings.json`**

```json
  "profil": {
    "info": {
      "title": "My profile",
      "subtitle": "Administrator account information",
      "avatarLabel": "Profile photo",
      "avatarHint": "PNG, JPG, or WebP",
      "nameLabel": "Full name",
      "emailLabel": "Email address",
      "phoneLabel": "Phone",
      "roleLabel": "Role",
      "avatarUpdated": "Profile photo updated.",
      "profileUpdated": "Profile updated.",
      "save": "Save changes",
      "saving": "Saving…"
    },
    "password": {
      "strength": {
        "weak": "Weak",
        "medium": "Medium",
        "strong": "Strong"
      },
      "lastChangedToday": "Today",
      "lastChangedMonthsAgo": {
        "one": "1 month ago",
        "other": "{months} months ago"
      },
      "showPassword": "Show password",
      "hidePassword": "Hide password",
      "titleChange": "Password",
      "titleSet": "Set a password",
      "subtitleChange": "Change your login password",
      "subtitleSet": "You signed in with Google. Set a password so you can also sign in by email.",
      "lastChangedLabel": "Last changed",
      "currentPasswordLabel": "Current password",
      "newPasswordLabel": "New password",
      "confirmPasswordLabel": "Confirm new password",
      "hint": "Min. 8 characters, one uppercase letter, one digit",
      "passwordsMatch": "Passwords match",
      "errorMissingNew": "Enter a new password.",
      "errorMismatch": "The confirmation doesn't match the new password.",
      "updatedToast": "Password updated.",
      "setToast": "Password set. You can now sign in by email.",
      "errors": {
        "invalidCredentials": "Current password is incorrect.",
        "passwordBanned": "This password is too common.",
        "passwordTooShort": "Password too short.",
        "passwordPwned": "This password has leaked — choose another one.",
        "passwordAlreadySet": "A password is already set. Use \"change password\" instead.",
        "validationFailed": "Invalid fields."
      },
      "save": "Save password",
      "define": "Set password",
      "saving": "Saving…",
      "generate": "Generate a password",
      "logoutWarning": "After changing it, you'll be logged out of all active sessions."
    }
  },
```

- [ ] **Step 3: Add keys to `frontend/src/messages/ht/settings.json`**

```json
  "profil": {
    "info": {
      "title": "Pwofil mwen",
      "subtitle": "Enfòmasyon kont administratè a",
      "avatarLabel": "Foto pwofil",
      "avatarHint": "PNG, JPG oswa WebP",
      "nameLabel": "Non konplè",
      "emailLabel": "Adrès imèl",
      "phoneLabel": "Telefòn",
      "roleLabel": "Wòl",
      "avatarUpdated": "Foto pwofil la mizajou.",
      "profileUpdated": "Pwofil la mizajou.",
      "save": "Anrejistre chanjman yo",
      "saving": "N ap anrejistre…"
    },
    "password": {
      "strength": {
        "weak": "Fèb",
        "medium": "Mwayen",
        "strong": "Fò"
      },
      "lastChangedToday": "Jodi a",
      "lastChangedMonthsAgo": {
        "one": "Sa gen 1 mwa",
        "other": "Sa gen {months} mwa"
      },
      "showPassword": "Montre modpas la",
      "hidePassword": "Kache modpas la",
      "titleChange": "Modpas",
      "titleSet": "Defini yon modpas",
      "subtitleChange": "Modifye modpas koneksyon w lan",
      "subtitleSet": "Ou konekte ak Google. Defini yon modpas pou w ka konekte tou avèk imèl.",
      "lastChangedLabel": "Dènye modifikasyon",
      "currentPasswordLabel": "Modpas aktyèl",
      "newPasswordLabel": "Nouvo modpas",
      "confirmPasswordLabel": "Konfime nouvo modpas la",
      "hint": "Min. 8 karaktè, yon majiskil, yon chif",
      "passwordsMatch": "Modpas yo koresponn",
      "errorMissingNew": "Antre yon nouvo modpas.",
      "errorMismatch": "Konfimasyon an pa koresponn ak nouvo modpas la.",
      "updatedToast": "Modpas la mizajou.",
      "setToast": "Modpas defini. Ou ka konekte kounye a avèk imèl.",
      "errors": {
        "invalidCredentials": "Modpas aktyèl la pa kòrèk.",
        "passwordBanned": "Modpas sa a twò komen.",
        "passwordTooShort": "Modpas la twò kout.",
        "passwordPwned": "Modpas sa a fuit — chwazi yon lòt.",
        "passwordAlreadySet": "Gen yon modpas ki deja defini. Itilize « chanje modpas ».",
        "validationFailed": "Chan yo pa valid."
      },
      "save": "Anrejistre modpas la",
      "define": "Defini modpas la",
      "saving": "N ap anrejistre…",
      "generate": "Jenere yon modpas",
      "logoutWarning": "Apre modifikasyon an, w ap dekonekte nan tout sesyon aktif yo."
    }
  },
```

- [ ] **Step 4: Migrate `frontend/src/app/(school)/settings/ProfilTab.tsx`**

Replace the whole file. `roleLabel`/`tRoles` wiring for `ProfileInfoCard`
already exists from Task 1 (Step 10) — keep it, just add the rest of the
translation calls around it:

```tsx
// Migrated verbatim from the old standalone src/app/settings/page.tsx (see
// school-settings.md) — same API calls, same behavior, now a tab instead of
// a whole page.
'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle, Eye, EyeOff, RefreshCw, ShieldAlert } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth, type User } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Button } from '@/components/ui/Button';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { cn } from '@/lib/utils';
import { LOCALE_BCP47 } from '@/lib/locales';
import { roleLabel } from './role-label';
import type { MemberData } from './types';

function ProfileInfoCard({ user, myRole }: { user: User; myRole: MemberData['role'] | null }) {
  const { refresh } = useAuth();
  const { toast } = useToast();
  const t = useTranslations('Settings.profil.info');
  const tCommon = useTranslations('Common');
  const tRoles = useTranslations('Common.roles');

  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [name, setName] = useState(user.name ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveAvatar(url: string | null) {
    const previous = avatarUrl;
    setAvatarUrl(url);
    try {
      await api('/api/auth/me', { method: 'PATCH', body: { avatarUrl: url } });
      await refresh();
      toast(t('avatarUpdated'), 'success');
    } catch (err) {
      setAvatarUrl(previous);
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api('/api/auth/me', {
        method: 'PATCH',
        body: { name: name.trim() || null, phone: phone || null },
      });
      await refresh();
      toast(t('profileUpdated'), 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="gap-3 p-5">
      <div className="border-b border-border pb-3.5">
        <h2 className="text-caption font-bold text-foreground">{t('title')}</h2>
        <p className="text-2xs text-muted-foreground">{t('subtitle')}</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="w-32">
          <ImageUploader
            label={t('avatarLabel')}
            hint={t('avatarHint')}
            value={avatarUrl}
            onChange={saveAvatar}
          />
        </div>
        <Field label={t('nameLabel')} value={name} onChange={(e) => setName(e.target.value)} />
        <Field label={t('emailLabel')} value={user.email} disabled />
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <PhoneInput label={t('phoneLabel')} value={phone} onChange={setPhone} />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-semibold text-foreground">{t('roleLabel')}</span>
            <span className="flex h-10 items-center gap-2 rounded-md border border-border bg-muted px-3 text-foreground">
              {myRole ? roleLabel(myRole, tRoles) : '—'}
            </span>
          </label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <Button type="submit" loading={submitting} className="w-fit">
          {submitting ? t('saving') : t('save')}
        </Button>
      </form>
    </Card>
  );
}

// 4-point heuristic (length, uppercase, digit, symbol) — cosmetic strength
// hint only, the real gate is the server's PASSWORD_TOO_SHORT/PASSWORD_BANNED/
// PASSWORD_PWNED checks in change-password/set-password.
function passwordStrength(pwd: string): number {
  if (!pwd) return 0;
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return score;
}

function generatePassword(): string {
  const chars =
    'abcdefghijkmnopqrstuvwxyz' + 'ABCDEFGHJKLMNPQRSTUVWXYZ' + '23456789' + '!@#$%&*-_+=';
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function VisibilityToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  const t = useTranslations('Settings.profil.password');
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? t('hidePassword') : t('showPassword')}
      className="flex h-full w-9 shrink-0 items-center justify-center text-muted-foreground"
    >
      {visible ? <EyeOff size={14} /> : <Eye size={14} />}
    </button>
  );
}

function PasswordCard({ user }: { user: User }) {
  const { refresh } = useAuth();
  const { toast } = useToast();
  const t = useTranslations('Settings.profil.password');
  const tCommon = useTranslations('Common');
  const locale = useLocale();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPassword = user.hasPassword;
  const strength = useMemo(() => passwordStrength(newPassword), [newPassword]);
  const strengthMeta = [
    { label: '', color: 'var(--color-muted)' },
    { label: t('strength.weak'), color: 'var(--color-destructive-foreground)' },
    { label: t('strength.medium'), color: 'var(--color-warning-foreground)' },
    { label: t('strength.medium'), color: 'var(--color-warning-foreground)' },
    { label: t('strength.strong'), color: 'var(--color-success-foreground)' },
  ][strength]!;
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;

  function formatLastChanged(iso: string | null): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    const months = Math.max(
      0,
      Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 30)),
    );
    const relative =
      months === 0
        ? t('lastChangedToday')
        : t(months === 1 ? 'lastChangedMonthsAgo.one' : 'lastChangedMonthsAgo.other', { months });
    const absolute = date.toLocaleDateString(LOCALE_BCP47[locale], {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    return `${relative} · ${absolute}`;
  }
  const lastChanged = formatLastChanged(user.passwordChangedAt);

  function onGenerate() {
    const generated = generatePassword();
    setNewPassword(generated);
    setConfirmPassword(generated);
  }

  async function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length === 0) {
      setError(t('errorMissingNew'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('errorMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      if (hasPassword) {
        await api('/api/auth/change-password', {
          method: 'PUT',
          body: { currentPassword, newPassword },
        });
        toast(t('updatedToast'), 'success');
      } else {
        await api('/api/auth/set-password', {
          method: 'POST',
          body: { newPassword },
        });
        toast(t('setToast'), 'success');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const map: Record<string, string> = {
          INVALID_CREDENTIALS: t('errors.invalidCredentials'),
          PASSWORD_BANNED: t('errors.passwordBanned'),
          PASSWORD_TOO_SHORT: err.message || t('errors.passwordTooShort'),
          PASSWORD_PWNED: t('errors.passwordPwned'),
          PASSWORD_ALREADY_SET: t('errors.passwordAlreadySet'),
          VALIDATION_FAILED: t('errors.validationFailed'),
        };
        setError(map[err.code] ?? err.message);
      } else {
        setError(tCommon('errors.network'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="gap-3 p-5">
      <div className="border-b border-border pb-3.5">
        <h2 className="text-caption font-bold text-foreground">
          {hasPassword ? t('titleChange') : t('titleSet')}
        </h2>
        <p className="text-2xs text-muted-foreground">
          {hasPassword ? t('subtitleChange') : t('subtitleSet')}
        </p>
      </div>

      {hasPassword && lastChanged && (
        <div className="flex items-center gap-2.5 rounded-md bg-secondary px-3.5 py-3">
          <ShieldAlert size={16} className="shrink-0 text-primary" />
          <div>
            <div className="text-xs font-semibold text-primary">{t('lastChangedLabel')}</div>
            <div className="mt-0.5 text-2xs text-muted-foreground">{lastChanged}</div>
          </div>
        </div>
      )}

      <form onSubmit={onSubmitPassword} className="flex flex-col gap-4">
        {hasPassword && (
          <Field
            label={t('currentPasswordLabel')}
            type={showCurrent ? 'text' : 'password'}
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            trailing={
              <VisibilityToggle visible={showCurrent} onToggle={() => setShowCurrent((v) => !v)} />
            }
          />
        )}
        <div>
          <Field
            label={t('newPasswordLabel')}
            type={showNew ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            trailing={<VisibilityToggle visible={showNew} onToggle={() => setShowNew((v) => !v)} />}
          />
          {newPassword.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1">
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="h-1 flex-1 rounded-full"
                  style={{ background: i <= strength ? strengthMeta.color : 'var(--color-muted)' }}
                />
              ))}
              <span
                className="ml-1 shrink-0 text-[10px] font-semibold whitespace-nowrap"
                style={{ color: strengthMeta.color }}
              >
                {strengthMeta.label}
              </span>
            </div>
          )}
          <p className="mt-1 text-2xs text-muted-foreground">{t('hint')}</p>
        </div>
        <div>
          <Field
            label={t('confirmPasswordLabel')}
            type={showConfirm ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            trailing={
              <VisibilityToggle visible={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
            }
          />
          {passwordsMatch && (
            <div className="mt-1 flex items-center gap-1.5">
              <CheckCircle size={11} className="text-success-foreground" />
              <span className="text-2xs font-medium text-success-foreground">
                {t('passwordsMatch')}
              </span>
            </div>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" loading={submitting} className="w-fit">
            {submitting ? t('saving') : hasPassword ? t('save') : t('define')}
          </Button>
          <Button type="button" variant="outline" className="w-fit gap-1.5" onClick={onGenerate}>
            <RefreshCw size={13} />
            {t('generate')}
          </Button>
        </div>
        {hasPassword && (
          <div className={cn('flex items-start gap-2 rounded-md bg-warning px-3.5 py-2.5')}>
            <ShieldAlert size={14} className="mt-0.5 shrink-0 text-warning-foreground" />
            <p className="text-2xs leading-relaxed text-warning-foreground">
              {t('logoutWarning')}
            </p>
          </div>
        )}
      </form>
    </Card>
  );
}

export function ProfilTab({ user, myRole }: { user: User; myRole: MemberData['role'] | null }) {
  return (
    <div className="flex flex-col gap-5">
      <ProfileInfoCard user={user} myRole={myRole} />
      <PasswordCard user={user} />
    </div>
  );
}
```

Note `STRENGTH_META` and the standalone `formatLastChanged` function are
now defined inline inside their respective components (they need `t`),
replacing the old module-level `STRENGTH_META` array and `formatLastChanged`
function.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/\(school\)/settings/ProfilTab.tsx frontend/src/messages/fr/settings.json frontend/src/messages/en/settings.json frontend/src/messages/ht/settings.json
git commit -m "feat(i18n): translate ProfilTab (profile card + password card)"
```

---

### Task 5: `EtablissementTab.tsx`

**Files:**
- Modify: `frontend/src/app/(school)/settings/EtablissementTab.tsx`
- Modify: `frontend/src/messages/{fr,ht,en}/settings.json`

**Interfaces:**
- Consumes: `common.errors.network` (Task 1), `settings` namespace.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add keys to `frontend/src/messages/fr/settings.json`**

```json
  "etablissement": {
    "title": "Informations de l'établissement",
    "subtitle": "Ces informations apparaissent sur les bulletins et documents officiels.",
    "logoLabel": "Logo",
    "logoHint": "PNG, JPG ou WebP",
    "logoUpdated": "Logo mis à jour.",
    "infoUpdated": "Informations mises à jour.",
    "nameLabel": "Nom de l'établissement",
    "codeLabel": "Code ou matricule officiel",
    "statuteLabel": "Type d'établissement",
    "schoolTypeLabel": "Niveaux d'enseignement",
    "addressLabel": "Adresse",
    "phoneLabel": "Téléphone",
    "emailLabel": "Courriel officiel",
    "websiteLabel": "Site web (optionnel)",
    "save": "Enregistrer les modifications",
    "saving": "Enregistrement…"
  },
```

- [ ] **Step 2: Add keys to `frontend/src/messages/en/settings.json`**

```json
  "etablissement": {
    "title": "School information",
    "subtitle": "This information appears on report cards and official documents.",
    "logoLabel": "Logo",
    "logoHint": "PNG, JPG, or WebP",
    "logoUpdated": "Logo updated.",
    "infoUpdated": "Information updated.",
    "nameLabel": "School name",
    "codeLabel": "Official code or registration number",
    "statuteLabel": "School type",
    "schoolTypeLabel": "Education levels",
    "addressLabel": "Address",
    "phoneLabel": "Phone",
    "emailLabel": "Official email",
    "websiteLabel": "Website (optional)",
    "save": "Save changes",
    "saving": "Saving…"
  },
```

- [ ] **Step 3: Add keys to `frontend/src/messages/ht/settings.json`**

```json
  "etablissement": {
    "title": "Enfòmasyon sou lekòl la",
    "subtitle": "Enfòmasyon sa yo parèt sou bilten ak dokiman ofisyèl yo.",
    "logoLabel": "Logo",
    "logoHint": "PNG, JPG oswa WebP",
    "logoUpdated": "Logo a mizajou.",
    "infoUpdated": "Enfòmasyon yo mizajou.",
    "nameLabel": "Non lekòl la",
    "codeLabel": "Kòd oswa matrikil ofisyèl",
    "statuteLabel": "Kalite lekòl",
    "schoolTypeLabel": "Nivo ansèyman",
    "addressLabel": "Adrès",
    "phoneLabel": "Telefòn",
    "emailLabel": "Imèl ofisyèl",
    "websiteLabel": "Sit entènèt (opsyonèl)",
    "save": "Anrejistre chanjman yo",
    "saving": "N ap anrejistre…"
  },
```

- [ ] **Step 4: Migrate `frontend/src/app/(school)/settings/EtablissementTab.tsx`**

Replace the whole file. `SCHOOL_STATUTES` and `ADMIN_CREATE_SCHOOL.
schoolTypes` are cross-dependency fences — their imports and `.map(...)`
usages inside the two `<Select>`s stay completely untouched (still French,
still the literal values submitted to the API); only the two `<Select>`
`label` props and everything else in the file is translated. `roleLabel`/
`tRoles` wiring for the director-role display already exists from Task 1
(Step 10) — keep it:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Mail } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Select, SelectItem } from '@/components/ui/Select';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Button } from '@/components/ui/Button';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { ADMIN_CREATE_SCHOOL, SCHOOL_STATUTES } from '@/lib/constants';
import { roleLabel } from './role-label';
import type { SchoolData, MemberData } from './types';

export function EtablissementTab({
  school,
  members,
  onUpdated,
}: {
  school: SchoolData;
  members: MemberData[];
  onUpdated: (school: SchoolData) => void;
}) {
  const t = useTranslations('Settings.etablissement');
  const tCommon = useTranslations('Common');
  const tRoles = useTranslations('Common.roles');
  const { toast } = useToast();
  const [logoUrl, setLogoUrl] = useState(school.logoUrl);
  const [form, setForm] = useState({
    name: school.name,
    officialCode: school.officialCode ?? '',
    statute: school.statute ?? '',
    schoolType: school.schoolType,
    address: school.address ?? '',
    phone: school.phone ?? '',
    officialEmail: school.officialEmail ?? '',
    website: school.website ?? '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const director = members.find((m) => m.role === 'OWNER');

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function saveLogo(url: string | null) {
    const previous = logoUrl;
    setLogoUrl(url);
    try {
      const res = await api<{ school: SchoolData }>('/api/school', {
        method: 'PUT',
        body: { logoUrl: url },
      });
      onUpdated(res.school);
      toast(t('logoUpdated'), 'success');
    } catch (err) {
      setLogoUrl(previous);
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<{ school: SchoolData }>('/api/school', {
        method: 'PUT',
        body: {
          name: form.name,
          officialCode: form.officialCode || null,
          statute: form.statute || null,
          schoolType: form.schoolType,
          address: form.address || null,
          phone: form.phone || null,
          officialEmail: form.officialEmail || null,
          website: form.website || null,
        },
      });
      onUpdated(res.school);
      toast(t('infoUpdated'), 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-caption font-bold text-foreground">{t('title')}</h2>
        <p className="text-2xs text-muted-foreground">{t('subtitle')}</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 p-5">
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <div className="w-full shrink-0 sm:w-40">
            <ImageUploader
              label={t('logoLabel')}
              hint={t('logoHint')}
              value={logoUrl}
              onChange={saveLogo}
            />
          </div>
          <div className="flex flex-1 flex-col gap-3.5">
            <Field
              label={t('nameLabel')}
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
            <Field
              label={t('codeLabel')}
              value={form.officialCode}
              onChange={(e) => set('officialCode', e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Select
            label={t('statuteLabel')}
            value={form.statute}
            onValueChange={(v) => set('statute', v)}
          >
            {SCHOOL_STATUTES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </Select>
          <Select
            label={t('schoolTypeLabel')}
            required
            value={form.schoolType}
            onValueChange={(v) => set('schoolType', v)}
          >
            {ADMIN_CREATE_SCHOOL.schoolTypes.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </Select>
        </div>

        <Field
          label={t('addressLabel')}
          value={form.address}
          onChange={(e) => set('address', e.target.value)}
        />

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <PhoneInput label={t('phoneLabel')} value={form.phone} onChange={(v) => set('phone', v)} />
          <Field
            label={t('emailLabel')}
            type="email"
            icon={<Mail size={13} />}
            value={form.officialEmail}
            onChange={(e) => set('officialEmail', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {director && (
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-semibold text-foreground">
                {roleLabel('OWNER', tRoles)}
              </span>
              <span className="flex h-10 items-center gap-2 rounded-md border border-border bg-muted px-3 text-foreground">
                {director.name ?? director.email}
              </span>
            </div>
          )}
          <Field
            label={t('websiteLabel')}
            value={form.website}
            onChange={(e) => set('website', e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}

        <Button type="submit" loading={submitting} className="w-fit">
          {submitting ? t('saving') : t('save')}
        </Button>
      </form>
    </Card>
  );
}
```

(Note the original file's `SelectItem` loop variable was named `t` for the
schoolTypes map, shadowing the `t` translator — renamed to `s` above, same
pattern the codebase already used for `ADMIN_SAAS`-adjacent shadow
avoidance in Phase 1c's `admin/page.tsx`, where the translator was renamed
`tAdmin` instead. Renaming the loop variable here is simpler since it's a
one-letter local, not a hook.)

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/\(school\)/settings/EtablissementTab.tsx frontend/src/messages/fr/settings.json frontend/src/messages/en/settings.json frontend/src/messages/ht/settings.json
git commit -m "feat(i18n): translate EtablissementTab"
```

---

### Task 6: `NotificationsTab.tsx`

**Files:**
- Modify: `frontend/src/app/(school)/settings/NotificationsTab.tsx`
- Modify: `frontend/src/messages/{fr,ht,en}/settings.json`

**Interfaces:**
- Consumes: `common.errors.network` (Task 1), `settings` namespace.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add keys to `frontend/src/messages/fr/settings.json`**

```json
  "notifications": {
    "title": "Notifications",
    "subtitle": "Choisissez les événements pour lesquels vous souhaitez être notifié·e, par courriel ou dans l'application.",
    "channelEmail": "Courriel",
    "channelApp": "App",
    "emailAriaLabel": "{label} — courriel",
    "appAriaLabel": "{label} — dans l'application",
    "events": {
      "BULLETIN_GENERATED": {
        "label": "Bulletins générés",
        "desc": "Quand un bulletin est prêt à consulter."
      },
      "UNEXCUSED_ABSENCE": {
        "label": "Absences non justifiées",
        "desc": "Quand un élève est marqué absent sans justification."
      },
      "RENEWAL_REMINDER": {
        "label": "Rappel de renouvellement",
        "desc": "Avant l'expiration de l'abonnement de l'établissement."
      },
      "TEACHER_ACTIVITY_DIGEST": {
        "label": "Activité des enseignants",
        "desc": "Résumé des saisies (notes, présences) par l'équipe pédagogique."
      },
      "WEEKLY_SUMMARY": {
        "label": "Résumé hebdomadaire",
        "desc": "Un récapitulatif de l'activité de l'établissement chaque semaine."
      }
    }
  },
```

- [ ] **Step 2: Add keys to `frontend/src/messages/en/settings.json`**

```json
  "notifications": {
    "title": "Notifications",
    "subtitle": "Choose which events you want to be notified about, by email or in the app.",
    "channelEmail": "Email",
    "channelApp": "App",
    "emailAriaLabel": "{label} — email",
    "appAriaLabel": "{label} — in the app",
    "events": {
      "BULLETIN_GENERATED": {
        "label": "Report cards generated",
        "desc": "When a report card is ready to view."
      },
      "UNEXCUSED_ABSENCE": {
        "label": "Unexcused absences",
        "desc": "When a student is marked absent without justification."
      },
      "RENEWAL_REMINDER": {
        "label": "Renewal reminder",
        "desc": "Before the school's subscription expires."
      },
      "TEACHER_ACTIVITY_DIGEST": {
        "label": "Teacher activity",
        "desc": "Summary of entries (grades, attendance) by the teaching staff."
      },
      "WEEKLY_SUMMARY": {
        "label": "Weekly summary",
        "desc": "A recap of the school's activity every week."
      }
    }
  },
```

- [ ] **Step 3: Add keys to `frontend/src/messages/ht/settings.json`**

```json
  "notifications": {
    "title": "Notifikasyon",
    "subtitle": "Chwazi evènman ou vle yo notifye w pou yo, pa imèl oswa nan aplikasyon an.",
    "channelEmail": "Imèl",
    "channelApp": "App",
    "emailAriaLabel": "{label} — imèl",
    "appAriaLabel": "{label} — nan aplikasyon an",
    "events": {
      "BULLETIN_GENERATED": {
        "label": "Bilten jenere",
        "desc": "Lè yon bilten pare pou konsilte."
      },
      "UNEXCUSED_ABSENCE": {
        "label": "Absans ki pa jistifye",
        "desc": "Lè yon elèv make absan san jistifikasyon."
      },
      "RENEWAL_REMINDER": {
        "label": "Rapèl renouvèlman",
        "desc": "Anvan abònman lekòl la ekspire."
      },
      "TEACHER_ACTIVITY_DIGEST": {
        "label": "Aktivite pwofesè yo",
        "desc": "Rezime sezi yo (nòt, presans) pa ekip pedagojik la."
      },
      "WEEKLY_SUMMARY": {
        "label": "Rezime chak semèn",
        "desc": "Yon rekapitilasyon aktivite lekòl la chak semèn."
      }
    }
  },
```

- [ ] **Step 4: Migrate `frontend/src/app/(school)/settings/NotificationsTab.tsx`**

Replace the whole file. `EVENT_TYPES`'s `key` fields (the `Record` keys
used for API bodies, e.g. `'BULLETIN_GENERATED'`) are untouched — only the
`label`/`desc` display strings move into the message file, looked up by
that same key at render time:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/ui/Switch';

// Event-type keys stored in NotificationPreferences.prefs (per-user JSON,
// opt-out semantics — a missing key means "enabled"). These 5 event types
// are genuinely persisted here but, as of this pass, not yet consumed by any
// notification dispatcher (no outbox `kind` or template emits them yet) —
// same "flagged, not silently faked" precedent as other honest gaps in this
// codebase. Wiring the actual sends is a separate, future change.
const EVENT_TYPE_KEYS = [
  'BULLETIN_GENERATED',
  'UNEXCUSED_ABSENCE',
  'RENEWAL_REMINDER',
  'TEACHER_ACTIVITY_DIGEST',
  'WEEKLY_SUMMARY',
] as const;

type Channel = 'email' | 'inApp';
type Prefs = Record<string, { email?: boolean; inApp?: boolean }>;

function isEnabled(prefs: Prefs, eventType: string, channel: Channel): boolean {
  const v = prefs[eventType]?.[channel];
  return v !== false;
}

export function NotificationsTab() {
  const t = useTranslations('Settings.notifications');
  const tCommon = useTranslations('Common');
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    api<{ prefs: Prefs }>('/api/notifications/prefs')
      .then((res) => setPrefs(res.prefs))
      .catch(() => setPrefs({}))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(eventType: string, channel: Channel, next: boolean) {
    if (!prefs) return;
    const savingId = `${eventType}:${channel}`;
    const previous = prefs;
    const optimistic: Prefs = {
      ...prefs,
      [eventType]: { ...prefs[eventType], [channel]: next },
    };
    setPrefs(optimistic);
    setSavingKey(savingId);
    try {
      const res = await api<{ prefs: Prefs }>('/api/notifications/prefs', {
        method: 'PATCH',
        body: { prefs: { [eventType]: { [channel]: next } } },
      });
      setPrefs(res.prefs);
    } catch (err) {
      setPrefs(previous);
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <Card>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-caption font-bold text-foreground">{t('title')}</h2>
        <p className="text-2xs text-muted-foreground">{t('subtitle')}</p>
      </div>

      {loading || !prefs ? (
        <div className="flex flex-col gap-4 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {EVENT_TYPE_KEYS.map((key) => {
            const label = t(`events.${key}.label`);
            return (
              <div key={key} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{label}</div>
                  <div className="text-xs text-muted-foreground">{t(`events.${key}.desc`)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <label className="flex items-center gap-2">
                    <span className="text-2xs font-medium text-muted-foreground">
                      {t('channelEmail')}
                    </span>
                    <Switch
                      checked={isEnabled(prefs, key, 'email')}
                      disabled={savingKey === `${key}:email`}
                      onChange={(v) => void toggle(key, 'email', v)}
                      label={t('emailAriaLabel', { label })}
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="text-2xs font-medium text-muted-foreground">
                      {t('channelApp')}
                    </span>
                    <Switch
                      checked={isEnabled(prefs, key, 'inApp')}
                      disabled={savingKey === `${key}:inApp`}
                      onChange={(v) => void toggle(key, 'inApp', v)}
                      label={t('appAriaLabel', { label })}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
```

`t(`events.${key}.label`)` uses a dynamic key built from `EVENT_TYPE_KEYS`
(a `readonly` tuple of the 5 literal strings) — next-intl's translator
type accepts this because `key` here is typed as the union of those 5
literals, not a widened `string`, so this stays type-safe (contrast with
`page.tsx`'s `TABS`, which needed a fully literal array instead because it
mixes static and dynamic construction in a way TypeScript can't narrow the
same way — if `pnpm typecheck` reports an error on this line, replace the
`.map()` with an explicit 5-entry array literal, one object per event type,
each calling `t('events.BULLETIN_GENERATED.label')` etc. with its own
literal key, mirroring `page.tsx`'s `TABS` array).

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: both clean. If `typecheck` fails on the `t(`events.${key}...`)`
calls, apply the explicit-array fallback described above and re-run.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/\(school\)/settings/NotificationsTab.tsx frontend/src/messages/fr/settings.json frontend/src/messages/en/settings.json frontend/src/messages/ht/settings.json
git commit -m "feat(i18n): translate NotificationsTab"
```

---

### Task 7: `AnneeScolaireTab.tsx`

**Files:**
- Modify: `frontend/src/app/(school)/settings/AnneeScolaireTab.tsx`
- Modify: `frontend/src/messages/{fr,ht,en}/settings.json`

**Interfaces:**
- Consumes: `common.errors.network` (Task 1), `settings` namespace.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add keys to `frontend/src/messages/fr/settings.json`**

```json
  "anneeScolaire": {
    "title": "Année scolaire & Calendrier",
    "subtitle": "Définissez les trimestres et périodes d'évaluation.",
    "newTerm": "Nouvelle période",
    "activeYearLabel": "Année scolaire active",
    "gradingScaleLabel": "Système de notation",
    "gradingScaleUndefined": "Non défini",
    "noTermsConfigured": "Aucune période configurée pour l'instant — ajoutez la première avec « Nouvelle période ».",
    "noYearConfigured": "Aucune année scolaire configurée — créez la première période avec « Nouvelle période ».",
    "statusLabel": {
      "DONE": "Terminé",
      "CURRENT": "En cours",
      "UPCOMING": "À venir"
    },
    "editTermAriaLabel": "Modifier {label}",
    "editGradingScaleModal": {
      "title": "Modifier le système de notation",
      "fieldLabel": "Système de notation",
      "placeholder": "Sur 20 points",
      "updated": "Système de notation mis à jour.",
      "cancel": "Annuler",
      "save": "Enregistrer"
    },
    "termTypeAndToggle": {
      "typeLabel": "Type de période",
      "gradeEntryTitle": "Saisie des notes activée",
      "gradeEntryDesc": "Permettre aux enseignants de saisir les notes pour cette période."
    },
    "editTermModal": {
      "title": "Modifier la période",
      "labelField": "Nom de la période",
      "startDate": "Date de début",
      "endDate": "Date de fin",
      "updated": "Période mise à jour.",
      "cancel": "Annuler",
      "save": "Enregistrer"
    },
    "newTermModal": {
      "title": "Nouvelle période scolaire",
      "intro": "Ajoutez un trimestre ou semestre à l'année {academicYearLabel}",
      "termNumberLabel": "Numéro de la période",
      "displayLabelField": "Libellé affiché",
      "startDate": "Date de début",
      "endDate": "Date de fin",
      "initialStatus": "Statut initial",
      "statusHint": "Calculé automatiquement à partir des dates ci-dessus.",
      "info": "Une fois créée, la période apparaîtra dans le calendrier scolaire et sera disponible pour la saisie de notes, la gestion des présences et la génération des bulletins.",
      "missingFields": "Merci de remplir tous les champs.",
      "created": "Période ajoutée.",
      "cancel": "Annuler",
      "create": "Créer la période"
    }
  },
```

- [ ] **Step 2: Add keys to `frontend/src/messages/en/settings.json`**

```json
  "anneeScolaire": {
    "title": "School Year & Calendar",
    "subtitle": "Define terms and assessment periods.",
    "newTerm": "New period",
    "activeYearLabel": "Active school year",
    "gradingScaleLabel": "Grading system",
    "gradingScaleUndefined": "Not set",
    "noTermsConfigured": "No period configured yet — add the first one with \"New period\".",
    "noYearConfigured": "No school year configured — create the first period with \"New period\".",
    "statusLabel": {
      "DONE": "Done",
      "CURRENT": "In progress",
      "UPCOMING": "Upcoming"
    },
    "editTermAriaLabel": "Edit {label}",
    "editGradingScaleModal": {
      "title": "Edit grading system",
      "fieldLabel": "Grading system",
      "placeholder": "Out of 20 points",
      "updated": "Grading system updated.",
      "cancel": "Cancel",
      "save": "Save"
    },
    "termTypeAndToggle": {
      "typeLabel": "Period type",
      "gradeEntryTitle": "Grade entry enabled",
      "gradeEntryDesc": "Allow teachers to enter grades for this period."
    },
    "editTermModal": {
      "title": "Edit period",
      "labelField": "Period name",
      "startDate": "Start date",
      "endDate": "End date",
      "updated": "Period updated.",
      "cancel": "Cancel",
      "save": "Save"
    },
    "newTermModal": {
      "title": "New school period",
      "intro": "Add a term or semester to the {academicYearLabel} year",
      "termNumberLabel": "Period number",
      "displayLabelField": "Displayed label",
      "startDate": "Start date",
      "endDate": "End date",
      "initialStatus": "Initial status",
      "statusHint": "Calculated automatically from the dates above.",
      "info": "Once created, the period will appear in the school calendar and be available for grade entry, attendance management, and report card generation.",
      "missingFields": "Please fill in all fields.",
      "created": "Period added.",
      "cancel": "Cancel",
      "create": "Create period"
    }
  },
```

- [ ] **Step 3: Add keys to `frontend/src/messages/ht/settings.json`**

```json
  "anneeScolaire": {
    "title": "Ane Eskolè & Kalandriye",
    "subtitle": "Defini trimès ak peryòd evalyasyon yo.",
    "newTerm": "Nouvo peryòd",
    "activeYearLabel": "Ane eskolè aktif",
    "gradingScaleLabel": "Sistèm notasyon",
    "gradingScaleUndefined": "Pa defini",
    "noTermsConfigured": "Pa gen peryòd konfigire pou kounye a — ajoute premye a avèk « Nouvo peryòd ».",
    "noYearConfigured": "Pa gen ane eskolè konfigire — kreye premye peryòd la avèk « Nouvo peryòd ».",
    "statusLabel": {
      "DONE": "Fini",
      "CURRENT": "An kou",
      "UPCOMING": "K ap vini"
    },
    "editTermAriaLabel": "Modifye {label}",
    "editGradingScaleModal": {
      "title": "Modifye sistèm notasyon an",
      "fieldLabel": "Sistèm notasyon",
      "placeholder": "Sou 20 pwen",
      "updated": "Sistèm notasyon an mizajou.",
      "cancel": "Anile",
      "save": "Anrejistre"
    },
    "termTypeAndToggle": {
      "typeLabel": "Kalite peryòd",
      "gradeEntryTitle": "Sezi nòt aktive",
      "gradeEntryDesc": "Pèmèt pwofesè yo sezi nòt pou peryòd sa a."
    },
    "editTermModal": {
      "title": "Modifye peryòd la",
      "labelField": "Non peryòd la",
      "startDate": "Dat kòmansman",
      "endDate": "Dat fen",
      "updated": "Peryòd la mizajou.",
      "cancel": "Anile",
      "save": "Anrejistre"
    },
    "newTermModal": {
      "title": "Nouvo peryòd eskolè",
      "intro": "Ajoute yon trimès oswa semès nan ane {academicYearLabel}",
      "termNumberLabel": "Nimewo peryòd la",
      "displayLabelField": "Etikèt ki afiche",
      "startDate": "Dat kòmansman",
      "endDate": "Dat fen",
      "initialStatus": "Estati inisyal",
      "statusHint": "Kalkile otomatikman apati dat ki anwo yo.",
      "info": "Yon fwa li kreye, peryòd la ap parèt nan kalandriye eskolè a e l ap disponib pou sezi nòt, jesyon presans, ak jenerasyon bilten.",
      "missingFields": "Tanpri ranpli tout chan yo.",
      "created": "Peryòd ajoute.",
      "cancel": "Anile",
      "create": "Kreye peryòd la"
    }
  },
```

- [ ] **Step 4: Migrate `frontend/src/app/(school)/settings/AnneeScolaireTab.tsx`**

Replace the whole file. `TERM_TYPES`, `ORDINAL_LABELS`, and
`ACADEMIC_YEAR_ROLLOVER` (all from `@/lib/constants`) are cross-dependency
fences — completely untouched, still consumed exactly as before. The local
`TERM_TYPE_LABEL` constant also stays French (it composites with the fenced
`ORDINAL_LABELS` to build generated default term names like "1er
Trimestre") — do not translate it:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Pencil,
  Calendar,
  CalendarRange,
  Layers,
  Clock,
  PlayCircle,
  CheckCircle,
  Info,
  PlusCircle,
  ArrowRight,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { DateField } from '@/components/ui/DateField';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/lib/utils';
import { LOCALE_BCP47 } from '@/lib/locales';
import { TERM_TYPES, ORDINAL_LABELS, ACADEMIC_YEAR_ROLLOVER } from '@/lib/constants';
import type { AcademicYearData, TermData } from './types';

const STATUS_BADGE_CLASS: Record<TermData['status'], string> = {
  DONE: 'bg-success text-success-foreground',
  CURRENT: 'border border-primary bg-secondary text-primary',
  UPCOMING: 'bg-muted text-muted-foreground',
};

const STATUS_DOT_CLASS: Record<TermData['status'], string> = {
  DONE: 'bg-success-foreground',
  CURRENT: 'bg-primary',
  UPCOMING: 'bg-muted-foreground',
};

const STATUS_ROW_CLASS: Record<TermData['status'], string> = {
  DONE: 'border-border bg-background',
  CURRENT: 'border-[1.5px] border-primary bg-secondary',
  UPCOMING: 'border-border bg-background',
};

const TERM_TYPE_ICON = { calendar: Calendar, 'calendar-range': CalendarRange, layers: Layers };

// Composites with the fenced ORDINAL_LABELS constant to build generated
// term names ("1er Trimestre") — stays French, see this plan's Global
// Constraints (cross-dependency fences).
const TERM_TYPE_LABEL: Record<TermData['type'], string> = {
  TRIMESTRE: 'Trimestre',
  SEMESTRE: 'Semestre',
  LIBRE: 'Période libre',
};

function toDateInput(dateStr: string): string {
  return dateStr.slice(0, 10);
}

function computeStatus(startDate: string, endDate: string): TermData['status'] {
  if (!startDate || !endDate) return 'UPCOMING';
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (now > end) return 'DONE';
  if (now < start) return 'UPCOMING';
  return 'CURRENT';
}

function StatusBadge({ status }: { status: TermData['status'] }) {
  const t = useTranslations('Settings.anneeScolaire.statusLabel');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap',
        STATUS_BADGE_CLASS[status],
      )}
    >
      {status === 'DONE' && <CheckCircle size={10} />}
      {t(status)}
    </span>
  );
}

function EditGradingScaleModal({
  gradingScale,
  onUpdated,
  onClose,
}: {
  gradingScale: string | null;
  onUpdated: (gradingScale: string | null) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const t = useTranslations('Settings.anneeScolaire.editGradingScaleModal');
  const tCommon = useTranslations('Common');
  const [value, setValue] = useState(gradingScale ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<{ academicYear: { gradingScale: string | null } }>(
        '/api/school/academic-year',
        { method: 'PATCH', body: { gradingScale: value.trim() || null } },
      );
      onUpdated(res.academicYear.gradingScale);
      toast(t('updated'), 'success');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t('title')} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <Field
          label={t('fieldLabel')}
          autoFocus
          placeholder={t('placeholder')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" className="w-fit" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" loading={submitting} className="w-fit">
            {t('save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function GradingScaleEditor({
  gradingScale,
  onUpdated,
}: {
  gradingScale: string | null;
  onUpdated: (gradingScale: string | null) => void;
}) {
  const t = useTranslations('Settings.anneeScolaire');
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-foreground">{t('gradingScaleLabel')}</span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex h-10 items-center justify-between gap-2 rounded-md border border-border bg-input px-3 text-left text-sm text-foreground"
      >
        <span className={gradingScale ? '' : 'text-muted-foreground'}>
          {gradingScale ?? t('gradingScaleUndefined')}
        </span>
        <Pencil size={13} className="shrink-0 text-muted-foreground" />
      </button>
      {editing && (
        <EditGradingScaleModal
          gradingScale={gradingScale}
          onUpdated={onUpdated}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function TermTypeAndToggleFields({
  type,
  onTypeChange,
  gradeEntryEnabled,
  onGradeEntryEnabledChange,
}: {
  type: TermData['type'];
  onTypeChange: (t: TermData['type']) => void;
  gradeEntryEnabled: boolean;
  onGradeEntryEnabledChange: (v: boolean) => void;
}) {
  const t = useTranslations('Settings.anneeScolaire.termTypeAndToggle');
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-foreground">{t('typeLabel')}</span>
        <div className="grid grid-cols-3 gap-2">
          {TERM_TYPES.map((tt) => {
            const Icon = TERM_TYPE_ICON[tt.icon];
            const selected = type === tt.value;
            return (
              <button
                key={tt.value}
                type="button"
                onClick={() => onTypeChange(tt.value)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-md border-[1.5px] px-2 py-3 text-center',
                  selected ? 'border-primary bg-secondary' : 'border-border',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-md',
                    selected ? 'bg-card' : 'bg-muted',
                  )}
                >
                  <Icon size={16} className={selected ? 'text-primary' : 'text-muted-foreground'} />
                </span>
                <span
                  className={cn(
                    'text-xs font-semibold',
                    selected ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {tt.label}
                </span>
                <span className="text-[10px] text-muted-foreground">{tt.sub}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-background px-3.5 py-2.5">
        <div>
          <div className="text-xs font-semibold text-foreground">{t('gradeEntryTitle')}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{t('gradeEntryDesc')}</div>
        </div>
        <Switch
          checked={gradeEntryEnabled}
          onChange={onGradeEntryEnabledChange}
          label={t('gradeEntryTitle')}
        />
      </div>
    </>
  );
}

function EditTermModal({
  term,
  onSaved,
  onClose,
}: {
  term: TermData;
  onSaved: (term: TermData) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const t = useTranslations('Settings.anneeScolaire.editTermModal');
  const tCommon = useTranslations('Common');
  const [label, setLabel] = useState(term.label);
  const [startDate, setStartDate] = useState(toDateInput(term.startDate));
  const [endDate, setEndDate] = useState(toDateInput(term.endDate));
  const [type, setType] = useState(term.type);
  const [gradeEntryEnabled, setGradeEntryEnabled] = useState(term.gradeEntryEnabled);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<{ term: TermData }>(`/api/school/terms/${term.id}`, {
        method: 'PATCH',
        body: { label, startDate, endDate, type, gradeEntryEnabled },
      });
      onSaved(res.term);
      toast(t('updated'), 'success');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t('title')} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <Field label={t('labelField')} value={label} onChange={(e) => setLabel(e.target.value)} />
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <DateField label={t('startDate')} value={startDate} onChange={setStartDate} />
          <DateField label={t('endDate')} value={endDate} onChange={setEndDate} />
        </div>
        <TermTypeAndToggleFields
          type={type}
          onTypeChange={setType}
          gradeEntryEnabled={gradeEntryEnabled}
          onGradeEntryEnabledChange={setGradeEntryEnabled}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" className="w-fit" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" loading={submitting} className="w-fit">
            {t('save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TermRow({ term, onSaved }: { term: TermData; onSaved: (term: TermData) => void }) {
  const t = useTranslations('Settings.anneeScolaire');
  const locale = useLocale();
  const [editing, setEditing] = useState(false);

  function fmt(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(LOCALE_BCP47[locale], {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  return (
    <>
      <div
        className={cn(
          'flex flex-wrap items-center gap-3 rounded-md border px-3.5 py-2.5',
          STATUS_ROW_CLASS[term.status],
        )}
      >
        <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT_CLASS[term.status])} />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'text-sm font-semibold',
              term.status === 'CURRENT' ? 'text-primary' : 'text-foreground',
            )}
          >
            {term.label}
          </div>
          <div className="text-xs text-muted-foreground">
            {fmt(term.startDate)} → {fmt(term.endDate)}
          </div>
        </div>
        <StatusBadge status={term.status} />
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={t('editTermAriaLabel', { label: term.label })}
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Pencil size={13} className={term.status === 'CURRENT' ? 'text-primary' : ''} />
        </button>
      </div>
      {editing && <EditTermModal term={term} onSaved={onSaved} onClose={() => setEditing(false)} />}
    </>
  );
}

function NouvellePeriodeModal({
  academicYearLabel,
  nextOrder,
  onCreated,
  onClose,
}: {
  academicYearLabel: string;
  nextOrder: number;
  onCreated: (term: TermData) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const t = useTranslations('Settings.anneeScolaire.newTermModal');
  const tStatus = useTranslations('Settings.anneeScolaire.statusLabel');
  const tCommon = useTranslations('Common');
  const [type, setType] = useState<TermData['type']>('TRIMESTRE');
  const ordinalIndex = Math.min(nextOrder - 1, ORDINAL_LABELS.length - 1);
  const defaultLabel = `${ORDINAL_LABELS[ordinalIndex]} ${TERM_TYPE_LABEL[type]}`;
  const [label, setLabel] = useState(defaultLabel);
  const [labelTouched, setLabelTouched] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [gradeEntryEnabled, setGradeEntryEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onTypeChange(next: TermData['type']) {
    setType(next);
    if (!labelTouched) setLabel(`${ORDINAL_LABELS[ordinalIndex]} ${TERM_TYPE_LABEL[next]}`);
  }

  const statusPreview = computeStatus(startDate, endDate);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!label || !startDate || !endDate) {
      setError(t('missingFields'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ term: TermData }>('/api/school/terms', {
        method: 'POST',
        body: { label, startDate, endDate, type, gradeEntryEnabled },
      });
      onCreated(res.term);
      toast(t('created'), 'success');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t('title')} onClose={onClose}>
      <p className="-mt-2.5 mb-4 text-xs text-muted-foreground">
        {t('intro', { academicYearLabel })}
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <TermTypeAndToggleFields
          type={type}
          onTypeChange={onTypeChange}
          gradeEntryEnabled={gradeEntryEnabled}
          onGradeEntryEnabledChange={setGradeEntryEnabled}
        />

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field
            label={t('termNumberLabel')}
            value={`${ORDINAL_LABELS[ordinalIndex]} ${TERM_TYPE_LABEL[type]}`}
            readOnly
            disabled
          />
          <Field
            label={t('displayLabelField')}
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setLabelTouched(true);
            }}
          />
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <DateField label={t('startDate')} required value={startDate} onChange={setStartDate} />
          <DateField label={t('endDate')} required value={endDate} onChange={setEndDate} />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-foreground">{t('initialStatus')}</span>
          <div className="flex gap-2.5">
            <span
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md border-[1.5px] px-3.5 py-2 text-xs font-semibold',
                statusPreview === 'UPCOMING'
                  ? 'border-muted-foreground bg-muted text-foreground'
                  : 'border-border text-muted-foreground',
              )}
            >
              <Clock size={13} />
              {tStatus('UPCOMING')}
            </span>
            <span
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md border-[1.5px] px-3.5 py-2 text-xs font-semibold',
                statusPreview === 'CURRENT'
                  ? 'border-primary bg-secondary text-primary'
                  : 'border-border text-muted-foreground',
              )}
            >
              <PlayCircle size={13} />
              {tStatus('CURRENT')}
            </span>
            <span
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md border-[1.5px] px-3.5 py-2 text-xs font-semibold',
                statusPreview === 'DONE'
                  ? 'border-success-foreground bg-success text-success-foreground'
                  : 'border-border text-muted-foreground',
              )}
            >
              <CheckCircle size={13} />
              {tStatus('DONE')}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">{t('statusHint')}</p>
        </div>

        <div className="flex items-start gap-2.5 rounded-md border border-primary/30 bg-secondary px-3.5 py-2.5">
          <Info size={14} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-[11px] leading-relaxed text-primary">{t('info')}</p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" className="w-fit" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" loading={submitting} className="w-fit gap-1.5">
            <PlusCircle size={13} />
            {t('create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
```

`NouvellePeriodeModal`'s status-preview badges reuse the same status labels
as `StatusBadge`, via the `tStatus` translator declared above.

Continue replacing the rest of the file (the exported `AnneeScolaireTab`
component):

```tsx
export function AnneeScolaireTab({
  academicYear,
  role,
  onTermAdded,
  onTermUpdated,
  onGradingScaleUpdated,
}: {
  academicYear: AcademicYearData | null;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | null;
  onTermAdded: (term: TermData) => void;
  onTermUpdated: (term: TermData) => void;
  onGradingScaleUpdated: (gradingScale: string | null) => void;
}) {
  const t = useTranslations('Settings.anneeScolaire');
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div>
          <h2 className="text-[13px] font-bold text-foreground">{t('title')}</h2>
          <p className="text-[11px] text-muted-foreground">{t('subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex min-h-11 items-center gap-1.5 rounded-md bg-secondary px-3.5 text-xs font-semibold text-primary"
        >
          <Plus size={14} />
          {t('newTerm')}
        </button>
      </div>

      <div className="flex flex-col gap-4 p-5">
        {academicYear ? (
          <>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-semibold text-foreground">
                  {t('activeYearLabel')}
                </span>
                <span className="flex h-10 items-center rounded-md border border-border bg-input px-3 font-semibold text-foreground">
                  {academicYear.label}
                </span>
              </div>
              <GradingScaleEditor
                gradingScale={academicYear.gradingScale}
                onUpdated={onGradingScaleUpdated}
              />
            </div>

            {academicYear.terms.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noTermsConfigured')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {academicYear.terms.map((term) => (
                  <TermRow key={term.id} term={term} onSaved={onTermUpdated} />
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('noYearConfigured')}</p>
        )}

        {role === 'OWNER' && academicYear && (
          <div className="flex justify-end border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              className="w-full gap-1.5 sm:w-fit"
              onClick={() => router.push('/settings/nouvelle-annee')}
            >
              {ACADEMIC_YEAR_ROLLOVER.title}
              <ArrowRight size={14} />
            </Button>
          </div>
        )}
      </div>

      {showModal && (
        <NouvellePeriodeModal
          academicYearLabel={academicYear?.label ?? ''}
          nextOrder={(academicYear?.terms.length ?? 0) + 1}
          onCreated={onTermAdded}
          onClose={() => setShowModal(false)}
        />
      )}
    </Card>
  );
}
```

`ACADEMIC_YEAR_ROLLOVER.title` is a cross-dependency fence and stays
exactly as before, untouched.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/\(school\)/settings/AnneeScolaireTab.tsx frontend/src/messages/fr/settings.json frontend/src/messages/en/settings.json frontend/src/messages/ht/settings.json
git commit -m "feat(i18n): translate AnneeScolaireTab"
```

---

### Task 8: `ZoneDangereuseSection.tsx`

**Files:**
- Modify: `frontend/src/app/(school)/settings/ZoneDangereuseSection.tsx`
- Modify: `frontend/src/messages/{fr,ht,en}/settings.json`

**Interfaces:**
- Consumes: `common.errors.network` (Task 1), `settings` namespace.
- Produces: nothing consumed by later tasks. This is the last file-content
  task; Task 9 is a verification/docs pass only.

- [ ] **Step 1: Add keys to `frontend/src/messages/fr/settings.json`**

```json
  "zoneDangereuse": {
    "title": "Zone dangereuse",
    "subtitle": "Ces actions sont irréversibles. Procédez avec précaution.",
    "confirmFieldLabel": "Tapez « {schoolName} » pour confirmer",
    "cancel": "Annuler",
    "export": {
      "title": "Exporter toutes les données",
      "desc": "Télécharger un fichier ZIP complet avec tous les élèves, notes, bulletins et paramètres.",
      "action": "Exporter"
    },
    "resetYear": {
      "title": "Réinitialiser l'année scolaire",
      "desc": "Effacer toutes les notes et présences de l'année en cours. Les élèves et enseignants seront conservés.",
      "action": "Réinitialiser",
      "modalTitle": "Réinitialiser l'année scolaire",
      "warning": "Toutes les notes, évaluations, présences, objectifs et appréciations de l'année scolaire active seront supprimés définitivement. Les élèves, enseignants, classes et matières seront conservés. Cette action est irréversible.",
      "confirmLabel": "Réinitialiser définitivement",
      "success": "Année scolaire réinitialisée ({total} enregistrements supprimés)."
    },
    "deleteSchool": {
      "title": "Supprimer le compte de l'établissement",
      "desc": "Cette action supprimera définitivement toutes les données, élèves, enseignants, bulletins et paramètres. Aucune récupération possible.",
      "action": "Supprimer",
      "modalTitle": "Supprimer l'établissement",
      "warning": "L'établissement et toutes ses données (élèves, enseignants, classes, notes, bulletins...) seront supprimés définitivement. Votre compte utilisateur restera actif mais perdra l'accès à cet établissement. Cette action est irréversible.",
      "confirmLabel": "Supprimer définitivement",
      "success": "Établissement supprimé."
    }
  },
```

- [ ] **Step 2: Add keys to `frontend/src/messages/en/settings.json`**

```json
  "zoneDangereuse": {
    "title": "Danger zone",
    "subtitle": "These actions are irreversible. Proceed with caution.",
    "confirmFieldLabel": "Type \"{schoolName}\" to confirm",
    "cancel": "Cancel",
    "export": {
      "title": "Export all data",
      "desc": "Download a full ZIP file with all students, grades, report cards, and settings.",
      "action": "Export"
    },
    "resetYear": {
      "title": "Reset the school year",
      "desc": "Erase all grades and attendance for the current year. Students and teachers are kept.",
      "action": "Reset",
      "modalTitle": "Reset the school year",
      "warning": "All grades, assessments, attendance, objectives, and remarks for the active school year will be permanently deleted. Students, teachers, classes, and subjects are kept. This action is irreversible.",
      "confirmLabel": "Reset permanently",
      "success": "School year reset ({total} records deleted)."
    },
    "deleteSchool": {
      "title": "Delete the school account",
      "desc": "This action will permanently delete all data — students, teachers, report cards, and settings. No recovery is possible.",
      "action": "Delete",
      "modalTitle": "Delete the school",
      "warning": "The school and all its data (students, teachers, classes, grades, report cards...) will be permanently deleted. Your user account will stay active but will lose access to this school. This action is irreversible.",
      "confirmLabel": "Delete permanently",
      "success": "School deleted."
    }
  },
```

- [ ] **Step 3: Add keys to `frontend/src/messages/ht/settings.json`**

```json
  "zoneDangereuse": {
    "title": "Zòn danje",
    "subtitle": "Aksyon sa yo pa kapab defèt. Fè atansyon.",
    "confirmFieldLabel": "Tape « {schoolName} » pou konfime",
    "cancel": "Anile",
    "export": {
      "title": "Ekspòte tout done yo",
      "desc": "Telechaje yon fichye ZIP konplè avèk tout elèv, nòt, bilten ak paramèt.",
      "action": "Ekspòte"
    },
    "resetYear": {
      "title": "Reyinisyalize ane eskolè a",
      "desc": "Efase tout nòt ak presans ane an kou a. Elèv ak pwofesè yo ap konsève.",
      "action": "Reyinisyalize",
      "modalTitle": "Reyinisyalize ane eskolè a",
      "warning": "Tout nòt, evalyasyon, presans, objektif ak apresyasyon ane eskolè aktif la ap efase pou tout tan. Elèv, pwofesè, klas ak matyè yo ap konsève. Aksyon sa a pa kapab defèt.",
      "confirmLabel": "Reyinisyalize definitivman",
      "success": "Ane eskolè a reyinisyalize ({total} anrejistreman efase)."
    },
    "deleteSchool": {
      "title": "Efase kont lekòl la",
      "desc": "Aksyon sa a ap efase pou tout tan tout done yo, elèv, pwofesè, bilten ak paramèt. Pa gen rekiperasyon posib.",
      "action": "Efase",
      "modalTitle": "Efase lekòl la",
      "warning": "Lekòl la ak tout done l yo (elèv, pwofesè, klas, nòt, bilten...) ap efase pou tout tan. Kont itilizatè w la ap rete aktif men l ap pèdi aksè nan lekòl sa a. Aksyon sa a pa kapab defèt.",
      "confirmLabel": "Efase definitivman",
      "success": "Lekòl la efase."
    }
  },
```

- [ ] **Step 4: Migrate `frontend/src/app/(school)/settings/ZoneDangereuseSection.tsx`**

Replace the whole file:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Download, RotateCcw, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';

const DESTRUCTIVE_BTN = 'bg-destructive text-destructive-foreground hover:bg-destructive/90';
const WARNING_BTN = 'bg-warning text-warning-foreground hover:bg-warning/90';

function ConfirmNameModal({
  title,
  warning,
  schoolName,
  confirmLabel,
  confirmClassName,
  onConfirm,
  onClose,
}: {
  title: string;
  warning: string;
  schoolName: string;
  confirmLabel: string;
  confirmClassName: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations('Settings.zoneDangereuse');
  const tCommon = useTranslations('Common');
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = value.trim() === schoolName;

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
      setSubmitting(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{warning}</p>
        <Field
          label={t('confirmFieldLabel', { schoolName })}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
        />
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="w-fit" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={!matches}
            loading={submitting}
            className={`w-fit ${confirmClassName}`}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DangerItem({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</div>
      </div>
      <div className="shrink-0 sm:pl-4">{action}</div>
    </div>
  );
}

export function ZoneDangereuseSection({ schoolName }: { schoolName: string }) {
  const t = useTranslations('Settings.zoneDangereuse');
  const { toast } = useToast();
  const { logout } = useAuth();
  const router = useRouter();
  const [openModal, setOpenModal] = useState<'reset' | 'delete' | null>(null);

  async function onResetYear() {
    const res = await api<{ deleted: Record<string, number> }>('/api/school/reset-year', {
      method: 'POST',
      body: { confirmName: schoolName },
    });
    const total = Object.values(res.deleted).reduce((a, b) => a + b, 0);
    toast(t('resetYear.success', { total }), 'success');
    setOpenModal(null);
  }

  async function onDeleteSchool() {
    await api('/api/school', { method: 'DELETE', body: { confirmName: schoolName } });
    toast(t('deleteSchool.success'), 'success');
    setOpenModal(null);
    await logout();
    router.replace('/login');
  }

  return (
    <>
      <Card className="border-destructive-foreground/30">
        <div className="flex items-center justify-between gap-3 border-b border-destructive-foreground/30 bg-destructive px-5 py-3.5">
          <div>
            <h2 className="text-caption font-bold text-destructive-foreground">{t('title')}</h2>
            <p className="text-2xs text-muted-foreground">{t('subtitle')}</p>
          </div>
          <AlertTriangle size={18} className="shrink-0 text-destructive-foreground" />
        </div>
        <div className="flex flex-col divide-y divide-border">
          <DangerItem
            title={t('export.title')}
            desc={t('export.desc')}
            action={
              <a
                href="/api/school/export"
                className="flex min-h-11 w-fit items-center gap-1.5 rounded-md border border-border px-4 text-sm font-medium text-foreground"
              >
                <Download size={12} />
                {t('export.action')}
              </a>
            }
          />
          <DangerItem
            title={t('resetYear.title')}
            desc={t('resetYear.desc')}
            action={
              <Button
                type="button"
                className={`w-fit gap-1.5 ${WARNING_BTN}`}
                onClick={() => setOpenModal('reset')}
              >
                <RotateCcw size={12} />
                {t('resetYear.action')}
              </Button>
            }
          />
          <DangerItem
            title={t('deleteSchool.title')}
            desc={t('deleteSchool.desc')}
            action={
              <Button
                type="button"
                className={`w-fit gap-1.5 ${DESTRUCTIVE_BTN}`}
                onClick={() => setOpenModal('delete')}
              >
                <Trash2 size={12} />
                {t('deleteSchool.action')}
              </Button>
            }
          />
        </div>
      </Card>

      {openModal === 'reset' && (
        <ConfirmNameModal
          title={t('resetYear.modalTitle')}
          warning={t('resetYear.warning')}
          schoolName={schoolName}
          confirmLabel={t('resetYear.confirmLabel')}
          confirmClassName={WARNING_BTN}
          onConfirm={onResetYear}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === 'delete' && (
        <ConfirmNameModal
          title={t('deleteSchool.modalTitle')}
          warning={t('deleteSchool.warning')}
          schoolName={schoolName}
          confirmLabel={t('deleteSchool.confirmLabel')}
          confirmClassName={DESTRUCTIVE_BTN}
          onConfirm={onDeleteSchool}
          onClose={() => setOpenModal(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/\(school\)/settings/ZoneDangereuseSection.tsx frontend/src/messages/fr/settings.json frontend/src/messages/en/settings.json frontend/src/messages/ht/settings.json
git commit -m "feat(i18n): translate ZoneDangereuseSection"
```

---

### Task 9: Final verification pass + CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the finished state of all 8 prior tasks. This task makes no
  further code changes beyond documentation — it exists to run whole-branch
  verification a single task's scope can't cover.

- [ ] **Step 1: Grep the entire `settings/` directory (minus the deferred `nouvelle-annee/` subdirectory) for stray hardcoded French**

Run:

```bash
grep -rn "['\"][A-ZÀ-Ü][a-zà-ÿ].*['\"]" frontend/src/app/\(school\)/settings/*.tsx
```

Expected: every match is either (a) a `className`/CSS value, (b) a
cross-dependency-fence usage (`SCHOOL_STATUTES`, `ADMIN_CREATE_SCHOOL.
schoolTypes`, `TERM_TYPES`, `ORDINAL_LABELS`, `ACADEMIC_YEAR_ROLLOVER`,
`TERM_TYPE_LABEL`), or (c) a non-UI string (e.g. an API path, an
`aria-live` value). If a genuine untranslated user-facing string turns up,
add it to `settings.json` (all 3 locales) and fix its call site before
continuing — do not defer it past this task.

- [ ] **Step 2: Confirm no file in scope still imports `APPEARANCE`, `ROLE_LABEL`, or the old `TAB_KEYS`-from-`TABS`-derivation pattern**

Run:

```bash
grep -rn "APPEARANCE\|ROLE_LABEL" frontend/src/app/\(school\)/settings/*.tsx
```

Expected: no matches (the only files that ever referenced `APPEARANCE` or
exported/imported `ROLE_LABEL` were `ApparenceTab.tsx` and
`AdministrateursTab.tsx`/`ProfilTab.tsx`/`EtablissementTab.tsx`, all
already migrated in Tasks 1 and 3).

- [ ] **Step 3: Update `CLAUDE.md`'s Internationalisation paragraph**

In the repo-root `CLAUDE.md`, find the sentence:

> As of Phase 1c, `/login` (Phase 0's pilot), the entire app shell
> (Phase 1a), the 3 auth-page siblings `/forgot-password`/`/reset-password`/
> `/verify-email` (Phase 1b), both dashboards (`/dashboard`, `/dashboard/
> activites`, `/admin`), and the sidebar plan-upsell card
> (`SidebarPlanCard`) are all migrated, with two recorded carve-outs:

Change it to:

> As of Phase 2, `/login` (Phase 0's pilot), the entire app shell
> (Phase 1a), the 3 auth-page siblings `/forgot-password`/`/reset-password`/
> `/verify-email` (Phase 1b), both dashboards (`/dashboard`, `/dashboard/
> activites`, `/admin`), the sidebar plan-upsell card (`SidebarPlanCard`,
> Phase 1c), and all 6 `/settings` tabs plus the Zone Dangereuse section
> (Profil, Apparence, Langue, Établissement, Année scolaire,
> Administrateurs, Notifications — Phase 2) are all migrated, with three
> recorded carve-outs:

Find the sentence listing the two existing carve-outs (`/admin`'s status
badges... and the school dashboard's activity-feed text...) and add a
third carve-out after it, in the same style:

> and `/settings`'s Établissement/Année scolaire tabs keep a handful of
> values French by design — `SCHOOL_STATUTES`, `ADMIN_CREATE_SCHOOL.
> schoolTypes` (literal `<Select>` values submitted to the API, shared
> with the deferred admin-back-office school-creation flow),
> `TERM_TYPES`/`ORDINAL_LABELS`/`ACADEMIC_YEAR_ROLLOVER` (shared with the
> deferred year-end rollover wizard at `/settings/nouvelle-annee`), and
> `APPEARANCE`'s own French copy on `admin/system/settings/page.tsx`
> (ApparenceTab.tsx now has its own translated copy instead of sharing
> `APPEARANCE`'s).

Also update the namespace count and roadmap-remaining sentence. Find:

> across 13 message namespaces tracked in `MESSAGE_NAMESPACES`

Change `13` to `14`. Find the sentence starting "Every other screen (...)
still reads French from `constants.ts` unchanged" and remove "Paramètres
tabs beyond Apparence/Langue," from its list (the whole `/settings` area
is now done, so this item drops off the "still remaining" list entirely —
leave the rest of that sentence's list, e.g. Pédagogie, Scolarité, the
rest of `/admin/*`, unchanged).

- [ ] **Step 4: Run the full project gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: all four pass clean.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(i18n): Phase 2 settings tabs shipped — update CLAUDE.md status"
```

---

## Self-review notes (already applied above, not open items)

- **Spec coverage:** every file in the spec's 9-file scope has a task
  (Tasks 1–8 for content, Task 9 for verification/docs). The spec's
  `common.errors.network`/`common.roles.*` additions are in Task 1. The
  spec's `LOCALE_BCP47` fix for all 3 hardcoded-`fr-FR` `fmt()` helpers is
  covered: `AdministrateursTab.tsx` (Task 1), `AnneeScolaireTab.tsx`
  (Task 7's `TermRow`), and `ProfilTab.tsx`'s `formatLastChanged` (Task 4,
  including its `.one`/`.other` relative-time keys). The spec's
  cross-dependency fences (`APPEARANCE`, `TERM_TYPES`/`ORDINAL_LABELS`/
  `ACADEMIC_YEAR_ROLLOVER`, `ADMIN_CREATE_SCHOOL.schoolTypes`/
  `SCHOOL_STATUTES`) are called out explicitly in Tasks 3, 5, and 7 with
  "do not touch" instructions at each relevant call site.
- **Placeholder scan:** no task contains "TBD"/"add error handling"/"similar
  to Task N" — every JSON snippet and every code replacement is the
  complete, final text.
- **Type consistency:** `RoleLabelT`/`roleLabel` (Task 1) is consumed with
  the identical signature in Tasks 4 and 5. `LOCALE_BCP47`/`useLocale` is
  used identically in Tasks 1, 4, and 7. `common.errors.network` is
  referenced with the identical `tCommon('errors.network')` call in every
  task that needs it (1 has none — `AdministrateursTab.tsx` has no mutating
  API call — 4, 5, 6, 7, 8).
