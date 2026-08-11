# Teachers List — Banani → Next.js

## Source
- Banani screen ID: `OyxtQcFdbEC9`
- Fetched: 2026-08-11

Data model: see [epic-5-data-model.md](./epic-5-data-model.md). This is the
most real of the 3 Epic 5 screens — Matière(s)/Classes assignées/Heures per
week are all derived from `ClassSubject` rows Epic 4 already created;
only the `status` employment field (Actif/En congé/Inactif) is new.

## Route
`/enseignants` — same shell/auth pattern.

## Structure map
- Page header: title + subtitle. Actions: Importer (stub), Exporter (real), Ajouter un enseignant (extends Epic 4's minimal create modal with email/phone/status).
- Filters: search + Matière dropdown (real, from `/api/school/subjects`) + Statut dropdown (real) + view toggle. Drop "Trier par" (same reasoning as Students List).
- Table: Enseignant (avatar + name + `#EN-...` derived from id, no separate
  numbering scheme needed since Teacher has no student-style enrollment
  concept) / Matière(s) (badges, distinct subjects from `ClassSubject`) /
  Classes assignées (comma list, distinct classes from `ClassSubject`) /
  Statut (badge, real `status` field) / Heures/sem. (real, `SUM(weeklyHours)`
  across their `ClassSubject` rows) / Contact (email) / row actions (eye→
  toast stub — no dedicated teacher-profile page this pass, Student Profile
  set the pattern but a mirror Teacher Profile is out of scope for this
  round; pencil→edit modal; kebab: Voir le profil[stub], Modifier, Gérer
  les affectations[real link to `/configuration/affectations`], Voir les
  présences[stub, Epic 8], Envoyer un message[stub, no messaging system],
  divider, Désactiver[real, toggles `status`↔`INACTIVE`], Supprimer[real,
  blocked 409 if the teacher still has `ClassSubject`/homeroom references,
  same guard pattern as Subject/Class]).

## Component breakdown
- **NEW** `src/app/(school)/enseignants/page.tsx`
- **NEW** `src/app/(school)/enseignants/TeacherFormModal.tsx` — extends the
  Epic 4 inline-create shape (name/email/phone) with `status` select
- **REUSE** `Card`, `Select`, `Button`, `Modal`, `Avatar`, `ActionMenu`, `exportToCsv`

## Token mapping
Same as the rest of Epic 4/5 — no new tokens.

## Responsive plan
Same as Students List / Classes.

## Interactions / state
Delete guarded server-side (409) if the teacher still has `ClassSubject`
rows or is a `Class.homeroomTeacherId` — mirrors the Subject/Class delete
guard already established.

## Implementation checklist
- [x] Plan written
- [ ] `PATCH /api/school/teachers/[id]` (Epic 4 only had list+create)
- [ ] `DELETE /api/school/teachers/[id]` (new — Epic 4 never needed it)
- [ ] Page + form modal
- [ ] 375/768/1280 checks
- [ ] Real end-to-end check (edit status, verify Heures/sem. matches seeded ClassSubject data, delete-guard 409)

## Open questions for user
None.
