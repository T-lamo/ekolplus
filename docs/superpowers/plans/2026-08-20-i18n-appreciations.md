# i18n — Appréciations (Report-Card Comments) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the Appréciations (report-card comments) module — 6 files, 2,254 lines — into French/Haitian Creole/English via next-intl, fixing three real locale/grammar bugs (a hardcoded `'fr-FR'` date format, a hardcoded French decimal comma duplicated 5×, two tutoiement violations plus one dangling-imperative grammar slip) and consolidating three byte-identical helper triplets (`fmt()` ×5, `mentionClass()` ×2, `moyColor()` ×2) into one shared, locale-aware `format.ts`.

**Architecture:** Same `next-intl` machinery as every prior i18n phase: `useTranslations('Appreciations.<section>')` in client components, one `appreciations` namespace covering all 6 files (nested per component), registered in `locales.ts`/`i18n/request.ts`/`next-intl.d.ts`. One new non-i18n file (`format.ts`, pure formatting/styling helpers, no translation strings). No other new infrastructure.

**Tech Stack:** Next.js 16 App Router, next-intl, TypeScript strict (`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`).

**Spec:** `docs/superpowers/specs/2026-08-20-i18n-appreciations-design.md`

## Global Constraints

- **Vouvoiement throughout, no exceptions.** The design-phase full-file read found two clear violations plus one grammar slip; all three are corrected in this plan's code/JSON blocks (do not "restore" the originals):
  - `page.tsx`: `"Configure d'abord des classes et des élèves avant de saisir des appréciations."` → `"Configurez d'abord des classes et des élèves avant de saisir des appréciations."` (Task 4, `list.noClasses`)
  - `[studentId]/saisie/page.tsx`: `'Erreur réseau. Réessaie.'` → `common.errors.network` (already reads "Erreur réseau. Réessayez." — fixes itself for free, same mechanism every prior phase used) (Task 6)
  - `[studentId]/saisie/page.tsx`: `QUICK_PHRASES`'s `'Élève sérieux et investi, encourage à continuer.'` → `'Élève sérieux et investi, qui doit continuer ainsi.'` (Task 6, `saisie.quickPhrases.serious`) — `"encourage"` was a bare tu-imperative dropped into third-person descriptive text (most likely a typo for the past participle `"encouragé"`); since the string becomes a translation key regardless, the grammar is fixed as part of the migration, keeping the same encouraging register without the dangling imperative.
- **Haitian Creole `_review` flag** — every `ht/*.json` file carries `"_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production."` verbatim. `appreciations.json` (new file) gets this key **once**, at the top level, in Task 1. Tasks 2–6 append only their own key groups alongside it — **never** a second `_review`.
- **Straight ASCII apostrophes (`'`) in message JSON files** — never curly typographic apostrophes (`'`). This plan's JSON snippets already use straight apostrophes; verify before committing if hand-editing. (Verified during plan-writing: none of the 6 source files contains a U+2019 anywhere, so no curly→straight transcription hazard exists in the `.tsx` code blocks either — every apostrophe you see in this plan's code and JSON is ASCII `'`.)
- **`.one`/`.other` plural keys**, never ICU `{n, plural, ...}` syntax — this repo's next-intl usage requires the CODE to manually select the leaf key, e.g. `t(count > 1 ? 'key.other' : 'key.one', { count })`. Two independent precedents: `carnet-de-notes/ParEvaluationTab.tsx`'s `absentCount.one`/`.other` and `eleves/page.tsx`'s `resultsCount.one`/`.other`. For a rank (where "1" is the singular case, not ">1"), the selector is `rank === 1 ? '.one' : '.other'` — same shape as the shipped `settings/ProfilTab.tsx` (`months === 1 ? '.one' : '.other'`).
- **Rank ordinals go through `.one`/`.other` keys, not a hardcoded `"e"` suffix.** The source hardcodes French ordinals (`${data.rank}e`) in 3 places. They become `rankValue`/`provisionalRank`/`stats.rankValue` key groups: French distinguishes `1er` from `Ne`, Creole uses `e` throughout, and English sidesteps `st/nd/rd/th` morphology entirely by rendering `#N`. Deliberately **not** reusing `eleves/ordinal.ts`'s 4-way CLDR helper — that would create a cross-screen-folder code import this module has no other reason to carry, and `format.ts`'s exported surface is fixed at the three functions the spec mandates.
- **`format.ts` exports exactly three functions** — `fmtAverage`, `mentionClass`, `moyColor` (spec's "Data flow"). Their parameters are widened to accept `null` (`fmtAverage(value: number | null, locale: LocaleKey)`, `mentionClass(mention: Mention | null)`, `moyColor(value: number | null)`) versus the spec's shorthand signatures, because all 9 existing call sites pass nullable values and every existing copy already returns `'—'` (or the muted colour) for `null`. Widening preserves behaviour exactly; narrowing would force a `x == null ? '—' :` ternary at 20+ call sites. This is the only intentional deviation from a spec signature in this plan.
- **`appreciations.mention.*` is deliberately INDEPENDENT from the already-migrated `Eleves.mention`** — 18 duplicated strings (6 labels × 3 locales) accepted as the cost of avoiding cross-module coupling. This was an explicit user decision at design sign-off, matching this repo's stated "one namespace per screen" convention and every prior phase's precedent. Do **not** "fix" it by importing `eleves/mention-label.ts`, and do **not** touch `frontend/src/app/(school)/eleves/**` in any task of this plan.
- **Cross-dependency fence — `OFFLINE_SYNC`** (`@/lib/constants`): consumed by `[studentId]/saisie/page.tsx` (`.queuedToast` only). Also consumed by `pedagogie/emploi-du-temps` (still deferred), `components/layout/topbar/OfflineIndicator.tsx`, and the already-migrated `pedagogie/presences` / `pedagogie/carnet-de-notes` (both fence it the same way). **Do not touch `constants.ts`.** In Task 6 the `import { OFFLINE_SYNC } from '@/lib/constants';` line and the `toast(OFFLINE_SYNC.queuedToast, 'info');` call site must be **byte-identical before and after** — diff your draft against the original before committing.
- **Cross-dependency fence — offline-queue item labels.** `submitOrQueue`'s `label:` strings in `[studentId]/saisie/page.tsx` (`` `Appréciation générale — ${firstName} ${lastName}` `` and `` `Appréciation — ${firstName} ${lastName} (${subjectName})` ``) stay French and untouched. They are persisted queue metadata rendered by the fenced `OfflineIndicator`, and the already-shipped `carnet-de-notes/[evaluationId]/saisie/page.tsx` left its own two equivalents (`` `Notes — ${...}` ``, `` `Validation — ${...}` ``) French for exactly this reason. Follow the shipped precedent.
- **Cross-dependency fence — `exportToCsv()`** (`@/lib/csv-export`): generic, locale-agnostic mechanism. Only the header/status strings `page.tsx` passes *into* it are in scope; the helper itself is untouched.
- **The 3 option-array Selects keep their French **values**, translate only their **labels**.** `comportement`/`investissement`/`assiduite` are persisted free-form strings on the appreciation record and are round-tripped by the API (`d.general?.comportement` is fed straight back into the `<Select value>`). Changing the submitted value from `'Excellent'` to `'EXCELLENT'` would orphan every existing row. So each option becomes a `{ value, key }` pair: `value` stays the exact current French string (byte-identical payload), `key` is the enum-like translation key. Same reasoning CLAUDE.md already records for `SCHOOL_STATUTES` / `ADMIN_CREATE_SCHOOL.schoolTypes` ("literal `<Select>` values submitted to the API").
- **`t` belongs in `useEffect` dependency arrays.** Every effect that calls `t(...)` (all three page-level load effects in this plan) lists `t` in its deps — matching the shipped `carnet-de-notes/page.tsx` (`}, [user, router, t]);` / `}, [classId, subjectValue, termId, t]);`). Do not suppress `react-hooks/exhaustive-deps`.
- **`MENTION_LABEL` is deleted last, not first.** Task 1 *adds* `MENTIONS` to `types.ts` but *keeps* `MENTION_LABEL`, because 4 files still import it; deleting it in Task 1 would leave `pnpm typecheck` red for 5 tasks. Its last consumer migrates in Task 6, which deletes it. Both tasks give the full literal `types.ts` content — Task 1's keeps the map, Task 6's drops it.
- Full gate before every commit: `pnpm typecheck && pnpm lint && pnpm test` (format runs automatically via the pre-commit hook). Per-task steps run the fast pair (`typecheck && lint`); the final task runs the full three.
- Work happens in an isolated git worktree (`.worktrees/i18n-appreciations`, branch `feat/i18n-appreciations`, forked from local `develop` HEAD) — never the main checkout, which another concurrent session may have uncommitted work in. Once in the worktree, **re-anchor every file path to the worktree root**; reusing main-checkout paths mid-task is a previously-caught mistake.

---

### Task 1: Namespace registration + `format.ts` + `types.ts` mention keys

**Files:**
- Create: `frontend/src/messages/fr/appreciations.json`
- Create: `frontend/src/messages/ht/appreciations.json`
- Create: `frontend/src/messages/en/appreciations.json`
- Create: `frontend/src/app/(school)/pedagogie/appreciations/format.ts`
- Modify: `frontend/src/lib/locales.ts` (add `'appreciations'` to `MESSAGE_NAMESPACES`)
- Modify: `frontend/src/i18n/request.ts` (register `appreciations` import + `Appreciations` messages key)
- Modify: `frontend/src/types/next-intl.d.ts` (register `appreciations` type import + `Appreciations` in `Messages`)
- Modify: `frontend/src/app/(school)/pedagogie/appreciations/types.ts` (add `MENTIONS`; keep `MENTION_LABEL` for now)

**Interfaces:**
- Consumes: nothing from other tasks (first task).
- Produces: the `appreciations` namespace with the `mention.{TRES_BIEN,BIEN,ASSEZ_BIEN,PASSABLE,INSUFFISANT,FAIBLE}` key group — Tasks 2, 4, 5 and 6 consume it via `useTranslations('Appreciations.mention')` + `tMention(mention)`.
- Produces: `frontend/src/app/(school)/pedagogie/appreciations/format.ts` exporting `fmtAverage(value: number | null, locale: LocaleKey): string`, `mentionClass(mention: Mention | null): string`, `moyColor(value: number | null): string` — imported by Tasks 2, 3, 4, 5, 6.
- Produces: `MENTIONS: Mention[]` exported from `types.ts` (display order for every mention picker/filter/chart) — consumed by Tasks 2, 4 and 6.

- [ ] **Step 1: Create `frontend/src/messages/fr/appreciations.json`**

```json
{
  "mention": {
    "TRES_BIEN": "Très Bien",
    "BIEN": "Bien",
    "ASSEZ_BIEN": "Assez Bien",
    "PASSABLE": "Passable",
    "INSUFFISANT": "Insuffisant",
    "FAIBLE": "Faible"
  }
}
```

- [ ] **Step 2: Create `frontend/src/messages/en/appreciations.json`**

```json
{
  "mention": {
    "TRES_BIEN": "Excellent",
    "BIEN": "Good",
    "ASSEZ_BIEN": "Fairly good",
    "PASSABLE": "Passing",
    "INSUFFISANT": "Insufficient",
    "FAIBLE": "Weak"
  }
}
```

- [ ] **Step 3: Create `frontend/src/messages/ht/appreciations.json`**

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "mention": {
    "TRES_BIEN": "Trè byen",
    "BIEN": "Byen",
    "ASSEZ_BIEN": "Ase byen",
    "PASSABLE": "Pasab",
    "INSUFFISANT": "Ensifizan",
    "FAIBLE": "Fèb"
  }
}
```

Note: the 6 label strings above are intentionally identical to `Eleves.mention`'s — see the namespace-independence constraint in the header. Do not deduplicate.

- [ ] **Step 4: Register the `appreciations` namespace**

In `frontend/src/lib/locales.ts`, add `'appreciations'` to the end of `MESSAGE_NAMESPACES` (the array currently holds 20 entries ending in `'gradebook'` — re-read the file first in case a concurrent session appended another one, and in that case simply append `'appreciations'` after whatever is last):

```typescript
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
  'enseignants',
  'eleves',
  'configuration',
  'gradebook',
  'appreciations',
] as const;
```

In `frontend/src/i18n/request.ts`, add the destructure entry, the dynamic import, and the messages-object entry (all three after `gradebook`):

```typescript
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
    enseignants,
    eleves,
    configuration,
    gradebook,
    appreciations,
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
    import(`../messages/${locale}/enseignants.json`),
    import(`../messages/${locale}/eleves.json`),
    import(`../messages/${locale}/configuration.json`),
    import(`../messages/${locale}/gradebook.json`),
    import(`../messages/${locale}/appreciations.json`),
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
      Enseignants: enseignants.default,
      Eleves: eleves.default,
      Configuration: configuration.default,
      Gradebook: gradebook.default,
      Appreciations: appreciations.default,
    },
  };
});
```

In `frontend/src/types/next-intl.d.ts`, add the type import after the `gradebook` import line:

```typescript
import type appreciations from '@/messages/fr/appreciations.json';
```

and the `Messages` entry after `Gradebook`:

```typescript
      Gradebook: typeof gradebook;
      Appreciations: typeof appreciations;
```

- [ ] **Step 5: Create `frontend/src/app/(school)/pedagogie/appreciations/format.ts`**

Full content:

```typescript
// Shared formatting/styling helpers for the Appréciations screens.
// Consolidates what used to be 5 byte-identical copies of `fmt()` (one in
// every file of this module), plus 2 copies each of `mentionClass()` and
// `moyColor()`.
//
// `fmtAverage` is the locale-aware replacement for the old
// `n.toFixed(1).replace('.', ',')`: the manual comma forced a French
// decimal separator on English readers (15,3 instead of 15.3). It takes
// the active locale as an explicit parameter rather than reading a hook —
// it is a plain function, and every call site already has `useLocale()` in
// scope.
//
// Pure functions: no JSX, no translation strings of their own. This file
// is a formatting/styling helper, not a message namespace.

import { LOCALE_BCP47, type LocaleKey } from '@/lib/locales';
import type { Mention } from './types';

/** An average out of 20 with one decimal, using the locale's own decimal
 * separator (`15,3` in fr/ht, `15.3` in en). `null` renders as an em dash,
 * exactly like the 5 `fmt()` copies this replaces. */
