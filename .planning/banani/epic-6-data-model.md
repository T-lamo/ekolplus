# Epic 6 — Grades / évaluations — data model

## Source
Only one screen selected this pass: `notes-resultats` (Banani screen ID
`7c3XE9G80S3x`, screenName "Notes Résultats"). The other 4 Epic 6 screens
(`grade-notebook`, `grade-entry`, `edit-evaluation`, `appreciations`) remain
pending — not fetched this pass.

## Discovery: "Notes Résultats" is not a standalone route

The fetched HTML reproduces the full `/eleves/[id]` page chrome (sidebar,
topbar, page-header, profile-hero, 5-tab row) with "Notes & Résultats"
active. This is Banani's "Separate Screen Regen" flow re-rendering each tab
as its own screen — it is **not** a new route. The real target is the
`tab === 'grades'` branch in `src/app/(school)/eleves/[id]/page.tsx`,
currently an `EmptyTab` stub. The existing hero/tabs shell (built in Epic 5)
is reused as-is; only the tab body changes, plus 2 of the hero's 4 stats
(Moyenne générale, Rang de classe) go from `—` to real computed values now
that grade data exists (Taux de présence / Absences ce trimestre stay `—`
until Epic 8).

## New Prisma models

```prisma
model Evaluation {
  id             String       @id @default(cuid())
  classSubjectId String
  classSubject   ClassSubject @relation(fields: [classSubjectId], references: [id], onDelete: Cascade)
  termId         String
  term           Term         @relation(fields: [termId], references: [id], onDelete: Cascade)
  label          String // "DS 1", "Interro", teacher-authored free text
  type           String @default("AUTRE") // DS | INTERROGATION | EXAMEN | AUTRE — display/icon only
  maxScore       Int    @default(20)
  order          Int    @default(0) // left-to-right column order within a subject
  date           DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  grades Grade[]

  @@index([classSubjectId, termId, order])
}

model Grade {
  id           String     @id @default(cuid())
  evaluationId String
  evaluation   Evaluation @relation(fields: [evaluationId], references: [id], onDelete: Cascade)
  studentId    String
  student      Student    @relation(fields: [studentId], references: [id], onDelete: Cascade)
  score        Float? // null = not yet graded / absent
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  @@unique([evaluationId, studentId])
  @@index([studentId])
}

model Goal {
  id          String   @id @default(cuid())
  studentId   String
  student     Student  @relation(fields: [studentId], references: [id], onDelete: Cascade)
  termId      String
  term        Term     @relation(fields: [termId], references: [id], onDelete: Cascade)
  subjectId   String?  // null = "Moyenne générale" (overall) goal
  subject     Subject? @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  targetScore Float
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([studentId, termId, subjectId])
  @@index([studentId, termId])
}
```

`Evaluation` hangs off `ClassSubject` (the Epic 4 shared pivot), not off
`Class`+`Subject` directly — same rationale as Epic 4: one evaluation
naturally belongs to "this subject, taught in this class, this term."
`Grade` is per-student per-evaluation, nullable score (absence / not yet
graded is a real state, not a fabricated 0).

`Goal.subjectId` nullable + `@@unique([studentId, termId, subjectId])`: Postgres
treats each NULL as distinct, so the DB constraint doesn't block two
"overall" rows for the same student+term. The API enforces "at most one
overall goal per student+term" itself (`findFirst` by `subjectId: null` →
update-or-create) rather than relying on the DB — acceptable for a
low-traffic, single-editor feature; a real discriminator column would be
over-engineering for what's one progress bar.

## Key computation decisions

**Evaluation columns are dynamic, not fixed "DS1/DS2/Interro".** Banani's
mock happens to show exactly 3 score columns for every subject, but a real
school's evaluation count varies per subject per term (PE might have 1
practical eval, Maths might have 4). Hardcoding 3 named columns would break
the moment real data doesn't match the demo. Instead: the results endpoint
returns, per subject, its own ordered list of `{label, score, maxScore}`;
the table renders `max(evaluation count across the student's subjects this
term)` columns, headered generically ("Éval. 1", "Éval. 2", …) with the
real label surfaced via `title=` on each cell. Visually identical to Banani
in the common case (all subjects have the same count); doesn't fabricate
column semantics when they diverge.

