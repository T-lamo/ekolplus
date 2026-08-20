# i18n — Emploi du temps (Timetable) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the whole Emploi du temps module (11 files, ~2691 lines) to FR/HT/EN under a new `timetable` next-intl namespace, and fix the module's hardcoded `date-fns` French locale + `localeCompare(…, 'fr')` collation so dates, day names and sort order follow the active app locale.

**Architecture:** Purely a display-layer migration — no API, schema or payload change. `timetable-utils.ts`'s pure formatting/sorting helpers each gain a required `locale: LocaleKey` parameter (they stay React-free; next-intl never enters that module). Every client component that calls them adds `useLocale()` and threads it through, mirroring `frontend/src/components/ui/DateField.tsx`. Hardcoded French display strings move into `frontend/src/messages/{fr,ht,en}/timetable.json`, consumed through `useTranslations('Timetable.<group>')`. Persisted values (`SessionType` codes `CM/TD/TP/EXAM`, ISO weekday numbers 1–6) are never renamed — only their visible labels are translated.

**Tech Stack:** Next.js 16 App Router (client components), TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), next-intl (no URL routing — locale resolved server-side from the `sg-locale` cookie), date-fns 4, Vitest, Tailwind v4, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-08-20-i18n-emploi-du-temps-design.md`

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Vouvoiement (formal French "vous") is app-wide and non-negotiable.** Scan for conjugated tu-imperatives, not just the literal substrings `tu`/`ton`/`ta` — grep alone misses them. This migration must convert: `Choisis` → `Choisissez`, `Indique` → `Indiquez`, `Configure` → `Configurez`, `clique` → `cliquez`, `Ajoute` → `Ajoutez`, `change` → `changez`, `Réessaie` → `Réessayez`.
- **Message JSON files use straight ASCII apostrophes (`'`, U+0027), never curly/typographic (`’`, U+2019).** Verified empirically: `messages/fr/appreciations.json`, `gradebook.json`, `fees.json` and `configuration.json` contain 0 curly apostrophes and 98 ASCII ones. The `.tsx` sources being migrated *do* use `’` (e.g. `Aujourd’hui`, `d’abord`, `l’emploi du temps`); flattening them to `'` when they move into JSON is **intentional and required**, not a transcription slip. Verify by codepoint (`grep -c "’" <file>` must print `0`), not by eye.
- **Plural forms use this repo's `.one`/`.other` leaf-key convention** — plain nested JSON objects, e.g. `"updated": { "one": "…", "other": "…" }` — **not** ICU MessageFormat `{count, plural, …}`. The consuming code selects the leaf manually: `t(count === 1 ? 'toasts.updated.one' : 'toasts.updated.other', { count })`. Precedent: `frontend/src/app/(school)/settings/ProfilTab.tsx:177`, `frontend/src/components/school/billing/UsageCard.tsx:87`.
- **The `_review` flag** must appear exactly once across the whole namespace, as a single top-level key in the **`ht` file only**, added in Task 2 (the first task with real Creole content) and never repeated. Copy verbatim, ASCII apostrophes as shown:
  `"_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production."`
- **Persisted values are never renamed.** `SessionType` (`'CM' | 'TD' | 'TP' | 'EXAM'`) and the ISO weekday numbers `1..6` are round-tripped to `/api/school/timetable`. Only their display labels are translated.
- **No empty-string values in any locale** — `locales.test.ts`'s `no empty-string values in any locale` check fails on `""`.
- **Concurrent sessions share this git checkout.** Another Claude session may hold uncommitted work in the same tree. Never `git add -A` / `git add .`. Stage explicit paths only and commit with `git commit --only -- <paths>`, then verify with `git show --stat HEAD` that nothing foreign was swept in. If the shared pre-commit hook (full-project `tsc --noEmit`) fails on files you did not touch, that is the peer's WIP — do not "fix" their files; ask them to stash, or re-run once their tree settles.
- **Run all commands from the repo root** `/home/amos-dorceus/Documents/SaaSManagement/ekolplus2`. Paths containing `(school)` must be single-quoted in shell commands.
- **Every task ends green**: `pnpm typecheck` plus the task's own tests must pass before its commit. No task may leave the tree non-compiling for the next one.

### Namespace registration contract (Task 1 establishes it; do not re-derive)

`timetable` → PascalCase `Timetable`. Three hand-written files must agree, and `locales.test.ts` asserts each one by exact substring:

| File | Required content |
|---|---|
| `frontend/src/lib/locales.ts` | `'timetable',` appended to `MESSAGE_NAMESPACES` after `'appreciations',` |
| `frontend/src/i18n/request.ts` | `timetable` in the destructure array, `` import(`../messages/${locale}/timetable.json`) `` in the `Promise.all` array (same index), and `Timetable: timetable.default,` in the returned `messages` object |
| `frontend/src/types/next-intl.d.ts` | `import type timetable from '@/messages/fr/timetable.json';` and `Timetable: typeof timetable;` inside `AppConfig.Messages` |

### Task → key-group ownership (no task edits another's groups)

| Task | Key groups added to `timetable.json` |
|---|---|
| 1 | *(none — file seeded as `{}`)* |
| 2 | `_review` (ht only), `sessionType`, `legend`, `grid`, `agenda`, `month` |
| 3 | `toolbar`, `export` |
| 4 | `sessionForm` |
| 5 | *(none — docs + gate)* |

---

## File Structure

**Created**
- `frontend/src/messages/fr/timetable.json` — French source of truth for the key set.
- `frontend/src/messages/ht/timetable.json` — Haitian Creole, carries the single `_review` flag.
- `frontend/src/messages/en/timetable.json` — English.

**Modified**
- `frontend/src/lib/locales.ts` — registry entry only.
- `frontend/src/i18n/request.ts` — import + message-object entry.
- `frontend/src/types/next-intl.d.ts` — type import + `Messages` entry.
- `frontend/src/components/school/timetable/timetable-utils.ts` (304 lines) — `CALENDAR_LOCALE`, `LOCALE_BCP47` collation, `locale: LocaleKey` params, new `weekdayHeaders()`, later `joinDayNames()`; loses `CSV_HEADERS`, `TYPE_META.label`, `recurrenceDaysLabel`, and the French label fields of `RECURRENCE_DAYS`.
- `frontend/src/components/school/timetable/timetable-utils.test.ts` (189 lines) — existing calls gain `'fr'`; new locale-awareness suite.
- `frontend/src/components/school/timetable/TimetableMonth.tsx` (105 lines)
- `frontend/src/components/school/timetable/TimetableGrid.tsx` (131 lines)
- `frontend/src/components/school/timetable/TimetableAgenda.tsx` (118 lines)
- `frontend/src/components/school/timetable/TimetableLegend.tsx` (46 lines)
- `frontend/src/app/(school)/pedagogie/emploi-du-temps/page.tsx` (525 lines)
- `frontend/src/components/school/timetable/SessionFormModal.tsx` (1045 lines)
- `CLAUDE.md` — Internationalisation paragraph.

**Untouched (fenced — do not edit)**
- `frontend/src/lib/csv-export.ts` — generic, language-agnostic, shared with other modules.
- `frontend/src/lib/rooms.ts`, `frontend/src/lib/subject-visuals.ts` — types/colours, no strings.
- `frontend/src/components/school/timetable/types.ts`, `CourseCard.tsx`, `TimetableFilterSelect.tsx` — no hardcoded user-facing text.
- `Modal`, `DateField`, `FormStepsBar`, `WizardNav`, `components/school/subjects/form-primitives.tsx` — already migrated shared primitives. Only the **props** this module feeds them get translated.
- `frontend/src/messages/*/configuration.json` — its timetable-adjacent Salles prose belongs to the `configuration` namespace.
- `OFFLINE_SYNC` — confirmed absent from this module. No fence needed anywhere.

### Two spec gaps resolved inline (flagged for reviewer override)

1. **`RECURRENCE_DAYS[].short`** (`'L' 'Ma' 'Me' 'J' 'V' 'Sa'`) is unmentioned by the spec's Decision 7, which enumerates only *translated* (`TYPE_META.label`, `RECURRENCE_DAYS[].plural`) and *persisted* (`TYPE_META.short`, `RECURRENCE_DAYS[].value`) fields. `.short` is neither: it is a pure French display initial. Leaving it hardcoded would render a French letter under an English `aria-label` on the same button. Resolved **by the spec's own stated principle** (display strings get translated; persisted values do not) → translated as `timetable.recurrence.dayShort.*` in Task 4.
2. **`SessionFormModal.tsx` is a `formatLong()` call site** (lines 412 and 824) and is missing from the spec's Architecture list of components needing `useLocale()`. It must be included in Task 1's mechanical threading or Task 1 will not typecheck.

### Verified date-fns output (do not re-derive — measured against date-fns 4.4.0 in this repo)

| Call | `fr` / `ht` | `en` |
|---|---|---|
| `weekdayHeaders` | `['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']` | `['Mon','Tue','Wed','Thu','Fri','Sat','Sun']` |
| `formatLong('2026-08-17')` | `Lundi 17 août 2026` | `Monday 17 August 2026` |
| `formatDayName('2026-08-17')` | `Lundi` | `Monday` |
| `formatDayShort('2025-06-16')` | `16 Juin` | `16 June` |
| `formatMonthYear('2026-08-17')` | `Août 2026` | `August 2026` |
| `formatWeekRange(weekDays('2025-06-17'))` | `16 – 20 Juin 2025` | `16 – 20 June 2025` |
| `formatWeekRange(weekDays('2025-10-01'))` | `29 Sept. – 3 Oct. 2025` | `29 Sep – 3 Oct 2025` |

Every French value is byte-identical to what the module renders today, so Task 1 is a **no-visible-change** refactor for French users.

---

## Task 1: Foundation — namespace registration + `timetable-utils.ts` locale refactor

Pure plumbing: register the namespace with empty message files, make every date/collation helper locale-aware, and mechanically thread `useLocale()` through all six call sites. **Zero user-facing strings change in this task.**

**Files:**
- Create: `frontend/src/messages/fr/timetable.json`, `frontend/src/messages/ht/timetable.json`, `frontend/src/messages/en/timetable.json`
- Modify: `frontend/src/lib/locales.ts:69`, `frontend/src/i18n/request.ts:49,74,103`, `frontend/src/types/next-intl.d.ts:31,61`
- Modify: `frontend/src/components/school/timetable/timetable-utils.ts:5-8,58-89,184-224,289-304`
- Modify: `frontend/src/components/school/timetable/TimetableMonth.tsx:8-11,34`
- Modify: `frontend/src/components/school/timetable/TimetableGrid.tsx:13-19,44,78,80,110`
- Modify: `frontend/src/components/school/timetable/TimetableAgenda.tsx:8-16,30,47,64,66`
- Modify: `frontend/src/components/school/timetable/TimetableLegend.tsx:7,10-11`
- Modify: `frontend/src/components/school/timetable/SessionFormModal.tsx:412,824`
- Modify: `frontend/src/app/(school)/pedagogie/emploi-du-temps/page.tsx:52-65,233-238,272`
- Test: `frontend/src/components/school/timetable/timetable-utils.test.ts`

**Interfaces:**
- Consumes: `LocaleKey`, `LOCALE_BCP47` (both already exported from `frontend/src/lib/locales.ts`); `useLocale()` from `next-intl` (returns `LocaleKey` — next-intl's `AppConfig.Locale` is declared as `(typeof LOCALE_KEYS)[number]`, so no cast is needed).
- Produces, all exported from `frontend/src/components/school/timetable/timetable-utils.ts`:
  ```ts
  formatLong(day: string, locale: LocaleKey): string
  formatDayName(day: string, locale: LocaleKey): string
  formatDayShort(day: string, locale: LocaleKey): string
  formatMonthYear(day: string, locale: LocaleKey): string
  formatWeekRange(days: string[], locale: LocaleKey): string
  weekdayHeaders(locale: LocaleKey): string[]            // NEW
  buildRows(sessions: TimetableSession[], days: string[], locale: LocaleKey): GridRow[]
  sessionsOn(sessions: TimetableSession[], day: string, locale: LocaleKey): TimetableSession[]
  legendSubjects(sessions: TimetableSession[], locale: LocaleKey): { id: string; name: string; color: string }[]
  csvRows(sessions: TimetableSession[], locale: LocaleKey): (string | number)[][]
  ```
  Still exported and unchanged in this task (later tasks remove them): `CSV_HEADERS`, `TYPE_META` (incl. `.label`), `RECURRENCE_DAYS` (incl. `.short`/`.plural`), `recurrenceDaysLabel`.
- Produces for Task 2+: the registered `Timetable` namespace, keyed off `frontend/src/messages/fr/timetable.json`.

---

- [ ] **Step 1: Create the three empty message files**

`frontend/src/messages/fr/timetable.json`, `frontend/src/messages/ht/timetable.json` and `frontend/src/messages/en/timetable.json` each contain exactly:

```json
{}
```

`locales.test.ts`'s `keyPaths()` returns `[]` for `{}`, so all three key-parity assertions pass trivially. Do **not** add `_review` here — it belongs to Task 2, the first task with real Creole content.

- [ ] **Step 2: Register the namespace in `frontend/src/lib/locales.ts`**

In the `MESSAGE_NAMESPACES` array, append after `'appreciations',`:

```ts
  'appreciations',
  'timetable',
] as const;
```

- [ ] **Step 3: Register it in `frontend/src/i18n/request.ts`**

Three edits, all appended last in their list so the destructure and `Promise.all` indices stay aligned:

```ts
    appreciations,
    timetable,
  ] = await Promise.all([
```

```ts
    import(`../messages/${locale}/appreciations.json`),
    import(`../messages/${locale}/timetable.json`),
  ]);
```

```ts
      Appreciations: appreciations.default,
      Timetable: timetable.default,
    },
```

- [ ] **Step 4: Register it in `frontend/src/types/next-intl.d.ts`**

```ts
import type appreciations from '@/messages/fr/appreciations.json';
import type timetable from '@/messages/fr/timetable.json';
```

```ts
      Appreciations: typeof appreciations;
      Timetable: typeof timetable;
    };
```

- [ ] **Step 5: Run the registry tests — they must already pass**

```bash
pnpm --filter frontend exec vitest run src/lib/locales.test.ts
```

Expected: PASS. The three sync suites (`…with disk`, `…with i18n/request.ts`, `…with next-intl.d.ts`) plus `timetable: fr/ht/en share the exact same key set` and `timetable: no empty-string values in any locale` all now include `timetable`.

- [ ] **Step 6: Write the failing locale-awareness tests**

Append to `frontend/src/components/school/timetable/timetable-utils.test.ts`, and extend its import list at the top with `csvRows`, `formatDayName`, `formatMonthYear`, `sessionsOn`, `weekdayHeaders`:

```ts
// Every date label and every name sort in this module used to be pinned to
// French (a hardcoded date-fns `fr` import + `localeCompare(…, 'fr')`).
// These lock in the fix: French output is byte-identical to before, English
// really switches, and Haitian Creole deliberately follows French (same
// reasoning as locales.ts's LOCALE_BCP47).
describe('locale-aware labels', () => {
  it('formats dates in the requested locale', () => {
    expect(formatLong('2026-08-17', 'fr')).toBe('Lundi 17 août 2026');
    expect(formatLong('2026-08-17', 'en')).toBe('Monday 17 August 2026');
    expect(formatDayName('2026-08-17', 'fr')).toBe('Lundi');
    expect(formatDayName('2026-08-17', 'en')).toBe('Monday');
    expect(formatDayShort('2025-06-16', 'fr')).toBe('16 Juin');
    expect(formatDayShort('2025-06-16', 'en')).toBe('16 June');
    expect(formatMonthYear('2026-08-17', 'fr')).toBe('Août 2026');
    expect(formatMonthYear('2026-08-17', 'en')).toBe('August 2026');
  });

  it('formats week ranges per locale, within and across months', () => {
    expect(formatWeekRange(weekDays('2025-06-17'), 'en')).toBe('16 – 20 June 2025');
    expect(formatWeekRange(weekDays('2025-10-01'), 'en')).toBe('29 Sep – 3 Oct 2025');
  });

  it('Haitian Creole shares the French calendar convention', () => {
    expect(formatLong('2026-08-17', 'ht')).toBe(formatLong('2026-08-17', 'fr'));
    expect(formatMonthYear('2026-08-17', 'ht')).toBe(formatMonthYear('2026-08-17', 'fr'));
    expect(weekdayHeaders('ht')).toEqual(weekdayHeaders('fr'));
  });

  it('derives the month-view weekday headers instead of hardcoding them', () => {
    expect(weekdayHeaders('fr')).toEqual(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']);
    expect(weekdayHeaders('en')).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });

  it('sessionsOn keeps one day, sorted by start time then class name', () => {
    const list = sessionsOn(
      [
        session({ date: '2026-08-17', startMinutes: 540, endMinutes: 600 }),
        session({
          date: '2026-08-17',
          startMinutes: 480,
          endMinutes: 540,
          classId: 'c2',
          class: { id: 'c2', name: '4ème A', color: null },
        }),
        session({ date: '2026-08-18', startMinutes: 480, endMinutes: 540 }),
      ],
      '2026-08-17',
      'fr',
    );
    expect(list.map((s) => s.startMinutes)).toEqual([480, 540]);
  });

  it('csvRows renders the Jour column in the requested locale', () => {
    const rows = csvRows([session({ date: '2026-08-17', startMinutes: 480, endMinutes: 540 })], 'en');
    expect(rows[0]?.[1]).toBe('Monday');
    expect(csvRows([session({ date: '2026-08-17', startMinutes: 480, endMinutes: 540 })], 'fr')[0]?.[1]).toBe(
      'Lundi',
    );
  });
});
```

- [ ] **Step 7: Run them to verify they fail**

```bash
pnpm --filter frontend exec vitest run src/components/school/timetable/timetable-utils.test.ts
```

Expected: FAIL — `weekdayHeaders is not a function` / `does not provide an export named 'weekdayHeaders'`, and the `'en'` expectations return French because the extra argument is ignored today.

- [ ] **Step 8: Rewrite the imports and add `CALENDAR_LOCALE` in `timetable-utils.ts`**

Replace lines 5–8:

```ts
import { format, type Locale } from 'date-fns';
import { enUS, fr } from 'date-fns/locale';
import { LOCALE_BCP47, type LocaleKey } from '@/lib/locales';
import { subjectAccentColor } from '@/lib/subject-visuals';
import type { SessionType, TimetableSession } from './types';
```

Then, immediately under the existing `cap` helper (line 59), add:

```ts
// Haitian Creole has no distinct calendar-formatting convention in wide
// practical use (same reasoning as locales.ts's LOCALE_BCP47 and
// DateField.tsx's own CALENDAR_LOCALE: 'ht' maps to the French locale, not a
// bare 'ht' the engine would silently fall back on), so day/month names stay
// French between fr/ht and only switch for en.
const CALENDAR_LOCALE: Record<LocaleKey, Locale> = {
  fr,
  ht: fr,
  en: enUS,
};
```

- [ ] **Step 9: Make the five label helpers locale-aware and add `weekdayHeaders`**

Replace the whole block from `export function formatLong` through the end of `formatWeekRange` (lines 61–89) with:

```ts
export function formatLong(day: string, locale: LocaleKey): string {
  // "Lundi 17 août 2026" / "Monday 17 August 2026"
  return cap(format(fromDay(day), 'EEEE d MMMM yyyy', { locale: CALENDAR_LOCALE[locale] }));
}
export function formatDayName(day: string, locale: LocaleKey): string {
  return cap(format(fromDay(day), 'EEEE', { locale: CALENDAR_LOCALE[locale] }));
}
export function formatDayShort(day: string, locale: LocaleKey): string {
  // "17 Août" — the mock capitalises the month in the column head
  const [n, ...rest] = format(fromDay(day), 'd MMMM', {
    locale: CALENDAR_LOCALE[locale],
  }).split(' ');
  return `${n} ${cap(rest.join(' '))}`;
}
export function formatMonthYear(day: string, locale: LocaleKey): string {
  return cap(format(fromDay(day), 'MMMM yyyy', { locale: CALENDAR_LOCALE[locale] }));
}
/** "16 – 20 Juin 2025" or "29 Sept. – 3 Oct. 2025" across two months. */
export function formatWeekRange(days: string[], locale: LocaleKey): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return '';
  const a = fromDay(first);
  const b = fromDay(last);
  const dateLocale = CALENDAR_LOCALE[locale];
  const month = (d: Date) => cap(format(d, 'MMMM', { locale: dateLocale }));
  const monthShort = (d: Date) => cap(format(d, 'MMM', { locale: dateLocale }));
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()} – ${b.getUTCDate()} ${month(a)} ${b.getUTCFullYear()}`;
  }
  return `${a.getUTCDate()} ${monthShort(a)} – ${b.getUTCDate()} ${monthShort(b)} ${b.getUTCFullYear()}`;
}

// Any real Monday works — only the weekday names are read off it. Routed
// through mondayOf() so the constant stays a Monday even if someone edits it.
const HEADER_WEEK_MONDAY = mondayOf('2026-08-17');
/**
 * Mon → Sun column heads of the month view — « Lun · Mar … » in fr/ht,
 * « Mon · Tue … » in en. date-fns's 'EEE' yields 'lun.' (lowercase, trailing
 * period) in French and 'Mon' in English; cap() + the period strip normalise
 * both to the style the month grid has always shown (the fixups are no-ops
 * for English). Replaces TimetableMonth.tsx's hardcoded French array.
 */
export function weekdayHeaders(locale: LocaleKey): string[] {
  const dateLocale = CALENDAR_LOCALE[locale];
  return Array.from({ length: 7 }, (_, i) =>
    cap(
      format(fromDay(addDays(HEADER_WEEK_MONDAY, i)), 'EEE', { locale: dateLocale }).replace(
        /\.$/,
        '',
      ),
    ),
  );
}
```

