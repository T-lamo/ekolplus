# i18n — Appréciations (Report-Card Comments) — Design Spec

## Problem

Second of 4 Pédagogie sub-projects (per the Phase 0 roadmap's decomposition
of the ~6,000-line module). [[i18n-carnet-de-notes-status]] shipped the
first (Carnet de notes, grade book) and merged to `develop`. Since then, a
concurrent session shipped Présences, Enseignants, Élèves, and
Configuration/Niveaux — none of which touch this sub-project's files. This
spec covers the second sub-module: **Appréciations** (report-card
comments) — 6 files, 2,254 lines, covering the class-wide list, per-student
detail, the comment-entry form, and two supporting tabs.

## Scope (this spec)

**In scope — full file list (6 files):**

- `frontend/src/app/(school)/pedagogie/appreciations/page.tsx` (645
  lines) — class-wide list: summary cards, filters, Par élève/Par
  matière/Statistiques/En attente tabs, CSV export
- `frontend/src/app/(school)/pedagogie/appreciations/[studentId]/page.tsx`
  (496 lines) — single-student detail: general appreciation, per-subject
  table, stats, quick actions (several are unshipped-feature stubs)
- `frontend/src/app/(school)/pedagogie/appreciations/[studentId]/saisie/page.tsx`
  (686 lines) — comment-entry form, the module's largest and most complex
  screen (quick-phrase bank, per-subject sub-form, prev/next student nav)
