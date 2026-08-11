# Students List — Banani → Next.js

## Source
- Banani screen ID: `irP1FJzNcIpq`
- Fetched: 2026-08-11

Data model: see [epic-5-data-model.md](./epic-5-data-model.md) (`Student`, `Enrollment`, `Guardian`).

## Route
`/eleves` — `(school)` route group, same shell/auth pattern as Epic 4.

## Structure map
- Page header: title + subtitle (`{count} élèves inscrits — {activeYear.label}`).
  Actions: Importer (stub toast — see data-model cuts), Exporter (real,
  `exportToCsv`), Ajouter un élève (opens create modal).
- Filters: search (name) + Classe dropdown (real, from `/api/school/classes`)
  + Statut dropdown (real: Inscrit/Absences répétées/Suspendu) + view
  toggle (list/grid, both real — see Classes precedent). Drop "Trier par"
  (cosmetic in Banani itself, see data-model cuts).
- Table: Élève (avatar-by-initials + name + `#studentNumber`) / Classe
  (badge, from current-year Enrollment) / Date de naissance / Statut
  (badge) / Moyenne (**`—`, Epic 6**) / Présence (**`—`, Epic 8**) / row
  actions (eye→profile link, pencil→edit modal, kebab: Voir le profil,
  Modifier, Voir le bulletin[stub Epic 7], Présences[stub Epic 8], divider,
  Suspendre[real — toggles `status`], Supprimer[real]).
- Grid view: cards (avatar, name, #number, classe badge, statut badge,
  DOB) — same card pattern as Classes' grid.

## Component breakdown
- **NEW** `src/app/(school)/eleves/page.tsx`
- **NEW** `src/app/(school)/eleves/StudentFormModal.tsx` — create/edit:
  identity fields + up to 2 guardian sub-forms (père/mère/tuteur — Banani
  shows exactly 2, V1 matches that rather than building an add/remove-N
  guardian list) + classe `Select` (creates/moves the current-year `Enrollment`)
- **REUSE** `Card`, `Field`, `Select`, `Button`, `Modal`, `Avatar`, `ActionMenu`, `exportToCsv`

## Token mapping
Same table/badge/avatar treatment as Epic 4's 4 screens — fully consistent
by now, no new tokens.

## Responsive plan
Same as Classes: `grid-cols-2` summary-equivalent stats row on 375px (this
screen has no summary cards in Banani — subtitle line covers the count);
filters wrap; table `overflow-x-auto`; grid view `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.

## Interactions / state
Delete confirm dialog. "Suspendre" toggles `Student.status` to `SUSPENDED`
(real, not a stub — the field already exists for exactly this). Empty/loading/error states match the established pattern.

## Implementation checklist
- [x] Plan written
- [ ] `GET/POST /api/school/students`
- [ ] Page + create/edit modal
- [ ] 375/768/1280 checks
- [ ] Real end-to-end check (create student incl. 2 guardians, list, suspend, delete)

## Open questions for user
None — Moyenne/Présence `—` treatment follows the confirmed Epic 4 pattern.