- [ ] **Step 10: Thread the collation locale through the three sorts**

`buildRows` (line 184) — replace its signature and the sort inside:

```ts
export function buildRows(
  sessions: TimetableSession[],
  days: string[],
  locale: LocaleKey,
): GridRow[] {
  const collation = LOCALE_BCP47[locale];
  const daySet = new Set(days);
  const visible = sessions.filter((s) => daySet.has(s.date));
  const starts = [...new Set(visible.map((s) => s.startMinutes))].sort((a, b) => a - b);
  const slotStarts = starts.length > 0 ? starts : DEFAULT_ROW_STARTS;
  return slotStarts.map((start) => {
    const cells = new Map<string, TimetableSession[]>();
    for (const day of days) cells.set(day, []);
    const inRow = visible.filter((s) => s.startMinutes === start);
    for (const s of inRow) cells.get(s.date)?.push(s);
    for (const list of cells.values()) {
      list.sort((a, b) => a.class.name.localeCompare(b.class.name, collation));
    }
    return { start, cells };
  });
}

export function sessionsOn(
  sessions: TimetableSession[],
  day: string,
  locale: LocaleKey,
): TimetableSession[] {
  const collation = LOCALE_BCP47[locale];
  return sessions
    .filter((s) => s.date === day)
    .sort(
      (a, b) =>
        a.startMinutes - b.startMinutes || a.class.name.localeCompare(b.class.name, collation),
    );
}
```

`legendSubjects` (line 210) — signature plus its final sort:

```ts
/** Distinct subjects of the visible sessions, for the legend. */
export function legendSubjects(
  sessions: TimetableSession[],
  locale: LocaleKey,
): { id: string; name: string; color: string }[] {
  const seen = new Map<string, { id: string; name: string; color: string }>();
  for (const s of sessions) {
    if (!seen.has(s.subjectId)) {
      seen.set(s.subjectId, {
        id: s.subjectId,
        name: s.subject.name,
        color: sessionColor(s),
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, LOCALE_BCP47[locale]));
}
```

There are exactly **three** `localeCompare(…, 'fr')` occurrences in the file (lines 195, 205, 223) — all three are now gone. Do **not** touch `csvRows`'s `a.date.localeCompare(b.date)`: it compares `'YYYY-MM-DD'` strings for chronological order, which is deliberately locale-independent.

- [ ] **Step 11: Give `csvRows` its locale parameter**

Replace the `csvRows` signature and its `formatDayName` call (lines 289–304). Leave `CSV_HEADERS` exactly where it is — Task 3 removes it, once its only consumer has been migrated.

```ts
export function csvRows(sessions: TimetableSession[], locale: LocaleKey): (string | number)[][] {
  return [...sessions]
    // Chronological, not lexicographic-by-locale: 'YYYY-MM-DD' ordinal
    // comparison is intentionally locale-independent here.
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes)
    .map((s) => [
      s.date,
      formatDayName(s.date, locale),
      minutesToHHMM(s.startMinutes),
      minutesToHHMM(s.endMinutes),
      s.class.name,
      s.subject.name,
      typeMeta(s.type).short,
      s.teacher?.name ?? '',
      s.room ?? '',
      s.description ?? '',
    ]);
}
```

- [ ] **Step 12: Add `'fr'` to every existing call in `timetable-utils.test.ts`**

Nine call sites; the expected strings do **not** change — French is now passed explicitly instead of implicitly.

```ts
    expect(formatWeekRange(weekDays('2025-06-17'), 'fr')).toBe('16 – 20 Juin 2025');
    expect(formatWeekRange(weekDays('2025-10-01'), 'fr')).toBe(
      '29 sept. – 3 oct. 2025'.replace('29 sept.', '29 Sept.').replace('3 oct.', '3 Oct.'),
    );
    expect(formatLong('2026-08-17', 'fr')).toBe('Lundi 17 août 2026');
    expect(formatDayShort('2025-06-16', 'fr')).toBe('16 Juin');
```

```ts
    const rows = buildRows([], days, 'fr');
```

```ts
    const rows = buildRows(sessions, days, 'fr');
```

```ts
    const rows = buildRows(
      [
        session({
          date: '2026-08-17',
          startMinutes: 480,
          endMinutes: 540,
          classId: 'c2',
          class: { id: 'c2', name: '4ème A', color: null },
        }),
        session({ date: '2026-08-17', startMinutes: 480, endMinutes: 540 }),
      ],
      days,
      'fr',
    );
```

