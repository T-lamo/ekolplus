# Affectations — Banani → Next.js

## Source
- Banani screen ID: `ufpxQ7cv5ffm`
- Fetched: 2026-08-11

Data model: see [epic-4-data-model.md](./epic-4-data-model.md) — this screen
is the **cross-class view + full edit** (teacher, weekly hours, coefficient)
of the same `ClassSubject` pivot Coefficients edits partially.

## Route
`/configuration/affectations` — same shell/auth pattern as the other 3.

## Structure map
- Page header: title + "Nouvelle affectation" (drop "Exporter").
- Summary bar (4 cards): Total affectations (ClassSubject rows school-wide),
  Affectations actives (teacherId set), Sans enseignant (teacherId null),
  Classes couvertes (distinct classId with ≥1 row) / Total classes.
- Filters: search + Classe dropdown + Enseignant dropdown + Statut dropdown
  (Toutes/Active/Sans enseignant) — all client-side.
- Table: Matière (icon+name+code) / Enseignant (avatar-less name+domain, or
  "Non assigné") / Classe (badge) / Volume horaire (number input inline or
  edit-modal — **V1: edit-modal**, avoids a dozen inline-editable cells at
  once) / Coefficient (read-only badge here — editing lives in Coefficients,
  not duplicated) / Période (static: active `AcademicYear` label, not
  per-row editable — V1 cut, see data-model) / Statut (badge) / row actions
  (pencil → edit modal, kebab: "Changer l'enseignant" opens same modal,
  "Supprimer l'affectation"). Dropped: "Dupliquer vers une autre classe".
- "Nouvelle affectation" opens the same modal used for edit, but requires
  picking Classe + Matière first (the two FKs that define the row identity);
  once both are picked, if a `ClassSubject` already exists for that pair the
  modal loads its current values instead of creating a duplicate (upsert
  semantics match the API).

## Component breakdown
- **NEW** `src/app/(school)/configuration/affectations/page.tsx`
- **NEW** `src/app/(school)/configuration/affectations/AssignmentFormModal.tsx` — class select, subject select, teacher select (+ inline "+ Nouvel enseignant" create, same pattern as `ClassFormModal`), weekly hours number input, coefficient number input (kept editable here too since Affectations is the natural place to set it when first creating an assignment — Coefficients screen remains the bulk-review/adjust surface for an already-populated class)
- **REUSE** `Card`, `Field`, `Select`, `Button`, `Modal`

## Token mapping
Same table/badge classes as the other 3 screens — fully consistent by now,
no new tokens.

## Responsive plan
- **375px**: summary `grid-cols-2`; filters wrap; table `overflow-x-auto`;
  modal form fields stack single-column (already `Field`/`Select` default).
- **md/lg**: matches Banani desktop 1:1.

## Interactions / state
Creating with an already-covered (class, subject) pair is not an error — it
opens the existing row for editing (upsert), with a small note in the modal
("Cette matière est déjà affectée à cette classe — modification"). Delete
sets `teacherId`/`coefficient`/`weeklyHours` back to null rather than
deleting the row **only if** the row still has a coefficient set from
Coefficients (would silently undo curriculum planning) — otherwise hard
delete. Simpler V1 rule actually adopted: hard delete always via
`DELETE /api/school/class-subjects/[id]`, with a confirm dialog warning
"Le coefficient configuré pour cette matière sera aussi supprimé." — no
partial-null special case, avoids a second code path for one edge visual.

## Copy / i18n
Inline French JSX.

## Implementation checklist
- [x] Plan written
- [ ] `GET /api/school/class-subjects` (no `classId` — school-wide, reused from Coefficients)
- [ ] `POST /api/school/class-subjects` (reused, full body: teacherId/weeklyHours/coefficient)
- [ ] `DELETE /api/school/class-subjects/[id]`
- [ ] Page + assignment form modal
- [ ] 375/768/1280 checks
- [ ] Real end-to-end check (create assignment incl. inline teacher creation, edit hours, delete)

## Open questions for user
None.
