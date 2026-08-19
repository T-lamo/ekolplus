# i18n Phase 1c — Dashboards + SidebarPlanCard + Registry Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Phase 1 of the i18n rollout by translating the two dashboards (school + admin), closing the `SidebarPlanCard` gap flagged in Plan 1a's and Plan 1b's final reviews, and closing the message-namespace registry-hardening gap flagged in both those reviews as "N plans old."

**Architecture:** Same `next-intl` "without routing" pattern used by every prior i18n plan — `useTranslations(namespace)` (client) reading `src/messages/{fr,ht,en}/<namespace>.json`, registered in `MESSAGE_NAMESPACES` (`src/lib/locales.ts`) and cross-checked against disk by `locales.test.ts`. No new infrastructure.

**Tech Stack:** Next.js 16 App Router, `next-intl`, TypeScript strict, Vitest, Puppeteer + Lighthouse for the closing E2E pass (scratch scripts, not committed).

**Spec:** [docs/superpowers/specs/2026-08-19-i18n-phase1-shell-nav-design.md](../specs/2026-08-19-i18n-phase1-shell-nav-design.md) (Phase 1's spec — item 3 of its scope, "Dashboards"). Builds on Plan 1a ([2026-08-19-i18n-phase1a-registry-shell-nav.md](2026-08-19-i18n-phase1a-registry-shell-nav.md)) and Plan 1b ([2026-08-20-i18n-phase1b-auth-pages.md](2026-08-20-i18n-phase1b-auth-pages.md)), both merged to `develop`.

## Scope corrections found during this plan's research (read before dispatching any task)

The spec's "Current state" section says dashboards are "cleanly constants-driven (`DASHBOARD`, `ADMIN_DASHBOARD`), no stray inline strings found outside those objects." Direct inspection of every file under `(school)/dashboard/` and `admin/page.tsx` (not just the 3 files the spec's file list names) found this incomplete in four ways. Each is a ruling, not a question — carried into the relevant task below:

1. **The spec's 3-file inventory undercounts by 8 files**, exactly like Plan 1a's `SidebarPlanCard` miss. `DASHBOARD` isn't consumed only by `(school)/dashboard/page.tsx` and `activites/page.tsx` — 8 sibling card components (`KpiRow`, `AveragesTrendCard`, `LevelDistributionCard`, `FeesSummaryRow`, `AttendanceByClassCard`, `SubjectPerformanceCard`, `TodoListCard`, `RecentActivityCard`) and one shared helper module (`activity-shared.ts`) each import slices of the same `DASHBOARD` constant. All are in scope under the single `Dashboard` namespace the spec already named — this is a file-count correction, not a scope change.
2. **`DASHBOARD` has a 4th, server-side consumer the spec's grep-before-deletion note didn't anticipate**: `src/lib/server/activity-log.ts` calls `DASHBOARD.activity.{gradeUpdated,absenceMarked,paymentRecorded,studentEnrolled}` to build the `text` field of activity-feed items — server-generated, always-French narrative text, not a client-side render. Translating server-generated freeform text is "server message normalization" (Phase 0 roadmap item 6), which this spec's own "Explicitly out of scope" list excludes. **Ruling: these 4 formatter functions stay in `constants.ts`, untranslated, not deleted.** Task 7 shrinks `DASHBOARD` to just that sub-object instead of deleting it outright — grep-confirmed in Task 7, not assumed.
3. **`admin/page.tsx` also imports `ADMIN_SAAS`** (`orgRole`, `subscriptionStatus` labels), a constant shared with 7 other `/admin/*` files (`users`, `schools`, `billing/coupons`, `billing/transactions`, `billing/subscriptions`) that are all explicitly out of scope for Phase 1 (future "Admin back-office" phase). **Ruling: `ADMIN_SAAS`-sourced labels in `admin/page.tsx` stay untouched** — Task 4 migrates only the `ADMIN_DASHBOARD`-sourced strings plus the one genuine stray literal (`élèves`), not anything sourced from `ADMIN_SAAS`.
4. **Several genuine inline strings exist outside the constants objects**: two `setError(...)` calls (`dashboard/page.tsx`, `activites/page.tsx`), an `"Année {label}"` badge (`dashboard/page.tsx`), four empty-state sentences (`AveragesTrendCard`, `LevelDistributionCard`, `AttendanceByClassCard`, `SubjectPerformanceCard`), the `relativeTimeFr()` helper's three hardcoded phrases (`activity-shared.ts`), and one `élèves` suffix in `admin/page.tsx`'s transactions table. All are folded into the relevant task below with exact keys.

**A second, independent finding**: three call sites hardcode `'fr-FR'` in `toLocaleDateString`/`toLocaleString`/`toLocaleTimeString` regardless of the active locale (`FeesSummaryRow.tsx`, `activity-shared.ts`, `admin/page.tsx` ×2). A translated page that still renders "15 janvier 2026" for an English-reading user is not actually translated. Task 1 adds a small `LOCALE_BCP47` map to `src/lib/locales.ts`; Tasks 2–4 use it at those exact call sites.

## Global Constraints

