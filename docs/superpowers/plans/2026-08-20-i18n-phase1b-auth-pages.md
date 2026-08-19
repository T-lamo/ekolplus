# i18n Phase 1b — Auth Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the 3 remaining auth-page siblings of the `/login` pilot — `/forgot-password`, `/reset-password`, `/verify-email` — into French/Haitian Creole/English, normalizing each page's error handling to `/login`'s explicit-switch pattern, fixing the vouvoiement register gap Plan 1a deferred, and retiring the 4 now-fully-dead `constants.ts` exports (`AUTH_LOGIN`, `AUTH_FORGOT_PASSWORD`, `AUTH_RESET_PASSWORD`, `AUTH_VERIFY_EMAIL`) their migration unlocks.

**Architecture:** No new infrastructure — every task adds `useTranslations(namespace)` calls to an existing page and a matching `fr`/`ht`/`en` message file, exactly like Phase 0's `/login` migration and Plan 1a's shell/nav migration. Each page also calls `useTranslations('Login')` for the shared branding-panel headline/subline (already translated in Phase 0 — reused, not duplicated) and `useTranslations('Common')` for the generic/network error fallback, matching `/login`'s own established shape exactly (`frontend/src/app/login/page.tsx:49-50,81-102`).

**Tech Stack:** Same as Phase 0/1a — `next-intl`, Vitest, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-19-i18n-phase1-shell-nav-design.md` (the "Auth pages" scope item and its "Error-handling normalization" section; also read `docs/superpowers/specs/2026-08-19-i18n-infrastructure-design.md` for the underlying Phase-0 architecture).

**Plan sequencing:** This is Plan 1b of three plans implementing the Phase-1 spec (1a: registry + shell/nav — merged to `develop`, commit `95f1239`. 1b: this plan — the three auth pages. 1c: dashboards + verification + docs, written after 1b merges).

## Global Constraints

- Locale keys: exactly `fr` (default), `ht`, `en` — no others.
- Cookie name: `sg-locale` (unchanged, not touched by this plan).
- Every new namespace gets its `fr`/`ht`/`en` JSON files created in the SAME task that first consumes it.
- **French register: vouvoiement throughout, no exceptions** — this plan actively fixes the one place Plan 1a deliberately deferred: `fr/common.json`'s and `fr/login.json`'s error strings still tutoient ("Réessaie.", "Vérifie d'abord ton adresse..."). Task 1 fixes both, because this plan is the first to make new screens consume `Common.errors.*` in a vouvoiement context — leaving them mixed would ship inconsistent register on day one of these pages existing.
- Haitian Creole strings get a `_review` key (excluded from the consistency test) — best-effort, not yet reviewed by a native speaker. Copy this project's established phrasing verbatim: `"Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production."` Haitian Creole has no T-V (tu/vous) distinction, so Task 1's register fix touches French only — `ht/common.json` and `ht/login.json` are unaffected.
- Language names are never translated (not directly relevant to this plan's files, but the constraint stands app-wide).
- `"Schoolgesti"` (brand name, image `alt` text) stays hardcoded everywhere — established Phase-0 precedent, not touched by this plan.
- Error-handling normalization (per spec): every dynamic `err.code in X.errors` lookup and the raw-`err.message` fallback becomes an explicit `switch (err.code)` with static literal `t('errors.CODE')` calls per case, a `default` case falling to `tCommon('errors.generic')`, and a separate non-`ApiError` branch falling to `tCommon('errors.network')` — identical shape to `/login`'s established pattern (`frontend/src/app/login/page.tsx:81-102`). A dynamic `t(\`errors.${code}\`)` bypasses next-intl's compile-time typed-key checking, which is the entire reason this pattern exists.
- `constants.ts` cleanup: `AUTH_LOGIN`, `AUTH_FORGOT_PASSWORD`, `AUTH_RESET_PASSWORD`, `AUTH_VERIFY_EMAIL` are deleted only in Task 5, only after all 3 pages no longer import them — confirmed via `grep` immediately before deletion, not assumed (already confirmed once during this plan's own research: as of this plan's writing, all 4 exports have no consumers outside `forgot-password/page.tsx`, `reset-password/page.tsx`, and `verify-email/page.tsx`).
- Do **not** modify `frontend/src/lib/api.ts` (protected file).
- No Route Handlers are touched by this plan (constraint N/A, confirmed — this plan only touches client pages, message files, and `constants.ts`).
- Full gate before each task's commit: `pnpm exec prettier --write <files>`, `pnpm exec eslint <files>`, `pnpm exec tsc --noEmit`. Full gate (`pnpm format && pnpm lint && pnpm typecheck && pnpm test`) plus `pnpm build` at the end of the plan, mirroring Plan 1a's Task 5.

---

## Task 1: Vouvoiement register fix — `Common` + `Login` error strings (French only)

**Files:**
- Modify: `frontend/src/messages/fr/common.json`
- Modify: `frontend/src/messages/fr/login.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: no new namespace, no new keys — only 7 existing French VALUES change (2 in `common.json`, 5 in `login.json`). `ht`/`en` files and all key names are untouched, so `locales.test.ts`'s key-set-equality check is unaffected by this task.

This is a data-only fix: `fr/common.json`'s `errors.generic`/`errors.network` and `fr/login.json`'s `errors.*` currently read in tutoiement ("Réessaie.", "Vérifie d'abord ton adresse e-mail avant de te connecter.") — a carryover from `/login`'s Phase-0 copy, which mixed registers and was explicitly deferred by Plan 1a's Global Constraints ("`/login` is not touched by this plan"). This plan's own 3 pages are about to become the first screens other than `/login` to consume `Common.errors.generic`/`Common.errors.network` (via the error-handling normalization below), so shipping them with `/login`'s stale tutoiement copy would put a fresh vouvoiement page one `tCommon()` call away from a jarring register switch. Fixing it here, before any other task in this plan reads these two files, closes the gap the spec originally called for ("`fr/login.json`'s error strings get corrected to 'vous' as part of this phase's message-file work") without touching `/login`'s own code, exactly as the spec anticipated.

- [ ] **Step 1: Fix `fr/common.json`**

In `frontend/src/messages/fr/common.json`, change:

```json
{
  "errors": {
    "generic": "Une erreur est survenue. Réessaie.",
    "network": "Erreur réseau. Réessaie."
  }
}
```

to:

```json
{
  "errors": {
    "generic": "Une erreur est survenue. Réessayez.",
    "network": "Erreur réseau. Réessayez."
  }
}
```

- [ ] **Step 2: Fix `fr/login.json`'s error strings**

In `frontend/src/messages/fr/login.json`, change:

```json
  "errors": {
    "TOO_MANY_LOGIN_ATTEMPTS": "Trop de tentatives. Réessaie dans quelques minutes.",
    "LOCKED_OUT": "Compte temporairement verrouillé après plusieurs échecs. Réessaie dans quelques minutes.",
    "INVALID_CREDENTIALS": "E-mail ou mot de passe incorrect.",
    "EMAIL_NOT_VERIFIED": "Vérifie d'abord ton adresse e-mail avant de te connecter.",
    "ACCOUNT_SUSPENDED": "Ce compte a été suspendu. Contacte le support."
  }
```

to:

```json
  "errors": {
    "TOO_MANY_LOGIN_ATTEMPTS": "Trop de tentatives. Réessayez dans quelques minutes.",
    "LOCKED_OUT": "Compte temporairement verrouillé après plusieurs échecs. Réessayez dans quelques minutes.",
    "INVALID_CREDENTIALS": "E-mail ou mot de passe incorrect.",
    "EMAIL_NOT_VERIFIED": "Vérifiez d'abord votre adresse e-mail avant de vous connecter.",
    "ACCOUNT_SUSPENDED": "Ce compte a été suspendu. Contactez le support."
  }
```

(`INVALID_CREDENTIALS` has no person-marking verb, so it is byte-identical before and after — listed for context, not because it changes.)

- [ ] **Step 3: Run the locale consistency test**

Run: `cd frontend && pnpm exec vitest run src/lib/locales.test.ts`
Expected: PASS — same test count as Plan 1a shipped (24 tests); only values changed, not keys, so the key-set-equality and disk-sync checks are unaffected.

- [ ] **Step 4: Format, lint, typecheck**

```bash
cd frontend
pnpm exec prettier --write src/messages/fr/common.json src/messages/fr/login.json
pnpm exec tsc --noEmit
```

Expected: clean. (No `eslint` needed — pure JSON, not a lint target.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/messages/fr/common.json frontend/src/messages/fr/login.json
git commit -m "$(cat <<'EOF'
fix(i18n): vouvoiement register fix — Common + Login error strings

Plan 1a deferred this (its own Global Constraints scoped /login's code
out), but this plan's 3 auth pages are the first screens other than
/login to consume Common.errors.generic/network, so shipping them next
to /login's stale tutoiement copy would put a fresh vouvoiement page one
tCommon() call away from a register switch. Only 7 French values change
(2 in common.json, 5 in login.json) — no keys, no ht/en files, no /login
code touched. Closes the gap the Phase-1 spec's original sign-off called
for: "fr/login.json's error strings get corrected to 'vous' as part of
this phase's message-file work."

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `ForgotPassword` namespace — `/forgot-password` migration

**Files:**
- Modify: `frontend/src/lib/locales.ts`
- Modify: `frontend/src/i18n/request.ts`
- Modify: `frontend/src/types/next-intl.d.ts`
- Create: `frontend/src/messages/{fr,ht,en}/forgotPassword.json`
- Modify: `frontend/src/app/forgot-password/page.tsx`

**Interfaces:**
- Consumes: `MESSAGE_NAMESPACES` from `@/lib/locales` (existing); `Login.headline`/`Login.subline` (Phase 0, unchanged) for the branding panel; `Common.errors.generic`/`Common.errors.network` (Task 1's fixed values) for the error fallback.
- Produces: `ForgotPassword` namespace — a leaf, consumed only by this page.

`AUTH_FORGOT_PASSWORD`'s single-`if` error handling (`err.code === 'TOO_MANY_FORGOT_ATTEMPTS'`, else default, else network) becomes an explicit switch with one case, matching `/login`'s pattern exactly. `AUTH_LOGIN.headline`/`.subline` on the branding panel are replaced by `useTranslations('Login')` calls — reusing Phase 0's existing translations rather than duplicating the same brand copy into a 4th namespace. `AUTH_FORGOT_PASSWORD.confirmation.body`, currently a `(email: string) => string` function, becomes an ICU-interpolated `t('confirmation.body', { email })` call, matching the `{email}` placeholder pattern Plan 1a's Task 2 already established for `Shell.sidebarUserProfile.accountOf`.

- [ ] **Step 1: Create the message files**

Create `frontend/src/messages/fr/forgotPassword.json`:

```json
{
  "title": "Mot de passe oublié ?",
  "subtitle": "Indiquez votre adresse e-mail — nous vous envoyons un code pour réinitialiser votre mot de passe.",
  "emailLabel": "Adresse e-mail",
  "submit": "Envoyer le code",
  "submitting": "Envoi…",
  "backToLogin": "Retour à la connexion",
  "confirmation": {
    "title": "Vérifiez votre boîte mail",
    "body": "Si un compte existe pour {email}, un code de réinitialisation vient d'être envoyé — il expire dans 15 minutes."
  },
  "errors": {
    "TOO_MANY_FORGOT_ATTEMPTS": "Trop de demandes pour cette adresse. Réessayez dans une heure."
  }
}
```

Create `frontend/src/messages/en/forgotPassword.json`:

```json
{
  "title": "Forgot your password?",
  "subtitle": "Enter your email address — we'll send you a code to reset your password.",
  "emailLabel": "Email address",
  "submit": "Send code",
  "submitting": "Sending…",
  "backToLogin": "Back to sign in",
  "confirmation": {
    "title": "Check your inbox",
    "body": "If an account exists for {email}, a reset code has just been sent — it expires in 15 minutes."
  },
  "errors": {
    "TOO_MANY_FORGOT_ATTEMPTS": "Too many requests for this address. Try again in an hour."
  }
}
```

Create `frontend/src/messages/ht/forgotPassword.json`:

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "title": "Ou bliye modpas ou?",
  "subtitle": "Antre imel ou — nou ap voye yon kòd pou reyinisyalize modpas ou.",
  "emailLabel": "Adrès imel",
  "submit": "Voye kòd la",
  "submitting": "Ap voye…",
  "backToLogin": "Retounen nan koneksyon an",
  "confirmation": {
    "title": "Verifye bwat imel ou",
    "body": "Si gen yon kont pou {email}, yon kòd reyinisyalizasyon fenk voye — li ekspire nan 15 minit."
  },
  "errors": {
    "TOO_MANY_FORGOT_ATTEMPTS": "Twòp demann pou adrès sa a. Eseye ankò nan yon èdtan."
  }
}
```

- [ ] **Step 2: Register the namespace**

In `frontend/src/lib/locales.ts`, change:

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
] as const;
```

- [ ] **Step 3: Wire the namespace into `i18n/request.ts` and `next-intl.d.ts`**

In `frontend/src/i18n/request.ts`, change:

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

to:

```ts
  const [
    common,
    login,
    shell,
    schoolSidebar,
    adminSidebar,
    schoolTopbar,
    adminTopbar,
    forgotPassword,
  ] = await Promise.all([
    import(`../messages/${locale}/common.json`),
    import(`../messages/${locale}/login.json`),
    import(`../messages/${locale}/shell.json`),
    import(`../messages/${locale}/schoolSidebar.json`),
    import(`../messages/${locale}/adminSidebar.json`),
    import(`../messages/${locale}/schoolTopbar.json`),
    import(`../messages/${locale}/adminTopbar.json`),
    import(`../messages/${locale}/forgotPassword.json`),
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

to:

```ts
import type common from '@/messages/fr/common.json';
import type login from '@/messages/fr/login.json';
import type shell from '@/messages/fr/shell.json';
import type schoolSidebar from '@/messages/fr/schoolSidebar.json';
import type adminSidebar from '@/messages/fr/adminSidebar.json';
import type schoolTopbar from '@/messages/fr/schoolTopbar.json';
import type adminTopbar from '@/messages/fr/adminTopbar.json';
import type forgotPassword from '@/messages/fr/forgotPassword.json';
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
    };
  }
}
```

- [ ] **Step 4: Migrate `forgot-password/page.tsx`**

Replace the full contents of `frontend/src/app/forgot-password/page.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, MailCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { api, ApiError } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

export default function ForgotPasswordPage() {
  const t = useTranslations('ForgotPassword');
  const tLogin = useTranslations('Login');
  const tCommon = useTranslations('Common');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError) {
        switch (err.code) {
          case 'TOO_MANY_FORGOT_ATTEMPTS':
            setError(t('errors.TOO_MANY_FORGOT_ATTEMPTS'));
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
      {/* Same branding panel as /login, kept visually consistent. */}
      <div className="relative flex shrink-0 flex-col items-start justify-center overflow-hidden bg-sidebar-dark px-6 py-8 text-white lg:w-[60%] lg:items-center lg:px-10 lg:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-24 hidden h-85 w-85 rounded-full border border-primary/20 lg:block"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -left-16 hidden h-55 w-55 rounded-full border border-primary/10 lg:block"
        />
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
            {tLogin('headline')}
          </h1>
          <p className="mb-10 hidden text-sm leading-relaxed text-white/50 lg:block">
            {tLogin('subline')}
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-background p-4 sm:p-6 lg:p-10">
        <Card className="w-full max-w-[430px] px-6 py-7 sm:px-9 sm:pt-9 sm:pb-7">
          <div className="mb-5 flex items-center">
            <Image
              src="/logos/schoolgesti-lockup.svg"
              alt="Schoolgesti"
              width={164}
              height={44}
              className="h-11 w-auto"
            />
          </div>

          {submitted ? (
            <>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-success">
                <MailCheck size={20} className="text-success-foreground" />
              </div>
              <h2 className="mb-1.5 text-[22px] font-extrabold tracking-tight text-foreground">
                {t('confirmation.title')}
              </h2>
              <p className="mb-6 text-caption leading-relaxed text-muted-foreground">
                {t('confirmation.body', { email })}
              </p>
              <Link
                href="/login"
                className="flex items-center justify-center gap-1.5 text-sm font-semibold text-primary"
              >
                <ArrowLeft size={14} />
                {t('backToLogin')}
              </Link>
            </>
          ) : (
            <>
              <h2 className="mb-1.5 text-[22px] font-extrabold tracking-tight text-foreground">
                {t('title')}
              </h2>
              <p className="mb-6 text-caption leading-relaxed text-muted-foreground">
                {t('subtitle')}
              </p>

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

                {error && (
                  <p role="alert" className="text-sm text-destructive-foreground">
                    {error}
                  </p>
                )}

                <Button type="submit" loading={submitting}>
                  <Mail size={16} />
                  {submitting ? t('submitting') : t('submit')}
                </Button>
              </form>

              <Link
                href="/login"
                className="mt-5 flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground"
              >
                <ArrowLeft size={14} />
                {t('backToLogin')}
              </Link>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
```

Note what changed beyond string replacement: the error-handling `if/else if/else` chain became an explicit `switch` (one case + `default` + a separate non-`ApiError` branch), matching `/login`'s pattern; `AUTH_LOGIN.headline`/`.subline` became `tLogin('headline')`/`tLogin('subline')`; `AUTH_FORGOT_PASSWORD.confirmation.body(email)` (a function call) became `t('confirmation.body', { email })` (an ICU-interpolated key).

- [ ] **Step 5: Run the locale consistency test**

Run: `cd frontend && pnpm exec vitest run src/lib/locales.test.ts`
Expected: PASS — now covers 8 namespaces.

- [ ] **Step 6: Format, lint, typecheck, build**

```bash
cd frontend
pnpm exec prettier --write src/lib/locales.ts src/i18n/request.ts src/types/next-intl.d.ts src/messages/*/forgotPassword.json src/app/forgot-password/page.tsx
pnpm exec eslint src/app/forgot-password/page.tsx
pnpm exec tsc --noEmit
pnpm build
```

Expected: all clean. `reset-password`/`verify-email` are not yet migrated (Tasks 3–4), so their own `constants.ts` imports are expected and not a regression here.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/locales.ts frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts frontend/src/messages/fr/forgotPassword.json frontend/src/messages/ht/forgotPassword.json frontend/src/messages/en/forgotPassword.json frontend/src/app/forgot-password/page.tsx
git commit -m "$(cat <<'EOF'
feat(i18n): ForgotPassword namespace — /forgot-password migration (FR/HT/EN)

Replaces AUTH_FORGOT_PASSWORD and AUTH_LOGIN's branding-panel usage on
this page. Error handling normalized to /login's explicit-switch pattern
(one page-specific case + Common.errors.generic default + Common.errors.network
for non-ApiError failures). confirmation.body's (email) => string function
becomes an ICU {email} interpolation.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `ResetPassword` namespace — `/reset-password` migration

**Files:**
- Modify: `frontend/src/lib/locales.ts`
- Modify: `frontend/src/i18n/request.ts`
- Modify: `frontend/src/types/next-intl.d.ts`
- Create: `frontend/src/messages/{fr,ht,en}/resetPassword.json`
- Modify: `frontend/src/app/reset-password/page.tsx`

**Interfaces:**
- Consumes: `MESSAGE_NAMESPACES` from `@/lib/locales` (now includes `forgotPassword` from Task 2); `Login.headline`/`Login.subline`; `Common.errors.generic`/`Common.errors.network`.
- Produces: `ResetPassword` namespace — a leaf, consumed only by this page.

`AUTH_RESET_PASSWORD`'s dynamic `err.code in AUTH_RESET_PASSWORD.errors` lookup (6 codes) becomes an explicit switch, same shape as Task 2's but with 6 cases instead of 1.

- [ ] **Step 1: Create the message files**

Create `frontend/src/messages/fr/resetPassword.json`:

```json
{
  "title": "Réinitialisez votre mot de passe",
  "subtitle": "Entrez le code reçu par email et choisissez un nouveau mot de passe.",
  "emailLabel": "Adresse e-mail",
  "codeLabel": "Code de réinitialisation",
  "codePlaceholder": "XXXXXXXX",
  "passwordLabel": "Nouveau mot de passe",
  "submit": "Réinitialiser le mot de passe",
  "submitting": "Réinitialisation…",
  "backToLogin": "Retour à la connexion",
  "done": {
    "title": "Mot de passe mis à jour 🎉",
    "subtitle": "Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.",
    "cta": "Se connecter"
  },
  "errors": {
    "VERIFICATION_CODE_INVALID": "Code invalide. Vérifiez votre saisie.",
    "VERIFICATION_CODE_EXPIRED": "Ce code a expiré — demandez-en un nouveau.",
    "TOO_MANY_RESET_ATTEMPTS": "Trop de tentatives. Réessayez dans quelques minutes.",
    "PASSWORD_BANNED": "Ce mot de passe est trop courant — choisissez-en un autre.",
    "PASSWORD_TOO_SHORT": "Mot de passe trop court.",
    "PASSWORD_PWNED": "Ce mot de passe est apparu dans une fuite de données connue."
  }
}
```

Create `frontend/src/messages/en/resetPassword.json`:

```json
{
  "title": "Reset your password",
  "subtitle": "Enter the code you received by email and choose a new password.",
  "emailLabel": "Email address",
  "codeLabel": "Reset code",
  "codePlaceholder": "XXXXXXXX",
  "passwordLabel": "New password",
  "submit": "Reset password",
  "submitting": "Resetting…",
  "backToLogin": "Back to sign in",
  "done": {
    "title": "Password updated 🎉",
    "subtitle": "You can now sign in with your new password.",
    "cta": "Sign in"
  },
  "errors": {
    "VERIFICATION_CODE_INVALID": "Invalid code. Check what you entered.",
    "VERIFICATION_CODE_EXPIRED": "This code has expired — request a new one.",
    "TOO_MANY_RESET_ATTEMPTS": "Too many attempts. Try again in a few minutes.",
    "PASSWORD_BANNED": "This password is too common — choose another one.",
    "PASSWORD_TOO_SHORT": "Password is too short.",
    "PASSWORD_PWNED": "This password has appeared in a known data breach."
  }
}
```

Create `frontend/src/messages/ht/resetPassword.json`:

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "title": "Reyinisyalize modpas ou",
  "subtitle": "Antre kòd ou resevwa pa imel epi chwazi yon nouvo modpas.",
  "emailLabel": "Adrès imel",
  "codeLabel": "Kòd reyinisyalizasyon",
  "codePlaceholder": "XXXXXXXX",
  "passwordLabel": "Nouvo modpas",
  "submit": "Reyinisyalize modpas la",
  "submitting": "Ap reyinisyalize…",
  "backToLogin": "Retounen nan koneksyon an",
  "done": {
    "title": "Modpas mete ajou 🎉",
    "subtitle": "Ou ka konekte kounye a ak nouvo modpas ou.",
    "cta": "Konekte"
  },
  "errors": {
    "VERIFICATION_CODE_INVALID": "Kòd envalid. Verifye sa ou antre a.",
    "VERIFICATION_CODE_EXPIRED": "Kòd sa a ekspire — mande yon lòt.",
    "TOO_MANY_RESET_ATTEMPTS": "Twòp tantativ. Eseye ankò nan kèk minit.",
    "PASSWORD_BANNED": "Modpas sa a twò komen — chwazi yon lòt.",
    "PASSWORD_TOO_SHORT": "Modpas la twò kout.",
    "PASSWORD_PWNED": "Modpas sa a parèt nan yon fuit done nou konnen."
  }
}
```

- [ ] **Step 2: Register the namespace**

In `frontend/src/lib/locales.ts`, change:

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
] as const;
```

- [ ] **Step 3: Wire the namespace into `i18n/request.ts` and `next-intl.d.ts`**

In `frontend/src/i18n/request.ts`, change:

```ts
  const [
    common,
    login,
    shell,
    schoolSidebar,
    adminSidebar,
    schoolTopbar,
    adminTopbar,
    forgotPassword,
  ] = await Promise.all([
    import(`../messages/${locale}/common.json`),
    import(`../messages/${locale}/login.json`),
    import(`../messages/${locale}/shell.json`),
    import(`../messages/${locale}/schoolSidebar.json`),
    import(`../messages/${locale}/adminSidebar.json`),
    import(`../messages/${locale}/schoolTopbar.json`),
    import(`../messages/${locale}/adminTopbar.json`),
    import(`../messages/${locale}/forgotPassword.json`),
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
    },
  };
```

to:

```ts
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
import type schoolTopbar from '@/messages/fr/schoolTopbar.json';
import type adminTopbar from '@/messages/fr/adminTopbar.json';
import type forgotPassword from '@/messages/fr/forgotPassword.json';
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
import type forgotPassword from '@/messages/fr/forgotPassword.json';
import type resetPassword from '@/messages/fr/resetPassword.json';
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
    };
  }
}
```

- [ ] **Step 4: Migrate `reset-password/page.tsx`**

Replace the full contents of `frontend/src/app/reset-password/page.tsx`:

```tsx
'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, KeyRound, Lock, Mail, PartyPopper } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

// Consumes a PASSWORD_RESET code (sent by /forgot-password) via
// POST /api/auth/reset-password. That route issues no cookies — it's a
// pre-session endpoint where the code itself is the proof — so success sends
// the user back to /login to sign in with their new password.
//
// The email link (see lib/server/auth/email-templates.ts) carries
// ?email=&code= so both fields arrive pre-filled — the user still has to
// enter a new password and press submit themselves (no auto-submit on load),
// so a corporate email scanner pre-fetching the link can't burn the
// single-use code.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('ResetPassword');
  const tLogin = useTranslations('Login');
  const tCommon = useTranslations('Common');
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [code, setCode] = useState(searchParams.get('code') ?? '');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: { email, code: code.trim().toUpperCase(), newPassword: password },
      });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        switch (err.code) {
          case 'VERIFICATION_CODE_INVALID':
            setError(t('errors.VERIFICATION_CODE_INVALID'));
            break;
          case 'VERIFICATION_CODE_EXPIRED':
            setError(t('errors.VERIFICATION_CODE_EXPIRED'));
            break;
          case 'TOO_MANY_RESET_ATTEMPTS':
            setError(t('errors.TOO_MANY_RESET_ATTEMPTS'));
            break;
          case 'PASSWORD_BANNED':
            setError(t('errors.PASSWORD_BANNED'));
            break;
          case 'PASSWORD_TOO_SHORT':
            setError(t('errors.PASSWORD_TOO_SHORT'));
            break;
          case 'PASSWORD_PWNED':
            setError(t('errors.PASSWORD_PWNED'));
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
      <div className="relative flex shrink-0 flex-col items-start justify-center overflow-hidden bg-sidebar-dark px-6 py-8 text-white lg:w-[60%] lg:items-center lg:px-10 lg:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-24 hidden h-85 w-85 rounded-full border border-primary/20 lg:block"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -left-16 hidden h-55 w-55 rounded-full border border-primary/10 lg:block"
        />
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
            {tLogin('headline')}
          </h1>
          <p className="mb-10 hidden text-sm leading-relaxed text-white/50 lg:block">
            {tLogin('subline')}
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-background p-4 sm:p-6 lg:p-10">
        <Card className="w-full max-w-[430px] px-6 py-7 sm:px-9 sm:pt-9 sm:pb-7">
          <div className="mb-5 flex items-center">
            <Image
              src="/logos/schoolgesti-lockup.svg"
              alt="Schoolgesti"
              width={164}
              height={44}
              className="h-11 w-auto"
            />
          </div>

          {done ? (
            <>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-success">
                <PartyPopper size={20} className="text-success-foreground" />
              </div>
              <h2 className="mb-1.5 text-[22px] font-extrabold tracking-tight text-foreground">
                {t('done.title')}
              </h2>
              <p className="mb-6 text-caption leading-relaxed text-muted-foreground">
                {t('done.subtitle')}
              </p>
              <Button onClick={() => router.push('/login')}>{t('done.cta')}</Button>
            </>
          ) : (
            <>
              <h2 className="mb-1.5 text-[22px] font-extrabold tracking-tight text-foreground">
                {t('title')}
              </h2>
              <p className="mb-6 text-caption leading-relaxed text-muted-foreground">
                {t('subtitle')}
              </p>
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
                <Field
                  label={t('codeLabel')}
                  type="text"
                  name="code"
                  required
                  placeholder={t('codePlaceholder')}
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  icon={<KeyRound size={14} />}
                  className="uppercase"
                />
                <Field
                  label={t('passwordLabel')}
                  type="password"
                  name="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  icon={<Lock size={14} />}
                />
                {error && (
                  <p role="alert" className="text-sm text-destructive-foreground">
                    {error}
                  </p>
                )}
                <Button type="submit" loading={submitting}>
                  {submitting ? t('submitting') : t('submit')}
                </Button>
              </form>
              <Link
                href="/login"
                className="mt-5 flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground"
              >
                <ArrowLeft size={14} />
                {t('backToLogin')}
              </Link>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run the locale consistency test**

Run: `cd frontend && pnpm exec vitest run src/lib/locales.test.ts`
Expected: PASS — now covers 9 namespaces.

- [ ] **Step 6: Format, lint, typecheck, build**

```bash
cd frontend
pnpm exec prettier --write src/lib/locales.ts src/i18n/request.ts src/types/next-intl.d.ts src/messages/*/resetPassword.json src/app/reset-password/page.tsx
pnpm exec eslint src/app/reset-password/page.tsx
pnpm exec tsc --noEmit
pnpm build
```

Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/locales.ts frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts frontend/src/messages/fr/resetPassword.json frontend/src/messages/ht/resetPassword.json frontend/src/messages/en/resetPassword.json frontend/src/app/reset-password/page.tsx
git commit -m "$(cat <<'EOF'
feat(i18n): ResetPassword namespace — /reset-password migration (FR/HT/EN)

Replaces AUTH_RESET_PASSWORD and AUTH_LOGIN's branding-panel usage. The
dynamic `err.code in AUTH_RESET_PASSWORD.errors` lookup (6 codes) becomes
an explicit switch with a Common.errors.generic default and a separate
non-ApiError network branch, matching /login's established pattern —
closes the typed-key bypass the dynamic lookup had.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `VerifyEmail` namespace — `/verify-email` migration

**Files:**
- Modify: `frontend/src/lib/locales.ts`
- Modify: `frontend/src/i18n/request.ts`
- Modify: `frontend/src/types/next-intl.d.ts`
- Create: `frontend/src/messages/{fr,ht,en}/verifyEmail.json`
- Modify: `frontend/src/app/verify-email/page.tsx`

**Interfaces:**
- Consumes: `MESSAGE_NAMESPACES` from `@/lib/locales` (now includes `resetPassword` from Task 3); `Login.headline`/`Login.subline`; `Common.errors.generic`/`Common.errors.network`.
- Produces: `VerifyEmail` namespace — a leaf, consumed only by this page.

This page has two error-prone handlers. `onVerify`'s dynamic lookup (3 codes: `VERIFICATION_CODE_INVALID`/`VERIFICATION_CODE_EXPIRED`/`TOO_MANY_VERIFY_ATTEMPTS`) becomes an explicit switch, same shape as Tasks 2–3. `onSetPassword` is the one genuine translation-gap fix the spec calls out: today it special-cases `PASSWORD_ALREADY_SET` (silently advances to `done`) and otherwise falls back to **raw, always-French `err.message` from the API response** — meaning an English or Kreyòl user hitting `PASSWORD_BANNED`/`PASSWORD_TOO_SHORT`/`PASSWORD_PWNED` on this specific screen today sees untranslated French regardless of their locale. `POST /api/auth/set-password` (`frontend/src/app/api/auth/set-password/route.ts`) can return exactly these codes: `PASSWORD_ALREADY_SET` (handled), `PASSWORD_BANNED`, `PASSWORD_TOO_SHORT`, `PASSWORD_PWNED` (translated via new `setPassword.errors.*` keys — a nested group under this page's own `VerifyEmail.setPassword`, not reused from `ResetPassword`'s namespace, keeping the one-namespace-per-screen convention intact even though the 3 codes and their copy are identical in meaning), and `VALIDATION_FAILED`/`USER_NOT_FOUND` (both fall to the `default` case — these can't occur via this screen's own form, only via a malformed/stale request).

- [ ] **Step 1: Create the message files**

Create `frontend/src/messages/fr/verifyEmail.json`:

```json
{
  "title": "Vérifiez votre adresse e-mail",
  "subtitle": "Entrez le code à 8 caractères reçu par email pour activer votre compte.",
  "emailLabel": "Adresse e-mail",
  "codeLabel": "Code de vérification",
  "codePlaceholder": "XXXXXXXX",
  "submit": "Vérifier",
  "submitting": "Vérification…",
  "backToLogin": "Retour à la connexion",
  "setPassword": {
    "title": "Adresse vérifiée 🎉",
    "subtitle": "Choisissez un mot de passe pour vous connecter la prochaine fois.",
    "passwordLabel": "Nouveau mot de passe",
    "submit": "Définir le mot de passe",
    "submitting": "Enregistrement…",
    "skip": "Plus tard",
    "errors": {
      "PASSWORD_BANNED": "Ce mot de passe est trop courant — choisissez-en un autre.",
      "PASSWORD_TOO_SHORT": "Mot de passe trop court.",
      "PASSWORD_PWNED": "Ce mot de passe est apparu dans une fuite de données connue."
    }
  },
  "done": {
    "title": "Tout est prêt !",
    "cta": "Accéder au tableau de bord"
  },
  "errors": {
    "VERIFICATION_CODE_INVALID": "Code invalide. Vérifiez votre saisie.",
    "VERIFICATION_CODE_EXPIRED": "Ce code a expiré — demandez-en un nouveau.",
    "TOO_MANY_VERIFY_ATTEMPTS": "Trop de tentatives. Réessayez dans quelques minutes."
  }
}
```

Create `frontend/src/messages/en/verifyEmail.json`:

```json
{
  "title": "Verify your email address",
  "subtitle": "Enter the 8-character code you received by email to activate your account.",
  "emailLabel": "Email address",
  "codeLabel": "Verification code",
  "codePlaceholder": "XXXXXXXX",
  "submit": "Verify",
  "submitting": "Verifying…",
  "backToLogin": "Back to sign in",
  "setPassword": {
    "title": "Address verified 🎉",
    "subtitle": "Choose a password to sign in next time.",
    "passwordLabel": "New password",
    "submit": "Set password",
    "submitting": "Saving…",
    "skip": "Later",
    "errors": {
      "PASSWORD_BANNED": "This password is too common — choose another one.",
      "PASSWORD_TOO_SHORT": "Password is too short.",
      "PASSWORD_PWNED": "This password has appeared in a known data breach."
    }
  },
  "done": {
    "title": "All set!",
    "cta": "Go to dashboard"
  },
  "errors": {
    "VERIFICATION_CODE_INVALID": "Invalid code. Check what you entered.",
    "VERIFICATION_CODE_EXPIRED": "This code has expired — request a new one.",
    "TOO_MANY_VERIFY_ATTEMPTS": "Too many attempts. Try again in a few minutes."
  }
}
```

Create `frontend/src/messages/ht/verifyEmail.json`:

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "title": "Verifye adrès imel ou",
  "subtitle": "Antre kòd 8 karaktè ou resevwa pa imel pou aktive kont ou.",
  "emailLabel": "Adrès imel",
  "codeLabel": "Kòd verifikasyon",
  "codePlaceholder": "XXXXXXXX",
  "submit": "Verifye",
  "submitting": "Ap verifye…",
  "backToLogin": "Retounen nan koneksyon an",
  "setPassword": {
    "title": "Adrès verifye 🎉",
    "subtitle": "Chwazi yon modpas pou konekte pwochenn fwa a.",
    "passwordLabel": "Nouvo modpas",
    "submit": "Defini modpas la",
    "submitting": "Ap anrejistre…",
    "skip": "Pita",
    "errors": {
      "PASSWORD_BANNED": "Modpas sa a twò komen — chwazi yon lòt.",
      "PASSWORD_TOO_SHORT": "Modpas la twò kout.",
      "PASSWORD_PWNED": "Modpas sa a parèt nan yon fuit done nou konnen."
    }
  },
  "done": {
    "title": "Tout bagay pare!",
    "cta": "Ale nan tablodbò a"
  },
  "errors": {
    "VERIFICATION_CODE_INVALID": "Kòd envalid. Verifye sa ou antre a.",
    "VERIFICATION_CODE_EXPIRED": "Kòd sa a ekspire — mande yon lòt.",
    "TOO_MANY_VERIFY_ATTEMPTS": "Twòp tantativ. Eseye ankò nan kèk minit."
  }
}
```

- [ ] **Step 2: Register the namespace**

In `frontend/src/lib/locales.ts`, change:

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
] as const;
```

- [ ] **Step 3: Wire the namespace into `i18n/request.ts` and `next-intl.d.ts`**

In `frontend/src/i18n/request.ts`, change:

```ts
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
    },
  };
```

to:

```ts
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
import type schoolTopbar from '@/messages/fr/schoolTopbar.json';
import type adminTopbar from '@/messages/fr/adminTopbar.json';
import type forgotPassword from '@/messages/fr/forgotPassword.json';
import type resetPassword from '@/messages/fr/resetPassword.json';
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
import type forgotPassword from '@/messages/fr/forgotPassword.json';
import type resetPassword from '@/messages/fr/resetPassword.json';
import type verifyEmail from '@/messages/fr/verifyEmail.json';
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
    };
  }
}
```

- [ ] **Step 4: Migrate `verify-email/page.tsx`**

Replace the full contents of `frontend/src/app/verify-email/page.tsx`:

```tsx
'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, KeyRound, Lock, Mail, PartyPopper } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

type Step = 'code' | 'password' | 'done';

// Consumes an EMAIL_VERIFY code (from self-serve signup or a school owner
// invited via the admin's "Créer une école" flow — both use the same email.verification_code
// outbox event). Verifying logs the user in (POST /verify-email sets the
// auth cookies). Accounts created without a password (invited owners) then
// get an inline "set your password" step via the existing /set-password
// route — self-serve signups already have one, so that step is skippable
// and a 409 PASSWORD_ALREADY_SET there is treated as "nothing to do".
//
// The email link (see lib/server/auth/email-templates.ts) carries
// ?email=&code= so both fields arrive pre-filled — the user still has to
// press "Vérifier" themselves (no auto-submit on load), so a corporate email
// scanner pre-fetching the link can't silently burn the single-use code.
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('VerifyEmail');
  const tLogin = useTranslations('Login');
  const tCommon = useTranslations('Common');
  const [step, setStep] = useState<Step>('code');
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [code, setCode] = useState(searchParams.get('code') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/verify-email', {
        method: 'POST',
        body: { email, code: code.trim().toUpperCase() },
      });
      setStep('password');
    } catch (err) {
      if (err instanceof ApiError) {
        switch (err.code) {
          case 'VERIFICATION_CODE_INVALID':
            setError(t('errors.VERIFICATION_CODE_INVALID'));
            break;
          case 'VERIFICATION_CODE_EXPIRED':
            setError(t('errors.VERIFICATION_CODE_EXPIRED'));
            break;
          case 'TOO_MANY_VERIFY_ATTEMPTS':
            setError(t('errors.TOO_MANY_VERIFY_ATTEMPTS'));
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

  async function onSetPassword(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/set-password', { method: 'POST', body: { newPassword: password } });
      setStep('done');
    } catch (err) {
      if (err instanceof ApiError) {
        switch (err.code) {
          case 'PASSWORD_ALREADY_SET':
            // Self-serve signups already have a password — nothing left to do.
            setStep('done');
            return;
          case 'PASSWORD_BANNED':
            setError(t('setPassword.errors.PASSWORD_BANNED'));
            break;
          case 'PASSWORD_TOO_SHORT':
            setError(t('setPassword.errors.PASSWORD_TOO_SHORT'));
            break;
          case 'PASSWORD_PWNED':
            setError(t('setPassword.errors.PASSWORD_PWNED'));
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
      <div className="relative flex shrink-0 flex-col items-start justify-center overflow-hidden bg-sidebar-dark px-6 py-8 text-white lg:w-[60%] lg:items-center lg:px-10 lg:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-24 hidden h-85 w-85 rounded-full border border-primary/20 lg:block"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -left-16 hidden h-55 w-55 rounded-full border border-primary/10 lg:block"
        />
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
            {tLogin('headline')}
          </h1>
          <p className="mb-10 hidden text-sm leading-relaxed text-white/50 lg:block">
            {tLogin('subline')}
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-background p-4 sm:p-6 lg:p-10">
        <Card className="w-full max-w-[430px] px-6 py-7 sm:px-9 sm:pt-9 sm:pb-7">
          <div className="mb-5 flex items-center">
            <Image
              src="/logos/schoolgesti-lockup.svg"
              alt="Schoolgesti"
              width={164}
              height={44}
              className="h-11 w-auto"
            />
          </div>

          {step === 'code' && (
            <>
              <h2 className="mb-1.5 text-[22px] font-extrabold tracking-tight text-foreground">
                {t('title')}
              </h2>
              <p className="mb-6 text-caption leading-relaxed text-muted-foreground">
                {t('subtitle')}
              </p>
              <form onSubmit={onVerify} className="flex flex-col gap-4">
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
                <Field
                  label={t('codeLabel')}
                  type="text"
                  name="code"
                  required
                  placeholder={t('codePlaceholder')}
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  icon={<KeyRound size={14} />}
                  className="uppercase"
                />
                {error && (
                  <p role="alert" className="text-sm text-destructive-foreground">
                    {error}
                  </p>
                )}
                <Button type="submit" loading={submitting}>
                  {submitting ? t('submitting') : t('submit')}
                </Button>
              </form>
              <Link
                href="/login"
                className="mt-5 flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground"
              >
                <ArrowLeft size={14} />
                {t('backToLogin')}
              </Link>
            </>
          )}

          {step === 'password' && (
            <>
              <h2 className="mb-1.5 text-[22px] font-extrabold tracking-tight text-foreground">
                {t('setPassword.title')}
              </h2>
              <p className="mb-6 text-caption leading-relaxed text-muted-foreground">
                {t('setPassword.subtitle')}
              </p>
              <form onSubmit={onSetPassword} className="flex flex-col gap-4">
                <Field
                  label={t('setPassword.passwordLabel')}
                  type="password"
                  name="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  icon={<Lock size={14} />}
                />
                {error && (
                  <p role="alert" className="text-sm text-destructive-foreground">
                    {error}
                  </p>
                )}
                <Button type="submit" loading={submitting}>
                  {submitting ? t('setPassword.submitting') : t('setPassword.submit')}
                </Button>
              </form>
              <button
                type="button"
                onClick={() => router.push('/configuration/classes')}
                className="mt-5 flex w-full items-center justify-center text-sm font-medium text-muted-foreground"
              >
                {t('setPassword.skip')}
              </button>
            </>
          )}

          {step === 'done' && (
            <>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-success">
                <PartyPopper size={20} className="text-success-foreground" />
              </div>
              <h2 className="mb-6 text-[22px] font-extrabold tracking-tight text-foreground">
                {t('done.title')}
              </h2>
              <Button onClick={() => router.push('/configuration/classes')}>
                {t('done.cta')}
              </Button>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
```

Note what changed beyond string replacement: `onVerify`'s dynamic lookup became an explicit switch (3 cases). `onSetPassword` gained a full switch too — `PASSWORD_ALREADY_SET` keeps its existing silent-advance behavior (now a `case` instead of an `if`), `PASSWORD_BANNED`/`PASSWORD_TOO_SHORT`/`PASSWORD_PWNED` are newly translated via `setPassword.errors.*` (closing the raw-`err.message` gap), and `default`/network fall to `tCommon`.

- [ ] **Step 5: Run the locale consistency test**

Run: `cd frontend && pnpm exec vitest run src/lib/locales.test.ts`
Expected: PASS — now covers 10 namespaces.

- [ ] **Step 6: Format, lint, typecheck, build**

```bash
cd frontend
pnpm exec prettier --write src/lib/locales.ts src/i18n/request.ts src/types/next-intl.d.ts src/messages/*/verifyEmail.json src/app/verify-email/page.tsx
pnpm exec eslint src/app/verify-email/page.tsx
pnpm exec tsc --noEmit
pnpm build
```

Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/locales.ts frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts frontend/src/messages/fr/verifyEmail.json frontend/src/messages/ht/verifyEmail.json frontend/src/messages/en/verifyEmail.json frontend/src/app/verify-email/page.tsx
git commit -m "$(cat <<'EOF'
feat(i18n): VerifyEmail namespace — /verify-email migration (FR/HT/EN)

Replaces AUTH_VERIFY_EMAIL and AUTH_LOGIN's branding-panel usage.
onVerify's dynamic lookup (3 codes) becomes an explicit switch. onSetPassword
gains real translated cases for PASSWORD_BANNED/PASSWORD_TOO_SHORT/PASSWORD_PWNED
instead of surfacing raw, always-French err.message text to EN/HT users —
closes a real pre-existing translation gap, not just a refactor.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `constants.ts` cleanup + closing full-repo gate

**Files:**
- Modify: `frontend/src/lib/constants.ts`

**Interfaces:**
- Consumes: nothing new — this task only deletes now-dead code.
- Produces: nothing — `constants.ts` shrinks by 4 exports.

`AUTH_LOGIN`, `AUTH_FORGOT_PASSWORD`, `AUTH_RESET_PASSWORD`, `AUTH_VERIFY_EMAIL` have no remaining importers once Tasks 2–4 land (each of the 3 auth pages was their last consumer). Confirm this via `grep` immediately before deleting — do not assume the plan's own research from its writing-time is still accurate.

- [ ] **Step 1: Confirm all 4 exports are dead**

Run: `grep -rn "AUTH_LOGIN\|AUTH_FORGOT_PASSWORD\|AUTH_RESET_PASSWORD\|AUTH_VERIFY_EMAIL" frontend/src --include="*.tsx" --include="*.ts" | grep -v "constants.ts:"`

Expected: no output (empty). If any consumer still appears, STOP — do not delete; report which file still imports which constant, since that means Tasks 2–4 didn't fully migrate it.

- [ ] **Step 2: Delete `AUTH_LOGIN`, `AUTH_FORGOT_PASSWORD`, `AUTH_RESET_PASSWORD`**

In `frontend/src/lib/constants.ts`, delete this entire block (including its 3 leading comment lines) — it currently sits between `COOKIE_PREFIX` and `ADMIN_CREATE_SCHOOL`:

```ts
// French copy for the login screen — see .planning/banani/login-page.md.
export const AUTH_LOGIN = {
  headline: 'Gérez votre école, simplement.',
  subline:
    'La plateforme tout-en-un pour les établissements scolaires : notes, présences, bulletins et bien plus.',
  features: [
    'Saisie et gestion des notes par matière',
    'Suivi des présences en temps réel',
    'Génération automatique des bulletins',
    'Statistiques et rapports détaillés',
  ],
  welcome: 'Bienvenue 👋',
  formSubtitle:
    'Connectez-vous à votre espace pour accéder au tableau de bord de votre établissement.',
  roleTabs: {
    admin: 'Administrateur',
    teacher: 'Enseignant',
    studentParent: 'Élève / Parent',
  },
  emailLabel: 'Adresse e-mail',
  passwordLabel: 'Mot de passe',
  forgotPassword: 'Mot de passe oublié ?',
  rememberMe: 'Se souvenir de moi sur cet appareil',
  submit: 'Se connecter',
  submitting: 'Connexion…',
  noAccount: 'Pas encore de compte ?',
  contactAdmin: "Contacter l'administrateur",
  securityNote: 'Connexion sécurisée — vos données sont chiffrées',
  errors: {
    TOO_MANY_LOGIN_ATTEMPTS: 'Trop de tentatives. Réessaie dans quelques minutes.',
    default: 'E-mail ou mot de passe incorrect.',
    network: 'Erreur réseau. Réessaie.',
  },
} as const;

// French copy for the "Mot de passe oublié" screen.
export const AUTH_FORGOT_PASSWORD = {
  title: 'Mot de passe oublié ?',
  subtitle: 'Indique ton adresse e-mail — on t’envoie un code pour réinitialiser ton mot de passe.',
  emailLabel: 'Adresse e-mail',
  submit: 'Envoyer le code',
  submitting: 'Envoi…',
  backToLogin: 'Retour à la connexion',
  confirmation: {
    title: 'Vérifie ta boîte mail',
    body: (email: string) =>
      `Si un compte existe pour ${email}, un code de réinitialisation vient d'être envoyé — il expire dans 15 minutes.`,
  },
  errors: {
    TOO_MANY_FORGOT_ATTEMPTS: 'Trop de demandes pour cette adresse. Réessaie dans une heure.',
    default: 'Une erreur est survenue. Réessaie.',
    network: 'Erreur réseau. Réessaie.',
  },
} as const;

// French copy for the /reset-password screen — consumes a PASSWORD_RESET
// code sent by /forgot-password. Does not log the user in (the API route
// deliberately issues no cookies) — success sends them back to /login.
export const AUTH_RESET_PASSWORD = {
  title: 'Réinitialise ton mot de passe',
  subtitle: 'Entre le code reçu par email et choisis un nouveau mot de passe.',
  emailLabel: 'Adresse e-mail',
  codeLabel: 'Code de réinitialisation',
  codePlaceholder: 'XXXXXXXX',
  passwordLabel: 'Nouveau mot de passe',
  submit: 'Réinitialiser le mot de passe',
  submitting: 'Réinitialisation…',
  backToLogin: 'Retour à la connexion',
  done: {
    title: 'Mot de passe mis à jour 🎉',
    subtitle: 'Tu peux maintenant te connecter avec ton nouveau mot de passe.',
    cta: 'Se connecter',
  },
  errors: {
    VERIFICATION_CODE_INVALID: 'Code invalide. Vérifie ta saisie.',
    VERIFICATION_CODE_EXPIRED: 'Ce code a expiré — demande-en un nouveau.',
    TOO_MANY_RESET_ATTEMPTS: 'Trop de tentatives. Réessaie dans quelques minutes.',
    PASSWORD_BANNED: 'Ce mot de passe est trop courant — choisis-en un autre.',
    PASSWORD_TOO_SHORT: 'Mot de passe trop court.',
    PASSWORD_PWNED: 'Ce mot de passe est apparu dans une fuite de données connue.',
    default: 'Une erreur est survenue. Réessaie.',
    network: 'Erreur réseau. Réessaie.',
  },
} as const;

```

(Leave `COOKIE_PREFIX` immediately above and `// French copy for the "Créer une école" admin modal...` / `ADMIN_CREATE_SCHOOL` immediately below untouched — deleting the block above leaves one blank line between `COOKIE_PREFIX` and the `ADMIN_CREATE_SCHOOL` comment.)

- [ ] **Step 3: Delete `AUTH_VERIFY_EMAIL`**

In `frontend/src/lib/constants.ts`, delete this entire block (including its 3 leading comment lines) — it currently sits between `ORDINAL_LABELS` and the `// French copy for Frais & Scolarité...` / `FEES` comment:

```ts
// French copy for the /verify-email screen — consumes an EMAIL_VERIFY code
// (signup, or a school owner invited via the admin's "Créer une école" flow), logs the user
// in, then offers a one-time "set your password" step for accounts created
// without one (owners invited by an admin).
export const AUTH_VERIFY_EMAIL = {
  title: 'Vérifie ton adresse e-mail',
  subtitle: 'Entre le code à 8 caractères reçu par email pour activer ton compte.',
  emailLabel: 'Adresse e-mail',
  codeLabel: 'Code de vérification',
  codePlaceholder: 'XXXXXXXX',
  submit: 'Vérifier',
  submitting: 'Vérification…',
  backToLogin: 'Retour à la connexion',
  setPassword: {
    title: 'Adresse vérifiée 🎉',
    subtitle: 'Choisis un mot de passe pour te connecter la prochaine fois.',
    passwordLabel: 'Nouveau mot de passe',
    submit: 'Définir le mot de passe',
    submitting: 'Enregistrement…',
    skip: 'Plus tard',
  },
  done: {
    title: 'Tout est prêt !',
    cta: 'Accéder au tableau de bord',
  },
  errors: {
    VERIFICATION_CODE_INVALID: 'Code invalide. Vérifie ta saisie.',
    VERIFICATION_CODE_EXPIRED: 'Ce code a expiré — demande-en un nouveau.',
    TOO_MANY_VERIFY_ATTEMPTS: 'Trop de tentatives. Réessaie dans quelques minutes.',
    default: 'Une erreur est survenue. Réessaie.',
    network: 'Erreur réseau. Réessaie.',
  },
} as const;

```

(Leave `ORDINAL_LABELS` immediately above and the `// French copy for Frais & Scolarité...` / `FEES` comment+export immediately below untouched.)

- [ ] **Step 4: Format, lint, typecheck, build**

```bash
cd frontend
pnpm exec prettier --write src/lib/constants.ts
pnpm exec eslint src/lib/constants.ts
pnpm exec tsc --noEmit
pnpm build
```

Expected: all clean.

- [ ] **Step 5: Full-repo gate**

Run from this plan's own worktree root (NOT the main repo checkout — if this plan is executed via an isolated worktree, `cd` into that worktree's own path before running the commands below; never run them against a different checkout, which would validate the wrong tree and could collide with other concurrent work there):

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
```

Expected: all four green. This is the closing task of Plan 1b — confirm nothing outside this plan's own files regressed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/constants.ts
git commit -m "$(cat <<'EOF'
chore(i18n): delete AUTH_LOGIN, AUTH_FORGOT_PASSWORD, AUTH_RESET_PASSWORD, AUTH_VERIFY_EMAIL

Closes Plan 1b: all 4 exports had exactly one remaining importer each —
forgot-password/reset-password/verify-email's own pages — and all 3 are
now migrated to next-intl namespaces (Tasks 2-4). Confirmed dead via grep
immediately before deletion, not assumed from this plan's writing-time
research. /login's own migration (Phase 0) already dropped its AUTH_LOGIN
usage; this was the last of its 3 remaining branding-panel consumers.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Report to the user**

Summarize what shipped (all 3 auth-page siblings of `/login` now translated FR/HT/EN, 10 namespaces total including Phase 0's 2 and Plan 1a's 5; the vouvoiement register fix for `Common`/`Login` that Plan 1a deferred; the real translation-gap fix in `verify-email`'s `onSetPassword` — `PASSWORD_BANNED`/`PASSWORD_TOO_SHORT`/`PASSWORD_PWNED` no longer leak raw French to EN/HT users; the `constants.ts` cleanup removing 4 now-dead exports), and that Plan 1c (dashboards + E2E/Lighthouse verification across Phase 1's pages + CLAUDE.md documentation update) is written next. Do **not** push to `origin/develop` unless the user explicitly asks — matches this project's established working pattern.
