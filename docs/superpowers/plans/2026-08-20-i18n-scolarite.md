# i18n — Scolarité (Fees & Tuition) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the Scolarité (Frais & Scolarité / Fees & Tuition) module — 12 files, ~2,850 lines — into French/Haitian Creole/English via next-intl, fixing two real bugs (hardcoded `'fr-FR'` date formatting, a 6-site tutoiement violation), unifying the duplicated WhatsApp-toast copy between `paiements/page.tsx` and `relances/page.tsx`, and making the payment-receipt popup follow the admin's UI locale.

**Architecture:** Same `next-intl` machinery as every prior i18n phase: `useTranslations('Fees.<section>')` in client components, one `fees` namespace covering all 12 files (nested per section), registered in `locales.ts`/`i18n/request.ts`/`next-intl.d.ts`. No new infrastructure.

**Tech Stack:** Next.js 16 App Router, next-intl, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-08-20-i18n-scolarite-design.md`

## Global Constraints

- **Vouvoiement throughout, no exceptions** — standing convention, same as every prior phase.
- **`'Erreur réseau. Réessaie.'` tutoiement violation — 6 sites, not 5.** The design spec's survey-level scan undercounted by one; the exhaustive read-through for this plan found the exact byte-identical string at: `configuration/page.tsx` (×3 — `patchAutomation`, `onSave`, `onCopyFrom`), `relances/page.tsx` (×1 — `patchAutomation`), `DisputeModal.tsx` (×1), `PaymentRegistrationModal.tsx` (×1). All 6 route through the existing `Common.errors.network` key (`"Erreur réseau. Réessayez."` — already vouvoiement-correct, already shipped in the shared-UI-primitives phase), not a new key.
- **A second, distinct tutoiement violation**: `'Envoi WhatsApp impossible. Réessaie.'` (WhatsApp-specific fallback, different wording from the generic network error above) appears identically in `paiements/page.tsx` and `relances/page.tsx`. This is NOT replaced by `Common.errors.network` (different meaning — "WhatsApp send failed" vs. "network error"); it gets its own `Fees.whatsapp.errorSendFailed` key with the vouvoiement fix applied directly: `"Envoi WhatsApp impossible. Réessayez."`.
- **Straight ASCII apostrophes (`'`) in every message JSON value — never the source `.tsx`/`.ts` files' curly typographic apostrophes (`'`).** Verified 4 curly apostrophes in the source that must convert on the way into JSON: `FEES.configuration.classListTitle` ("l'école"), `FEES.configuration.autoRemindersToggleDesc` ("l'échéance"), `FEES.configuration.saveBarHelper` ("qu'après" — dropped anyway, see below), `FeeHistoryModal.tsx`'s inline load-error string ("l'historique"). Every JSON snippet in this plan already uses straight `'` — copy them verbatim, do not retype by hand.
- **`.one`/`.other` plural keys, selected by the caller via `t(n > 1 ? 'key.other' : 'key.one', { n })`** — never ICU `{n, plural, ...}` single-string syntax. This is the exact, verified pattern already shipped in `dashboard/activites/page.tsx:111` and `dashboard/FeesSummaryRow.tsx:79-111`; every plural key in this plan follows it.
- **4 dead keys in `FEES.configuration` are dropped, not ported**: `saveConfiguration`, `saveBarHelper`, `distributionLabel`, `configuredCount` — confirmed by repo-wide grep to have zero call sites anywhere. Porting unused strings into 3 languages would be pure waste; if a future screen needs them, add them fresh when that screen actually renders them.
- **New pluralization correctness fixes** (the source `.tsx` files render a fixed plural form regardless of count today — e.g. `` `${n} élèves` `` even when `n === 1`; each becomes a real `.one`/`.other` pair): `Fees.overview.resultCount`, `Fees.overview.alertBanner`, `Fees.overdue.selectedCount`, `Fees.overdue.daysOverdue`, `Fees.configuration.tranchesBuilderSubtitle`. Haitian Creole nouns don't inflect for plural the way French/English do, so every `ht` `.one`/`.other` pair below is intentionally the same string in both slots — this is correct Haitian Creole grammar, not a translation shortcut.
- **`ordinalTrancheLabel`'s locale-specific shape**: the French source (`` `${n}${n === 1 ? 'ère' : 'ème'} Tranche` ``) is ported verbatim as `Fees.configuration.trancheDefaultLabel.{one,other}` for French. English and Haitian Creole intentionally do NOT replicate French ordinal-suffix logic (`Intl.PluralRules` ordinal categories don't map cleanly to Haitian Creole, and forcing "1st/2nd/3rd" onto a generated placeholder label adds complexity for zero user-facing value) — they use the flat `"Installment {n}"` / `"Tranch {n}"` shape instead. Word order and structure are allowed to differ between locales; only the meaning must match.
- **Haitian Creole `_review` flag** — every `ht/*.json` file carries `"_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production."` verbatim, as the first key. `fees.json` (new file) gets it in Task 1.
- **Two same-named, unrelated `StudentStatusBadge` components exist** — `components/school/fees/badges.tsx`'s (in scope, `UP_TO_DATE`/`PARTIAL`/`OVERDUE`/`UNPAID`) and `components/school/StudentStatusBadge.tsx`'s (out of scope, academic-year-rollover wizard, `promu`/`redoublant`/`nonreinscrit`). This plan touches only the first. Do not edit `components/school/StudentStatusBadge.tsx`.
- **`fmtDate`/`fmtDateShort` signature migration is staged across tasks, not done in one shot.** `lib/fees-format.ts` is shared by all 5 files that format dates (`paiements/page.tsx`, `relances/page.tsx`, `configuration/page.tsx`, `FeeHistoryModal.tsx`, `PaymentRegistrationModal.tsx`), spread across Tasks 2, 3, 4, 6. Task 1 adds an optional `locale: string = 'fr-FR'` parameter (preserving today's exact behavior for any not-yet-migrated caller). Each task that touches a calling file passes its real locale explicitly. Task 7 removes the default (`locale: string` becomes required) as a compile-time guarantee every call site was updated — if any caller was missed, `pnpm typecheck` fails immediately in Task 7, not silently at runtime.
- **`FEES` (`@/lib/constants`) is deleted entirely in Task 7**, once every consumer has migrated off it. Confirmed by repo-wide grep: all 12 in-scope files are the only consumers, no cross-dependency fence needed (unlike the Carnet de notes phase's `OFFLINE_SYNC` fence).
- **Payment-receipt printing follows the admin's UI locale** — per the user's sign-off decision in the spec, `lib/fees-receipt.ts` gains a `labels: ReceiptLabels` parameter (populated by the caller from its own `useTranslations`) instead of importing `FEES` directly, since `openReceiptAndPrint` is a plain function outside the React tree and can't call `useTranslations()` itself.
- Full gate before every commit: `pnpm typecheck && pnpm lint && pnpm test` (format runs automatically via the pre-commit hook).
- Work happens in an isolated git worktree (`.worktrees/i18n-scolarite`, branch `feat/i18n-scolarite`, forked from local `develop` HEAD) — never the main checkout, which other concurrent sessions may have uncommitted work in.

---

### Task 1: Namespace registration + shared keys + `badges.tsx` + `FeesTabs.tsx` + `fees-format.ts`

**Files:**
- Create: `frontend/src/messages/fr/fees.json`
- Create: `frontend/src/messages/ht/fees.json`
- Create: `frontend/src/messages/en/fees.json`
- Modify: `frontend/src/lib/locales.ts` (add `'fees'` to `MESSAGE_NAMESPACES`)
- Modify: `frontend/src/i18n/request.ts` (register `fees` import + `Fees` messages key)
- Modify: `frontend/src/types/next-intl.d.ts` (register `fees` type import + `Fees` in `Messages`)
- Modify: `frontend/src/components/school/fees/badges.tsx`
- Modify: `frontend/src/components/school/fees/FeesTabs.tsx`
- Modify: `frontend/src/lib/fees-format.ts`

**Interfaces:**
- Produces: the `fees` namespace with `nav`, `tabs`, `studentStatus.{UP_TO_DATE,PARTIAL,OVERDUE,UNPAID}`, `trancheStatus.{PAID,PARTIAL,OVERDUE,UPCOMING}`, `overdueSeverity.{CRITICAL,OVERDUE,RECENT}`, `paymentMethod.{ESPECES,MONCASH,NATCASH,CHEQUE,VIREMENT}`, `whatsapp.*`, `stub` — every later task consumes these via `useTranslations('Fees.<group>')`.
- Produces: `fmtMoney(amount, currency?)` unchanged; `fmtDate(d, locale?: string)` / `fmtDateShort(d, locale?: string)` — new optional second parameter, default `'fr-FR'`. Later tasks pass `LOCALE_BCP47[locale]` from their own `useLocale()`.
- Consumes: nothing from other tasks (first task).

- [ ] **Step 1: Create `frontend/src/messages/fr/fees.json`**

```json
{
  "nav": {
    "label": "Frais & Scolarité"
  },
  "tabs": {
    "paiements": "Suivi des paiements",
    "relances": "Relances & Impayés",
    "configuration": "Configuration"
  },
  "studentStatus": {
    "UP_TO_DATE": "À jour",
    "PARTIAL": "Partiel",
    "OVERDUE": "En retard",
    "UNPAID": "Non payé"
  },
  "trancheStatus": {
    "PAID": "Payée",
    "PARTIAL": "Partiel",
    "OVERDUE": "En retard",
    "UPCOMING": "À venir"
  },
  "overdueSeverity": {
    "CRITICAL": "Critique",
    "OVERDUE": "En retard",
    "RECENT": "Récent"
  },
  "paymentMethod": {
    "ESPECES": "Espèces",
    "MONCASH": "MonCash",
    "NATCASH": "Natcash",
    "CHEQUE": "Chèque",
    "VIREMENT": "Virement"
  },
  "whatsapp": {
    "sentSuccess": "Rappel WhatsApp envoyé.",
    "errorNoGuardianPhone": "Aucun numéro de tuteur principal renseigné pour cet élève.",
    "errorNoBalance": "Aucun solde restant pour cet élève.",
    "errorNotConfigured": "L'envoi WhatsApp n'est pas encore configuré.",
    "errorSendFailed": "Envoi WhatsApp impossible. Réessayez."
  },
  "stub": "Cette fonctionnalité arrive bientôt."
}
```

- [ ] **Step 2: Create `frontend/src/messages/en/fees.json`**

```json
{
  "nav": {
    "label": "Fees & Tuition"
  },
  "tabs": {
    "paiements": "Payment tracking",
    "relances": "Reminders & Overdue",
    "configuration": "Configuration"
  },
  "studentStatus": {
    "UP_TO_DATE": "Up to date",
    "PARTIAL": "Partial",
    "OVERDUE": "Overdue",
    "UNPAID": "Unpaid"
  },
  "trancheStatus": {
    "PAID": "Paid",
    "PARTIAL": "Partial",
    "OVERDUE": "Overdue",
    "UPCOMING": "Upcoming"
  },
  "overdueSeverity": {
    "CRITICAL": "Critical",
    "OVERDUE": "Overdue",
    "RECENT": "Recent"
  },
  "paymentMethod": {
    "ESPECES": "Cash",
    "MONCASH": "MonCash",
    "NATCASH": "Natcash",
    "CHEQUE": "Check",
    "VIREMENT": "Bank transfer"
  },
  "whatsapp": {
    "sentSuccess": "WhatsApp reminder sent.",
    "errorNoGuardianPhone": "No primary guardian phone number on file for this student.",
    "errorNoBalance": "No remaining balance for this student.",
    "errorNotConfigured": "WhatsApp sending isn't configured yet.",
    "errorSendFailed": "Couldn't send the WhatsApp message. Try again."
  },
  "stub": "This feature is coming soon."
}
```

- [ ] **Step 3: Create `frontend/src/messages/ht/fees.json`**

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "nav": {
    "label": "Frè & Eskolarite"
  },
  "tabs": {
    "paiements": "Swivi peman yo",
    "relances": "Rapèl & Enpeye",
    "configuration": "Konfigirasyon"
  },
  "studentStatus": {
    "UP_TO_DATE": "Ajou",
    "PARTIAL": "Pasyèl",
    "OVERDUE": "An reta",
    "UNPAID": "Pa peye"
  },
  "trancheStatus": {
    "PAID": "Peye",
    "PARTIAL": "Pasyèl",
    "OVERDUE": "An reta",
    "UPCOMING": "Ap vini"
  },
  "overdueSeverity": {
    "CRITICAL": "Kritik",
    "OVERDUE": "An reta",
    "RECENT": "Resan"
  },
  "paymentMethod": {
    "ESPECES": "Kach",
    "MONCASH": "MonCash",
    "NATCASH": "Natcash",
    "CHEQUE": "Chèk",
    "VIREMENT": "Virman bankè"
  },
  "whatsapp": {
    "sentSuccess": "Rapèl WhatsApp voye.",
    "errorNoGuardianPhone": "Pa gen nimewo telefòn responsab prensipal anrejistre pou elèv sa a.",
    "errorNoBalance": "Pa gen rès balans pou elèv sa a.",
    "errorNotConfigured": "Anvwa WhatsApp la poko konfigire.",
    "errorSendFailed": "Nou pa t kapab voye mesaj WhatsApp la. Eseye ankò."
  },
  "stub": "Fonksyonalite sa a ap vini byento."
}
```

- [ ] **Step 4: Add `'fees'` to `MESSAGE_NAMESPACES` in `frontend/src/lib/locales.ts`**

Append `'fees'` as the last entry (after `'presences'`), keeping the array append-only so concurrent sessions adding their own namespace don't collide:

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
  'themePicker',
  'presences',
  'fees',
] as const;
```

(Re-read the file immediately before editing — other concurrent i18n sessions this same session are also appending their own namespace here; add only `'fees'`, don't touch any entry already present.)

- [ ] **Step 5: Register `fees` in `frontend/src/i18n/request.ts`**

Re-read the file first (same concurrency note as Step 4). Add the import and destructure/spread entries, keeping `fees` last:

```ts
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
    themePicker,
    presences,
    fees,
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
    import(`../messages/${locale}/themePicker.json`),
    import(`../messages/${locale}/presences.json`),
    import(`../messages/${locale}/fees.json`),
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
      ThemePicker: themePicker.default,
      Presences: presences.default,
      Fees: fees.default,
    },
  };
});
```

(If `presences` is not the last entry when you re-read the file — e.g. Carnet de notes' `gradebook` landed first — append `fees` after whatever is actually last, don't reorder existing entries.)

- [ ] **Step 6: Register `fees` in `frontend/src/types/next-intl.d.ts`**

Re-read the file first (same concurrency note). Add the import and the `Fees` entry, last:

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
import type dashboard from '@/messages/fr/dashboard.json';
import type adminDashboard from '@/messages/fr/adminDashboard.json';
import type schoolPlanCard from '@/messages/fr/schoolPlanCard.json';
import type settings from '@/messages/fr/settings.json';
import type themePicker from '@/messages/fr/themePicker.json';
import type presences from '@/messages/fr/presences.json';
import type fees from '@/messages/fr/fees.json';
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
      ThemePicker: typeof themePicker;
      Presences: typeof presences;
      Fees: typeof fees;
    };
  }
}
```

- [ ] **Step 7: Rewrite `frontend/src/components/school/fees/badges.tsx`**

Full replacement:

```tsx
'use client';

// Shared status pills for Frais & Scolarité — one place so the same status
// always renders with the same color across Fee Management, Relances
// Impayés, and the Payment Registration modal's tranche selector.
import { useTranslations } from 'next-intl';

export type StudentFeeStatus = 'UP_TO_DATE' | 'PARTIAL' | 'OVERDUE' | 'UNPAID';
export type TrancheStatus = 'PAID' | 'PARTIAL' | 'OVERDUE' | 'UPCOMING';

type Tone = 'success' | 'warning' | 'destructive' | 'muted';

const TONE_CLASSES: Record<Tone, string> = {
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
  muted: 'bg-secondary text-secondary-foreground',
};

