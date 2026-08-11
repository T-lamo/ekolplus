# Epic 5 — People (Élèves & Enseignants) — shared data model

Backs `students-list.md`, `student-profile.md`, `teachers-list.md`.

## Discovery

Student Profile (`IOcz_ptC61M8`) is far more Epic-6/7/8-coupled than any
screen so far: 4 of its 5 tabs are entirely grade/attendance/appreciation/
bulletin data that doesn't exist (Notes & Résultats, Présences,
Appréciations, Bulletins), and even the hero stats (Moyenne générale, Taux
de présence, Absences ce trimestre, Rang de classe) are all derived from
that same missing data. Only the **Informations** tab (personal info +
guardians) and the surrounding shell (avatar, name, class, homeroom
teacher — all real Epic 4/5 data) are self-contained.

Resolution — consistent with the Epic 4 "honest placeholder, not fabricated
data" precedent, extended one step further: individual missing *data points*
get `—`; entire missing *tabs* get a clean "Disponible avec Epic X" empty
state rather than a fake table full of dashes (a dash in one cell reads as
"not tracked yet"; an entire table of dashes reads as broken).

Students List (`irP1FJzNcIpq`) has the same Moyenne/Présence column problem
at table scale — same `—` treatment as Classes' Moyenne générale.

Teachers List (`OyxtQcFdbEC9`) is the one screen in this epic that's almost
entirely real: Matière(s)/Classes assignées/Heures per week are all
derivable from the `ClassSubject` rows Epic 4 already created. Only "En
congé" needs a new field (Teacher had no employment-status concept before).

## New Prisma models

```prisma
model Student {
  id            String   @id @default(cuid())
  schoolId      String
  school        School   @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  studentNumber String   // "EL-2024-001" — generated at creation, sequential per school
  firstName     String
  lastName      String
  dateOfBirth   DateTime
  placeOfBirth  String?
  gender        String?  // free text, no fixed catalog yet
  nationality   String?
  address       String?
  enrolledAt    DateTime @default(now())
  status        String   @default("ENROLLED") // ENROLLED | REPEATED_ABSENCES | SUSPENDED
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  guardians   Guardian[]
  enrollments Enrollment[]

  @@index([schoolId])
}

model Guardian {
  id           String  @id @default(cuid())
  studentId    String
  student      Student @relation(fields: [studentId], references: [id], onDelete: Cascade)
  name         String
  relationship String  // "Père" | "Mère" | "Tuteur" — free text
  phone        String?
  email        String?
  profession   String?
  isPrimary    Boolean @default(false)
  createdAt    DateTime @default(now())

  @@index([studentId])
}

// The model OVERVIEW.md flagged from the start as "the single highest-
// leverage decision in the whole schema" — a student's class membership is
// year-scoped so promotion doesn't corrupt prior years' historical bulletins.
model Enrollment {
  id             String       @id @default(cuid())
  studentId      String
  student        Student      @relation(fields: [studentId], references: [id], onDelete: Cascade)
  classId        String
  class          Class        @relation(fields: [classId], references: [id], onDelete: Cascade)
  academicYearId String
  academicYear   AcademicYear @relation(fields: [academicYearId], references: [id], onDelete: Cascade)
  enrolledAt     DateTime     @default(now())

  @@unique([studentId, academicYearId])
  @@index([classId])
}
```

`Teacher` gains one field (additive, no migration risk to Epic 4 code):

```prisma
status String @default("ACTIVE") // ACTIVE | ON_LEAVE | INACTIVE
```

Kept separate from the existing `isActive` boolean — `isActive` still
drives the Epic 4 `TeacherPicker` (hide from assignment dropdowns);
`status` is purely the new Teachers List "Statut" display column. Two
fields for two different questions ("should this teacher be pickable" vs.
"what's their current employment state") rather than overloading one.

`School`/`Class`/`AcademicYear` gain reverse relations (`students`,
`enrollments` ×2) — additive.

## V1 scope cuts (documented, not silently dropped)

Entire tabs deferred as clean empty states (not fake data), each pointing
at the epic that unblocks it:
- Student Profile: **Notes & Résultats**, **Appréciations** → Epic 6
- Student Profile: **Présences** → Epic 8
- Student Profile: **Bulletins** → Epic 7
- Student Profile hero stats (Moyenne générale / Taux de présence /
  Absences ce trimestre / Rang de classe) → same epics, shown as `—`

Cut for time, not data-dependency:
- CSV **Importer** on Students List / Teachers List — button present,
  wired to a `toast('bientôt disponible')` (unlike Exporter, which is a
  real feature reused from Epic 4's `exportToCsv`). Bulk student import
  from a spreadsheet is materially harder than export (validation,
  duplicate detection, error reporting) — a real V2, not a quick add.
- "Trier par" dropdown on both list screens — cosmetic in Banani too (no
  visible effect on row order in the mockup); skipped rather than building
  a sort menu for marginal value.
- Multi-select checkboxes + bulk row actions (both tables).
- Student photo / guardian photo upload — Cloudinary is wired for the
  starter but not connected to a person-photo flow yet; `Avatar` (initials)
  from Epic 4's pixel-fidelity pass covers this consistently.
- "Envoyer un message" (Teachers List action) — no messaging system exists;
  toast stub.
- Grid view for Students/Teachers — **built for real**, same pattern as
  Classes' grille/liste toggle (not cut, since the user has twice now
  flagged fake/missing toggles as a fidelity gap).

## API surface (new routes, `resolveMySchool()` + `hasMinRole(.., 'ADMIN')` for mutations)

- `GET/POST /api/school/students` — list (with current-year Enrollment →
  class, guardians) / create (student + up to 2 guardians + Enrollment in
  one transaction)
- `GET/PATCH/DELETE /api/school/students/[id]` — full profile / update /
  delete (cascades guardians+enrollments)
- `PATCH /api/school/teachers/[id]` — new (Epic 4 only had list+create);
  needed for the Statut/contact edits Teachers List's kebab menu performs

## Migration naming

Per the established lesson: `prisma migrate dev --name epic5_people
--create-only`, rename to `8_epic5_people`, `prisma migrate deploy`,
`prisma generate`, **restart the dev server** before any end-to-end check.