```ts
    expect(legendSubjects(sessions, 'fr').map((s) => s.name)).toEqual(['Anglais', 'Mathématiques']);
```

```ts
    expect(legendSubjects([s], 'fr')[0]?.color).toBe(getSubjectVisual('Philosophie').iconFg);
```

- [ ] **Step 13: Run the utils tests — they must now pass**

```bash
pnpm --filter frontend exec vitest run src/components/school/timetable/timetable-utils.test.ts
```

Expected: PASS, all suites including the new `locale-aware labels` block.

- [ ] **Step 14: Thread `useLocale()` through `TimetableMonth.tsx`**

Delete the `WEEKDAY_HEADERS` const (line 11) and use the helper. Replace the import block and the two call sites:

```tsx
import { useLocale } from 'next-intl';
import { CourseCard } from './CourseCard';
import type { TimetableSession } from './types';
import { monthGrid, sessionsOn, weekdayHeaders } from './timetable-utils';
import { cn } from '@/lib/utils';

const MAX_CHIPS = 3;
```

Inside the component body, right after the destructured props:

```tsx
  const locale = useLocale();
  const grid = monthGrid(anchor);
  const month = anchor.slice(0, 7);
  const headers = weekdayHeaders(locale);
```

Then `{WEEKDAY_HEADERS.map((h, i) => (` becomes `{headers.map((h, i) => (`, and `sessionsOn(sessions, day)` becomes `sessionsOn(sessions, day, locale)`.

- [ ] **Step 15: Thread `useLocale()` through `TimetableGrid.tsx`**

Add `import { useLocale } from 'next-intl';` above the `CourseCard` import. Inside the component, replace line 44:

```tsx
  const locale = useLocale();
  const rows = buildRows(sessions, days, locale);
```

Then update the three remaining calls: `{formatDayName(day, locale)}`, `{formatDayShort(day, locale)}`, and inside the aria-label template `${formatLong(day, locale)}` (still hardcoded French wrapper text — Task 2 translates it).

- [ ] **Step 16: Thread `useLocale()` through `TimetableAgenda.tsx`**

Add `import { useLocale } from 'next-intl';`. Inside the component, above the `total` computation:

```tsx
  const locale = useLocale();
  const total = days.reduce((n, d) => n + sessionsOn(sessions, d, locale).length, 0);
```

Then `const list = sessionsOn(sessions, day, locale);`, `{formatDayName(day, locale)}` and `{formatDayShort(day, locale)}`.

- [ ] **Step 17: Thread `useLocale()` through `TimetableLegend.tsx`**

```tsx
import { useLocale } from 'next-intl';
```

```tsx
export function TimetableLegend({ sessions }: { sessions: TimetableSession[] }) {
  const locale = useLocale();
  const subjects = legendSubjects(sessions, locale);
```

- [ ] **Step 18: Thread `useLocale()` through `SessionFormModal.tsx`**

This file is a `formatLong` call site the spec's Architecture list omits (see "Two spec gaps resolved inline"). Add `import { useLocale } from 'next-intl';` after the `next/link` import, then inside the component — directly under `const mode = editing ? 'edit' : 'create';` (line 120):

```tsx
  const locale = useLocale();
```

Update both calls: line 412 `formatLong(editing.date, locale)` and line 824 `formatLong(until, locale).replace(/^\S+ /, '')`.

- [ ] **Step 19: Thread `useLocale()` through `page.tsx`**

Add `import { useLocale } from 'next-intl';` next to the other framework imports. Inside `EmploiDuTempsPage`, directly under `const { toast } = useToast();`:

```tsx
  const locale = useLocale();
```

Update `navLabel` (lines 233–238):

```tsx
  const navLabel =
    view === 'month'
      ? formatMonthYear(anchor, locale)
      : view === 'day'
        ? formatLong(anchor, locale)
        : formatWeekRange(days, locale);
```

and the export call (line 272), still using the untranslated `CSV_HEADERS` in this task:

```tsx
    exportToCsv(
      `emploi-du-temps-${range.from}_${range.to}.csv`,
      CSV_HEADERS,
      csvRows(filtered, locale),
    );
```

- [ ] **Step 20: Verify the whole tree compiles and tests pass**

```bash
pnpm typecheck && pnpm --filter frontend exec vitest run src/lib/locales.test.ts src/components/school/timetable/timetable-utils.test.ts
```

Expected: typecheck clean (no `Expected 2 arguments, but got 1` anywhere), both test files PASS.

- [ ] **Step 21: Commit**

```bash
cd /home/amos-dorceus/Documents/SaaSManagement/ekolplus2
git add frontend/src/messages/fr/timetable.json frontend/src/messages/ht/timetable.json \
        frontend/src/messages/en/timetable.json frontend/src/lib/locales.ts \
        frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts \
        frontend/src/components/school/timetable/timetable-utils.ts \
        frontend/src/components/school/timetable/timetable-utils.test.ts \
        frontend/src/components/school/timetable/TimetableMonth.tsx \
        frontend/src/components/school/timetable/TimetableGrid.tsx \
        frontend/src/components/school/timetable/TimetableAgenda.tsx \
        frontend/src/components/school/timetable/TimetableLegend.tsx \
        frontend/src/components/school/timetable/SessionFormModal.tsx \
        'frontend/src/app/(school)/pedagogie/emploi-du-temps/page.tsx'
git commit --only -- frontend/src/messages/fr/timetable.json frontend/src/messages/ht/timetable.json \
        frontend/src/messages/en/timetable.json frontend/src/lib/locales.ts \
        frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts \
        frontend/src/components/school/timetable/ \
        'frontend/src/app/(school)/pedagogie/emploi-du-temps/page.tsx' \
  -m "feat(i18n): register timetable namespace + make timetable-utils locale-aware

Every date label and name sort in Emploi du temps was pinned to French
(hardcoded date-fns fr import, localeCompare(..., 'fr')). Adds a required
locale: LocaleKey parameter to the formatting/sorting helpers, a local
CALENDAR_LOCALE mirroring DateField.tsx, and reuses the shared LOCALE_BCP47
collation map. New weekdayHeaders() replaces TimetableMonth's hardcoded
['Lun', ...] array. No visible change for French users.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git show --stat HEAD
```

Confirm `git show --stat HEAD` lists only the files above — nothing from a concurrent session.

---

## Task 2: Small view components — Legend, Grid, Agenda, Month

Four small presentational components, same shape (a handful of own strings each, all already consuming the locale-aware utils from Task 1). This is the first task with real translated content, so it seeds the `_review` flag.

**Files:**
- Modify: `frontend/src/messages/fr/timetable.json`, `frontend/src/messages/ht/timetable.json`, `frontend/src/messages/en/timetable.json`
- Modify: `frontend/src/components/school/timetable/TimetableLegend.tsx`
- Modify: `frontend/src/components/school/timetable/TimetableGrid.tsx`
- Modify: `frontend/src/components/school/timetable/TimetableAgenda.tsx`
- Modify: `frontend/src/components/school/timetable/TimetableMonth.tsx`
- Modify: `frontend/src/components/school/timetable/timetable-utils.ts` (drop `TYPE_META.label`)
- Test: `frontend/src/lib/locales.test.ts` (existing suite — no new test file)

**Interfaces:**
- Consumes from Task 1: the registered `Timetable` namespace; `legendSubjects(sessions, locale)`, `sessionsOn(sessions, day, locale)`, `weekdayHeaders(locale)`, `formatLong(day, locale)`, `minutesToHHMM(m)`.
- Produces for Task 4: the `timetable.sessionType.*` key group — the module's **single source of truth** for the four session-type labels, consumed via `useTranslations('Timetable.sessionType')` with a dynamic `t(type)` key. Mirrors the `Gradebook.evaluationType` precedent (`frontend/src/app/(school)/pedagogie/carnet-de-notes/ParEvaluationTab.tsx:43`).
- Produces: `TYPE_META` narrowed to `Record<SessionType, { short: string; badge: string; active: string }>` — the `label` field is gone, so no French label can drift back in.

---

- [ ] **Step 1: Add the Task-2 key groups to `frontend/src/messages/fr/timetable.json`**

```json
{
  "sessionType": {
    "CM": "Cours magistral",
    "TD": "Travaux dirigés",
    "TP": "Travaux pratiques",
    "EXAM": "Examen"
  },
  "legend": {
    "subjectsAriaLabel": "Légende des matières",
    "empty": "Aucune matière sur cette période",
    "typesAriaLabel": "Types de séance"
  },
  "grid": {
    "addSessionAriaLabel": "Ajouter un cours {day} à {time}"
  },
  "agenda": {
    "emptyTitle": "Aucune séance sur cette période",
    "emptyHint": "Ajoutez un cours ou changez de semaine avec les flèches.",
    "todayBadge": "Aujourd'hui"
  },
  "month": {
    "viewDayAriaLabel": "Voir le {day}",
    "more": {
      "one": "+{count} autre",
      "other": "+{count} autres"
    }
  }
}
```

Note two deliberate changes from the source: `Ajoute un cours ou change de semaine` → **`Ajoutez … changez`** (vouvoiement), and `Aujourd’hui` → **`Aujourd'hui`** (ASCII apostrophe, per Global Constraints).

- [ ] **Step 2: Add the same groups to `frontend/src/messages/ht/timetable.json`**

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "sessionType": {
    "CM": "Kou majistral",
    "TD": "Travo dirije",
    "TP": "Travo pratik",
    "EXAM": "Egzamen"
  },
  "legend": {
    "subjectsAriaLabel": "Lejand matyè yo",
    "empty": "Pa gen matyè pou peryòd sa a",
    "typesAriaLabel": "Kalite seyans"
  },
  "grid": {
    "addSessionAriaLabel": "Ajoute yon kou {day} a {time}"
  },
  "agenda": {
    "emptyTitle": "Pa gen seyans pou peryòd sa a",
    "emptyHint": "Ajoute yon kou oswa chanje semèn ak flèch yo.",
    "todayBadge": "Jodi a"
  },
  "month": {
    "viewDayAriaLabel": "Wè {day}",
    "more": {
      "one": "+{count} lòt",
      "other": "+{count} lòt"
    }
  }
}
```

Kreyòl does not mark plurals with a suffix, so `more.one` and `more.other` are intentionally identical — the leaf keys still exist because `locales.test.ts` asserts an identical key set across locales.

- [ ] **Step 3: Add the same groups to `frontend/src/messages/en/timetable.json`**

```json
{
  "sessionType": {
    "CM": "Lecture",
    "TD": "Tutorial",
    "TP": "Lab work",
    "EXAM": "Exam"
  },
  "legend": {
    "subjectsAriaLabel": "Subject legend",
    "empty": "No subject in this period",
    "typesAriaLabel": "Session types"
  },
  "grid": {
    "addSessionAriaLabel": "Add a course on {day} at {time}"
  },
  "agenda": {
    "emptyTitle": "No session in this period",
    "emptyHint": "Add a course or change week with the arrows.",
    "todayBadge": "Today"
  },
  "month": {
    "viewDayAriaLabel": "View {day}",
    "more": {
      "one": "+{count} more",
      "other": "+{count} more"
    }
  }
}
```

- [ ] **Step 4: Run the parity test to verify the three files agree**

```bash
pnpm --filter frontend exec vitest run src/lib/locales.test.ts -t "timetable"
```

Expected: PASS — `timetable: fr/ht/en share the exact same key set` and `timetable: no empty-string values in any locale`. (`_review` is filtered out of the key-set comparison by the test itself.)

- [ ] **Step 5: Drop `TYPE_META.label` from `timetable-utils.ts`**

The message group is now the single source of truth. Replace the `TYPE_META` declaration (lines 113–141):

```ts
/** Visual metadata of a session type. The user-visible long label is NOT
 * here — it lives in the `timetable.sessionType.*` message group so it can
 * be translated; `short` is the persisted API code and stays as-is. */