export function fmtAverage(value: number | null, locale: LocaleKey): string {
  if (value == null) return '—';
  return new Intl.NumberFormat(LOCALE_BCP47[locale], {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

/** Badge colours for a mention chip. */
export function mentionClass(mention: Mention | null): string {
  switch (mention) {
    case 'TRES_BIEN':
      return 'bg-success text-success-foreground';
    case 'BIEN':
      return 'bg-info text-info-foreground';
    case 'ASSEZ_BIEN':
      return 'bg-warning text-warning-foreground';
    case 'PASSABLE':
      return 'bg-muted text-muted-foreground';
    case 'INSUFFISANT':
    case 'FAIBLE':
      return 'bg-destructive text-destructive-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

/** Text colour for an average out of 20. */
export function moyColor(value: number | null): string {
  if (value == null) return 'text-muted-foreground';
  if (value < 8) return 'text-destructive-foreground';
  if (value < 12) return 'text-warning-foreground';
  if (value < 16) return 'text-info-foreground';
  return 'text-success-foreground';
}
```

- [ ] **Step 6: Rewrite `frontend/src/app/(school)/pedagogie/appreciations/types.ts`**

Full replacement. **`MENTION_LABEL` is deliberately kept in this task** — `StatistiquesTab.tsx`, `page.tsx`, `[studentId]/page.tsx` and `[studentId]/saisie/page.tsx` all still import it and only stop in Tasks 2, 4, 5 and 6 respectively; Task 6 deletes it. The new `MENTIONS` array is what the migrated files iterate.

```typescript
export type Mention = 'TRES_BIEN' | 'BIEN' | 'ASSEZ_BIEN' | 'PASSABLE' | 'INSUFFISANT' | 'FAIBLE';
export type AppreciationStatus = 'NONE' | 'DRAFT' | 'PUBLISHED';

/** Display order for every mention picker, filter and chart in this module.
 * The labels themselves live in the `appreciations.mention.*` message
 * namespace — read them with `useTranslations('Appreciations.mention')`
 * and `t(mention)`. */
export const MENTIONS: Mention[] = [
  'TRES_BIEN',
  'BIEN',
  'ASSEZ_BIEN',
  'PASSABLE',
  'INSUFFISANT',
  'FAIBLE',
];

/** @deprecated Being replaced by `MENTIONS` + the `appreciations.mention.*`
 * message namespace. Still imported by the files this module's i18n
 * migration has not reached yet; deleted once the last one migrates. */
export const MENTION_LABEL: Record<Mention, string> = {
  TRES_BIEN: 'Très Bien',
  BIEN: 'Bien',
  ASSEZ_BIEN: 'Assez Bien',
  PASSABLE: 'Passable',
  INSUFFISANT: 'Insuffisant',
  FAIBLE: 'Faible',
};

export interface TermOption {
  id: string;
  label: string;
  order: number;
}

export interface ClassOption {
  id: string;
  name: string;
}

export interface ListStudentRow {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  average: number | null;
  rank: number | null;
  mention: Mention | null;
  text: string | null;
  status: AppreciationStatus;
  authorName: string | null;
}

export interface SubjectSummaryRow {
  classSubjectId: string;
  subjectId: string;
  subjectName: string;
  teacherName: string | null;
  coefficient: number | null;
  classAverage: number | null;
  saisieCount: number;
  totalCount: number;
}

export interface AppreciationsListData {
  classId: string;
  className: string;
  homeroomTeacherName: string | null;
  terms: TermOption[];
  resolvedTermId: string | null;
  students: ListStudentRow[];
  subjects: SubjectSummaryRow[];
  totalCount: number;
  saisieCount: number;
  positiveCount: number;
  alertCount: number;
}

export interface GeneralAppreciation {
  mention: Mention | null;
  text: string | null;
  comportement: string | null;
  investissement: string | null;
  assiduite: string | null;
  status: AppreciationStatus;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectAppreciationRow {
  classSubjectId: string;
  subjectId: string;
  subjectName: string;
  coefficient: number | null;
  teacherName: string | null;
  average: number | null;
  mention: Mention | null;
  text: string | null;
  status: AppreciationStatus;
}

export interface StudentAppreciationData {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  classId: string;
  className: string;
  homeroomTeacherName: string | null;
  terms: TermOption[];
  resolvedTermId: string | null;
  studentIndex: number | null;
  classSize: number;
  prevStudentId: string | null;
  nextStudentId: string | null;
  overallAverage: number | null;
  classAverage: number | null;
  rank: number | null;
  rankedCount: number;
  general: GeneralAppreciation | null;
  subjects: SubjectAppreciationRow[];
}
```

- [ ] **Step 7: Typecheck, lint and run the registry test**

Run: `cd frontend && pnpm typecheck && pnpm lint && pnpm exec vitest run src/lib/locales.test.ts`
Expected: all clean. `locales.test.ts` is the tripwire that proves the namespace is registered consistently in all four places (`MESSAGE_NAMESPACES`, `src/messages/{fr,ht,en}/`, `i18n/request.ts`, `types/next-intl.d.ts`) and that the 3 locales' key sets match (`_review` is excluded from the comparison).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/messages/fr/appreciations.json frontend/src/messages/ht/appreciations.json frontend/src/messages/en/appreciations.json frontend/src/lib/locales.ts frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts "frontend/src/app/(school)/pedagogie/appreciations/format.ts" "frontend/src/app/(school)/pedagogie/appreciations/types.ts"
git commit -m "feat(i18n): appreciations namespace + mention keys + shared format helper"
```

---

### Task 2: `StatistiquesTab.tsx`

**Files:**
- Modify: `frontend/src/messages/{fr,ht,en}/appreciations.json` (add `statistiques.*`)
- Modify: `frontend/src/app/(school)/pedagogie/appreciations/StatistiquesTab.tsx`

**Interfaces:**
- Consumes: `Appreciations.mention` key group (Task 1) for the "most frequent mention" KPI value and the mention-distribution chart labels; `fmtAverage` from `./format` (Task 1); `MENTIONS` from `./types` (Task 1).
- Produces: nothing consumed by later tasks.

Note: this file has **no** `mentionClass()`/`moyColor()` copy of its own — it only ever had `fmt()`. Import `fmtAverage` **only**; adding an unused `mentionClass` import would fail `pnpm lint`.

- [ ] **Step 1: Append `statistiques` to `frontend/src/messages/fr/appreciations.json`**

Add as a new top-level sibling of `mention` (before the closing `}`):

```json
  "statistiques": {
    "emptyState": "Aucune donnée pour cette classe.",
    "completionRate": "Taux de complétion",
    "completionRateSub": {
      "one": "{count} sur {total} élève",
      "other": "{count} sur {total} élèves"
    },
    "classAverage": "Moyenne de classe",
    "classAverageSub": "toutes appréciations confondues",
    "topMention": "Mention la plus fréquente",
    "topMentionSub": {
      "one": "{count} élève",
      "other": "{count} élèves"
    },
    "noMention": "Aucune mention saisie",
    "toWatch": "À surveiller",
    "toWatchSub": "mentions insuffisant",
    "mentionChartTitle": "Répartition des mentions",
    "mentionChartSub": "Nombre d'élèves par mention, sur les appréciations saisies.",
    "mentionChartAriaLabel": "Répartition des élèves par mention",
    "averageChartTitle": "Répartition des moyennes",
    "averageChartSub": "Moyennes générales des élèves, sur 20.",
    "averageChartAriaLabel": "Répartition des moyennes générales",
    "completionChartTitle": "Complétion par matière",
    "completionChartSub": "Pourcentage d'appréciations saisies par matière.",
    "completionChartEmpty": "Aucune matière configurée pour cette classe.",
    "completionChartAriaLabel": "Pourcentage d'appréciations saisies par matière"
  }
```

- [ ] **Step 2: Append `statistiques` to `frontend/src/messages/en/appreciations.json`**

```json
  "statistiques": {
    "emptyState": "No data for this class.",
    "completionRate": "Completion rate",
    "completionRateSub": {
      "one": "{count} of {total} student",
      "other": "{count} of {total} students"
    },
    "classAverage": "Class average",
    "classAverageSub": "across all appreciations",
    "topMention": "Most frequent mention",
    "topMentionSub": {
      "one": "{count} student",
      "other": "{count} students"
    },
    "noMention": "No mention recorded",
    "toWatch": "To watch",
    "toWatchSub": "insufficient mentions",
    "mentionChartTitle": "Mention distribution",
    "mentionChartSub": "Number of students per mention, across recorded appreciations.",
    "mentionChartAriaLabel": "Distribution of students by mention",
    "averageChartTitle": "Average distribution",
    "averageChartSub": "Students' general averages, out of 20.",
    "averageChartAriaLabel": "Distribution of general averages",
    "completionChartTitle": "Completion by subject",
    "completionChartSub": "Percentage of appreciations recorded per subject.",
    "completionChartEmpty": "No subject configured for this class.",
    "completionChartAriaLabel": "Percentage of appreciations recorded per subject"
  }
```

- [ ] **Step 3: Append `statistiques` to `frontend/src/messages/ht/appreciations.json`**

```json
  "statistiques": {
    "emptyState": "Pa gen done pou klas sa a.",
    "completionRate": "To konpletasyon",
    "completionRateSub": {
      "one": "{count} sou {total} elèv",
      "other": "{count} sou {total} elèv"
    },
    "classAverage": "Mwayèn klas la",
    "classAverageSub": "tout apresyasyon yo ansanm",
    "topMention": "Mansyon ki pi frekan",
    "topMentionSub": {
      "one": "{count} elèv",
      "other": "{count} elèv"
    },
    "noMention": "Pa gen mansyon antre",
    "toWatch": "Pou siveye",
    "toWatchSub": "mansyon ensifizan",
    "mentionChartTitle": "Distribisyon mansyon yo",
    "mentionChartSub": "Kantite elèv pa mansyon, sou apresyasyon ki antre yo.",
    "mentionChartAriaLabel": "Distribisyon elèv yo pa mansyon",
    "averageChartTitle": "Distribisyon mwayèn yo",
    "averageChartSub": "Mwayèn jeneral elèv yo, sou 20.",
    "averageChartAriaLabel": "Distribisyon mwayèn jeneral yo",
    "completionChartTitle": "Konpletasyon pa matyè",
    "completionChartSub": "Pousantaj apresyasyon ki antre pa matyè.",
    "completionChartEmpty": "Pa gen matyè konfigire pou klas sa a.",
    "completionChartAriaLabel": "Pousantaj apresyasyon ki antre pa matyè"
  }
```

(Creole nouns do not inflect for number, so `.one` and `.other` carry the same string — the key pair still has to exist in all 3 locales for `locales.test.ts` to pass.)

- [ ] **Step 4: Rewrite `StatistiquesTab.tsx`**

Full replacement:

```tsx
'use client';

// "Statistiques" tab — was a toast stub ("bientôt disponible"). Everything
// here is derived client-side from the same `data` the "Par élève" and
// "Par matière" tabs already have in memory (no new API calls): a mention
// distribution, a general-average histogram, and a per-subject completion
// chart. Same derivation pattern as carnet-de-notes/StatistiquesTab.tsx.
//
// The mention chart's LABELS are translated, so they are built outside the
// `useMemo` (which stays a pure function of `data`) — 6 entries, cheap
// enough that memoizing them would only add a translator dependency.

import { useMemo } from 'react';
import { Award, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { BarChart, type BarChartPoint } from '@/components/admin/charts/BarChart';
import { fmtAverage } from './format';
import { MENTIONS, type AppreciationsListData, type Mention } from './types';

const AVG_BUCKETS = [
  { label: '0-4', min: 0, max: 4 },
  { label: '4-8', min: 4, max: 8 },
  { label: '8-12', min: 8, max: 12 },
  { label: '12-16', min: 12, max: 16 },
  { label: '16-20', min: 16, max: 20.01 },
];

export function StatistiquesTab({ data }: { data: AppreciationsListData }) {
  const t = useTranslations('Appreciations.statistiques');
  const tMention = useTranslations('Appreciations.mention');
  const locale = useLocale();

  const {
    mentionCounts,
    averageDistribution,
    subjectCompletion,
    completionRate,
    classAverage,
    topMention,
  } = useMemo(() => {
    const mentionCounts = new Map<Mention, number>();
    for (const s of data.students) {
      if (!s.mention) continue;
      mentionCounts.set(s.mention, (mentionCounts.get(s.mention) ?? 0) + 1);
    }

    const averages = data.students.map((s) => s.average).filter((a): a is number => a != null);
    const averageDistribution: BarChartPoint[] = AVG_BUCKETS.map((b) => ({
      label: b.label,
      value: averages.filter((a) => a >= b.min && a < b.max).length,
    }));
    const classAverage =
      averages.length > 0
        ? Math.round((averages.reduce((s, v) => s + v, 0) / averages.length) * 10) / 10
        : null;

    const subjectCompletion: BarChartPoint[] = data.subjects.map((s) => ({
      label: s.subjectName,
      value: s.totalCount > 0 ? Math.round((s.saisieCount / s.totalCount) * 100) : 0,
    }));

    const completionRate =
      data.totalCount > 0 ? Math.round((data.saisieCount / data.totalCount) * 100) : null;

    let topMention: { mention: Mention; count: number } | null = null;
    for (const [mention, count] of mentionCounts) {
      if (!topMention || count > topMention.count) topMention = { mention, count };
    }

    return {
      mentionCounts,
      averageDistribution,
      subjectCompletion,
      completionRate,
      classAverage,
      topMention,
    };
  }, [data]);

  const mentionDistribution: BarChartPoint[] = MENTIONS.map((m) => ({
    label: tMention(m),
    value: mentionCounts.get(m) ?? 0,
  }));

  if (data.totalCount === 0) {
    return (
      <Card className="items-center gap-2 p-10 text-center">
        <p className="text-sm text-muted-foreground">{t('emptyState')}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={CheckCircle2}
          tone="success"
          label={t('completionRate')}
          value={completionRate != null ? `${completionRate}%` : '—'}
          sub={t(
            data.totalCount > 1 ? 'completionRateSub.other' : 'completionRateSub.one',
            { count: data.saisieCount, total: data.totalCount },
          )}
        />
        <StatTile
          icon={TrendingUp}
          tone="blue"
          label={t('classAverage')}
          value={fmtAverage(classAverage, locale)}
          sub={t('classAverageSub')}
        />
        <StatTile
          icon={Award}
          tone="success"
          label={t('topMention')}
          value={topMention ? tMention(topMention.mention) : '—'}
          sub={
            topMention
              ? t(topMention.count > 1 ? 'topMentionSub.other' : 'topMentionSub.one', {
                  count: topMention.count,
                })
              : t('noMention')
          }
        />
        <StatTile
          icon={AlertTriangle}
          tone="destructive"
          label={t('toWatch')}
          value={String(data.alertCount)}
          sub={t('toWatchSub')}
        />
      </div>

      <Card className="gap-3 p-4">
        <div>
          <div className="text-caption font-semibold text-foreground">{t('mentionChartTitle')}</div>
          <p className="text-2xs text-muted-foreground">{t('mentionChartSub')}</p>
        </div>
        <BarChart
          data={mentionDistribution}
          formatValue={(v) => String(Math.round(v))}
          ariaLabel={t('mentionChartAriaLabel')}
        />
      </Card>

      <Card className="gap-3 p-4">
        <div>
          <div className="text-caption font-semibold text-foreground">{t('averageChartTitle')}</div>
          <p className="text-2xs text-muted-foreground">{t('averageChartSub')}</p>
        </div>
        <BarChart
          data={averageDistribution}
          formatValue={(v) => String(Math.round(v))}
          ariaLabel={t('averageChartAriaLabel')}
        />
      </Card>

      <Card className="gap-3 p-4">
        <div>
          <div className="text-caption font-semibold text-foreground">
            {t('completionChartTitle')}
          </div>
          <p className="text-2xs text-muted-foreground">{t('completionChartSub')}</p>
        </div>
        {subjectCompletion.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {t('completionChartEmpty')}
          </p>
        ) : (
          <BarChart
            data={subjectCompletion}
            formatValue={(v) => `${Math.round(v)}%`}
            ariaLabel={t('completionChartAriaLabel')}
          />
        )}
      </Card>
    </div>
  );
}

function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: typeof Award;
  tone: 'success' | 'warning' | 'blue' | 'destructive';
  label: string;
  value: string;
  sub: string;
}) {
  const iconBg: Record<string, string> = {
    success: 'bg-success text-success-foreground',
    warning: 'bg-warning text-warning-foreground',
    blue: 'bg-info text-info-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
  };
  return (
    <Card className="flex-row items-center gap-3 p-3.5">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${iconBg[tone]}`}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-2xs font-medium text-muted-foreground">{label}</div>
        <div className="text-lg font-bold text-foreground">{value}</div>
        <div className="truncate text-2xs text-muted-foreground">{sub}</div>
      </div>
    </Card>
  );
}
```

Behaviour notes for this rewrite (all deliberate, all already reflected in the code block above):
- The old `fmt()` local function is gone; `fmtAverage(classAverage, locale)` replaces its single call site.
- `Object.keys(MENTION_LABEL) as Mention[]` is replaced by the explicit `MENTIONS` array — same six values, same order, no `as` cast needed.
- The `useMemo` now returns `mentionCounts` (the raw `Map`) instead of a pre-built `mentionDistribution`, so the memo stays a pure function of `data` and `[data]` remains its complete dependency list.
- The "taux de complétion" sub-line's plural agrees with `data.totalCount` (the noun "élèves" belongs to the *total*, not the recorded count), hence `data.totalCount > 1 ? ... : ...`.

- [ ] **Step 5: Typecheck and lint**

Run: `cd frontend && pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/messages/fr/appreciations.json frontend/src/messages/ht/appreciations.json frontend/src/messages/en/appreciations.json "frontend/src/app/(school)/pedagogie/appreciations/StatistiquesTab.tsx"
git commit -m "feat(i18n): translate appreciations StatistiquesTab"
```

---

### Task 3: `ParMatiereTab.tsx`

**Files:**
- Modify: `frontend/src/messages/{fr,ht,en}/appreciations.json` (add `parMatiere.*`)
- Modify: `frontend/src/app/(school)/pedagogie/appreciations/ParMatiereTab.tsx`

**Interfaces:**
- Consumes: `fmtAverage` and `moyColor` from `./format` (Task 1). Does **not** consume `Appreciations.mention` — this tab shows no mention chips.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Append `parMatiere` to `frontend/src/messages/fr/appreciations.json`**

Add as a new top-level sibling of `statistiques` (before the closing `}`):

```json
  "parMatiere": {
    "emptyState": "Aucune matière configurée pour cette classe.",
    "colSubject": "Matière",
    "colTeacher": "Enseignant",
    "colCoefficient": "Coeff.",
    "colClassAverage": "Moyenne classe",
    "colRecorded": "Appréciations saisies",
    "colStatus": "Statut",
    "statusComplete": "Complet",
    "statusInProgress": "En cours",
    "statusTodo": "À faire"
  }
```

- [ ] **Step 2: Append `parMatiere` to `frontend/src/messages/en/appreciations.json`**

```json
  "parMatiere": {
    "emptyState": "No subject configured for this class.",
    "colSubject": "Subject",
    "colTeacher": "Teacher",
    "colCoefficient": "Coeff.",
    "colClassAverage": "Class average",
    "colRecorded": "Appreciations recorded",
    "colStatus": "Status",
    "statusComplete": "Complete",
    "statusInProgress": "In progress",
    "statusTodo": "To do"
  }
```

- [ ] **Step 3: Append `parMatiere` to `frontend/src/messages/ht/appreciations.json`**

```json
  "parMatiere": {
    "emptyState": "Pa gen matyè konfigire pou klas sa a.",
    "colSubject": "Matyè",
    "colTeacher": "Pwofesè",
    "colCoefficient": "Koef.",
    "colClassAverage": "Mwayèn klas",
    "colRecorded": "Apresyasyon ki antre",
    "colStatus": "Estati",
    "statusComplete": "Konplè",
    "statusInProgress": "An kou",
    "statusTodo": "Pou fè"
  }
```

- [ ] **Step 4: Rewrite `ParMatiereTab.tsx`**

Full replacement:

```tsx
'use client';

// "Par matière" tab — was a toast stub ("bientôt disponible"). Pivots the
// appreciations list from one row per student to one row per matière
// enseignée dans la classe, so a homeroom teacher / admin can see at a
// glance which subject teachers still owe their per-subject appreciation.
// `data.subjects` is computed server-side (see the classes/[id]/appreciations
// route) — no separate fetch here.

import { BookOpen } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { fmtAverage, moyColor } from './format';
import type { AppreciationsListData } from './types';

export function ParMatiereTab({ data }: { data: AppreciationsListData }) {
  const t = useTranslations('Appreciations.parMatiere');
  const locale = useLocale();

  if (data.subjects.length === 0) {
    return (
      <Card className="items-center gap-2 p-10 text-center">
        <BookOpen size={28} className="text-muted-foreground" />
        <p className="max-w-sm text-sm text-muted-foreground">{t('emptyState')}</p>
      </Card>
    );
  }

  return (
    <Card className="gap-0 overflow-visible">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t('colSubject')}
              </th>
              <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t('colTeacher')}
              </th>
              <th className="px-3 py-2.5 text-center text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t('colCoefficient')}
              </th>
              <th className="px-3 py-2.5 text-center text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t('colClassAverage')}
              </th>
              <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t('colRecorded')}
              </th>
              <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t('colStatus')}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.subjects.map((s) => {
              const complete = s.totalCount > 0 && s.saisieCount === s.totalCount;
              const started = s.saisieCount > 0 && !complete;
              return (
                <tr key={s.classSubjectId} className="border-b border-border last:border-b-0">
                  <td className="px-3.5 py-2.5">
                    <span className="text-caption font-semibold text-foreground">
                      {s.subjectName}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-medium text-foreground">
                      {s.teacherName ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="text-xs text-muted-foreground">{s.coefficient ?? '—'}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-sm font-bold ${moyColor(s.classAverage)}`}>
                      {fmtAverage(s.classAverage, locale)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-medium text-foreground">
                      {s.saisieCount} / {s.totalCount}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {complete ? (
                      <span className="inline-flex items-center rounded-full bg-success px-2 py-0.5 text-2xs font-semibold text-success-foreground">
                        {t('statusComplete')}
                      </span>
                    ) : started ? (
                      <span className="inline-flex items-center rounded-full bg-warning px-2 py-0.5 text-2xs font-semibold text-warning-foreground">
                        {t('statusInProgress')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-2xs font-semibold text-muted-foreground">
                        {t('statusTodo')}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
```

Behaviour notes: the local `fmt()` and `moyColor()` copies are deleted (both now come from `./format`), and `moyColor`'s parameter was named `avg` locally — the shared one names it `value` but is otherwise byte-identical logic, so the rendered colours are unchanged.

- [ ] **Step 5: Typecheck and lint**

Run: `cd frontend && pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/messages/fr/appreciations.json frontend/src/messages/ht/appreciations.json frontend/src/messages/en/appreciations.json "frontend/src/app/(school)/pedagogie/appreciations/ParMatiereTab.tsx"
git commit -m "feat(i18n): translate appreciations ParMatiereTab"
```

---

### Task 4: `page.tsx` (class-wide appreciations list)

**Files:**
- Modify: `frontend/src/messages/{fr,ht,en}/appreciations.json` (add `list.*`)
- Modify: `frontend/src/app/(school)/pedagogie/appreciations/page.tsx`

**Interfaces:**
- Consumes: `Appreciations.mention` key group + `MENTIONS` (Task 1) for the mention filter, the table's mention chips and the CSV's mention column; `fmtAverage`, `mentionClass`, `moyColor` from `./format` (Task 1).
- Produces: nothing consumed by later tasks.

This task also fixes the module's first tutoiement violation (`"Configure d'abord…"` → `"Configurez d'abord…"`, baked into `list.noClasses` below).

- [ ] **Step 1: Append `list` to `frontend/src/messages/fr/appreciations.json`**

Add as a new top-level sibling of `parMatiere` (before the closing `}`):

```json
  "list": {
    "title": "Appréciations",
    "subtitle": "Saisie et gestion des appréciations — Année scolaire {year}",
    "export": "Exporter",
    "newEntry": "Saisir appréciations",
    "loadError": "Impossible de charger les appréciations.",
    "noClasses": "Configurez d'abord des classes et des élèves avant de saisir des appréciations.",
    "deleteConfirm": "Supprimer l'appréciation générale de {name} ?",
    "deletedToast": "Appréciation supprimée.",
    "deleteErrorToast": "Erreur lors de la suppression.",
    "menuView": "Voir l'appréciation",
    "menuEdit": "Modifier l'appréciation",
    "menuDelete": "Supprimer l'appréciation",
    "summary": {
      "totalStudents": "Total élèves",
      "totalStudentsSub": "{className} — {term}",
      "recorded": "Appréciations saisies",
      "recordedSub": {
        "one": "sur {count} élève",
        "other": "sur {count} élèves"
      },
      "pending": "En attente",
      "pendingSub": "à compléter",
      "positive": "Très bien / Bien",
      "positiveSub": "mentions positives",
      "alert": "À surveiller",
      "alertSub": "mentions insuffisant"
    },
    "searchPlaceholder": "Rechercher un élève...",
    "allMentions": "Toutes mentions",
    "resultsCount": {
      "one": "{count} élève",
      "other": "{count} élèves"
    },
    "tabs": {
      "byStudent": "Par élève",
      "bySubject": "Par matière",
      "statistics": "Statistiques",
      "pending": "En attente"
    },
    "noStudents": "Aucun élève inscrit dans cette classe.",
    "table": {
      "student": "Élève",
      "average": "Moyenne",
      "mention": "Mention",
      "generalAppreciation": "Appréciation générale",
      "homeroomTeacher": "Enseignant principal",
      "status": "Statut"
    },
    "notProvided": "Non renseigné",
    "noAppreciation": "Aucune appréciation saisie pour cet élève.",
    "statusRecorded": "Saisie",
    "statusPending": "En attente",
    "paginationRange": "Affichage de {from} à {to} sur {total} élèves —",
    "paginationRecorded": "{count} appréciations saisies",
    "paginationPending": ", {count} en attente",
    "csv": {
      "filenamePrefix": "appreciations",
      "colStudent": "Élève",
      "colNumber": "N°",
      "colAverage": "Moyenne",
      "colMention": "Mention",
      "colGeneralAppreciation": "Appréciation générale",
      "colHomeroomTeacher": "Enseignant principal",
      "colStatus": "Statut",
      "statusRecorded": "Saisie",
      "statusPending": "En attente"
    }
  }
```

- [ ] **Step 2: Append `list` to `frontend/src/messages/en/appreciations.json`**

```json
  "list": {
    "title": "Appreciations",
    "subtitle": "Recording and managing appreciations — School year {year}",
    "export": "Export",
    "newEntry": "Enter appreciations",
    "loadError": "Unable to load the appreciations.",
    "noClasses": "Set up classes and students first, before recording appreciations.",
    "deleteConfirm": "Delete {name}'s general appreciation?",
    "deletedToast": "Appreciation deleted.",
    "deleteErrorToast": "Deletion failed.",
    "menuView": "View appreciation",
    "menuEdit": "Edit appreciation",
    "menuDelete": "Delete appreciation",
    "summary": {
      "totalStudents": "Total students",
      "totalStudentsSub": "{className} — {term}",
      "recorded": "Appreciations recorded",
      "recordedSub": {
        "one": "of {count} student",
        "other": "of {count} students"
      },
      "pending": "Pending",
      "pendingSub": "to complete",
      "positive": "Excellent / Good",
      "positiveSub": "positive mentions",
      "alert": "To watch",
      "alertSub": "insufficient mentions"
    },
    "searchPlaceholder": "Search for a student...",
    "allMentions": "All mentions",
    "resultsCount": {
      "one": "{count} student",
      "other": "{count} students"
    },
    "tabs": {
      "byStudent": "By student",
      "bySubject": "By subject",
      "statistics": "Statistics",
      "pending": "Pending"
    },
    "noStudents": "No student enrolled in this class.",
    "table": {
      "student": "Student",
      "average": "Average",
      "mention": "Mention",
      "generalAppreciation": "General appreciation",
      "homeroomTeacher": "Homeroom teacher",
      "status": "Status"
    },
    "notProvided": "Not provided",
    "noAppreciation": "No appreciation recorded for this student.",
    "statusRecorded": "Recorded",
    "statusPending": "Pending",
    "paginationRange": "Showing {from} to {to} of {total} students —",
    "paginationRecorded": "{count} appreciations recorded",
    "paginationPending": ", {count} pending",
    "csv": {
      "filenamePrefix": "appreciations",
      "colStudent": "Student",
      "colNumber": "No.",
      "colAverage": "Average",
      "colMention": "Mention",
      "colGeneralAppreciation": "General appreciation",
      "colHomeroomTeacher": "Homeroom teacher",
      "colStatus": "Status",
      "statusRecorded": "Recorded",
      "statusPending": "Pending"
    }
  }
```

- [ ] **Step 3: Append `list` to `frontend/src/messages/ht/appreciations.json`**

```json
  "list": {
    "title": "Apresyasyon",
    "subtitle": "Antre ak jesyon apresyasyon yo — Ane eskolè {year}",
    "export": "Ekspòte",
    "newEntry": "Antre apresyasyon",
    "loadError": "Nou pa t kapab chaje apresyasyon yo.",
    "noClasses": "Konfigire klas ak elèv anvan ou antre apresyasyon.",
    "deleteConfirm": "Efase apresyasyon jeneral {name} an?",
    "deletedToast": "Apresyasyon efase.",
    "deleteErrorToast": "Erè pandan efasman an.",
    "menuView": "Wè apresyasyon an",
    "menuEdit": "Modifye apresyasyon an",
    "menuDelete": "Efase apresyasyon an",
    "summary": {
      "totalStudents": "Total elèv",
      "totalStudentsSub": "{className} — {term}",
      "recorded": "Apresyasyon ki antre",
      "recordedSub": {
        "one": "sou {count} elèv",
        "other": "sou {count} elèv"
      },
      "pending": "An atant",
      "pendingSub": "pou konplete",
      "positive": "Trè byen / Byen",
      "positiveSub": "mansyon pozitif",
      "alert": "Pou siveye",
      "alertSub": "mansyon ensifizan"
    },
    "searchPlaceholder": "Chèche yon elèv...",
    "allMentions": "Tout mansyon",
    "resultsCount": {
      "one": "{count} elèv",
      "other": "{count} elèv"
    },
    "tabs": {
      "byStudent": "Pa elèv",
      "bySubject": "Pa matyè",
      "statistics": "Estatistik",
      "pending": "An atant"
    },
    "noStudents": "Pa gen elèv enskri nan klas sa a.",
    "table": {
      "student": "Elèv",
      "average": "Mwayèn",
      "mention": "Mansyon",
      "generalAppreciation": "Apresyasyon jeneral",
      "homeroomTeacher": "Pwofesè prensipal",
      "status": "Estati"
    },
    "notProvided": "Pa ranpli",
    "noAppreciation": "Pa gen apresyasyon antre pou elèv sa a.",
    "statusRecorded": "Antre",
    "statusPending": "An atant",
    "paginationRange": "N ap montre {from} rive {to} sou {total} elèv —",
    "paginationRecorded": "{count} apresyasyon ki antre",
    "paginationPending": ", {count} an atant",
    "csv": {
      "filenamePrefix": "apresyasyon",
      "colStudent": "Elèv",
      "colNumber": "N°",
      "colAverage": "Mwayèn",
      "colMention": "Mansyon",
      "colGeneralAppreciation": "Apresyasyon jeneral",
      "colHomeroomTeacher": "Pwofesè prensipal",
      "colStatus": "Estati",
      "statusRecorded": "Antre",
      "statusPending": "An atant"
    }
  }
```

- [ ] **Step 4: Rewrite `page.tsx`**

Full replacement:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Star,
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  AlertTriangle,
  Plus,
  Download,
  Eye,
  Pencil,
  Trash2,
  Table2,
  BookOpen,
  BarChart2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect } from '@/components/ui/FilterSelect';
import { SelectItem } from '@/components/ui/Select';
import { Avatar } from '@/components/ui/Avatar';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import { Skeleton } from '@/components/ui/Skeleton';
import { PageNumbers } from '@/components/ui/Pager';
import { exportToCsv } from '@/lib/csv-export';
import { LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';
import { fmtAverage, mentionClass, moyColor } from './format';
import { MENTIONS, type AppreciationsListData, type TermOption } from './types';
// Code-split: only mounted once the user switches to that tab (default is
// "Par élève") — same reasoning as the StudentFormModal split in eleves/page.tsx.
const ParMatiereTab = dynamic(() => import('./ParMatiereTab').then((m) => m.ParMatiereTab), {
  ssr: false,
});
const StatistiquesTab = dynamic(() => import('./StatistiquesTab').then((m) => m.StatistiquesTab), {
  ssr: false,
});

const PAGE_SIZE = 20;

export default function AppreciationsListPage() {
  const t = useTranslations('Appreciations.list');
  const tMention = useTranslations('Appreciations.mention');
  const locale = useLocale();
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  // Class picker = the ACTIVE year's classes (`/api/school/classes`), not
  // the classes that happen to have subject affectations — a brand-new class
  // must show up here immediately, and archived-year classes never.
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [classId, setClassId] = useState('');
  const [termId, setTermId] = useState('');
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [data, setData] = useState<AppreciationsListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mentionFilter, setMentionFilter] = useState('');
  const [tab, setTab] = useState<'eleve' | 'matiere' | 'stats' | 'attente'>('eleve');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!user) return;
    api<{ classes: Array<{ id: string; name: string }> }>('/api/school/classes')
      .then((res) => {
        setClasses(res.classes.map((c) => ({ id: c.id, name: c.name })));
        if (res.classes[0]) setClassId(res.classes[0].id);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        setError(t('loadError'));
      });
  }, [user, router, t]);

  useEffect(() => {
    if (!classId) return;
    const qs = termId ? `?termId=${termId}` : '';
    api<AppreciationsListData>(`/api/school/classes/${classId}/appreciations${qs}`)
      .then((d) => {
        setData(d);
        setTerms(d.terms);
        setTermId(d.resolvedTermId ?? '');
        setPage(1);
      })
      .catch(() => setError(t('loadError')));
  }, [classId, termId, t]);

  const filteredStudents = useMemo(() => {
    if (!data) return [];
    let rows = data.students;
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q));
    if (mentionFilter) rows = rows.filter((s) => s.mention === mentionFilter);
    if (tab === 'attente') rows = rows.filter((s) => s.status !== 'PUBLISHED');
    return rows;
  }, [data, search, mentionFilter, tab]);
  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const pageStudents = filteredStudents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const enAttenteCount = data ? data.students.filter((s) => s.status !== 'PUBLISHED').length : 0;

  async function deleteAppreciation(studentId: string, name: string) {
    if (!(await confirm({ message: t('deleteConfirm', { name }), danger: true }))) return;
    try {
      await api(`/api/school/students/${studentId}/appreciations?termId=${termId}`, {
        method: 'DELETE',
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              students: prev.students.map((s) =>
                s.studentId === studentId
                  ? { ...s, mention: null, text: null, status: 'NONE', authorName: null }
                  : s,
              ),
            }
          : prev,
      );
      toast(t('deletedToast'), 'success');
    } catch {
      toast(t('deleteErrorToast'), 'error');
    }
  }

  function menuItemsFor(s: AppreciationsListData['students'][number]): ActionMenuItem[] {
    return [
      {
        label: t('menuView'),
        icon: <Eye size={14} />,
        onClick: () => router.push(`/pedagogie/appreciations/${s.studentId}?termId=${termId}`),
      },
      {
        label: t('menuEdit'),
        icon: <Pencil size={14} />,
        onClick: () =>
          router.push(`/pedagogie/appreciations/${s.studentId}/saisie?termId=${termId}`),
      },
      {
        label: t('menuDelete'),
        icon: <Trash2 size={14} />,
        tone: 'danger',
        divider: true,
        onClick: () => deleteAppreciation(s.studentId, `${s.firstName} ${s.lastName}`),
      },
    ];
  }

  function onExport() {
    if (!data) return;
    exportToCsv(
      `${t('csv.filenamePrefix')}-${data.className}.csv`.toLowerCase().replace(/\s+/g, '-'),
      [
        t('csv.colStudent'),
        t('csv.colNumber'),
        t('csv.colAverage'),
        t('csv.colMention'),
        t('csv.colGeneralAppreciation'),
        t('csv.colHomeroomTeacher'),
        t('csv.colStatus'),
      ],
      filteredStudents.map((s) => [
        `${s.firstName} ${s.lastName}`,
        s.studentNumber,
        s.average ?? '',
        s.mention ? tMention(s.mention) : '',
        s.text ?? '',
        data.homeroomTeacherName ?? '',
        s.status === 'PUBLISHED' ? t('csv.statusRecorded') : t('csv.statusPending'),
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
    <div className={`${LIST_PAGE} gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('subtitle', { year: terms[0]?.label ?? '' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="w-fit border border-border" onClick={onExport}>
            <Download size={14} />
            {t('export')}
          </Button>
          <Button
            className="w-fit"
            disabled={!data || data.students.length === 0}
            onClick={() =>
              data?.students[0] &&
              router.push(
                `/pedagogie/appreciations/${data.students[0].studentId}/saisie?termId=${termId}`,
              )
            }
          >
            <Plus size={14} />
            {t('newEntry')}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {classes.length === 0 ? (
        <Card className="items-center gap-2 p-10 text-center">
          <Star size={28} className="text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">{t('noClasses')}</p>
        </Card>
      ) : (
        <>
          {data && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <SummaryCard
                icon={Users}
                tone="secondary"
                label={t('summary.totalStudents')}
                value={`${data.totalCount}`}
                sub={t('summary.totalStudentsSub', {
                  className: data.className,
                  term: terms[0]?.label ?? '',
                })}
              />
              <SummaryCard
                icon={CheckCircle2}
                tone="success"
                label={t('summary.recorded')}
                value={`${data.saisieCount}`}
                sub={t(
                  data.totalCount > 1 ? 'summary.recordedSub.other' : 'summary.recordedSub.one',
                  { count: data.totalCount },
                )}
              />
              <SummaryCard
                icon={Clock}
                tone="warning"
                label={t('summary.pending')}
                value={`${data.totalCount - data.saisieCount}`}
                sub={t('summary.pendingSub')}
              />
              <SummaryCard
                icon={TrendingUp}
                tone="success"
                label={t('summary.positive')}
                value={`${data.positiveCount}`}
                sub={t('summary.positiveSub')}
              />
              <SummaryCard
                icon={AlertTriangle}
                tone="destructive"
                label={t('summary.alert')}
                value={`${data.alertCount}`}
                sub={t('summary.alertSub')}
              />
            </div>
          )}

          <Card className="flex-row flex-wrap items-center gap-3 p-3.5">
            <SearchInput
              placeholder={t('searchPlaceholder')}
              className="min-w-[200px] max-w-[280px] flex-1"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <FilterSelect value={classId} onValueChange={setClassId}>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={termId} onValueChange={setTermId}>
              {terms.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.label}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              value={mentionFilter}
              onValueChange={(v) => {
                setMentionFilter(v);
                setPage(1);
              }}
            >
              <SelectItem value="">{t('allMentions')}</SelectItem>
              {MENTIONS.map((m) => (
                <SelectItem key={m} value={m}>
                  {tMention(m)}
                </SelectItem>
              ))}
            </FilterSelect>
            <span className="ml-auto text-xs text-muted-foreground">
              {t(filteredStudents.length > 1 ? 'resultsCount.other' : 'resultsCount.one', {
                count: filteredStudents.length,
              })}
            </span>
          </Card>

          <div role="tablist" className="flex w-fit gap-0 border-b-2 border-border">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'eleve'}
              onClick={() => {
                setTab('eleve');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${tab === 'eleve' ? 'border-primary text-primary' : 'border-transparent font-medium text-muted-foreground'}`}
            >
              <Table2 size={13} />
              {t('tabs.byStudent')}
              {data && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {data.totalCount}
                </span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'matiere'}
              onClick={() => {
                setTab('matiere');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${tab === 'matiere' ? 'border-primary text-primary' : 'border-transparent font-medium text-muted-foreground'}`}
            >
              <BookOpen size={13} />
              {t('tabs.bySubject')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'stats'}
              onClick={() => {
                setTab('stats');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${tab === 'stats' ? 'border-primary text-primary' : 'border-transparent font-medium text-muted-foreground'}`}
            >
              <BarChart2 size={13} />
              {t('tabs.statistics')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'attente'}
              onClick={() => {
                setTab('attente');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${tab === 'attente' ? 'border-primary text-primary' : 'border-transparent font-medium text-muted-foreground'}`}
            >
              <Clock size={13} />
              {t('tabs.pending')}
              <span className="rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-bold text-warning-foreground">
                {enAttenteCount}
              </span>
            </button>
          </div>

          {!data ? (
            // Renders PAGE_SIZE skeleton rows, not an arbitrary count — the
            // page no longer force-matches skeleton/real heights via a
            // shared `flex-1` box (that caused its own bug: on a short
            // viewport the shared box could squeeze to near-zero and hide
            // the table). Matching the row COUNT instead keeps the
            // skeleton's natural height close to a full page of real rows,
            // so the skeleton→data swap still doesn't jump the page around
            // (Lighthouse CLS 0.29 was the original regression this guards).
            <Card className="gap-0 overflow-visible p-4">
              <div className="flex flex-col gap-2.5">
                {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            </Card>
          ) : tab === 'matiere' ? (
            <ParMatiereTab data={data} />
          ) : tab === 'stats' ? (
            <StatistiquesTab data={data} />
          ) : data.totalCount === 0 ? (
            <Card className="items-center gap-2 p-10 text-center">
              <Users size={28} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('noStudents')}</p>
            </Card>
          ) : (
            <Card className="gap-0 overflow-visible">
              <div className={cn('hidden md:block', TABLE_SCROLL)}>
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead className={STICKY_THEAD}>
                    <tr className="border-b border-border">
                      <th className="px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {t('table.student')}
                      </th>
                      <th className="px-3 py-2.5 text-center text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {t('table.average')}
                      </th>
                      <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {t('table.mention')}
                      </th>
                      <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {t('table.generalAppreciation')}
                      </th>
                      <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {t('table.homeroomTeacher')}
                      </th>
                      <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {t('table.status')}
                      </th>
                      <th className="w-11" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageStudents.map((s) => (
                      <tr key={s.studentId} className="border-b border-border last:border-b-0">
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={`${s.firstName} ${s.lastName}`} size={28} />
                            <div>
                              <div className="text-caption font-semibold text-foreground">
                                {s.firstName} {s.lastName}
                              </div>
                              <div className="text-2xs text-muted-foreground">
                                #{s.studentNumber}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`text-sm font-bold ${moyColor(s.average)}`}>
                            {fmtAverage(s.average, locale)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {s.mention ? (
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-bold ${mentionClass(s.mention)}`}
                            >
                              {tMention(s.mention)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              {t('notProvided')}
                            </span>
                          )}
                        </td>
                        <td className="max-w-[280px] px-3 py-2.5">
                          <span className="block truncate text-xs text-foreground">
                            {s.text ?? (
                              <span className="text-muted-foreground italic">
                                {t('noAppreciation')}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-xs font-medium text-foreground">
                            {data.homeroomTeacherName ?? '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {s.status === 'PUBLISHED' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-2xs font-semibold text-success-foreground">
                              <CheckCircle2 size={10} />
                              {t('statusRecorded')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-2xs font-semibold text-warning-foreground">
                              <Clock size={10} />
                              {t('statusPending')}
                            </span>
                          )}
                        </td>
                        <td className="px-1.5 py-2.5">
                          <ActionMenu items={menuItemsFor(s)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* < md: cards */}
              <div className="flex flex-col gap-2.5 p-3.5 md:hidden">
                {pageStudents.map((s) => (
                  <div key={s.studentId} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={`${s.firstName} ${s.lastName}`} size={28} />
                        <div className="min-w-0">
                          <div className="truncate text-caption font-semibold text-foreground">
                            {s.firstName} {s.lastName}
                          </div>
                          <div className="truncate text-2xs text-muted-foreground">
                            #{s.studentNumber}
                          </div>
                        </div>
                      </div>
                      <div className="-mt-1 -mr-1 shrink-0">
                        <ActionMenu items={menuItemsFor(s)} />
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2.5">
                      {s.status === 'PUBLISHED' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-2xs font-semibold text-success-foreground">
                          <CheckCircle2 size={10} />
                          {t('statusRecorded')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-2xs font-semibold text-warning-foreground">
                          <Clock size={10} />
                          {t('statusPending')}
                        </span>
                      )}
                      <span className={`text-sm font-bold ${moyColor(s.average)}`}>
                        {fmtAverage(s.average, locale)}
                        {s.mention && (
                          <span
                            className={`ml-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold ${mentionClass(s.mention)}`}
                          >
                            {tMention(s.mention)}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-border px-3.5 py-2.5">
                <span className="text-xs text-muted-foreground">
                  {t('paginationRange', {
                    from: (page - 1) * PAGE_SIZE + 1,
                    to: Math.min(page * PAGE_SIZE, filteredStudents.length),
                    total: filteredStudents.length,
                  })}{' '}
                  <strong className="text-foreground">
                    {t('paginationRecorded', { count: data.saisieCount })}
                  </strong>
                  {t('paginationPending', { count: data.totalCount - data.saisieCount })}
                </span>
                <div className="flex items-center gap-1">
                  <PageNumbers page={page} totalPages={pageCount} onChange={setPage} />
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  tone: t,
  label,
  value,
  sub,
}: {
  icon: typeof Users;
  tone: 'secondary' | 'success' | 'warning' | 'destructive';
  label: string;
  value: string;
  sub: string;
}) {
  const iconBg: Record<string, string> = {
    secondary: 'bg-secondary text-primary',
    success: 'bg-success text-success-foreground',
    warning: 'bg-warning text-warning-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
  };
  const valueColor: Record<string, string> = {
    secondary: 'text-foreground',
    success: 'text-success-foreground',
    warning: 'text-warning-foreground',
    destructive: 'text-destructive-foreground',
  };
  return (
    <Card className="flex-row items-center gap-3 p-3.5">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${iconBg[t]}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-2xs font-medium text-muted-foreground">{label}</div>
        <div className={`text-lg font-bold ${valueColor[t]}`}>{value}</div>
        {sub && <div className="truncate text-2xs text-muted-foreground">{sub}</div>}
      </div>
    </Card>
  );
}
```

Behaviour notes for this rewrite (all deliberate, all already reflected in the code block above):
- The three local helpers (`mentionClass`, `moyColor`, `fmt`) are deleted; the first two are imported unchanged from `./format`, and `fmt(x)` becomes `fmtAverage(x, locale)` at its 3 call sites (desktop table, mobile card, and none in CSV — the CSV keeps the raw numeric `s.average ?? ''`, exactly as before, because a spreadsheet column must stay machine-readable).
- `type Mention` is **no longer imported** in this file: the only thing that needed it was the deleted local `mentionClass`. `mentionFilter` is (and always was) a plain `string` state compared against `s.mention`. Importing it anyway would trip `@typescript-eslint/no-unused-vars`.
- `Object.entries(MENTION_LABEL).map(([k, label]) => …)` becomes `MENTIONS.map((m) => …)` with `tMention(m)` as the label — same six options, same order.
- The term `<FilterSelect>`'s callback parameter is renamed `t` → `term` so it no longer shadows the translator. Behaviour is identical; the rename is what keeps `t.label` from silently meaning two different things in one file.
- `SummaryCard`'s own `tone: t` prop-destructure (renaming the `tone` prop to a local `t`) is **pre-existing, unrelated code**. It shadows the outer translator only inside `SummaryCard`'s body, where it is used purely as the colour-lookup key (`iconBg[t]`, `valueColor[t]`), never as a translator call. Left exactly as it was — do not rename it.
- Both load effects now list `t` in their dependency arrays (`[user, router, t]` and `[classId, termId, t]`), matching the shipped `carnet-de-notes/page.tsx`.

- [ ] **Step 5: Typecheck and lint**

Run: `cd frontend && pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/messages/fr/appreciations.json frontend/src/messages/ht/appreciations.json frontend/src/messages/en/appreciations.json "frontend/src/app/(school)/pedagogie/appreciations/page.tsx"
git commit -m "feat(i18n): translate appreciations class list, fix tutoiement violation"
```

---

### Task 5: `[studentId]/page.tsx` (single-student detail)

**Files:**
- Modify: `frontend/src/messages/{fr,ht,en}/appreciations.json` (add `detail.*`)
- Modify: `frontend/src/app/(school)/pedagogie/appreciations/[studentId]/page.tsx`

**Interfaces:**
- Consumes: `Appreciations.mention` key group (Task 1) for the 3 mention chips; `fmtAverage` and `mentionClass` from `../format` (Task 1). Does **not** consume `moyColor` — this file never had a copy of it.
- Produces: nothing consumed by later tasks.

This task also fixes the module's `fmtDate()` locale bug: `.toLocaleDateString('fr-FR', …)` hardcodes French date formatting for every reader. The fix mirrors the already-migrated `frontend/src/app/(school)/eleves/[id]/AppreciationsTab.tsx`, which fixed the identical bug in the sibling screen: `const locale = useLocale();` + `const bcp47 = LOCALE_BCP47[locale];` (importing `LOCALE_BCP47` from `@/lib/locales`), then `fmtDate(iso, bcp47)`.

- [ ] **Step 1: Append `detail` to `frontend/src/messages/fr/appreciations.json`**

Add as a new top-level sibling of `list` (before the closing `}`):

```json
  "detail": {
    "back": "Retour aux appréciations",
    "studentNotFound": "Élève introuvable.",
    "loadError": "Impossible de charger l'appréciation.",
    "deleteConfirm": "Supprimer l'appréciation générale de cet élève ?",
    "deletedToast": "Appréciation supprimée.",
    "deleteErrorToast": "Erreur lors de la suppression.",
    "position": "Élève {index} sur {total} — {className} · {term}",
    "messagingSoon": "Messagerie — bientôt disponible.",
    "reportCardsSoon": "Disponible avec les Bulletins (Epic 7).",
    "classCouncilSoon": "Disponible avec le Conseil de classe (à venir).",
    "auditHistorySoon": "L'historique détaillé arrive avec le module d'audit (à venir).",
    "notifyGuardian": "Notifier le tuteur",
    "generateReportCard": "Générer le bulletin",
    "editAppreciation": "Modifier l'appréciation",
    "generalTitle": "Appréciation générale",
    "writtenBy": "Rédigé par :",
    "enteredOn": "Saisie le {date}",
    "statusRecorded": "Saisie",
    "statusDraft": "Brouillon",
    "generalEmpty": "Aucune appréciation générale saisie pour cet élève.",
    "bySubjectTitle": "Appréciations par matière",
    "bySubject": {
      "subject": "Matière",
      "coefficient": "Coeff.",
      "average": "Moy.",
      "mention": "Mention",
      "appreciation": "Appréciation",
      "teacher": "Enseignant"
    },
    "overallAverage": "Moyenne générale",
    "rankLine": "— Rang : {rank} / {rankedCount}",
    "classCouncilTitle": "Décision du conseil de classe",
    "statsTitle": "Statistiques du trimestre",
    "stats": {
      "average": "Moyenne",
      "rank": "Rang",
      "minScore": "Note min",
      "maxScore": "Note max",
      "rankValue": {
        "one": "{rank}er",
        "other": "{rank}e"
      }
    },
    "info": {
      "classAverage": "Moy. de classe",
      "absences": "Absences",
      "lateArrivals": "Retards",
      "gradedSubjects": "Matières évaluées",
      "enteredOn": "Saisie le",
      "lastModified": "Dernière modification"
    },
    "homeroomTitle": "Enseignant principal",
    "notSet": "Non défini",
    "historyTitle": "Historique des modifications",
    "quickActionsTitle": "Actions rapides",
    "generateReportCardPdf": "Générer le bulletin PDF",
    "sendToGuardian": "Envoyer au tuteur légal",
    "deleteAppreciation": "Supprimer l'appréciation"
  }
```

- [ ] **Step 2: Append `detail` to `frontend/src/messages/en/appreciations.json`**

```json
  "detail": {
    "back": "Back to appreciations",
    "studentNotFound": "Student not found.",
    "loadError": "Unable to load the appreciation.",
    "deleteConfirm": "Delete this student's general appreciation?",
    "deletedToast": "Appreciation deleted.",
    "deleteErrorToast": "Deletion failed.",
    "position": "Student {index} of {total} — {className} · {term}",
    "messagingSoon": "Messaging — coming soon.",
    "reportCardsSoon": "Available with Report cards (Epic 7).",
    "classCouncilSoon": "Available with the Class council (coming soon).",
    "auditHistorySoon": "The detailed history arrives with the audit module (coming soon).",
    "notifyGuardian": "Notify the guardian",
    "generateReportCard": "Generate report card",
    "editAppreciation": "Edit appreciation",
    "generalTitle": "General appreciation",
    "writtenBy": "Written by:",
    "enteredOn": "Entered on {date}",
    "statusRecorded": "Recorded",
    "statusDraft": "Draft",
    "generalEmpty": "No general appreciation entered for this student.",
    "bySubjectTitle": "Appreciations by subject",
    "bySubject": {
      "subject": "Subject",
      "coefficient": "Coeff.",
      "average": "Avg.",
      "mention": "Mention",
      "appreciation": "Appreciation",
      "teacher": "Teacher"
    },
    "overallAverage": "Overall average",
    "rankLine": "— Rank: {rank} / {rankedCount}",
    "classCouncilTitle": "Class council decision",
    "statsTitle": "Term statistics",
    "stats": {
      "average": "Average",
      "rank": "Rank",
      "minScore": "Lowest score",
      "maxScore": "Highest score",
      "rankValue": {
        "one": "#{rank}",
        "other": "#{rank}"
      }
    },
    "info": {
      "classAverage": "Class avg.",
      "absences": "Absences",
      "lateArrivals": "Late arrivals",
      "gradedSubjects": "Graded subjects",
      "enteredOn": "Entered on",
      "lastModified": "Last modified"
    },
    "homeroomTitle": "Homeroom teacher",
    "notSet": "Not set",
    "historyTitle": "Change history",
    "quickActionsTitle": "Quick actions",
    "generateReportCardPdf": "Generate report card PDF",
    "sendToGuardian": "Send to legal guardian",
    "deleteAppreciation": "Delete appreciation"
  }
```

- [ ] **Step 3: Append `detail` to `frontend/src/messages/ht/appreciations.json`**

```json
  "detail": {
    "back": "Retounen nan apresyasyon yo",
    "studentNotFound": "Nou pa jwenn elèv la.",
    "loadError": "Nou pa t kapab chaje apresyasyon an.",
    "deleteConfirm": "Efase apresyasyon jeneral elèv sa a?",
    "deletedToast": "Apresyasyon efase.",
    "deleteErrorToast": "Erè pandan efasman an.",
    "position": "Elèv {index} sou {total} — {className} · {term}",
    "messagingSoon": "Mesajri — l ap disponib byento.",
    "reportCardsSoon": "Disponib ak Bilten yo (Epic 7).",
    "classCouncilSoon": "Disponib ak Konsèy klas la (k ap vini).",
    "auditHistorySoon": "Istorik detaye a ap vini ak modil odit la (k ap vini).",
    "notifyGuardian": "Avèti responsab la",
    "generateReportCard": "Jenere bilten an",
    "editAppreciation": "Modifye apresyasyon an",
    "generalTitle": "Apresyasyon jeneral",
    "writtenBy": "Ekri pa :",
    "enteredOn": "Antre le {date}",
    "statusRecorded": "Antre",
    "statusDraft": "Bouyon",
    "generalEmpty": "Pa gen apresyasyon jeneral antre pou elèv sa a.",
    "bySubjectTitle": "Apresyasyon pa matyè",
    "bySubject": {
      "subject": "Matyè",
      "coefficient": "Koef.",
      "average": "Mwa.",
      "mention": "Mansyon",
      "appreciation": "Apresyasyon",
      "teacher": "Pwofesè"
    },
    "overallAverage": "Mwayèn jeneral",
    "rankLine": "— Ran : {rank} / {rankedCount}",
    "classCouncilTitle": "Desizyon konsèy klas la",
    "statsTitle": "Estatistik trimès la",
    "stats": {
      "average": "Mwayèn",
      "rank": "Ran",
      "minScore": "Nòt minimòm",
      "maxScore": "Nòt maksimòm",
      "rankValue": {
        "one": "{rank}e",
        "other": "{rank}e"
      }
    },
    "info": {
      "classAverage": "Mwa. klas la",
      "absences": "Absans",
      "lateArrivals": "Reta",
      "gradedSubjects": "Matyè evalye",
      "enteredOn": "Antre le",
      "lastModified": "Dènye modifikasyon"
    },
    "homeroomTitle": "Pwofesè prensipal",
    "notSet": "Pa defini",
    "historyTitle": "Istorik modifikasyon yo",
    "quickActionsTitle": "Aksyon rapid",
    "generateReportCardPdf": "Jenere bilten PDF la",
    "sendToGuardian": "Voye bay responsab legal la",
    "deleteAppreciation": "Efase apresyasyon an"
  }
```

- [ ] **Step 4: Rewrite `[studentId]/page.tsx`**

Full replacement:

```tsx
'use client';

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Users,
  Hash,
  School,
  Calendar,
  Mail,
  FileText,
  Pencil,
  Star,
  BookOpen,
  AlertTriangle,
  BarChart2,
  UserCheck,
  History,
  Zap,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { ASIDE_GRID } from '@/lib/layout';
import { LOCALE_BCP47 } from '@/lib/locales';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { fmtAverage, mentionClass } from '../format';
import type { StudentAppreciationData } from '../types';

function fmtDate(iso: string | undefined, locale: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function AppreciationDetailPage() {
  const t = useTranslations('Appreciations.detail');
  const tMention = useTranslations('Appreciations.mention');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const params = useParams<{ studentId: string }>();
  const searchParams = useSearchParams();
  const termId = searchParams.get('termId') ?? '';
  const [data, setData] = useState<StudentAppreciationData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const qs = termId ? `?termId=${termId}` : '';
    api<StudentAppreciationData>(`/api/school/students/${params.studentId}/appreciations${qs}`)
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setError(t('studentNotFound'));
          return;
        }
        setError(t('loadError'));
      });
  }, [user, params.studentId, termId, t]);

  async function onDelete() {
    if (!data) return;
    if (
      !(await confirm({
        message: t('deleteConfirm'),
        danger: true,
      }))
    )
      return;
    try {
      await api(
        `/api/school/students/${data.studentId}/appreciations?termId=${data.resolvedTermId}`,
        {
          method: 'DELETE',
        },
      );
      toast(t('deletedToast'), 'success');
      router.push('/pedagogie/appreciations');
    } catch {
      toast(t('deleteErrorToast'), 'error');
    }
  }

  if (!user || (!data && !error)) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/pedagogie/appreciations"
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          {t('back')}
        </Link>
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      </div>
    );
  }

  const gradedSubjects = data.subjects.filter((s) => s.average != null);
  const minScore = gradedSubjects.length
    ? Math.min(...gradedSubjects.map((s) => s.average!))
    : null;
  const maxScore = gradedSubjects.length
    ? Math.max(...gradedSubjects.map((s) => s.average!))
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/pedagogie/appreciations"
        className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
      >
        <ArrowLeft size={13} />
        {t('back')}
      </Link>

      <Card className="flex-row flex-wrap items-center justify-between gap-2 p-3 px-4">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Users size={12} className="shrink-0" />
          <span className="truncate">
            {t('position', {
              index: data.studentIndex ?? '—',
              total: data.classSize,
              className: data.className,
              term: data.terms.find((term) => term.id === data.resolvedTermId)?.label ?? '',
            })}
          </span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!data.prevStudentId}
            onClick={() =>
              data.prevStudentId &&
              router.push(
                `/pedagogie/appreciations/${data.prevStudentId}?termId=${data.resolvedTermId}`,
              )
            }
            className="flex h-7 w-7 items-center justify-center rounded-md text-foreground disabled:opacity-30"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            disabled={!data.nextStudentId}
            onClick={() =>
              data.nextStudentId &&
              router.push(
                `/pedagogie/appreciations/${data.nextStudentId}?termId=${data.resolvedTermId}`,
              )
            }
            className="flex h-7 w-7 items-center justify-center rounded-md text-foreground disabled:opacity-30"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </Card>

      <Card className="flex-col items-start gap-3.5 p-4 sm:flex-row sm:items-center">
        <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
          {data.firstName[0]}
          {data.lastName[0]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold text-foreground">
            {data.firstName} {data.lastName}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Hash size={11} />
              {data.studentNumber}
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <School size={11} />
              {data.className}
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              {data.terms.find((term) => term.id === data.resolvedTermId)?.label ?? ''}
            </span>
            {data.general?.mention && (
              <>
                <span className="text-border">·</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-2xs font-bold ${mentionClass(data.general.mention)}`}
                >
                  {tMention(data.general.mention)}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {/* Both still toast placeholders ("bientôt disponible") — hidden on
              mobile so the one real action (Modifier) isn't crowded out by
              two buttons that don't do anything yet. */}
          <button
            type="button"
            onClick={() => toast(t('messagingSoon'), 'info')}
            className="hidden items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-caption font-semibold text-foreground sm:flex"
          >
            <Mail size={13} />
            {t('notifyGuardian')}
          </button>
          <button
            type="button"
            onClick={() => toast(t('reportCardsSoon'), 'info')}
            className="hidden items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-caption font-semibold text-foreground sm:flex"
          >
            <FileText size={13} />
            {t('generateReportCard')}
          </button>
          <Link
            href={`/pedagogie/appreciations/${data.studentId}/saisie?termId=${data.resolvedTermId}`}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-caption font-semibold text-primary-foreground"
          >
            <Pencil size={13} />
            {t('editAppreciation')}
          </Link>
        </div>
      </Card>

      <div className={ASIDE_GRID}>
        <div className="flex flex-col gap-4">
          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Star size={14} className="text-primary" />
              {t('generalTitle')}
            </div>
            {data.general ? (
              <>
                <div className="rounded-md bg-muted p-3.5 text-caption leading-relaxed text-foreground">
                  {data.general.text || <span className="text-muted-foreground italic">—</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {t('writtenBy')}{' '}
                    <strong className="text-foreground">{data.general.authorName ?? '—'}</strong>
                  </span>
                  <span className="text-border">·</span>
                  <span>{t('enteredOn', { date: fmtDate(data.general.createdAt, bcp47) })}</span>
                  <span className="text-border">·</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold ${data.general.status === 'PUBLISHED' ? 'bg-success text-success-foreground' : 'bg-warning text-warning-foreground'}`}
                  >
                    {data.general.status === 'PUBLISHED' ? t('statusRecorded') : t('statusDraft')}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground italic">{t('generalEmpty')}</p>
            )}
          </Card>

          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <BookOpen size={14} className="text-primary" />
              {t('bySubjectTitle')}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      {t('bySubject.subject')}
                    </th>
                    <th className="px-2 py-2 text-center text-2xs font-semibold text-muted-foreground uppercase">
                      {t('bySubject.coefficient')}
                    </th>
                    <th className="px-2 py-2 text-center text-2xs font-semibold text-muted-foreground uppercase">
                      {t('bySubject.average')}
                    </th>
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      {t('bySubject.mention')}
                    </th>
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      {t('bySubject.appreciation')}
                    </th>
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      {t('bySubject.teacher')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.subjects.map((s) => (
                    <tr key={s.classSubjectId} className="border-b border-border last:border-b-0">
                      <td className="px-2 py-2 text-caption font-semibold text-foreground">
                        {s.subjectName}
                      </td>
                      <td className="px-2 py-2 text-center text-xs text-muted-foreground">
                        {s.coefficient ?? '—'}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className="text-sm font-bold text-foreground">
                          {fmtAverage(s.average, locale)}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        {s.mention ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-2xs font-bold ${mentionClass(s.mention)}`}
                          >
                            {tMention(s.mention)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="max-w-[240px] px-2 py-2">
                        <span className="block truncate text-xs text-foreground">
                          {s.text ?? <span className="text-muted-foreground italic">—</span>}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs font-medium text-foreground">
                        {s.teacherName ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
              <span className="text-caption font-medium text-muted-foreground">
                {t('overallAverage')}
              </span>
              <span className="text-xl font-extrabold text-foreground">
                {fmtAverage(data.overallAverage, locale)} / 20
              </span>
              {data.general?.mention && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-2xs font-bold ${mentionClass(data.general.mention)}`}
                >
                  {tMention(data.general.mention)}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {t('rankLine', { rank: data.rank ?? '—', rankedCount: data.rankedCount })}
              </span>
            </div>
          </Card>

          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <AlertTriangle size={14} className="text-destructive-foreground" />
              {t('classCouncilTitle')}
            </div>
            <p className="text-sm text-muted-foreground italic">{t('classCouncilSoon')}</p>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <BarChart2 size={14} className="text-muted-foreground" />
              {t('statsTitle')}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatBox
                label={t('stats.average')}
                value={fmtAverage(data.overallAverage, locale)}
              />
              <StatBox
                label={t('stats.rank')}
                value={
                  data.rank
                    ? t(data.rank === 1 ? 'stats.rankValue.one' : 'stats.rankValue.other', {
                        rank: data.rank,
                      })
                    : '—'
                }
              />
              <StatBox label={t('stats.minScore')} value={fmtAverage(minScore, locale)} />
              <StatBox label={t('stats.maxScore')} value={fmtAverage(maxScore, locale)} />
            </div>
            <div className="h-px bg-border" />
            <InfoRow
              label={t('info.classAverage')}
              value={`${fmtAverage(data.classAverage, locale)} / 20`}
            />
            <InfoRow label={t('info.absences')} value="—" />
            <InfoRow label={t('info.lateArrivals')} value="—" />
            <InfoRow
              label={t('info.gradedSubjects')}
              value={`${gradedSubjects.length} / ${data.subjects.length}`}
            />
          </Card>

          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <UserCheck size={14} className="text-primary" />
              {t('homeroomTitle')}
            </div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-bold text-primary">
                {data.homeroomTeacherName?.[0] ?? '—'}
              </div>
              <div>
                <div className="text-caption font-bold text-foreground">
                  {data.homeroomTeacherName ?? t('notSet')}
                </div>
                <div className="text-xs text-muted-foreground">{data.className}</div>
              </div>
            </div>
            <div className="h-px bg-border" />
            <InfoRow label={t('info.enteredOn')} value={fmtDate(data.general?.createdAt, bcp47)} />
            <InfoRow
              label={t('info.lastModified')}
              value={fmtDate(data.general?.updatedAt, bcp47)}
            />
          </Card>

          <Card className="gap-2.5 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <History size={14} className="text-muted-foreground" />
              {t('historyTitle')}
            </div>
            <p className="text-xs text-muted-foreground italic">{t('auditHistorySoon')}</p>
          </Card>

          <Card className="gap-1 p-2">
            <div className="flex items-center gap-2 px-2 pt-2 text-sm font-bold text-foreground">
              <Zap size={14} className="text-muted-foreground" />
              {t('quickActionsTitle')}
            </div>
            <button
              type="button"
              onClick={() => toast(t('reportCardsSoon'), 'info')}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-caption font-medium text-foreground hover:bg-muted"
            >
              <FileText size={14} className="text-muted-foreground" />
              {t('generateReportCardPdf')}
            </button>
            <button
              type="button"
              onClick={() => toast(t('messagingSoon'), 'info')}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-caption font-medium text-foreground hover:bg-muted"
            >
              <Mail size={14} className="text-muted-foreground" />
              {t('sendToGuardian')}
            </button>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-caption font-medium text-destructive-foreground hover:bg-destructive"
            >
              <Trash2 size={14} />
              {t('deleteAppreciation')}
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted p-2.5 text-center">
      <div className="text-lg font-extrabold text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-caption">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
```

Behaviour notes for this rewrite (all deliberate, all already reflected in the code block above):
- The local `mentionClass()` and `fmt()` copies are deleted; `mentionClass` is imported unchanged from `../format`, and `fmt(x)` becomes `fmtAverage(x, locale)` at its 6 call sites.
- `fmtDate` keeps living in this file (only this file uses it) but now takes the BCP-47 tag as a parameter — `'fr-FR'` is gone. Its `{ day: 'numeric', month: 'short', year: 'numeric' }` options are unchanged.
- `type Mention` is **no longer imported** — the deleted local `mentionClass` was its only consumer here.
- The two `data.terms.find((t) => …)` callbacks are renamed to `(term) => …` so they no longer shadow the translator.
- The rank StatBox switches from the hardcoded `` `${data.rank}e` `` to the `stats.rankValue.one`/`.other` pair with an `data.rank === 1` selector (French `1er` vs `Ne`; English renders `#N`).
- `t('rankLine', …)` passes `data.rank ?? '—'`, preserving the em-dash fallback the original rendered inline.
- The load effect lists `t` in its dependency array (`[user, params.studentId, termId, t]`).

- [ ] **Step 5: Typecheck and lint**

Run: `cd frontend && pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/messages/fr/appreciations.json frontend/src/messages/ht/appreciations.json frontend/src/messages/en/appreciations.json "frontend/src/app/(school)/pedagogie/appreciations/[studentId]/page.tsx"
git commit -m "feat(i18n): translate appreciation detail page, fix hardcoded fr-FR date locale"
```

---

### Task 6: `[studentId]/saisie/page.tsx` (comment-entry form) + `types.ts` cleanup

**Files:**
- Modify: `frontend/src/messages/{fr,ht,en}/appreciations.json` (add `saisie.*`)
- Modify: `frontend/src/app/(school)/pedagogie/appreciations/[studentId]/saisie/page.tsx`
- Modify: `frontend/src/app/(school)/pedagogie/appreciations/types.ts` (delete the now-unused `MENTION_LABEL`)

**Interfaces:**
- Consumes: `Appreciations.mention` key group + `MENTIONS` (Task 1) for the 6 mention buttons; `fmtAverage` from `../../format` (Task 1); `Common.errors.network` (existing).
- Produces: nothing consumed by later tasks. This is the last file task; after it, `MENTION_LABEL` has no importers left anywhere in the repo (verified: only these 4 module files ever imported it — `eleves/` has its own separate copy in `eleves/mention-label.ts`, which this plan does not touch).

Three constraints apply with full force in this task:
1. **`OFFLINE_SYNC` fence** — `import { OFFLINE_SYNC } from '@/lib/constants';` and `toast(OFFLINE_SYNC.queuedToast, 'info');` are byte-identical before and after. Diff them.
2. **`submitOrQueue` `label:` fence** — the two French offline-queue item labels stay exactly as they are.
3. **The 3 option Selects keep their French `value`s** — only the visible labels are translated (see the `{ value, key }` pairs in the code block).

- [ ] **Step 1: Append `saisie` to `frontend/src/messages/fr/appreciations.json`**

Add as a new top-level sibling of `detail` (before the closing `}`):

```json
  "saisie": {
    "title": "Saisir une appréciation",
    "backToList": "Retour à la liste",
    "studentNotFound": "Élève introuvable.",
    "loadError": "Impossible de charger la saisie d'appréciation.",
    "saveDraft": "Enregistrer brouillon",
    "validate": "Valider l'appréciation",
    "validateAndNext": "Valider et passer au suivant",
    "validatedToast": "Appréciation validée.",
    "draftSavedToast": "Brouillon enregistré.",
    "classProgress": "Progression de la classe :",
    "progressCount": {
      "one": "{count} / {total} élève",
      "other": "{count} / {total} élèves"
    },
    "contextTitle": "Contexte de saisie",
    "classLabel": "Classe",
    "termLabel": "Trimestre",
    "studentLabel": "Élève",
    "selectedStudent": "Élève sélectionné",
    "previous": "Précédent",
    "next": "Suivant",
    "studentMeta": "N° {number} · {className}",
    "provisionalRank": {
      "one": "Rang provisoire : {rank}er",
      "other": "Rang provisoire : {rank}e"
    },
    "overallAverage": "Moyenne générale",
    "generalTitle": "Appréciation générale",
    "mentionLabel": "Mention générale",
    "commentLabel": "Commentaire général",
    "commentHint": "(visible sur le bulletin)",
    "charCount": "{count} / {max} caractères",
    "commentPlaceholder": "Rédigez un commentaire constructif et bienveillant.",
    "comportementLabel": "Comportement",
    "investissementLabel": "Investissement",
    "assiduiteLabel": "Assiduité",
    "comportement": {
      "EXCELLENT": "Excellent",
      "SATISFAISANT": "Satisfaisant",
      "A_AMELIORER": "À améliorer",
      "PERTURBATEUR": "Perturbateur"
    },
    "investissement": {
      "EXCELLENT": "Excellent",
      "SATISFAISANT": "Satisfaisant",
      "A_AMELIORER": "À améliorer",
      "INSUFFISANT": "Insuffisant"
    },
    "assiduite": {
      "REGULIER": "Régulier",
      "IRREGULIER": "Irrégulier",
      "ABSENCES_REPETEES": "Absences répétées"
    },
    "bySubjectTitle": "Appréciations par matière",
    "subjectsCount": {
      "one": "{count} matière · Saisies : {filled}/{count}",
      "other": "{count} matières · Saisies : {filled}/{count}"
    },
    "subjectPlaceholder": "Cliquer pour saisir une appréciation...",
    "prevStudent": "Précédent : {name}",
    "nextStudent": "Suivant : {name}",
    "summaryTitle": "Résumé de l'élève",
    "info": {
      "overallAverage": "Moyenne générale",
      "rank": "Rang",
      "absences": "Absences",
      "lateArrivals": "Retards",
      "classAverage": "Moy. classe"
    },
    "rankValue": {
      "one": "{rank}er / {total}",
      "other": "{rank}e / {total}"
    },
    "subjectGrades": "Notes par matière",
    "quickPhrasesTitle": "Phrases types",
    "quickPhrasesSubtitle": "Cliquer pour insérer dans le commentaire",
    "quickPhrases": {
      "serious": "Élève sérieux et investi, qui doit continuer ainsi.",
      "efforts": "Des efforts notables, mais des lacunes persistent.",
      "insufficient": "Résultats insuffisants. Un soutien scolaire est recommandé.",
      "satisfactory": "Trimestre satisfaisant, peut viser encore mieux.",
      "exemplary": "Comportement exemplaire, excellente participation.",
      "regularity": "Doit faire preuve de plus de régularité dans son travail."
    }
  }
```

Note the `quickPhrases.serious` value: `"Élève sérieux et investi, qui doit continuer ainsi."` — this is the corrected French from the Global Constraints, **not** the source file's `"Élève sérieux et investi, encourage à continuer."`. Copy it exactly as written above.

- [ ] **Step 2: Append `saisie` to `frontend/src/messages/en/appreciations.json`**

```json
  "saisie": {
    "title": "Enter an appreciation",
    "backToList": "Back to the list",
    "studentNotFound": "Student not found.",
    "loadError": "Unable to load the appreciation form.",
    "saveDraft": "Save draft",
    "validate": "Validate appreciation",
    "validateAndNext": "Validate and go to next",
    "validatedToast": "Appreciation validated.",
    "draftSavedToast": "Draft saved.",
    "classProgress": "Class progress:",
    "progressCount": {
      "one": "{count} / {total} student",
      "other": "{count} / {total} students"
    },
    "contextTitle": "Entry context",
    "classLabel": "Class",
    "termLabel": "Term",
    "studentLabel": "Student",
    "selectedStudent": "Selected student",
    "previous": "Previous",
    "next": "Next",
    "studentMeta": "No. {number} · {className}",
    "provisionalRank": {
      "one": "Provisional rank: #{rank}",
      "other": "Provisional rank: #{rank}"
    },
    "overallAverage": "Overall average",
    "generalTitle": "General appreciation",
    "mentionLabel": "Overall mention",
    "commentLabel": "General comment",
    "commentHint": "(shown on the report card)",
    "charCount": "{count} / {max} characters",
    "commentPlaceholder": "Write a constructive, supportive comment.",
    "comportementLabel": "Behaviour",
    "investissementLabel": "Commitment",
    "assiduiteLabel": "Attendance",
    "comportement": {
      "EXCELLENT": "Excellent",
      "SATISFAISANT": "Satisfactory",
      "A_AMELIORER": "Needs improvement",
      "PERTURBATEUR": "Disruptive"
    },
    "investissement": {
      "EXCELLENT": "Excellent",
      "SATISFAISANT": "Satisfactory",
      "A_AMELIORER": "Needs improvement",
      "INSUFFISANT": "Insufficient"
    },
    "assiduite": {
      "REGULIER": "Regular",
      "IRREGULIER": "Irregular",
      "ABSENCES_REPETEES": "Repeated absences"
    },
    "bySubjectTitle": "Appreciations by subject",
    "subjectsCount": {
      "one": "{count} subject · Recorded: {filled}/{count}",
      "other": "{count} subjects · Recorded: {filled}/{count}"
    },
    "subjectPlaceholder": "Click to write an appreciation...",
    "prevStudent": "Previous: {name}",
    "nextStudent": "Next: {name}",
    "summaryTitle": "Student summary",
    "info": {
      "overallAverage": "Overall average",
      "rank": "Rank",
      "absences": "Absences",
      "lateArrivals": "Late arrivals",
      "classAverage": "Class avg."
    },
    "rankValue": {
      "one": "#{rank} / {total}",
      "other": "#{rank} / {total}"
    },
    "subjectGrades": "Grades by subject",
    "quickPhrasesTitle": "Ready-made phrases",
    "quickPhrasesSubtitle": "Click to insert into the comment",
    "quickPhrases": {
      "serious": "A serious, committed student who should keep it up.",
      "efforts": "Notable efforts, but gaps remain.",
      "insufficient": "Insufficient results. Academic support is recommended.",
      "satisfactory": "A satisfactory term; can aim even higher.",
      "exemplary": "Exemplary behaviour, excellent participation.",
      "regularity": "Must show more consistency in their work."
    }
  }
```

- [ ] **Step 3: Append `saisie` to `frontend/src/messages/ht/appreciations.json`**

```json
  "saisie": {
    "title": "Antre yon apresyasyon",
    "backToList": "Retounen nan lis la",
    "studentNotFound": "Nou pa jwenn elèv la.",
    "loadError": "Nou pa t kapab chaje fòm apresyasyon an.",
    "saveDraft": "Anrejistre bouyon",
    "validate": "Valide apresyasyon an",
    "validateAndNext": "Valide epi pase nan pwochen an",
    "validatedToast": "Apresyasyon valide.",
    "draftSavedToast": "Bouyon anrejistre.",
    "classProgress": "Pwogrè klas la :",
    "progressCount": {
      "one": "{count} / {total} elèv",
      "other": "{count} / {total} elèv"
    },
    "contextTitle": "Kontèks saizi a",
    "classLabel": "Klas",
    "termLabel": "Trimès",
    "studentLabel": "Elèv",
    "selectedStudent": "Elèv chwazi a",
    "previous": "Anvan",
    "next": "Apre",
    "studentMeta": "N° {number} · {className}",
    "provisionalRank": {
      "one": "Ran pwovizwa : {rank}e",
      "other": "Ran pwovizwa : {rank}e"
    },
    "overallAverage": "Mwayèn jeneral",
    "generalTitle": "Apresyasyon jeneral",
    "mentionLabel": "Mansyon jeneral",
    "commentLabel": "Kòmantè jeneral",
    "commentHint": "(l ap parèt sou bilten an)",
    "charCount": "{count} / {max} karaktè",
    "commentPlaceholder": "Ekri yon kòmantè konstriktif ak byenveyan.",
    "comportementLabel": "Konpòtman",
    "investissementLabel": "Angajman",
    "assiduiteLabel": "Asidwite",
    "comportement": {
      "EXCELLENT": "Ekselan",
      "SATISFAISANT": "Satisfezan",
      "A_AMELIORER": "Pou amelyore",
      "PERTURBATEUR": "Deranjan"
    },
    "investissement": {
      "EXCELLENT": "Ekselan",
      "SATISFAISANT": "Satisfezan",
      "A_AMELIORER": "Pou amelyore",
      "INSUFFISANT": "Ensifizan"
    },
    "assiduite": {
      "REGULIER": "Regilye",
      "IRREGULIER": "Iregilye",
      "ABSENCES_REPETEES": "Absans repete"
    },
    "bySubjectTitle": "Apresyasyon pa matyè",
    "subjectsCount": {
      "one": "{count} matyè · Antre : {filled}/{count}",
      "other": "{count} matyè · Antre : {filled}/{count}"
    },
    "subjectPlaceholder": "Klike pou ekri yon apresyasyon...",
    "prevStudent": "Anvan : {name}",
    "nextStudent": "Apre : {name}",
    "summaryTitle": "Rezime elèv la",
    "info": {
      "overallAverage": "Mwayèn jeneral",
      "rank": "Ran",
      "absences": "Absans",
      "lateArrivals": "Reta",
      "classAverage": "Mwa. klas"
    },
    "rankValue": {
      "one": "{rank}e / {total}",
      "other": "{rank}e / {total}"
    },
    "subjectGrades": "Nòt pa matyè",
    "quickPhrasesTitle": "Fraz tou pare",
    "quickPhrasesSubtitle": "Klike pou mete l nan kòmantè a",
    "quickPhrases": {
      "serious": "Elèv serye ki angaje, li dwe kontinye konsa.",
      "efforts": "Gen efò ki remakab, men gen lakin ki rete.",
      "insufficient": "Rezilta yo ensifizan. Nou rekòmande yon sipò eskolè.",
      "satisfactory": "Trimès satisfezan, li ka vize pi wo toujou.",
      "exemplary": "Konpòtman egzanplè, patisipasyon ekselan.",
      "regularity": "Li dwe montre plis regilarite nan travay li."
    }
  }
```

- [ ] **Step 4: Rewrite `[studentId]/saisie/page.tsx`**

Full replacement:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Save,
  Check,
  Settings2,
  User,
  Star,
  BookOpen,
  BarChart2,
  Zap,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { submitOrQueue } from '@/lib/offline-queue';
import { OFFLINE_SYNC } from '@/lib/constants';
import { ASIDE_GRID } from '@/lib/layout';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, SelectItem } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { fmtAverage } from '../../format';
import { MENTIONS } from '../../types';
import type { AppreciationsListData, Mention, StudentAppreciationData } from '../../types';

const MENTION_BTN_CLASS: Record<Mention, string> = {
  TRES_BIEN: 'border-success bg-success text-success-foreground',
  BIEN: 'border-[#2563eb] bg-info text-info-foreground',
  ASSEZ_BIEN: 'border-warning-foreground bg-warning text-warning-foreground',
  PASSABLE: 'border-border bg-muted text-muted-foreground',
  INSUFFISANT: 'border-destructive-foreground bg-destructive text-destructive-foreground',
  FAIBLE: 'border-destructive-foreground bg-destructive text-destructive-foreground',
};

// `value` is what gets PERSISTED (the API stores these three fields as free
// text and hands them straight back to the <Select>), so it stays the exact
// French string it has always been — renaming it to the enum-ish `key` would
// orphan every appreciation already saved. `key` is only the translation
// lookup, same dynamic-key pattern as Gradebook.evaluationType.
const COMPORTEMENT_OPTIONS = [
  { value: 'Excellent', key: 'EXCELLENT' },
  { value: 'Satisfaisant', key: 'SATISFAISANT' },
  { value: 'À améliorer', key: 'A_AMELIORER' },
  { value: 'Perturbateur', key: 'PERTURBATEUR' },
] as const;
const INVESTISSEMENT_OPTIONS = [
  { value: 'Excellent', key: 'EXCELLENT' },
  { value: 'Satisfaisant', key: 'SATISFAISANT' },
  { value: 'À améliorer', key: 'A_AMELIORER' },
  { value: 'Insuffisant', key: 'INSUFFISANT' },
] as const;
const ASSIDUITE_OPTIONS = [
  { value: 'Régulier', key: 'REGULIER' },
  { value: 'Irrégulier', key: 'IRREGULIER' },
  { value: 'Absences répétées', key: 'ABSENCES_REPETEES' },
] as const;

const QUICK_PHRASE_KEYS = [
  'serious',
  'efforts',
  'insufficient',
  'satisfactory',
  'exemplary',
  'regularity',
] as const;

const COMMENT_MAX = 500;

function suggestMention(avg: number | null): Mention | null {
  if (avg == null) return null;
  if (avg < 8) return 'FAIBLE';
  if (avg < 10) return 'INSUFFISANT';
  if (avg < 11) return 'PASSABLE';
  if (avg < 12) return 'ASSEZ_BIEN';
  if (avg < 14) return 'BIEN';
  return 'TRES_BIEN';
}

interface SubjectRowState {
  text: string;
}

export default function SaisirAppreciationPage() {
  const t = useTranslations('Appreciations.saisie');
  const tMention = useTranslations('Appreciations.mention');
  const tComportement = useTranslations('Appreciations.saisie.comportement');
  const tInvestissement = useTranslations('Appreciations.saisie.investissement');
  const tAssiduite = useTranslations('Appreciations.saisie.assiduite');
  const tPhrases = useTranslations('Appreciations.saisie.quickPhrases');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const params = useParams<{ studentId: string }>();
  const searchParams = useSearchParams();

  const [data, setData] = useState<StudentAppreciationData | null>(null);
  const [roster, setRoster] = useState<AppreciationsListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [termId, setTermId] = useState(searchParams.get('termId') ?? '');

  const [mention, setMention] = useState<Mention | null>(null);
  const [text, setText] = useState('');
  const [comportement, setComportement] = useState('');
  const [investissement, setInvestissement] = useState('');
  const [assiduite, setAssiduite] = useState('');
  const [subjectRows, setSubjectRows] = useState<Record<string, SubjectRowState>>({});

  useEffect(() => {
    if (!user) return;
    const qs = termId ? `?termId=${termId}` : '';
    api<StudentAppreciationData>(`/api/school/students/${params.studentId}/appreciations${qs}`)
      .then((d) => {
        setData(d);
        setTermId(d.resolvedTermId ?? '');
        setMention(d.general?.mention ?? suggestMention(d.overallAverage));
        setText(d.general?.text ?? '');
        setComportement(d.general?.comportement ?? '');
        setInvestissement(d.general?.investissement ?? '');
        setAssiduite(d.general?.assiduite ?? '');
        const rows: Record<string, SubjectRowState> = {};
        for (const s of d.subjects) rows[s.subjectId] = { text: s.text ?? '' };
        setSubjectRows(rows);
        return api<AppreciationsListData>(
          `/api/school/classes/${d.classId}/appreciations?termId=${d.resolvedTermId}`,
        );
      })
      .then(setRoster)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setError(t('studentNotFound'));
          return;
        }
        setError(t('loadError'));
      });
  }, [user, params.studentId, termId, t]);

  const filledSubjects = useMemo(
    () => Object.values(subjectRows).filter((r) => r.text.trim() !== '').length,
    [subjectRows],
  );

  async function save(publish: boolean) {
    if (!data || !user) return;
    setSaving(true);
    setError(null);
    const status = publish ? 'PUBLISHED' : 'DRAFT';
    try {
      const generalResult = await submitOrQueue(
        {
          path: `/api/school/students/${data.studentId}/appreciations`,
          method: 'PUT',
          body: {
            termId: data.resolvedTermId,
            subjectId: null,
            mention,
            text,
            comportement,
            investissement,
            assiduite,
            status,
          },
          label: `Appréciation générale — ${data.firstName} ${data.lastName}`,
        },
        user.id,
      );
      const subjectResults = await Promise.all(
        data.subjects
          .filter((s) => (subjectRows[s.subjectId]?.text ?? '').trim() !== '')
          .map((s) =>
            submitOrQueue(
              {
                path: `/api/school/students/${data.studentId}/appreciations`,
                method: 'PUT' as const,
                body: {
                  termId: data.resolvedTermId,
                  subjectId: s.subjectId,
                  text: subjectRows[s.subjectId]!.text,
                  mention: suggestMention(s.average),
                  status,
                },
                label: `Appréciation — ${data.firstName} ${data.lastName} (${s.subjectName})`,
              },
              user.id,
            ),
          ),
      );
      const anyQueued = generalResult.queued || subjectResults.some((r) => r.queued);
      if (anyQueued) {
        toast(OFFLINE_SYNC.queuedToast, 'info');
      } else if (publish) {
        toast(t('validatedToast'), 'success');
      } else {
        toast(t('draftSavedToast'), 'success');
      }
      if (publish) {
        if (data.nextStudentId) {
          router.push(
            `/pedagogie/appreciations/${data.nextStudentId}/saisie?termId=${data.resolvedTermId}`,
          );
        } else {
          router.push('/pedagogie/appreciations');
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSaving(false);
    }
  }

  if (!user || (!data && !error)) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/pedagogie/appreciations"
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          {t('backToList')}
        </Link>
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      </div>
    );
  }

  const currentTermLabel = data.terms.find((term) => term.id === data.resolvedTermId)?.label ?? '';
  const prevName = roster?.students.find((s) => s.studentId === data.prevStudentId);
  const nextName = roster?.students.find((s) => s.studentId === data.nextStudentId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">
            {currentTermLabel} — {data.className}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/pedagogie/appreciations"
            className="flex w-fit items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold text-muted-foreground"
          >
            <ArrowLeft size={14} />
            {t('backToList')}
          </Link>
          <Button
            variant="ghost"
            className="w-fit border border-border"
            onClick={() => save(false)}
            loading={saving}
          >
            <Save size={14} />
            {t('saveDraft')}
          </Button>
          <Button className="w-fit" onClick={() => save(true)} loading={saving}>
            <Check size={14} />
            {t('validate')}
          </Button>
        </div>
      </div>

      {roster && (
        <Card className="flex-row items-center gap-3 p-3.5">
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {t('classProgress')}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${roster.totalCount ? (roster.saisieCount / roster.totalCount) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="text-xs font-bold whitespace-nowrap text-primary">
            {t(roster.totalCount > 1 ? 'progressCount.other' : 'progressCount.one', {
              count: roster.saisieCount,
              total: roster.totalCount,
            })}
          </span>
        </Card>
      )}

      <div className={ASIDE_GRID}>
        <div className="flex flex-col gap-4">
          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Settings2 size={14} className="text-primary" />
              {t('contextTitle')}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="mb-1 text-xs font-semibold text-foreground">{t('classLabel')}</div>
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
                  {data.className}
                </div>
              </div>
              <Select label={t('termLabel')} value={termId} onValueChange={setTermId}>
                {data.terms.map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.label}
                  </SelectItem>
                ))}
              </Select>
              <div>
                <div className="mb-1 text-xs font-semibold text-foreground">
                  {t('studentLabel')}
                </div>
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
                  {data.studentIndex} / {data.classSize}
                </div>
              </div>
            </div>
          </Card>

          <Card className="gap-3 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <User size={14} className="text-primary" />
                {t('selectedStudent')}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!data.prevStudentId}
                  onClick={() =>
                    data.prevStudentId &&
                    router.push(
                      `/pedagogie/appreciations/${data.prevStudentId}/saisie?termId=${data.resolvedTermId}`,
                    )
                  }
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground disabled:opacity-40"
                >
                  <ChevronLeft size={13} />
                  {t('previous')}
                </button>
                <button
                  type="button"
                  disabled={!data.nextStudentId}
                  onClick={() =>
                    data.nextStudentId &&
                    router.push(
                      `/pedagogie/appreciations/${data.nextStudentId}/saisie?termId=${data.resolvedTermId}`,
                    )
                  }
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground disabled:opacity-40"
                >
                  {t('next')}
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3.5 rounded-md bg-secondary p-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {data.firstName[0]}
                {data.lastName[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-foreground">
                  {data.firstName} {data.lastName}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('studentMeta', { number: data.studentNumber, className: data.className })}
                  {data.rank
                    ? ` · ${t(
                        data.rank === 1 ? 'provisionalRank.one' : 'provisionalRank.other',
                        { rank: data.rank },
                      )}`
                    : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="mb-0.5 text-2xs text-muted-foreground">{t('overallAverage')}</div>
                <div className="text-xl font-extrabold text-foreground">
                  {fmtAverage(data.overallAverage, locale)}
                </div>
                <div className="text-2xs text-muted-foreground">/20</div>
              </div>
            </div>

            {roster && roster.students.length > 1 && (
              <div className="max-h-[180px] overflow-y-auto rounded-md border border-border">
                {roster.students.map((s) => (
                  <button
                    key={s.studentId}
                    type="button"
                    onClick={() =>
                      router.push(
                        `/pedagogie/appreciations/${s.studentId}/saisie?termId=${data.resolvedTermId}`,
                      )
                    }
                    className={`flex w-full items-center gap-2.5 border-b border-border px-3 py-2 text-left last:border-b-0 ${s.studentId === data.studentId ? 'bg-secondary' : 'hover:bg-muted'}`}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground">
                      {s.firstName[0]}
                      {s.lastName[0]}
                    </span>
                    <span
                      className={`flex-1 truncate text-caption ${s.studentId === data.studentId ? 'font-semibold text-primary' : 'text-foreground'}`}
                    >
                      {s.firstName} {s.lastName}
                    </span>
                    <span className="text-xs font-bold text-muted-foreground">
                      {fmtAverage(s.average, locale)}
                    </span>
                    {s.status === 'PUBLISHED' ? (
                      <CheckCircle2 size={13} className="text-success-foreground" />
                    ) : (
                      <Clock size={13} className="text-warning-foreground" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Star size={14} className="text-primary" />
              {t('generalTitle')}
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold text-foreground">{t('mentionLabel')}</div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {MENTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMention(m)}
                    className={`rounded-md border-2 px-2 py-2 text-center text-xs font-bold ${mention === m ? MENTION_BTN_CLASS[m] : 'border-border bg-card text-muted-foreground'}`}
                  >
                    {tMention(m)}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-border" />

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  {t('commentLabel')}{' '}
                  <span className="font-normal text-muted-foreground">{t('commentHint')}</span>
                </span>
                <span className="text-2xs text-muted-foreground">
                  {t('charCount', { count: text.length, max: COMMENT_MAX })}
                </span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, COMMENT_MAX))}
                rows={4}
                placeholder={t('commentPlaceholder')}
                className="w-full rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/10"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select
                label={t('comportementLabel')}
                value={comportement}
                onValueChange={setComportement}
              >
                <SelectItem value="">—</SelectItem>
                {COMPORTEMENT_OPTIONS.map((o) => (
                  <SelectItem key={o.key} value={o.value}>
                    {tComportement(o.key)}
                  </SelectItem>
                ))}
              </Select>
              <Select
                label={t('investissementLabel')}
                value={investissement}
                onValueChange={setInvestissement}
              >
                <SelectItem value="">—</SelectItem>
                {INVESTISSEMENT_OPTIONS.map((o) => (
                  <SelectItem key={o.key} value={o.value}>
                    {tInvestissement(o.key)}
                  </SelectItem>
                ))}
              </Select>
              <Select label={t('assiduiteLabel')} value={assiduite} onValueChange={setAssiduite}>
                <SelectItem value="">—</SelectItem>
                {ASSIDUITE_OPTIONS.map((o) => (
                  <SelectItem key={o.key} value={o.value}>
                    {tAssiduite(o.key)}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </Card>

          <Card className="gap-3 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <BookOpen size={14} className="text-primary" />
                {t('bySubjectTitle')}
              </div>
              <span className="text-xs text-muted-foreground">
                {t(data.subjects.length > 1 ? 'subjectsCount.other' : 'subjectsCount.one', {
                  count: data.subjects.length,
                  filled: filledSubjects,
                })}
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {data.subjects.map((s) => (
                <div
                  key={s.classSubjectId}
                  className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[140px_60px_70px_1fr] sm:items-start sm:gap-2.5"
                >
                  {/* `sm:contents` drops this wrapper from layout at `sm` and
                      up so the 3 fields resume their place as direct grid
                      columns — below that the fixed 140/60/70px columns
                      would leave the comment column ~40px wide, so they
                      become one row above the full-width textarea instead. */}
                  <div className="flex items-center gap-2 sm:contents">
                    <span className="text-caption font-semibold text-foreground sm:pt-2">
                      {s.subjectName}
                    </span>
                    <span className="text-xs text-muted-foreground sm:pt-2">
                      × {s.coefficient ?? 1}
                    </span>
                    <span className="sm:pt-1.5">
                      <span className="inline-flex min-w-[44px] items-center justify-center rounded-md bg-muted px-2 py-1 text-xs font-bold text-foreground">
                        {fmtAverage(s.average, locale)}
                      </span>
                    </span>
                  </div>
                  <textarea
                    value={subjectRows[s.subjectId]?.text ?? ''}
                    onChange={(e) =>
                      setSubjectRows((prev) => ({
                        ...prev,
                        [s.subjectId]: { text: e.target.value.slice(0, 300) },
                      }))
                    }
                    rows={2}
                    placeholder={t('subjectPlaceholder')}
                    className="w-full rounded-md border border-border bg-input px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground placeholder:italic focus:border-primary"
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex-row flex-wrap items-center justify-between gap-2 p-3.5">
            {prevName ? (
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/pedagogie/appreciations/${prevName.studentId}/saisie?termId=${data.resolvedTermId}`,
                  )
                }
                className="flex min-w-0 max-w-full items-center gap-1.5 text-sm font-medium text-muted-foreground"
              >
                <ArrowLeft size={14} className="shrink-0" />
                <span className="truncate">
                  {t('prevStudent', { name: `${prevName.firstName} ${prevName.lastName}` })}
                </span>
              </button>
            ) : (
              <span />
            )}
            {/* Order-first on mobile: the real save actions outrank the
                prev/next nav, which wraps below them instead of squeezing
                the row. */}
            <div className="order-first flex w-full flex-wrap items-center gap-2 sm:order-none sm:w-auto">
              <Button
                variant="ghost"
                className="w-fit border border-border"
                onClick={() => save(false)}
                loading={saving}
              >
                <Save size={14} />
                {t('saveDraft')}
              </Button>
              <Button className="w-fit" onClick={() => save(true)} loading={saving}>
                <Check size={14} />
                {t('validateAndNext')}
              </Button>
            </div>
            {nextName ? (
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/pedagogie/appreciations/${nextName.studentId}/saisie?termId=${data.resolvedTermId}`,
                  )
                }
                className="flex min-w-0 max-w-full items-center gap-1.5 text-sm font-medium text-muted-foreground"
              >
                <span className="truncate">
                  {t('nextStudent', { name: `${nextName.firstName} ${nextName.lastName}` })}
                </span>
                <ArrowRight size={14} className="shrink-0" />
              </button>
            ) : (
              <span />
            )}
          </Card>

          {error && (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <BarChart2 size={14} className="text-primary" />
              {t('summaryTitle')}
            </div>
            <div className="flex flex-col items-center gap-1.5 text-center">
              <div className="flex h-13 w-13 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">
                {data.firstName[0]}
                {data.lastName[0]}
              </div>
              <div className="text-sm font-bold text-foreground">
                {data.firstName} {data.lastName}
              </div>
              <div className="text-xs text-muted-foreground">
                {data.className} · #{data.studentNumber}
              </div>
            </div>
            <div className="h-px bg-border" />
            <InfoRow
              label={t('info.overallAverage')}
              value={`${fmtAverage(data.overallAverage, locale)} / 20`}
            />
            <InfoRow
              label={t('info.rank')}
              value={
                data.rank
                  ? t(data.rank === 1 ? 'rankValue.one' : 'rankValue.other', {
                      rank: data.rank,
                      total: data.rankedCount,
                    })
                  : '—'
              }
            />
            <InfoRow label={t('info.absences')} value="—" />
            <InfoRow label={t('info.lateArrivals')} value="—" />
            <InfoRow
              label={t('info.classAverage')}
              value={`${fmtAverage(data.classAverage, locale)} / 20`}
            />
            {data.subjects.length > 0 && (
              <div className="mt-1">
                <div className="mb-1.5 text-2xs text-muted-foreground">{t('subjectGrades')}</div>
                <div className="flex flex-col gap-1.5">
                  {data.subjects.map((s) => (
                    <div key={s.classSubjectId}>
                      <div className="mb-0.5 flex justify-between text-2xs">
                        <span className="font-medium text-foreground">{s.subjectName}</span>
                        <span className="font-bold text-foreground">
                          {fmtAverage(s.average, locale)}
                        </span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${s.average != null ? (s.average / 20) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="gap-2 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Zap size={14} className="text-primary" />
              {t('quickPhrasesTitle')}
            </div>
            <p className="text-2xs text-muted-foreground">{t('quickPhrasesSubtitle')}</p>
            <div className="flex flex-col gap-1.5">
              {QUICK_PHRASE_KEYS.map((phraseKey) => {
                const phrase = tPhrases(phraseKey);
                return (
                  <button
                    key={phraseKey}
                    type="button"
                    onClick={() =>
                      setText((prev) =>
                        (prev ? `${prev.trim()} ${phrase}` : phrase).slice(0, COMMENT_MAX),
                      )
                    }
                    className="rounded-md border border-border px-2.5 py-2 text-left text-2xs text-foreground hover:bg-muted"
                  >
                    {phrase}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-caption">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
```

Behaviour notes for this rewrite (all deliberate, all already reflected in the code block above):
- The local `MENTION_OPTIONS` array is deleted in favour of the shared `MENTIONS` from `../../types` — same six values in the same order, so the 6-button grid is unchanged. `MENTION_BTN_CLASS` stays local (pure styling, no strings).
- The local `fmt()` is deleted; `fmtAverage(x, locale)` replaces it at its 5 call sites.
- `QUICK_PHRASES` (an array of 6 French literals) becomes `QUICK_PHRASE_KEYS` (6 stable identifiers) + the `saisie.quickPhrases.*` group. React's `key` moves from the phrase text to the stable key, which is strictly better — the old `key={phrase}` would have changed identity on every locale switch.
- `COMMENT_MAX = 500` is extracted so the `slice(0, 500)` calls and the `{count} / {max} caractères` counter can never drift apart. The per-subject textarea keeps its own inline `300` (a different limit, unchanged).
- The 3 option arrays keep their exact French `value`s (persisted payload untouched) and gain a `key` for the translation lookup — see the in-file comment above them.
- `'Erreur réseau. Réessaie.'` becomes `tCommon('errors.network')`, whose French text already reads "Erreur réseau. Réessayez." — the tutoiement violation fixes itself through the shared key.
- **`OFFLINE_SYNC` (import + `toast(OFFLINE_SYNC.queuedToast, 'info')`) and the two `submitOrQueue` `label:` strings are byte-identical to the original.** Verify with `git diff` before committing that these four lines show no change.
- The `data.terms.map/find` callbacks are renamed `t` → `term` so they no longer shadow the translator.
- The load effect lists `t` in its dependency array (`[user, params.studentId, termId, t]`).

- [ ] **Step 5: Delete `MENTION_LABEL` from `frontend/src/app/(school)/pedagogie/appreciations/types.ts`**

Its last importer just migrated. Full replacement for `types.ts` (identical to Task 1's version minus the `MENTION_LABEL` block and its `@deprecated` comment):

```typescript
export type Mention = 'TRES_BIEN' | 'BIEN' | 'ASSEZ_BIEN' | 'PASSABLE' | 'INSUFFISANT' | 'FAIBLE';
export type AppreciationStatus = 'NONE' | 'DRAFT' | 'PUBLISHED';

/** Display order for every mention picker, filter and chart in this module.
 * The labels themselves live in the `appreciations.mention.*` message
 * namespace — read them with `useTranslations('Appreciations.mention')`
 * and `t(mention)`. */
export const MENTIONS: Mention[] = [
  'TRES_BIEN',
  'BIEN',
  'ASSEZ_BIEN',
  'PASSABLE',
  'INSUFFISANT',
  'FAIBLE',
];

export interface TermOption {
  id: string;
  label: string;
  order: number;
}

export interface ClassOption {
  id: string;
  name: string;
}

export interface ListStudentRow {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  average: number | null;
  rank: number | null;
  mention: Mention | null;
  text: string | null;
  status: AppreciationStatus;
  authorName: string | null;
}

export interface SubjectSummaryRow {
  classSubjectId: string;
  subjectId: string;
  subjectName: string;
  teacherName: string | null;
  coefficient: number | null;
  classAverage: number | null;
  saisieCount: number;
  totalCount: number;
}

export interface AppreciationsListData {
  classId: string;
  className: string;
  homeroomTeacherName: string | null;
  terms: TermOption[];
  resolvedTermId: string | null;
  students: ListStudentRow[];
  subjects: SubjectSummaryRow[];
  totalCount: number;
  saisieCount: number;
  positiveCount: number;
  alertCount: number;
}

export interface GeneralAppreciation {
  mention: Mention | null;
  text: string | null;
  comportement: string | null;
  investissement: string | null;
  assiduite: string | null;
  status: AppreciationStatus;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectAppreciationRow {
  classSubjectId: string;
  subjectId: string;
  subjectName: string;
  coefficient: number | null;
  teacherName: string | null;
  average: number | null;
  mention: Mention | null;
  text: string | null;
  status: AppreciationStatus;
}

export interface StudentAppreciationData {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  classId: string;
  className: string;
  homeroomTeacherName: string | null;
  terms: TermOption[];
  resolvedTermId: string | null;
  studentIndex: number | null;
  classSize: number;
  prevStudentId: string | null;
  nextStudentId: string | null;
  overallAverage: number | null;
  classAverage: number | null;
  rank: number | null;
  rankedCount: number;
  general: GeneralAppreciation | null;
  subjects: SubjectAppreciationRow[];
}
```

Before running the gate, confirm the deletion is safe:

```bash
grep -rn "MENTION_LABEL" frontend/src/app/\(school\)/pedagogie/
```

Expected: no output. (`frontend/src/app/(school)/eleves/mention-label.ts` mentions the name only inside a comment and is a different module — leave it alone.)

- [ ] **Step 6: Typecheck and lint**

Run: `cd frontend && pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/messages/fr/appreciations.json frontend/src/messages/ht/appreciations.json frontend/src/messages/en/appreciations.json "frontend/src/app/(school)/pedagogie/appreciations/[studentId]/saisie/page.tsx" "frontend/src/app/(school)/pedagogie/appreciations/types.ts"
git commit -m "feat(i18n): translate appreciation entry form, fix tutoiement + quick-phrase grammar"
```

---

### Task 7: CLAUDE.md documentation update + full gate

**Files:**
- Modify: `CLAUDE.md` (the **Internationalisation (FR/Créole haïtien/EN)** paragraph — one very long single paragraph, currently starting at line 143)

**Interfaces:**
- Consumes: the finished state of Tasks 1–6 (namespace count, migrated-screen list).
- Produces: nothing.

**Read the file first.** This paragraph is edited by every i18n phase, and concurrent sessions may have touched it again since this plan was written. The three fragments below are quoted **exactly as they read at plan-writing time** — diff your live read against them before editing, and if a fragment has shifted, apply the equivalent change to whatever the current wording is rather than forcing this one.

- [ ] **Step 1: Bump the namespace count**

Current text (fragment):

> across 20 message namespaces tracked in `MESSAGE_NAMESPACES`

Replace with:

> across 21 message namespaces tracked in `MESSAGE_NAMESPACES`

(21 = the 20 that existed before this plan + `appreciations`. If your live read shows a different number, it means a concurrent session added another namespace — use *their* number + 1.)

- [ ] **Step 2: Document the Appréciations migration**

Current text (fragment — this is the tail of the sentence that documents the Carnet de notes migration):

> and the Carnet de notes (grade book) screen under Pédagogie is now fully translated as well (`gradebook` namespace) — its `TYPE_LABEL`/evaluation-status ternaries, previously duplicated and inconsistent across files, are now single sources of truth (`gradebook.evaluationType.*`/`gradebook.evaluationStatus.*`), and its `fmtDate()` helper's hardcoded `'fr-FR'` locale is fixed to follow the app locale like every other date-formatting call site.

Append this sentence immediately after it (inside the same paragraph):

> The Appréciations (report-card comments) screen under Pédagogie is translated too (`appreciations` namespace, covering the class list, the per-student detail, the entry form and the Par matière/Statistiques tabs) — its `MENTION_LABEL` map became the `appreciations.mention.*` key group (deliberately independent from the already-migrated `Eleves.mention`, per the one-namespace-per-screen convention), its five duplicated `fmt()`/`mentionClass()`/`moyColor()` copies were consolidated into a locale-aware `pedagogie/appreciations/format.ts` (so an average renders `15,3` in fr/ht and `15.3` in en instead of always forcing a French comma), and its own `fmtDate()` `'fr-FR'` hardcode is fixed the same way the grade book's was; the three Comportement/Investissement/Assiduité `<Select>`s keep their French **values** by design (they are persisted free-form strings the API round-trips — only their visible labels are translated), and the `submitOrQueue` offline-queue item labels stay French alongside the fenced `OFFLINE_SYNC` constant, same as the grade book's.

- [ ] **Step 3: Remove Appréciations from the still-French list**

Current text (fragment):

> Every other screen (Pédagogie (Carnet de notes and Présences migrated; Appréciations/Emploi du temps still French), Scolarité, the rest of `/admin/*` beyond the dashboard) still reads French from `constants.ts` unchanged

Replace with:

> Every other screen (Pédagogie (Carnet de notes, Présences and Appréciations migrated; Emploi du temps still French), Scolarité, the rest of `/admin/*` beyond the dashboard) still reads French from `constants.ts` unchanged

- [ ] **Step 4: Full gate**

Run: `cd frontend && pnpm typecheck && pnpm lint && pnpm test`
Expected: all clean, no new failures.

Two known conditions to recognise rather than chase:
- `locales.test.ts` is the one test that actually exercises this plan's work — it must pass. If it fails on a key-set mismatch, the cause is almost always one locale's JSON missing a key another has (or a stray second `_review`); diff the three files' key trees.
- A pre-existing `offline-queue.test.ts` flake has appeared in several prior phases. The established protocol before concluding it is the same pre-existing issue: confirm a zero-diff on `frontend/src/lib/offline-queue.ts` and its test file (`git diff --stat` — this plan touches neither), then rerun that file standalone 3 times (`pnpm exec vitest run src/lib/offline-queue.test.ts`).

- [ ] **Step 5: Manual verification (all 3 locales)**

With `pnpm dev` running, log in as the seeded dev account and switch language via the app's own `LanguagePicker` UI (Paramètres › Langue) — **not** by hand-editing the `sg-locale` cookie. For each of fr / ht / en, walk:
1. `/pedagogie/appreciations` — all 4 tabs (Par élève, Par matière, Statistiques, En attente), the mention filter, the CSV export (open the downloaded file and check its headers + status column), and the pagination footer.
2. `/pedagogie/appreciations/<studentId>` — the position line, both stub-toast buttons, the per-subject table, the stats/quick-actions panels, and both date rows.
3. `/pedagogie/appreciations/<studentId>/saisie` — the 6 mention buttons, all 3 option Selects, the character counter, the 6 quick phrases, and the prev/next student nav.

Two things to watch specifically:
- The `mention.*` labels must render identically across all 4 consumers (list, detail, saisie, Statistiques) — they share one key group now.
- `fmtAverage` must actually switch separator per locale (`15,3` in fr/ht, `15.3` in en), not just translate the labels around it.

And one data-safety check: in `saisie`, pick a value in each of the 3 Selects, save, reload, and confirm the value comes back selected — that proves the persisted French `value`s still round-trip after the label translation.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(i18n): document Appréciations migration in CLAUDE.md"
```

---

## Self-Review Notes

**Spec coverage.** Every section of `docs/superpowers/specs/2026-08-20-i18n-appreciations-design.md` maps to a task:

| Spec section | Where implemented |
|---|---|
| Scope — 6 in-scope files | `types.ts` (Tasks 1 + 6), `StatistiquesTab.tsx` (2), `ParMatiereTab.tsx` (3), `page.tsx` (4), `[studentId]/page.tsx` (5), `[studentId]/saisie/page.tsx` (6) |
| Architecture (`next-intl` registry additions) | Task 1, Step 4 (all three files) + Step 7's `locales.test.ts` run |
| Namespace & message-file design (6 key groups) | `mention` (1), `statistiques` (2), `parMatiere` (3), `list` (4), `detail` (5), `saisie` (6) |
| Decision — vouvoiement (2 violations + 1 grammar fix) | `list.noClasses` (4), `common.errors.network` (6), `saisie.quickPhrases.serious` (6) |
| Decision — `fmtDate()`'s `'fr-FR'` bug | Task 5 (`useLocale()` + `LOCALE_BCP47`, mirroring `eleves/[id]/AppreciationsTab.tsx`) |
| Decision — 5× `fmt()` / 2× `mentionClass()` / 2× `moyColor()` consolidation | Task 1 creates `format.ts`; Tasks 2–6 delete their local copies and import it |
| Decision — `MENTION_LABEL` gets its own namespace, independent from `Eleves.mention` | Task 1 (key group) + Global Constraints (explicit "do not deduplicate") |
| Decision — stub-feature toasts stay in scope | Task 5 (`messagingSoon`, `reportCardsSoon`, `classCouncilSoon`, `auditHistorySoon`) |
| Cross-dependency fences (`OFFLINE_SYNC`, `exportToCsv`) | Global Constraints + Task 6's byte-identical verification step |
| Testing plan | Task 1 Step 7 (`locales.test.ts`), Task 7 Steps 4–5 (full gate + 3-locale manual walk) |

Two additions beyond the spec's literal text, both flagged in the Global Constraints rather than left implicit: the rank-ordinal `.one`/`.other` key groups (the source hardcodes French `"e"` suffixes in 3 places — same bug class as the two the spec *did* catch), and the `{ value, key }` shape for the 3 option Selects (the spec says "migrate to dynamic-key namespace entries"; doing that naively would change persisted API payloads, so the value half is pinned).

**Placeholder scan.** No "TBD", no "TODO", no "add appropriate X", no "similar to Task N", no elided code. Every `.tsx`/`.ts` code block is the complete literal file content, and every JSON block is the complete literal key group in all 3 locales. Two files appear twice on purpose (`types.ts` in Tasks 1 and 6, both times in full) — the reason is stated in both places.

**Type consistency (checked by cross-reading all 7 tasks).**
- `Mention` — the union type name is unchanged from the original `types.ts` and referenced identically in `format.ts` (`mentionClass(mention: Mention | null)`), Task 2 (`Map<Mention, number>`, `{ mention: Mention; count: number }`) and Task 6 (`Record<Mention, string>`, `useState<Mention | null>`, `suggestMention(): Mention | null`). Tasks 4 and 5 deliberately do **not** import it — both notes say so explicitly, and neither code block references it.
- `format.ts` exports — `fmtAverage(value: number | null, locale: LocaleKey): string`, `mentionClass(mention: Mention | null): string`, `moyColor(value: number | null): string`. Import lines verified per task: Task 2 `{ fmtAverage }` from `'./format'`, Task 3 `{ fmtAverage, moyColor }` from `'./format'`, Task 4 `{ fmtAverage, mentionClass, moyColor }` from `'./format'`, Task 5 `{ fmtAverage, mentionClass }` from `'../format'`, Task 6 `{ fmtAverage }` from `'../../format'`. Relative depths match each file's actual location, and no task imports a symbol it does not use (an unused import would fail `pnpm lint`).
- `MENTIONS` — declared once in Task 1's `types.ts`, re-declared identically in Task 6's `types.ts`, imported by Tasks 2 (`'./types'`), 4 (`'./types'`) and 6 (`'../../types'`). Not imported by Tasks 3 or 5, neither of which iterates mentions.
- `locale` — every call site passes the value of `useLocale()`, whose type is narrowed to `LocaleKey` by the `AppConfig['Locale']` augmentation in `next-intl.d.ts`, so `fmtAverage(x, locale)` and `LOCALE_BCP47[locale]` both typecheck without a cast under `noUncheckedIndexedAccess`.
- Key paths — `Appreciations.mention`, `Appreciations.statistiques`, `Appreciations.parMatiere`, `Appreciations.list`, `Appreciations.detail`, `Appreciations.saisie` (plus the three sub-namespace translators `Appreciations.saisie.{comportement,investissement,assiduite}` and `Appreciations.saisie.quickPhrases`). The `Appreciations` messages key matches the `appreciations.json` filename registered in Task 1's `request.ts` and `next-intl.d.ts` blocks. Every `t('…')` call in Tasks 2–6 was checked against the JSON group appended in that same task; the `.one`/`.other` leaf pairs exist in all 3 locales in every plural group (`statistiques.completionRateSub`, `statistiques.topMentionSub`, `list.summary.recordedSub`, `list.resultsCount`, `detail.stats.rankValue`, `saisie.progressCount`, `saisie.provisionalRank`, `saisie.subjectsCount`, `saisie.rankValue`) — this is exactly what `locales.test.ts` would fail on.

**Intra-task contradiction check** (the defect class a prior phase's pre-flight scan caught — a note telling the implementer to do the opposite of what the code block does). Every "Behaviour note" was re-read against its own task's code block:
- Task 2's note says import `fmtAverage` **only**, not `mentionClass` — the code block's import line is `import { fmtAverage } from './format';`. Consistent.
- Task 4's note says `type Mention` is no longer imported — the code block's `./types` import is `{ MENTIONS, type AppreciationsListData, type TermOption }`, with no `Mention`. Consistent. The same note says `SummaryCard`'s `tone: t` shadowing is pre-existing and must be left alone — the code block leaves it verbatim. Consistent.
- Task 5's note says `moyColor` is not consumed — the import line is `{ fmtAverage, mentionClass }`. Consistent. It also says `type Mention` is dropped — the type import is `{ StudentAppreciationData }` only. Consistent.
- Task 6's note says `OFFLINE_SYNC` and the two `submitOrQueue` labels are byte-identical — the code block reproduces all four lines exactly as the original file has them (import on its own line after `submitOrQueue`, the `toast(OFFLINE_SYNC.queuedToast, 'info');` branch, and both French `label:` template literals). Consistent. The note also says `MENTION_BTN_CLASS` stays local — it is present in the code block, unchanged. Consistent.
- Task 1's note says `MENTION_LABEL` is deliberately kept — the code block keeps it (with a `@deprecated` marker). Task 6's note says it is now deleted — Task 6's `types.ts` block omits it. No task says "do not declare X" while declaring X.

**Ordering/dependency check.** Task 1 lands `format.ts`, `MENTIONS`, and the namespace before any consumer; nothing in Tasks 2–6 imports a symbol that does not yet exist at that point in the sequence. `MENTION_LABEL` survives until its final consumer migrates, so `pnpm typecheck` is green after every single task, not just at the end.

