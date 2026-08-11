# Student Profile — Banani → Next.js

## Source
- Banani screen ID: `IOcz_ptC61M8`
- Fetched: 2026-08-11

Data model: see [epic-5-data-model.md](./epic-5-data-model.md) — the
"empty-tab, not fake-table" resolution for the 4 grade/attendance/
appreciation/bulletin-dependent tabs is decided there.

## Route
`/eleves/[id]` — dynamic segment under the `(school)` group.

## Structure map
- Back link → `/eleves`. Actions: Exporter le dossier (stub — no PDF
  generation exists), Voir le bulletin (stub, Epic 7), Modifier le profil
  (opens the same `StudentFormModal` from Students List).
- Hero: avatar (initials, size 80 per Banani's dimensions) + status dot
  (color from `Student.status`) + name + meta row (`#studentNumber`,
  classe, DOB + computed age, titulaire=homeroom teacher of current class)
  + status badge + stats row (Moyenne générale / Taux de présence /
  Absences ce trimestre / Rang de classe — **all `—`**, Epic 6/8).
- Tabs: Informations (built, real) / Notes & Résultats (empty state, Epic 6)
  / Présences (empty state, Epic 8) / Appréciations (empty state, Epic 6)
  / Bulletins (empty state, Epic 7). Empty-state copy names the epic so
  it reads as "coming", not "broken" — e.g. "Les notes apparaîtront ici une
  fois le carnet de notes configuré (Epic 6)."
- Informations tab, two-column grid:
  - **Informations personnelles** card (real, editable): nom, date/lieu de
    naissance, genre, nationalité, adresse, date d'inscription, statut.
  - **Tuteur légal** card (real, editable): up to 2 guardians (matches the
    `StudentFormModal` V1 cap), each with name/relation/phone/email/profession.
  - Right column (Notes/Présences/Activité récente cards) only renders on
    the Informations tab in Banani's HTML despite being visually
    "alongside" — actually re-checking the fetch, the 2-col grid holds
    Info+Guardian (left) and Notes+Presence+Activity (right) simultaneously,
    not tab-gated. **Resolved**: since Notes/Présences depend on unbuilt
    epics, the right column only renders when the "Informations" tab is
    active, replaced by the relevant single empty-state on other tabs
    (cleaner than duplicating the same card in every tab). Activité récente
    also cut — it's an audit-log-style feed with no backing event source
    yet (would need to synthesize from `AdminAction`-style logging that
    doesn't cover student-domain events); flagged for a future pass.

## Component breakdown
- **NEW** `src/app/(school)/eleves/[id]/page.tsx`
- **REUSE** `StudentFormModal` from Students List (create AND edit)
- **REUSE** `Card`, `Badge` pattern, `Avatar`

## Token mapping
Hero gradient background (`linear-gradient(135deg, #6c2bd9 0%, #a855f7 100%)`)
→ inline style (one-off decorative background, not a reusable token).

## Responsive plan
- **375px**: hero content stacks (avatar+info above, stats row below,
  horizontally scrollable if needed); two-col grid → single column; tabs
  row horizontally scrollable.
- **md/lg**: matches Banani desktop.

## Interactions / state
404 (not silently redirect) if the student doesn't belong to the caller's
school — same tenant-isolation pattern as every other Epic 4/5 resource.

## Implementation checklist
- [x] Plan written
- [ ] `GET /api/school/students/[id]` (full profile incl. guardians + current enrollment + homeroom teacher)
- [ ] Page with tab-gated content
- [ ] 375/768/1280 checks
- [ ] Real end-to-end check (open profile, edit via modal, confirm guardian edits persist)

## Open questions for user
None — empty-tab treatment follows the data-model discovery above.
