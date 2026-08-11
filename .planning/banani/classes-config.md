# Classes Config — Banani → Next.js

## Source
- Banani screen ID: `S_OTSGjwNm4c`
- Fetched: 2026-08-11

Data model: see [epic-4-data-model.md](./epic-4-data-model.md) (`Class`, `Teacher` for homeroom).

## Route
`/configuration/classes` — same shell/auth pattern as Matières.

## Structure map
- Page header: title + "Ajouter une classe" (drop "Exporter").
- Summary bar (4 cards, V1-adjusted — student/grade data doesn't exist yet):
  Total classes, Niveaux distincts (count of distinct `level` values),
  Enseignants principaux assignés (count of classes with `homeroomTeacherId`
  set) / Total classes, Matières / classe en moyenne (avg `ClassSubject`
  count per class). Dropped Banani's "Total élèves" card entirely (no
  Enrollment model — Epic 5).
- Filters row: search (name/room) + Niveau dropdown (distinct levels) + Année
  scolaire — **V1 shows only the active year, not a real filter** (no
  year-switcher yet, same limitation as `resolveMySchool`). Drop "vue
  grille"/"vue liste" toggle (grid view not built).
- Drop the "Toutes les classes / Par niveau / Classes incomplètes" tab row —
  "incomplète" has no definition without enrollment data.
- Table: Classe (color dot + name + room) / Niveau (badge) / Professeur
  principal (avatar-less name or "Non affecté") / Matières (ClassSubject
  count) / Statut (Active — no archived state at V1) / row actions (pencil
  edit, kebab: Modifier, Gérer les matières → links to Coefficients screen
  pre-filtered to this class via `?classId=`, Supprimer). Dropped: Élèves
  column, Moyenne générale column (both need Epic 5/6 data), "Voir la
  classe" / "Affecter enseignants" / "Bulletins de la classe" actions.

## Component breakdown
- **NEW** `src/app/(school)/configuration/classes/page.tsx`
- **NEW** `src/app/(school)/configuration/classes/ClassFormModal.tsx` — name, level, room, capacity, homeroom teacher (`Select` populated from `/api/school/teachers`, includes an inline "+ Nouvel enseignant" text input that POSTs a minimal Teacher first)
- **REUSE** `Card`, `Field`, `Select`, `Button`, `Modal` (new primitive, shared with Matières)

## Token mapping
Reuses the same table/badge classes as Matières (no new tokens). Color dot
per class row (Banani uses a small colored circle before the name) →
deterministic color from a small fixed palette keyed by class id hash (cosmetic
only, not stored — avoids a schema field for something purely decorative).

## Responsive plan
Same as Matières: `grid-cols-2` summary on 375px → `grid-cols-4` at `md:`;
table `overflow-x-auto` below `lg:`; header stacks on mobile.

## Interactions / state
Same loading/empty/error pattern as Matières. Delete blocked server-side
(409) if the class has `ClassSubject` rows — surfaced as a toast telling the
admin to remove subject assignments first (mirrors Subject's guard).

## Copy / i18n
Inline French JSX, same convention as Matières/Settings tabs.

## Implementation checklist
- [x] Plan written
- [ ] `GET/POST /api/school/classes`, `PATCH/DELETE /api/school/classes/[id]`
- [ ] `GET/POST /api/school/teachers` (shared with Affectations — built once)
- [ ] Page + form modal
- [ ] 375/768/1280 checks
- [ ] Real end-to-end check (create class, assign homeroom teacher, delete)

## Open questions for user
None — scope cuts follow the established "cut what depends on unbuilt
epics, document, proceed" pattern already confirmed for Dashboard/Settings.
