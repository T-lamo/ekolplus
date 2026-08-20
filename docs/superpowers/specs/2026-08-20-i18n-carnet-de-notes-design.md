# i18n — Carnet de notes (Grade Book) — Design Spec

## Problem

Per the Phase 0 roadmap, Phase 3 is "the Pédagogie module (carnet de notes,
appréciations, emploi du temps, présences) — the largest single module by
string count." At ~6,000 lines across 15 files, it's too large for a single
spec/plan cycle, so it decomposes into 4 independent sub-projects by
directory. This spec covers the first: **Carnet de notes** (grade book) —
the largest sub-module (~2,415 lines, 7 files), covering evaluation
configuration, grade entry, per-evaluation review, and statistics.

## Scope (this spec)

**In scope — full file list (7 files):**

- `frontend/src/app/(school)/pedagogie/carnet-de-notes/page.tsx` (897
  lines) — main grade-book screen: summary cards, combined/single grade
  tables, evaluation list, CSV export, ActionMenu
- `frontend/src/app/(school)/pedagogie/carnet-de-notes/EvaluationConfigForm.tsx`
  (173 lines) — shared form used by both the "new evaluation" and "edit
  evaluation" flows
- `frontend/src/app/(school)/pedagogie/carnet-de-notes/NewEvaluationModal.tsx`
  (82 lines)
- `frontend/src/app/(school)/pedagogie/carnet-de-notes/ParEvaluationTab.tsx`
  (189 lines)
- `frontend/src/app/(school)/pedagogie/carnet-de-notes/StatistiquesTab.tsx`
  (248 lines)
- `frontend/src/app/(school)/pedagogie/carnet-de-notes/[evaluationId]/edit/page.tsx`
  (227 lines)
- `frontend/src/app/(school)/pedagogie/carnet-de-notes/[evaluationId]/saisie/page.tsx`
  (599 lines) — grade entry grid, the module's most complex screen

`types.ts` (pure TypeScript unions, no runtime strings) is out of scope by
nature — nothing to translate.

**Explicitly out of scope (their own future sub-project phases):**

- `frontend/src/app/(school)/pedagogie/appreciations/**` — report-card
  comments (~2,145 lines, 5 files)
- `frontend/src/app/(school)/pedagogie/presences/**` — attendance
  (~1,118 lines, 2 files)
- `frontend/src/app/(school)/pedagogie/emploi-du-temps/**` — timetable
  (~529 lines, 1 file); another session currently has uncommitted changes
  touching its supporting `components/school/timetable/*` files, an
  additional reason to defer

## Decisions carried from user sign-off (this phase)

- **Vouvoiement throughout**, no exceptions — standing convention. A
  tutoiement violation (`'Erreur réseau. Réessaie.'`, tu-form imperative)
  is copy-pasted across 3 of the 7 files; corrected everywhere as part of
  this migration, same as every prior phase.
- **`ParEvaluationTab.tsx`'s hardcoded `'fr-FR'` locale is a real bug, not
  just a translation gap** — same class as the `DateField` fix from the
  shared-UI-primitives phase. Fixed by routing through `LOCALE_BCP47`,
  the app's established pattern (see [[i18n-ui-primitives-status]] for the
  precedent).
- **`TYPE_LABEL` (the DS/Interrogation/Examen/Autre evaluation-type map) is
  unified, not just duplicated in two message files.** It's independently
  defined in both `EvaluationConfigForm.tsx` and `ParEvaluationTab.tsx`
  today, and their French text already disagrees (`'Devoir surveillé
  (DS)'` vs `'Devoir surveillé'`). Migrating both to the same namespace key
  forces a single source of truth; the more descriptive form (`'Devoir
  surveillé (DS)'`) wins, since the parenthetical abbreviation is genuinely
  informative on first read.