function Pill({ tone, children }: { tone: Tone; children: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

const STUDENT_TONE: Record<StudentFeeStatus, Tone> = {
  UP_TO_DATE: 'success',
  PARTIAL: 'warning',
  OVERDUE: 'destructive',
  UNPAID: 'muted',
};

export function StudentStatusBadge({ status }: { status: StudentFeeStatus }) {
  const t = useTranslations('Fees.studentStatus');
  return <Pill tone={STUDENT_TONE[status]}>{t(status)}</Pill>;
}

const TRANCHE_TONE: Record<TrancheStatus, Tone> = {
  PAID: 'success',
  PARTIAL: 'warning',
  OVERDUE: 'destructive',
  UPCOMING: 'muted',
};

export function TrancheStatusBadge({ status }: { status: TrancheStatus }) {
  const t = useTranslations('Fees.trancheStatus');
  return <Pill tone={TRANCHE_TONE[status]}>{t(status)}</Pill>;
}

export type OverdueSeverity = 'CRITICAL' | 'OVERDUE' | 'RECENT';

const SEVERITY_TONE: Record<OverdueSeverity, Tone> = {
  CRITICAL: 'destructive',
  OVERDUE: 'warning',
  RECENT: 'muted',
};

export function SeverityBadge({ severity }: { severity: OverdueSeverity }) {
  const t = useTranslations('Fees.overdueSeverity');
  return <Pill tone={SEVERITY_TONE[severity]}>{t(severity)}</Pill>;
}
```

Note the added `'use client'` directive — `useTranslations` requires it, and this file didn't need one before (no hooks were used).

- [ ] **Step 8: Rewrite `frontend/src/components/school/fees/FeesTabs.tsx`**

Full replacement:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Tabs } from '@/components/ui/Tabs';

const ROUTE_BY_TAB = {
  paiements: '/scolarite/paiements',
  relances: '/scolarite/relances',
  configuration: '/scolarite/configuration',
} as const;

export type FeesTabKey = keyof typeof ROUTE_BY_TAB;

// `Tabs` is a pure key/onChange primitive (no routing) — this wraps it for
// Frais & Scolarité's 3 sibling routes, which the user confirmed should be
// real pages (not `?tab=` state) so each is independently linkable/back-
// button-able.
export function FeesTabs({ active }: { active: FeesTabKey }) {
  const router = useRouter();
  const t = useTranslations('Fees.tabs');
  const tabs = (Object.keys(ROUTE_BY_TAB) as FeesTabKey[]).map((key) => ({
    key,
    label: t(key),
  }));
  return (
    <Tabs
      tabs={tabs}
      active={active}
      onChange={(key) => router.push(ROUTE_BY_TAB[key as FeesTabKey])}
    />
  );
}
```

- [ ] **Step 9: Rewrite `frontend/src/lib/fees-format.ts`**

Full replacement:

```ts
// Client-side formatting helpers shared by the 3 Frais & Scolarité screens
// + the Payment Registration modal — kept in one place so amount/date
// rendering can never drift between them. See .planning/banani/frais-scolarite.md.
//
// `locale` defaults to `'fr-FR'` so any not-yet-migrated caller keeps its
// exact current behavior — this default is removed (parameter becomes
// required) once every caller passes its real locale explicitly. See
// docs/superpowers/plans/2026-08-20-i18n-scolarite.md Task 7.
import { formatPrice } from '@/lib/utils';

const DEFAULT_CURRENCY = 'HTG';

export function fmtMoney(amount: number, currency: string = DEFAULT_CURRENCY): string {
  return formatPrice(amount, currency);
}

export function fmtDate(d: string | Date, locale: string = 'fr-FR'): string {
  return new Date(d).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function fmtDateShort(d: string | Date, locale: string = 'fr-FR'): string {
  return new Date(d).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// "1.5/3" style fraction used by the Fee Management table's "Tranches" column.
export function fmtFraction(paid: number, total: number): string {
  const n = Number.isInteger(paid) ? paid : Math.round(paid * 10) / 10;
  return `${n}/${total}`;
}
```

`fmtMoney`'s default currency changes from `FEES.currency` (a re-export of the literal `'HTG'`) to a local `DEFAULT_CURRENCY` constant — same value, removes the `FEES` import so this file has zero dependency on `constants.ts` going forward (every caller already passes an explicit `currency` from its own state in practice; this default only matters before that state loads).

- [ ] **Step 10: Run the full gate**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all pass. `locales.test.ts` picks up the new `fees` namespace automatically. `badges.tsx` and `FeesTabs.tsx` will show TypeScript errors in `paiements/page.tsx`, `relances/page.tsx`, and `configuration/page.tsx` at this point ONLY IF those files' own `FEES`-based rendering conflicts with the new component signatures — it doesn't (the components' external props are unchanged, only their internals moved from `FEES` to `useTranslations`), so the gate should be clean.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/messages/fr/fees.json frontend/src/messages/ht/fees.json frontend/src/messages/en/fees.json frontend/src/lib/locales.ts frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts frontend/src/components/school/fees/badges.tsx frontend/src/components/school/fees/FeesTabs.tsx frontend/src/lib/fees-format.ts
git commit -m "$(cat <<'EOF'
feat(i18n): Scolarité — namespace registration + shared badges/tabs/format

First task of the Scolarité (Fees & Tuition) i18n phase: registers the
new `fees` namespace and migrates the 3 files shared across all 3
screens (StudentStatusBadge/TrancheStatusBadge/SeverityBadge, FeesTabs,
fmtDate/fmtDateShort's locale parameter) ahead of the per-screen work.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `paiements/page.tsx`

**Files:**
- Modify: `frontend/src/messages/{fr,ht,en}/fees.json` (add `overview.*`)
- Modify: `frontend/src/app/(school)/scolarite/paiements/page.tsx`

**Interfaces:**
- Consumes: `Fees.studentStatus`/`Fees.whatsapp`/`Fees.tabs` (Task 1), `fmtDate(d, locale)` new signature (Task 1), `Common.errors.network` (existing).
- Produces: nothing new consumed by later tasks. CSV export filename (`'frais-scolarite.csv'`) stays a literal, un-translated ASCII string — a download-safety choice (accented characters in filenames are inconsistently handled across browsers/OS), not a language gap.

- [ ] **Step 1: Append `overview` to `frontend/src/messages/fr/fees.json`**

Add this key as a new top-level sibling of `stub` (before the closing `}`):

```json
  "overview": {
    "title": "Gestion des Frais & Scolarité",
    "subtitle": "Suivi des paiements, tranches et relances",
    "export": "Exporter",
    "configureFees": "Paramétrage des plans",
    "loadError": "Impossible de charger les frais de scolarité.",
    "alertBanner": {
      "one": "{n} élève en retard de paiement — {tranche} échue le {dueDate}",
      "other": "{n} élèves en retard de paiement — {tranche} échue le {dueDate}"
    },
    "alertBannerSub": "Montant total impayé : {amount}",
    "kpiTotalCollected": "Total Recouvré",
    "kpiUpToDate": "Élèves à jour",
    "kpiOverdue": "En Retard",
    "kpiNextDueDate": "Prochaine Échéance",
    "searchPlaceholder": "Nom ou matricule...",
    "classFilterAll": "Toutes les classes",
    "statusFilterAll": "Tous les statuts",
    "resultCount": {
      "one": "{n} élève",
      "other": "{n} élèves"
    },
    "noResults": "Aucun résultat.",
    "columns": {
      "student": "Élève",
      "class": "Classe",
      "totalDue": "Total dû",
      "paid": "Payé",
      "remaining": "Reste à payer",
      "status": "Statut",
      "tranches": "Tranches"
    },
    "rowActions": {
      "registerPayment": "Enregistrer un paiement",
      "sendWhatsapp": "Envoyer WhatsApp",
      "viewHistory": "Voir l'historique",
      "printReceipt": "Imprimer le reçu"
    },
    "printReceiptNoPayment": "Aucun paiement enregistré pour cet élève.",
    "printReceiptLoadError": "Impossible de charger le reçu."
  }
```

- [ ] **Step 2: Append `overview` to `frontend/src/messages/en/fees.json`**

```json
  "overview": {
    "title": "Fee & Tuition Management",
    "subtitle": "Payment tracking, installments, and reminders",
    "export": "Export",
    "configureFees": "Plan setup",
    "loadError": "Unable to load tuition fees.",
    "alertBanner": {
      "one": "{n} student overdue — {tranche} was due {dueDate}",
      "other": "{n} students overdue — {tranche} was due {dueDate}"
    },
    "alertBannerSub": "Total unpaid amount: {amount}",
    "kpiTotalCollected": "Total Collected",
    "kpiUpToDate": "Students Up to Date",
    "kpiOverdue": "Overdue",
    "kpiNextDueDate": "Next Due Date",
    "searchPlaceholder": "Name or student number...",
    "classFilterAll": "All classes",
    "statusFilterAll": "All statuses",
    "resultCount": {
      "one": "{n} student",
      "other": "{n} students"
    },
    "noResults": "No results.",
    "columns": {
      "student": "Student",
      "class": "Class",
      "totalDue": "Total due",
      "paid": "Paid",
      "remaining": "Remaining",
      "status": "Status",
      "tranches": "Installments"
    },
    "rowActions": {
      "registerPayment": "Register a payment",
      "sendWhatsapp": "Send WhatsApp",
      "viewHistory": "View history",
      "printReceipt": "Print receipt"
    },
    "printReceiptNoPayment": "No payment recorded for this student.",
    "printReceiptLoadError": "Unable to load the receipt."
  }
```

- [ ] **Step 3: Append `overview` to `frontend/src/messages/ht/fees.json`**

```json
  "overview": {
    "title": "Jesyon Frè & Eskolarite",
    "subtitle": "Swivi peman, vèsman ak rapèl",
    "export": "Ekspòte",
    "configureFees": "Konfigirasyon plan yo",
    "loadError": "Nou pa ka chaje frè eskolarite yo.",
    "alertBanner": {
      "one": "{n} elèv an reta nan peman — {tranche} te dwe fèt {dueDate}",
      "other": "{n} elèv an reta nan peman — {tranche} te dwe fèt {dueDate}"
    },
    "alertBannerSub": "Total montan ki poko peye : {amount}",
    "kpiTotalCollected": "Total Kolekte",
    "kpiUpToDate": "Elèv Ajou",
    "kpiOverdue": "An Reta",
    "kpiNextDueDate": "Pwochen Echeyans",
    "searchPlaceholder": "Non oswa matrikil...",
    "classFilterAll": "Tout klas yo",
    "statusFilterAll": "Tout estati yo",
    "resultCount": {
      "one": "{n} elèv",
      "other": "{n} elèv"
    },
    "noResults": "Pa gen rezilta.",
    "columns": {
      "student": "Elèv",
      "class": "Klas",
      "totalDue": "Total dwe",
      "paid": "Peye",
      "remaining": "Rès pou peye",
      "status": "Estati",
      "tranches": "Vèsman"
    },
    "rowActions": {
      "registerPayment": "Anrejistre yon peman",
      "sendWhatsapp": "Voye WhatsApp",
      "viewHistory": "Wè istorik la",
      "printReceipt": "Enprime resi a"
    },
    "printReceiptNoPayment": "Pa gen peman anrejistre pou elèv sa a.",
    "printReceiptLoadError": "Nou pa ka chaje resi a."
  }
```

- [ ] **Step 4: Rewrite `frontend/src/app/(school)/scolarite/paiements/page.tsx`**

Full replacement:

```tsx
'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
  CalendarClock,
  CircleAlert,
  Download,
  Eye,
  MessageCircle,
  Printer,
  Settings2,
  Users,
  Wallet,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import {
  Skeleton,
  SkeletonFilters,
  SkeletonStatCards,
  SkeletonTable,
} from '@/components/ui/Skeleton';
import { exportToCsv } from '@/lib/csv-export';
import { LOCALE_BCP47 } from '@/lib/locales';
import { fmtMoney, fmtDate, fmtFraction } from '@/lib/fees-format';
import { openReceiptAndPrint } from '@/lib/fees-receipt';
import { FeesTabs } from '@/components/school/fees/FeesTabs';
import { FeeKpiRow } from '@/components/school/fees/FeeKpiRow';
import { StudentStatusBadge, type StudentFeeStatus } from '@/components/school/fees/badges';
import { PaymentRegistrationModal } from '@/components/school/fees/PaymentRegistrationModal';
// Code-split: only mounted when a row's "historique" action is clicked —
// see the matching StudentFormModal split in eleves/page.tsx for why.
const FeeHistoryModal = dynamic(
  () => import('@/components/school/fees/FeeHistoryModal').then((m) => m.FeeHistoryModal),
  { ssr: false },
);
import { Pager } from '@/components/school/fees/Pager';
import { LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';

const STUDENT_STATUS_KEYS: StudentFeeStatus[] = ['UP_TO_DATE', 'PARTIAL', 'OVERDUE', 'UNPAID'];

interface StudentRow {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  classId: string;
  className: string;
  totalDue: number;
  totalPaid: number;
  remaining: number;
  status: StudentFeeStatus;
  tranchesPaid: number;
  tranchesTotal: number;
}

interface OverviewResponse {
  students: StudentRow[];
  total: number;
  page: number;
  pageSize: number;
  classes: { id: string; name: string }[];
  kpis: {
    totalCollected: number;
    totalExpected: number;
    upToDateCount: number;
    totalStudents: number;
    overdueCount: number;
    overdueAmount: number;
    nextTranche: { label: string; dueDate: string; expectedAmount: number } | null;
  };
  overdueAlert: {
    count: number;
    trancheLabel: string;
    dueDate: string;
    totalUnpaid: number;
  } | null;
}

export default function FeeManagementPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('Fees.overview');
  const tStatus = useTranslations('Fees.studentStatus');
  const tWhatsapp = useTranslations('Fees.whatsapp');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | StudentFeeStatus>('');
  const [page, setPage] = useState(1);
  const [registeringFor, setRegisteringFor] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string>('HTG');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (classFilter) params.set('classId', classFilter);
    if (statusFilter) params.set('status', statusFilter);
    params.set('page', String(page));
    api<OverviewResponse>(`/api/school/fees/overview?${params.toString()}`)
      .then(setData)
      .catch(() => setError(t('loadError')));
  }, [search, classFilter, statusFilter, page, t]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  useEffect(() => {
    if (!user) return;
    api<{ settings: { currency: string } }>('/api/school/fees/automation-settings')
      .then((res) => setCurrency(res.settings.currency))
      .catch(() => {});
  }, [user]);

  function updateSearch(value: string) {
    setPage(1);
    setSearch(value);
  }
  function updateClassFilter(value: string) {
    setPage(1);
    setClassFilter(value);
  }
  function updateStatusFilter(value: '' | StudentFeeStatus) {
    setPage(1);
    setStatusFilter(value);
  }

  async function printLastReceipt(row: StudentRow) {
    try {
      const history = await api<{
        student: { firstName: string; lastName: string; studentNumber: string };
        tranches: { id: string; label: string }[];
        payments: {
          amount: number;
          penaltyAmount: number;
          method: 'ESPECES' | 'MONCASH' | 'NATCASH' | 'CHEQUE' | 'VIREMENT';
          reference: string | null;
          paidAt: string;
          feeTrancheId: string;
        }[];
      }>(`/api/school/fees/students/${row.studentId}/history`);
      const last = history.payments[0];
      if (!last) {
        toast(t('printReceiptNoPayment'), 'info');
        return;
      }
      const tranche = history.tranches.find((tr) => tr.id === last.feeTrancheId);
      openReceiptAndPrint({
        studentName: `${history.student.firstName} ${history.student.lastName}`,
        studentNumber: history.student.studentNumber,
        trancheLabel: tranche?.label ?? '—',
        amount: last.amount,
        penaltyAmount: last.penaltyAmount,
        method: last.method,
        reference: last.reference ?? undefined,
        paidAt: last.paidAt,
        currency,
      });
    } catch {
      toast(t('printReceiptLoadError'), 'error');
    }
  }

  async function sendWhatsappReminder(row: StudentRow) {
    try {
      await api(`/api/school/fees/students/${row.studentId}/send-whatsapp`, { method: 'POST' });
      toast(tWhatsapp('sentSuccess'), 'success');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'NO_GUARDIAN_PHONE') {
          toast(tWhatsapp('errorNoGuardianPhone'), 'error');
          return;
        }
        if (err.code === 'NO_BALANCE_DUE') {
          toast(tWhatsapp('errorNoBalance'), 'error');
          return;
        }
        if (err.code === 'NOT_CONFIGURED') {
          toast(tWhatsapp('errorNotConfigured'), 'error');
          return;
        }
      }
      toast(tWhatsapp('errorSendFailed'), 'error');
    }
  }

  function menuItemsFor(row: StudentRow) {
    return [
      {
        label: t('rowActions.registerPayment'),
        icon: <Wallet size={14} />,
        onClick: () => setRegisteringFor(row.studentId),
      },
      {
        label: t('rowActions.sendWhatsapp'),
        icon: <MessageCircle size={14} />,
        onClick: () => void sendWhatsappReminder(row),
      },
      {
        label: t('rowActions.viewHistory'),
        icon: <Eye size={14} />,
        onClick: () => setHistoryFor(row.studentId),
        divider: true,
      },
      {
        label: t('rowActions.printReceipt'),
        icon: <Printer size={14} />,
        onClick: () => printLastReceipt(row),
      },
    ];
  }

  function onExport() {
    if (!data) return;
    exportToCsv(
      'frais-scolarite.csv',
      [
        t('columns.student'),
        t('columns.class'),
        t('columns.totalDue'),
        t('columns.paid'),
        t('columns.remaining'),
        t('columns.status'),
        t('columns.tranches'),
      ],
      data.students.map((s) => [
        `${s.firstName} ${s.lastName}`,
        s.className,
        s.totalDue,
        s.totalPaid,
        s.remaining,
        tStatus(s.status),
        fmtFraction(s.tranchesPaid, s.tranchesTotal),
      ]),
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  return (
    <div className={`${LIST_PAGE} gap-5`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => router.push('/scolarite/configuration')}
          >
            <Settings2 size={14} />
            {t('configureFees')}
          </Button>
          <Button variant="outline" className="w-fit" onClick={onExport} disabled={!data}>
            <Download size={14} />
            {t('export')}
          </Button>
        </div>
      </div>

      <FeesTabs active="paiements" />

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {!data && !error && (
        <div className="flex flex-col gap-3.5">
          <SkeletonStatCards />
          <SkeletonFilters />
          <Card className="overflow-hidden">
            <SkeletonTable rows={8} cols={6} />
          </Card>
        </div>
      )}

      {data && (
        <>
          {data.overdueAlert && (
            <Card className="flex-row items-center justify-between gap-3 border-destructive bg-destructive p-4">
              <div>
                <p className="text-sm font-bold text-destructive-foreground">
                  {t(data.overdueAlert.count > 1 ? 'alertBanner.other' : 'alertBanner.one', {
                    n: data.overdueAlert.count,
                    tranche: data.overdueAlert.trancheLabel,
                    dueDate: fmtDate(data.overdueAlert.dueDate, bcp47),
                  })}
                </p>
                <p className="mt-0.5 text-xs text-destructive-foreground">
                  {t('alertBannerSub', { amount: fmtMoney(data.overdueAlert.totalUnpaid, currency) })}
                </p>
              </div>
            </Card>
          )}

          <FeeKpiRow
            items={[
              {
                icon: <Wallet size={14} />,
                label: t('kpiTotalCollected'),
                value: fmtMoney(data.kpis.totalCollected, currency),
                progressPercent:
                  data.kpis.totalExpected > 0
                    ? (data.kpis.totalCollected / data.kpis.totalExpected) * 100
                    : 0,
              },
              {
                icon: <Users size={14} />,
                label: t('kpiUpToDate'),
                value: `${data.kpis.upToDateCount}/${data.kpis.totalStudents}`,
                progressPercent:
                  data.kpis.totalStudents > 0
                    ? (data.kpis.upToDateCount / data.kpis.totalStudents) * 100
                    : 0,
              },
              {
                icon: <CircleAlert size={14} />,
                label: t('kpiOverdue'),
                value: String(data.kpis.overdueCount),
                sub: fmtMoney(data.kpis.overdueAmount, currency),
              },
              {
                icon: <CalendarClock size={14} />,
                label: t('kpiNextDueDate'),
                value: data.kpis.nextTranche ? fmtDate(data.kpis.nextTranche.dueDate, bcp47) : '—',
                sub: data.kpis.nextTranche?.label,
              },
            ]}
          />

          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="max-w-[300px]"
            />
            <FilterSelect value={classFilter} onValueChange={updateClassFilter}>
              <SelectItem value="">{t('classFilterAll')}</SelectItem>
              {data.classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              value={statusFilter}
              onValueChange={(v) => updateStatusFilter(v as '' | StudentFeeStatus)}
            >
              <SelectItem value="">{t('statusFilterAll')}</SelectItem>
              {STUDENT_STATUS_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {tStatus(key)}
                </SelectItem>
              ))}
            </FilterSelect>
            <span className="text-sm text-muted-foreground">
              {t(data.total > 1 ? 'resultCount.other' : 'resultCount.one', { n: data.total })}
            </span>
          </div>

          {data.students.length === 0 ? (
            <Card>
              <p className="p-5 text-sm text-muted-foreground">{t('noResults')}</p>
            </Card>
          ) : (
            <Card>
              {/* md+: table. Below that a table needs constant horizontal
                  scrolling to read a single student's balance — cards show
                  the numbers that matter (reste dû, statut) without it,
                  trading the secondary columns (dû/payé/tranches) for a tap
                  into the row's own menu (Historique shows the full detail). */}
              <div className={cn('hidden md:block', TABLE_SCROLL)}>
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead className={STICKY_THEAD}>
                    <tr className="border-b border-border">
                      <Th>{t('columns.student')}</Th>
                      <Th>{t('columns.class')}</Th>
                      <Th>{t('columns.totalDue')}</Th>
                      <Th>{t('columns.paid')}</Th>
                      <Th>{t('columns.remaining')}</Th>
                      <Th>{t('columns.status')}</Th>
                      <Th>{t('columns.tranches')}</Th>
                      <Th className="w-[70px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.map((s) => (
                      <tr key={s.studentId} className="border-b border-border last:border-none">
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={`${s.firstName} ${s.lastName}`} size={32} />
                            <div>
                              <div className="font-semibold text-foreground">
                                {s.firstName} {s.lastName}
                              </div>
                              <div className="text-2xs text-muted-foreground">
                                #{s.studentNumber}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 text-muted-foreground">{s.className}</td>
                        <td className="px-3.5 py-2.5 text-muted-foreground">
                          {fmtMoney(s.totalDue, currency)}
                        </td>
                        <td className="px-3.5 py-2.5 text-muted-foreground">
                          {fmtMoney(s.totalPaid, currency)}
                        </td>
                        <td className="px-3.5 py-2.5 font-semibold text-foreground">
                          {fmtMoney(s.remaining, currency)}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <StudentStatusBadge status={s.status} />
                        </td>
                        <td className="px-3.5 py-2.5 text-muted-foreground">
                          {fmtFraction(s.tranchesPaid, s.tranchesTotal)}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <ActionMenu items={menuItemsFor(s)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* < md: cards */}
              <div className="flex flex-col gap-2.5 p-3.5 md:hidden">
                {data.students.map((s) => (
                  <div key={s.studentId} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={`${s.firstName} ${s.lastName}`} size={32} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-foreground">
                            {s.firstName} {s.lastName}
                          </div>
                          <div className="truncate text-2xs text-muted-foreground">
                            #{s.studentNumber} · {s.className}
                          </div>
                        </div>
                      </div>
                      <div className="-mt-1 -mr-1 shrink-0">
                        <ActionMenu items={menuItemsFor(s)} />
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2.5">
                      <StudentStatusBadge status={s.status} />
                      <span className="text-caption font-bold text-foreground">
                        {t('columns.remaining')} : {fmtMoney(s.remaining, currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <Pager
                centered
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                onChange={setPage}
              />
            </Card>
          )}
        </>
      )}

      {registeringFor && (
        <PaymentRegistrationModal
          studentId={registeringFor}
          onClose={() => setRegisteringFor(null)}
          onSaved={load}
        />
      )}
      {historyFor && <FeeHistoryModal studentId={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase ${className}`}
    >
      {children}
    </th>
  );
}
```

This page has no bare network-error fallback of its own (its two `.catch()` blocks use `t('loadError')`/`t('printReceiptLoadError')`, not the generic `Common.errors.network`) — no `Common` import is needed here.

- [ ] **Step 5: Run the full gate**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all pass.

- [ ] **Step 6: Manual verification**

Start `pnpm dev`, log in as the seeded dev account, open `/scolarite/paiements`, switch language via the app's `LanguagePicker` (Paramètres → Langue) through all 3 locales. Verify: title/KPIs/table headers/search placeholder render translated; trigger the overdue alert banner (needs at least one overdue student in the seed data) and confirm singular/plural wording is correct at `n=1` vs `n>1`; open a row's action menu and confirm all 4 actions are translated; trigger "Envoyer WhatsApp" against a student with no guardian phone on file and confirm the error toast is translated.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/messages/fr/fees.json frontend/src/messages/ht/fees.json frontend/src/messages/en/fees.json "frontend/src/app/(school)/scolarite/paiements/page.tsx"
git commit -m "$(cat <<'EOF'
feat(i18n): Scolarité — translate paiements/page.tsx (Fee Management)

Second task of the Scolarité i18n phase. Adds fees.overview.* covering
the payment-tracking screen: KPIs, search/filters, table, row actions,
CSV export, WhatsApp-reminder toasts (now via the shared Fees.whatsapp
keys), and the overdue-alert banner (now correctly pluralized at n=1).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `relances/page.tsx` + `DisputeModal.tsx`

**Files:**
- Modify: `frontend/src/messages/{fr,ht,en}/fees.json` (add `overdue.*` + `disputeModal.*`)
- Modify: `frontend/src/app/(school)/scolarite/relances/page.tsx`
- Modify: `frontend/src/app/(school)/scolarite/relances/DisputeModal.tsx`

**Interfaces:**
- Consumes: `Fees.whatsapp`/`Fees.tabs`/`Fees.stub`/`Fees.overview.classFilterAll` (Task 1/2 — note `relances/page.tsx` currently reads `FEES.overview.classFilterAll` directly rather than duplicating it; this plan gives `overdue` its own `classFilterAll` copy instead, matching this module's established "each screen owns its own copy, even when textually identical" convention — see `searchPlaceholder`, already duplicated verbatim between `overview` and `overdue` in the source), `fmtDate(d, locale)` (Task 1), `Common.errors.network` (existing).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Append `overdue` and `disputeModal` to `frontend/src/messages/fr/fees.json`**

Add these two keys as new top-level siblings of `overview` (before the closing `}`):

```json
  "overdue": {
    "title": "Relances & Impayés",
    "subtitle": "Gérez les retards de paiement et automatisez les rappels",
    "exportList": "Exporter la liste",
    "bulkReminderBase": "Rappel groupé",
    "bulkReminderWithCount": "Rappel groupé ({n})",
    "loadError": "Impossible de charger les relances.",
    "kpiTotalUnpaid": "Total impayés",
    "kpiCritical": "Retard critique",
    "kpiSent": "Rappels envoyés",
    "kpiNextDue": "Prochaine échéance",
    "searchPlaceholder": "Nom ou matricule...",
    "classFilterAll": "Toutes les classes",
    "selectedCount": {
      "one": "{n} sélectionné",
      "other": "{n} sélectionnés"
    },
    "noResults": "Aucun retard de paiement.",
    "selectAllAria": "Tout sélectionner",
    "selectRowAria": "Sélectionner {name}",
    "disputedSuffix": "Litigieux",
    "columns": {
      "student": "Élève",
      "class": "Classe",
      "tranche": "Tranche",
      "amountDue": "Montant dû",
      "overdue": "Retard",
      "status": "Statut",
      "lastReminder": "Dernier rappel"
    },
    "daysOverdue": {
      "one": "{n} jour",
      "other": "{n} jours"
    },
    "rowActions": {
      "registerPayment": "Enregistrer un paiement",
      "sendReminder": "Envoyer rappel WhatsApp",
      "viewHistory": "Voir l'historique",
      "markDisputed": "Marquer comme litigieux"
    },
    "automationTitle": "Automatisation",
    "automationSubtitle": "Rappels automatiques",
    "reminderBefore5Days": "Rappel 5 jours avant",
    "reminderBefore5DaysDesc": "Notifier avant l'échéance",
    "reminderOnDueDate": "Rappel le jour J",
    "reminderOnDueDateDesc": "Le jour de l'échéance",
    "reminderWeekly": "Rappel hebdomadaire",
    "reminderWeeklyDesc": "Pour les impayés > 7 jours",
    "reminderCritical": "Alerte critique",
    "reminderCriticalDesc": "Retard > 30 jours",
    "reminderChannelWhatsapp": "Rappels via WhatsApp",
    "reminderChannelWhatsappDesc": "Payant (frais Meta) — sinon envoyés par email, gratuit",
    "byClassTitle": "Retards par classe",
    "quickActionsTitle": "Actions rapides",
    "exportExcel": "Exporter Excel"
  },
  "disputeModal": {
    "title": "Marquer comme litigieux",
    "reasonLabel": "Motif (optionnel)",
    "confirm": "Marquer comme litigieux",
    "cancel": "Annuler"
  }
