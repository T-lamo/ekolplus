# Epic 4 — Academic configuration — shared data model

Backs all 4 screens: `classes-config.md`, `matieres-list.md`, `coefficients-config.md`, `affectations.md`.

## Discovery

Fetched all 4 Banani screens before planning. They don't map 1:1 to 4 independent
resources — **Coefficients and Affectations edit the same underlying row**
(class × subject × teacher × coefficient × weekly hours). Evidence: in the
Affectations table, "Mathématiques / 3ème A" shows coefficient `4`; in the
Coefficients screen (tab "3ème A"), "Mathématiques" also shows coefficient `4`
and its "Coefficient autres classes" column lists `3ème B: 4, 4ème A: 4` —
exactly the values Affectations shows for those same class rows. Coefficients
is a per-class *view* of the pivot (edit coefficient only, teacher optional);
Affectations is a cross-class *view* of the same pivot (edit teacher + hours +
coefficient). One table, two UIs.

Matières' per-row "Coefficient" / "Classes" / "Enseignant assigné" columns and
Classes' per-row "Professeur principal" / "Matières" count are aggregates over
the same pivot, grouped the other way.

## New Prisma models

```prisma
model Subject {
  id        String   @id @default(cuid())
  schoolId  String
  school    School   @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  name      String
  code      String?
  domain    String?  // free text label ("Sciences", "Lettres & Langues", ...) — no fixed catalog yet
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  classSubjects ClassSubject[]

  @@index([schoolId])
}

model Teacher {
  id        String   @id @default(cuid())
  schoolId  String
  school    School   @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  name      String
  email     String?
  phone     String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  classSubjects   ClassSubject[]
  homeroomClasses Class[]        @relation("HomeroomTeacher")

  @@index([schoolId])
}

model Class {
  id                String       @id @default(cuid())
  schoolId          String
  school            School       @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  academicYearId    String
  academicYear      AcademicYear @relation(fields: [academicYearId], references: [id], onDelete: Cascade)
  name              String // "3ème A"
  level             String // "3ème" — free text, no fixed catalog yet
  room              String?
  capacity          Int?
  homeroomTeacherId String?
  homeroomTeacher   Teacher?     @relation("HomeroomTeacher", fields: [homeroomTeacherId], references: [id], onDelete: SetNull)
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt

  classSubjects ClassSubject[]

  @@unique([academicYearId, name])
  @@index([schoolId])
}

// The shared pivot — backs Coefficients (per-class edit) and Affectations
// (cross-class edit) at once. One row per (class, subject); teacher/hours/
// coefficient are independently nullable so a subject can be curriculum-
// planned (coefficient set) before a teacher is assigned, matching the
// Banani "Non assigné" / "Non défini" empty states.
model ClassSubject {
  id          String   @id @default(cuid())
  classId     String
  class       Class    @relation(fields: [classId], references: [id], onDelete: Cascade)
  subjectId   String
  subject     Subject  @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  teacherId   String?
  teacher     Teacher? @relation(fields: [teacherId], references: [id], onDelete: SetNull)
  coefficient Int?
  weeklyHours Float?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([classId, subjectId])
  @@index([subjectId])
  @@index([teacherId])
}
```

`School` and `AcademicYear` gain reverse relations (`subjects`, `teachers`,
`classes` / `classes` respectively) — additive, no field changes on existing
models.

## V1 scope cuts (documented, not silently dropped)

Depend on data that doesn't exist yet (Enrollment/Student = Epic 5, Grades =
Epic 6) — dropped from all 4 screens, flagged for later epics:
- Élèves count / capacity fill bar, "moyenne générale" (average grade),
  "Classes incomplètes" tab, "vue grille" toggle — **Classes**
- "Nb. évaluations" per subject — **Matières**
- "Bulletins de la classe" action — **Classes** action menu

Deferred as out-of-scope for this pass (not tied to missing data, just cut
for time — same pattern as Create School's dropped step 2/3):
- CSV export ("Exporter") on all 4 screens
- "Copier vers une classe" bulk-copy — **Coefficients**
- "Voir l'historique des modifications" — **Coefficients**
- "Dupliquer vers une autre classe" — **Affectations**
- "Dupliquer la matière" / "Archiver" — **Matières**
- Multi-select checkboxes + bulk row actions (all tables)
- `Teacher` full CRUD/profile page — **Epic 5's `teachers-list` screen owns
  this**; V1 here only supports create-by-name inline from the Affectations
  form (id + name + optional email), enough to populate the FK.
- "Période" column showing an editable date range — shown read-only from the
  school's active `AcademicYear` label instead (no per-assignment period yet).

## API surface (new routes, all under `resolveMySchool()` + `hasMinRole(.., 'ADMIN')` for mutations, mirroring `/api/school`)

- `GET/POST /api/school/subjects`, `PATCH/DELETE /api/school/subjects/[id]`
- `GET/POST /api/school/teachers` — minimal (list for dropdowns + inline create)
- `GET/POST /api/school/classes`, `PATCH/DELETE /api/school/classes/[id]`
- `GET /api/school/class-subjects` — `?classId=` for one class (Coefficients
  tab), omitted for all classes school-wide (Affectations table)
- `POST /api/school/class-subjects` — upsert on `(classId, subjectId)`,
  partial body (coefficient-only from Coefficients, full from Affectations)
- `DELETE /api/school/class-subjects/[id]`

## Migration naming

Per the lesson from `school-settings.md`: generate with
`prisma migrate dev --name epic4_academic_config --create-only`, rename the
folder to `7_epic4_academic_config` before applying, apply via
`prisma migrate deploy`, then `prisma generate` + **restart the dev server**
before any end-to-end check.