**Moy. matière** = simple arithmetic mean of that subject's evaluation
scores for the selected period (unweighted across evaluations — no
per-evaluation weight concept exists in the model, matching what Banani's
UI actually exposes: no per-column weight indicator).

**Moyenne générale pondérée** (overall) = `ClassSubject.coefficient`-weighted
average of the student's subject averages, over subjects that have ≥1
graded evaluation this period. Standard French school formula.

**Verified against Banani's own numbers — they don't reconcile.**
Recomputing Banani's mock "Moyenne générale pondérée" (9.3) from its own
displayed per-subject averages and coefficients via the formula above gives
10.1, not 9.3; a couple of individual "Moy. matière" cells (e.g. Sciences:
12.0/10.5/11.0 → arithmetic mean 11.17, displayed as 11.0) don't reconcile
either. This confirms — consistent with Epic 4's teacher-hours mock also
not summing cleanly — **Banani's demo numbers are hand-typed illustrative
values, not the output of a real formula.** I implemented the correct,
standard formula rather than reverse-engineering one to match numbers that
aren't internally consistent in the source.

**Moy. classe** (per subject) = arithmetic mean of every enrolled
classmate's subject average, over classmates with ≥1 graded evaluation for
that subject this period.

**Tendance** (trend) = this-period subject average vs. the immediately
preceding `Term` (by `order`, same `AcademicYear`). No prior-term data (T1,
or prior term ungraded) → neutral "—", not a fabricated flat arrow.

**Appréciation** (per-subject label) is auto-computed from the subject
average via a fixed bucket scale (`<8` Faible, `8–<10` Insuffisant, `10–<11`
Passable, `11–<12` Assez bien, `12–<14` Bien, `≥14` Très bien) — a
deterministic function of real data, not a teacher-authored comment. Teacher
free-text appreciation is the separate `appreciations` screen (Epic 6,
not yet fetched) — out of scope this pass.

**Ranking** = every classmate's overall weighted average (same formula
above) for the period, sorted descending; students with zero graded
evaluations are excluded from the ranking entirely (not ranked last at 0 —
that would fabricate a data point that doesn't exist).

**"Tous les trimestres"** filter option = same computations with the term
filter dropped, pooling every evaluation whose `Term.academicYearId`
matches the selected year (so it doesn't require yet another aggregation
path — it's the same query without the extra `termId` predicate).

**"Objectifs de trimestre" card is real, not a stub.** Cheap enough
(`Goal` model above) that faking the "Définir" button would have been worse
than just building it — same call as Epic 4's Subject archive toggle.
Progress bars compute `min(100, current / target * 100)`; "Non défini" shown
when no `Goal` row exists for that subject/term yet, rather than a fake 0.

**"Alerte pédagogique"** card is fully derived (subjects with average < 8
this period) — no new model, computed alongside everything else in the same
results query. Hidden entirely (not shown empty) when 0 subjects qualify.

## API surface

- `POST /api/school/evaluations` / `GET /api/school/evaluations?classSubjectId=&termId=` —
  needed now so a seed script can create realistic grade data via the real
  API (same precedent as every prior epic's seed script), and consumed
  as-is by `grade-notebook`/`grade-entry` when those screens are built next.
- `PUT /api/school/evaluations/[id]/grades` — bulk upsert
  `{grades: [{studentId, score}]}` for every student enrolled in that
  evaluation's class.
- `GET /api/school/students/[id]/results?academicYearId=&termId=` — the
  Notes Résultats read model: per-subject breakdown, overall average, rank,
  best/worst subject, alert subjects, available years/terms for the filter
  dropdowns. `termId` omitted = whole-year aggregate.
- `GET /api/school/students/[id]/goals?termId=` / `PUT` (upsert one goal).

## V1 scope cuts

- `grade-notebook`, `grade-entry`, `edit-evaluation`, `appreciations`
  screens — not fetched this pass, so no dedicated entry UI exists yet;
  evaluations/grades are created via the API directly (seed script), same
  as every prior "backend before its own admin screen" precedent in this
  project.
- Teacher-authored free-text appreciation (separate from the auto-computed
  per-subject label above) — belongs to the `appreciations` screen.
- Print (`Imprimer` button in the page header) is real (`window.print()`) —
  zero-cost, not worth stubbing.