- **French register: vouvoiement**, no exceptions (per Phase 1's user-approved decision, already applied throughout Plans 1a/1b). None of this plan's new copy uses a "tu/vous"-marked verb, so this is a non-issue in practice — noted for completeness.
- **Message-namespace registry**: every new namespace gets an entry in `MESSAGE_NAMESPACES` (`src/lib/locales.ts`) in the same task that creates its `fr`/`ht`/`en` JSON files, matching the existing convention.
- **Haitian Creole `_review` flag**: every `ht/*.json` file created by this plan carries a top-level `_review` key with this exact text (copied verbatim, not paraphrased): `"Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production."`
- **Language/plan-tier names are never translated.** `PLAN_LABELS` values ("Établissement Pro", "Enterprise", "Starter") are product-tier names, not UI copy — they flow into `SchoolPlanCard` messages as an interpolated `{plan}` value, never as a translated string, and `src/lib/billing-plans.ts` itself is never touched by this plan.
- **`ADMIN_SAAS` and everything under `src/components/school/billing/` other than `plan-presentation.ts`/`SidebarPlanCard.tsx` are out of scope.** Both are shared with files well outside Phase 1's file list (the rest of `/admin/*`, the whole `/abonnement` billing subsystem). Do not migrate, rename, or otherwise touch them.
- **`fmtDateShort`/`fmtDateLong`/`fmtPeriodMonth`** (`src/components/school/billing/billing-format.ts`) stay hardcoded to `'fr-FR'` — they're shared with the out-of-scope billing subsystem. `SchoolPlanCard`'s translated sentences will therefore show a French-formatted date even in EN/HT locales. This is a **deliberate, recorded limitation**, not a bug to fix now: `billing-format.ts` becomes locale-aware only when the billing subsystem itself gets its own future migration phase.
- **Constants.ts formatter functions shaped `(n) => \`${n} x${n > 1 ? 's' : ''}\`` convert to two translation keys, `.one` and `.other`, selected by the exact same `n > 1` condition in the calling component** — not ICU `{n, plural, ...}` syntax. This preserves today's exact behavior (including the `n === 0` case, which the source code always renders as singular) instead of introducing CLDR plural-rule differences across locales. `{n}`-only interpolations (no branching) use a plain ICU placeholder.
- Before deleting anything from `constants.ts` in Task 7, confirm zero remaining importers via `grep`, not assumption — same discipline as Plans 1a/1b.
- Full-repo gate (`pnpm format && pnpm lint && pnpm typecheck && pnpm test`) must be green before every commit that touches shared registry files (Tasks 1, 7) and is the mandatory last step of Task 7.

---

## Task 1: Registry hardening — cross-check `i18n/request.ts` / `next-intl.d.ts` against `MESSAGE_NAMESPACES` + `LOCALE_BCP47` helper

This closes the gap flagged in both Plan 1a's and Plan 1b's final reviews ("now 3 plans old"): `locales.test.ts` verifies `MESSAGE_NAMESPACES` against disk, but nothing verifies `src/i18n/request.ts`'s `Promise.all` import list or `src/types/next-intl.d.ts`'s `Messages` interface — a namespace added to the registry and disk but forgotten in either file still passes `pnpm test`, only failing at runtime as `MISSING_MESSAGE` for non-French users. Do this task **first**, exactly like Plan 1a's Task 1 hardened the disk-sync check first — before this plan's own new namespaces (Tasks 2, 4, 5) can silently repeat the mistake.

**Files:**
- Modify: `frontend/src/lib/locales.test.ts`
- Modify: `frontend/src/lib/locales.ts`

**Interfaces:**
- Consumes: `MESSAGE_NAMESPACES`, `LocaleKey` from `./locales` (already exported).
- Produces: `LOCALE_BCP47: Record<LocaleKey, string>` exported from `src/lib/locales.ts` — consumed by Task 3 (`activity-shared.ts`), Task 4 (`admin/page.tsx`), and (via `FeesSummaryRow.tsx`) Task 2.

- [ ] **Step 1: Add the `LOCALE_BCP47` map to `locales.ts`**

Add this immediately after the `MESSAGE_NAMESPACES` block (after its `export type MessageNamespace = ...` line):

```ts
/** BCP-47 tag for native `Intl`/`toLocaleDateString` calls. Haitian Creole
 * has no distinct number/date-formatting convention in wide practical use in
 * Haiti — it maps to French (the shared administrative register) rather
 * than a bare `'ht'` tag the JS engine would otherwise silently fall back
 * on. Add call sites here, not ad hoc `'fr-FR'` literals, whenever a new
 * screen formats a date or number. */
export const LOCALE_BCP47: Record<LocaleKey, string> = {
  fr: 'fr-FR',
  ht: 'fr-FR',
  en: 'en-US',
};
```

- [ ] **Step 2: Write the two new cross-check `describe` blocks in `locales.test.ts`**

Add this immediately after the existing `describe('message-namespace registry stays in sync with disk', ...)` block (which ends around line 91), before the `keyPaths` helper:

```ts
// request.ts and next-intl.d.ts stay hand-written explicit lists (Next's
// bundler and TypeScript's structural typing both need real, static
// declarations — MESSAGE_NAMESPACES can't replace either) — but a
// namespace added to the registry+disk and forgotten in either file must
// fail here instead of throwing MISSING_MESSAGE at runtime for non-French
// users. Mirrors runtime-enforcement.test.ts's readFileSync + toContain
// pattern.
const REQUEST_SRC = readFileSync(join(__dirname, '..', 'i18n', 'request.ts'), 'utf8');
const TYPES_SRC = readFileSync(join(__dirname, '..', 'types', 'next-intl.d.ts'), 'utf8');

function pascalCase(namespace: string): string {
  return namespace.charAt(0).toUpperCase() + namespace.slice(1);
}

describe('message-namespace registry stays in sync with i18n/request.ts', () => {
  it.each(MESSAGE_NAMESPACES)('%s: imported from the message file', (namespace) => {
    expect(REQUEST_SRC).toContain('`../messages/${locale}/' + namespace + '.json`');
  });

  it.each(MESSAGE_NAMESPACES)('%s: returned under its PascalCase key', (namespace) => {
    expect(REQUEST_SRC).toContain(`${pascalCase(namespace)}: ${namespace}.default`);
  });
});

describe('message-namespace registry stays in sync with next-intl.d.ts', () => {
  it.each(MESSAGE_NAMESPACES)('%s: imported as a type from the fr message file', (namespace) => {
    expect(TYPES_SRC).toContain(`import type ${namespace} from '@/messages/fr/${namespace}.json'`);
  });

  it.each(MESSAGE_NAMESPACES)('%s: declared under AppConfig.Messages', (namespace) => {
    expect(TYPES_SRC).toContain(`${pascalCase(namespace)}: typeof ${namespace};`);
  });
});
```

- [ ] **Step 3: Run the full test file, confirm it's currently green**

```bash
cd frontend
pnpm exec vitest run src/lib/locales.test.ts
```

Expected: PASS, all `it.each` blocks green — the 10 existing namespaces are already correctly wired in both files (verified by reading them during this plan's research), so this step only proves the new assertions are correct, not that they find a bug. They exist to catch Tasks 2/4/5 if those tasks forget a namespace, and to catch any future plan that repeats the mistake.

- [ ] **Step 4: Typecheck, lint, full test suite**

```bash
pnpm typecheck && pnpm lint && pnpm exec vitest run
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/locales.ts frontend/src/lib/locales.test.ts
git commit -m "$(cat <<'EOF'
test(i18n): cross-check i18n/request.ts and next-intl.d.ts against MESSAGE_NAMESPACES

Add LOCALE_BCP47 for locale-aware date/number formatting.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `Dashboard` namespace — registration + `(school)/dashboard/page.tsx` + `KpiRow` + `FeesSummaryRow` + `TodoListCard`

Creates the full `Dashboard` namespace (all keys needed by this task **and** Task 3, since both share one JSON file) and migrates the page shell plus the three simplest card components. Task 3 migrates the remaining five files against the JSON this task writes — it adds no new keys.

**Files:**
- Create: `frontend/src/messages/fr/dashboard.json`, `frontend/src/messages/ht/dashboard.json`, `frontend/src/messages/en/dashboard.json`
- Modify: `frontend/src/lib/locales.ts` (add `'dashboard'` to `MESSAGE_NAMESPACES`)
- Modify: `frontend/src/i18n/request.ts` (add the `dashboard` import/destructure/return entry)
- Modify: `frontend/src/types/next-intl.d.ts` (add the `dashboard` type import + `Dashboard` interface entry)
- Modify: `frontend/src/app/(school)/dashboard/page.tsx`
- Modify: `frontend/src/app/(school)/dashboard/KpiRow.tsx`
- Modify: `frontend/src/app/(school)/dashboard/FeesSummaryRow.tsx`
- Modify: `frontend/src/app/(school)/dashboard/TodoListCard.tsx`

**Interfaces:**
- Produces: the `Dashboard` namespace (all keys below) — Task 3 consumes `Dashboard.averagesTrend.*`, `Dashboard.levelDistribution.*`, `Dashboard.attendanceByClass.*`, `Dashboard.subjectPerformance.*`, `Dashboard.activity.*` (including `Dashboard.activity.relativeTime.*`), `Dashboard.activityLog.*` from this same JSON without adding to it.
- Consumes: `LOCALE_BCP47` from `@/lib/locales` (Task 1).

- [ ] **Step 1: Write `frontend/src/messages/fr/dashboard.json`**

```json
{
  "title": "Tableau de bord",
  "subtitle": "Bienvenue, {name} — voici l'aperçu de l'établissement",
  "export": "Export",
  "academicYearBadge": "Année {label}",
  "loadError": "Impossible de charger le tableau de bord.",
  "emptyYear": "Aucune année scolaire active — configure d'abord l'année scolaire dans « Paramètres ».",
  "kpis": {
    "students": "Élèves inscrits",
    "teachers": "Enseignants",
    "classes": "Classes actives",
    "subjects": "Matières",
    "attendanceRate": "Taux de présence",
    "attendanceRateSub": "Cette semaine",
    "thisMonth": "ce mois"
  },
  "averagesTrend": {
    "title": "Évolution des moyennes",
    "subtitle": "Année scolaire {yearLabel}",
    "seriesLabel": "Moyenne générale",
    "empty": "Aucune moyenne publiée sur la période.",
    "noData": "Aucune donnée"
  },
  "levelDistribution": {
    "title": "Répartition par niveau",
    "subtitle": "Élèves inscrits",
    "centerLabel": "élèves",
    "empty": "Aucun élève inscrit."
  },
  "fees": {
    "title": "Suivi des frais de scolarité",
    "seeDetails": "Voir les détails →",
    "collected": "Total Recouvré",
    "collectedLabel": "collecté",
    "paid": "Payé",
    "remaining": "Restant",
    "overdueStudents": "Élèves en Retard",
    "overdueLabel": "en retard",
    "upToDate": "À jour",
    "studentsConcerned": {
      "one": "{n} élève concerné",
      "other": "{n} élèves concernés"
    },
    "nextDue": "Prochaine Échéance",
    "daysUntil": {
      "today": "Aujourd'hui",
      "tomorrow": "Demain",
      "inNDays": "Dans {n} jours"
    },
    "trancheProgress": "Avancement des tranches",
    "noFeeData": "Aucune structure de frais configurée pour le moment."
  },
  "attendanceByClass": {
    "title": "Taux de présence",
    "subtitle": "Par classe — ce mois",
    "details": "Détails →",
    "empty": "Aucune classe configurée."
  },
  "subjectPerformance": {
    "title": "Performance par matière",
    "subtitle": "Moyenne générale toutes classes",
    "empty": "Aucune note publiée sur la période."
  },
  "todos": {
    "title": "À traiter",
    "evaluationsToGrade": "Évaluations à corriger",
    "evaluationsOverdueLabel": "{n} en retard",
    "unjustifiedAbsences": "Absences non justifiées",
    "unjustifiedAbsencesSub": "Cette semaine",
    "teachersWithoutClass": "Enseignants sans classe assignée",
    "teachersWithoutClassSub": "À affecter",
    "overduePayments": "Paiements en retard",
    "overduePaymentsSub": "Relances à envoyer"
  },
  "activity": {
    "title": "Activité récente",
    "seeAll": "Tout voir",
    "empty": "Aucune activité récente.",
    "relativeTime": {
      "justNow": "à l'instant",
      "hoursAgo": "il y a {hours}h",
      "yesterdayAt": "Hier, {time}"
    }
  },
  "activityLog": {
    "title": "Journal d'activité",
    "subtitle": "Historique complet des évènements de l'établissement",
    "back": "Retour au tableau de bord",
    "filterAll": "Tous les types",
    "typeLabel": {
      "grade": "Notes",
      "absence": "Absences",
      "payment": "Paiements",
      "enrollment": "Inscriptions"
    },
    "empty": "Aucune activité pour le moment.",
    "resultCount": {
      "one": "{n} évènement",
      "other": "{n} évènements"
    },
    "loadError": "Impossible de charger l'activité."
  }
}
```

- [ ] **Step 2: Write `frontend/src/messages/en/dashboard.json`**

```json
{
  "title": "Dashboard",
  "subtitle": "Welcome, {name} — here's the overview of your school",
  "export": "Export",
  "academicYearBadge": "Year {label}",
  "loadError": "Unable to load the dashboard.",
  "emptyYear": "No active school year — set up the school year first in \"Settings\".",
  "kpis": {
    "students": "Enrolled students",
    "teachers": "Teachers",
    "classes": "Active classes",
    "subjects": "Subjects",
    "attendanceRate": "Attendance rate",
    "attendanceRateSub": "This week",
    "thisMonth": "this month"
  },
  "averagesTrend": {
    "title": "Average grades trend",
    "subtitle": "School year {yearLabel}",
    "seriesLabel": "Overall average",
    "empty": "No averages published for this period.",
    "noData": "No data"
  },
  "levelDistribution": {
    "title": "Breakdown by level",
    "subtitle": "Enrolled students",
    "centerLabel": "students",
    "empty": "No students enrolled."
  },
  "fees": {
    "title": "Tuition fee tracking",
    "seeDetails": "See details →",
    "collected": "Total Collected",
    "collectedLabel": "collected",
    "paid": "Paid",
    "remaining": "Remaining",
    "overdueStudents": "Students Overdue",
    "overdueLabel": "overdue",
    "upToDate": "Up to date",
    "studentsConcerned": {
      "one": "{n} student concerned",
      "other": "{n} students concerned"
    },
    "nextDue": "Next Due Date",
    "daysUntil": {
      "today": "Today",
      "tomorrow": "Tomorrow",
      "inNDays": "In {n} days"
    },
    "trancheProgress": "Installment progress",
    "noFeeData": "No fee structure configured yet."
  },
  "attendanceByClass": {
    "title": "Attendance rate",
    "subtitle": "By class — this month",
    "details": "Details →",
    "empty": "No classes configured."
  },
  "subjectPerformance": {
    "title": "Performance by subject",
    "subtitle": "Overall average across all classes",
    "empty": "No grades published for this period."
  },
  "todos": {
    "title": "To do",
    "evaluationsToGrade": "Assessments to grade",
    "evaluationsOverdueLabel": "{n} overdue",
    "unjustifiedAbsences": "Unjustified absences",
    "unjustifiedAbsencesSub": "This week",
    "teachersWithoutClass": "Teachers without an assigned class",
    "teachersWithoutClassSub": "To assign",
    "overduePayments": "Overdue payments",
    "overduePaymentsSub": "Reminders to send"
  },
  "activity": {
    "title": "Recent activity",
    "seeAll": "See all",
    "empty": "No recent activity.",
    "relativeTime": {
      "justNow": "just now",
      "hoursAgo": "{hours}h ago",
      "yesterdayAt": "Yesterday, {time}"
    }
  },
  "activityLog": {
    "title": "Activity log",
    "subtitle": "Full history of the school's events",
    "back": "Back to dashboard",
    "filterAll": "All types",
    "typeLabel": {
      "grade": "Grades",
      "absence": "Absences",
      "payment": "Payments",
      "enrollment": "Enrollments"
    },
    "empty": "No activity yet.",
    "resultCount": {
      "one": "{n} event",
      "other": "{n} events"
    },
    "loadError": "Unable to load the activity."
  }
}
```

- [ ] **Step 3: Write `frontend/src/messages/ht/dashboard.json`**

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "title": "Tablo debò",
  "subtitle": "Byenveni, {name} — men apèsi sou lekòl la",
  "export": "Ekspòte",
  "academicYearBadge": "Ane {label}",
  "loadError": "Nou pa ka chaje tablo debò a.",
  "emptyYear": "Pa gen ane eskolè aktif — konfigire ane eskolè a dabò nan « Paramèt ».",
  "kpis": {
    "students": "Elèv enskri",
    "teachers": "Pwofesè",
    "classes": "Klas aktif",
    "subjects": "Matyè",
    "attendanceRate": "To presans",
    "attendanceRateSub": "Semenn sa a",
    "thisMonth": "mwa sa a"
  },
  "averagesTrend": {
    "title": "Evolisyon mwayèn yo",
    "subtitle": "Ane eskolè {yearLabel}",
    "seriesLabel": "Mwayèn jeneral",
    "empty": "Pa gen mwayèn pibliye pou peryòd sa a.",
    "noData": "Pa gen done"
  },
  "levelDistribution": {
    "title": "Repatisyon pa nivo",
    "subtitle": "Elèv enskri",
    "centerLabel": "elèv",
    "empty": "Pa gen elèv enskri."
  },
  "fees": {
    "title": "Swivi frè eskolarite",
    "seeDetails": "Wè detay yo →",
    "collected": "Total Kolekte",
    "collectedLabel": "kolekte",
    "paid": "Peye",
    "remaining": "Rete",
    "overdueStudents": "Elèv An Reta",
    "overdueLabel": "an reta",
    "upToDate": "Ajou",
    "studentsConcerned": {
      "one": "{n} elèv konsène",
      "other": "{n} elèv konsène"
    },
    "nextDue": "Pwochen Echeyans",
    "daysUntil": {
      "today": "Jodi a",
      "tomorrow": "Demen",
      "inNDays": "Nan {n} jou"
    },
    "trancheProgress": "Avansman tranch yo",
    "noFeeData": "Pa gen estrikti frè konfigire pou kounye a."
  },
  "attendanceByClass": {
    "title": "To presans",
    "subtitle": "Pa klas — mwa sa a",
    "details": "Detay →",
    "empty": "Pa gen klas konfigire."
  },
  "subjectPerformance": {
    "title": "Pèfòmans pa matyè",
    "subtitle": "Mwayèn jeneral tout klas",
    "empty": "Pa gen nòt pibliye pou peryòd sa a."
  },
  "todos": {
    "title": "Pou trete",
    "evaluationsToGrade": "Evalyasyon pou korije",
    "evaluationsOverdueLabel": "{n} an reta",
    "unjustifiedAbsences": "Absans ki pa jistifye",
    "unjustifiedAbsencesSub": "Semenn sa a",
    "teachersWithoutClass": "Pwofesè san klas asiyen",
    "teachersWithoutClassSub": "Pou asiyen",
    "overduePayments": "Peman an reta",
    "overduePaymentsSub": "Rapèl pou voye"
  },
  "activity": {
    "title": "Aktivite resan",
    "seeAll": "Wè tout",
    "empty": "Pa gen aktivite resan.",
    "relativeTime": {
      "justNow": "kounye a",
      "hoursAgo": "sa gen {hours}è",
      "yesterdayAt": "Yè, {time}"
    }
  },
  "activityLog": {
    "title": "Jounal aktivite",
    "subtitle": "Istorik konplè evènman lekòl la",
    "back": "Retounen nan tablo debò",
    "filterAll": "Tout kalite",
    "typeLabel": {
      "grade": "Nòt",
      "absence": "Absans",
      "payment": "Peman",
      "enrollment": "Enskripsyon"
    },
    "empty": "Pa gen aktivite pou kounye a.",
    "resultCount": {
      "one": "{n} evènman",
      "other": "{n} evènman"
    },
    "loadError": "Nou pa ka chaje aktivite a."
  }
}
```

- [ ] **Step 4: Register the namespace**

In `frontend/src/lib/locales.ts`, add `'dashboard'` to `MESSAGE_NAMESPACES` (after `'verifyEmail'`):

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
] as const;
```

In `frontend/src/i18n/request.ts`, add `dashboard` to the destructure, the `Promise.all` array, and the returned `messages` object (after the `verifyEmail` entries in each):

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
    dashboard,
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
    },
  };
```

In `frontend/src/types/next-intl.d.ts`, add the type import (after `verifyEmail`'s) and the `Messages` interface entry:

```ts
import type dashboard from '@/messages/fr/dashboard.json';
```

```ts
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
    };
```

- [ ] **Step 5: Migrate `frontend/src/app/(school)/dashboard/page.tsx`**

Remove the `import { DASHBOARD } from '@/lib/constants';` line. Add:

```ts
import { useTranslations } from 'next-intl';
```

Inside the component, add (near the top, after `const router = useRouter();`):

```ts
  const t = useTranslations('Dashboard');
```

Replace every `DASHBOARD.*` reference, including the two inside `onExport`'s CSV rows array (`DASHBOARD.fees.collected` and `DASHBOARD.fees.overdueStudents` — easy to miss since they're mid-array, not in JSX):
- `DASHBOARD.kpis.students` → `t('kpis.students')` (same for `.teachers`, `.classes`, `.subjects`, `.attendanceRate`)
- `DASHBOARD.fees.collected` → `t('fees.collected')`
- `DASHBOARD.fees.overdueStudents` → `t('fees.overdueStudents')`
- `setError('Impossible de charger le tableau de bord.')` → `setError(t('loadError'))`
- `{DASHBOARD.title}` → `{t('title')}`
- `{DASHBOARD.subtitle(user.name ?? user.email)}` → `{t('subtitle', { name: user.name ?? user.email })}`
- `<span ...>Année {data.academicYear.label}</span>` → `<span ...>{t('academicYearBadge', { label: data.academicYear.label })}</span>`
- `{DASHBOARD.export}` → `{t('export')}`
- `{DASHBOARD.emptyYear}` → `{t('emptyYear')}`

- [ ] **Step 6: Migrate `frontend/src/app/(school)/dashboard/KpiRow.tsx`**

Replace:

```ts
import { DASHBOARD } from '@/lib/constants';
```
```ts
const t = DASHBOARD.kpis;
```

with:

```ts
import { useTranslations } from 'next-intl';
```

and, inside `KpiRow` (not at module scope — `useTranslations` is a hook):

```ts
export function KpiRow({ kpis }: { kpis: DashboardData['kpis'] }) {
  const t = useTranslations('Dashboard.kpis');
```

Every `t.xxx` reference in the JSX (`t.students`, `t.thisMonth`, `t.teachers`, `t.classes`, `t.subjects`, `t.attendanceRate`, `t.attendanceRateSub`) becomes a call: `t('students')`, `t('thisMonth')`, etc. (`useTranslations('Dashboard.kpis')` scopes the translator to that sub-object, so keys stay unprefixed.)

- [ ] **Step 7: Migrate `frontend/src/app/(school)/dashboard/FeesSummaryRow.tsx`**

Replace:

```ts
import { DASHBOARD } from '@/lib/constants';
```
```ts
const t = DASHBOARD.fees;
```

with:

```ts
import { useLocale, useTranslations } from 'next-intl';
import { LOCALE_BCP47 } from '@/lib/locales';
```

and inside `FeesSummaryRow`:

```ts
export function FeesSummaryRow({ fees }: { fees: DashboardData['fees'] }) {
  const t = useTranslations('Dashboard.fees');
  const locale = useLocale();
```

Replace every `t.xxx` static reference (`t.title`, `t.seeDetails`, `t.collected`, `t.collectedLabel`, `t.paid`, `t.remaining`, `t.overdueStudents`, `t.overdueLabel`, `t.upToDate`, `t.nextDue`, `t.trancheProgress`, `t.noFeeData`) with `t('xxx')`.

Replace the two `t.studentsConcerned(n)` calls:
```ts
footer={t.studentsConcerned(fees.overdueStudentCount)}
```
→
```ts
footer={t(fees.overdueStudentCount > 1 ? 'studentsConcerned.other' : 'studentsConcerned.one', { n: fees.overdueStudentCount })}
```
and the `nextTranche.studentsConcerned` call the same way with `fees.nextTranche.studentsConcerned`.

Replace the date formatting call:
```ts
{new Date(fees.nextTranche.dueDate).toLocaleDateString('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})}
```
→
```ts
{new Date(fees.nextTranche.dueDate).toLocaleDateString(LOCALE_BCP47[locale], {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})}
```

Replace `{t.daysUntil(fees.daysUntilNextTranche)}` with:
```ts
{fees.daysUntilNextTranche <= 0
  ? t('daysUntil.today')
  : fees.daysUntilNextTranche === 1
    ? t('daysUntil.tomorrow')
    : t('daysUntil.inNDays', { n: fees.daysUntilNextTranche })}
```
(exact port of the original `n <= 0 ? "Aujourd'hui" : n === 1 ? 'Demain' : \`Dans ${n} jours\`` branching.)

- [ ] **Step 8: Migrate `frontend/src/app/(school)/dashboard/TodoListCard.tsx`**

Replace:

```ts
import { DASHBOARD } from '@/lib/constants';
```
```ts
const t = DASHBOARD.todos;
```

with:

```ts
import { useTranslations } from 'next-intl';
```

and inside `TodoListCard`:

```ts
export function TodoListCard({ todos }: { todos: DashboardData['todos'] }) {
  const t = useTranslations('Dashboard.todos');
```

Replace every static `t.xxx` (`t.title`, `t.evaluationsToGrade`, `t.unjustifiedAbsences`, `t.unjustifiedAbsencesSub`, `t.teachersWithoutClass`, `t.teachersWithoutClassSub`, `t.overduePayments`, `t.overduePaymentsSub`) with `t('xxx')`.

Replace `t.evaluationsOverdueLabel(todos.evaluationsOverdue)` with `t('evaluationsOverdueLabel', { n: todos.evaluationsOverdue })`.

- [ ] **Step 9: Typecheck, lint, test**

```bash
cd frontend
pnpm typecheck && pnpm lint && pnpm exec vitest run
```

Expected: clean. If `tsc` flags a key, it's a real typo against the `AppConfig` augmentation from Step 4 — fix the key.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/messages/fr/dashboard.json frontend/src/messages/ht/dashboard.json frontend/src/messages/en/dashboard.json \
  frontend/src/lib/locales.ts frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts \
  "frontend/src/app/(school)/dashboard/page.tsx" "frontend/src/app/(school)/dashboard/KpiRow.tsx" \
  "frontend/src/app/(school)/dashboard/FeesSummaryRow.tsx" "frontend/src/app/(school)/dashboard/TodoListCard.tsx"
git commit -m "$(cat <<'EOF'
feat(i18n): Dashboard namespace — school dashboard page + KpiRow/FeesSummaryRow/TodoListCard (FR/HT/EN)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `Dashboard` namespace continued — analytics cards + activity log

Consumes keys already written in Task 2's `dashboard.json`; adds none. Migrates the remaining 5 card components, threads locale + translated strings through the shared `relativeTimeFr` helper (renamed `relativeTime`, since it's no longer French-only), and migrates the activity-log page.