```

- [ ] **Step 2: Append `overdue` and `disputeModal` to `frontend/src/messages/en/fees.json`**

```json
  "overdue": {
    "title": "Reminders & Overdue",
    "subtitle": "Manage overdue payments and automate reminders",
    "exportList": "Export list",
    "bulkReminderBase": "Bulk reminder",
    "bulkReminderWithCount": "Bulk reminder ({n})",
    "loadError": "Unable to load reminders.",
    "kpiTotalUnpaid": "Total unpaid",
    "kpiCritical": "Critically overdue",
    "kpiSent": "Reminders sent",
    "kpiNextDue": "Next due date",
    "searchPlaceholder": "Name or student number...",
    "classFilterAll": "All classes",
    "selectedCount": {
      "one": "{n} selected",
      "other": "{n} selected"
    },
    "noResults": "No overdue payments.",
    "selectAllAria": "Select all",
    "selectRowAria": "Select {name}",
    "disputedSuffix": "Disputed",
    "columns": {
      "student": "Student",
      "class": "Class",
      "tranche": "Installment",
      "amountDue": "Amount due",
      "overdue": "Overdue",
      "status": "Status",
      "lastReminder": "Last reminder"
    },
    "daysOverdue": {
      "one": "{n} day",
      "other": "{n} days"
    },
    "rowActions": {
      "registerPayment": "Register a payment",
      "sendReminder": "Send WhatsApp reminder",
      "viewHistory": "View history",
      "markDisputed": "Mark as disputed"
    },
    "automationTitle": "Automation",
    "automationSubtitle": "Automatic reminders",
    "reminderBefore5Days": "Reminder 5 days before",
    "reminderBefore5DaysDesc": "Notify before the due date",
    "reminderOnDueDate": "Reminder on the due date",
    "reminderOnDueDateDesc": "On the due date itself",
    "reminderWeekly": "Weekly reminder",
    "reminderWeeklyDesc": "For payments overdue more than 7 days",
    "reminderCritical": "Critical alert",
    "reminderCriticalDesc": "Overdue more than 30 days",
    "reminderChannelWhatsapp": "Reminders via WhatsApp",
    "reminderChannelWhatsappDesc": "Paid (Meta fees) — otherwise sent by email, free",
    "byClassTitle": "Overdue by class",
    "quickActionsTitle": "Quick actions",
    "exportExcel": "Export to Excel"
  },
  "disputeModal": {
    "title": "Mark as disputed",
    "reasonLabel": "Reason (optional)",
    "confirm": "Mark as disputed",
    "cancel": "Cancel"
  }
```

- [ ] **Step 3: Append `overdue` and `disputeModal` to `frontend/src/messages/ht/fees.json`**

```json
  "overdue": {
    "title": "Rapèl & Enpeye",
    "subtitle": "Jere reta nan peman epi otomatize rapèl yo",
    "exportList": "Ekspòte lis la",
    "bulkReminderBase": "Rapèl an gwoup",
    "bulkReminderWithCount": "Rapèl an gwoup ({n})",
    "loadError": "Nou pa ka chaje rapèl yo.",
    "kpiTotalUnpaid": "Total pa peye",
    "kpiCritical": "Reta kritik",
    "kpiSent": "Rapèl voye",
    "kpiNextDue": "Pwochen echeyans",
    "searchPlaceholder": "Non oswa matrikil...",
    "classFilterAll": "Tout klas yo",
    "selectedCount": {
      "one": "{n} seleksyone",
      "other": "{n} seleksyone"
    },
    "noResults": "Pa gen reta nan peman.",
    "selectAllAria": "Seleksyone tout",
    "selectRowAria": "Seleksyone {name}",
    "disputedSuffix": "Kontestasyon",
    "columns": {
      "student": "Elèv",
      "class": "Klas",
      "tranche": "Vèsman",
      "amountDue": "Montan dwe",
      "overdue": "Reta",
      "status": "Estati",
      "lastReminder": "Dènye rapèl"
    },
    "daysOverdue": {
      "one": "{n} jou",
      "other": "{n} jou"
    },
    "rowActions": {
      "registerPayment": "Anrejistre yon peman",
      "sendReminder": "Voye rapèl WhatsApp",
      "viewHistory": "Wè istorik la",
      "markDisputed": "Make kòm kontestasyon"
    },
    "automationTitle": "Otomatizasyon",
    "automationSubtitle": "Rapèl otomatik",
    "reminderBefore5Days": "Rapèl 5 jou anvan",
    "reminderBefore5DaysDesc": "Notifye anvan echeyans lan",
    "reminderOnDueDate": "Rapèl jou echeyans lan",
    "reminderOnDueDateDesc": "Jou echeyans lan menm",
    "reminderWeekly": "Rapèl chak semenn",
    "reminderWeeklyDesc": "Pou peman ki an reta plis pase 7 jou",
    "reminderCritical": "Alèt kritik",
    "reminderCriticalDesc": "An reta plis pase 30 jou",
    "reminderChannelWhatsapp": "Rapèl atravè WhatsApp",
    "reminderChannelWhatsappDesc": "Peye (frè Meta) — otreman voye pa imèl, gratis",
    "byClassTitle": "Reta pa klas",
    "quickActionsTitle": "Aksyon rapid",
    "exportExcel": "Ekspòte Excel"
  },
  "disputeModal": {
    "title": "Make kòm kontestasyon",
    "reasonLabel": "Rezon (opsyonèl)",
    "confirm": "Make kòm kontestasyon",
    "cancel": "Anile"
  }
```

- [ ] **Step 4: Rewrite `frontend/src/app/(school)/scolarite/relances/DisputeModal.tsx`**

Full replacement:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

export function DisputeModal({
  studentId,
  feeTrancheId,
  onClose,
  onSaved,
}: {
  studentId: string;
  feeTrancheId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('Fees.disputeModal');
  const tCommon = useTranslations('Common');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/school/fees/disputes', {
        method: 'POST',
        body: { studentId, feeTrancheId, reason: reason.trim() || undefined },
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t('title')} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-foreground">{t('reasonLabel')}</span>
          <textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-primary/10"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} className="sm:w-fit">
            {t('cancel')}
          </Button>
          <Button loading={submitting} onClick={onSubmit}>
            {t('confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 5: Rewrite `frontend/src/app/(school)/scolarite/relances/page.tsx`**

Full replacement:

```tsx
'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Bell,
  CircleAlert,
  Download,
  Eye,
  FileSpreadsheet,
  Flag,
  Send,
  Wallet,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Switch } from '@/components/ui/Switch';