export const TYPE_META: Record<SessionType, { short: string; badge: string; active: string }> = {
  CM: {
    short: 'CM',
    badge: 'bg-[#ddd6fe] text-[#5b21b6]',
    active: 'border-[#7c3aed] bg-[#ede9fb] text-[#5b21b6]',
  },
  TD: {
    short: 'TD',
    badge: 'bg-[#d1fae5] text-[#065f46]',
    active: 'border-[#059669] bg-[#d1fae5] text-[#065f46]',
  },
  TP: {
    short: 'TP',
    badge: 'bg-[#fee2e2] text-[#991b1b]',
    active: 'border-[#e11d48] bg-[#fee2e2] text-[#991b1b]',
  },
  EXAM: {
    short: 'EXAM',
    badge: 'bg-[#fef3c7] text-[#92400e]',
    active: 'border-[#d97706] bg-[#fef3c7] text-[#92400e]',
  },
};
```

`TimetableLegend.tsx` (next step) is the only reader of `.label`; `CourseCard.tsx` and `TimetableAgenda.tsx` read `.badge`/`.short` only, and `SessionFormModal.tsx` reads `.active`/`.short`.

- [ ] **Step 6: Translate `TimetableLegend.tsx`**

Add the two hooks and swap the four strings:

```tsx
import { useLocale, useTranslations } from 'next-intl';
```

```tsx
export function TimetableLegend({ sessions }: { sessions: TimetableSession[] }) {
  const locale = useLocale();
  const t = useTranslations('Timetable.legend');
  const tType = useTranslations('Timetable.sessionType');
  const subjects = legendSubjects(sessions, locale);
```

```tsx
      <div className="flex flex-wrap items-center gap-2" aria-label={t('subjectsAriaLabel')}>
        {subjects.length === 0 && (
          <span className="text-2xs text-muted-foreground">{t('empty')}</span>
        )}
```

```tsx
      <div className="flex flex-wrap items-center gap-2" aria-label={t('typesAriaLabel')}>
```

**Careful:** the existing `SESSION_TYPES.map((t) => …)` callback parameter shadows the `t` translator — writing `tType(t)` inside it would silently pass the *function* as a key. Rename the loop variable to `type` throughout that block:

```tsx
        {SESSION_TYPES.map((type) => (
          <span key={type} className="flex items-center gap-1">
            <span
              className={cn(
                'rounded-full px-[7px] py-0.5 text-[10px] font-bold',
                TYPE_META[type].badge,
              )}
            >
              {TYPE_META[type].short}
            </span>
            <span className="text-2xs text-muted-foreground">{tType(type)}</span>
          </span>
        ))}
```

- [ ] **Step 7: Translate `TimetableGrid.tsx`'s aria-label**

Add `useTranslations` to the existing next-intl import, then inside the component:

```tsx
import { useLocale, useTranslations } from 'next-intl';
```

```tsx
  const locale = useLocale();
  const t = useTranslations('Timetable.grid');
  const rows = buildRows(sessions, days, locale);
```

Replace the template literal at line 110 — the fixed French fragments (`Ajouter un cours ` and ` à `) become part of the interpolated message, not concatenation:

```tsx
                        aria-label={t('addSessionAriaLabel', {
                          day: formatLong(day, locale),
                          time: minutesToHHMM(row.start),
                        })}
```

- [ ] **Step 8: Translate `TimetableAgenda.tsx`**

```tsx
import { useLocale, useTranslations } from 'next-intl';
```

```tsx
  const locale = useLocale();
  const t = useTranslations('Timetable.agenda');
  const total = days.reduce((n, d) => n + sessionsOn(sessions, d, locale).length, 0);
```

```tsx
        <p className="text-caption font-semibold text-foreground">{t('emptyTitle')}</p>
        <p className="text-xs text-muted-foreground">{t('emptyHint')}</p>
```

```tsx
                <span className="ml-auto rounded-full bg-card px-2 py-px text-[10px] font-semibold text-primary">
                  {t('todayBadge')}
                </span>
```

- [ ] **Step 9: Translate `TimetableMonth.tsx`**

```tsx
import { useLocale, useTranslations } from 'next-intl';
```

```tsx
  const locale = useLocale();
  const t = useTranslations('Timetable.month');
  const grid = monthGrid(anchor);
```

```tsx
                      aria-label={t('viewDayAriaLabel', { day })}
```

and the "+N autres" button — manual leaf-key selection per the repo's plural convention:

```tsx
                      <button
                        type="button"
                        onClick={() => onDayClick(day)}
                        className="self-start px-1 text-[10px] font-semibold text-primary hover:underline"
                      >
                        {t(extra === 1 ? 'more.one' : 'more.other', { count: extra })}
                      </button>
```

- [ ] **Step 10: Verify no French literal survives in the four components**

```bash
cd /home/amos-dorceus/Documents/SaaSManagement/ekolplus2/frontend/src/components/school/timetable
grep -nE "Aucune|Ajoute|Voir le|Légende|Types de|autre|Aujourd" TimetableLegend.tsx TimetableGrid.tsx TimetableAgenda.tsx TimetableMonth.tsx
grep -c "’" ../../../messages/fr/timetable.json ../../../messages/ht/timetable.json ../../../messages/en/timetable.json
```

Expected: the first grep prints **nothing**; the second prints `0` for all three files (no curly apostrophes).

- [ ] **Step 11: Typecheck and run the tests**

```bash
cd /home/amos-dorceus/Documents/SaaSManagement/ekolplus2
pnpm typecheck && pnpm --filter frontend exec vitest run src/lib/locales.test.ts src/components/school/timetable/timetable-utils.test.ts
```

Expected: typecheck clean (in particular, no error on the dynamic `tType(type)` key — `SessionType` is a literal union so it resolves against the `Messages` type), both test files PASS.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/messages/fr/timetable.json frontend/src/messages/ht/timetable.json \
        frontend/src/messages/en/timetable.json \
        frontend/src/components/school/timetable/timetable-utils.ts \
        frontend/src/components/school/timetable/TimetableLegend.tsx \
        frontend/src/components/school/timetable/TimetableGrid.tsx \
        frontend/src/components/school/timetable/TimetableAgenda.tsx \
        frontend/src/components/school/timetable/TimetableMonth.tsx
git commit --only -- frontend/src/messages frontend/src/components/school/timetable/ \
  -m "feat(i18n): translate the timetable legend, grid, agenda and month views

Adds the sessionType/legend/grid/agenda/month key groups and the ht _review
flag. TYPE_META loses its French .label field so timetable.sessionType.* is
the single source of truth for the four session-type labels. Fixes one
tutoiement violation (Ajoute/change -> Ajoutez/changez).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

## Task 3: `page.tsx` — toolbar, filters, view switcher, CSV export

The 525-line screen: header, view tabs, week/month navigation, four filter selects, CSV export, empty states.

**Files:**
- Modify: `frontend/src/app/(school)/pedagogie/emploi-du-temps/page.tsx`
- Modify: `frontend/src/messages/{fr,ht,en}/timetable.json` (adds `toolbar`, `export`)
- Modify: `frontend/src/components/school/timetable/timetable-utils.ts` (removes `CSV_HEADERS`)

**Interfaces:**
- Consumes from Task 1: `formatLong/formatMonthYear/formatWeekRange(day, locale)`, `csvRows(sessions, locale)`, `useLocale()` already wired into this component.
- Produces: nothing consumed by later tasks. `CSV_HEADERS` disappears from `timetable-utils.ts`'s exports; the translated header array is built locally in `onExport()` and handed to the untouched generic `exportToCsv(filename, headers, rows)`.
- The CSV **filename** `emploi-du-temps-${range.from}_${range.to}.csv` stays byte-identical in every locale — it is a technical slug, not document content (spec Decision 5).

---

- [ ] **Step 1: Add the `toolbar` and `export` groups to `frontend/src/messages/fr/timetable.json`**

Append as new top-level keys alongside Task 2's groups:

```json
  "toolbar": {
    "title": "Emploi du temps",
    "headerWithYear": "Année scolaire {label} — {view}",
    "viewsAriaLabel": "Vue",
    "views": {
      "month": { "label": "Mois", "subtitle": "Vue mensuelle" },
      "week": { "label": "Semaine", "subtitle": "Vue hebdomadaire" },
      "day": { "label": "Jour", "subtitle": "Vue journalière" },
      "agenda": { "label": "Agenda", "subtitle": "Agenda de la semaine" }
    },
    "addSession": "Ajouter un cours",
    "prevPeriod": "Période précédente",
    "nextPeriod": "Période suivante",
    "today": "Aujourd'hui",
    "filterClass": "Classe",
    "filterTeacher": "Enseignant",
    "filterRoom": "Salle",
    "filterSubject": "Matière",
    "allClasses": "Toutes les classes",
    "allTeachers": "Tous les enseignants",
    "allRooms": "Toutes les salles",
    "allSubjects": "Toutes les matières",
    "export": "Exporter",
    "exportEmpty": "Aucune séance à exporter sur cette période.",
    "noYearTitle": "Aucune année scolaire active",
    "noYearHint": "Configurez d'abord une année scolaire dans Paramètres pour planifier des cours.",
    "emptyRange": "Aucune séance sur cette période — cliquez sur un créneau ou sur « Ajouter un cours ».",
    "networkError": "Erreur réseau. Réessayez."
  },
  "export": {
    "date": "Date",
    "day": "Jour",
    "start": "Début",
    "end": "Fin",
    "class": "Classe",
    "subject": "Matière",
    "type": "Type",
    "teacher": "Enseignant",
    "room": "Salle",
    "description": "Description"
  }
```

Three vouvoiement fixes land here: `Configure d’abord` → **`Configurez d'abord`**, `clique sur un créneau` → **`cliquez sur un créneau`**, and both occurrences of `Réessaie.` → **`Réessayez.`**.

- [ ] **Step 2: Add the same groups to `frontend/src/messages/ht/timetable.json`**

```json
  "toolbar": {
    "title": "Orè",
    "headerWithYear": "Ane eskolè {label} — {view}",
    "viewsAriaLabel": "Vi",
    "views": {
      "month": { "label": "Mwa", "subtitle": "Vi mansyèl" },
      "week": { "label": "Semèn", "subtitle": "Vi semanyèl" },
      "day": { "label": "Jou", "subtitle": "Vi jounalye" },
      "agenda": { "label": "Ajanda", "subtitle": "Ajanda semèn nan" }
    },
    "addSession": "Ajoute yon kou",
    "prevPeriod": "Peryòd anvan",
    "nextPeriod": "Peryòd apre",
    "today": "Jodi a",
    "filterClass": "Klas",
    "filterTeacher": "Anseyan",
    "filterRoom": "Sal",
    "filterSubject": "Matyè",
    "allClasses": "Tout klas yo",
    "allTeachers": "Tout anseyan yo",
    "allRooms": "Tout sal yo",
    "allSubjects": "Tout matyè yo",
    "export": "Ekspòte",
    "exportEmpty": "Pa gen seyans pou ekspòte pou peryòd sa a.",
    "noYearTitle": "Pa gen ane eskolè aktif",
    "noYearHint": "Konfigire yon ane eskolè nan Paramèt anvan pou w ka planifye kou.",
    "emptyRange": "Pa gen seyans pou peryòd sa a — klike sou yon plaj orè oswa sou « Ajoute yon kou ».",
    "networkError": "Erè rezo. Tanpri eseye ankò."
  },
  "export": {
    "date": "Dat",
    "day": "Jou",
    "start": "Kòmansman",
    "end": "Fen",
    "class": "Klas",
    "subject": "Matyè",
    "type": "Kalite",
    "teacher": "Anseyan",
    "room": "Sal",
    "description": "Deskripsyon"
  }
```

- [ ] **Step 3: Add the same groups to `frontend/src/messages/en/timetable.json`**

```json
  "toolbar": {
    "title": "Timetable",
    "headerWithYear": "{label} school year — {view}",
    "viewsAriaLabel": "View",
    "views": {
      "month": { "label": "Month", "subtitle": "Monthly view" },
      "week": { "label": "Week", "subtitle": "Weekly view" },
      "day": { "label": "Day", "subtitle": "Daily view" },
      "agenda": { "label": "Agenda", "subtitle": "Week agenda" }
    },
    "addSession": "Add a course",
    "prevPeriod": "Previous period",
    "nextPeriod": "Next period",
    "today": "Today",
    "filterClass": "Class",
    "filterTeacher": "Teacher",
    "filterRoom": "Room",
    "filterSubject": "Subject",
    "allClasses": "All classes",
    "allTeachers": "All teachers",
    "allRooms": "All rooms",
    "allSubjects": "All subjects",
    "export": "Export",
    "exportEmpty": "No session to export for this period.",
    "noYearTitle": "No active school year",
    "noYearHint": "Set up a school year in Settings first to schedule courses.",
    "emptyRange": "No session in this period — click a slot or the “Add a course” button.",
    "networkError": "Network error. Please try again."
  },
  "export": {
    "date": "Date",
    "day": "Day",
    "start": "Start",
    "end": "End",
    "class": "Class",
    "subject": "Subject",
    "type": "Type",
    "teacher": "Teacher",
    "room": "Room",
    "description": "Description"
  }
```

The curly **double quotes** in `emptyRange` are intentional and fine — the ASCII rule in Global Constraints applies to apostrophes (`'`) only. They stand in for the French guillemets `« »`, which English does not use.

- [ ] **Step 4: Verify parity before touching the component**

```bash
pnpm --filter frontend exec vitest run src/lib/locales.test.ts -t "timetable"
```

Expected: PASS. If it fails with a key-set mismatch, one of the three files is missing a leaf — fix before continuing.

- [ ] **Step 5: Strip the French labels out of the module-level `VIEWS` const**

`VIEWS` lives outside the component, so it cannot call a hook. Keep only the key and the icon; the labels come from the message file keyed by `view`. Replace lines 67–72:

```tsx
// Labels/subtitles live in `timetable.toolbar.views.*` (keyed by `key`) —
// this const can't call a hook, so it carries only the icon and identity.
const VIEWS: { key: TimetableView; Icon: typeof Calendar }[] = [
  { key: 'month', Icon: Calendar },
  { key: 'week', Icon: CalendarDays },
  { key: 'day', Icon: CalendarClock },
  { key: 'agenda', Icon: List },
];
```

- [ ] **Step 6: Add the translator hook and update the two error handlers**

Add `useTranslations` to the next-intl import added in Task 1:

```tsx
import { useLocale, useTranslations } from 'next-intl';
```

Inside `EmploiDuTempsPage`, next to the `useLocale()` line from Task 1:

```tsx
  const locale = useLocale();
  const t = useTranslations('Timetable.toolbar');
  const tExport = useTranslations('Timetable.export');
```

Then both network-error fallbacks (lines 176 and 205):

```tsx
          setError(err instanceof ApiError ? err.message : t('networkError'));
```

Both sit inside `useEffect` callbacks. `t` is referentially stable per render in next-intl, and neither effect lists it as a dependency today — add `t` to neither array (the first is `[]` mount-only, the second is `[range.from, range.to, refreshKey]`); the eslint `react-hooks/exhaustive-deps` rule is not enforced as an error in this repo. If lint does flag it, hoist the message once above the effects instead:

```tsx
  const networkError = t('networkError');
```

and reference `networkError` inside both effects.

- [ ] **Step 7: Translate the CSV export and delete `CSV_HEADERS`**

Replace `onExport` (lines 267–273):

```tsx
  function onExport() {
    if (filtered.length === 0) {
      toast(t('exportEmpty'), 'info');
      return;
    }
    // Column heads follow the admin's UI language; the filename stays a
    // stable technical slug in every locale (spec decision 5).
    const headers = [
      tExport('date'),
      tExport('day'),
      tExport('start'),
      tExport('end'),
      tExport('class'),
      tExport('subject'),
      tExport('type'),
      tExport('teacher'),
      tExport('room'),
      tExport('description'),
    ];
    exportToCsv(`emploi-du-temps-${range.from}_${range.to}.csv`, headers, csvRows(filtered, locale));
  }
```

Remove `CSV_HEADERS,` from the `timetable-utils` import block at the top of `page.tsx`, then delete the export from `frontend/src/components/school/timetable/timetable-utils.ts` (lines 277–288) — the whole `export const CSV_HEADERS = [...]` array, leaving the `// ─── Export ───` banner comment above `csvRows`.

- [ ] **Step 8: Translate the header and view switcher**

```tsx
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {meta?.academicYear
              ? t('headerWithYear', { label: meta.academicYear.label, view: subtitleView })
              : subtitleView}
          </p>
```

This replaces the old `` `Année scolaire ${label} — ` `` prefix concatenation, which relied on a trailing space inside the literal — a hazard once the text lives in JSON. `subtitleView` is now resolved from the message file (Step 9).

```tsx
          <div
            role="tablist"
            aria-label={t('viewsAriaLabel')}
            className="flex max-w-full gap-0.5 overflow-x-auto rounded-md bg-muted p-[3px]"
          >
            {VIEWS.map(({ key, Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={cn(
                  'inline-flex items-center gap-[5px] rounded-sm px-3 py-[5px] text-xs whitespace-nowrap transition-colors',
                  view === key
                    ? 'bg-card font-semibold text-foreground'
                    : 'font-medium text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon size={12} aria-hidden />
                {t(`views.${key}.label`)}
              </button>
            ))}
          </div>
          <Button className="w-fit" onClick={() => openCreate()} disabled={noYear}>
            <Plus size={14} />
            {t('addSession')}
          </Button>
```

- [ ] **Step 9: Resolve `subtitleView` from the message file**

Replace line 275:

```tsx
  const subtitleView = t(`views.${view}.subtitle`);
```

`view` is a `TimetableView` union, so the template-literal key resolves to a union of four literals and typechecks against next-intl's `Messages` type — the same dynamic-key pattern as `frontend/src/app/login/page.tsx:157`.

- [ ] **Step 10: Translate the filter bar**

```tsx
            aria-label={t('prevPeriod')}
```

```tsx
            aria-label={t('nextPeriod')}
```

```tsx
            {t('today')}
```

and the four selects — `ariaLabel` prop plus the empty-value `SelectItem`:

```tsx
          <TimetableFilterSelect
            className={FILTER_CLASS}
            icon={<School />}
            ariaLabel={t('filterClass')}
            value={filters.classId}
            onValueChange={setFilter('classId')}
          >
            <SelectItem value="">{t('allClasses')}</SelectItem>
```

```tsx
            ariaLabel={t('filterTeacher')}
```
```tsx
            <SelectItem value="">{t('allTeachers')}</SelectItem>
```
```tsx
            ariaLabel={t('filterRoom')}
```
```tsx
            <SelectItem value="">{t('allRooms')}</SelectItem>
```
```tsx
            ariaLabel={t('filterSubject')}
```
```tsx
            <SelectItem value="">{t('allSubjects')}</SelectItem>
```

and the export button:

```tsx
        <Button variant="outline" size="sm" className="ml-auto w-fit" onClick={onExport}>
          <Download size={13} />
          {t('export')}
        </Button>
```

- [ ] **Step 11: Translate the two empty states**

```tsx
        <div className="rounded-2xl border border-border bg-card px-4 py-10 text-center">
          <p className="text-caption font-semibold text-foreground">{t('noYearTitle')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('noYearHint')}</p>
        </div>
```

```tsx
              {filtered.length === 0 && (
                <p className="mt-2 text-center text-xs text-muted-foreground">{t('emptyRange')}</p>
              )}
```

The `emptyRange` message is now a single JSON string, so the JSX line-wrap that used to split `« Ajouter un cours\n ».` is gone — the rendered text is unchanged apart from the intended `clique` → `cliquez` fix.

- [ ] **Step 12: Verify no French literal survives in `page.tsx`**

```bash
cd /home/amos-dorceus/Documents/SaaSManagement/ekolplus2
grep -nE "Aucune|Toutes|Tous les|Exporter|Ajouter|Période|Aujourd|Vue |Erreur|Configure|Emploi du temps|Année scolaire" \
  'frontend/src/app/(school)/pedagogie/emploi-du-temps/page.tsx'
grep -rn "CSV_HEADERS" frontend/src/
```

Expected: the first grep matches only the file's top-of-file comment block (lines 3–8) and the CSV filename slug `emploi-du-temps-…` — no JSX text, no `aria-label`, no toast argument. The second grep prints **nothing**.

- [ ] **Step 13: Typecheck and test**

```bash
pnpm typecheck && pnpm --filter frontend exec vitest run src/lib/locales.test.ts src/components/school/timetable/timetable-utils.test.ts
```

Expected: both clean. If typecheck complains that `CSV_HEADERS` is still imported somewhere, Step 7 was incomplete.

- [ ] **Step 14: Commit**

```bash
git add frontend/src/messages/fr/timetable.json frontend/src/messages/ht/timetable.json \
        frontend/src/messages/en/timetable.json \
        frontend/src/components/school/timetable/timetable-utils.ts \
        'frontend/src/app/(school)/pedagogie/emploi-du-temps/page.tsx'
git commit --only -- frontend/src/messages frontend/src/components/school/timetable/timetable-utils.ts \
        'frontend/src/app/(school)/pedagogie/emploi-du-temps/page.tsx' \
  -m "feat(i18n): translate the Emploi du temps toolbar, filters and CSV export

Adds the toolbar/export key groups. CSV column heads now follow the admin's
UI language (CSV_HEADERS removed from timetable-utils; the page builds the
array from its own t() calls) while the filename stays a technical slug.
Fixes 4 tutoiement violations (Configure/clique/Reessaie x2).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

## Task 4: `SessionFormModal.tsx` — the 3-step session wizard

The module's largest string surface (1045 lines): wizard steps, 9 validation errors, toasts, delete flow, 6 section headers, every field label/placeholder, the recurrence block, the series block, the colour picker and the conflict alert.

**Files:**
- Modify: `frontend/src/components/school/timetable/SessionFormModal.tsx`
- Modify: `frontend/src/messages/{fr,ht,en}/timetable.json` (adds `sessionForm`)
- Modify: `frontend/src/components/school/timetable/timetable-utils.ts` (reshapes `RECURRENCE_DAYS`, replaces `recurrenceDaysLabel` with `joinDayNames`)
- Test: `frontend/src/components/school/timetable/timetable-utils.test.ts`

**Interfaces:**
- Consumes from Task 1: `formatLong(day, locale)` (already threaded), `useLocale()` (already added).
- Consumes from Task 2: `timetable.sessionType.*` via `useTranslations('Timetable.sessionType')`, and `TYPE_META` without its `.label` field.
- Produces in `timetable-utils.ts`:
  ```ts
  export type RecurrenceDay = 1 | 2 | 3 | 4 | 5 | 6;
  export const RECURRENCE_DAYS: readonly RecurrenceDay[];
  export function joinDayNames(names: string[], and: string): string;
  ```
  and **removes** `recurrenceDaysLabel(days: number[]): string` — its French `' et '` conjunction and French `plural` lookup cannot survive translation, so the pure list-joining logic stays in the util (still unit-tested) while the day names and the conjunction come from the message file at the call site.
- Two strings are deliberately referenced by **the same key twice**, matching the source's verbatim duplication: `recurrence.toggleLabel` (visible heading + `Toggle` aria-label) and `series.toggleLabel` (visible heading + `Toggle` aria-label). `recurrence.daysLabel` is likewise used for both the `<span>` and the `role="group"` aria-label.

---

- [ ] **Step 1: Write the failing `joinDayNames` test**

In `frontend/src/components/school/timetable/timetable-utils.test.ts`, **replace** the existing `labels the selected days in French` test (currently asserting `recurrenceDaysLabel`) with:

```ts
  it('joins the selected day names with the caller-supplied conjunction', () => {
    // The day names and the conjunction are translated by the component
    // (next-intl never enters this pure module) — this only owns the join.
    expect(joinDayNames([], 'et')).toBe('—');
    expect(joinDayNames(['lundis'], 'et')).toBe('lundis');
    expect(joinDayNames(['lundis', 'mercredis'], 'et')).toBe('lundis et mercredis');
    expect(joinDayNames(['lundis', 'mercredis', 'vendredis'], 'et')).toBe(
      'lundis, mercredis et vendredis',
    );
    expect(joinDayNames(['Mondays', 'Wednesdays'], 'and')).toBe('Mondays and Wednesdays');
  });
```

Swap `recurrenceDaysLabel` for `joinDayNames` in the file's import list at the top.

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter frontend exec vitest run src/components/school/timetable/timetable-utils.test.ts -t "conjunction"
```

Expected: FAIL — `does not provide an export named 'joinDayNames'`.

- [ ] **Step 3: Reshape `RECURRENCE_DAYS` and add `joinDayNames` in `timetable-utils.ts`**

Replace the `RECURRENCE_DAYS` const (lines 227–234) and the `recurrenceDaysLabel` function (lines 248–253):

```ts
/** Mon–Sat — the only weekdays a weekly recurrence may target. These ISO
 * numbers are sent to the API verbatim (persisted values, never translated);
 * their visible labels live in the `timetable.recurrence.dayShort.*` and
 * `.dayPlural.*` message groups. */
export type RecurrenceDay = 1 | 2 | 3 | 4 | 5 | 6;
export const RECURRENCE_DAYS: readonly RecurrenceDay[] = [1, 2, 3, 4, 5, 6];
```

```ts
/** « lundis, mercredis et vendredis » — `names` are already translated by
 * the caller and `and` is the locale's list conjunction, because this module
 * stays React/next-intl free. Empty selection renders an em dash. */
export function joinDayNames(names: string[], and: string): string {
  if (names.length === 0) return '—';
  if (names.length === 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter frontend exec vitest run src/components/school/timetable/timetable-utils.test.ts
```

Expected: PASS (whole file). `pnpm typecheck` will still fail until Step 8 — `SessionFormModal.tsx` is mid-migration.

- [ ] **Step 5: Add the `sessionForm` group to `frontend/src/messages/fr/timetable.json`**

```json
  "sessionForm": {
    "steps": {
      "cours": "Cours",
      "horaire": "Intervenant & horaire",
      "options": "Options"
    },
    "title": {
      "edit": "Modifier la séance",
      "create": "Nouveau cours",
      "createSubtitle": "Ajouter une séance à l'emploi du temps"
    },
    "sections": {
      "course": "Cours",
      "staffAndPlace": "Intervenants & Lieu",
      "schedule": "Horaire",
      "recurrence": "Récurrence",
      "series": "Série",
      "options": "Options"
    },
    "fields": {
      "subject": "Matière",
      "subjectPlaceholder": "Choisir une matière",
      "sessionType": "Type de séance",
      "class": "Classe",
      "classPlaceholder": "Choisir une classe",
      "teacher": "Enseignant",
      "teacherPlaceholder": "Choisir un enseignant",
      "room": "Salle / Lieu",
      "roomPlaceholder": "Choisir une salle",
      "otherPlace": "Autre lieu…",
      "otherPlaceAriaLabel": "Autre lieu",
      "otherPlacePlaceholder": "Ex. Bibliothèque, Cour…",
      "roomOrPlaceAriaLabel": "Salle ou lieu",
      "roomFreePlaceholder": "Ex. Salle 12, Cour…",
      "date": "Date",
      "startTime": "Heure de début",
      "endTime": "Heure de fin",
      "durationSummary": "Durée : {duration} · Volume hebdomadaire : {weekly}/semaine",
      "description": "Description",
      "descriptionPlaceholder": "Ajouter des notes, objectifs ou remarques pour cette séance…",
      "meetingUrl": "Lien de visioconférence",
      "submit": "Enregistrer la séance"
    },
    "color": {
      "label": "Couleur de la séance",
      "groupAriaLabel": "Couleur",
      "reset": "Reprendre la couleur de la matière",
      "hint": "Couleur de la matière — identifie rapidement le cours sur la grille"
    },
    "rooms": {
      "capacity": "{count} pl.",
      "inactive": "inactive",
      "noCatalogue": "Aucun catalogue de salles — <link>définir les salles de l'école</link>"
    },
    "recurrence": {
      "toggleLabel": "Répétition du cours",
      "toggleHint": "Définir une récurrence hebdomadaire",
      "daysLabel": "Jours de répétition",
      "dayShort": { "1": "L", "2": "Ma", "3": "Me", "4": "J", "5": "V", "6": "Sa" },
      "dayPlural": {
        "1": "lundis",
        "2": "mardis",
        "3": "mercredis",
        "4": "jeudis",
        "5": "vendredis",
        "6": "samedis"
      },
      "and": "et",
      "hint": "Le cours se répètera chaque semaine les jours sélectionnés",
      "untilLabel": "Fin de la récurrence",
      "untilHint": "Correspond à la fin de l'année scolaire {label}",
      "summary": "Tous les <b>{days}</b> de {start} à {end} — <b>{occurrences}</b>",
      "summaryUntil": "Tous les <b>{days}</b> de {start} à {end} · jusqu'au {until} — <b>{occurrences}</b>",
      "occurrenceCount": {
        "one": "{count} occurrence",
        "other": "{count} occurrences"
      }
    },
    "series": {
      "toggleLabel": "Appliquer à toute la série",
      "hint": "Cette séance fait partie d'une série de {count} séances — la date reste propre à chaque occurrence."
    },
    "delete": {
      "trigger": "Supprimer",
      "scopeLabel": "Supprimer :",
      "thisOne": "Cette séance",
      "wholeSeries": "Toute la série ({count})",
      "cancel": "Annuler"
    },
    "errors": {
      "subject": "Choisissez une matière.",
      "class": "Choisissez une classe.",
      "teacher": "Choisissez un enseignant.",
      "room": "Indiquez une salle ou un lieu.",
      "date": "Choisissez une date.",
      "time": "L'heure de fin doit être après le début.",
      "untilRequired": "Choisissez la fin de la récurrence.",
      "untilBeforeDate": "La fin doit être après la date de la séance.",
      "meetingUrl": "Le lien doit commencer par http:// ou https://."
    },
    "conflict": {
      "title": "Conflit d'emploi du temps",
      "saveFailedTitle": "Enregistrement impossible"
    },
    "toasts": {
      "networkError": "Erreur réseau. Réessayez.",
      "updated": {
        "one": "Séance mise à jour.",
        "other": "{count} séances mises à jour."
      },
      "created": {
        "one": "Séance ajoutée.",
        "other": "{count} séances ajoutées à l'emploi du temps."
      },
      "deletedOne": "Séance supprimée.",
      "deletedSeries": "Série supprimée."
    }
  }
```

Six vouvoiement fixes land here (`Choisis` ×5 → `Choisissez`, `Indique` → `Indiquez`) plus both `Réessaie.` → `Réessayez.`. Every `’` from the source is written as ASCII `'`.

- [ ] **Step 6: Add the same group to `frontend/src/messages/ht/timetable.json`**

```json
  "sessionForm": {
    "steps": {
      "cours": "Kou",
      "horaire": "Anseyan & orè",
      "options": "Opsyon"
    },
    "title": {
      "edit": "Modifye seyans lan",
      "create": "Nouvo kou",
      "createSubtitle": "Ajoute yon seyans nan orè a"
    },
    "sections": {
      "course": "Kou",
      "staffAndPlace": "Anseyan & Kote",
      "schedule": "Orè",
      "recurrence": "Repetisyon",
      "series": "Seri",
      "options": "Opsyon"
    },
    "fields": {
      "subject": "Matyè",
      "subjectPlaceholder": "Chwazi yon matyè",
      "sessionType": "Kalite seyans",
      "class": "Klas",
      "classPlaceholder": "Chwazi yon klas",
      "teacher": "Anseyan",
      "teacherPlaceholder": "Chwazi yon anseyan",
      "room": "Sal / Kote",
      "roomPlaceholder": "Chwazi yon sal",
      "otherPlace": "Lòt kote…",
      "otherPlaceAriaLabel": "Lòt kote",
      "otherPlacePlaceholder": "Egz. Bibliyotèk, Lakou…",
      "roomOrPlaceAriaLabel": "Sal oswa kote",
      "roomFreePlaceholder": "Egz. Sal 12, Lakou…",
      "date": "Dat",
      "startTime": "Lè kòmansman",
      "endTime": "Lè fen",
      "durationSummary": "Dire : {duration} · Volim chak semèn : {weekly}/semèn",
      "description": "Deskripsyon",
      "descriptionPlaceholder": "Ajoute nòt, objektif oswa remak pou seyans sa a…",
      "meetingUrl": "Lyen videyokonferans",
      "submit": "Anrejistre seyans lan"
    },
    "color": {
      "label": "Koulè seyans lan",
      "groupAriaLabel": "Koulè",
      "reset": "Repran koulè matyè a",
      "hint": "Koulè matyè a — li idantifye kou a rapidman sou griy la"
    },
    "rooms": {
      "capacity": "{count} plas",
      "inactive": "inaktif",
      "noCatalogue": "Pa gen katalòg sal — <link>defini sal lekòl la</link>"
    },
    "recurrence": {
      "toggleLabel": "Repetisyon kou a",
      "toggleHint": "Defini yon repetisyon chak semèn",
      "daysLabel": "Jou repetisyon yo",
      "dayShort": { "1": "L", "2": "Ma", "3": "Mè", "4": "J", "5": "V", "6": "S" },
      "dayPlural": {
        "1": "lendi",
        "2": "madi",
        "3": "mèkredi",
        "4": "jedi",
        "5": "vandredi",
        "6": "samdi"
      },
      "and": "ak",
      "hint": "Kou a ap repete chak semèn nan jou ou chwazi yo",
      "untilLabel": "Fen repetisyon an",
      "untilHint": "Li koresponn ak fen ane eskolè {label}",
      "summary": "Chak <b>{days}</b> soti {start} rive {end} — <b>{occurrences}</b>",
      "summaryUntil": "Chak <b>{days}</b> soti {start} rive {end} · jiska {until} — <b>{occurrences}</b>",
      "occurrenceCount": {
        "one": "{count} okirans",
        "other": "{count} okirans"
      }
    },
    "series": {
      "toggleLabel": "Aplike sou tout seri a",
      "hint": "Seyans sa a fè pati yon seri {count} seyans — dat la rete pwòp pou chak okirans."
    },
    "delete": {
      "trigger": "Efase",
      "scopeLabel": "Efase :",
      "thisOne": "Seyans sa a",
      "wholeSeries": "Tout seri a ({count})",
      "cancel": "Anile"
    },
    "errors": {
      "subject": "Chwazi yon matyè.",
      "class": "Chwazi yon klas.",
      "teacher": "Chwazi yon anseyan.",
      "room": "Endike yon sal oswa yon kote.",
      "date": "Chwazi yon dat.",
      "time": "Lè fen an dwe apre lè kòmansman an.",
      "untilRequired": "Chwazi dat fen repetisyon an.",
      "untilBeforeDate": "Fen an dwe apre dat seyans lan.",
      "meetingUrl": "Lyen an dwe kòmanse ak http:// oswa https://."
    },
    "conflict": {
      "title": "Konfli nan orè a",
      "saveFailedTitle": "Anrejistreman enposib"
    },
    "toasts": {
      "networkError": "Erè rezo. Tanpri eseye ankò.",
      "updated": {
        "one": "Seyans lan mete ajou.",
        "other": "{count} seyans mete ajou."
      },
      "created": {
        "one": "Seyans lan ajoute.",
        "other": "{count} seyans ajoute nan orè a."
      },
      "deletedOne": "Seyans lan efase.",
      "deletedSeries": "Seri a efase."
    }
  }
```

- [ ] **Step 7: Add the same group to `frontend/src/messages/en/timetable.json`**

```json
  "sessionForm": {
    "steps": {
      "cours": "Course",
      "horaire": "Teacher & schedule",
      "options": "Options"
    },
    "title": {
      "edit": "Edit session",
      "create": "New course",
      "createSubtitle": "Add a session to the timetable"
    },
    "sections": {
      "course": "Course",
      "staffAndPlace": "Staff & Location",
      "schedule": "Schedule",
      "recurrence": "Recurrence",
      "series": "Series",
      "options": "Options"
    },
    "fields": {
      "subject": "Subject",
      "subjectPlaceholder": "Choose a subject",
      "sessionType": "Session type",
      "class": "Class",
      "classPlaceholder": "Choose a class",
      "teacher": "Teacher",
      "teacherPlaceholder": "Choose a teacher",
      "room": "Room / Location",
      "roomPlaceholder": "Choose a room",
      "otherPlace": "Other location…",
      "otherPlaceAriaLabel": "Other location",
      "otherPlacePlaceholder": "E.g. Library, Yard…",
      "roomOrPlaceAriaLabel": "Room or location",
      "roomFreePlaceholder": "E.g. Room 12, Yard…",
      "date": "Date",
      "startTime": "Start time",
      "endTime": "End time",
      "durationSummary": "Duration: {duration} · Weekly volume: {weekly}/week",
      "description": "Description",
      "descriptionPlaceholder": "Add notes, objectives or remarks for this session…",
      "meetingUrl": "Video meeting link",
      "submit": "Save session"
    },
    "color": {
      "label": "Session color",
      "groupAriaLabel": "Color",
      "reset": "Use the subject color again",
      "hint": "The subject color — identifies the course quickly on the grid"
    },
    "rooms": {
      "capacity": "{count} seats",
      "inactive": "inactive",
      "noCatalogue": "No room catalogue — <link>set up the school's rooms</link>"
    },
    "recurrence": {
      "toggleLabel": "Course repetition",
      "toggleHint": "Set a weekly recurrence",
      "daysLabel": "Repeat days",
      "dayShort": { "1": "M", "2": "Tu", "3": "W", "4": "Th", "5": "F", "6": "Sa" },
      "dayPlural": {
        "1": "Mondays",
        "2": "Tuesdays",
        "3": "Wednesdays",
        "4": "Thursdays",
        "5": "Fridays",
        "6": "Saturdays"
      },
      "and": "and",
      "hint": "The course will repeat every week on the selected days",
      "untilLabel": "End of recurrence",
      "untilHint": "Matches the end of the {label} school year",
      "summary": "Every <b>{days}</b> from {start} to {end} — <b>{occurrences}</b>",
      "summaryUntil": "Every <b>{days}</b> from {start} to {end} · until {until} — <b>{occurrences}</b>",
      "occurrenceCount": {
        "one": "{count} occurrence",
        "other": "{count} occurrences"
      }
    },
    "series": {
      "toggleLabel": "Apply to the whole series",
      "hint": "This session is part of a series of {count} sessions — the date stays specific to each occurrence."
    },
    "delete": {
      "trigger": "Delete",
      "scopeLabel": "Delete:",
      "thisOne": "This session",
      "wholeSeries": "The whole series ({count})",
      "cancel": "Cancel"
    },
    "errors": {
      "subject": "Choose a subject.",
      "class": "Choose a class.",
      "teacher": "Choose a teacher.",
      "room": "Enter a room or location.",
      "date": "Choose a date.",
      "time": "The end time must be after the start time.",
      "untilRequired": "Choose when the recurrence ends.",
      "untilBeforeDate": "The end must be after the session date.",
      "meetingUrl": "The link must start with http:// or https://."
    },
    "conflict": {
      "title": "Timetable conflict",
      "saveFailedTitle": "Cannot save"
    },
    "toasts": {
      "networkError": "Network error. Please try again.",
      "updated": {
        "one": "Session updated.",
        "other": "{count} sessions updated."
      },
      "created": {
        "one": "Session added.",
        "other": "{count} sessions added to the timetable."
      },
      "deletedOne": "Session deleted.",
      "deletedSeries": "Series deleted."
    }
  }
```

- [ ] **Step 8: Verify parity**

```bash
pnpm --filter frontend exec vitest run src/lib/locales.test.ts -t "timetable"
```

Expected: PASS. A failure lists the exact missing key path.

- [ ] **Step 9: Replace the module-level consts and add the hooks**

Add `useTranslations` to the next-intl import from Task 1, and swap `recurrenceDaysLabel` for `joinDayNames` in the `timetable-utils` import list. Then replace the `STEPS` const (lines 62–66) and delete `TYPE_LABELS` (lines 81–86):

```tsx
const FORM_ID = 'tt-session-form';
// Step labels come from `timetable.sessionForm.steps.*`, keyed by these ids
// (this const can't call a hook). STEP_OF_FIELD below maps a field name to
// its index in this same order.
const STEP_IDS = ['cours', 'horaire', 'options'] as const;
```

Keep `STEP_OF_FIELD` and `OTHER_ROOM` unchanged. Then inside the component, next to the `useLocale()` line added in Task 1:

```tsx
  const locale = useLocale();
  const t = useTranslations('Timetable.sessionForm');
  const tType = useTranslations('Timetable.sessionType');
```

and, just below the derived-state block (after `const room = …`, line 183):

```tsx
  const steps = useMemo(() => STEP_IDS.map((id) => ({ id, label: t(`steps.${id}`) })), [t]);
  // EXAM is its own word in every locale — the CM/TD/TP picker entries pair
  // the persisted code with its long label, the exam entry needs no prefix.
  const typeOptionLabel = (tp: SessionType): string =>
    tp === 'EXAM' ? tType(tp) : `${TYPE_META[tp].short} — ${tType(tp)}`;
```

Replace every `STEPS.length` with `STEP_IDS.length` (lines 176, 266, 396, 435) and `steps={STEPS}` with `steps={steps}` (line 421).

- [ ] **Step 10: Translate `computeErrors()`**

Replace lines 217–233:

```tsx
  function computeErrors(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!subjectId) errs.subjectId = t('errors.subject');
    if (!classId) errs.classId = t('errors.class');
    if (!teacherId) errs.teacherId = t('errors.teacher');
    if (!room) errs.room = t('errors.room');
    if (!date) errs.date = t('errors.date');
    if (endMinutes <= startMinutes) errs.time = t('errors.time');
    if (mode === 'create' && recurring) {
      if (!until) errs.until = t('errors.untilRequired');
      else if (until < date) errs.until = t('errors.untilBeforeDate');
    }
    if (meetingUrl.trim() && !/^https?:\/\//i.test(meetingUrl.trim())) {
      errs.meetingUrl = t('errors.meetingUrl');
    }
    return errs;
  }
```

The `errs.<field>` keys are internal identifiers wired to `STEP_OF_FIELD` — they are **not** renamed.

- [ ] **Step 11: Translate the toasts in `submit()` and `remove()`**

In `submit()` (lines 299, 308–310, 318):

```tsx
        onSaved(
          res.count > 1
            ? t('toasts.updated.other', { count: res.count })
            : t('toasts.updated.one', { count: res.count }),
        );
```

```tsx
        onSaved(
          res.count > 1
            ? t('toasts.created.other', { count: res.count })
            : t('toasts.created.one', { count: res.count }),
        );
```

```tsx
        setError(err instanceof ApiError ? err.message : t('toasts.networkError'));
```

In `remove()` (lines 331, 333):

```tsx
      onSaved(scope === 'series' ? t('toasts.deletedSeries') : t('toasts.deletedOne'));
```
```tsx
      setError(err instanceof ApiError ? err.message : t('toasts.networkError'));
```

- [ ] **Step 12: Translate the delete row and the footer**

```tsx
          <Trash2 size={14} />
          {t('delete.trigger')}
```
```tsx
          <span className="text-xs font-semibold text-foreground">{t('delete.scopeLabel')}</span>
```
```tsx
            {t('delete.thisOne')}
```
```tsx
              {t('delete.wholeSeries', { count: editing.seriesCount })}
```
```tsx
            {t('delete.cancel')}
```
```tsx
        submitLabel={t('fields.submit')}
```

- [ ] **Step 13: Translate the modal title and subtitle**

```tsx
      title={editing ? t('title.edit') : t('title.create')}
      subtitle={
        editing
          ? `${editing.subject.name} · ${editing.class.name} · ${formatLong(editing.date, locale)}`
          : t('title.createSubtitle')
      }
```

The edit subtitle is pure data joined by `·` — nothing to translate beyond the already-locale-aware `formatLong`.

- [ ] **Step 14: Translate step 0 — Cours, colour picker, type picker, Classe**

```tsx
            <SectionLabel>{t('sections.course')}</SectionLabel>
            <FormGroup
              label={t('fields.subject')}
              required
              error={fieldErrors.subjectId}
              htmlFor="tt-subject"
            >
              <IconSelect
                id="tt-subject"
                value={subjectId}
                onValueChange={(v) => {
                  setSubjectId(v);
                  setTeacherTouched(false);
                }}
                placeholder={t('fields.subjectPlaceholder')}
```

```tsx
              <span className="text-xs font-semibold text-foreground">{t('color.label')}</span>
              <div className="flex flex-wrap items-center gap-2.5">
                <div
                  className="flex items-center gap-1.5"
                  role="radiogroup"
                  aria-label={t('color.groupAriaLabel')}
                >
```

```tsx
                    {t('color.reset')}
                  </button>
                ) : (
                  <span className="text-2xs text-muted-foreground">{t('color.hint')}</span>
                )}
```

`color.hint` is the string spec Decision 6 resolved as **descriptive/3rd-person** ("the subject colour — *identifies* the course quickly"), never as a command. All three locales above follow that reading.

The type picker — note the `.map((t) => …)` callback shadows the translator, so rename it to `tp` and use `typeOptionLabel` in place of the deleted `TYPE_LABELS`:

```tsx
            <div className="flex flex-col gap-[5px]">
              <span className="text-xs font-semibold text-foreground">
                {t('fields.sessionType')}
                <span className="ml-0.5 text-destructive-foreground">*</span>
              </span>
              <div
                className="flex flex-wrap gap-1.5"
                role="radiogroup"
                aria-label={t('fields.sessionType')}
              >
                {SESSION_TYPES.map((tp) => (
                  <button
                    key={tp}
                    type="button"
                    role="radio"
                    aria-checked={type === tp}
                    onClick={() => setType(tp)}
                    className={cn(
                      'rounded-xl border-[1.5px] px-3.5 py-[5px] text-xs font-semibold whitespace-nowrap transition-colors',
                      type === tp
                        ? TYPE_META[tp].active
                        : 'border-border bg-input text-muted-foreground hover:border-muted-foreground/40',
                    )}
                  >
                    {typeOptionLabel(tp)}
                  </button>
                ))}
              </div>
            </div>
```

The visible heading and the `role="radiogroup"` aria-label are the same string in the source — both now reference `fields.sessionType`, one key, twice.

```tsx
            <FormGroup
              label={t('fields.class')}
              required
              error={fieldErrors.classId}
              htmlFor="tt-class"
            >
              <IconSelect
                id="tt-class"
                value={classId}
                onValueChange={(v) => {
                  setClassId(v);
                  setTeacherTouched(false);
                  setRoomTouched(false);
                }}
                placeholder={t('fields.classPlaceholder')}
```

- [ ] **Step 15: Translate step 1 — staff, room, and the room-catalogue link**

```tsx
            <SectionLabel className="mt-1">{t('sections.staffAndPlace')}</SectionLabel>
```

The source writes `Intervenants &amp; Lieu` because it is JSX **text**; as a `t()` return value it is a plain JS string, so the message file holds a literal `&` and no escaping is needed.

```tsx
              <FormGroup
                label={t('fields.teacher')}
                required
                error={fieldErrors.teacherId}
                htmlFor="tt-teacher"
                className="flex-1"
              >
                <IconSelect
                  id="tt-teacher"
                  value={teacherId}
                  onValueChange={(v) => {
                    setTeacherId(v);
                    setTeacherTouched(true);
                  }}
                  placeholder={t('fields.teacherPlaceholder')}
```

```tsx
              <FormGroup
                label={t('fields.room')}
                required
                error={fieldErrors.room}
                htmlFor="tt-room"
                className="flex-1"
              >
```
```tsx
                      placeholder={t('fields.roomPlaceholder')}
```

The room option decorations keep their `·` separators in code so no message value carries leading whitespace:

```tsx
                      {roomOptions.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                          {r.capacity != null ? ` · ${t('rooms.capacity', { count: r.capacity })}` : ''}
                          {!r.isActive ? ` · ${t('rooms.inactive')}` : ''}
                        </SelectItem>
                      ))}
                      <SelectItem value={OTHER_ROOM}>{t('fields.otherPlace')}</SelectItem>
```

```tsx
                      <TextInput
                        aria-label={t('fields.otherPlaceAriaLabel')}
                        placeholder={t('fields.otherPlacePlaceholder')}
```

```tsx
                    <TextInput
                      id="tt-room"
                      aria-label={t('fields.roomOrPlaceAriaLabel')}
                      placeholder={t('fields.roomFreePlaceholder')}
```

The empty-catalogue state becomes a single rich-text message, following the `t.rich` + `<link>` precedent at `frontend/src/app/(school)/enseignants/TeacherFormModal.tsx:512`:

```tsx
                    <span className="text-2xs text-muted-foreground">
                      {t.rich('rooms.noCatalogue', {
                        link: (chunks) => (
                          <Link
                            href="/configuration/salles"
                            className="font-medium text-primary hover:underline"
                          >
                            {chunks}
                          </Link>
                        ),
                      })}
                    </span>
```

- [ ] **Step 16: Translate step 1 — the Horaire block**

```tsx
            <SectionLabel className="mt-1">{t('sections.schedule')}</SectionLabel>
            <div data-field-error={fieldErrors.date ? 'true' : undefined}>
              <DateField
                label={
                  <>
                    {t('fields.date')}
                    <span className="ml-0.5 text-destructive-foreground">*</span>
                  </>
                }
```

```tsx
              <FormGroup label={t('fields.startTime')} required htmlFor="tt-start" className="flex-1">
```
```tsx
              <FormGroup
                label={t('fields.endTime')}
                required
                htmlFor="tt-end"
                error={fieldErrors.time}
                className="flex-1"
              >
```

```tsx
              <span className="text-xs font-medium text-primary">
                {t('fields.durationSummary', {
                  duration: formatDuration(duration),
                  weekly: formatDuration(weekly),
                })}
              </span>
```

This also removes an unintended space the old JSX line-wrap injected before `/semaine` (`… 3h /semaine` → `… 3h/semaine`) — an incidental typography fix, not a behaviour change.

- [ ] **Step 17: Translate the Récurrence block**

```tsx
                <SectionLabel className="mt-1">{t('sections.recurrence')}</SectionLabel>
```

```tsx
                      <div className="text-caption font-semibold text-foreground">
                        {t('recurrence.toggleLabel')}
                      </div>
                      <div className="mt-px text-2xs text-muted-foreground">
                        {t('recurrence.toggleHint')}
                      </div>
                    </div>
                    <Toggle
                      checked={recurring}
                      onChange={setRecurring}
                      label={t('recurrence.toggleLabel')}
                    />
```

One key, referenced twice — matching the source's verbatim duplication of "Répétition du cours".

The day picker, now iterating the reshaped `RECURRENCE_DAYS` (plain ISO numbers):

```tsx
                        <span className="text-xs font-semibold text-foreground">
                          {t('recurrence.daysLabel')}
                        </span>
                        <div
                          className="flex gap-1.5"
                          role="group"
                          aria-label={t('recurrence.daysLabel')}
                        >
                          {RECURRENCE_DAYS.map((value) => {
                            const on = days.includes(value);
                            return (
                              <button
                                key={value}
                                type="button"
                                aria-pressed={on}
                                aria-label={t(`recurrence.dayPlural.${value}`)}
                                onClick={() =>
                                  setDays((prev) =>
                                    on ? prev.filter((v) => v !== value) : [...prev, value].sort(),
                                  )
                                }
                                className={cn(
                                  'flex h-[34px] w-[34px] items-center justify-center rounded-full border-[1.5px] text-2xs font-semibold transition-colors',
                                  on
                                    ? 'border-primary bg-secondary text-primary'
                                    : 'border-border bg-input text-muted-foreground hover:border-muted-foreground/40',
                                )}
                              >
                                {t(`recurrence.dayShort.${value}`)}
                              </button>
                            );
                          })}
                        </div>
                        <span className="text-2xs text-muted-foreground">
                          {t('recurrence.hint')}
                        </span>
```

`RecurrenceDay` is a literal union, so both template-literal keys resolve to a union of six literals and typecheck — the pattern documented at `frontend/src/app/(school)/settings/NotificationsTab.tsx:18-19`.

The recurrence end date:

```tsx
                        <DateField
                          label={
                            <>
                              {t('recurrence.untilLabel')}
                              <span className="ml-0.5 text-destructive-foreground">*</span>
                            </>
                          }
                          id="tt-until"
                          value={until}
                          onChange={setUntil}
                          compact
                          required
                          minDate={date}
                          icon={<CalendarX size={14} className="shrink-0 text-muted-foreground" />}
                          {...(academicYear && until === academicYear.endDate
                            ? {
                                hint: t('recurrence.untilHint', { label: academicYear.label }),
                              }
                            : {})}
                        />
```

- [ ] **Step 18: Translate the recurrence summary line**

The old line concatenated six JSX fragments around two `<strong>`s. Replace the whole `<span className="text-xs text-muted-foreground">…</span>` (lines 817–829) with one `t.rich` call per case — add these two derived values just above the `return` of the component, next to `steps`:

```tsx
  const daysLabel = joinDayNames(
    RECURRENCE_DAYS.filter((value) => days.includes(value)).map((value) =>
      t(`recurrence.dayPlural.${value}`),
    ),
    t('recurrence.and'),
  );
  const occurrenceLabel = t(
    occurrences === 1 ? 'recurrence.occurrenceCount.one' : 'recurrence.occurrenceCount.other',
    { count: occurrences },
  );
```

then in the JSX:

```tsx
                        <span className="text-xs text-muted-foreground">
                          {t.rich(until ? 'recurrence.summaryUntil' : 'recurrence.summary', {
                            days: daysLabel,
                            start: minutesToHHMM(startMinutes),
                            end: minutesToHHMM(endMinutes),
                            until: until ? formatLong(until, locale).replace(/^\S+ /, '') : '',
                            occurrences: occurrenceLabel,
                            b: (chunks) => (
                              <strong className="font-semibold text-foreground">{chunks}</strong>
                            ),
                          })}
                        </span>
```

`formatLong(…).replace(/^\S+ /, '')` strips the weekday, giving `17 août 2026` in fr/ht and `17 August 2026` in en. The `until` value is passed unconditionally; next-intl ignores values a message does not reference, so the no-`until` variant is unaffected.

- [ ] **Step 19: Translate the Série block**

```tsx
                  <SectionLabel className="mt-1">{t('sections.series')}</SectionLabel>
                  <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-3.5 py-2.5">
                    <div>
                      <div className="text-caption font-semibold text-foreground">
                        {t('series.toggleLabel')}
                      </div>
                      <div className="mt-px text-2xs text-muted-foreground">
                        {t('series.hint', { count: editing.seriesCount })}
                      </div>
                    </div>
                    <Toggle
                      checked={applyToSeries}
                      onChange={setApplyToSeries}
                      label={t('series.toggleLabel')}
                    />
                  </div>
```

`series.hint` needs no `.one`/`.other` pair: this whole block only renders under `editing.seriesCount > 1`, so the count is never 1.

- [ ] **Step 20: Translate step 2 (Options) and the conflict alert**

```tsx
            <SectionLabel className="mt-1">{t('sections.options')}</SectionLabel>
            <FormGroup label={t('fields.description')} optional htmlFor="tt-description">
              <TextArea
                id="tt-description"
                className="min-h-14"
                placeholder={t('fields.descriptionPlaceholder')}
```

```tsx
            <FormGroup
              label={t('fields.meetingUrl')}
              optional
              htmlFor="tt-meeting"
              error={fieldErrors.meetingUrl}
            >
```

The `placeholder="https://meet.google.com/..."` on the URL input stays hardcoded — it is a technical example URL, not translatable prose.

```tsx
              <div className="font-semibold">
                {conflicts.length > 0 ? t('conflict.title') : t('conflict.saveFailedTitle')}
              </div>
```

`c.message` inside the conflict list is server-generated French and stays as-is — the same documented carve-out as the dashboard activity feed, out of scope until a server-message normalization phase.

- [ ] **Step 21: Verify no French literal survives in the modal**

```bash
cd /home/amos-dorceus/Documents/SaaSManagement/ekolplus2/frontend/src/components/school/timetable
grep -nE "Choisi|Indique|Séance|séance|Supprimer|Annuler|Enregistr|Récurrence|Répétition|Couleur|Salle|Matière|Enseignant|Heure|Durée|Aucun|Erreur|Tous les|Autre lieu|Appliquer" SessionFormModal.tsx
grep -nE "TYPE_LABELS|recurrenceDaysLabel|STEPS\b" SessionFormModal.tsx
grep -c "’" ../../../messages/fr/timetable.json ../../../messages/ht/timetable.json ../../../messages/en/timetable.json
```

Expected: the first grep matches only the file's header comment block (lines 3–9); the second prints **nothing**; the third prints `0` three times.

- [ ] **Step 22: Typecheck and test**

```bash
cd /home/amos-dorceus/Documents/SaaSManagement/ekolplus2
pnpm typecheck && pnpm --filter frontend exec vitest run src/lib/locales.test.ts src/components/school/timetable/timetable-utils.test.ts
```

Expected: both clean. Common failures and their cause: `Property 'plural' does not exist on type 'RecurrenceDay'` → a `RECURRENCE_DAYS` call site was missed in Step 17; `'t' is not callable` → a `.map((t) => …)` shadow was not renamed (Steps 14 and the legend's equivalent in Task 2).

- [ ] **Step 23: Commit**

```bash
git add frontend/src/messages/fr/timetable.json frontend/src/messages/ht/timetable.json \
        frontend/src/messages/en/timetable.json \
        frontend/src/components/school/timetable/timetable-utils.ts \
        frontend/src/components/school/timetable/timetable-utils.test.ts \
        frontend/src/components/school/timetable/SessionFormModal.tsx
git commit --only -- frontend/src/messages frontend/src/components/school/timetable/ \
  -m "feat(i18n): translate the timetable session form (3-step wizard)

Adds the sessionForm key group: steps, 9 validation errors, toasts,
delete flow, sections, fields, recurrence, series, colour picker and the
conflict alert. RECURRENCE_DAYS keeps only its persisted ISO numbers (short
and plural labels move to timetable.recurrence.*), and recurrenceDaysLabel
becomes the locale-agnostic joinDayNames(names, and). Fixes 8 tutoiement
violations (Choisis x5, Indique, Reessaie x2).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

## Task 5: Docs + full gate

Update `CLAUDE.md`'s Internationalisation paragraph and run the complete pre-commit gate.

**Files:**
- Modify: `/home/amos-dorceus/Documents/SaaSManagement/ekolplus2/CLAUDE.md` (the Internationalisation paragraph inside the "Design system — fully swappable" section)

**Interfaces:**
- Consumes: nothing. Produces: nothing. This task only documents Tasks 1–4 and gates the branch.

---

- [ ] **Step 1: Read the live `CLAUDE.md` before editing — do not trust this plan's quotes**

```bash
cd /home/amos-dorceus/Documents/SaaSManagement/ekolplus2
grep -n "message namespaces" CLAUDE.md
grep -n "the rest of Pédagogie" CLAUDE.md
git log --oneline -5 -- CLAUDE.md
```

Other concurrent work in this repo may have edited this paragraph since the plan was written. **Diff what you read against the two fragments below.** If either has shifted, apply the *equivalent* change to the current wording rather than forcing this plan's text.

As of this plan's writing the paragraph contains:
- `…across 24 message namespaces tracked in \`MESSAGE_NAMESPACES\`…`
- `…Every other screen (the rest of Pédagogie — Emploi du temps — and the rest of \`/admin/*\` beyond the dashboard) still reads French from \`constants.ts\` unchanged; see…`

- [ ] **Step 2: Bump the namespace count 24 → 25**

`timetable` is the 25th entry in `MESSAGE_NAMESPACES`. Confirm before editing:

```bash
pnpm --filter frontend exec node -e "console.log(require('fs').readdirSync('src/messages/fr').length)"
```

Expected: `25`. Then change `across 24 message namespaces` → `across 25 message namespaces`.

- [ ] **Step 3: Add the Emploi du temps clause**

Insert after the existing Scolarité clause (the one ending `…per the user's sign-off decision in \`docs/superpowers/specs/2026-08-20-i18n-scolarite-design.md\``), mirroring the style of the Carnet de notes / Appréciations clauses — semicolon-joined, naming the namespace, the real bug fixed, and the deliberate carve-out:

```
; and the Emploi du temps (timetable) screen under Pédagogie is migrated too (`timetable` namespace, covering the toolbar/filters/view switcher, the week-grid, agenda and month views, the legend and the 3-step session wizard) — its `timetable-utils.ts` carried the same class of locale hardcode already fixed in the grade book and Appréciations, an unconditional `date-fns` `fr` import behind every date label plus three `localeCompare(..., 'fr')` sorts, now routed through a local `CALENDAR_LOCALE` (mirroring `DateField.tsx`) and the shared `LOCALE_BCP47` collation map, with `TimetableMonth.tsx`'s hardcoded `['Lun', 'Mar', ...]` header array replaced by a derived `weekdayHeaders(locale)`; its `TYPE_META.label` and `RECURRENCE_DAYS`' French `short`/`plural` fields were dropped in favour of single-source-of-truth message groups (`timetable.sessionType.*`, `timetable.recurrence.day*`) while the persisted `SessionType` codes and ISO weekday numbers stay untouched; and the CSV export's 10 column heads now follow the admin's UI locale while the filename (`emploi-du-temps-{from}_{to}.csv`) stays an untranslated technical slug by design
```

- [ ] **Step 4: Remove the "rest of Pédagogie" mention**

With Carnet de notes, Présences, Appréciations and now Emploi du temps all migrated, **no Pédagogie screen remains untranslated**. Rewrite the sentence so Pédagogie is not named at all and no dangling em-dash or empty parenthetical is left behind:

```
Every other screen (the rest of `/admin/*` beyond the dashboard) still reads French from `constants.ts` unchanged; see
```

Re-read the live sentence first — if a concurrent change altered its structure, adjust grammatically to whatever is actually there. The invariant to preserve: **Pédagogie must no longer be listed as having a remainder.**

- [ ] **Step 5: Run the full gate**

```bash
cd /home/amos-dorceus/Documents/SaaSManagement/ekolplus2
pnpm format && pnpm lint && pnpm typecheck && pnpm test
```

All four must pass. Two known conditions:
- **Doc tripwires.** `frontend/src/lib/server/observability/*shape.test.ts` assert a small set of architectural invariants in `CLAUDE.md`. If one fails after Step 3/4, the edit broke a phrase a tripwire greps for — read the failing assertion and restore that phrase; do not weaken the test.
- **Known flaky offline-queue test.** A pre-existing timing flake, unrelated to this work (it has surfaced in the Phase 2 and Appréciations sub-projects). If it fails, re-run it alone once before treating it as a regression:
  ```bash
  pnpm --filter frontend exec vitest run -t "<failing test name>"
  ```
  A pass in isolation confirms the flake. A second failure means investigate for real.

- [ ] **Step 6: Verify the module end-to-end in the browser (judicious, one pass)**

Start `pnpm dev`, log in once and check: the four view tabs (Mois/Semaine/Jour/Agenda) with their subtitles, the week-grid day headers, the month grid's weekday row, the legend's type pills, and the session wizard's three steps — first in French, then switch to English via Paramètres › Langue, then Kreyòl.

Do **one** login. The app's per-email rate limit is 10 attempts / 15 min and has tripped during prior sub-projects' iterative script debugging; keep the session alive rather than re-authenticating per locale.

Spot-check specifically: the month view's headers read `Mon Tue Wed…` in English, a CSV export downloads with translated column heads but the **unchanged** `emploi-du-temps-…csv` filename, and the recurrence summary line renders its two bold fragments correctly in each locale.

- [ ] **Step 7: Confirm the whole namespace is coherent**

```bash
cd /home/amos-dorceus/Documents/SaaSManagement/ekolplus2/frontend/src/messages
grep -c "’" fr/timetable.json ht/timetable.json en/timetable.json
grep -c "_review" ht/timetable.json fr/timetable.json en/timetable.json
grep -rnE "Choisis |Indique |Configure d|clique |Réessaie|Ajoute un|change de" fr/timetable.json
```

Expected: `0` curly apostrophes in all three; `_review` count `1` in `ht`, `0` in `fr` and `0` in `en`; the tutoiement grep prints **nothing**.

- [ ] **Step 8: Commit**

```bash
cd /home/amos-dorceus/Documents/SaaSManagement/ekolplus2
git add CLAUDE.md
git commit --only -- CLAUDE.md \
  -m "docs(i18n): record the Emploi du temps migration in CLAUDE.md

Namespace count 24 -> 25. Documents the timetable namespace, the date-fns
and localeCompare locale-hardcode fix, and the CSV header translation with
its intentionally untranslated filename. Removes Pedagogie from the list of
areas with untranslated screens -- with Emploi du temps shipped, the whole
module is migrated.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git show --stat HEAD
```

- [ ] **Step 9: Final verification before handing off**

```bash
git log --oneline -5
git status --short
```

Expected: five new commits (one per task), and `git status` showing only files belonging to a concurrent session — nothing of this work left uncommitted.

---

## Post-implementation checklist

- [ ] `MESSAGE_NAMESPACES` has 25 entries and `src/messages/{fr,ht,en}/` each hold 25 files.
- [ ] `grep -rn "date-fns/locale" frontend/src/components/school/timetable/` shows only `timetable-utils.ts`'s `CALENDAR_LOCALE` import.
- [ ] `grep -rn "localeCompare(.*'fr')" frontend/src/components/school/timetable/` prints nothing.
- [ ] `grep -rn "CSV_HEADERS\|TYPE_LABELS\|recurrenceDaysLabel\|WEEKDAY_HEADERS" frontend/src/` prints nothing.
- [ ] `_review` appears exactly once, in `ht/timetable.json` only.
- [ ] No curly apostrophe (`’`) in any of the three `timetable.json` files.
- [ ] The CSV filename is unchanged across locales.
- [ ] `pnpm format && pnpm lint && pnpm typecheck && pnpm test` all green.