- **`EvaluationStatus` (`DRAFT`/`PUBLISHED`) is normalized to one
  dynamic-key entry**, not left as 3 separate hardcoded ternaries
  (`page.tsx`'s tooltip, `ParEvaluationTab.tsx`'s badge,
  `saisie/page.tsx`'s badge) — mirrors the `statusLabel` pattern
  `AnneeScolaireTab.tsx` already established for term status in Phase 2.
- **Shared, cross-phase constants are fenced off, not migrated** — where a
  value is consumed by both an in-scope file here and a file belonging to
  a deferred sub-project, it stays untouched. See "Cross-dependency
  fences" below.

## Current state (as found)

**No shared `constants.ts` object for this module's own copy.** Every
string in these 7 files is either inline JSX or a small file-local
`Record`/array — this phase's migration pattern is Phase 1a's "inline JSX
string → `useTranslations()`," same as most of Phase 2.

**`page.tsx` (897 lines, densest file):** 7 toast messages, ~20+ JSX
labels (headers, summary-card labels, tab labels, two sets of table
headers for the combined vs. single-evaluation layouts), an `ActionMenu`
with 4 stub entries pointing at unshipped features (e.g. `"Disponible avec
Epic 7 (Bulletins)."`, `"Historique — bientôt disponible."`), one
`confirm()` message, CSV export column headers and filename tokens
(`'Élève'`, `'N°'`, `'Moyenne générale'`, `'Rang'`, `'Abs.'`), one
placeholder, one tooltip `title=`. Estimated 60-70 distinct strings.

**`[evaluationId]/saisie/page.tsx` (599 lines, second densest):** 4 toast
messages, table headers, `Badge` contents, footer stats strings (including
an embedded `n > 1 ? 's' : ''` pluralization for "absent(s)" — same
`.one`/`.other` treatment as every prior phase's pluralized counts),
button labels, one placeholder, one aria-label (`"Marquer absent"`).
Consumes the fenced `OFFLINE_SYNC.queuedToast` (see below). Estimated
40-50 strings.

**`EvaluationConfigForm.tsx` (173 lines):** field labels, the `TYPE_LABEL`
map (4 entries, to be unified per the decision above), an Oui/Non toggle,
2 placeholders. Reused by both the new-evaluation and edit-evaluation
flows via `NewEvaluationModal.tsx` and `[evaluationId]/edit/page.tsx`.

**`[evaluationId]/edit/page.tsx` (227 lines):** 2 toasts, one `confirm()`
message, a warning banner, button labels. Carries the `'Réessaie.'`
tutoiement violation.

**`StatistiquesTab.tsx` (248 lines):** mostly `StatTile` labels/subtitles
and 3 chart `ariaLabel` props passed into the shared `BarChart` component
(the component itself takes `ariaLabel` from its caller and has no
hardcoded text of its own — not a fence, these 3 strings are in-scope
here). No toasts, no interactive strings — purely display copy.

**`ParEvaluationTab.tsx` (189 lines):** the second `TYPE_LABEL` copy (see
decision above), an empty-state message, `EvalStat` labels, the
`Publiée`/`Brouillon` status ternary (folds into the new `statusLabel`
dynamic key), and the hardcoded `'fr-FR'` date-formatting bug.

**`NewEvaluationModal.tsx` (82 lines, sparsest):** modal title, one
validation error, one generic error (carries the `'Réessaie.'` violation),
submit button label and its loading state.

**Shared components consumed, not migrated here (already handled or out
of scope):** `@/components/ui/DateField` and `@/components/ui/Modal` —
both already translated in the shared-UI-primitives phase, fenced here.
`Field`, `Select`, `Avatar`, `Button`, `Card`, `Skeleton`, `SearchInput`,
`FilterSelect`, `ActionMenu`, `Pager` — shared UI primitives, out of
scope. `useToast`/`useConfirm` context hooks are fenced (plumbing only);
the message strings passed into them are in-scope.

**No existing tests** reference any file in this module by name or path —
no test-update burden for this migration.

## Architecture (unchanged — this phase adds no new infrastructure)

Same `next-intl` machinery as every prior phase: `useTranslations('<namespace>')`
in client components, message files under `frontend/src/messages/{fr,ht,en}/
<namespace>.json`, registry additions in `frontend/src/lib/locales.ts`
(`MESSAGE_NAMESPACES`), `frontend/src/i18n/request.ts`, and
`frontend/src/types/next-intl.d.ts` — all three cross-checked by
`locales.test.ts`. None of the 7 files currently import `next-intl` at
all (confirmed — this module has zero prior i18n work, unlike
`AnneeScolaireTab.tsx` which this spec's dynamic-key/date-locale patterns
are both borrowed from).

## Namespace & message-file design

**One `gradebook` namespace for all 7 in-scope files**, nested per
component — mirroring the `settings` namespace's "one screen, many
panels" shape from Phase 2, since all 7 files are reachable from the same
`/pedagogie/carnet-de-notes` screen (including its `[evaluationId]`
sub-routes, which are still part of the same conceptual screen, not a
separate destination).

Proposed top-level keys inside `gradebook.json`:

```
gradebook.page.*              (page.tsx — title, summary cards, table
                                 headers, toasts, ActionMenu, CSV export,
                                 confirm message)
gradebook.evaluationType.{DS,INTERROGATION,EXAMEN,AUTRE}
                               (unified TYPE_LABEL — single source of
                                 truth for EvaluationConfigForm.tsx AND
                                 ParEvaluationTab.tsx)
gradebook.evaluationStatus.{DRAFT,PUBLISHED}
                               (unified statusLabel — single source of
                                 truth for page.tsx, ParEvaluationTab.tsx,
                                 saisie/page.tsx)
gradebook.evaluationForm.*    (EvaluationConfigForm.tsx's own fields/
                                 placeholders, minus TYPE_LABEL which
                                 moves to the shared key above)
gradebook.newEvaluationModal.* (NewEvaluationModal.tsx)
gradebook.editEvaluation.*    ([evaluationId]/edit/page.tsx)
gradebook.saisie.*            ([evaluationId]/saisie/page.tsx, incl.
                                 .one/.other for the absent-count plural)
gradebook.parEvaluation.*     (ParEvaluationTab.tsx, minus TYPE_LABEL/
                                 status which move to the shared keys)
gradebook.statistiques.*      (StatistiquesTab.tsx, incl. 3 chart
                                 ariaLabel strings)
```

**`common` namespace gains more consumers:** `common.errors.network`
replaces every `'Erreur réseau. Réessaie.'`-shaped fallback across the 3
files that carry it — fixing the tutoiement violation for free, same
mechanism Phase 2 used.

## Cross-dependency fences (values that stay French, untouched)

| Value | In-scope consumer | Deferred consumer(s) |
|---|---|---|
| `OFFLINE_SYNC` (`@/lib/constants`) | `saisie/page.tsx` (`.queuedToast` only) | `pedagogie/appreciations/[studentId]/saisie/page.tsx`, `pedagogie/presences/page.tsx`, `components/layout/topbar/OfflineIndicator.tsx` — all still-unmigrated screens in this same Pédagogie module or the app shell |

Net effect: the offline-queue toast text stays French in this phase;
everything else in the 7 in-scope files is translated.

## Data flow

Unchanged from prior phases. `ParEvaluationTab.tsx`'s `fmtDate()` is
rewritten to accept the active locale via `useLocale()` and index into
`LOCALE_BCP47` (added in Phase 1c, already used by 5 other components)
instead of hardcoding `'fr-FR'` — the exact fix already proven on
`AdministrateursTab.tsx`, `AnneeScolaireTab.tsx`, and `ProfilTab.tsx`'s
own `fmt()`/`formatLastChanged()` helpers in Phase 2.

## Testing plan

- `locales.test.ts` automatically covers the new `gradebook` namespace
  once it's added to `MESSAGE_NAMESPACES` — no test-file changes needed
  for the registry itself.
- No existing tests reference this module, so no test-rewiring burden
  (unlike Phase 2's `ROLE_LABEL`/`formatLastChanged` signature changes,
  which had no pre-existing test coverage either, by the way — this
  module simply has none to begin with).
- `pnpm typecheck && pnpm lint && pnpm test` must stay green throughout —
  standard project gate.
- Manual verification follows the same method established in the
  shared-UI-primitives phase: log in as the seeded dev account, switch
  locale via the app's own `LanguagePicker` UI (not by setting the
  `sg-locale` cookie directly — a signed-in user's `AuthProvider` resync
  overwrites a manually-set cookie back to the account's stored
  `User.locale` on every full navigation), then verify rendered text in
  all 3 locales, with particular attention to the unified
  `evaluationType`/`evaluationStatus` keys rendering identically across
  every consumer.

## Rollout notes

After this sub-project, the remaining Pédagogie sub-projects are:
Appréciations (report-card comments), Présences (attendance), and Emploi
du temps (timetable — likely last, pending the other session's in-flight
timetable-component changes landing first). After Pédagogie completes,
the roadmap's remaining items stay: Scolarité/Élèves/Enseignants, the
rest of `/admin/*` (Admin back-office phase), server message
normalization, the landing page + static rendering, and bulletin PDFs +
Resend emails. The shared-UI-primitives phase's own deferred items
(other still-French shared components) remain tracked separately — see
[[i18n-ui-primitives-status]].
