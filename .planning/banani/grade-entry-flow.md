# Grade Notebook + Grade Entry + Edit Evaluation — Banani → Next.js

## Source
- `grade-notebook` (`AsaJl2Igbuoc`), `grade-entry` (`y4wdrHvC280E`), `edit-evaluation` (`pgYFX9zWSY_5`)
- Fetched: 2026-08-11 — one cohesive workflow, planned together (same
  precedent as Epic 4's 4-screen shared-pivot doc).

## Discovery: the sidebar already anticipated these exact routes
`SchoolSidebar.tsx`'s "Pédagogie" section already links to
`/pedagogie/carnet-de-notes`, `/pedagogie/presences`, `/pedagogie/appreciations`
(dead links until now) — confirms the route naming or from `OVERVIEW.md`
without needing to invent it.

## Discovery: per-evaluation coefficient exists — my Epic 6a average was under-scoped
Edit Evaluation's "Barème et coefficient" section has its own **Coefficient**
field (e.g. "Devoir surveillé n°3" = Coefficient 1), separate from
`ClassSubject.coefficient` (the subject's weight in the *general* average).
Grade Notebook's column headers confirm it: "Devoir 1 · Coeff. 1", "Compo. 1
· Coeff. 2" — evaluations are weighted against each other *within* a
subject, not just averaged flat as Epic 6a's `notes-resultats.md` assumed.
**Retrofitting**: `Evaluation.coefficient` (default 1) added; the Notes
Résultats results endpoint's subject average now weights by this instead of
a flat mean — a strict superset (existing coefficient-1 seed data computes
identically either way, so nothing regresses).

## New fields (not new models — extending Epic 6a's `Evaluation`/`Grade`)
- `Evaluation.coefficient Int @default(1)` — per-evaluation weight within a subject.
- `Evaluation.countsTowardAverage Boolean @default(true)` — "Prise en compte" toggle; a formative/practice evaluation can be recorded without affecting averages.
- `Evaluation.status String @default("DRAFT")` (DRAFT | PUBLISHED) — "Enregistrer brouillon" keeps DRAFT, "Valider les notes" sets PUBLISHED. Read-side (Notes Résultats, Grade Notebook) only counts PUBLISHED evaluations toward averages — a teacher's in-progress draft shouldn't move a student's average before it's finalized.
- `Evaluation.notes String?` — internal remark, admin/teacher-only ("Remarques sur l'évaluation").
- `Grade.comment String?` — per-student per-evaluation teacher note (distinct from `Evaluation.notes`).
- `Grade.absent Boolean @default(false)` — explicit state, not inferred from `score: null` (a not-yet-graded student and an absent student are different things — Grade Notebook's summary bar counts them separately: "22 notés" vs "1 absent").

## New routes
- `/pedagogie/carnet-de-notes` — Grade Notebook. Filters: Classe / Matière (scoped to that class's `ClassSubject` rows — you can't grade a subject the class doesn't take) / Période. "Vue tableau" is the only tab built (Statistiques / Par évaluation have no Banani markup to build from — visible tabs, `toast('… — bientôt disponible')` stub). Kebab per row: Voir le bulletin (Epic 7 stub), Modifier les notes → `/saisie`, Historique des notes (stub — no audit trail model), Ajouter appréciation (stub — belongs to the separate `appreciations` screen, not fetched), Contacter le tuteur (stub — no messaging), Supprimer les notes (real — clears that student's grades for the shown evaluations).
- `/pedagogie/carnet-de-notes/[evaluationId]/saisie` — Grade Entry step 2 body. One row per enrolled student: score input, absent toggle, live preview average (this evaluation's score blended into the student's existing subject average), comment field. Footer stats (notés/moy. provisoire/max/min/absents) computed from current in-memory form state, not re-fetched per keystroke. "Tout marquer absent" / "Effacer tout" real bulk client-state actions. "Enregistrer brouillon" and "Valider les notes" both PUT the grades; only "Valider" also PATCHes the evaluation to `status: PUBLISHED`.
- `/pedagogie/carnet-de-notes/[evaluationId]/edit` — Edit Evaluation. Same config fields Grade Entry's step 1 collects (reused as `EvaluationConfigForm`), pre-filled, plus delete. "Enseignant responsable" is read-only display of the `ClassSubject.teacher` (Epic 4 data) — not a new field on `Evaluation`, since who teaches the subject is already a class-level fact.
- New evaluation creation is a **modal**, not Banani's separate step-1-page — `NewEvaluationModal` on Grade Notebook's "Saisir des notes" button collects the same fields, `POST`s, then routes to `/saisie`. Functionally identical to Banani's step 1, translated to this codebase's established `FormModal` convention (every other Epic 4/5/6 create-flow is a modal, not a dedicated page) rather than introducing a new pattern for one screen.
- Wizard step 3 "Confirmation" has no Banani markup (only the step-bar shows it "pending") — not built; "Valider les notes" redirects to Grade Notebook with a success toast instead of a fabricated confirmation screen.

## API surface
- `PATCH/DELETE /api/school/evaluations/[id]` (new — Epic 6a only had create/list).
- `PUT /api/school/evaluations/[id]/grades` extended to accept `comment`/`absent` per row (additive, backward compatible).
- `GET /api/school/class-subjects/[id]/notebook?termId=` (new) — the Grade Notebook read model: evaluations for that classSubject+term, every enrolled student's per-evaluation scores + weighted subject average + rank + absent/comment.
- Epic 6a's `GET /api/school/students/[id]/results` per-subject average updated to weight by `Evaluation.coefficient` and skip non-`PUBLISHED`/non-`countsTowardAverage` evaluations.

## V1 scope cuts
- Statistiques / Par évaluation tabs (Grade Notebook) — no Banani markup.
- CSV import (Grade Entry) — same "needs real validation, V2" reasoning as Students/Teachers list imports.
- Historique des notes / Ajouter appréciation / Contacter le tuteur (kebab items) — depend on models/screens not built (audit trail, `appreciations` screen, messaging).
- "Affichage" column-visibility dropdown — no content specified in the Banani source for what it toggles.

## Implementation checklist
- [x] Plan written
- [ ] Schema: `Evaluation` +4 fields, `Grade` +2 fields, migration
- [ ] `PATCH/DELETE /api/school/evaluations/[id]`
- [ ] `GET /api/school/class-subjects/[id]/notebook`
- [ ] Extend grades PUT (comment/absent)
- [ ] Retrofit `results/route.ts` averaging (coefficient + PUBLISHED-only)
- [ ] `EvaluationConfigForm` (shared by modal + edit page)
- [ ] Grade Notebook page
- [ ] Grade Entry (`/saisie`) page
- [ ] Edit Evaluation (`/edit`) page
- [ ] Verify + seed + commit