import {
  Skeleton,
  SkeletonFilters,
  SkeletonStatCards,
  SkeletonTable,
} from '@/components/ui/Skeleton';
import { exportToCsv } from '@/lib/csv-export';
import { ASIDE_GRID, LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';
import { LOCALE_BCP47 } from '@/lib/locales';
import { fmtMoney, fmtDate } from '@/lib/fees-format';
import { FeesTabs } from '@/components/school/fees/FeesTabs';
import { FeeKpiRow } from '@/components/school/fees/FeeKpiRow';
import { SeverityBadge, type OverdueSeverity } from '@/components/school/fees/badges';
import { PaymentRegistrationModal } from '@/components/school/fees/PaymentRegistrationModal';
import { FeeHistoryModal } from '@/components/school/fees/FeeHistoryModal';
import { Pager } from '@/components/school/fees/Pager';
import { DisputeModal } from './DisputeModal';

interface OverdueRow {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  classId: string;
  className: string;
  trancheId: string;
  trancheLabel: string;
  amountDue: number;
  daysOverdue: number;
  severity: OverdueSeverity;
  lastReminderAt: string | null;
  disputed: boolean;
}

interface OverdueResponse {
  rows: OverdueRow[];
  total: number;
  page: number;
  pageSize: number;
  classes: { id: string; name: string }[];
  breakdown: { className: string; count: number }[];
  kpis: {
    totalUnpaid: number;
    overdueStudentCount: number;
    criticalCount: number;
    remindersSentThisMonth: number;
    nextDue: { trancheLabel: string; dueDate: string; amount: number } | null;
  };
}

interface AutomationSettings {
  lateFeeEnabled: boolean;
  autoRemindersEnabled: boolean;
  reminderBefore5Days: boolean;
  reminderOnDueDate: boolean;
  reminderWeeklyOverdue: boolean;
  reminderCriticalOverdue: boolean;
  currency: string;
  whatsappRemindersEnabled: boolean;
}

export default function OverdueFeesPage() {
  const user = useUser();
  const { toast } = useToast();
  const t = useTranslations('Fees.overdue');
  const tWhatsapp = useTranslations('Fees.whatsapp');
  const tCommon = useTranslations('Common');
  const tStub = useTranslations('Fees');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const [data, setData] = useState<OverdueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [registeringFor, setRegisteringFor] = useState<{
    studentId: string;
    trancheId: string;
  } | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [disputing, setDisputing] = useState<{ studentId: string; trancheId: string } | null>(null);
  const [automation, setAutomation] = useState<AutomationSettings | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (classFilter) params.set('classId', classFilter);
    params.set('page', String(page));
    api<OverdueResponse>(`/api/school/fees/overdue?${params.toString()}`)
      .then((res) => {
        setData(res);
        setSelected(new Set());
      })
      .catch(() => setError(t('loadError')));
  }, [search, classFilter, page, t]);

  useEffect(() => {
    if (!user) return;
    load();
    api<{ settings: AutomationSettings }>('/api/school/fees/automation-settings')
      .then((res) => setAutomation(res.settings))
      .catch(() => {});
  }, [user, load]);

  function updateSearch(value: string) {
    setPage(1);
    setSearch(value);
  }
  function updateClassFilter(value: string) {
    setPage(1);
    setClassFilter(value);
  }

  function toggleRow(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleAll() {
    if (!data) return;
    setSelected((prev) =>
      prev.size === data.rows.length
        ? new Set()
        : new Set(data.rows.map((r) => `${r.studentId}:${r.trancheId}`)),
    );
  }

  async function patchAutomation(patch: Partial<AutomationSettings>) {
    if (!automation) return;
    const next = { ...automation, ...patch };
    setAutomation(next);
    try {
      await api('/api/school/fees/automation-settings', { method: 'PATCH', body: patch });
    } catch (err) {
      setAutomation(automation);
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    }
  }

  async function sendWhatsappReminder(row: OverdueRow) {
    try {
      await api(`/api/school/fees/students/${row.studentId}/send-whatsapp`, { method: 'POST' });
      toast(tWhatsapp('sentSuccess'), 'success');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'NO_GUARDIAN_PHONE') {
          toast(tWhatsapp('errorNoGuardianPhone'), 'error');
          return;
        }
        if (err.code === 'NO_BALANCE_DUE') {
          toast(tWhatsapp('errorNoBalance'), 'error');
          return;
        }
        if (err.code === 'NOT_CONFIGURED') {
          toast(tWhatsapp('errorNotConfigured'), 'error');
          return;
        }
      }
      toast(tWhatsapp('errorSendFailed'), 'error');
    }
  }

  function menuItemsFor(row: OverdueRow) {
    return [
      {
        label: t('rowActions.registerPayment'),
        icon: <Wallet size={14} />,
        onClick: () => setRegisteringFor({ studentId: row.studentId, trancheId: row.trancheId }),
      },
      {
        label: t('rowActions.sendReminder'),
        icon: <Send size={14} />,
        onClick: () => void sendWhatsappReminder(row),
      },
      {
        label: t('rowActions.viewHistory'),
        icon: <Eye size={14} />,
        onClick: () => setHistoryFor(row.studentId),
        divider: true,
      },
      {
        label: t('rowActions.markDisputed'),
        icon: <Flag size={14} />,
        onClick: () => setDisputing({ studentId: row.studentId, trancheId: row.trancheId }),
      },
    ];
  }

  function onExportList() {
    if (!data) return;
    exportToCsv(
      'relances-impayes.csv',
      [
        t('columns.student'),
        t('columns.class'),
        t('columns.tranche'),
        t('columns.amountDue'),
        t('columns.overdue'),
        t('columns.status'),
        t('columns.lastReminder'),
      ],
      data.rows.map((r) => [
        `${r.firstName} ${r.lastName}`,
        r.className,
        r.trancheLabel,
        r.amountDue,
        r.daysOverdue,
        r.severity,
        r.lastReminderAt ? fmtDate(r.lastReminderAt, bcp47) : '—',
      ]),
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  return (
    <div className={`${LIST_PAGE} gap-5`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="w-fit" onClick={onExportList} disabled={!data}>
            <Download size={14} />
            {t('exportList')}
          </Button>
          <Button className="w-fit" onClick={() => toast(tStub('stub'), 'info')}>
            <Bell size={14} />
            {selected.size > 0
              ? t('bulkReminderWithCount', { n: selected.size })
              : t('bulkReminderBase')}
          </Button>
        </div>
      </div>

      <FeesTabs active="relances" />

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {!data && !error && (
        <div className="flex flex-col gap-3.5">
          <SkeletonStatCards />
          <SkeletonFilters />
          <Card className="overflow-hidden">
            <SkeletonTable rows={8} cols={6} />
          </Card>
        </div>
      )}

      {data && (
        <>
          <FeeKpiRow
            items={[
              {
                icon: <Wallet size={14} />,
                label: t('kpiTotalUnpaid'),
                value: fmtMoney(data.kpis.totalUnpaid, automation?.currency),
              },
              {
                icon: <CircleAlert size={14} />,
                label: t('kpiCritical'),
                value: String(data.kpis.criticalCount),
              },
              {
                icon: <Send size={14} />,
                label: t('kpiSent'),
                value: String(data.kpis.remindersSentThisMonth),
              },
              {
                icon: <Bell size={14} />,
                label: t('kpiNextDue'),
                value: data.kpis.nextDue ? fmtDate(data.kpis.nextDue.dueDate, bcp47) : '—',
                sub: data.kpis.nextDue?.trancheLabel,
              },
            ]}
          />

          <div className={ASIDE_GRID}>
            <div className="flex min-w-0 flex-col gap-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <SearchInput
                  value={search}
                  onChange={(e) => updateSearch(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="max-w-[300px]"
                />
                <FilterSelect value={classFilter} onValueChange={updateClassFilter}>
                  <SelectItem value="">{t('classFilterAll')}</SelectItem>
                  {data.classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </FilterSelect>
                {selected.size > 0 && (
                  <span className="text-sm font-semibold text-primary">
                    {t(selected.size > 1 ? 'selectedCount.other' : 'selectedCount.one', {
                      n: selected.size,
                    })}
                  </span>
                )}
              </div>

              {data.rows.length === 0 ? (
                <Card>
                  <p className="p-5 text-sm text-muted-foreground">{t('noResults')}</p>
                </Card>
              ) : (
                <Card>
                  <div className={cn('hidden md:block', TABLE_SCROLL)}>
                    <table className="w-full min-w-[920px] border-collapse text-sm">
                      <thead className={STICKY_THEAD}>
                        <tr className="border-b border-border">
                          <Th className="w-10">
                            <input
                              type="checkbox"
                              aria-label={t('selectAllAria')}
                              checked={selected.size === data.rows.length}
                              onChange={toggleAll}
                            />
                          </Th>
                          <Th>{t('columns.student')}</Th>
                          <Th>{t('columns.class')}</Th>
                          <Th>{t('columns.tranche')}</Th>
                          <Th>{t('columns.amountDue')}</Th>
                          <Th>{t('columns.overdue')}</Th>
                          <Th>{t('columns.status')}</Th>
                          <Th>{t('columns.lastReminder')}</Th>
                          <Th className="w-[70px]" />
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((r) => {
                          const key = `${r.studentId}:${r.trancheId}`;
                          return (
                            <tr key={key} className="border-b border-border last:border-none">
                              <td className="px-3.5 py-2.5">
                                <input
                                  type="checkbox"
                                  aria-label={t('selectRowAria', {
                                    name: `${r.firstName} ${r.lastName}`,
                                  })}
                                  checked={selected.has(key)}
                                  onChange={() => toggleRow(key)}
                                />
                              </td>
                              <td className="px-3.5 py-2.5">
                                <div className="flex items-center gap-2.5">
                                  <Avatar name={`${r.firstName} ${r.lastName}`} size={32} />
                                  <div>
                                    <div className="font-semibold text-foreground">
                                      {r.firstName} {r.lastName}
                                    </div>
                                    <div className="text-2xs text-muted-foreground">
                                      #{r.studentNumber}
                                      {r.disputed && ` · ${t('disputedSuffix')}`}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3.5 py-2.5 text-muted-foreground">{r.className}</td>
                              <td className="px-3.5 py-2.5 text-muted-foreground">
                                {r.trancheLabel}
                              </td>
                              <td className="px-3.5 py-2.5 font-semibold text-foreground">
                                {fmtMoney(r.amountDue, automation?.currency)}
                              </td>
                              <td className="px-3.5 py-2.5 text-muted-foreground">
                                {t(r.daysOverdue > 1 ? 'daysOverdue.other' : 'daysOverdue.one', {
                                  n: r.daysOverdue,
                                })}
                              </td>
                              <td className="px-3.5 py-2.5">
                                <SeverityBadge severity={r.severity} />
                              </td>
                              <td className="px-3.5 py-2.5 text-muted-foreground">
                                {r.lastReminderAt ? fmtDate(r.lastReminderAt, bcp47) : '—'}
                              </td>
                              <td className="px-3.5 py-2.5">
                                <ActionMenu items={menuItemsFor(r)} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* < md: cards */}
                  <div className="flex flex-col gap-2.5 p-3.5 md:hidden">
                    {data.rows.map((r) => {
                      const key = `${r.studentId}:${r.trancheId}`;
                      return (
                        <div key={key} className="rounded-md border border-border p-3">
                          <div className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              aria-label={t('selectRowAria', {
                                name: `${r.firstName} ${r.lastName}`,
                              })}
                              checked={selected.has(key)}
                              onChange={() => toggleRow(key)}
                              className="mt-1 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2.5">
                                  <Avatar name={`${r.firstName} ${r.lastName}`} size={32} />
                                  <div className="min-w-0">
                                    <div className="truncate font-semibold text-foreground">
                                      {r.firstName} {r.lastName}
                                    </div>
                                    <div className="truncate text-2xs text-muted-foreground">
                                      #{r.studentNumber} · {r.className}
                                      {r.disputed && ` · ${t('disputedSuffix')}`}
                                    </div>
                                  </div>
                                </div>
                                <div className="-mt-1 -mr-1 shrink-0">
                                  <ActionMenu items={menuItemsFor(r)} />
                                </div>
                              </div>
                              <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2.5">
                                <SeverityBadge severity={r.severity} />
                                <span className="text-caption font-bold text-foreground">
                                  {fmtMoney(r.amountDue, automation?.currency)}
                                </span>
                              </div>
                              <div className="mt-1.5 text-2xs text-muted-foreground">
                                {r.trancheLabel} ·{' '}
                                {t(r.daysOverdue > 1 ? 'daysOverdue.other' : 'daysOverdue.one', {
                                  n: r.daysOverdue,
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <Pager
                    centered
                    page={data.page}
                    pageSize={data.pageSize}
                    total={data.total}
                    onChange={setPage}
                  />
                </Card>
              )}
            </div>

            <div className="flex flex-col gap-5">
              <Card className="gap-3.5 p-4">
                <div>
                  <h2 className="text-sm font-bold text-foreground">{t('automationTitle')}</h2>
                  <p className="text-xs text-muted-foreground">{t('automationSubtitle')}</p>
                </div>
                {!automation ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <div className="flex flex-col gap-3">
                    <ToggleRow
                      label={t('reminderBefore5Days')}
                      desc={t('reminderBefore5DaysDesc')}
                      checked={automation.reminderBefore5Days}
                      onChange={(v) => patchAutomation({ reminderBefore5Days: v })}
                    />
                    <ToggleRow
                      label={t('reminderOnDueDate')}
                      desc={t('reminderOnDueDateDesc')}
                      checked={automation.reminderOnDueDate}
                      onChange={(v) => patchAutomation({ reminderOnDueDate: v })}
                    />
                    <ToggleRow
                      label={t('reminderWeekly')}
                      desc={t('reminderWeeklyDesc')}
                      checked={automation.reminderWeeklyOverdue}
                      onChange={(v) => patchAutomation({ reminderWeeklyOverdue: v })}
                    />
                    <ToggleRow
                      label={t('reminderCritical')}
                      desc={t('reminderCriticalDesc')}
                      checked={automation.reminderCriticalOverdue}
                      onChange={(v) => patchAutomation({ reminderCriticalOverdue: v })}
                    />
                    <div className="border-t border-border pt-3">
                      <ToggleRow
                        label={t('reminderChannelWhatsapp')}
                        desc={t('reminderChannelWhatsappDesc')}
                        checked={automation.whatsappRemindersEnabled}
                        onChange={(v) => patchAutomation({ whatsappRemindersEnabled: v })}
                      />
                    </div>
                  </div>
                )}
              </Card>

              <Card className="gap-3 p-4">
                <h2 className="text-sm font-bold text-foreground">{t('byClassTitle')}</h2>
                <div className="flex flex-col gap-2">
                  {data.breakdown.length === 0 ? (
                    <p className="text-xs text-muted-foreground">—</p>
                  ) : (
                    data.breakdown.map((b) => (
                      <div key={b.className} className="flex items-center justify-between text-sm">
                        <span className="text-foreground">{b.className}</span>
                        <span className="font-semibold text-muted-foreground">{b.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card className="gap-2 p-4">
                <h2 className="text-sm font-bold text-foreground">{t('quickActionsTitle')}</h2>
                <Button variant="outline" className="w-full" onClick={onExportList}>
                  <FileSpreadsheet size={14} />
                  {t('exportExcel')}
                </Button>
              </Card>
            </div>
          </div>
        </>
      )}

      {registeringFor && (
        <PaymentRegistrationModal
          studentId={registeringFor.studentId}
          preselectedTrancheId={registeringFor.trancheId}
          onClose={() => setRegisteringFor(null)}
          onSaved={load}
        />
      )}
      {historyFor && <FeeHistoryModal studentId={historyFor} onClose={() => setHistoryFor(null)} />}
      {disputing && (
        <DisputeModal
          studentId={disputing.studentId}
          feeTrancheId={disputing.trancheId}
          onClose={() => setDisputing(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase ${className}`}
    >
      {children}
    </th>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="text-2xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
```

Note `tStub`: `useTranslations('Fees')` (the namespace root, not a sub-section) so `tStub('stub')` reaches the top-level `Fees.stub` key from Task 1 — this is the one place in the module that reads a key outside its own screen's sub-namespace.

- [ ] **Step 6: Run the full gate**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all pass.

- [ ] **Step 7: Manual verification**

Open `/scolarite/relances` in all 3 locales. Verify: KPIs/table/automation panel/breakdown/quick-actions all translated; select 0, 1, and 2+ rows and confirm the bulk-reminder button and "N sélectionné(s)" label pluralize correctly; open the row menu's "Marquer comme litigieux" action, submit `DisputeModal`, and confirm the "· Litigieux" marker appears translated on the row afterward; trigger a days-overdue value of exactly 1 (if the seed data allows) and confirm "1 jour" not "1 jours".

- [ ] **Step 8: Commit**

```bash
git add frontend/src/messages/fr/fees.json frontend/src/messages/ht/fees.json frontend/src/messages/en/fees.json "frontend/src/app/(school)/scolarite/relances/page.tsx" "frontend/src/app/(school)/scolarite/relances/DisputeModal.tsx"
git commit -m "$(cat <<'EOF'
feat(i18n): Scolarité — translate relances/page.tsx + DisputeModal.tsx

Third task of the Scolarité i18n phase. Adds fees.overdue.* and
fees.disputeModal.*: overdue table, bulk-select + bulk reminder,
automation panel, class breakdown, dispute flow. WhatsApp toasts reuse
the Fees.whatsapp keys from Task 2 instead of re-duplicating them.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `configuration/page.tsx`

**Files:**
- Modify: `frontend/src/messages/{fr,ht,en}/fees.json` (add `configuration.*` — page-level subset; `TrancheFormModal`/`ClassFeePicker`/`ClassDropdownSelector`'s own remaining keys land in Task 5, appended to the same `configuration` object)
- Modify: `frontend/src/app/(school)/scolarite/configuration/page.tsx`

**Interfaces:**
- Consumes: `fmtMoney`/`fmtDateShort(d, locale)` (Task 1), `Common.errors.network` (existing).
- Produces: `Fees.configuration.editTranche`/`addTranche` — consumed by `TrancheFormModal.tsx` in Task 5 (that file's own modal title reuses these two keys rather than duplicating them, since `configuration/page.tsx` already needs them for its own edit-button aria-label and add-tranche buttons).
- Corrections found during this task's read-through, not caught by the design-spec survey: 4 dead keys in the source `FEES.configuration` object (`saveConfiguration`, `saveBarHelper`, `distributionLabel`, `configuredCount` — confirmed zero call sites by grep) are dropped, not ported. `configuration.autoRemindersToggleDesc`'s source text has a curly apostrophe (`l'échéance`) that becomes straight (`l'échéance`) in JSON. Three strings that were hardcoded inline (not part of `FEES.configuration` at all) get new keys: the "Supprimer la tranche" aria-label (the parallel "Modifier la tranche" button already had one via `t.editTranche`, this one didn't), the `` `${n} élèves` `` student-count badge (now correctly pluralized), and the `` `Configuration — ${name}` `` heading (now composed via interpolation instead of template-literal concatenation so word order can vary by locale).

- [ ] **Step 1: Append `configuration` to `frontend/src/messages/fr/fees.json`**

Add this key as a new top-level sibling of `disputeModal` (before the closing `}`):

```json
  "configuration": {
    "title": "Configuration des Frais d'Études",
    "subtitle": "Définissez les frais de scolarité et les tranches par classe pour l'année académique",
    "loadClassesError": "Impossible de charger les classes.",
    "loadStructureError": "Impossible de charger la configuration de cette classe.",
    "globalSettingsTitle": "Paramètres globaux",
    "latePenaltyToggle": "Pénalités de retard",
    "latePenaltyToggleDesc": "Appliquer des frais après la date limite",
    "autoRemindersToggle": "Rappels automatiques",
    "autoRemindersToggleDesc": "Notifications avant l'échéance",
    "currencyLabel": "Devise principale",
    "currencyOptions": {
      "HTG": "HTG — Gourde haïtienne",
      "USD": "USD — Dollar américain",
      "XOF": "XOF — Franc CFA (UEMOA)",
      "XAF": "XAF — Franc CFA (CEMAC)",
      "EUR": "EUR — Euro"
    },
    "selectClassPrompt": "Sélectionnez une classe.",
    "editorConfigured": "Configuré",
    "editorPending": "En attente",
    "editorSubtitle": "Définissez le montant total et les tranches pour cette classe",
    "copyFromClass": "Copier depuis une classe",
    "cancel": "Annuler",
    "save": "Enregistrer",
    "generalInfoTitle": "Informations générales",
    "totalAmountLabel": "Montant total annuel",
    "registrationFeeLabel": "Frais d'inscription",
    "academicYearLabel": "Année académique",
    "tranchesBuilderTitle": "Configurateur de Tranches",
    "tranchesBuilderSubtitle": {
      "one": "Total réparti : {total} sur {count} versement",
      "other": "Total réparti : {total} sur {count} versements"
    },
    "distributionPrefix": "Répartition :",
    "addTranche": "Ajouter une tranche",
    "editTranche": "Modifier la tranche",
    "deleteTrancheAria": "Supprimer la tranche",
    "emptyClassPrompt": "Aucune configuration — définissez le montant total pour commencer.",
    "configHeadingPrefix": "Configuration — {className}",
    "studentCountBadge": {
      "one": "{n} élève",
      "other": "{n} élèves"
    },
    "trancheDefaultLabel": {
      "one": "{n}ère Tranche",
      "other": "{n}ème Tranche"
    },
    "trancheFallbackLabel": "Tranche {n}",
    "trancheLatePenaltySummaryWithGrace": "{percent}% après {graceDays} j.",
    "trancheLatePenaltySummaryNoGrace": "{percent}%",
    "savedToast": "Configuration enregistrée.",
    "copiedToast": "Configuration copiée."
  }
```

- [ ] **Step 2: Append `configuration` to `frontend/src/messages/en/fees.json`**

```json
  "configuration": {
    "title": "Tuition Fee Configuration",
    "subtitle": "Set tuition fees and installments per class for the academic year",
    "loadClassesError": "Unable to load classes.",
    "loadStructureError": "Unable to load this class's configuration.",
    "globalSettingsTitle": "Global settings",
    "latePenaltyToggle": "Late penalties",
    "latePenaltyToggleDesc": "Apply a fee after the due date",
    "autoRemindersToggle": "Automatic reminders",
    "autoRemindersToggleDesc": "Notify before the due date",
    "currencyLabel": "Main currency",
    "currencyOptions": {
      "HTG": "HTG — Haitian Gourde",
      "USD": "USD — US Dollar",
      "XOF": "XOF — CFA Franc (UEMOA)",
      "XAF": "XAF — CFA Franc (CEMAC)",
      "EUR": "EUR — Euro"
    },
    "selectClassPrompt": "Select a class.",
    "editorConfigured": "Configured",
    "editorPending": "Pending",
    "editorSubtitle": "Set the total amount and installments for this class",
    "copyFromClass": "Copy from a class",
    "cancel": "Cancel",
    "save": "Save",
    "generalInfoTitle": "General information",
    "totalAmountLabel": "Total annual amount",
    "registrationFeeLabel": "Registration fee",
    "academicYearLabel": "Academic year",
    "tranchesBuilderTitle": "Installment Builder",
    "tranchesBuilderSubtitle": {
      "one": "Allocated: {total} across {count} installment",
      "other": "Allocated: {total} across {count} installments"
    },
    "distributionPrefix": "Allocated:",
    "addTranche": "Add an installment",
    "editTranche": "Edit installment",
    "deleteTrancheAria": "Delete installment",
    "emptyClassPrompt": "Not configured yet — set the total amount to get started.",
    "configHeadingPrefix": "Configuration — {className}",
    "studentCountBadge": {
      "one": "{n} student",
      "other": "{n} students"
    },
    "trancheDefaultLabel": {
      "one": "Installment {n}",
      "other": "Installment {n}"
    },
    "trancheFallbackLabel": "Installment {n}",
    "trancheLatePenaltySummaryWithGrace": "{percent}% after {graceDays}d",
    "trancheLatePenaltySummaryNoGrace": "{percent}%",
    "savedToast": "Configuration saved.",
    "copiedToast": "Configuration copied."
  }
```

- [ ] **Step 3: Append `configuration` to `frontend/src/messages/ht/fees.json`**

```json
  "configuration": {
    "title": "Konfigirasyon Frè Eskolarite",
    "subtitle": "Defini frè eskolarite ak vèsman pa klas pou ane akademik la",
    "loadClassesError": "Nou pa ka chaje klas yo.",
    "loadStructureError": "Nou pa ka chaje konfigirasyon klas sa a.",
    "globalSettingsTitle": "Paramèt jeneral",
    "latePenaltyToggle": "Penalite reta",
    "latePenaltyToggleDesc": "Aplike yon frè apre dat limit la",
    "autoRemindersToggle": "Rapèl otomatik",
    "autoRemindersToggleDesc": "Notifye anvan echeyans lan",
    "currencyLabel": "Lajan prensipal",
    "currencyOptions": {
      "HTG": "HTG — Goud ayisyen",
      "USD": "USD — Dola ameriken",
      "XOF": "XOF — Frank CFA (UEMOA)",
      "XAF": "XAF — Frank CFA (CEMAC)",
      "EUR": "EUR — Ewo"
    },
    "selectClassPrompt": "Chwazi yon klas.",
    "editorConfigured": "Konfigire",
    "editorPending": "Ann atann",
    "editorSubtitle": "Defini montan total ak vèsman yo pou klas sa a",
    "copyFromClass": "Kopye soti nan yon klas",
    "cancel": "Anile",
    "save": "Anrejistre",
    "generalInfoTitle": "Enfòmasyon jeneral",
    "totalAmountLabel": "Montan total anyèl",
    "registrationFeeLabel": "Frè enskripsyon",
    "academicYearLabel": "Ane akademik",
    "tranchesBuilderTitle": "Konfiguratè Vèsman",
    "tranchesBuilderSubtitle": {
      "one": "Total repati : {total} sou {count} vèsman",
      "other": "Total repati : {total} sou {count} vèsman"
    },
    "distributionPrefix": "Repatisyon :",
    "addTranche": "Ajoute yon vèsman",
    "editTranche": "Modifye vèsman an",
    "deleteTrancheAria": "Efase vèsman an",
    "emptyClassPrompt": "Poko konfigire — defini montan total la pou kòmanse.",
    "configHeadingPrefix": "Konfigirasyon — {className}",
    "studentCountBadge": {
      "one": "{n} elèv",
      "other": "{n} elèv"
    },
    "trancheDefaultLabel": {
      "one": "Vèsman {n}",
      "other": "Vèsman {n}"
    },
    "trancheFallbackLabel": "Vèsman {n}",
    "trancheLatePenaltySummaryWithGrace": "{percent}% apre {graceDays} j.",
    "trancheLatePenaltySummaryNoGrace": "{percent}%",
    "savedToast": "Konfigirasyon anrejistre.",
    "copiedToast": "Konfigirasyon kopye."
  }
```

- [ ] **Step 4: Rewrite `frontend/src/app/(school)/scolarite/configuration/page.tsx`**

Full replacement:

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Save, Split, Trash2 } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select, SelectItem } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Skeleton } from '@/components/ui/Skeleton';
import { ASIDE_GRID } from '@/lib/layout';
import { LOCALE_BCP47 } from '@/lib/locales';
import { cn } from '@/lib/utils';
import { fmtMoney, fmtDateShort } from '@/lib/fees-format';
import { FeesTabs } from '@/components/school/fees/FeesTabs';
import {
  ClassFeeSummaryCard,
  filterClasses,
  type ClassFilter,
  type FeeClassOption,
} from './ClassFeePicker';
import { ClassDropdownSelector } from './ClassDropdownSelector';
import { TrancheFormModal, type TrancheFormValues } from './TrancheFormModal';

// Fixed 3-tone purple palette Banani uses for the tranche distribution bar +
// per-tranche accent color — cycles for classes with more than 3 tranches.
const TRANCHE_PALETTE = ['#6c2bd9', '#a855f7', '#c4b5fd'];
const TRANCHE_PALETTE_TEXT = ['#6c2bd9', '#a855f7', '#7c3aed'];

const CURRENCY_CODES = ['HTG', 'USD', 'XOF', 'XAF', 'EUR'] as const;

interface StructureResponse {
  class: { id: string; name: string };
  feeStructure: {
    id: string;
    totalAmount: number;
    registrationFee: number;
    tranches: {
      id: string;
      order: number;
      label: string;
      amount: number;
      dueDate: string;
      latePenaltyPercent: number | null;
      latePenaltyGraceDays: number | null;
    }[];
  } | null;
}

interface DraftTranche {
  key: string;
  label: string;
  amount: string;
  dueDate: string;
  latePenaltyPercent: string;
  latePenaltyGraceDays: string;
}

interface AutomationSettings {
  lateFeeEnabled: boolean;
  autoRemindersEnabled: boolean;
  currency: string;
}

function toDraft(
  tranches: NonNullable<StructureResponse['feeStructure']>['tranches'],
): DraftTranche[] {
  return tranches.map((tr) => ({
    key: tr.id,
    label: tr.label,
    amount: String(tr.amount),
    dueDate: tr.dueDate.slice(0, 10),
    latePenaltyPercent: tr.latePenaltyPercent == null ? '' : String(tr.latePenaltyPercent),
    latePenaltyGraceDays: tr.latePenaltyGraceDays == null ? '' : String(tr.latePenaltyGraceDays),
  }));
}

export default function PaymentConfigurationPage() {
  const user = useUser();
  const { toast } = useToast();
  const t = useTranslations('Fees.configuration');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const [classes, setClasses] = useState<FeeClassOption[] | null>(null);
  const [filter, setFilter] = useState<ClassFilter>('all');
  const [academicYearLabel, setAcademicYearLabel] = useState<string | null>(null);
  const [automation, setAutomation] = useState<AutomationSettings | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [structure, setStructure] = useState<StructureResponse | null>(null);
  const [totalAmount, setTotalAmount] = useState('0');
  const [registrationFee, setRegistrationFee] = useState('0');
  const [tranches, setTranches] = useState<DraftTranche[]>([]);
  const [copyPickerOpen, setCopyPickerOpen] = useState(false);
  const [copySourceId, setCopySourceId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [trancheModalOpen, setTrancheModalOpen] = useState(false);
  const [editingTrancheIndex, setEditingTrancheIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    api<{ classes: FeeClassOption[]; academicYearLabel: string | null }>(
      '/api/school/fees/structures',
    )
      .then((res) => {
        setClasses(res.classes);
        setAcademicYearLabel(res.academicYearLabel);
        if (res.classes[0]) setSelectedId(res.classes[0].id);
      })
      .catch(() => setError(t('loadClassesError')));
    api<{ settings: AutomationSettings }>('/api/school/fees/automation-settings')
      .then((res) => setAutomation(res.settings))
      .catch(() => {});
  }, [user, t]);

  const loadStructure = useCallback(
    (classId: string) => {
      setStructure(null);
      api<StructureResponse>(`/api/school/fees/structures/${classId}`)
        .then((res) => {
          setStructure(res);
          setTotalAmount(String(res.feeStructure?.totalAmount ?? 0));
          setRegistrationFee(String(res.feeStructure?.registrationFee ?? 0));
          setTranches(res.feeStructure ? toDraft(res.feeStructure.tranches) : []);
        })
        .catch(() => toast(t('loadStructureError'), 'error'));
    },
    [toast, t],
  );

  useEffect(() => {
    if (selectedId) loadStructure(selectedId);
  }, [selectedId, loadStructure]);

  const totalAmountNum = Number(totalAmount) || 0;
  const allocated = tranches.reduce((sum, tr) => sum + (Number(tr.amount) || 0), 0);
  const distributionPercent =
    totalAmountNum > 0 ? Math.round((allocated / totalAmountNum) * 100) : 0;

  function trancheAmountPercent(tr: DraftTranche): number {
    return totalAmountNum > 0 ? Math.round(((Number(tr.amount) || 0) / totalAmountNum) * 100) : 0;
  }

  function updateTranche(index: number, patch: Partial<DraftTranche>) {
    setTranches((prev) => prev.map((tr, i) => (i === index ? { ...tr, ...patch } : tr)));
  }
  function removeTranche(index: number) {
    setTranches((prev) => prev.filter((_, i) => i !== index));
  }

  function openAddTrancheModal() {
    setEditingTrancheIndex(null);
    setTrancheModalOpen(true);
  }
  function openEditTrancheModal(index: number) {
    setEditingTrancheIndex(index);
    setTrancheModalOpen(true);
  }
  function handleTrancheModalSave(values: TrancheFormValues) {
    if (editingTrancheIndex !== null) {
      updateTranche(editingTrancheIndex, values);
    } else {
      setTranches((prev) => [...prev, { key: `new-${Date.now()}`, ...values }]);
    }
  }

  async function patchAutomation(patch: Partial<AutomationSettings>) {
    if (!automation) return;
    const next = { ...automation, ...patch };
    setAutomation(next);
    try {
      await api('/api/school/fees/automation-settings', { method: 'PATCH', body: patch });
    } catch (err) {
      setAutomation(automation);
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    }
  }

  function refreshClassesList() {
    api<{ classes: FeeClassOption[]; academicYearLabel: string | null }>(
      '/api/school/fees/structures',
    )
      .then((res) => {
        setClasses(res.classes);
        setAcademicYearLabel(res.academicYearLabel);
      })
      .catch(() => {});
  }

  async function onSave() {
    if (!selectedId) return;
    if (tranches.length === 0) {
      toast(t('emptyClassPrompt'), 'error');
      return;
    }
    setSaving(true);
    try {
      await api(`/api/school/fees/structures/${selectedId}`, {
        method: 'PUT',
        body: {
          totalAmount: totalAmountNum,
          registrationFee: Number(registrationFee) || 0,
          tranches: tranches.map((tr, i) => ({
            order: i + 1,
            label: tr.label,
            amount: Number(tr.amount) || 0,
            dueDate: tr.dueDate,
            latePenaltyPercent: tr.latePenaltyPercent === '' ? null : Number(tr.latePenaltyPercent),
            latePenaltyGraceDays:
              tr.latePenaltyGraceDays === '' ? null : Number(tr.latePenaltyGraceDays),
          })),
        },
      });
      toast(t('savedToast'), 'success');
      loadStructure(selectedId);
      refreshClassesList();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    } finally {
      setSaving(false);
    }
  }

  function onCancel() {
    if (!structure) return;
    setTotalAmount(String(structure.feeStructure?.totalAmount ?? 0));
    setRegistrationFee(String(structure.feeStructure?.registrationFee ?? 0));
    setTranches(structure.feeStructure ? toDraft(structure.feeStructure.tranches) : []);
  }

  async function onCopyFrom() {
    if (!selectedId || !copySourceId) return;
    setCopying(true);
    try {
      await api(`/api/school/fees/structures/${selectedId}/copy-from`, {
        method: 'POST',
        body: { sourceClassId: copySourceId },
      });
      toast(t('copiedToast'), 'success');
      setCopySourceId('');
      setCopyPickerOpen(false);
      loadStructure(selectedId);
      refreshClassesList();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    } finally {
      setCopying(false);
    }
  }

  const filteredClasses = useMemo(() => filterClasses(classes ?? [], filter), [classes, filter]);
  const copySources = useMemo(
    () => (classes ?? []).filter((c) => c.configured && c.id !== selectedId),
    [classes, selectedId],
  );

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  const selectedStudentCount = classes?.find((c) => c.id === selectedId)?.studentCount ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('subtitle')}</p>
      </div>

      <FeesTabs active="configuration" />

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {classes === null && !error ? (
        <div className={ASIDE_GRID}>
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <div className={cn(ASIDE_GRID, 'items-start')}>
          {/* Panneau classes + paramètres globaux — à droite sur desktop (même
              largeur que la colonne droite de la fiche matière), en premier
              sur mobile pour choisir la classe avant l'éditeur. */}
          <div className="flex min-w-0 flex-col gap-4 lg:order-2">
            <ClassFeeSummaryCard
              classes={classes ?? []}
              filter={filter}
              onFilterChange={setFilter}
            />

            <ClassDropdownSelector
              classes={filteredClasses}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />

            <Card className="gap-3.5 p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                {t('globalSettingsTitle')}
              </h2>
              {!automation ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {t('latePenaltyToggle')}
                      </div>
                      <div className="text-2xs text-muted-foreground">
                        {t('latePenaltyToggleDesc')}
                      </div>
                    </div>
                    <Switch
                      checked={automation.lateFeeEnabled}
                      onChange={(v) => patchAutomation({ lateFeeEnabled: v })}
                      label={t('latePenaltyToggle')}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {t('autoRemindersToggle')}
                      </div>
                      <div className="text-2xs text-muted-foreground">
                        {t('autoRemindersToggleDesc')}
                      </div>
                    </div>
                    <Switch
                      checked={automation.autoRemindersEnabled}
                      onChange={(v) => patchAutomation({ autoRemindersEnabled: v })}
                      label={t('autoRemindersToggle')}
                    />
                  </div>
                  <div className="border-t border-border pt-3">
                    <Select
                      label={t('currencyLabel')}
                      value={automation.currency}
                      onValueChange={(v) => patchAutomation({ currency: v })}
                    >
                      {CURRENCY_CODES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {t(`currencyOptions.${code}`)}
                        </SelectItem>
                      ))}
                    </Select>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Éditeur de la classe sélectionnée */}
          <div className="flex min-w-0 flex-col gap-4 lg:order-1">
            {!selectedId ? (
              <Card className="p-5">
                <p className="text-sm text-muted-foreground">{t('selectClassPrompt')}</p>
              </Card>
            ) : structure === null ? (
              <Skeleton className="h-80 w-full" />
            ) : (
              <>
                {/* En-tête en carte, comme la fiche matière : titre + statut à
                    gauche, actions à droite (passent à la ligne, alignées à
                    droite, quand la colonne est étroite). */}
                <Card className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[17px] font-bold tracking-tight text-foreground">
                        {t('configHeadingPrefix', { className: structure.class.name })}
                      </h2>
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-primary">
                        {t(
                          selectedStudentCount > 1
                            ? 'studentCountBadge.other'
                            : 'studentCountBadge.one',
                          { n: selectedStudentCount },
                        )}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap ${
                          structure.feeStructure
                            ? 'bg-success text-success-foreground'
                            : 'bg-warning text-warning-foreground'
                        }`}
                      >
                        {structure.feeStructure ? t('editorConfigured') : t('editorPending')}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t('editorSubtitle')}</p>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    {copySources.length > 0 && (
                      <Button
                        variant="outline"
                        className="w-fit"
                        onClick={() => setCopyPickerOpen((v) => !v)}
                      >
                        <Copy size={13} />
                        {t('copyFromClass')}
                      </Button>
                    )}
                    <Button variant="ghost" className="w-fit" onClick={onCancel}>
                      {t('cancel')}
                    </Button>
                    <Button className="w-fit" loading={saving} onClick={onSave}>
                      <Save size={13} />
                      {t('save')}
                    </Button>
                  </div>
                </Card>

                {copyPickerOpen && copySources.length > 0 && (
                  <Card className="flex-row flex-wrap items-end gap-2 p-3.5">
                    <div className="min-w-[220px] flex-1">
                      <Select
                        label={t('copyFromClass')}
                        value={copySourceId}
                        onValueChange={setCopySourceId}
                      >
                        <SelectItem value="">—</SelectItem>
                        {copySources.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </Select>
                    </div>
                    <Button
                      variant="outline"
                      className="w-fit"
                      disabled={!copySourceId || copying}
                      loading={copying}
                      onClick={onCopyFrom}
                    >
                      <Copy size={13} />
                      {t('copyFromClass')}
                    </Button>
                  </Card>
                )}

                <Card className="gap-3.5 p-4">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                    <Pencil size={13} className="text-primary" />
                    {t('generalInfoTitle')}
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field
                      label={t('totalAmountLabel')}
                      type="number"
                      min={0}
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value)}
                    />
                    <Field
                      label={t('registrationFeeLabel')}
                      type="number"
                      min={0}
                      value={registrationFee}
                      onChange={(e) => setRegistrationFee(e.target.value)}
                    />
                    <Field
                      label={t('academicYearLabel')}
                      value={academicYearLabel ?? '—'}
                      disabled
                      readOnly
                    />
                  </div>
                </Card>

                <Card className="gap-3.5 p-4">
                  {tranches.length === 0 ? (
                    <div className="flex flex-col items-start gap-3">
                      <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                        <Split size={13} className="text-primary" />
                        {t('tranchesBuilderTitle')}
                      </h3>
                      <div className="flex w-full flex-col items-start gap-3 rounded-md border border-dashed border-border p-4">
                        <p className="text-sm text-muted-foreground">{t('emptyClassPrompt')}</p>
                        <Button variant="outline" className="w-fit" onClick={openAddTrancheModal}>
                          <Plus size={14} />
                          {t('addTranche')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                            <Split size={13} className="text-primary" />
                            {t('tranchesBuilderTitle')}
                          </h3>
                          <p className="mt-0.5 text-2xs text-muted-foreground">
                            {t(
                              tranches.length > 1
                                ? 'tranchesBuilderSubtitle.other'
                                : 'tranchesBuilderSubtitle.one',
                              {
                                total: fmtMoney(allocated, automation?.currency),
                                count: tranches.length,
                              },
                            )}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {t('distributionPrefix')}{' '}
                          <span className="font-bold text-success-foreground">
                            {distributionPercent}%
                          </span>
                        </span>
                      </div>

                      <div>
                        <div className="flex h-[7px] w-full gap-0.5 overflow-hidden rounded-full">
                          {tranches.map((tr, i) => (
                            <div
                              key={tr.key}
                              style={{
                                flex: Math.max(trancheAmountPercent(tr), 1),
                                background: TRANCHE_PALETTE[i % TRANCHE_PALETTE.length],
                              }}
                              className="h-full first:rounded-l-full last:rounded-r-full"
                            />
                          ))}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3">
                          {tranches.map((tr, i) => (
                            <div
                              key={tr.key}
                              className="flex items-center gap-1 text-2xs text-muted-foreground"
                            >
                              <span
                                className="h-[9px] w-[9px] shrink-0 rounded-sm"
                                style={{ background: TRANCHE_PALETTE[i % TRANCHE_PALETTE.length] }}
                              />
                              {tr.label || t('trancheFallbackLabel', { n: i + 1 })} ·{' '}
                              {trancheAmountPercent(tr)}%
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2.5">
                        {tranches.map((tr, i) => {
                          const color = TRANCHE_PALETTE[i % TRANCHE_PALETTE.length];
                          const textColor = TRANCHE_PALETTE_TEXT[i % TRANCHE_PALETTE_TEXT.length];
                          const hasPenalty =
                            automation?.lateFeeEnabled && tr.latePenaltyPercent !== '';
                          return (
                            <div
                              key={tr.key}
                              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3.5 py-2.5"
                            >
                              <div className="flex min-w-0 items-center gap-2.5">
                                <span
                                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-2xs font-bold text-white"
                                  style={{ background: color }}
                                >
                                  {i + 1}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-x-1.5">
                                    <span className="truncate text-sm font-bold text-foreground">
                                      {tr.label || t('trancheFallbackLabel', { n: i + 1 })}
                                    </span>
                                    {hasPenalty && (
                                      <span className="text-2xs whitespace-nowrap text-muted-foreground">
                                        ·{' '}
                                        {tr.latePenaltyGraceDays === ''
                                          ? t('trancheLatePenaltySummaryNoGrace', {
                                              percent: Number(tr.latePenaltyPercent),
                                            })
                                          : t('trancheLatePenaltySummaryWithGrace', {
                                              percent: Number(tr.latePenaltyPercent),
                                              graceDays: Number(tr.latePenaltyGraceDays),
                                            })}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-2xs text-muted-foreground">
                                    {fmtDateShort(tr.dueDate, bcp47)}
                                  </div>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <span className="text-sm font-bold" style={{ color: textColor }}>
                                  {fmtMoney(Number(tr.amount) || 0, automation?.currency)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {trancheAmountPercent(tr)}%
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openEditTrancheModal(i)}
                                  aria-label={t('editTranche')}
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeTranche(i)}
                                  aria-label={t('deleteTrancheAria')}
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-destructive-foreground hover:bg-muted"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        <Button variant="outline" className="w-fit" onClick={openAddTrancheModal}>
                          <Plus size={14} />
                          {t('addTranche')}
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {trancheModalOpen && (
        <TrancheFormModal
          tranche={editingTrancheIndex !== null ? (tranches[editingTrancheIndex] ?? null) : null}
          defaultLabel={t(
            tranches.length + 1 > 1 ? 'trancheDefaultLabel.other' : 'trancheDefaultLabel.one',
            { n: tranches.length + 1 },
          )}
          lateFeeEnabled={automation?.lateFeeEnabled ?? true}
          totalAmount={totalAmountNum}
          onClose={() => setTrancheModalOpen(false)}
          onSave={handleTrancheModalSave}
        />
      )}
    </div>
  );
}
```

`savedToast`/`copiedToast` land under `Fees.configuration` (Steps 1-3 above), not `Common` — these are specific to this screen's save/copy actions, matching this module's established "each screen owns its own copy" convention (the same reasoning that keeps `searchPlaceholder` duplicated verbatim between `overview` and `overdue` rather than hoisted to a shared key). `Common` only gained a new consumer in this task (`Common.errors.network`, already existing), not a new key.

- [ ] **Step 5: Run the full gate**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all pass.

- [ ] **Step 6: Manual verification**

Open `/scolarite/configuration` in all 3 locales. Verify: class list panel, global settings (including the currency dropdown — check all 5 currency labels), and the tranche editor all render translated. Add a class with exactly 1 tranche and confirm "Total réparti : … sur 1 versement" (singular) not "…1 versements". Edit a tranche's label to blank and save — confirm the fallback shows "Tranche 1" (not "1ère Tranche 1" or similar), while opening the "Ajouter une tranche" modal for a *new* tranche shows the ordinal form ("2ème Tranche", etc.) pre-filled in the label field. Confirm the delete (trash) button now has a real translated aria-label via a screen reader or the browser's accessibility inspector.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/messages/fr/fees.json frontend/src/messages/ht/fees.json frontend/src/messages/en/fees.json "frontend/src/app/(school)/scolarite/configuration/page.tsx"
git commit -m "$(cat <<'EOF'
feat(i18n): Scolarité — translate configuration/page.tsx

Fourth task of the Scolarité i18n phase. Adds fees.configuration.*
(page-level). Drops 4 dead keys found in the source FEES.configuration
object (zero call sites). Fixes 3
previously-untranslated inline strings (delete-tranche aria-label,
student-count badge, config heading) and makes the tranche-count
subtitle correctly pluralize at n=1.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `TrancheFormModal.tsx` + `ClassFeePicker.tsx` + `ClassDropdownSelector.tsx`

**Files:**
- Modify: `frontend/src/messages/{fr,ht,en}/fees.json` (append remaining keys to the `configuration` object opened in Task 4 — the object stays open across the two tasks, closed only once here)
- Modify: `frontend/src/app/(school)/scolarite/configuration/TrancheFormModal.tsx`
- Modify: `frontend/src/app/(school)/scolarite/configuration/ClassFeePicker.tsx`
- Modify: `frontend/src/app/(school)/scolarite/configuration/ClassDropdownSelector.tsx`

**Interfaces:**
- Consumes: `Fees.configuration.editTranche`/`addTranche`/`editorConfigured`/`editorPending`/`studentCountBadge.{one,other}` (Task 4).
- Produces: `Fees.configuration.trancheCountBadge.{one,other}` — new, used only by `ClassDropdownSelector.tsx` in this task.
- Corrections found during this task's read-through: `FEES.configuration.classListTitle`'s source text has a curly apostrophe (`l'école`) that becomes straight (`l'école`) in JSON. `ClassDropdownSelector.tsx`'s per-row subtitle (`` `${c.studentCount} élèves · ${c.trancheCount} tranches` ``) hardcoded both plural forms and never handled `n === 1` for either number — now correctly pluralizes both independently via two composed fragments (`studentCountBadge` + the new `trancheCountBadge`).

- [ ] **Step 1: Append the remaining `configuration` keys to `frontend/src/messages/fr/fees.json`**

Insert these as new siblings inside the existing `configuration` object from Task 4, right after `"copiedToast": "Configuration copiée."` (add a comma after that line, then these keys, before the object's closing `}`):

```json
    "classListTitle": "Classes de l'école",
    "classListSubtitle": "Sélectionnez une classe à configurer",
    "filterAll": "Toutes",
    "filterConfigured": "Configurées",
    "filterPending": "En attente",
    "classSearchPlaceholder": "Filtrer les classes...",
    "noClassFound": "Aucune classe trouvée.",
    "trancheCountBadge": {
      "one": "{n} tranche",
      "other": "{n} tranches"
    },
    "trancheLabelField": "Libellé",
    "trancheDueDateField": "Date limite",
    "trancheAmountField": "Montant / Pourcentage",
    "trancheLatePenaltyField": "Pénalité de retard (optionnel)",
    "trancheGraceDaysField": "Délai de grâce (jours)",
    "noLatePenalty": "Aucune pénalité",
    "saveTranche": "Enregistrer"
```

- [ ] **Step 2: Append the remaining `configuration` keys to `frontend/src/messages/en/fees.json`**

Same insertion point (after `"copiedToast": "Configuration copied."`):

```json
    "classListTitle": "School classes",
    "classListSubtitle": "Select a class to configure",
    "filterAll": "All",
    "filterConfigured": "Configured",
    "filterPending": "Pending",
    "classSearchPlaceholder": "Filter classes...",
    "noClassFound": "No class found.",
    "trancheCountBadge": {
      "one": "{n} installment",
      "other": "{n} installments"
    },
    "trancheLabelField": "Label",
    "trancheDueDateField": "Due date",
    "trancheAmountField": "Amount / Percentage",
    "trancheLatePenaltyField": "Late penalty (optional)",
    "trancheGraceDaysField": "Grace period (days)",
    "noLatePenalty": "No penalty",
    "saveTranche": "Save"
```

- [ ] **Step 3: Append the remaining `configuration` keys to `frontend/src/messages/ht/fees.json`**

Same insertion point (after `"copiedToast": "Konfigirasyon kopye."`):

```json
    "classListTitle": "Klas lekòl la",
    "classListSubtitle": "Chwazi yon klas pou konfigire",
    "filterAll": "Tout",
    "filterConfigured": "Konfigire",
    "filterPending": "Ann atann",
    "classSearchPlaceholder": "Filtre klas yo...",
    "noClassFound": "Pa gen klas ki jwenn.",
    "trancheCountBadge": {
      "one": "{n} vèsman",
      "other": "{n} vèsman"
    },
    "trancheLabelField": "Etikèt",
    "trancheDueDateField": "Dat limit",
    "trancheAmountField": "Montan / Pousantaj",
    "trancheLatePenaltyField": "Penalite reta (opsyonèl)",
    "trancheGraceDaysField": "Delè gras (jou)",
    "noLatePenalty": "Pa gen penalite",
    "saveTranche": "Anrejistre"
```

- [ ] **Step 4: Rewrite `frontend/src/app/(school)/scolarite/configuration/TrancheFormModal.tsx`**

Full replacement:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Field } from '@/components/ui/Field';
import { DateField } from '@/components/ui/DateField';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

export interface TrancheFormValues {
  label: string;
  amount: string;
  dueDate: string;
  latePenaltyPercent: string;
  latePenaltyGraceDays: string;
}

export function TrancheFormModal({
  tranche,
  defaultLabel,
  lateFeeEnabled,
  totalAmount,
  onClose,
  onSave,
}: {
  tranche: TrancheFormValues | null;
  defaultLabel: string;
  lateFeeEnabled: boolean;
  totalAmount: number;
  onClose: () => void;
  onSave: (values: TrancheFormValues) => void;
}) {
  const t = useTranslations('Fees.configuration');
  const [label, setLabel] = useState(tranche?.label ?? defaultLabel);
  const [amount, setAmount] = useState(tranche?.amount ?? '0');
  const [dueDate, setDueDate] = useState(tranche?.dueDate ?? new Date().toISOString().slice(0, 10));
  const [latePenaltyPercent, setLatePenaltyPercent] = useState(tranche?.latePenaltyPercent ?? '');
  const [latePenaltyGraceDays, setLatePenaltyGraceDays] = useState(
    tranche?.latePenaltyGraceDays ?? '',
  );

  const pct = totalAmount > 0 ? Math.round(((Number(amount) || 0) / totalAmount) * 100) : 0;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // When late fees are globally disabled, the penalty fields are hidden
    // (not editable) below — their state stays at its initial value, so this
    // never overwrites already-saved penalty data on an unrelated edit.
    onSave({ label, amount, dueDate, latePenaltyPercent, latePenaltyGraceDays });
    onClose();
  }

  return (
    <Modal title={tranche ? t('editTranche') : t('addTranche')} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <Field
          label={t('trancheLabelField')}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3.5">
          <DateField
            label={t('trancheDueDateField')}
            required
            value={dueDate}
            onChange={setDueDate}
          />
          <Field
            label={t('trancheAmountField')}
            type="number"
            min={0}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            trailing={
              <span className="shrink-0 text-xs font-semibold text-muted-foreground">{pct}%</span>
            }
          />
        </div>
        {lateFeeEnabled && (
          <div className="grid grid-cols-2 gap-3.5">
            <Field
              label={t('trancheLatePenaltyField')}
              type="number"
              min={0}
              max={100}
              placeholder={t('noLatePenalty')}
              value={latePenaltyPercent}
              onChange={(e) => setLatePenaltyPercent(e.target.value)}
            />
            <Field
              label={t('trancheGraceDaysField')}
              type="number"
              min={0}
              max={90}
              disabled={latePenaltyPercent === ''}
              value={latePenaltyGraceDays}
              onChange={(e) => setLatePenaltyGraceDays(e.target.value)}
            />
          </div>
        )}
        <Button type="submit">{t('saveTranche')}</Button>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 5: Rewrite `frontend/src/app/(school)/scolarite/configuration/ClassFeePicker.tsx`**

Full replacement:

```tsx
'use client';

import { School } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';

export interface FeeClassOption {
  id: string;
  name: string;
  level: string;
  studentCount: number;
  configured: boolean;
  trancheCount: number;
}

export type ClassFilter = 'all' | 'configured' | 'pending';

// Progress summary card — Banani's "Classes de l'école" card: header with a
// live N/total configured count, a fill bar, and 3 filter pills. Each pill
// keeps its own semantic tint (not just active/inactive) per the Banani
// source — "Configurées"/"En attente" are always green/amber, "Toutes" is
// the neutral default; the currently active pill gets the bold/solid
// treatment.
export function ClassFeeSummaryCard({
  classes,
  filter,
  onFilterChange,
}: {
  classes: FeeClassOption[];
  filter: ClassFilter;
  onFilterChange: (filter: ClassFilter) => void;
}) {
  const t = useTranslations('Fees.configuration');
  const configuredCount = classes.filter((c) => c.configured).length;
  const pct = classes.length > 0 ? Math.round((configuredCount / classes.length) * 100) : 0;

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 border-b border-border p-3.5">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-bold text-foreground">
            <School size={13} className="text-primary" />
            {t('classListTitle')}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('classListSubtitle')}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-[10px] font-medium text-muted-foreground">
            {t('filterConfigured')}
          </span>
          <span className="text-[17px] font-bold text-primary">
            {configuredCount}
            <span className="text-xs font-medium text-muted-foreground"> / {classes.length}</span>
          </span>
        </div>
      </div>

      <div className="px-3.5 pt-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex gap-1.5 p-2.5">
        <FilterPill
          active={filter === 'all'}
          activeClass="bg-primary text-primary-foreground"
          onClick={() => onFilterChange('all')}
        >
          {t('filterAll')}
        </FilterPill>
        <FilterPill
          active={filter === 'configured'}
          activeClass="bg-success text-success-foreground ring-2 ring-success-foreground/30"
          baseClass="bg-success text-success-foreground"
          onClick={() => onFilterChange('configured')}
        >
          {t('filterConfigured')}
        </FilterPill>
        <FilterPill
          active={filter === 'pending'}
          activeClass="bg-warning text-warning-foreground ring-2 ring-warning-foreground/30"
          baseClass="bg-warning text-warning-foreground"
          onClick={() => onFilterChange('pending')}
        >
          {t('filterPending')}
        </FilterPill>
      </div>
    </Card>
  );
}

function FilterPill({
  active,
  activeClass,
  baseClass = 'bg-muted text-muted-foreground',
  onClick,
  children,
}: {
  active: boolean;
  activeClass: string;
  baseClass?: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-2xs font-semibold whitespace-nowrap ${active ? activeClass : baseClass}`}
    >
      {children}
    </button>
  );
}

export function filterClasses(classes: FeeClassOption[], filter: ClassFilter): FeeClassOption[] {
  return classes.filter((c) => {
    if (filter === 'configured') return c.configured;
    if (filter === 'pending') return !c.configured;
    return true;
  });
}
```

- [ ] **Step 6: Rewrite `frontend/src/app/(school)/scolarite/configuration/ClassDropdownSelector.tsx`**

Full replacement:

```tsx
'use client';

import { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { ChevronDown, ChevronUp, Search, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FeeClassOption } from './ClassFeePicker';

// Replaces an always-visible class list with a searchable dropdown, matching
// Banani's collapsed-trigger + popover-search pattern (same Popover+cmdk
// combo already used by ActionMenu's searchable variant). Grouped by
// `Class.level` ("3ème", "4ème", …) — the real field closest to Banani's
// mock groupings ("Secondaire"/"Fondamental"/"Primaire"), which map to a
// school-cycle concept this app's Class model doesn't have; level is real
// data, not fabricated.
export function ClassDropdownSelector({
  classes,
  selectedId,
  onSelect,
}: {
  classes: FeeClassOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations('Fees.configuration');
  const [open, setOpen] = useState(false);
  const selected = classes.find((c) => c.id === selectedId) ?? null;

  const groups = useMemo(() => {
    const byLevel = new Map<string, FeeClassOption[]>();
    for (const c of classes) {
      const list = byLevel.get(c.level) ?? [];
      list.push(c);
      byLevel.set(c.level, list);
    }
    return Array.from(byLevel.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [classes]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 rounded-md border border-primary bg-card px-3 py-2 text-sm font-semibold text-primary"
        >
          <span className="flex items-center gap-2 truncate">
            <Users size={13} className="shrink-0" />
            <span className="truncate">{selected?.name ?? '—'}</span>
          </span>
          {open ? (
            <ChevronUp size={13} className="shrink-0" />
          ) : (
            <ChevronDown size={13} className="shrink-0" />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          <Command shouldFilter className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2">
              <Search size={12} className="shrink-0 text-muted-foreground" />
              <Command.Input
                autoFocus
                placeholder={t('classSearchPlaceholder')}
                className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-[320px] overflow-y-auto p-1">
              <Command.Empty className="px-2.5 py-4 text-center text-xs text-muted-foreground">
                {t('noClassFound')}
              </Command.Empty>
              {groups.map(([level, items]) => (
                <Command.Group
                  key={level}
                  heading={level}
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase"
                >
                  {items.map((c) => {
                    const studentLabel = t(
                      c.studentCount > 1 ? 'studentCountBadge.other' : 'studentCountBadge.one',
                      { n: c.studentCount },
                    );
                    const trancheLabel = t(
                      c.trancheCount > 1 ? 'trancheCountBadge.other' : 'trancheCountBadge.one',
                      { n: c.trancheCount },
                    );
                    return (
                      <Command.Item
                        key={c.id}
                        value={`${c.name} ${level}`}
                        onSelect={() => {
                          onSelect(c.id);
                          setOpen(false);
                        }}
                        className={`flex cursor-pointer items-center gap-2 rounded-md border-l-2 p-1.5 outline-none data-[selected=true]:bg-secondary ${
                          c.id === selectedId
                            ? 'border-l-primary bg-[#faf9ff]'
                            : 'border-l-transparent'
                        }`}
                      >
                        <span
                          className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md ${
                            c.id === selectedId
                              ? 'bg-secondary'
                              : c.configured
                                ? 'bg-success'
                                : 'bg-muted'
                          }`}
                        >
                          <Users
                            size={12}
                            className={
                              c.id === selectedId
                                ? 'text-primary'
                                : c.configured
                                  ? 'text-success-foreground'
                                  : 'text-muted-foreground'
                            }
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground">
                            {c.name}
                          </span>
                          <span className="block truncate text-2xs text-muted-foreground">
                            {c.configured ? `${studentLabel} · ${trancheLabel}` : studentLabel}
                          </span>
                        </span>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap ${
                            c.configured
                              ? 'bg-success text-success-foreground'
                              : 'bg-warning text-warning-foreground'
                          }`}
                        >
                          {c.configured ? t('editorConfigured') : t('editorPending')}
                        </span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

- [ ] **Step 7: Run the full gate**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all pass.

- [ ] **Step 8: Manual verification**

Open `/scolarite/configuration` in all 3 locales. Open the class dropdown selector — confirm the search placeholder, empty state, and per-row subtitle all render translated, and that a class with exactly 1 tranche shows "1 tranche" (not "1 tranches") while a class with exactly 1 student shows "1 élève" (not "1 élèves"). Open the tranche add/edit modal — confirm every field label, the late-penalty placeholder, and the save button are translated, and that editing an existing tranche shows "Modifier la tranche" as the modal title while adding a new one shows "Ajouter une tranche".

- [ ] **Step 9: Commit**

```bash
git add frontend/src/messages/fr/fees.json frontend/src/messages/ht/fees.json frontend/src/messages/en/fees.json "frontend/src/app/(school)/scolarite/configuration/TrancheFormModal.tsx" "frontend/src/app/(school)/scolarite/configuration/ClassFeePicker.tsx" "frontend/src/app/(school)/scolarite/configuration/ClassDropdownSelector.tsx"
git commit -m "$(cat <<'EOF'
feat(i18n): Scolarité — translate tranche modal + class picker/dropdown

Fifth task of the Scolarité i18n phase. Closes out fees.configuration.*
with the remaining field-level and picker/dropdown keys. Adds
trancheCountBadge to fix a pluralization bug in the class dropdown's
per-row subtitle (previously always plural regardless of count).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `PaymentRegistrationModal.tsx` + `FeeHistoryModal.tsx`

**Files:**
- Modify: `frontend/src/messages/{fr,ht,en}/fees.json` (add two new top-level siblings of `configuration`: `registerPayment` — ported from `FEES.registerPayment` — and brand-new `history`, which has no `FEES` precedent since `FeeHistoryModal.tsx` was 100% hardcoded French)
- Modify: `frontend/src/components/school/fees/PaymentRegistrationModal.tsx`
- Modify: `frontend/src/components/school/fees/FeeHistoryModal.tsx`

**Interfaces:**
- Consumes: `Fees.paymentMethod.*` (Task 1), `TrancheStatusBadge` (Task 1), `fmtMoney`/`fmtDate(d, locale)` (Task 1), `LOCALE_BCP47` (existing), `Common.errors.network` (existing).
- Produces: `Fees.registerPayment.*`, `Fees.history.*` — not consumed by any later task (Task 7 only touches the `openReceiptAndPrint` call sites inside these same two files, not new keys).
- Corrections found during this task's read-through: `PaymentRegistrationModal.tsx` had 2 hardcoded French strings with no `FEES` entry (`setError('Impossible de charger les informations de paiement.')`, `toast('Paiement enregistré.', 'success')`) and **the tutoiement violation this task's spec flagged** — `'Erreur réseau. Réessaie.'` in its catch block — now routed through `tCommon('errors.network')` like every other screen in this module. `FeeHistoryModal.tsx` is entirely new namespace surface: its modal title, both loading-skeleton labels, the "échéance" prefix, the payments-list heading/empty-state, and the print-receipt aria-label were all inline JSX strings. Both files also drop their `FEES` import: `FEES.currency` becomes a local `DEFAULT_CURRENCY = 'HTG'` constant (same value, no cross-file dependency), and `FEES.paymentMethodLabel[...]` becomes `useTranslations('Fees.paymentMethod')`. `FeeHistoryModal.tsx`'s `print()` callback used a tranche-lookup callback parameter named `t` (`data.tranches.find((t) => ...)`) that would now shadow this component's own `t = useTranslations(...)` — renamed to `tr`.

- [ ] **Step 1: Append `registerPayment` and `history` to `frontend/src/messages/fr/fees.json`**

Add these two keys as new top-level siblings of `configuration` (after its closing `}`, before the file's final closing `}`):

```json
  "registerPayment": {
    "title": "Enregistrer un paiement",
    "subtitle": "Saisissez les informations du versement ci-dessous",
    "balanceLabel": "Solde dû",
    "selectTranche": "Sélectionner la tranche",
    "latePenaltyNote": "Une pénalité de retard de {amount} ({percent}%) sera appliquée automatiquement sur cette tranche.",
    "detailsTitle": "Détails du versement",
    "amountLabel": "Montant versé",
    "dateLabel": "Date du paiement",
    "referenceLabel": "N° Référence / Reçu",
    "referencePlaceholder": "REF-2026-...",
    "notesLabel": "Notes (optionnel)",
    "notesPlaceholder": "Remarques...",
    "methodTitle": "Mode de paiement",
    "dueDatePrefix": "échéance",
    "totalTitle": "Montant total à encaisser",
    "breakdownLabel": "Principal {principal} + Pénalité {penalty}",
    "remainingAfter": "Solde restant après paiement",
    "settled": "Compte soldé",
    "cancel": "Annuler",
    "saveAndPrint": "Enregistrer & Imprimer le reçu",
    "confirm": "Confirmer le paiement",
    "loadError": "Impossible de charger les informations de paiement.",
    "savedToast": "Paiement enregistré."
  },
  "history": {
    "title": "Historique des paiements",
    "loadError": "Impossible de charger l'historique.",
    "balanceLabel": "Solde dû",
    "dueDatePrefix": "échéance",
    "paymentsTitle": "Paiements enregistrés",
    "noPayments": "Aucun paiement enregistré.",
    "printReceiptAria": "Imprimer le reçu"
  }
```

- [ ] **Step 2: Append `registerPayment` and `history` to `frontend/src/messages/en/fees.json`**

```json
  "registerPayment": {
    "title": "Register a payment",
    "subtitle": "Enter the payment details below",
    "balanceLabel": "Balance due",
    "selectTranche": "Select the installment",
    "latePenaltyNote": "A late penalty of {amount} ({percent}%) will be applied automatically to this installment.",
    "detailsTitle": "Payment details",
    "amountLabel": "Amount paid",
    "dateLabel": "Payment date",
    "referenceLabel": "Reference / Receipt No.",
    "referencePlaceholder": "REF-2026-...",
    "notesLabel": "Notes (optional)",
    "notesPlaceholder": "Remarks...",
    "methodTitle": "Payment method",
    "dueDatePrefix": "due",
    "totalTitle": "Total amount to collect",
    "breakdownLabel": "Principal {principal} + Penalty {penalty}",
    "remainingAfter": "Remaining balance after payment",
    "settled": "Account settled",
    "cancel": "Cancel",
    "saveAndPrint": "Save & print receipt",
    "confirm": "Confirm payment",
    "loadError": "Unable to load payment information.",
    "savedToast": "Payment recorded."
  },
  "history": {
    "title": "Payment history",
    "loadError": "Unable to load the payment history.",
    "balanceLabel": "Balance due",
    "dueDatePrefix": "due",
    "paymentsTitle": "Recorded payments",
    "noPayments": "No payments recorded.",
    "printReceiptAria": "Print receipt"
  }
```

- [ ] **Step 3: Append `registerPayment` and `history` to `frontend/src/messages/ht/fees.json`**

```json
  "registerPayment": {
    "title": "Anrejistre yon peman",
    "subtitle": "Antre enfòmasyon vèsman an anba a",
    "balanceLabel": "Solde ki dwe",
    "selectTranche": "Chwazi vèsman an",
    "latePenaltyNote": "Yon penalite reta {amount} ({percent}%) ap aplike otomatikman sou vèsman sa a.",
    "detailsTitle": "Detay vèsman an",
    "amountLabel": "Montan peye",
    "dateLabel": "Dat peman an",
    "referenceLabel": "Nimewo Referans / Resi",
    "referencePlaceholder": "REF-2026-...",
    "notesLabel": "Nòt (opsyonèl)",
    "notesPlaceholder": "Remak...",
    "methodTitle": "Mòd peman",
    "dueDatePrefix": "echeyans",
    "totalTitle": "Montan total pou kolekte",
    "breakdownLabel": "Prensipal {principal} + Penalite {penalty}",
    "remainingAfter": "Solde ki rete apre peman",
    "settled": "Kont solde",
    "cancel": "Anile",
    "saveAndPrint": "Anrejistre & Enprime resi a",
    "confirm": "Konfime peman an",
    "loadError": "Nou pa ka chaje enfòmasyon peman an.",
    "savedToast": "Peman anrejistre."
  },
  "history": {
    "title": "Istorik peman yo",
    "loadError": "Nou pa ka chaje istorik la.",
    "balanceLabel": "Solde ki dwe",
    "dueDatePrefix": "echeyans",
    "paymentsTitle": "Peman anrejistre",
    "noPayments": "Pa gen peman ki anrejistre.",
    "printReceiptAria": "Enprime resi a"
  }
```

- [ ] **Step 4: Rewrite `frontend/src/components/school/fees/PaymentRegistrationModal.tsx`**

Full replacement:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Banknote, Building2, FileText, Smartphone } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { DateField } from '@/components/ui/DateField';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { LOCALE_BCP47 } from '@/lib/locales';
import { fmtMoney, fmtDate } from '@/lib/fees-format';
import { openReceiptAndPrint } from '@/lib/fees-receipt';
import { TrancheStatusBadge, type TrancheStatus } from './badges';

const DEFAULT_CURRENCY = 'HTG';

interface HistoryTranche {
  id: string;
  order: number;
  label: string;
  amount: number;
  dueDate: string;
  latePenaltyPercent: number | null;
  latePenaltyGraceDays: number | null;
  status: TrancheStatus;
  paidAmount: number;
  remaining: number;
}

interface HistoryResponse {
  student: { id: string; firstName: string; lastName: string; studentNumber: string };
  balance: number;
  tranches: HistoryTranche[];
}

type Method = 'ESPECES' | 'MONCASH' | 'NATCASH' | 'CHEQUE' | 'VIREMENT';

const METHOD_ICON: Record<Method, typeof Banknote> = {
  ESPECES: Banknote,
  MONCASH: Smartphone,
  NATCASH: Smartphone,
  CHEQUE: FileText,
  VIREMENT: Building2,
};

// Client-side preview only — mirrors lib/server/fees.ts's computeLatePenalty
// formula so the modal can show the banner/total before submit, but the
// server recomputes and stores the authoritative value; never trust this
// for the actual charge.
function previewPenalty(tranche: HistoryTranche, paidAt: Date, lateFeeEnabled: boolean): number {
  if (!lateFeeEnabled || tranche.latePenaltyPercent == null) return 0;
  const graceDays = tranche.latePenaltyGraceDays ?? 0;
  const graceDeadline = new Date(new Date(tranche.dueDate).getTime() + graceDays * 86_400_000);
  if (paidAt <= graceDeadline) return 0;
  return Math.round((tranche.amount * tranche.latePenaltyPercent) / 100);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PaymentRegistrationModal({
  studentId,
  preselectedTrancheId,
  onClose,
  onSaved,
}: {
  studentId: string;
  preselectedTrancheId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const t = useTranslations('Fees.registerPayment');
  const tMethod = useTranslations('Fees.paymentMethod');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [lateFeeEnabled, setLateFeeEnabled] = useState(true);
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [selectedTrancheId, setSelectedTrancheId] = useState(preselectedTrancheId ?? '');
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(today());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState<Method>('ESPECES');
  const [submitting, setSubmitting] = useState<'confirm' | 'print' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<HistoryResponse>(`/api/school/fees/students/${studentId}/history`),
      api<{ settings: { lateFeeEnabled: boolean; currency: string } }>(
        '/api/school/fees/automation-settings',
      ),
    ])
      .then(([history, automation]) => {
        setData(history);
        setLateFeeEnabled(automation.settings.lateFeeEnabled);
        setCurrency(automation.settings.currency);
        const initial =
          history.tranches.find((tr) => tr.id === preselectedTrancheId) ??
          history.tranches.find((tr) => tr.status !== 'PAID') ??
          history.tranches[0];
        if (initial) {
          setSelectedTrancheId(initial.id);
          setAmount(String(initial.remaining));
        }
      })
      .catch(() => setError(t('loadError')));
  }, [studentId, preselectedTrancheId, t]);

  const tranche = useMemo(
    () => data?.tranches.find((tr) => tr.id === selectedTrancheId) ?? null,
    [data, selectedTrancheId],
  );
  const amountNum = Number(amount) || 0;
  const penalty = tranche ? previewPenalty(tranche, new Date(paidAt), lateFeeEnabled) : 0;
  const total = amountNum + penalty;
  const remainingAfter = tranche ? Math.max(tranche.remaining - amountNum, 0) : 0;

  function selectTranche(tr: HistoryTranche) {
    setSelectedTrancheId(tr.id);
    setAmount(String(tr.remaining));
  }

  async function submit(mode: 'confirm' | 'print') {
    if (!tranche || amountNum <= 0) return;
    setError(null);
    setSubmitting(mode);
    try {
      await api('/api/school/fees/payments', {
        method: 'POST',
        body: {
          studentId,
          feeTrancheId: tranche.id,
          amount: amountNum,
          method,
          reference: reference || undefined,
          notes: notes || undefined,
          paidAt,
        },
      });
      if (mode === 'print' && data) {
        openReceiptAndPrint({
          studentName: `${data.student.firstName} ${data.student.lastName}`,
          studentNumber: data.student.studentNumber,
          trancheLabel: tranche.label,
          amount: amountNum,
          penaltyAmount: penalty,
          method,
          reference,
          paidAt,
          currency,
        });
      }
      toast(t('savedToast'), 'success');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Modal title={t('title')} onClose={onClose}>
      {!data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-xs text-muted-foreground">{t('subtitle')}</p>

          <div className="flex items-center justify-between rounded-md bg-secondary px-3.5 py-2.5">
            <div>
              <div className="text-sm font-bold text-foreground">
                {data.student.firstName} {data.student.lastName}
              </div>
              <div className="text-[11px] text-muted-foreground">#{data.student.studentNumber}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-muted-foreground">{t('balanceLabel')}</div>
              <div className="text-sm font-extrabold text-foreground">
                {fmtMoney(data.balance, currency)}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-foreground">{t('selectTranche')}</span>
            <div className="flex flex-col gap-1.5">
              {data.tranches.map((tr) => (
                <button
                  key={tr.id}
                  type="button"
                  onClick={() => selectTranche(tr)}
                  className={`flex items-center justify-between rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                    tr.id === selectedTrancheId
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-foreground">{tr.label}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {fmtMoney(tr.amount, currency)} · {t('dueDatePrefix')}{' '}
                      {fmtDate(tr.dueDate, bcp47)}
                    </div>
                  </div>
                  <TrancheStatusBadge status={tr.status} />
                </button>
              ))}
            </div>
          </div>

          {tranche && tranche.status === 'OVERDUE' && penalty > 0 && (
            <p className="rounded-md bg-warning px-3 py-2.5 text-xs text-warning-foreground">
              {t('latePenaltyNote', {
                amount: fmtMoney(penalty, currency),
                percent: tranche.latePenaltyPercent ?? 0,
              })}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold text-foreground">{t('detailsTitle')}</span>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={t('amountLabel')}
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <DateField label={t('dateLabel')} value={paidAt} onChange={setPaidAt} />
            </div>
            <Field
              label={t('referenceLabel')}
              placeholder={t('referencePlaceholder')}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-semibold text-foreground">{t('notesLabel')}</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('notesPlaceholder')}
                rows={2}
                className="rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-primary/10"
              />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-foreground">{t('methodTitle')}</span>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {(Object.keys(METHOD_ICON) as Method[]).map((m) => {
                const Icon = METHOD_ICON[m];
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-[11px] font-semibold ${
                      method === m
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    <Icon size={16} />
                    {tMethod(m)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 rounded-md border border-border p-3.5">
            <span className="text-xs font-semibold text-foreground">{t('totalTitle')}</span>
            {penalty > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {t('breakdownLabel', {
                  principal: fmtMoney(amountNum, currency),
                  penalty: fmtMoney(penalty, currency),
                })}
              </p>
            )}
            <div className="text-lg font-extrabold text-foreground">
              {fmtMoney(total, currency)}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('remainingAfter')}</span>
              <span className={remainingAfter === 0 ? 'font-semibold text-success-foreground' : ''}>
                {remainingAfter === 0 ? t('settled') : fmtMoney(remainingAfter, currency)}
              </span>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button
              variant="outline"
              loading={submitting === 'print'}
              disabled={!tranche || amountNum <= 0 || submitting !== null}
              onClick={() => submit('print')}
            >
              {t('saveAndPrint')}
            </Button>
            <Button
              loading={submitting === 'confirm'}
              disabled={!tranche || amountNum <= 0 || submitting !== null}
              onClick={() => submit('confirm')}
            >
              {t('confirm')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 5: Rewrite `frontend/src/components/school/fees/FeeHistoryModal.tsx`**

Full replacement:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { LOCALE_BCP47 } from '@/lib/locales';
import { fmtMoney, fmtDate } from '@/lib/fees-format';
import { openReceiptAndPrint, type FeePaymentMethod } from '@/lib/fees-receipt';
import { TrancheStatusBadge, type TrancheStatus } from './badges';

const DEFAULT_CURRENCY = 'HTG';

interface HistoryTranche {
  id: string;
  label: string;
  amount: number;
  dueDate: string;
  status: TrancheStatus;
  paidAmount: number;
  remaining: number;
}

interface HistoryPayment {
  id: string;
  amount: number;
  penaltyAmount: number;
  method: FeePaymentMethod;
  reference: string | null;
  paidAt: string;
  feeTrancheId: string;
  recordedByName: string;
}

interface HistoryResponse {
  student: { id: string; firstName: string; lastName: string; studentNumber: string };
  class: { id: string; name: string } | null;
  balance: number;
  tranches: HistoryTranche[];
  payments: HistoryPayment[];
}

// "Voir l'historique" row action, shared by Fee Management and Relances
// Impayés — read-only view of a student's tranches + full payment ledger,
// each payment reprintable via the same receipt helper the registration
// modal uses.
export function FeeHistoryModal({
  studentId,
  onClose,
}: {
  studentId: string;
  onClose: () => void;
}) {
  const t = useTranslations('Fees.history');
  const tMethod = useTranslations('Fees.paymentMethod');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<HistoryResponse>(`/api/school/fees/students/${studentId}/history`)
      .then(setData)
      .catch(() => setError(t('loadError')));
    api<{ settings: { currency: string } }>('/api/school/fees/automation-settings')
      .then((res) => setCurrency(res.settings.currency))
      .catch(() => {});
  }, [studentId, t]);

  function print(payment: HistoryPayment) {
    if (!data) return;
    const tranche = data.tranches.find((tr) => tr.id === payment.feeTrancheId);
    openReceiptAndPrint({
      studentName: `${data.student.firstName} ${data.student.lastName}`,
      studentNumber: data.student.studentNumber,
      trancheLabel: tranche?.label ?? '—',
      amount: payment.amount,
      penaltyAmount: payment.penaltyAmount,
      method: payment.method,
      reference: payment.reference ?? undefined,
      paidAt: payment.paidAt,
      currency,
    });
  }

  return (
    <Modal title={t('title')} onClose={onClose}>
      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}
      {!data && !error && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {data && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between rounded-md bg-secondary px-3.5 py-2.5">
            <div>
              <div className="text-sm font-bold text-foreground">
                {data.student.firstName} {data.student.lastName}
              </div>
              <div className="text-2xs text-muted-foreground">
                #{data.student.studentNumber} {data.class ? `· ${data.class.name}` : ''}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xs text-muted-foreground">{t('balanceLabel')}</div>
              <div className="text-sm font-extrabold text-foreground">
                {fmtMoney(data.balance, currency)}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {data.tranches.map((tr) => (
              <div
                key={tr.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div>
                  <div className="text-sm font-semibold text-foreground">{tr.label}</div>
                  <div className="text-2xs text-muted-foreground">
                    {fmtMoney(tr.paidAmount, currency)} / {fmtMoney(tr.amount, currency)} ·{' '}
                    {t('dueDatePrefix')} {fmtDate(tr.dueDate, bcp47)}
                  </div>
                </div>
                <TrancheStatusBadge status={tr.status} />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-foreground">{t('paymentsTitle')}</span>
            {data.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noPayments')}</p>
            ) : (
              <div className="flex flex-col divide-y divide-border rounded-md border border-border">
                {data.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">
                        {fmtMoney(p.amount + p.penaltyAmount, currency)}
                      </div>
                      <div className="truncate text-2xs text-muted-foreground">
                        {fmtDate(p.paidAt, bcp47)} · {tMethod(p.method)} · {p.recordedByName}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => print(p)}
                      aria-label={t('printReceiptAria')}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                    >
                      <Printer size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 6: Run the full gate**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all pass.

- [ ] **Step 7: Manual verification**

From `/scolarite/paiements` (or `/scolarite/relances`), open "Enregistrer un paiement" for a student with an overdue tranche in all 3 locales — confirm the late-penalty banner interpolates the amount/percent correctly, the payment-method grid shows translated labels, and both the network-error path (throttle the network tab or stop the dev server briefly) and the success toast show translated text, not French leaking into EN/HT. Then open "Voir l'historique" for the same student and confirm the modal title, balance label, "échéance" prefix, payments list, and the print-receipt icon's aria-label are all translated; print one receipt and confirm it still opens (its own content stays French until Task 7).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/messages/fr/fees.json frontend/src/messages/ht/fees.json frontend/src/messages/en/fees.json frontend/src/components/school/fees/PaymentRegistrationModal.tsx frontend/src/components/school/fees/FeeHistoryModal.tsx
git commit -m "$(cat <<'EOF'
feat(i18n): Scolarité — translate payment registration + history modals

Sixth task of the Scolarité i18n phase. Adds fees.registerPayment.*
(ported from the source FEES.registerPayment object) and a brand-new
fees.history.* namespace for FeeHistoryModal.tsx, which had no FEES
precedent at all. Fixes a tutoiement violation in the payment
registration error path (now routes through Common.errors.network)
and 2 other untranslated inline strings.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `fees-receipt.ts` locale wiring + `FEES` deletion + docs

**Files:**
- Modify: `frontend/src/messages/{fr,ht,en}/fees.json` (add `receipt` — new top-level sibling of `history`, shared by all 3 receipt-printing call sites)
- Modify: `frontend/src/lib/fees-format.ts` (remove `fmtDate`/`fmtDateShort`'s default locale value — the parameter becomes required)
- Modify: `frontend/src/lib/fees-receipt.ts` (add `ReceiptLabels`, extend `ReceiptParams` with `labels`/`locale`, drop the `FEES` import)
- Modify: `frontend/src/app/(school)/scolarite/paiements/page.tsx` (pass `labels`/`locale` to its `openReceiptAndPrint` call)
- Modify: `frontend/src/components/school/fees/PaymentRegistrationModal.tsx` (same)
- Modify: `frontend/src/components/school/fees/FeeHistoryModal.tsx` (same)
- Modify: `frontend/src/lib/constants.ts` (delete the `FEES` object — now unused everywhere)
- Modify: `CLAUDE.md` (repo root — update the i18n status paragraph)

**Interfaces:**
- Consumes: `Fees.paymentMethod.*` (Task 1), the `openReceiptAndPrint` call sites from Task 2 (`paiements/page.tsx`) and Task 6 (`PaymentRegistrationModal.tsx`, `FeeHistoryModal.tsx`).
- Produces: nothing — this is the final task of the Scolarité i18n phase. `fmtDate`/`fmtDateShort(d, locale: string)` becomes the permanent signature (no more default).
- This task is the payoff of the receipt-locale decision the user made during brainstorming: `openReceiptAndPrint` is a plain function outside the React tree, so it can't call `useTranslations()` itself — every caller now resolves its own `labels` via its own `useTranslations('Fees.receipt')` + `useTranslations('Fees.paymentMethod')` and passes them in, plus the caller's own `bcp47` locale string for the receipt's date line.

- [ ] **Step 1: Append `receipt` to `frontend/src/messages/fr/fees.json`**

Add as a new top-level sibling of `history` (after its closing `}`, before the file's final closing `}`):

```json
  "receipt": {
    "title": "Reçu de paiement",
    "tranche": "Tranche",
    "amountPaid": "Montant versé",
    "latePenalty": "Pénalité de retard",
    "paymentMethod": "Mode de paiement",
    "reference": "Référence",
    "totalCollected": "Total encaissé"
  }
```

- [ ] **Step 2: Append `receipt` to `frontend/src/messages/en/fees.json`**

```json
  "receipt": {
    "title": "Payment receipt",
    "tranche": "Installment",
    "amountPaid": "Amount paid",
    "latePenalty": "Late penalty",
    "paymentMethod": "Payment method",
    "reference": "Reference",
    "totalCollected": "Total collected"
  }
```

- [ ] **Step 3: Append `receipt` to `frontend/src/messages/ht/fees.json`**

```json
  "receipt": {
    "title": "Resi peman",
    "tranche": "Vèsman",
    "amountPaid": "Montan peye",
    "latePenalty": "Penalite reta",
    "paymentMethod": "Mòd peman",
    "reference": "Referans",
    "totalCollected": "Total kolekte"
  }
```

- [ ] **Step 4: Rewrite `frontend/src/lib/fees-format.ts`**

Full replacement — this drops the staged `locale: string = 'fr-FR'` default from Task 1 now that every caller (Tasks 2, 3, 4, 6) passes its real locale explicitly:

```ts
// Client-side formatting helpers shared by the 3 Frais & Scolarité screens
// + the Payment Registration modal — kept in one place so amount/date
// rendering can never drift between them. See .planning/banani/frais-scolarite.md.
import { formatPrice } from '@/lib/utils';

const DEFAULT_CURRENCY = 'HTG';

export function fmtMoney(amount: number, currency: string = DEFAULT_CURRENCY): string {
  return formatPrice(amount, currency);
}

export function fmtDate(d: string | Date, locale: string): string {
  return new Date(d).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function fmtDateShort(d: string | Date, locale: string): string {
  return new Date(d).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// "1.5/3" style fraction used by the Fee Management table's "Tranches" column.
export function fmtFraction(paid: number, total: number): string {
  const n = Number.isInteger(paid) ? paid : Math.round(paid * 10) / 10;
  return `${n}/${total}`;
}
```

Removing the default makes `locale` required at every call site — if any caller across the whole app was missed, `pnpm typecheck` in Step 11 fails immediately with a precise file/line, rather than silently defaulting to French at runtime.

- [ ] **Step 5: Rewrite `frontend/src/lib/fees-receipt.ts`**

Full replacement:

```ts
// Shared receipt printing for Frais & Scolarité — opens a small dedicated
// print window built from data already in hand (no server round trip),
// rather than window.print()-ing the on-screen app chrome. Used by the
// Payment Registration modal's "Enregistrer & Imprimer" and Fee Management/
// Relances' "Imprimer le reçu" row action.
//
// A plain function outside the React tree can't call useTranslations()
// itself, so every caller resolves its own strings via useTranslations and
// passes them in as `labels` — the printed receipt follows the admin's UI
// locale (see docs/superpowers/specs/2026-08-20-i18n-scolarite-design.md).
import { fmtMoney, fmtDate } from '@/lib/fees-format';

export type FeePaymentMethod = 'ESPECES' | 'MONCASH' | 'NATCASH' | 'CHEQUE' | 'VIREMENT';

export interface ReceiptLabels {
  title: string;
  tranche: string;
  amountPaid: string;
  latePenalty: string;
  paymentMethod: string;
  reference: string;
  totalCollected: string;
  methodLabel: string;
}

export interface ReceiptParams {
  studentName: string;
  studentNumber: string;
  trancheLabel: string;
  amount: number;
  penaltyAmount: number;
  method: FeePaymentMethod;
  reference?: string | undefined;
  paidAt: string;
  currency: string;
  locale: string;
  labels: ReceiptLabels;
}

export function openReceiptAndPrint(params: ReceiptParams): void {
  const win = window.open('', '_blank', 'width=420,height=600');
  if (!win) return;
  const total = params.amount + params.penaltyAmount;
  const { labels } = params;
  win.document
    .write(`<!doctype html><html><head><meta charset="utf-8"><title>${labels.title}</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 24px; color: #111; }
      h1 { font-size: 16px; margin: 0 0 4px; }
      p { margin: 2px 0; font-size: 13px; }
      table { width: 100%; margin-top: 16px; border-collapse: collapse; font-size: 13px; }
      td { padding: 6px 0; border-bottom: 1px solid #eee; }
      td:last-child { text-align: right; font-weight: 600; }
      .total td { font-size: 15px; font-weight: 700; border-top: 2px solid #111; border-bottom: none; }
    </style></head><body>
    <h1>${labels.title}</h1>
    <p>${params.studentName} — #${params.studentNumber}</p>
    <p>${fmtDate(params.paidAt, params.locale)}</p>
    <table>
      <tr><td>${labels.tranche}</td><td>${params.trancheLabel}</td></tr>
      <tr><td>${labels.amountPaid}</td><td>${fmtMoney(params.amount, params.currency)}</td></tr>
      ${params.penaltyAmount > 0 ? `<tr><td>${labels.latePenalty}</td><td>${fmtMoney(params.penaltyAmount, params.currency)}</td></tr>` : ''}
      <tr><td>${labels.paymentMethod}</td><td>${labels.methodLabel}</td></tr>
      ${params.reference ? `<tr><td>${labels.reference}</td><td>${params.reference}</td></tr>` : ''}
      <tr class="total"><td>${labels.totalCollected}</td><td>${fmtMoney(total, params.currency)}</td></tr>
    </table>
  </body></html>`);
  win.document.close();
  win.onload = () => win.print();
}
```

- [ ] **Step 6: Wire receipt labels into `frontend/src/app/(school)/scolarite/paiements/page.tsx`**

Find this block (the hooks near the top of `FeeManagementPage`):

```tsx
  const t = useTranslations('Fees.overview');
  const tStatus = useTranslations('Fees.studentStatus');
  const tWhatsapp = useTranslations('Fees.whatsapp');
  const locale = useLocale();
```

Replace with:

```tsx
  const t = useTranslations('Fees.overview');
  const tStatus = useTranslations('Fees.studentStatus');
  const tWhatsapp = useTranslations('Fees.whatsapp');
  const tReceipt = useTranslations('Fees.receipt');
  const tMethod = useTranslations('Fees.paymentMethod');
  const locale = useLocale();
```

Then find `printLastReceipt`'s `openReceiptAndPrint` call:

```tsx
      openReceiptAndPrint({
        studentName: `${history.student.firstName} ${history.student.lastName}`,
        studentNumber: history.student.studentNumber,
        trancheLabel: tranche?.label ?? '—',
        amount: last.amount,
        penaltyAmount: last.penaltyAmount,
        method: last.method,
        reference: last.reference ?? undefined,
        paidAt: last.paidAt,
        currency,
      });
```

Replace with:

```tsx
      openReceiptAndPrint({
        studentName: `${history.student.firstName} ${history.student.lastName}`,
        studentNumber: history.student.studentNumber,
        trancheLabel: tranche?.label ?? '—',
        amount: last.amount,
        penaltyAmount: last.penaltyAmount,
        method: last.method,
        reference: last.reference ?? undefined,
        paidAt: last.paidAt,
        currency,
        locale: bcp47,
        labels: {
          title: tReceipt('title'),
          tranche: tReceipt('tranche'),
          amountPaid: tReceipt('amountPaid'),
          latePenalty: tReceipt('latePenalty'),
          paymentMethod: tReceipt('paymentMethod'),
          reference: tReceipt('reference'),
          totalCollected: tReceipt('totalCollected'),
          methodLabel: tMethod(last.method),
        },
      });
```

- [ ] **Step 7: Wire receipt labels into `frontend/src/components/school/fees/PaymentRegistrationModal.tsx`**

Find:

```tsx
  const t = useTranslations('Fees.registerPayment');
  const tMethod = useTranslations('Fees.paymentMethod');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
```

Replace with:

```tsx
  const t = useTranslations('Fees.registerPayment');
  const tMethod = useTranslations('Fees.paymentMethod');
  const tReceipt = useTranslations('Fees.receipt');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
```

Then find `submit`'s `openReceiptAndPrint` call:

```tsx
      if (mode === 'print' && data) {
        openReceiptAndPrint({
          studentName: `${data.student.firstName} ${data.student.lastName}`,
          studentNumber: data.student.studentNumber,
          trancheLabel: tranche.label,
          amount: amountNum,
          penaltyAmount: penalty,
          method,
          reference,
          paidAt,
          currency,
        });
      }
```

Replace with:

```tsx
      if (mode === 'print' && data) {
        openReceiptAndPrint({
          studentName: `${data.student.firstName} ${data.student.lastName}`,
          studentNumber: data.student.studentNumber,
          trancheLabel: tranche.label,
          amount: amountNum,
          penaltyAmount: penalty,
          method,
          reference,
          paidAt,
          currency,
          locale: bcp47,
          labels: {
            title: tReceipt('title'),
            tranche: tReceipt('tranche'),
            amountPaid: tReceipt('amountPaid'),
            latePenalty: tReceipt('latePenalty'),
            paymentMethod: tReceipt('paymentMethod'),
            reference: tReceipt('reference'),
            totalCollected: tReceipt('totalCollected'),
            methodLabel: tMethod(method),
          },
        });
      }
```

- [ ] **Step 8: Wire receipt labels into `frontend/src/components/school/fees/FeeHistoryModal.tsx`**

Find:

```tsx
  const t = useTranslations('Fees.history');
  const tMethod = useTranslations('Fees.paymentMethod');
  const locale = useLocale();
```

Replace with:

```tsx
  const t = useTranslations('Fees.history');
  const tMethod = useTranslations('Fees.paymentMethod');
  const tReceipt = useTranslations('Fees.receipt');
  const locale = useLocale();
```

Then find the `print` function:

```tsx
  function print(payment: HistoryPayment) {
    if (!data) return;
    const tranche = data.tranches.find((tr) => tr.id === payment.feeTrancheId);
    openReceiptAndPrint({
      studentName: `${data.student.firstName} ${data.student.lastName}`,
      studentNumber: data.student.studentNumber,
      trancheLabel: tranche?.label ?? '—',
      amount: payment.amount,
      penaltyAmount: payment.penaltyAmount,
      method: payment.method,
      reference: payment.reference ?? undefined,
      paidAt: payment.paidAt,
      currency,
    });
  }
```

Replace with:

```tsx
  function print(payment: HistoryPayment) {
    if (!data) return;
    const tranche = data.tranches.find((tr) => tr.id === payment.feeTrancheId);
    openReceiptAndPrint({
      studentName: `${data.student.firstName} ${data.student.lastName}`,
      studentNumber: data.student.studentNumber,
      trancheLabel: tranche?.label ?? '—',
      amount: payment.amount,
      penaltyAmount: payment.penaltyAmount,
      method: payment.method,
      reference: payment.reference ?? undefined,
      paidAt: payment.paidAt,
      currency,
      locale: bcp47,
      labels: {
        title: tReceipt('title'),
        tranche: tReceipt('tranche'),
        amountPaid: tReceipt('amountPaid'),
        latePenalty: tReceipt('latePenalty'),
        paymentMethod: tReceipt('paymentMethod'),
        reference: tReceipt('reference'),
        totalCollected: tReceipt('totalCollected'),
        methodLabel: tMethod(payment.method),
      },
    });
  }
```

- [ ] **Step 9: Delete the `FEES` object from `frontend/src/lib/constants.ts`**

By this point every one of the 12 in-scope files has stopped importing `FEES` (confirmed via `grep -rln "FEES" frontend/src` before this task — only `constants.ts` itself and the 12 files this plan touches ever referenced it). Delete every line starting at this comment:

```ts
// French copy for Frais & Scolarité (Payment Configuration / Fee Management
// / Relances Impayés / Payment Registration) — see
// .planning/banani/frais-scolarite.md.
export const FEES = {
```

through and including this closing line (the object's own final two lines):

```ts
  stub: 'Cette fonctionnalité arrive bientôt.',
} as const;
```

Delete the whole span — comment, declaration, and every key in between — leaving the blank line before it and the `// ─── School Dashboard ───` comment after it as direct neighbors.

- [ ] **Step 10: Update the i18n status paragraph in `CLAUDE.md` (repo root)**

This paragraph is a long-running shared document — other concurrent i18n sessions (Carnet de notes, Présences, Enseignants, Élèves) edit it too. **Before editing, re-read the current file** (it may have already changed since this plan was written) and locate these two pieces of text by content, not by line number:

1. Find the sentence fragment `Every other screen (Pédagogie, Scolarité, the rest of` — remove `Scolarité, ` from that list (Scolarité is no longer unmigrated). If a concurrent session has already also removed `Pédagogie, ` from the same list, just remove `Scolarité, ` from whatever the list looks like at that point — don't restore or reorder anything else in the sentence.
2. Immediately before that same sentence (which begins `Every other screen (...) still reads French from constants.ts unchanged`), insert this new sentence:

```
The Scolarité (Fees & Tuition) module — `/scolarite/paiements`, `/scolarite/relances`, `/scolarite/configuration`, and their 9 supporting components (badges, tabs, tranche/class pickers, dispute/payment/history modals, the shared `fees-format.ts`/`fees-receipt.ts` helpers) — is migrated as of 2026-08-20, with one deliberate carve-out: the printed payment receipt (`fees-receipt.ts`) follows the admin's UI locale rather than staying pinned to French, per the user's sign-off decision in `docs/superpowers/specs/2026-08-20-i18n-scolarite-design.md`.
```

Do not touch the `MESSAGE_NAMESPACES` count in this paragraph — re-verify it separately by counting the actual array in `frontend/src/lib/locales.ts` at execution time (concurrent sessions may have already changed it) and correct it only if it's wrong, in its own small edit.

- [ ] **Step 11: Run the full gate**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all pass. This is the phase's final verification — `pnpm test` runs the entire suite (not scoped to fees), so any regression anywhere in the app from the `FEES` deletion or the `fmtDate`/`fmtDateShort` signature change surfaces here.

- [ ] **Step 12: Manual verification**

Run `grep -rn "FEES" frontend/src --include="*.ts" --include="*.tsx"` — expect zero matches (confirms the constant is fully gone, not just unused). Then, in the browser, register a payment and print a receipt while the UI is set to each of the 3 locales in turn — confirm the receipt's title, section labels, and payment-method text are all in that locale (not always French), and that the date line renders in the locale's date format (e.g., "20 août 2026" in FR vs "August 20, 2026" in EN). Repeat via the "Voir l'historique" reprint action to confirm both call sites behave identically.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/messages/fr/fees.json frontend/src/messages/ht/fees.json frontend/src/messages/en/fees.json frontend/src/lib/fees-format.ts frontend/src/lib/fees-receipt.ts "frontend/src/app/(school)/scolarite/paiements/page.tsx" frontend/src/components/school/fees/PaymentRegistrationModal.tsx frontend/src/components/school/fees/FeeHistoryModal.tsx frontend/src/lib/constants.ts CLAUDE.md
git commit -m "$(cat <<'EOF'
feat(i18n): Scolarité — locale-aware receipts, drop legacy FEES constant

Final task of the Scolarité (Fees & Tuition) i18n phase. The printed
payment receipt now follows the admin's UI locale end to end (per
user sign-off during brainstorming) instead of being pinned to French
regardless of the app's language — fees-receipt.ts takes a `labels`
bag and `locale` from its 3 callers since it runs outside the React
tree and can't call useTranslations() itself. Removes the now-fully-
unused FEES object from constants.ts and fmtDate/fmtDateShort's
staged default locale parameter. All 12 Scolarité files are now on
next-intl; CLAUDE.md's i18n status paragraph updated to match.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