**Files:**
- Modify: `frontend/src/app/(school)/dashboard/AveragesTrendCard.tsx`
- Modify: `frontend/src/app/(school)/dashboard/LevelDistributionCard.tsx`
- Modify: `frontend/src/app/(school)/dashboard/AttendanceByClassCard.tsx`
- Modify: `frontend/src/app/(school)/dashboard/SubjectPerformanceCard.tsx`
- Modify: `frontend/src/app/(school)/dashboard/RecentActivityCard.tsx`
- Modify: `frontend/src/app/(school)/dashboard/activity-shared.ts`
- Modify: `frontend/src/app/(school)/dashboard/activites/page.tsx`

**Interfaces:**
- Consumes: `Dashboard.averagesTrend.*`, `Dashboard.levelDistribution.*`, `Dashboard.attendanceByClass.*`, `Dashboard.subjectPerformance.*`, `Dashboard.activity.*`, `Dashboard.activityLog.*` (Task 2's `dashboard.json`); `LOCALE_BCP47` from `@/lib/locales` (Task 1).
- Produces: `relativeTime(iso: string, locale: LocaleKey, t: RelativeTimeT): string` exported from `activity-shared.ts`, replacing `relativeTimeFr(iso: string): string`.

- [ ] **Step 1: Migrate `activity-shared.ts` — rename and thread `relativeTimeFr` → `relativeTime`**

Replace the whole file's `relativeTimeFr` function and its imports:

```ts
import { CalendarX, NotebookPen, UserPlus, Wallet, type LucideIcon } from 'lucide-react';
import { LOCALE_BCP47, type LocaleKey } from '@/lib/locales';
import type { DashboardData } from './types';

type ActivityType = DashboardData['recentActivity'][number]['type'];

// Shared between the dashboard's RecentActivityCard preview and the full
// "Tout voir" activity log page (/dashboard/activites) — both render the
// same event shape, just at different depths.
export const ACTIVITY_TYPE_META: Record<
  ActivityType,
  { icon: LucideIcon; iconBg: string; iconFg: string }
> = {
  grade: { icon: NotebookPen, iconBg: 'bg-secondary', iconFg: 'text-primary' },
  absence: { icon: CalendarX, iconBg: 'bg-destructive', iconFg: 'text-destructive-foreground' },
  payment: { icon: Wallet, iconBg: 'bg-warning', iconFg: 'text-warning-foreground' },
  enrollment: { icon: UserPlus, iconBg: 'bg-success', iconFg: 'text-success-foreground' },
};

export type RelativeTimeT = (
  key: 'justNow' | 'hoursAgo' | 'yesterdayAt',
  values?: Record<string, string | number>,
) => string;

/** `t` must be scoped to `Dashboard.activity.relativeTime` (i.e.
 * `useTranslations('Dashboard.activity.relativeTime')`). */
export function relativeTime(iso: string, locale: LocaleKey, t: RelativeTimeT): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffH = Math.round(diffMs / 3_600_000);
  if (diffH < 1) return t('justNow');
  if (diffH < 24) return t('hoursAgo', { hours: diffH });
  const isYesterday = diffH < 48;
  const time = date.toLocaleTimeString(LOCALE_BCP47[locale], { hour: '2-digit', minute: '2-digit' });
  if (isYesterday) return t('yesterdayAt', { time });
  return date.toLocaleDateString(LOCALE_BCP47[locale], { day: '2-digit', month: '2-digit' });
}
```

- [ ] **Step 2: Migrate `RecentActivityCard.tsx`**

Replace:
```ts
import { DASHBOARD } from '@/lib/constants';
import { ACTIVITY_TYPE_META, relativeTimeFr } from './activity-shared';
```
```ts
const t = DASHBOARD.activity;
```

with:

```ts
import { useLocale, useTranslations } from 'next-intl';
import { ACTIVITY_TYPE_META, relativeTime } from './activity-shared';
```

and inside `RecentActivityCard`:

```ts
export function RecentActivityCard({ activity }: { activity: DashboardData['recentActivity'] }) {
  const t = useTranslations('Dashboard.activity');
  const tRelative = useTranslations('Dashboard.activity.relativeTime');
  const locale = useLocale();
```

Replace `{t.title}` → `{t('title')}`, `{t.seeAll}` → `{t('seeAll')}`, `{t.empty}` → `{t('empty')}`.

Replace `{relativeTimeFr(a.at)}` → `{relativeTime(a.at, locale, tRelative)}`.

- [ ] **Step 3: Migrate `AveragesTrendCard.tsx`**

Replace:
```ts
import { DASHBOARD } from '@/lib/constants';
```
```ts
const t = DASHBOARD.averagesTrend;
```

with:

```ts
import { useTranslations } from 'next-intl';
```

and inside `AveragesTrendCard`:

```ts
export function AveragesTrendCard({
  yearLabel,
  data,
}: {
  yearLabel: string;
  data: DashboardData['averagesTrend'];
}) {
  const t = useTranslations('Dashboard.averagesTrend');
```

Replace `{t.title}` → `{t('title')}` (3 occurrences: the header div, the `aria-label`, and the `<caption>`). Replace `{t.subtitle(yearLabel)}` → `{t('subtitle', { yearLabel })}`. Replace `{t.seriesLabel}` (inside the `aria-label` template) → `{t('seriesLabel')}`.

Replace the two remaining hardcoded French sentences:
```ts
<div className="flex h-[110px] items-center justify-center text-xs text-muted-foreground">
  Aucune moyenne publiée sur la période.
</div>
```
→
```ts
<div className="flex h-[110px] items-center justify-center text-xs text-muted-foreground">
  {t('empty')}
</div>
```
and
```ts
<td>{d.average != null ? `${d.average}/20` : 'Aucune donnée'}</td>
```
→
```ts
<td>{d.average != null ? `${d.average}/20` : t('noData')}</td>
```

- [ ] **Step 4: Migrate `LevelDistributionCard.tsx`**

Replace:
```ts
import { DASHBOARD } from '@/lib/constants';
```
```ts
const t = DASHBOARD.levelDistribution;
```

with:

```ts
import { useTranslations } from 'next-intl';
```

and inside `LevelDistributionCard`:

```ts
export function LevelDistributionCard({ levels }: { levels: DashboardData['levelDistribution'] }) {
  const t = useTranslations('Dashboard.levelDistribution');
```

Replace `{t.title}` (2 occurrences: header div and `aria-label`), `{t.subtitle}`, `{t.centerLabel}` with the equivalent `t('title')`/`t('subtitle')`/`t('centerLabel')` calls.

Replace:
```ts
<div className="flex h-[100px] items-center justify-center text-xs text-muted-foreground">
  Aucun élève inscrit.
</div>
```
→ `{t('empty')}` in place of the hardcoded sentence.

- [ ] **Step 5: Migrate `AttendanceByClassCard.tsx`**

Replace:
```ts
import { DASHBOARD } from '@/lib/constants';
```
```ts
const t = DASHBOARD.attendanceByClass;
```

with:

```ts
import { useTranslations } from 'next-intl';
```

and inside `AttendanceByClassCard`:

```ts
export function AttendanceByClassCard({
  classes,
}: {
  classes: DashboardData['attendanceByClass'];
}) {
  const t = useTranslations('Dashboard.attendanceByClass');
```

Replace `{t.title}`, `{t.subtitle}`, `{t.details}` with `t('title')`/`t('subtitle')`/`t('details')`. Replace `<p className="text-sm text-muted-foreground">Aucune classe configurée.</p>` with `<p className="text-sm text-muted-foreground">{t('empty')}</p>`.

- [ ] **Step 6: Migrate `SubjectPerformanceCard.tsx`**

Replace:
```ts
import { DASHBOARD } from '@/lib/constants';
```
```ts
const t = DASHBOARD.subjectPerformance;
```

with:

```ts
import { useTranslations } from 'next-intl';
```

and inside `SubjectPerformanceCard`:

```ts
export function SubjectPerformanceCard({
  subjects,
}: {
  subjects: DashboardData['subjectPerformance'];
}) {
  const t = useTranslations('Dashboard.subjectPerformance');
```

Replace `{t.title}`, `{t.subtitle}` with `t('title')`/`t('subtitle')`. Replace `<p className="text-sm text-muted-foreground">Aucune note publiée sur la période.</p>` with `<p className="text-sm text-muted-foreground">{t('empty')}</p>`.

- [ ] **Step 7: Migrate `frontend/src/app/(school)/dashboard/activites/page.tsx`**

Replace:
```ts
import { DASHBOARD } from '@/lib/constants';
import { ACTIVITY_TYPE_META, relativeTimeFr } from '../activity-shared';
```
```ts
const t = DASHBOARD.activityLog;
```

with:

```ts
import { useLocale, useTranslations } from 'next-intl';
import { ACTIVITY_TYPE_META, relativeTime } from '../activity-shared';
```

`t` was module-scoped in the original; it must move inside the component since `useTranslations` is a hook. Inside `ActivityLogPage`, right after `const [page, setPage] = useState(1);`, add:

```ts
  const t = useTranslations('Dashboard.activityLog');
  const tRelative = useTranslations('Dashboard.activity.relativeTime');
  const locale = useLocale();
```

Move the `load` callback's error message: replace `.catch(() => setError("Impossible de charger l'activité."))` with `.catch(() => setError(t('loadError')))`. Since `t` now comes from a hook instead of a module constant, add `t` to the `useCallback` dependency array: `}, [type, page, t]);`.

Replace every remaining `t.xxx` reference:
- `{t.back}` → `{t('back')}`
- `{t.title}` → `{t('title')}`
- `{t.subtitle}` → `{t('subtitle')}`
- `<SelectItem value="">{t.filterAll}</SelectItem>` → `<SelectItem value="">{t('filterAll')}</SelectItem>`
- `{Object.entries(t.typeLabel).map(([key, label]) => ...)}` → this iterates the whole `typeLabel` object, which `useTranslations`'s scoped `t()` doesn't expose as a plain object. Replace with an explicit list, since `ActivityType` is a fixed 4-member union:
  ```ts
  {(['grade', 'absence', 'payment', 'enrollment'] as const).map((key) => (
    <SelectItem key={key} value={key}>
      {t(`typeLabel.${key}`)}
    </SelectItem>
  ))}
  ```
- `{t.resultCount(data.total)}` → `{t(data.total > 1 ? 'resultCount.other' : 'resultCount.one', { n: data.total })}`
- `<p className="p-5 text-sm text-muted-foreground">{t.empty}</p>` → `{t('empty')}`
- `{relativeTimeFr(item.at)}` → `{relativeTime(item.at, locale, tRelative)}`

- [ ] **Step 8: Typecheck, lint, test**

```bash
cd frontend
pnpm typecheck && pnpm lint && pnpm exec vitest run
```

Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add "frontend/src/app/(school)/dashboard/AveragesTrendCard.tsx" "frontend/src/app/(school)/dashboard/LevelDistributionCard.tsx" \
  "frontend/src/app/(school)/dashboard/AttendanceByClassCard.tsx" "frontend/src/app/(school)/dashboard/SubjectPerformanceCard.tsx" \
  "frontend/src/app/(school)/dashboard/RecentActivityCard.tsx" "frontend/src/app/(school)/dashboard/activity-shared.ts" \
  "frontend/src/app/(school)/dashboard/activites/page.tsx"
git commit -m "$(cat <<'EOF'
feat(i18n): Dashboard namespace — analytics cards + activity log (FR/HT/EN)

Renames relativeTimeFr to relativeTime, now locale-aware instead of
hardcoding fr-FR date formatting.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `AdminDashboard` namespace — `/admin` migration

**Files:**
- Create: `frontend/src/messages/fr/adminDashboard.json`, `frontend/src/messages/ht/adminDashboard.json`, `frontend/src/messages/en/adminDashboard.json`
- Modify: `frontend/src/lib/locales.ts`, `frontend/src/i18n/request.ts`, `frontend/src/types/next-intl.d.ts` (register `adminDashboard`, same mechanics as Task 2 Step 4)
- Modify: `frontend/src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `LOCALE_BCP47` from `@/lib/locales` (Task 1).
- Does **not** touch `ADMIN_SAAS` (`orgRole`, `subscriptionStatus` labels) — shared with 7 other out-of-scope `/admin/*` files, per this plan's Global Constraints.

- [ ] **Step 1: Write `frontend/src/messages/fr/adminDashboard.json`**

```json
{
  "title": "Tableau de bord Administration",
  "subtitle": "Vue globale de la plateforme",
  "exportReport": "Exporter le rapport",
  "createSchool": "Créer une école",
  "seeAll": "Voir tout",
  "studentsSuffix": "élèves",
  "kpi": {
    "totalSchools": "Écoles actives",
    "totalUsers": "Utilisateurs totaux",
    "activeUsers": "Utilisateurs actifs",
    "activeSubscriptions": "Abonnements actifs",
    "monthRevenue": "Revenus du mois",
    "thisMonth": "ce mois",
    "ofTotal": "du total",
    "expiringSoon": "expirent bientôt",
    "vsLastMonth": "vs mois dernier"
  },
  "revenue": {
    "title": "Évolution des revenus",
    "subtitle": "6 derniers mois · Facturation par élève",
    "total": "Total 6 mois",
    "avg": "Moy. mensuelle",
    "growth": "Croissance",
    "csvLabelPrefix": "Revenus"
  },
  "recentUsers": {
    "title": "Utilisateurs récents",
    "subtitle": "Dernières inscriptions",
    "empty": "Aucun utilisateur pour le moment."
  },
  "schools": {
    "title": "Écoles clientes",
    "subtitle": {
      "one": "{n} établissement enregistré sur la plateforme",
      "other": "{n} établissements enregistrés sur la plateforme"
    },
    "searchPlaceholder": "Rechercher...",
    "newSchool": "Nouvelle école",
    "columns": {
      "school": "École",
      "location": "Pays / Ville",
      "plan": "Plan",
      "students": "Élèves",
      "users": "Utilisateurs",
      "billing": "Facturation / mois",
      "status": "Statut",
      "renewal": "Renouvellement"
    },
    "empty": "Aucune école enregistrée pour le moment."
  },
  "transactions": {
    "title": "Transactions récentes",
    "subtitle": "Historique des paiements",
    "columns": { "school": "École", "amount": "Montant", "date": "Date", "status": "Statut" },
    "empty": "Aucune transaction pour le moment."
  },
  "coupons": {
    "title": "Codes promotionnels",
    "subtitle": "Gérez les coupons de réduction",
    "newCoupon": "Nouveau coupon",
    "columns": {
      "code": "Code",
      "discount": "Réduction",
      "uses": "Utilisations",
      "expiry": "Expiration",
      "status": "Statut"
    },
    "noLimit": "Sans limite",
    "permanent": "Permanent",
    "empty": "Aucun coupon créé pour le moment."
  },
  "loadError": "Impossible de charger le tableau de bord.",
  "retry": "Réessayer"
}
```

- [ ] **Step 2: Write `frontend/src/messages/en/adminDashboard.json`**

```json
{
  "title": "Admin Dashboard",
  "subtitle": "Platform-wide overview",
  "exportReport": "Export report",
  "createSchool": "Create a school",
  "seeAll": "See all",
  "studentsSuffix": "students",
  "kpi": {
    "totalSchools": "Active schools",
    "totalUsers": "Total users",
    "activeUsers": "Active users",
    "activeSubscriptions": "Active subscriptions",
    "monthRevenue": "Monthly revenue",
    "thisMonth": "this month",
    "ofTotal": "of total",
    "expiringSoon": "expiring soon",
    "vsLastMonth": "vs last month"
  },
  "revenue": {
    "title": "Revenue trend",
    "subtitle": "Last 6 months · Per-student billing",
    "total": "6-month total",
    "avg": "Monthly avg.",
    "growth": "Growth",
    "csvLabelPrefix": "Revenue"
  },
  "recentUsers": {
    "title": "Recent users",
    "subtitle": "Latest sign-ups",
    "empty": "No users yet."
  },
  "schools": {
    "title": "Client schools",
    "subtitle": {
      "one": "{n} school registered on the platform",
      "other": "{n} schools registered on the platform"
    },
    "searchPlaceholder": "Search...",
    "newSchool": "New school",
    "columns": {
      "school": "School",
      "location": "Country / City",
      "plan": "Plan",
      "students": "Students",
      "users": "Users",
      "billing": "Billing / month",
      "status": "Status",
      "renewal": "Renewal"
    },
    "empty": "No schools registered yet."
  },
  "transactions": {
    "title": "Recent transactions",
    "subtitle": "Payment history",
    "columns": { "school": "School", "amount": "Amount", "date": "Date", "status": "Status" },
    "empty": "No transactions yet."
  },
  "coupons": {
    "title": "Promo codes",
    "subtitle": "Manage discount coupons",
    "newCoupon": "New coupon",
    "columns": {
      "code": "Code",
      "discount": "Discount",
      "uses": "Uses",
      "expiry": "Expiry",
      "status": "Status"
    },
    "noLimit": "No limit",
    "permanent": "Permanent",
    "empty": "No coupons created yet."
  },
  "loadError": "Unable to load the dashboard.",
  "retry": "Retry"
}
```

- [ ] **Step 3: Write `frontend/src/messages/ht/adminDashboard.json`**

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "title": "Tablo debò Administrasyon",
  "subtitle": "Apèsi global platfòm lan",
  "exportReport": "Ekspòte rapò a",
  "createSchool": "Kreye yon lekòl",
  "seeAll": "Wè tout",
  "studentsSuffix": "elèv",
  "kpi": {
    "totalSchools": "Lekòl aktif",
    "totalUsers": "Total itilizatè",
    "activeUsers": "Itilizatè aktif",
    "activeSubscriptions": "Abònman aktif",
    "monthRevenue": "Revni mwa a",
    "thisMonth": "mwa sa a",
    "ofTotal": "nan total la",
    "expiringSoon": "ap ekspire byento",
    "vsLastMonth": "konpare ak mwa pase"
  },
  "revenue": {
    "title": "Evolisyon revni yo",
    "subtitle": "6 dènye mwa · Fakti pa elèv",
    "total": "Total 6 mwa",
    "avg": "Mwayèn chak mwa",
    "growth": "Kwasans",
    "csvLabelPrefix": "Revni"
  },
  "recentUsers": {
    "title": "Itilizatè resan",
    "subtitle": "Dènye enskripsyon",
    "empty": "Pa gen itilizatè pou kounye a."
  },
  "schools": {
    "title": "Lekòl kliyan",
    "subtitle": {
      "one": "{n} etablisman anrejistre sou platfòm lan",
      "other": "{n} etablisman anrejistre sou platfòm lan"
    },
    "searchPlaceholder": "Chèche...",
    "newSchool": "Nouvo lekòl",
    "columns": {
      "school": "Lekòl",
      "location": "Peyi / Vil",
      "plan": "Plan",
      "students": "Elèv",
      "users": "Itilizatè",
      "billing": "Fakti / mwa",
      "status": "Estati",
      "renewal": "Renouvèlman"
    },
    "empty": "Pa gen lekòl anrejistre pou kounye a."
  },
  "transactions": {
    "title": "Tranzaksyon resan",
    "subtitle": "Istorik peman yo",
    "columns": { "school": "Lekòl", "amount": "Montan", "date": "Dat", "status": "Estati" },
    "empty": "Pa gen tranzaksyon pou kounye a."
  },
  "coupons": {
    "title": "Kòd pwomosyonèl",
    "subtitle": "Jere koupon rabè yo",
    "newCoupon": "Nouvo koupon",
    "columns": {
      "code": "Kòd",
      "discount": "Rabè",
      "uses": "Itilizasyon",
      "expiry": "Ekspirasyon",
      "status": "Estati"
    },
    "noLimit": "San limit",
    "permanent": "Pèmanan",
    "empty": "Pa gen koupon kreye pou kounye a."
  },
  "loadError": "Nou pa ka chaje tablo debò a.",
  "retry": "Eseye ankò"
}
```

- [ ] **Step 4: Register the namespace**

Same mechanics as Task 2 Step 4: add `'adminDashboard'` to `MESSAGE_NAMESPACES` (after `'dashboard'`); add `adminDashboard` to `i18n/request.ts`'s destructure/`Promise.all`/return object (`AdminDashboard: adminDashboard.default`); add `import type adminDashboard from '@/messages/fr/adminDashboard.json';` and `AdminDashboard: typeof adminDashboard;` to `next-intl.d.ts`.

- [ ] **Step 5: Migrate `frontend/src/app/admin/page.tsx`**

Replace:
```ts
import { ADMIN_DASHBOARD as T } from '@/lib/constants';
```

with:

```ts
import { useLocale, useTranslations } from 'next-intl';
import { LOCALE_BCP47 } from '@/lib/locales';
```

**Leave `import { ADMIN_SAAS } from '@/lib/constants';` and every `ADMIN_SAAS.*` reference untouched** — out of scope per this plan's Global Constraints.

Inside `AdminDashboardPage`, right after `const router = useRouter();`, add:

```ts
  const t = useTranslations('AdminDashboard');
  const locale = useLocale();
```

Replace every `T.xxx` reference with the equivalent `t('xxx')` call — `T.kpi.totalSchools` → `t('kpi.totalSchools')`, `T.loadError` → `t('loadError')`, `T.retry` → `t('retry')`, `T.title` → `t('title')`, `T.subtitle` → `t('subtitle')`, `T.exportReport` → `t('exportReport')`, `T.createSchool` → `t('createSchool')`, `T.kpi.*` (all 9 sub-keys), `T.revenue.*` (title/subtitle/total/avg/growth), `T.recentUsers.*` (title/subtitle/empty), `T.seeAll`, `T.schools.title`, `T.schools.searchPlaceholder`, `T.schools.newSchool`, `T.schools.columns.*` (8 sub-keys), `T.schools.empty`, `T.transactions.*` (title/subtitle/columns/empty), `T.coupons.*` (title/subtitle/newCoupon/columns/noLimit/empty).

Also replace the hardcoded `` `Revenus ${m.label}` `` inside `onExport`'s revenue-series CSV rows (easy to miss — it's not JSX, it's a plain string inside `data.revenue.series.map((m) => [...])`):
```ts
...data.revenue.series.map((m) => [`Revenus ${m.label}`, fmtUsd(m.cents)]),
```
→
```ts
...data.revenue.series.map((m) => [`${t('revenue.csvLabelPrefix')} ${m.label}`, fmtUsd(m.cents)]),
```

Replace `subtitle={T.schools.subtitle(data.kpis.totalSchools)}` with:
```ts
subtitle={t(data.kpis.totalSchools > 1 ? 'schools.subtitle.other' : 'schools.subtitle.one', { n: data.kpis.totalSchools })}
```

Replace the two hardcoded `'fr-FR'` number formats:
```ts
value={data.kpis.totalUsers.toLocaleString('fr-FR')}
```
→
```ts
value={data.kpis.totalUsers.toLocaleString(LOCALE_BCP47[locale])}
```
(and the same for `data.kpis.activeUsers.toLocaleString('fr-FR')`).

Replace the stray inline literal:
```ts
{t.planName ?? '—'} · {t.students} élèves
```
(note: in this line, `t` is the `.map((t) => ...)` transaction-row loop variable, unrelated to the new translator — do not touch `t.planName`/`t.students`) →
```ts
{t.planName ?? '—'} · {t.students} {tAdmin('studentsSuffix')}
```
Since the loop variable is already named `t`, rename the new page-level translator to `tAdmin` throughout this file to avoid the collision — go back and apply this rename to every `t('...')` call introduced above (`tAdmin('title')`, `tAdmin('kpi.totalSchools')`, etc.) and to the hook declaration (`const tAdmin = useTranslations('AdminDashboard');`).

- [ ] **Step 6: Typecheck, lint, test**

```bash
cd frontend
pnpm typecheck && pnpm lint && pnpm exec vitest run
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/messages/fr/adminDashboard.json frontend/src/messages/ht/adminDashboard.json frontend/src/messages/en/adminDashboard.json \
  frontend/src/lib/locales.ts frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts frontend/src/app/admin/page.tsx
git commit -m "$(cat <<'EOF'
feat(i18n): AdminDashboard namespace — /admin migration (FR/HT/EN)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `SchoolPlanCard` namespace — close the `SidebarPlanCard` gap (Plan 1a/1b deferred item)

Closes the gap first surfaced in Plan 1a's final review and explicitly re-flagged, unclaimed, in Plan 1b's deferred-items list: `SchoolSidebar.tsx`'s footer renders `SidebarPlanCard`, entirely hardcoded French, sourced from the pure `planPresentation()` function. Translating it means threading a translator through that function — this task does exactly that, and rewrites its 17 existing unit tests (20 `planPresentation(...)` call sites — a few tests call the function twice, once per branch under test) to call it with a real translator instead of asserting against literal template strings.

**Files:**
- Create: `frontend/src/messages/fr/schoolPlanCard.json`, `frontend/src/messages/ht/schoolPlanCard.json`, `frontend/src/messages/en/schoolPlanCard.json`
- Modify: `frontend/src/lib/locales.ts`, `frontend/src/i18n/request.ts`, `frontend/src/types/next-intl.d.ts` (register `schoolPlanCard`, same mechanics as Task 2 Step 4)
- Modify: `frontend/src/components/school/billing/plan-presentation.ts`
- Modify: `frontend/src/components/school/billing/plan-presentation.test.ts`
- Modify: `frontend/src/components/school/billing/SidebarPlanCard.tsx`

**Interfaces:**
- Produces: `planPresentation(s: PlanSnapshot | null, t: PlanCardT): PlanPresentation | null` — signature changes from the current single-argument `planPresentation(s)`. `PlanCardT = (key: string, values?: Record<string, string | number>) => string`.
- Consumes: `PLAN_LABELS` from `@/lib/billing-plans` (untouched, plan-tier names flow through as `{plan}` values, never translated) and `fmtDateShort` from `./billing-format` (untouched — deliberately still `'fr-FR'`-formatted, per this plan's Global Constraints).

- [ ] **Step 1: Write `frontend/src/messages/fr/schoolPlanCard.json`**

```json
{
  "suspendedTitle": "{plan} suspendu",
  "paymentFailedRegularize": "Paiement en échec — régulariser",
  "suspendedContactUs": "Suspendu · contactez-nous",
  "regularizeShortLabel": "{plan} · À régulariser",
  "regularizeCta": "Régulariser",
  "contactUsCta": "Nous contacter",
  "reactivateTitle": "Réactivez {plan}",
  "overCapBlocked": "{count} élèves pour {limit} places — inscriptions bloquées",
  "dataKept": "Vos données sont conservées · reprise en 1 clic",
  "reactivateShortLabel": "Réactiver {plan}",
  "reactivateCta": "Réactiver",
  "capReached": "Plafond atteint ({count}/{limit}) — inscriptions bloquées",
  "nearCap": {
    "one": "{count}/{limit} élèves — plus que {left} place",
    "other": "{count}/{limit} élèves — plus que {left} places"
  },
  "genericPitch": "Jusqu'à {limit} élèves · essai {trialDays} j offert",
  "upsellTitle": "Passez à {plan}",
  "upsellShortLabel": "Passer à {plan}",
  "discoverCta": "Découvrir",
  "paymentFailed": "Paiement en échec",
  "enterpriseContract": "Contrat Enterprise",
  "activeUntil": "Actif jusqu'au {date}",
  "trialUntil": "Essai jusqu'au {date}",
  "renewalDate": "Renouvellement {date}",
  "active": "Actif",
  "toRegularize": "À régulariser",
  "trialState": "Essai",
  "paidShortLabel": "{plan} · {state}"
}
```

- [ ] **Step 2: Write `frontend/src/messages/en/schoolPlanCard.json`**

```json
{
  "suspendedTitle": "{plan} suspended",
  "paymentFailedRegularize": "Payment failed — fix billing",
  "suspendedContactUs": "Suspended · contact us",
  "regularizeShortLabel": "{plan} · Fix billing",
  "regularizeCta": "Fix billing",
  "contactUsCta": "Contact us",
  "reactivateTitle": "Reactivate {plan}",
  "overCapBlocked": "{count} students for {limit} seats — enrolment blocked",
  "dataKept": "Your data is kept · resume in 1 click",
  "reactivateShortLabel": "Reactivate {plan}",
  "reactivateCta": "Reactivate",
  "capReached": "Limit reached ({count}/{limit}) — enrolment blocked",
  "nearCap": {
    "one": "{count}/{limit} students — {left} seat left",
    "other": "{count}/{limit} students — {left} seats left"
  },
  "genericPitch": "Up to {limit} students · {trialDays}-day free trial",
  "upsellTitle": "Upgrade to {plan}",
  "upsellShortLabel": "Upgrade to {plan}",
  "discoverCta": "Learn more",
  "paymentFailed": "Payment failed",
  "enterpriseContract": "Enterprise contract",
  "activeUntil": "Active until {date}",
  "trialUntil": "Trial until {date}",
  "renewalDate": "Renews {date}",
  "active": "Active",
  "toRegularize": "Needs attention",
  "trialState": "Trial",
  "paidShortLabel": "{plan} · {state}"
}
```

- [ ] **Step 3: Write `frontend/src/messages/ht/schoolPlanCard.json`**

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "suspendedTitle": "{plan} sispann",
  "paymentFailedRegularize": "Peman echwe — regilarize",
  "suspendedContactUs": "Sispann · kontakte nou",
  "regularizeShortLabel": "{plan} · Pou regilarize",
  "regularizeCta": "Regilarize",
  "contactUsCta": "Kontakte nou",
  "reactivateTitle": "Reyaktive {plan}",
  "overCapBlocked": "{count} elèv pou {limit} plas — enskripsyon bloke",
  "dataKept": "Done ou yo konsève · repran nan 1 klik",
  "reactivateShortLabel": "Reyaktive {plan}",
  "reactivateCta": "Reyaktive",
  "capReached": "Plafon atenn ({count}/{limit}) — enskripsyon bloke",
  "nearCap": {
    "one": "{count}/{limit} elèv — rete {left} plas",
    "other": "{count}/{limit} elèv — rete {left} plas"
  },
  "genericPitch": "Jiska {limit} elèv · esè {trialDays} jou gratis",
  "upsellTitle": "Pase nan {plan}",
  "upsellShortLabel": "Pase nan {plan}",
  "discoverCta": "Dekouvri",
  "paymentFailed": "Peman echwe",
  "enterpriseContract": "Kontra Enterprise",
  "activeUntil": "Aktif jiska {date}",
  "trialUntil": "Esè jiska {date}",
  "renewalDate": "Renouvèlman {date}",
  "active": "Aktif",
  "toRegularize": "Pou regilarize",
  "trialState": "Esè",
  "paidShortLabel": "{plan} · {state}"
}
```

- [ ] **Step 4: Register the namespace**

Same mechanics as Task 2 Step 4: add `'schoolPlanCard'` to `MESSAGE_NAMESPACES` (after `'adminDashboard'`); add `schoolPlanCard` to `i18n/request.ts`'s destructure/`Promise.all`/return object (`SchoolPlanCard: schoolPlanCard.default`); add `import type schoolPlanCard from '@/messages/fr/schoolPlanCard.json';` and `SchoolPlanCard: typeof schoolPlanCard;` to `next-intl.d.ts`.

- [ ] **Step 5: Rewrite `plan-presentation.ts` to accept a translator**

Replace the whole function body (keep the file's existing imports, `PLAN_PAGE_HREF`/`PLAN_PAGE_PRO_HREF` constants, the `PlanPresentation` interface, and `NEAR_CAP_RATIO` untouched):

```ts
export type PlanCardT = (key: string, values?: Record<string, string | number>) => string;

/**
 * Returns null when there is nothing to show: no snapshot (no school /
 * loading / error) or a Starter school on a deployment without Stripe
 * (nothing to sell — the app stays exactly as before). `t` must be scoped
 * to the `SchoolPlanCard` namespace (`useTranslations('SchoolPlanCard')`
 * in the component; `createTranslator(...)` in tests).
 */
export function planPresentation(s: PlanSnapshot | null, t: PlanCardT): PlanPresentation | null {
  if (!s) return null;

  if (s.plan === 'STARTER') {
    if (!s.stripeConfigured) return null;
    const limit = s.studentHardLimit;
    const overCap = limit !== null && s.studentCount >= limit;
    const previouslyPaid = s.subscribedPlan !== null && s.subscribedPlan !== 'STARTER';
    const plan = PLAN_LABELS.PRO;

    if (previouslyPaid && s.status === 'SUSPENDED') {
      // Unpaid Pro (Stripe dunning exhausted) → the school is back on Starter
      // rules until the card is fixed; a back-office suspension has no card
      // to fix, so it points at support instead.
      const byStripe = s.managedByStripe;
      return {
        kind: 'upsell',
        title: t('suspendedTitle', { plan }),
        subtitle: byStripe ? t('paymentFailedRegularize') : t('suspendedContactUs'),
        tone: 'alert',
        shortLabel: t('regularizeShortLabel', { plan }),
        cta: byStripe ? t('regularizeCta') : t('contactUsCta'),
        href: PLAN_PAGE_PRO_HREF,
      };
    }

    if (previouslyPaid) {
      // A canceled / expired Pro row: the cap applies again — say so when it bites.
      return {
        kind: 'upsell',
        title: t('reactivateTitle', { plan }),
        subtitle:
          overCap && limit !== null
            ? t('overCapBlocked', { count: s.studentCount, limit })
            : t('dataKept'),
        tone: overCap ? 'alert' : 'gold',
        shortLabel: t('reactivateShortLabel', { plan }),
        cta: t('reactivateCta'),
        href: PLAN_PAGE_PRO_HREF,
      };
    }

    let subtitle: string;
    let tone: PlanPresentation['tone'] = 'gold';
    if (limit !== null && overCap) {
      subtitle = t('capReached', { count: s.studentCount, limit });
      tone = 'alert';
    } else if (limit !== null && s.studentCount >= Math.ceil(limit * NEAR_CAP_RATIO)) {
      const left = limit - s.studentCount;
      subtitle = t(left > 1 ? 'nearCap.other' : 'nearCap.one', {
        count: s.studentCount,
        limit,
        left,
      });
    } else {
      subtitle = t('genericPitch', {
        limit: PLAN_STUDENT_SOFT_LIMIT.PRO ?? 1000,
        trialDays: TRIAL_DAYS,
      });
    }
    return {
      kind: 'upsell',
      title: t('upsellTitle', { plan }),
      subtitle,
      tone,
      shortLabel: t('upsellShortLabel', { plan }),
      cta: t('discoverCta'),
      href: PLAN_PAGE_PRO_HREF,
    };
  }

  // Paid plan (PRO / ENTERPRISE).
  const label = PLAN_LABELS[s.plan];
  let subtitle: string;
  let tone: PlanPresentation['tone'] = 'gold';
  // Sidebar strip is ~150 px wide at 11 px: keep every line ≤ 25 chars —
  // the Abonnement page carries the full sentence.
  if (s.stripeStatus === 'past_due' || s.stripeStatus === 'unpaid') {
    subtitle = t('paymentFailed');
    tone = 'alert';
  } else if (s.status === 'SUSPENDED') {
    subtitle = t('suspendedContactUs');
    tone = 'alert';
  } else if (s.plan === 'ENTERPRISE' && !s.managedByStripe) {
    subtitle = t('enterpriseContract');
  } else if (s.cancelAtPeriodEnd) {
    subtitle = t('activeUntil', { date: fmtDateShort(s.renewsAt) });
  } else if (s.status === 'TRIAL' || s.stripeStatus === 'trialing') {
    subtitle = t('trialUntil', { date: fmtDateShort(s.trialEndsAt ?? s.renewsAt) });
  } else if (s.renewsAt) {
    subtitle = t('renewalDate', { date: fmtDateShort(s.renewsAt) });
  } else {
    subtitle = t('active');
  }
  const shortState =
    tone === 'alert'
      ? t('toRegularize')
      : s.status === 'TRIAL' || s.stripeStatus === 'trialing'
        ? t('trialState')
        : t('active');
  return {
    kind: 'paid',
    title: label,
    subtitle,
    tone,
    shortLabel: t('paidShortLabel', { plan: label, state: shortState }),
    cta: null,
    href: PLAN_PAGE_HREF,
  };
}
```

Every branch's returned strings are byte-identical to the version before this task, once `t()` resolves against `fr/schoolPlanCard.json` — this is a translator-threading change, not a copy change. Double-check this by comparing each `t('key', {...})` call above against Step 1's `fr` JSON and the original hardcoded string it replaces (e.g. `t('reactivateTitle', { plan })` with `plan = 'Établissement Pro'` and JSON value `"Réactivez {plan}"` must render exactly `"Réactivez Établissement Pro"`, matching the original `` `Réactivez ${PLAN_LABELS.PRO}` ``).

- [ ] **Step 6: Update `SidebarPlanCard.tsx` to pass a translator**

Add the import:

```ts
import { useTranslations } from 'next-intl';
```

Change:

```ts
export function SidebarPlanCard({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const { snapshot } = useSchoolPlan();
  const p = planPresentation(snapshot);
```

to:

```ts
export function SidebarPlanCard({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const { snapshot } = useSchoolPlan();
  const t = useTranslations('SchoolPlanCard');
  const p = planPresentation(snapshot, t);
```

Nothing else in this file changes — `p.title`/`p.subtitle`/`p.shortLabel`/`p.cta` are already rendered as opaque strings.

- [ ] **Step 7: Rewrite `plan-presentation.test.ts` to build a real translator**

Add this import and fixture at the top of the file, after the existing imports:

```ts
import { createTranslator } from 'next-intl';
import messages from '@/messages/fr/schoolPlanCard.json';

const t = createTranslator({ locale: 'fr', messages: { SchoolPlanCard: messages }, namespace: 'SchoolPlanCard' });
```

This is the same technique this session's Plan 1b final review already used to verify ICU interpolation end-to-end (rendering through `next-intl`'s real `createTranslator` in a Vitest test, not a hand-rolled stub) — reuse it rather than inventing a mock translator.

Then update every one of the 20 `planPresentation(...)` call sites in this file (run `grep -c "planPresentation(" plan-presentation.test.ts` to confirm the count before and after — it must stay 20) to pass `t` as the second argument — e.g.:

```ts
expect(planPresentation(null)).toBeNull();
```
→
```ts
expect(planPresentation(null, t)).toBeNull();
```

and

```ts
expect(planPresentation(snap({ studentCount: 10 }))).toEqual({
```
→
```ts
expect(planPresentation(snap({ studentCount: 10 }), t)).toEqual({
```

Apply this same one-argument-added change to all 20 `planPresentation(...)` calls in the file, across all 17 `it(...)` blocks (some blocks — e.g. "at 80 % of the cap", "past_due / unpaid" — call the function twice; both calls in those blocks need `t` added), whether assigned to a `p`/`const` first or asserted inline. **Do not change any expected string value** — every expectation should still pass unmodified, since Step 5's `t()` calls resolve to byte-identical French text. If any expectation needs to change to pass, that's a signal Step 5 or Step 1 introduced a mismatch — stop and fix the JSON/function, not the test.

- [ ] **Step 8: Run this file's tests in isolation first**

```bash
cd frontend
pnpm exec vitest run src/components/school/billing/plan-presentation.test.ts
```

Expected: PASS, all 17 tests green, zero expected-value changes.

- [ ] **Step 9: Typecheck, lint, full test suite**

```bash
pnpm typecheck && pnpm lint && pnpm exec vitest run
```

Expected: clean. `SidebarPlanCard.tsx` has no dedicated test file (confirmed — none exists), so the full suite is the only other surface this task touches.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/messages/fr/schoolPlanCard.json frontend/src/messages/ht/schoolPlanCard.json frontend/src/messages/en/schoolPlanCard.json \
  frontend/src/lib/locales.ts frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts \
  frontend/src/components/school/billing/plan-presentation.ts frontend/src/components/school/billing/plan-presentation.test.ts \
  frontend/src/components/school/billing/SidebarPlanCard.tsx
git commit -m "$(cat <<'EOF'
feat(i18n): SchoolPlanCard namespace — translate the sidebar plan-upsell card (FR/HT/EN)

Closes the gap flagged in Plan 1a's and Plan 1b's final reviews: threads a
next-intl translator through planPresentation() instead of hardcoding
French sentences in the pure function. Plan-tier names (PLAN_LABELS) and
fmtDateShort's date formatting stay untouched — both are shared with the
out-of-scope /abonnement billing subsystem.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: End-to-end verification (browser, all 3 locales) — Dashboard, AdminDashboard, SidebarPlanCard

Extends Phase 0's Task 12 E2E+Lighthouse pattern to this plan's new surfaces. Plans 1a and 1b did not add their own dedicated E2E scripts (their final whole-branch reviews verified translations by reading code and, for ICU interpolation, rendering through `createTranslator` directly) — this task is the first to script a full authenticated-browser pass since Phase 0's pilot, and covers only this plan's own scope (Dashboard/AdminDashboard/SidebarPlanCard), not a re-verification of Plans 1a/1b's shell/nav/auth-page surfaces.

**Files:**
- Create (scratchpad only, not committed): `<scratchpad>/e2e-i18n-dashboards.js`, `<scratchpad>/lh-i18n-dashboards.mjs`

No production files are created by this task. Its deliverable is a verification run whose console output gets pasted into the task's completion notes.

- [ ] **Step 1: Restart the dev server**

Confirm the dev server running for manual/E2E testing was started after Tasks 1–5's changes (a stale build can serve pre-migration JS). Restart if unsure.

- [ ] **Step 2: Write the E2E script**

```js
// Scratch E2E — Dashboard, AdminDashboard, SidebarPlanCard in FR/HT/EN:
// html lang, translated static copy, no console errors, no horizontal
// overflow at 375px. Only checks static (locale-invariant) strings — KPI
// figures and the plan card's dynamic subtitle depend on live seed data,
// so those are checked structurally (present, non-empty, differs by
// locale), not by exact string match.
'use strict';
const path = require('path');
const ROOT = '/home/amos-dorceus/Documents/SaaSManagement/ekolplus2/frontend';
const OUT = __dirname;
const BASE = process.env.BASE || 'http://localhost:3000';

// Fill in from frontend/CREDENTIALS.local.md before running — do not commit
// this script with real credentials.
const SCHOOL_OWNER = { email: process.env.E2E_SCHOOL_EMAIL, password: process.env.E2E_SCHOOL_PASSWORD };
const SUPERADMIN = { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD };

const fails = [];
function check(cond, label) {
  console.log(`${cond ? '✓' : '✗'} ${label}`);
  if (!cond) fails.push(label);
}

const DASHBOARD_EXPECT = {
  fr: { title: 'Tableau de bord', kpiStudents: 'Élèves inscrits', feesTitle: 'Suivi des frais de scolarité' },
  ht: { title: 'Tablo debò', kpiStudents: 'Elèv enskri', feesTitle: 'Swivi frè eskolarite' },
  en: { title: 'Dashboard', kpiStudents: 'Enrolled students', feesTitle: 'Tuition fee tracking' },
};
const ADMIN_EXPECT = {
  fr: { title: 'Tableau de bord Administration', totalSchools: 'Écoles actives' },
  ht: { title: 'Tablo debò Administrasyon', totalSchools: 'Lekòl aktif' },
  en: { title: 'Admin Dashboard', totalSchools: 'Active schools' },
};

async function login(page, { email, password }) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  const respP = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'), { timeout: 15000 });
  const submit = await page.$('button[type="submit"]');
  await submit.click();
  await respP;
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
}

async function checkOverflowAt375(page) {
  await page.setViewport({ width: 375, height: 800 });
  await page.reload({ waitUntil: 'networkidle0', timeout: 60000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  await page.setViewport({ width: 1440, height: 900 });
  return !overflow;
}

(async () => {
  const puppeteer = require(path.join(ROOT, 'node_modules/puppeteer-core'));
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars'],
  });
  try {
    // --- Dashboard + SidebarPlanCard (school owner session) ---
    {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      const consoleErrors = [];
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      await login(page, SCHOOL_OWNER);

      const planCardTexts = {};
      for (const [locale, expect_] of Object.entries(DASHBOARD_EXPECT)) {
        await page.evaluate((l) => {
          document.cookie = `sg-locale=${l}; path=/; max-age=31536000; SameSite=Lax`;
        }, locale);
        await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0', timeout: 60000 });

        const htmlLang = await page.$eval('html', (h) => h.getAttribute('lang'));
        check(htmlLang === locale, `[dashboard/${locale}] html lang="${locale}" (got "${htmlLang}")`);

        const title = await page.$eval('h1', (h) => h.textContent.trim()).catch(() => null);
        check(title === expect_.title, `[dashboard/${locale}] title matches (got "${title}")`);

        const bodyText = await page.evaluate(() => document.body.textContent);
        check(bodyText.includes(expect_.kpiStudents), `[dashboard/${locale}] KPI label "${expect_.kpiStudents}" present`);
        check(bodyText.includes(expect_.feesTitle), `[dashboard/${locale}] fees title "${expect_.feesTitle}" present`);

        const planCard = await page.$('[data-testid="sidebar-plan-card"]');
        if (planCard) {
          planCardTexts[locale] = (await page.evaluate((el) => el.textContent, planCard)).trim();
          check(planCardTexts[locale].length > 0, `[dashboard/${locale}] SidebarPlanCard renders non-empty text`);
        } else {
          console.log(`[dashboard/${locale}] SidebarPlanCard not rendered (Starter without Stripe, or no school) — skipping its checks`);
        }

        check(await checkOverflowAt375(page), `[dashboard/${locale}] no horizontal overflow at 375px`);
        await page.screenshot({ path: path.join(OUT, `i18n-dashboard-${locale}-375.png`) });
      }

      if (Object.keys(planCardTexts).length === 3) {
        const distinct = new Set(Object.values(planCardTexts)).size;
        check(distinct === 3, `SidebarPlanCard text actually differs across all 3 locales (got ${distinct} distinct)`);
      }

      console.log('[dashboard] console errors:', consoleErrors.length ? consoleErrors.join(' | ') : 'none');

      // Activity log page — static strings only.
      await page.goto(`${BASE}/dashboard/activites`, { waitUntil: 'networkidle0', timeout: 60000 });
      const activityTitle = await page.$eval('h1', (h) => h.textContent.trim()).catch(() => null);
      check(activityTitle === 'Journal d’activité' || activityTitle === "Journal d'activité", `[activites] title renders (got "${activityTitle}")`);

      await ctx.close();
    }

    // --- AdminDashboard (superadmin session) ---
    {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await login(page, SUPERADMIN);

      for (const [locale, expect_] of Object.entries(ADMIN_EXPECT)) {
        await page.evaluate((l) => {
          document.cookie = `sg-locale=${l}; path=/; max-age=31536000; SameSite=Lax`;
        }, locale);
        await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle0', timeout: 60000 });

        const htmlLang = await page.$eval('html', (h) => h.getAttribute('lang'));
        check(htmlLang === locale, `[admin/${locale}] html lang="${locale}" (got "${htmlLang}")`);

        const bodyText = await page.evaluate(() => document.body.textContent);
        check(bodyText.includes(expect_.title), `[admin/${locale}] title "${expect_.title}" present`);
        check(bodyText.includes(expect_.totalSchools), `[admin/${locale}] KPI label "${expect_.totalSchools}" present`);

        check(await checkOverflowAt375(page), `[admin/${locale}] no horizontal overflow at 375px`);
      }
      await ctx.close();
    }
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

Save the script to your scratchpad directory and run, supplying the school-owner and superadmin credentials from `frontend/CREDENTIALS.local.md` as environment variables (never hardcode them in the script):

```bash
E2E_SCHOOL_EMAIL=... E2E_SCHOOL_PASSWORD=... E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... \
  node <scratchpad>/e2e-i18n-dashboards.js
```

Expected: `ALL CHECKS PASSED`, 0 exit code. Per this session's established Puppeteer conventions (memory: real `ElementHandle.click()`, race submits against `waitForResponse`, a password-change invalidates the session — none of which apply here since this script only logs in, it doesn't change passwords), if login fails, confirm the rate limiter isn't tripped from earlier manual testing.

- [ ] **Step 4: Lighthouse, both dashboards, all 3 locales, on a local production build**

Per the established pattern for authenticated-page audits (memory: the stock `pnpm lighthouse` script's header-only cookie never satisfies `AuthProvider`'s client-side check for a genuinely authenticated page) — reuse a real, Puppeteer-authenticated Chrome session and point Lighthouse at the same debugging port, rather than the stock script's simpler `extraHeaders` approach (which only works for `/login`, a public page).

Build and serve a local production bundle, shadowing the prod env file with the dev one so this never touches the real database or live Stripe keys (same as Phase 0's Task 12 and this session's `lighthouse-authenticated-audits` precedent):

```bash
cd frontend
set -a; source ./.env; source ./.env.local; set +a
export APP_URL=http://localhost:3001
pnpm exec next build
export PORT=3001
nohup pnpm exec next start --port 3001 > /tmp/i18n-lh-dashboards-3001.log 2>&1 &
sleep 5
```

Save as `<scratchpad>/lh-i18n-dashboards.mjs`:

```js
// Lighthouse a11y/best-practices audit of /dashboard and /admin in each of
// the 3 locales, reusing one real Puppeteer-authenticated session per role
// (AuthProvider's client-side check means a bare cookie header isn't
// enough for these — see lighthouse-authenticated-audits precedent).
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer-core';

const BASE = process.env.LIGHTHOUSE_BASE_URL || 'http://localhost:3001';
const LOCALES = ['fr', 'ht', 'en'];

async function auditPath(port, pagePath, label) {
  const summary = [];
  for (const locale of LOCALES) {
    const { lhr } = await lighthouse(`${BASE}${pagePath}`, {
      port,
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
    const failing = Object.values(lhr.audits)
      .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode === 'binary')
      .map((a) => a.id);
    summary.push({ label, locale, a11y, bp, failing });
    console.log(`== ${label}/${locale} → a11y ${a11y} · best-practices ${bp}`);
    if (failing.length) console.log('   failing audits:', failing.join(', '));
  }
  return summary;
}

const chrome = await launch({
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9223'],
});
const browser = await puppeteer.connect({ browserURL: `http://localhost:${chrome.port}` });
const results = [];
try {
  const schoolPage = await browser.newPage();
  await schoolPage.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await schoolPage.type('input[name="email"]', process.env.E2E_SCHOOL_EMAIL);
  await schoolPage.type('input[name="password"]', process.env.E2E_SCHOOL_PASSWORD);
  await Promise.all([
    schoolPage.waitForNavigation({ waitUntil: 'networkidle0' }),
    (await schoolPage.$('button[type="submit"]')).click(),
  ]);
  results.push(...(await auditPath(chrome.port, '/dashboard', 'dashboard')));
  await schoolPage.close();

  const adminPage = await browser.newPage();
  await adminPage.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await adminPage.type('input[name="email"]', process.env.E2E_ADMIN_EMAIL);
  await adminPage.type('input[name="password"]', process.env.E2E_ADMIN_PASSWORD);
  await Promise.all([
    adminPage.waitForNavigation({ waitUntil: 'networkidle0' }),
    (await adminPage.$('button[type="submit"]')).click(),
  ]);
  results.push(...(await auditPath(chrome.port, '/admin', 'admin')));
  await adminPage.close();
} finally {
  await chrome.kill();
}
console.log('\nSUMMARY');
for (const r of results) {
  console.log(`${r.label.padEnd(10)} ${r.locale.padEnd(3)} a11y=${r.a11y} bp=${r.bp} fails=[${r.failing.join(',')}]`);
}
```

Run it:

```bash
cd frontend
E2E_SCHOOL_EMAIL=... E2E_SCHOOL_PASSWORD=... E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... \
  node <scratchpad>/lh-i18n-dashboards.mjs
```

Expected: `a11y=100 bp=100` (or close — note any pre-existing failing audits unrelated to this plan's changes, don't chase unrelated scores) for all 6 combinations. Then stop the local prod server (`pkill -f "next start --port 3001"`).

- [ ] **Step 5: No commit for this task** (scratch verification only — nothing in the repo changes).

---

## Task 7: `constants.ts` cleanup + CLAUDE.md documentation + closing full-repo gate

Final task of this plan. Deletes now-dead `constants.ts` exports (with the one deliberate exception this plan's research surfaced), updates the i18n paragraph in `/CLAUDE.md`, and runs the closing gate.

**Files:**
- Modify: `frontend/src/lib/constants.ts`
- Modify: `/CLAUDE.md` (repo root)

**Interfaces:** none — closing task.

- [ ] **Step 1: Confirm zero remaining client-side importers before touching `constants.ts`**

```bash
cd frontend
grep -rn "ADMIN_DASHBOARD" src/ --include=*.tsx --include=*.ts | grep -v constants.ts
grep -rn "\bDASHBOARD\." src/ --include=*.tsx --include=*.ts | grep -v constants.ts
```

Expected: the first command returns nothing (all `admin/page.tsx` consumers migrated in Task 4). The second returns exactly the 4 lines in `src/lib/server/activity-log.ts` (`DASHBOARD.activity.gradeUpdated/absenceMarked/paymentRecorded/studentEnrolled`) — confirmed still-live per this plan's scope-corrections note. If either grep shows anything else, stop and investigate before deleting — do not assume the file list above is exhaustive.

- [ ] **Step 2: Delete `ADMIN_DASHBOARD` entirely**

Remove the whole `export const ADMIN_DASHBOARD = { ... } as const;` block from `frontend/src/lib/constants.ts` (currently lines 533–603, immediately before `export const ADMIN_SCHOOLS = {`). Leave `ADMIN_SCHOOLS`, `ADMIN_SAAS`, and everything else untouched.

- [ ] **Step 3: Shrink `DASHBOARD` to only its still-live server-side sub-object**

Replace the whole `export const DASHBOARD = { ... } as const;` block (currently lines 291–377) with:

```ts
// Server-side only: src/lib/server/activity-log.ts builds the activity-feed
// `text` field from these formatters. This is freeform narrative text
// generated on the server, not a client-side render — translating it is
// "server message normalization" (a later, separate phase), not part of
// this screen's client-side migration. Everything else DASHBOARD used to
// hold now lives in messages/{fr,ht,en}/dashboard.json.
export const DASHBOARD = {
  activity: {
    gradeUpdated: (subject: string, className: string) =>
      `Notes de ${subject} (${className}) mises à jour`,
    absenceMarked: (name: string, className: string) => `${name} marqué(e) absent — ${className}`,
    paymentRecorded: (name: string, className: string) =>
      `Paiement enregistré — ${name} (${className})`,
    studentEnrolled: (name: string, className: string) => `${name} ajouté(e) en ${className}`,
  },
} as const;
```

(Copy the four function bodies verbatim from the current file before deleting the surrounding block — do not retype from memory.)

- [ ] **Step 4: Typecheck, lint, full test suite**

```bash
cd frontend
pnpm typecheck && pnpm lint && pnpm exec vitest run
```

Expected: clean. `src/lib/server/activity-log.ts` must still compile against the shrunk `DASHBOARD.activity.*` — if it doesn't, Step 3's replacement dropped something Step 1's grep found live.

- [ ] **Step 5: Update `/CLAUDE.md`'s Internationalisation paragraph**

Find the paragraph (in the "Design system" section) starting `**Internationalisation (FR/Créole haïtien/EN).**`. Replace the sentence beginning "As of Phase 1b, `/login`..." through "...cross-checked against `src/messages/` on disk by `locales.test.ts`." with:

```md
As of Phase 1c, `/login` (Phase 0's pilot), the entire app shell (Phase 1a), the 3 auth-page siblings `/forgot-password`/`/reset-password`/`/verify-email` (Phase 1b), both dashboards (`/dashboard`, `/dashboard/activites`, `/admin`), and the sidebar plan-upsell card (`SidebarPlanCard`) are all migrated, across 13 message namespaces tracked in `MESSAGE_NAMESPACES` ([frontend/src/lib/locales.ts](frontend/src/lib/locales.ts)), the registry's single source of truth, cross-checked against `src/messages/` on disk **and** against `src/i18n/request.ts`/`src/types/next-intl.d.ts` by `locales.test.ts`.
```

Replace the following sentence "Every other screen (Paramètres tabs beyond Apparence/Langue, Pédagogie, Scolarité, most of `/admin/*`, both dashboards) still reads French from `constants.ts` unchanged;" with:

```md
Every other screen (Paramètres tabs beyond Apparence/Langue, Pédagogie, Scolarité, the rest of `/admin/*` beyond the dashboard) still reads French from `constants.ts` unchanged;
```

Leave the rest of the paragraph (the `_review` flag sentence, the static-rendering trade-off sentence) as-is.

- [ ] **Step 6: Format, final gate re-run**

```bash
cd /home/amos-dorceus/Documents/SaaSManagement/ekolplus2
pnpm exec prettier --write CLAUDE.md
pnpm format && pnpm lint && pnpm typecheck && pnpm test
```

Expected: all four green.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/constants.ts CLAUDE.md
git commit -m "$(cat <<'EOF'
chore(i18n): delete ADMIN_DASHBOARD, shrink DASHBOARD to its server-only remnant; document Phase 1c in CLAUDE.md

DASHBOARD keeps only the 4 activity-text formatters src/lib/server/
activity-log.ts still consumes server-side — everything else moved to
messages/{fr,ht,en}/dashboard.json in this plan's earlier tasks.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Report to the user**

Summarize: Phase 1 of the i18n rollout is now complete (shell/nav + auth pages + dashboards + the sidebar plan card), 13 namespaces, registry hardening closes the 3-plans-old gap, and what remains is Phase 0's roadmap items 2–9 (Paramètres tabs, Pédagogie, Scolarité, admin back-office, server message normalization, landing page, bulletin PDFs/emails, static rendering) — each its own future brainstorm → spec → plan cycle, not queued by this plan.
