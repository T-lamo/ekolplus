# Notes Résultats — Banani → Next.js

## Source
- Banani screen ID: `7c3XE9G80S3x`
- Fetched: 2026-08-11

Data model: see [epic-6-data-model.md](./epic-6-data-model.md) — dynamic
evaluation columns, weighted-average formula, ranking/trend/appreciation
rules, and the real (not stubbed) Objectifs card are all decided there.

## Route
Not a new route — this is the `tab === 'grades'` body of the existing
`/eleves/[id]` page (Epic 5). Reuses that page's sidebar/topbar/page-header/
profile-hero/tabs shell as-is.

## Structure map
- **Filter bar**: Année scolaire dropdown (real `AcademicYear` list),
  Trimestre dropdown (real `Term` list for the selected year, plus "Tous
  les trimestres"). Summary line: "Affichage : {Trimestre X — Année} · N
  matières."
- **Summary cards** (4): Moyenne générale, Rang dans la classe, Meilleure
  matière, Matière difficile — all from the results endpoint.
- **Main grid** (`1fr 340px` desktop, stacks to 1 column on mobile):
  - Left: "Notes détaillées par matière" table, grouped by `Subject.domain`
    (subject-group header rows, matching Epic 4's domain grouping),
    columns: Matière / Coeff. / dynamic Éval. N columns / Moy. matière /
    Moy. classe / Tendance / Appréciation. Footer row: weighted overall
    average vs class average.
  - "Évolution des moyennes par matière" — horizontal bar per subject,
    color-coded by the same 3-tier threshold as the appreciation buckets
    (red <8, amber 8–12, green 12+), legend below.
  - Right: "Classement" card (top 3 + student's own row highlighted +
    bottom row, class min/max/avg footer), "Alerte pédagogique" card
    (hidden if no subject is below 8), "Objectifs T{n}" card (real,
    editable via a small modal on "Définir").
- **Page-header actions**: Retour au profil (already exists on the page),
  Exporter (CSV of the notes table via the existing `exportToCsv` helper),
  Imprimer (`window.print()`, real).
- **Hero stats update**: `Moyenne générale` and `Rang de classe` (2 of the
  existing page's 4 hero stats) now resolve to real values for the
  student's *current* term (date-range-active term, else most recent past
  term, else first term of the active year) instead of `—`. `Taux de
  présence` / `Absences ce trimestre` stay `—` (Epic 8).

## Component breakdown
- **NEW** `src/app/(school)/eleves/[id]/NotesResultatsTab.tsx` — the tab
  body, owns its own filter state (year/term) and fetches
  `/api/school/students/[id]/results`.
- **NEW** `src/app/(school)/eleves/[id]/GoalModal.tsx` — "Définir" form
  (subject select incl. "Moyenne générale" + target score input).
- **REUSE** `Card`, `exportToCsv`, `Select`/`Field`, `Modal`.

## Token mapping
Score-chip thresholds and bar-chart colors reuse the existing
`--success`/`--warning`/`--destructive` CSS variables already mapped in
`globals.css` from Epic 4 — no new tokens needed.

## Responsive plan
- **375px**: filter bar wraps/scrolls horizontally; summary cards go
  2-column grid; main grid stacks to 1 column (notes table, then evolution
  chart, then ranking/alert/objectives); table scrolls horizontally inside
  its own `overflow-x-auto` wrapper (same pattern as every Epic 4/5 table).
- **lg (1024px+)**: `1fr 340px` two-column grid as Banani ships it.

## Interactions / state
- Loading / empty states: if the student has zero graded evaluations for
  the selected period, the whole tab shows one clean empty state ("Aucune
  note enregistrée pour cette période — Disponible via le carnet de notes,
  Epic 6 (à venir)") instead of a table full of dashes or a divide-by-zero
  crash — consistent with the "honest empty tab" precedent from Epic 5.
- Changing Année resets Trimestre to that year's first term.

## Implementation checklist
- [x] Plan written
- [ ] `Evaluation`/`Grade`/`Goal` Prisma models + migration
- [ ] `POST/GET /api/school/evaluations`, `PUT .../[id]/grades`
- [ ] `GET /api/school/students/[id]/results`
- [ ] `GET/PUT /api/school/students/[id]/goals`
- [ ] `NotesResultatsTab` + `GoalModal`, wired into `[id]/page.tsx`
- [ ] Hero stats (Moyenne générale / Rang de classe) wired to real data
- [ ] Seed demo evaluations/grades
- [ ] 375/768/1280 checks, real E2E check as Marie

## Open questions for user
None — modeling decisions documented and resolved in
epic-6-data-model.md, following this session's established pattern of
proceeding on defensible assumptions and flagging them for veto rather
than blocking on confirmation.