- `frontend/src/app/(school)/pedagogie/appreciations/types.ts` (106
  lines) — contains a runtime `MENTION_LABEL` map (not pure types; unlike
  Carnet de notes' `types.ts`, this one is in scope)
- `frontend/src/app/(school)/pedagogie/appreciations/StatistiquesTab.tsx`
  (205 lines)
- `frontend/src/app/(school)/pedagogie/appreciations/ParMatiereTab.tsx`
  (116 lines)

**Explicitly out of scope (other modules, already migrated or deferred):**

- `frontend/src/app/(school)/eleves/[id]/AppreciationsTab.tsx` — already
  migrated (`Eleves.appreciations`/`Eleves.mention` namespace), surfaces
  the same feature inside the Élève detail page; this spec's new
  `appreciations` namespace stays independent per the namespace-sharing
  decision below, so this file needs no changes
- `frontend/src/app/(school)/pedagogie/presences/**` — already migrated by
  a concurrent session (`presences` namespace)
- `frontend/src/app/(school)/pedagogie/emploi-du-temps/**` — timetable,
  still deferred (own future sub-project)
- `frontend/src/lib/offline-queue.ts`, `frontend/src/lib/constants.ts`'s
  `OFFLINE_SYNC` object — shared cross-module subsystem, fenced (see
  below)
- `frontend/src/lib/csv-export.ts` — generic, locale-agnostic CSV
  mechanism; only the header/status strings this module passes into it are
  in scope

## Decisions carried from user sign-off (this phase)

- **Vouvoiement throughout**, no exceptions. Two clear violations found by
  full-file reading (not caught by a `\btu\b` grep, consistent with every
  prior phase's finding): `"Configure d'abord des classes et des élèves
  avant de saisir des appréciations."` (`page.tsx`) and `'Erreur réseau.
  Réessaie.'` (`saisie/page.tsx`) — both corrected to vous-form. A third,
  more subtle case: `QUICK_PHRASES` contains `'Élève sérieux et investi,
  encourage à continuer.'`, where `"encourage"` reads as a bare
  tu-imperative dropped into third-person descriptive text (most likely a
  typo for `"encouragé"`, the intended past participle). Since this string
  becomes a translation key regardless, the grammar is fixed as part of
  the migration — final corrected French: `'Élève sérieux et investi, qui
  doit continuer ainsi.'`, keeping the same encouraging register without
  the dangling imperative.
- **`fmtDate()`'s hardcoded `'fr-FR'` is a real bug** (`[studentId]/page.tsx`),
  same class as Carnet de notes' `ParEvaluationTab.tsx` fix. Fixed via
  `useLocale()` + `LOCALE_BCP47`, mirroring the already-migrated
  `eleves/[id]/AppreciationsTab.tsx`'s own fix of the identical bug.
- **`fmt()`'s decimal-comma hardcode (`.toFixed(1).replace('.', ',')`) is
  duplicated 5 times** across this module (`page.tsx`, `[studentId]/page.tsx`,
  `[studentId]/saisie/page.tsx`, `StatistiquesTab.tsx`, `ParMatiereTab.tsx`)
  — one more copy than Carnet de notes' `fmt()` finding, which was parked
  as out-of-scope there. Given 5 independent byte-identical copies within
  a single module (as opposed to Carnet de notes' 3 copies spread across
  files that were each individually small), this phase consolidates them
  into one shared, locale-aware helper rather than leaving the bug parked
  a second time. Same treatment for `mentionClass()` (×2) and `moyColor()`
  (×2), also byte-identical duplicates.
- **New helper file**: `frontend/src/app/(school)/pedagogie/appreciations/format.ts`,
  exporting `fmtAverage(value: number, locale: LocaleKey): string` (locale-aware
  decimal separator, via `Intl.NumberFormat` rather than manual
  `.replace()`), `mentionClass(mention: Mention): string`, and
  `moyColor(value: number): string`. Pure functions, no JSX, no
  translation strings of their own — a formatting/styling helper, not a
  namespace.
- **`MENTION_LABEL` gets its own `appreciations.mention.*` namespace**,
  independent from the already-migrated `Eleves.mention` even though the
  6 labels are identical strings — per project sign-off, matching this
  repo's stated "one namespace per screen" convention
  (`CLAUDE.md`) and every prior phase's precedent (no cross-module
  namespace sharing has occurred anywhere in this rollout so far). Accepts
  18 duplicated strings (6 labels × 3 locales) as the cost of avoiding
  cross-module coupling.
- **Unshipped-feature stub toasts stay in scope for translation**, even
  though the features themselves don't exist yet: `'Messagerie — bientôt
  disponible.'`, `'Disponible avec les Bulletins (Epic 7).'`, `'Disponible
  avec le Conseil de classe (à venir).'`, `"L'historique détaillé arrive
  avec le module d'audit (à venir)."` — these render today and must not
  show French to non-French users just because the feature they gate is
  unbuilt.

## Current state (as found)

**No existing i18n work in this module** — `grep -rn
"next-intl|useTranslations"` across all 6 files returns zero hits.
`appreciations` is absent from `MESSAGE_NAMESPACES`, and no
`frontend/src/messages/{fr,ht,en}/appreciations.json` exists.

**`page.tsx` (645 lines, densest file):** ~45+ distinct strings — 2 load
errors, 1 confirm-dialog message, 2 delete-outcome toasts, 3 ActionMenu
item labels, a 7-column CSV header array plus 2 status-cell values, page
title/subtitle, export/new-entry buttons, the `"Configure d'abord..."`
tutoiement violation, 8 summary-card label/sub pairs, a search
placeholder, a mention filter's "Toutes mentions" default, a result-count
string, 4 tab labels, an empty-state message, 6 table headers, a
"Non renseigné" fallback, an empty-appreciation message, 2 status badge
labels, and a pagination-footer sentence with 2 embedded counts.

**`[studentId]/page.tsx` (496 lines):** ~35 strings — 2 load errors, 1
confirm message, 2 delete-outcome toasts, a back-link label (×2 uses), a
breadcrumb-style position sentence, 4 stub-feature toasts/buttons (see
decision above), an edit-appreciation label, a "Rédigé par :"/authorship
sentence, a 2-state status text (`Saisie`/`Brouillon`), an empty-state
message, a subject-table section title + 6 headers, an overall-average
label, a rank sentence, a class-council stub section, a stats section
title, 4 StatBox labels, 4 InfoRow labels, a homeroom-teacher section, an
"undefined" fallback, 2 audit-history strings, a quick-actions section
title, and 3 action-button labels. Carries the `fmtDate()` fr-FR bug.

**`[studentId]/saisie/page.tsx` (686 lines, largest and most complex):**
~50+ strings — 3 option-array Selects (Comportement/Investissement/
Assiduité, 4+4+3 values each — these are enum-like display labels, not
free text, so they migrate to dynamic-key namespace entries the same way
Carnet de notes' `evaluationType` did), 6 `QUICK_PHRASES` canned
comments (one needing the grammar fix above), the `'Erreur réseau.
Réessaie.'` violation, 2 back-link labels, a page title, 2 save-action
buttons (one duplicated at top and bottom of the form), a progress
sentence, a context-section title + 4 field labels, a selected-student
section title, prev/next navigation labels, a student-position sentence,
an average label, a general-appreciation section + mention field + 2
comment-field labels (one with a parenthetical), a character-count
sentence, a placeholder, 3 select-field labels, a per-subject section
title + count sentence, a per-subject placeholder, prev/next student name
sentences (×2), a student-summary section title, 5 InfoRow labels, a
per-subject-grades section title, a quick-phrases section title +
subtitle, and 2 outcome toasts. Consumes the fenced `OFFLINE_SYNC.queuedToast`
(imports it, doesn't own its text).

**`StatistiquesTab.tsx` (205 lines):** ~15 strings — an empty-data
message, 4 KPI-card label/sub pairs (one with a pluralized mention-count
sentence, `${count} élève${count > 1 ? 's' : ''}` — `.one`/`.other`
treatment, same as every prior phase's pluralized counts), a
no-mentions-saisies fallback, and 3 chart title/subtitle/`ariaLabel`
triples passed into the shared `BarChart` component (the component itself
takes these as props and has no hardcoded text — in-scope here, same
reasoning as Carnet de notes' `StatistiquesTab.tsx`).

**`ParMatiereTab.tsx` (116 lines, sparsest):** ~10 strings — an
empty-state message, 6 table headers, and 3 status badges
(Complet/En cours/À faire).

**`types.ts` (106 lines):** the `MENTION_LABEL` runtime `Record<Mention,
string>` (6 entries) — the only runtime string content in an otherwise
pure-types file; everything else in the file (interfaces, the `Mention`
union) is compile-time only and out of scope by nature.

**Shared components consumed, not migrated here (already handled or out
of scope):** same primitive set as Carnet de notes (`Field`, `Select`,
`Avatar`, `Button`, `Card`, `Skeleton`, `SearchInput`, `FilterSelect`,
`ActionMenu`, `Pager`, `Modal`, `DateField`) — all shared UI, already
translated where relevant (shared-UI-primitives phase) or locale-agnostic.
`useToast`/`useConfirm` context hooks are fenced (plumbing only); the
message strings passed into them are in-scope. `submitOrQueue` from
`@/lib/offline-queue` is fenced entirely (see below).

**No existing tests** reference any file in this module by name or
path — no test-update burden.

## Architecture (unchanged — this phase adds no new infrastructure)

Same `next-intl` machinery as every prior phase:
`useTranslations('<namespace>')` in client components, message files
under `frontend/src/messages/{fr,ht,en}/<namespace>.json`, registry
additions in `frontend/src/lib/locales.ts` (`MESSAGE_NAMESPACES`),
`frontend/src/i18n/request.ts`, and `frontend/src/types/next-intl.d.ts` —
all three cross-checked by `locales.test.ts`.

## Namespace & message-file design

**One `appreciations` namespace for all 6 in-scope files**, nested per
component — same "one screen, many panels" shape as `gradebook`, since
all 6 files are reachable from the same `/pedagogie/appreciations` screen
(including its `[studentId]` sub-routes).

Proposed top-level keys inside `appreciations.json`:

```
appreciations.list.*          (page.tsx — title, summary cards, filters,
                                 tabs, table headers, toasts, CSV export,
                                 confirm message)
appreciations.mention.{TRES_BIEN,BIEN,ASSEZ_BIEN,PASSABLE,INSUFFISANT,FAIBLE}
                               (unified MENTION_LABEL — single source of
                                 truth for list.tsx, detail, saisie,
                                 StatistiquesTab — independent from
                                 Eleves.mention per the namespace decision)
appreciations.detail.*        ([studentId]/page.tsx — sections, stub
                                 toasts, StatBox/InfoRow labels, actions)
appreciations.saisie.*        ([studentId]/saisie/page.tsx — the largest
                                 group: option-array labels, quick
                                 phrases, form fields, nav, toasts)
appreciations.statistiques.*  (StatistiquesTab.tsx, incl. chart
                                 ariaLabel strings and the .one/.other
                                 mention-count plural)
appreciations.parMatiere.*    (ParMatiereTab.tsx — headers, status
                                 badges, empty state)
```

**`common` namespace gains one more consumer:** `common.errors.network`
replaces the `'Erreur réseau. Réessaie.'` fallback, same mechanism as
every prior phase.

## Cross-dependency fences (values that stay French, untouched)

| Value | In-scope consumer | Deferred/external consumer(s) |
|---|---|---|
| `OFFLINE_SYNC` (`@/lib/constants`) | `[studentId]/saisie/page.tsx` (`.queuedToast` only) | `pedagogie/emploi-du-temps` (still deferred), `components/layout/topbar/OfflineIndicator.tsx`, and the already-migrated `pedagogie/presences`/`pedagogie/carnet-de-notes` (both fence it the same way — this constant's own migration is a separate, cross-cutting concern, not owned by any single screen) |
| `exportToCsv()` (`@/lib/csv-export`) | `page.tsx` (generic mechanism call) | every other module's CSV export (Carnet de notes already fenced this the same way) |

Net effect: the offline-queue toast text stays French in this phase;
everything else in the 6 in-scope files is translated.

## Data flow

`[studentId]/page.tsx`'s `fmtDate()` is rewritten to accept the active
locale via `useLocale()` and index into `LOCALE_BCP47`, mirroring the
already-migrated `eleves/[id]/AppreciationsTab.tsx`'s identical fix and
Carnet de notes' `ParEvaluationTab.tsx` precedent.

The new `format.ts` helper centralizes `fmtAverage()`/`mentionClass()`/
`moyColor()` — each of the 5 files currently defining its own copy
imports from this file instead. `fmtAverage()` takes an explicit `locale:
LocaleKey` parameter (not a hook — it's a plain function, called from
components that already have `useLocale()` in scope) and uses
`Intl.NumberFormat(LOCALE_BCP47[locale], { minimumFractionDigits: 1,
maximumFractionDigits: 1 }).format(value)` instead of manual
`.toFixed(1).replace('.', ',')`, so `en`/`ht` render `15.3` and `fr`
renders `15,3` correctly instead of always forcing a French comma.

## Testing plan

- `locales.test.ts` automatically covers the new `appreciations` namespace
  once added to `MESSAGE_NAMESPACES` — no test-file changes needed for the
  registry itself.
- No existing tests reference this module, so no test-rewiring burden.
- `pnpm typecheck && pnpm lint && pnpm test` must stay green throughout.
- Manual verification follows the established method: log in as the
  seeded dev account, switch locale via the app's own `LanguagePicker` UI
  (not by setting the `sg-locale` cookie directly), then verify rendered
  text in all 3 locales — with particular attention to (a) the unified
  `mention.*` keys rendering identically across all 4 consumers
  (list/detail/saisie/statistiques), and (b) `fmtAverage()` actually
  switching decimal separator per locale (`15,3` in fr, `15.3` in en/ht),
  not just that the surrounding labels translate.

## Rollout notes

After this sub-project, one Pédagogie sub-project remains: Emploi du
temps (timetable, ~529 lines/1 file) — deferred pending the other
session's in-flight timetable-component changes. Présences, Enseignants,
Élèves, and Configuration/Niveaux were shipped by a concurrent session
during the Carnet de notes phase; their state is current as of this
writing (confirmed via `MESSAGE_NAMESPACES` containing `presences`,
`enseignants`, `eleves`, `configuration`, `gradebook`). After Pédagogie
completes, the roadmap's remaining items stay: Scolarité (Fees & Tuition
— already has a design spec and implementation plan written by a
concurrent session, not yet implemented), the rest of `/admin/*` (Admin
back-office phase), server message normalization, the landing page +
static rendering, and bulletin PDFs + Resend emails. Given the pace of
concurrent i18n work on this repo, re-verify `MESSAGE_NAMESPACES`'s actual
contents before starting the next sub-project rather than trusting this
list.
