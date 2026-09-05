# Livret préscolaire et modèle par niveau Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each grade level (`GradeLevel`) pick its own bulletin template (falling back to the school's default, then the oldest global template), and ship a global "Livret préscolaire" template that reproduces `bulletin_template/Bulletin prescolaire.docx` exactly, using the pages/blocks engine and qualitative subjects both already shipped.

**Architecture:** Add a nullable `Class.gradeLevelId` FK and a nullable `GradeLevel.bulletinTemplateId` FK (both `onDelete: SetNull`, purely additive — `Class.level` stays the free-text field it always was). Wire the class form to send `gradeLevelId` alongside `level`, extend the Configuration › Niveaux screen with a per-level "Modèle de bulletin" selector, extend `getStudentBulletinView`'s template resolution to check the enrolled class's grade level first, and seed a 4th global `BulletinTemplate` ("Livret préscolaire") plus a full "Kindergarten" grade level/class/qualitative-subjects/students dataset in the dev seed so the feature is demonstrable end-to-end.

**Tech Stack:** Next.js 16 App Router, Prisma 5 + Neon Postgres, Zod, Vitest + `vitest-mock-extended` (`prismaMock`), next-intl (fr/ht/en), Tailwind v4, Radix `Select` (via `@/components/school/subjects/form-primitives`'s `BareSelect`/`SelectItem`).

**Spec:** `docs/superpowers/specs/2026-09-05-bulletin-prescolaire-et-pages-design.md` — this plan implements §8 (modèle de bulletin par niveau) and §12 (le modèle « Livret préscolaire »), plus the parts of §13 (migration, `backfill-class-grade-level.ts`, `seed-bulletin-templates.ts`, `seed-dev-school.ts`) and §14 (tests, final visual verification) that belong to this plan. Plan 1 ("Matières qualitatives", §4-§7) and Plan 2 ("Moteur de pages", §9-§11, backfill `blocks → pages`) are already merged to local `develop` and are consumed here as-is — this plan does not modify any file those two plans own except where explicitly named below (i18n content only, never their code).

## Global Constraints

- Before every commit: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` must all pass (repo standard, `CLAUDE.md`).
- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` — never silence with `any`.
- Conventional Commits; small, frequent commits (one per step group, not one per task).
- No AI-tell copy anywhere user-facing (no em dash `—` in UI strings, email templates, PDF/report-card text) — use `.`, `,`, `:`, or `·`.
- `Class.level` (free-text) is never renamed or removed — `gradeLevelId` is purely additive alongside it.
- The migration for this plan is hand-written (never `prisma migrate dev` / `db push` against the shared dev database) — see Ruling R6. Only `prisma generate` (schema-only, no DB connection) runs during this plan's own task execution; the real `prisma db execute` + `prisma migrate resolve --applied` happens at merge time, by the human partner.
- `PATCH /api/school/grade-levels/[id]`'s `bulletinTemplateId` must resolve to a template that is either this school's own or global (`schoolId: null`) — else 404 `TEMPLATE_NOT_FOUND` (spec §8).
- Template resolution order in `getStudentBulletinView`: the enrolled class's `gradeLevel.bulletinTemplate` → the school's `isActive` template → the oldest global template (spec §8/§12).
- The UI label for `BulletinTemplate.isActive` becomes "Modèle par défaut" (and locale equivalents) everywhere it is shown (gallery card badge, active banner, activation menu item) — content-only change, the field name and API contract are untouched (spec §8).
- Every one of the "Livret préscolaire" template's block/page ids must be unique across its own `config` (the pages/blocks engine's existing config-wide uniqueness rule, unchanged from Plan 2).

## Rulings

**R1 — Kindergarten is seeded outside the generic `LEVELS`/`CLASSES`/`SUBJECTS` pipelines.** `scripts/seed-dev-school.ts`'s per-class birth-year formula (`11 + LEVELS.indexOf(level)`) assumes a 6ème→Terminale ladder; `GradeLevel.order` must be `0` for Kindergarten per spec while `LEVELS.map((n,i)=>({order:i+1}))` would either shift every existing level's order by one (if prepended) or place Kindergarten last (if appended); and any subject whose `levels` array includes a level in `CLASSES` automatically gets a numeric `Evaluation`/`Grade` row from the generic per-class loop, which a qualitative subject must never have. One dedicated, self-contained block (grade level, class, 3 qualitative subjects + their criteria, 6 students, criteria ratings, one general appreciation each) sidesteps all three issues without touching `LEVELS`, `CLASSES`, `SUBJECTS`, `buildTimetable`, fee/attendance seeding, or `seed-dev-school.test.ts`'s direct imports of those arrays. Cost if wrong: Kindergarten would need its own birth-year/order special-case sprinkled through the generic pipeline instead of living in one place — a refactor, not a data bug, and easy to spot since `pnpm test`'s existing `buildTimetable`/seed tests would still pass either way.

**R2 — `TEMPLATE_IN_USE` only queries the caller's own school's grade levels.** `DELETE /api/school/bulletin-templates/[id]` already 404s when `tpl.schoolId !== mySchool.schoolId`, so a global template can never reach this guard; and `PATCH /api/school/grade-levels/[id]` only ever accepts a `bulletinTemplateId` that is the caller's own school's template or a global one, so a school's own forked template can only ever be referenced by that same school's levels. No cross-school lookup is needed. Cost if wrong: a template deletable in one school could theoretically leave a dangling reference in another — but `onDelete: SetNull` makes that self-healing even in the worst case, never a broken reference.

**R3 — `PATCH /api/school/grade-levels/[id]` gets its own new body schema, not a widened `LevelNameBody`.** `LevelNameBody` (in `route.ts`) is shared with `POST`, where `name` must stay required — widening it to make `name` optional would silently accept an empty `POST` body. A new `PatchLevelBody` (in `[id]/route.ts`) makes both `name` and `bulletinTemplateId` optional, refined to require at least one. Cost if wrong: a genuinely bounded, mechanical fix (rename one schema) if this turns out to be the wrong call.

**R4 — `gradeLevelId` is derived at class-form submit time, not tracked as its own form field.** The level `<select>` already commits to a catalog NAME (or a free-text "other" escape hatch with no catalog id at all) — the matching `GradeLevel.id`, if any, is a pure function of that already-existing state. This keeps `ClassForm.tsx`'s JSX, `ClassFormValues`, `initialValues()`, and `classSectionsDone()` completely untouched; only `useClassFormData.ts` (expose the id/name rows) and `useClassForm.ts`'s `submit()` (look up the id, add it to the request body) change. Cost if wrong: a small, contained rework of one lookup, not a form-state migration.

**R5 — the `isActive` → "Modèle par défaut" relabeling is content-only.** Every changed string lives in `frontend/src/messages/{fr,ht,en}/configuration.json`; no `.tsx` file changes, since every call site already reads its copy through `t('...')`. Cost if wrong: purely cosmetic, a follow-up content fix.

**R6 — the migration is hand-written; only `prisma generate` runs during task execution.** Matches spec §13's own stated deployment order ("migration, puis code, puis les deux backfills") and this repo's established handling of a shared, always-on dev database (see Global Constraints). `prisma generate` reads only `schema.prisma` — it never opens a database connection — so every later task's TypeScript compiles and every test (all of which mock `prisma`) runs correctly without the real dev database ever seeing the new columns during this plan's execution. Cost if wrong: the human partner needs an extra manual step at merge time (already expected and already spec'd) rather than nothing.

**R7 — the Kindergarten teacher and classroom are one more entry each in the existing `TEACHERS`/`ROOMS` arrays.** Both arrays already drive fully generic creation loops with zero per-entry special-casing, so appending gets a real `Teacher` row (with an emailed identity) and a catalogued `Room` for free, with no new code. Cost if wrong: trivial to pull out into dedicated `prisma.teacher.create`/`prisma.room.create` calls later.

## File Map

| File | Responsibility |
|---|---|
| `frontend/prisma/schema.prisma` | `Class.gradeLevelId`, `GradeLevel.bulletinTemplateId` + inverse relations |
| `frontend/prisma/migrations/39_bulletin_template_per_grade_level/migration.sql` | Hand-written migration for the two new columns |
| `frontend/src/app/api/school/classes/route.ts` | `CreateClassBody` gains `gradeLevelId`, validated + persisted |
| `frontend/src/app/api/school/classes/[id]/route.ts` | `UpdateClassBody` gains `gradeLevelId`, validated + persisted |
| `frontend/src/components/school/classes/useClassFormData.ts` | Exposes `levelCatalogRows` (id+name) alongside the existing `levelCatalog` |
| `frontend/src/components/school/classes/useClassForm.ts` | `submit()` resolves and sends `gradeLevelId` |
| `frontend/src/app/(school)/configuration/classes/nouvelle/page.tsx`, `[id]/page.tsx` | Thread `levelCatalogRows` from the data hook into `useClassForm` |
| `frontend/src/app/api/school/grade-levels/route.ts` | `LEVEL_SELECT` gains `bulletinTemplateId` |
| `frontend/src/app/api/school/grade-levels/[id]/route.ts` | New `PatchLevelBody`; `PATCH` accepts `bulletinTemplateId`; stale FK comment fixed |
| `frontend/src/app/api/school/grade-levels/route.test.ts` | New/updated tests for the above |
| `frontend/src/app/(school)/configuration/classes/types.ts` | `GradeLevelRow` gains `bulletinTemplateId` |
| `frontend/src/app/(school)/configuration/niveaux/page.tsx` | Per-level "Modèle de bulletin" selector |
| `frontend/src/messages/{fr,ht,en}/configuration.json` | New `niveaux.*` keys; `modeleBulletin.*` isActive relabeling + new `toast.deleteInUseError` |
| `frontend/src/app/api/school/bulletin-templates/[id]/route.ts` | `DELETE` gains `TEMPLATE_IN_USE` (409) |
| `frontend/src/app/(school)/configuration/modele-bulletin/page.tsx` | `remove()` handles `TEMPLATE_IN_USE` |
| `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts` | Template resolution: level → school default → global |
| `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.test.ts` | New resolution-order tests |
| `frontend/scripts/backfill-class-grade-level.ts` + `.test.ts` | New backfill script, mirrors the existing backfill pattern |
| `frontend/package.json` | New `db:backfill-class-grade-level` script |
| `frontend/scripts/seed-bulletin-templates.ts` + `.test.ts` | New global "Livret préscolaire" template |
| `frontend/scripts/seed-dev-school.ts` | Kindergarten level/class/subjects/students/criteria/appreciation + template assignment |
| `CLAUDE.md` | One paragraph documenting the per-level template resolution + Livret préscolaire |

---

### Task 1: Prisma schema + migration

**Files:**
- Modify: `frontend/prisma/schema.prisma` (`Class` model ~line 492-522, `GradeLevel` model ~line 271-282, `BulletinTemplate` model ~line 885-900)
- Create: `frontend/prisma/migrations/39_bulletin_template_per_grade_level/migration.sql`

**Interfaces:**
- Produces: `Class.gradeLevelId: string | null`, `Class.gradeLevel: GradeLevel | null` relation; `GradeLevel.bulletinTemplateId: string | null`, `GradeLevel.bulletinTemplate: BulletinTemplate | null` relation; `GradeLevel.classes: Class[]`; `BulletinTemplate.gradeLevels: GradeLevel[]`. Every later task consumes these.

- [ ] **Step 1: Edit the `GradeLevel` model**

In `frontend/prisma/schema.prisma`, replace the `GradeLevel` model:

```prisma
model GradeLevel {
  id        String   @id @default(cuid())
  schoolId  String
  school    School   @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  name      String
  order     Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([schoolId, name])
  @@index([schoolId, order])
}
```

with:

```prisma
model GradeLevel {
  id        String   @id @default(cuid())
  schoolId  String
  school    School   @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  name      String
  order     Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Modèle de bulletin assignable par niveau (spec 2026-09-05 §8) — repli sur
  // le modèle actif de l'école puis le plus ancien modèle global si absent
  // (voir getStudentBulletinView).
  bulletinTemplateId String?
  bulletinTemplate   BulletinTemplate? @relation(fields: [bulletinTemplateId], references: [id], onDelete: SetNull)
  classes            Class[]

  @@unique([schoolId, name])
  @@index([schoolId, order])
  @@index([bulletinTemplateId])
}
```

- [ ] **Step 2: Edit the `Class` model**

Replace:

```prisma
  room              String?
  roomId            String?
  roomRef           Room?        @relation(fields: [roomId], references: [id], onDelete: SetNull)
  capacity          Int?
```

with:

```prisma
  room              String?
  roomId            String?
  roomRef           Room?        @relation(fields: [roomId], references: [id], onDelete: SetNull)
  // Niveau scolaire (catalogue) — `level` reste le libellé affiché, non
  // supprimé ; ce lien est ce qui permet de résoudre un modèle de bulletin
  // par niveau (spec 2026-09-05 §8). Nullable : une classe créée avant ce
  // champ, ou dont le niveau ne correspond à aucune entrée du catalogue,
  // reste sans lien tant que backfill-class-grade-level.ts ou une
  // ré-affectation manuelle ne le remplit pas.
  gradeLevelId      String?
  gradeLevel        GradeLevel?  @relation(fields: [gradeLevelId], references: [id], onDelete: SetNull)
  capacity          Int?
```

and replace:

```prisma
  @@unique([academicYearId, name])
  @@index([schoolId])
  @@index([roomId])
}
```

with:

```prisma
  @@unique([academicYearId, name])
  @@index([schoolId])
  @@index([roomId])
  @@index([gradeLevelId])
}
```

- [ ] **Step 3: Edit the `BulletinTemplate` model**

Replace:

```prisma
model BulletinTemplate {
  id           String             @id @default(cuid())
  schoolId     String?
  school       School?            @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  name         String
  description  String?
  isActive     Boolean            @default(false)
  forkedFromId String?
  forkedFrom   BulletinTemplate?  @relation("TemplateFork", fields: [forkedFromId], references: [id], onDelete: SetNull)
  forks        BulletinTemplate[] @relation("TemplateFork")
  config       Json
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt

  @@index([schoolId])
}
```

with:

```prisma
model BulletinTemplate {
  id           String             @id @default(cuid())
  schoolId     String?
  school       School?            @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  name         String
  description  String?
  isActive     Boolean            @default(false)
  forkedFromId String?
  forkedFrom   BulletinTemplate?  @relation("TemplateFork", fields: [forkedFromId], references: [id], onDelete: SetNull)
  forks        BulletinTemplate[] @relation("TemplateFork")
  config       Json
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt

  gradeLevels GradeLevel[]

  @@index([schoolId])
}
```

- [ ] **Step 4: Write the migration by hand**

Create `frontend/prisma/migrations/39_bulletin_template_per_grade_level/migration.sql`:

```sql
-- Modèle de bulletin par niveau (spec 2026-09-05 §8) : Class.gradeLevelId
-- (catalogue, `level` reste le libellé affiché) et
-- GradeLevel.bulletinTemplateId (repli : niveau -> défaut école -> global).
-- Écrite à la main (jamais migrate dev / db push sur la base partagée) —
-- appliquée au merge : prisma db execute + prisma migrate resolve --applied
-- + prisma generate.

-- AlterTable
ALTER TABLE "GradeLevel" ADD COLUMN "bulletinTemplateId" TEXT;
CREATE INDEX "GradeLevel_bulletinTemplateId_idx" ON "GradeLevel"("bulletinTemplateId");
ALTER TABLE "GradeLevel" ADD CONSTRAINT "GradeLevel_bulletinTemplateId_fkey" FOREIGN KEY ("bulletinTemplateId") REFERENCES "BulletinTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Class" ADD COLUMN "gradeLevelId" TEXT;
CREATE INDEX "Class_gradeLevelId_idx" ON "Class"("gradeLevelId");
ALTER TABLE "Class" ADD CONSTRAINT "Class_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Before creating the folder, run `ls frontend/prisma/migrations | grep '^39_'` to confirm no `39_*` migration has appeared since this plan was written (mirrors the check Plan 1 did for `38_*`); renumber to `40_` if one has.

- [ ] **Step 5: Regenerate the Prisma client (schema-only, no DB connection)**

Run: `pnpm --filter frontend exec prisma generate`
Expected: `✔ Generated Prisma Client` — no database connection is opened by this command.

- [ ] **Step 6: Verify the client typechecks**

Run: `pnpm typecheck`
Expected: PASS (no consumer references the new fields yet, so nothing new to break).

- [ ] **Step 7: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/39_bulletin_template_per_grade_level
git commit -m "feat(bulletin): schema for per-grade-level bulletin templates"
```

---

### Task 2: Wire `gradeLevelId` through the class form

**Files:**
- Modify: `frontend/src/app/api/school/classes/route.ts:74-88,167-194`
- Modify: `frontend/src/app/api/school/classes/[id]/route.ts:20-33`
- Modify: `frontend/src/components/school/classes/useClassFormData.ts`
- Modify: `frontend/src/components/school/classes/useClassForm.ts:130-149,304-336`
- Modify: `frontend/src/app/(school)/configuration/classes/nouvelle/page.tsx:31,46-52`
- Modify: `frontend/src/app/(school)/configuration/classes/[id]/page.tsx` (the `useClassFormData`/`useClassForm` call site, same shape as `nouvelle/page.tsx`)
- Test: `frontend/src/app/api/school/classes/route.test.ts`

**Interfaces:**
- Consumes: `Class.gradeLevelId` (Task 1).
- Produces: `POST`/`PATCH /api/school/classes[/[id]]` accept an optional `gradeLevelId: string | null` in the body; `useClassFormData()` returns an additional `levelCatalogRows: { id: string; name: string }[]` alongside its existing `options`.

- [ ] **Step 1: `CreateClassBody` + `POST` handler**

In `frontend/src/app/api/school/classes/route.ts`, in `CreateClassBody` (line 74), add one field after `homeroomTeacherId`:

```ts
  homeroomTeacherId: z.string().nullable().optional(),
  gradeLevelId: z.string().min(1).nullable().optional(),
```

In the `POST` handler, after the existing `homeroomTeacherId` ownership check (the `if (parsed.data.homeroomTeacherId) { ... }` block, lines 128-138), add:

```ts
    if (parsed.data.gradeLevelId) {
      const level = await prisma.gradeLevel.findUnique({ where: { id: parsed.data.gradeLevelId } });
      if (!level || level.schoolId !== mySchool.schoolId) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Invalid gradeLevelId' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }
```

In the `tx.class.create({ data: {...} })` call (lines 168-180), add `gradeLevelId: parsed.data.gradeLevelId ?? null,` after `homeroomTeacherId: parsed.data.homeroomTeacherId ?? null,`.

- [ ] **Step 2: `UpdateClassBody` + `PATCH` handler**

In `frontend/src/app/api/school/classes/[id]/route.ts`, in `UpdateClassBody` (line 20), add:

```ts
  homeroomTeacherId: z.string().nullable().optional(),
  gradeLevelId: z.string().min(1).nullable().optional(),
```

After the existing `homeroomTeacherId` check (lines 164-174), add the same `gradeLevelId` ownership check as Step 1 (identical body, just no `POST`-specific wrapping). No change is needed to the `prisma.class.update({ data })` call itself — `data` is already built generically from `Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined))` (line 176), so `gradeLevelId` flows through automatically once it is a key of `parsed.data`.

- [ ] **Step 3: `useClassFormData.ts` — expose `levelCatalogRows`**

In `frontend/src/components/school/classes/useClassFormData.ts`, change the `levelCatalog` line inside the `options` `useMemo` (line 130):

```ts
      levelCatalog: [...levelsData.levels].sort((a, b) => a.order - b.order).map((l) => l.name),
```

Add, right after the `options` `useMemo` block closes (after its `[...]` dependency array, before `return { options, error, noSchool };`):

```ts
  const levelCatalogRows = useMemo(
    () =>
      levelsData
        ? [...levelsData.levels].sort((a, b) => a.order - b.order).map((l) => ({ id: l.id, name: l.name }))
        : [],
    [levelsData],
  );

  return { options, levelCatalogRows, error, noSchool };
```

Replace the existing `return { options, error, noSchool };` line with the block above (it now also returns `levelCatalogRows`). `levelCatalog` inside `options` is unchanged — this is purely additive.

- [ ] **Step 4: `useClassForm.ts` — resolve and send `gradeLevelId`**

In `frontend/src/components/school/classes/useClassForm.ts`, add a new parameter to `useClassForm`'s destructured argument (line 130-136):

```ts
export function useClassForm({
  cls,
  levelCatalog,
  levelCatalogRows,
  roomIds,
  subjects,
  onSaved,
}: {
  /** null/undefined = create mode. */
  cls?: ClassDetail | null;
  levelCatalog: string[];
  /** Id/name rows of the school's grade-level catalog, for resolving `gradeLevelId` at submit. */
  levelCatalogRows: { id: string; name: string }[];
  /** Ids of the catalogue rooms offered by the form (configuration/salles). */
  roomIds: string[];
  subjects: ClassFormSubject[];
  onSaved: (cls: ClassData) => void;
}) {
```

In `submit()` (line 304-336), inside the `body` object literal (line 316-327), add one key after `homeroomTeacherId`:

```ts
      const body = {
        name: values.name.trim(),
        level: effectiveLevel(values),
        gradeLevelId: levelCatalogRows.find((l) => l.name === effectiveLevel(values))?.id ?? null,
        // Catalogue room → roomId (the API copies its name into `room`) ;
        // « Autre lieu… » / no catalogue → free text, roomId cleared.
        roomId: values.roomId && values.roomId !== OTHER_ROOM ? values.roomId : null,
        room: values.roomId && values.roomId !== OTHER_ROOM ? null : values.room.trim() || null,
        capacity: Number(values.capacity),
        track: values.track.trim() || null,
        homeroomTeacherId: values.homeroomTeacherId,
        color: values.color,
      };
```

Add `levelCatalogRows` to the `useCallback` dependency array right after it (the array currently reads `[values, cls, onSaved, t, tCommon]` — add `levelCatalogRows`).

- [ ] **Step 5: Thread `levelCatalogRows` from the two page components**

In `frontend/src/app/(school)/configuration/classes/nouvelle/page.tsx`, change line 31:

```ts
  const { options, levelCatalogRows, error, noSchool } = useClassFormData(!!user);
```

and in the `useClassForm({...})` call (line 46-52), add `levelCatalogRows,` after `levelCatalog: options?.levelCatalog ?? [],`.

Apply the identical two changes to `frontend/src/app/(school)/configuration/classes/[id]/page.tsx` at its own `useClassFormData`/`useClassForm` call sites (same destructuring, same added argument — this file's `useClassForm({...})` call is at line 81 per the File Map; match its existing style exactly, it is structurally the same call as `nouvelle/page.tsx`'s, just with `cls` set to the loaded class instead of `null`).

- [ ] **Step 6: Test — `gradeLevelId` validation and persistence**

In `frontend/src/app/api/school/classes/route.test.ts`, find the existing `describe('POST /api/school/classes', ...)` block (or equivalent) and add:

```ts
  it('unknown or another school\'s gradeLevelId → 400 VALIDATION_FAILED', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValueOnce(null);
    let res = await POST(
      req('POST', '/api/school/classes', { name: '6ème A', level: '6ème', gradeLevelId: 'nope' }),
    );
    expect(res.status).toBe(400);

    prismaMock.gradeLevel.findUnique.mockResolvedValueOnce({
      id: 'gl1',
      schoolId: 'school_OTHER',
    } as never);
    res = await POST(
      req('POST', '/api/school/classes', { name: '6ème A', level: '6ème', gradeLevelId: 'gl1' }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('valid gradeLevelId is persisted on create', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue({ id: 'gl1', schoolId: 'school_1' } as never);
    prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock));
    prismaMock.class.create.mockResolvedValue({ id: 'c1' } as never);
    const res = await POST(
      req('POST', '/api/school/classes', { name: '6ème A', level: '6ème', gradeLevelId: 'gl1' }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.class.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ gradeLevelId: 'gl1' }) }),
    );
  });
```

Adapt the exact `req()`/mock helper names and the `$transaction` mocking style to whatever this file's existing tests already use (read the file first — it already mocks `activeYear`/`resolveActiveAcademicYear`, which these two new tests must also satisfy, matching the existing `beforeEach` setup).

- [ ] **Step 7: Full gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/api/school/classes frontend/src/components/school/classes frontend/src/app/\(school\)/configuration/classes
git commit -m "feat(classes): link a class to its grade level"
```

---

### Task 3: Per-level bulletin template assignment

**Files:**
- Modify: `frontend/src/app/api/school/grade-levels/route.ts:17`
- Modify: `frontend/src/app/api/school/grade-levels/[id]/route.ts`
- Modify: `frontend/src/app/api/school/grade-levels/route.test.ts`
- Modify: `frontend/src/app/(school)/configuration/classes/types.ts:41-45`
- Modify: `frontend/src/app/(school)/configuration/niveaux/page.tsx`
- Modify: `frontend/src/messages/{fr,ht,en}/configuration.json` (`niveaux` namespace)

**Interfaces:**
- Consumes: `GradeLevel.bulletinTemplateId` (Task 1); `TemplateListData`/`TemplateRow` (`frontend/src/app/(school)/configuration/modele-bulletin/types.ts`, unchanged, already exported — Plan 2).
- Produces: `GET /api/school/grade-levels` rows gain `bulletinTemplateId: string | null`; `PATCH /api/school/grade-levels/[id]` accepts `{ bulletinTemplateId?: string | null }` in addition to `name`.

- [ ] **Step 1: `LEVEL_SELECT` gains `bulletinTemplateId`**

In `frontend/src/app/api/school/grade-levels/route.ts`, replace line 17:

```ts
export const LEVEL_SELECT = { id: true, name: true, order: true } as const;
```

with:

```ts
export const LEVEL_SELECT = {
  id: true,
  name: true,
  order: true,
  bulletinTemplateId: true,
} as const;
```

- [ ] **Step 2: `GradeLevelRow` type**

In `frontend/src/app/(school)/configuration/classes/types.ts`, replace:

```ts
/** Row of GET /api/school/grade-levels — the school's ordered catalog. */
export interface GradeLevelRow {
  id: string;
  name: string;
  order: number;
}
```

with:

```ts
/** Row of GET /api/school/grade-levels — the school's ordered catalog. */
export interface GradeLevelRow {
  id: string;
  name: string;
  order: number;
  /** Assigned bulletin template (school's own or global) — null = the
   * school's default template applies (spec 2026-09-05 §8). */
  bulletinTemplateId: string | null;
}
```

- [ ] **Step 3: `PATCH /api/school/grade-levels/[id]` accepts `bulletinTemplateId`**

In `frontend/src/app/api/school/grade-levels/[id]/route.ts`, replace the import line:

```ts
import { LevelNameBody } from '../route';
```

with:

```ts
import { z } from 'zod';
```

Add, right after the imports (before `type Ctx = ...`):

```ts
const PatchLevelBody = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    bulletinTemplateId: z.string().min(1).nullable().optional(),
  })
  .refine((data) => data.name !== undefined || data.bulletinTemplateId !== undefined, {
    message: 'at least one field required',
  });
```

Replace the `PATCH` handler's body:

```ts
export async function PATCH(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const g = await guard(req, params, ctx.requestId, 'edit');
    if (g instanceof NextResponse) return g;

    const parsed = PatchLevelBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const data: { name?: string; bulletinTemplateId?: string | null } = {};

    if (parsed.data.name !== undefined) {
      const name = parsed.data.name;
      const clash = await prisma.gradeLevel.findFirst({
        where: { schoolId: g.schoolId, name, NOT: { id: g.level.id } },
        select: { id: true },
      });
      if (clash) {
        return NextResponse.json(
          { error: 'LEVEL_NAME_TAKEN', message: `Le niveau « ${name} » existe déjà.` },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      data.name = name;
    }

    if (parsed.data.bulletinTemplateId !== undefined) {
      if (parsed.data.bulletinTemplateId === null) {
        data.bulletinTemplateId = null;
      } else {
        const tpl = await prisma.bulletinTemplate.findUnique({
          where: { id: parsed.data.bulletinTemplateId },
          select: { id: true, schoolId: true },
        });
        if (!tpl || (tpl.schoolId !== null && tpl.schoolId !== g.schoolId)) {
          return NextResponse.json(
            { error: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
            { status: 404, headers: { 'x-request-id': ctx.requestId } },
          );
        }
        data.bulletinTemplateId = tpl.id;
      }
    }

    const updated = await prisma.gradeLevel.update({
      where: { id: g.level.id },
      data,
    });
    return NextResponse.json(
      {
        level: {
          id: updated.id,
          name: updated.name,
          order: updated.order,
          bulletinTemplateId: updated.bulletinTemplateId,
        },
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

Leave `DELETE` unchanged, but update its leading file comment (currently: `// DELETE — hard delete. There is no FK from Class to GradeLevel (by design), so this can never orphan a class row; classes at that free-text level just stop getting an auto-suggestion in the rollover wizard.`) — this is now only half true. Replace the file's top comment block with:

```ts
// PATCH /api/school/grade-levels/[id] — rename a level (409 LEVEL_NAME_TAKEN
// on collision with another level of the same school) and/or assign its
// bulletin template (`bulletinTemplateId`, own school's or global; 404
// TEMPLATE_NOT_FOUND otherwise; `null` clears it back to the school's
// default — spec 2026-09-05 §8).
// DELETE — hard delete. `Class.gradeLevelId` (spec 2026-09-05 §8) is
// `onDelete: SetNull`, so this can never orphan a class row — a class at a
// deleted level just falls back to no grade-level link, same as before this
// field existed; classes still keep their free-text `level` either way.
```

- [ ] **Step 4: Update existing tests + add new ones**

In `frontend/src/app/api/school/grade-levels/route.test.ts`:

Update the `row()` helper (line 50-57) to accept an optional 4th argument:

```ts
const row = (id: string, name: string, order: number, bulletinTemplateId: string | null = null) => ({
  id,
  schoolId: 'school_1',
  name,
  order,
  bulletinTemplateId,
  createdAt: now,
  updatedAt: now,
});
```

Update the GET test's `select` assertion (line 101-105):

```ts
    expect(prismaMock.gradeLevel.findMany).toHaveBeenCalledWith({
      where: { schoolId: 'school_1' },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, order: true, bulletinTemplateId: true },
    });
```

and its mocked rows / expected body (line 89-100) to include `bulletinTemplateId: null` on both:

```ts
    prismaMock.gradeLevel.findMany.mockResolvedValue([
      { id: 'l1', name: '6ème', order: 0, bulletinTemplateId: null },
      { id: 'l2', name: '5ème', order: 1, bulletinTemplateId: null },
    ] as never);
    const res = await GET(req('GET', '/api/school/grade-levels'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    const body = (await res.json()) as { levels: unknown[] };
    expect(body.levels).toEqual([
      { id: 'l1', name: '6ème', order: 0, bulletinTemplateId: null },
      { id: 'l2', name: '5ème', order: 1, bulletinTemplateId: null },
    ]);
```

Update the 'renames → 200 { level }' test (line 240-255): its expected body and the mocked `update` return must now include `bulletinTemplateId: null`:

```ts
  it('renames → 200 { level }', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue(row('l1', '6ème', 0) as never);
    prismaMock.gradeLevel.findFirst.mockResolvedValue(null);
    prismaMock.gradeLevel.update.mockResolvedValue(row('l1', 'Sixième', 0) as never);
    const res = await PATCH(
      req('PATCH', '/api/school/grade-levels/l1', { name: '  Sixième ' }),
      params('l1'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({
      level: { id: 'l1', name: 'Sixième', order: 0, bulletinTemplateId: null },
    });
    expect(prismaMock.gradeLevel.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { name: 'Sixième' },
    });
  });
```

Add, inside `describe('PATCH /api/school/grade-levels/[id]', ...)`, after the 'renames → 200' test:

```ts
  it('empty body (no name, no bulletinTemplateId) → 400 VALIDATION_FAILED', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue(row('l1', '6ème', 0) as never);
    const res = await PATCH(req('PATCH', '/api/school/grade-levels/l1', {}), params('l1'));
    expect(res.status).toBe(400);
    expect(prismaMock.gradeLevel.update).not.toHaveBeenCalled();
  });

  it('unknown bulletinTemplateId → 404 TEMPLATE_NOT_FOUND', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue(row('l1', '6ème', 0) as never);
    prismaMock.bulletinTemplate.findUnique.mockResolvedValue(null);
    const res = await PATCH(
      req('PATCH', '/api/school/grade-levels/l1', { bulletinTemplateId: 'nope' }),
      params('l1'),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('TEMPLATE_NOT_FOUND');
    expect(prismaMock.gradeLevel.update).not.toHaveBeenCalled();
  });

  it("another school's own (non-global) template → 404 TEMPLATE_NOT_FOUND", async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue(row('l1', '6ème', 0) as never);
    prismaMock.bulletinTemplate.findUnique.mockResolvedValue({
      id: 'tpl1',
      schoolId: 'school_OTHER',
    } as never);
    const res = await PATCH(
      req('PATCH', '/api/school/grade-levels/l1', { bulletinTemplateId: 'tpl1' }),
      params('l1'),
    );
    expect(res.status).toBe(404);
    expect(prismaMock.gradeLevel.update).not.toHaveBeenCalled();
  });

  it('a global template is accepted → 200, bulletinTemplateId set', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue(row('l1', '6ème', 0) as never);
    prismaMock.bulletinTemplate.findUnique.mockResolvedValue({
      id: 'tpl-global',
      schoolId: null,
    } as never);
    prismaMock.gradeLevel.update.mockResolvedValue(row('l1', '6ème', 0, 'tpl-global') as never);
    const res = await PATCH(
      req('PATCH', '/api/school/grade-levels/l1', { bulletinTemplateId: 'tpl-global' }),
      params('l1'),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.gradeLevel.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { bulletinTemplateId: 'tpl-global' },
    });
  });

  it('bulletinTemplateId: null clears the assignment → 200', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue(row('l1', '6ème', 0, 'tpl-global') as never);
    prismaMock.gradeLevel.update.mockResolvedValue(row('l1', '6ème', 0, null) as never);
    const res = await PATCH(
      req('PATCH', '/api/school/grade-levels/l1', { bulletinTemplateId: null }),
      params('l1'),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.gradeLevel.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { bulletinTemplateId: null },
    });
  });
```

- [ ] **Step 5: Niveaux page — per-level template selector**

In `frontend/src/app/(school)/configuration/niveaux/page.tsx`:

Replace the local `interface GradeLevel { id: string; name: string; order: number; }` (lines 51-55) with an import:

```ts
import type { GradeLevelRow } from '../classes/types';
import type { TemplateListData, TemplateRow } from '../modele-bulletin/types';
import { BareSelect, SelectItem } from '@/components/school/subjects/form-primitives';
```

and rename every use of `GradeLevel` in this file to `GradeLevelRow` (the `levels: GradeLevel[] | null` state derived from `useApi`, `SortableLevelRow`'s `level: GradeLevel` prop, `LevelNameModal`'s callers, `onDelete`/`onRename` signatures — a mechanical rename, no behavior change).

Add a second data fetch right after the existing `levelsData` one (after line 265's `const levels = levelsData?.levels ?? null;`):

```ts
  const { data: templatesData } = useApi<TemplateListData>('/api/school/bulletin-templates', {
    skip: !user,
  });
```

Extend `NiveauxErrorT`'s key union (line 57-63) with `'errors.templateNotFound'`, and `errorMessage()`'s switch (line 72-86) with:

```ts
    case 'TEMPLATE_NOT_FOUND':
      return t('errors.templateNotFound');
```

Add, after `renameLevel` (after line 292):

```ts
  async function updateLevelTemplate(level: GradeLevelRow, templateId: string | null) {
    const previous = levels;
    mutateLevels((prev) =>
      prev
        ? {
            levels: prev.levels.map((l) =>
              l.id === level.id ? { ...l, bulletinTemplateId: templateId } : l,
            ),
          }
        : { levels: [] },
    );
    try {
      await api(`/api/school/grade-levels/${level.id}`, {
        method: 'PATCH',
        body: { bulletinTemplateId: templateId },
      });
      toast(t('levelTemplateUpdated'), 'success');
    } catch (err) {
      mutateLevels(previous ? { levels: previous } : { levels: [] });
      toast(errorMessage(err, t, tCommon), 'error');
    }
  }
```

In `SortableLevelRow`, add two props (`templates: TemplateListData | undefined`, `onTemplateChange: (templateId: string | null) => void`) and insert the selector between the name `<span>` (line 208) and the action-buttons `<div>` (line 209):

```tsx
      <span className="flex-1 truncate text-sm font-medium text-foreground">{level.name}</span>
      <div className="w-36 shrink-0 sm:w-52">
        <BareSelect
          value={level.bulletinTemplateId ?? ''}
          onValueChange={(val) => onTemplateChange(val === '' ? null : val)}
          placeholder={t('templateDefault')}
          aria-label={t('templateAria', { name: level.name })}
        >
          <SelectItem value="">{t('templateDefault')}</SelectItem>
          {(templates?.personal ?? []).map((tpl) => (
            <SelectItem key={tpl.id} value={tpl.id}>
              {tpl.name}
            </SelectItem>
          ))}
          {(templates?.global ?? []).map((tpl) => (
            <SelectItem key={tpl.id} value={tpl.id}>
              {`${tpl.name} · Global`}
            </SelectItem>
          ))}
        </BareSelect>
      </div>
```

(`BareSelect` does not currently forward an `aria-label` prop through to its trigger — check its signature in `form-primitives.tsx` first; if it does not, add `aria-label` to `BareSelect`'s prop list and spread it onto `SelectPrimitive.Trigger` there, since this is the first caller that needs it.)

Pass the two new props from the parent's render loop (line 382-392):

```tsx
                    <SortableLevelRow
                      key={level.id}
                      level={level}
                      index={index}
                      disabled={saving}
                      onRename={() => setRenaming(level)}
                      onDelete={() => onDelete(level)}
                      templates={templatesData}
                      onTemplateChange={(templateId) => updateLevelTemplate(level, templateId)}
                      t={t}
                    />
```

- [ ] **Step 6: i18n — new `niveaux` keys**

In `frontend/src/messages/fr/configuration.json`, inside `niveaux`, add (after `"levelDeleted": "Niveau supprimé.",`):

```json
    "levelTemplateUpdated": "Modèle de bulletin mis à jour.",
    "templateDefault": "Modèle par défaut de l'école",
    "templateAria": "Modèle de bulletin de {name}",
```

and inside `niveaux.errors`, add:

```json
    "templateNotFound": "Modèle introuvable."
```

In `frontend/src/messages/en/configuration.json`, inside `niveaux`:

```json
    "levelTemplateUpdated": "Report card template updated.",
    "templateDefault": "School's default template",
    "templateAria": "Report card template for {name}",
```

and inside `niveaux.errors`:

```json
    "templateNotFound": "Template not found."
```

In `frontend/src/messages/ht/configuration.json`, inside `niveaux`:

```json
    "levelTemplateUpdated": "Modèl bilten an mete ajou.",
    "templateDefault": "Modèl pa default lekòl la",
    "templateAria": "Modèl bilten pou {name}",
```

and inside `niveaux.errors`:

```json
    "templateNotFound": "Nou pa jwenn modèl la."
```

- [ ] **Step 7: Full gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS, `locales.test.ts` confirms fr/ht/en key parity.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/api/school/grade-levels frontend/src/app/\(school\)/configuration/niveaux frontend/src/app/\(school\)/configuration/classes/types.ts frontend/src/messages
git commit -m "feat(niveaux): assign a bulletin template per grade level"
```

---

### Task 4: Bulletin template deletion guard + "Modèle par défaut" relabeling

**Files:**
- Modify: `frontend/src/app/api/school/bulletin-templates/[id]/route.ts:109-146`
- Modify: `frontend/src/app/(school)/configuration/modele-bulletin/page.tsx:118-134`
- Modify: `frontend/src/messages/{fr,ht,en}/configuration.json` (`modeleBulletin` namespace)

**Interfaces:**
- Consumes: `GradeLevel.bulletinTemplateId` (Task 1).
- Produces: `DELETE /api/school/bulletin-templates/[id]` returns 409 `TEMPLATE_IN_USE` when a grade level of the same school references it.

- [ ] **Step 1: `DELETE` handler — `TEMPLATE_IN_USE` guard**

In `frontend/src/app/api/school/bulletin-templates/[id]/route.ts`, in the `DELETE` handler, after the existing `isActive` check (lines 133-141) and before `await prisma.bulletinTemplate.delete(...)`, add:

```ts
    const usedByLevel = await prisma.gradeLevel.findFirst({
      where: { schoolId: mySchool.schoolId, bulletinTemplateId: id },
      select: { name: true },
    });
    if (usedByLevel) {
      return NextResponse.json(
        {
          error: 'TEMPLATE_IN_USE',
          message: `Ce modèle est assigné au niveau « ${usedByLevel.name} ». Retirez l'affectation avant de le supprimer.`,
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
```

Update the file's top comment (currently `// DELETE — own templates only; refuses deleting the active template.`) to:

```ts
// DELETE — own templates only; refuses deleting the active template (400)
// or a template a grade level of this school still references (409
// TEMPLATE_IN_USE — spec 2026-09-05 §8).
```

- [ ] **Step 2: Gallery page — handle `TEMPLATE_IN_USE`**

In `frontend/src/app/(school)/configuration/modele-bulletin/page.tsx`, in `remove()` (lines 118-134), add a branch before the generic catch-all:

```ts
  async function remove(id: string) {
    if (!(await confirm({ message: t('deleteConfirm'), danger: true }))) return;
    try {
      await api(`/api/school/bulletin-templates/${id}`, { method: 'DELETE' });
      toast(t('toast.deleted'), 'success');
      setData((d) => ({
        personal: (d?.personal ?? []).filter((tpl) => tpl.id !== id),
        global: d?.global ?? [],
      }));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TEMPLATE_IN_USE') {
        toast(t('toast.deleteInUseError'), 'error');
        return;
      }
      if (err instanceof ApiError && err.code === 'VALIDATION_FAILED') {
        toast(err.message, 'error');
        return;
      }
      toast(t('toast.deleteError'), 'error');
    }
  }
```

- [ ] **Step 3: i18n — `modeleBulletin` relabeling + new key**

In each of `frontend/src/messages/{fr,ht,en}/configuration.json`, inside `modeleBulletin`, replace the following keys exactly (no other keys in this namespace change):

**fr:**
```json
    "badge.active": "Modèle par défaut",
    "activeCard.label": "Modèle par défaut : {name}",
    "activeCard.description": "Ce modèle est utilisé par défaut pour la génération des bulletins, sauf pour les niveaux qui ont leur propre modèle assigné. Dernière modification : {date}",
    "menu.setActive": "Définir comme modèle par défaut",
    "editor.setActive": "Définir comme modèle par défaut",
    "help.activeTemplate": "Le modèle par défaut est utilisé pour générer les bulletins de vos élèves, sauf si leur niveau scolaire a son propre modèle assigné (Configuration › Niveaux). Pour changer le modèle par défaut, ouvrez le menu d'un modèle personnel puis choisissez « Définir comme modèle par défaut ».",
    "help.pageOverview": "Choisissez un modèle personnel ou dupliquez (« Dupliquer ») un modèle global pour créer le vôtre : les modèles globaux ne sont pas modifiables directement. Un seul modèle personnel peut être défini par défaut à la fois.",
    "toast.activated": "Modèle défini comme modèle par défaut.",
    "editor.toast.activated": "Modèle défini comme modèle par défaut.",
    "toast.deleteInUseError": "Impossible de supprimer : ce modèle est assigné à un niveau scolaire."
```

**en:**
```json
    "badge.active": "Default template",
    "activeCard.label": "Default template: {name}",
    "activeCard.description": "This template is used by default to generate report cards, except for grade levels with their own assigned template. Last modified: {date}",
    "menu.setActive": "Set as default template",
    "editor.setActive": "Set as default template",
    "help.activeTemplate": "The default template is used to generate your students' report cards, unless their grade level has its own assigned template (Configuration > Levels). To change the default template, open a personal template's menu and choose \"Set as default template\".",
    "help.pageOverview": "Pick a personal template, or use \"Duplicate\" on a global one to create your own: global templates can't be edited directly. Only one personal template can be set as default at a time.",
    "toast.activated": "Template set as default.",
    "editor.toast.activated": "Template set as default.",
    "toast.deleteInUseError": "Can't delete: this template is assigned to a grade level."
```

**ht:**
```json
    "badge.active": "Modèl pa default",
    "activeCard.label": "Modèl pa default : {name}",
    "activeCard.description": "Modèl sa a itilize pa default pou jenere bilten yo, eksepte pou nivo ki gen pwòp modèl pa yo. Dènye modifikasyon : {date}",
    "menu.setActive": "Defini kòm modèl pa default",
    "editor.setActive": "Defini kòm modèl pa default",
    "help.activeTemplate": "Modèl pa default la sèvi pou jenere bilten elèv ou yo, sof si nivo eskolè yo genyen pwòp modèl yo chwazi (Konfigirasyon › Nivo). Pou chanje modèl pa default la, louvri meni yon modèl pèsonèl epi chwazi « Defini kòm modèl pa default ».",
    "help.pageOverview": "Chwazi yon modèl pèsonèl, oswa itilize « Dupike » sou yon modèl global pou kreye pa ou : ou pa ka modifye yon modèl global dirèkteman. Se yon sèl modèl pèsonèl ki ka defini kòm modèl pa default nan yon moman.",
    "toast.activated": "Modèl defini kòm modèl pa default.",
    "editor.toast.activated": "Modèl defini kòm modèl pa default.",
    "toast.deleteInUseError": "Nou pa kapab efase l : modèl sa a asiyen a yon nivo eskolè."
```

- [ ] **Step 4: Test — `TEMPLATE_IN_USE`**

No test file covers this route today (neither `bulletin-templates/route.test.ts` nor `bulletin-templates/[id]/route.test.ts` exists). Create `frontend/src/app/api/school/bulletin-templates/[id]/route.test.ts`, mirroring the mocking conventions of `frontend/src/app/api/school/grade-levels/route.test.ts` exactly (the same `vi.mock` set for `@/lib/server/prisma` → `prismaMock`, `@/lib/server/auth` → `verifyCsrf`, `@/lib/server/middleware` → `requireAuth`, `@/lib/server/school-permissions` → `requireSchoolPermission`, the same `req()`/`params()` helpers and the same `beforeEach` reset), with this test plus one sibling asserting the pre-existing path still holds (own non-active template, no level references it → 204 and `prismaMock.bulletinTemplate.delete` called with `{ where: { id: 'tpl1' } }`):

```ts
  it('a level of this school still references it → 409 TEMPLATE_IN_USE', async () => {
    prismaMock.bulletinTemplate.findUnique.mockResolvedValue({
      id: 'tpl1',
      schoolId: 'school_1',
      isActive: false,
    } as never);
    prismaMock.gradeLevel.findFirst.mockResolvedValue({ name: 'Kindergarten' } as never);
    const res = await DELETE(req('DELETE', '/api/school/bulletin-templates/tpl1'), params('tpl1'));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('TEMPLATE_IN_USE');
    expect(prismaMock.bulletinTemplate.delete).not.toHaveBeenCalled();
  });
```

(Adapt `req`/`params` helper names to whatever this test file already defines.)

- [ ] **Step 5: Full gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/school/bulletin-templates frontend/src/app/\(school\)/configuration/modele-bulletin/page.tsx frontend/src/messages
git commit -m "feat(bulletin): refuse deleting a template a grade level still uses"
```

---

### Task 5: `getStudentBulletinView` — resolve the template by grade level

**Files:**
- Modify: `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts:85-138`
- Modify: `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.test.ts`
- Modify: `CLAUDE.md` (Internationalisation section's bulletin-pages-engine paragraph)

**Interfaces:**
- Consumes: `Class.gradeLevel.bulletinTemplate` (Task 1).
- Produces: `getStudentBulletinView`'s `template` field now resolves niveau → école active → global, unchanged shape otherwise.

- [ ] **Step 1: Include the class's grade level + template in the enrollment query**

In `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts`, replace the `enrollment.class.select` block (lines 91-98):

```ts
        class: {
          select: {
            id: true,
            name: true,
            academicYearId: true,
            homeroomTeacher: { select: { id: true, name: true } },
          },
        },
```

with:

```ts
        class: {
          select: {
            id: true,
            name: true,
            academicYearId: true,
            homeroomTeacher: { select: { id: true, name: true } },
            gradeLevel: { select: { bulletinTemplate: true } },
          },
        },
```

- [ ] **Step 2: Prefer the level's template**

Replace lines 131-138:

```ts
  const [activeTemplate, fallbackTemplate] = await Promise.all([
    prisma.bulletinTemplate.findFirst({ where: { schoolId, isActive: true } }),
    prisma.bulletinTemplate.findFirst({
      where: { schoolId: null },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const template = activeTemplate ?? fallbackTemplate;
```

with:

```ts
  const [activeTemplate, fallbackTemplate] = await Promise.all([
    prisma.bulletinTemplate.findFirst({ where: { schoolId, isActive: true } }),
    prisma.bulletinTemplate.findFirst({
      where: { schoolId: null },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  // Résolution spec §8 : niveau -> modèle actif de l'école -> plus ancien
  // modèle global. Les deux requêtes ci-dessus restent inconditionnelles
  // (même coût qu'avant l'ajout du niveau) — un repli bon marché, jamais sur
  // le chemin critique d'un niveau qui a déjà son propre modèle.
  const template = enrollment.class.gradeLevel?.bulletinTemplate ?? activeTemplate ?? fallbackTemplate;
```

- [ ] **Step 3: Test — resolution order**

In `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.test.ts`, add (adapt to this file's existing mock-setup helpers, visible once you read the file — it already mocks `prisma.enrollment.findFirst` for the base case):

```ts
  it("prefers the enrolled class's grade-level template over the school's active one", async () => {
    const levelTemplate = { id: 'tpl-level', name: 'Livret préscolaire', config: validPagesConfig, isActive: false };
    prismaMock.enrollment.findFirst
      .mockResolvedValueOnce({
        ...baseEnrollment,
        class: { ...baseEnrollment.class, gradeLevel: { bulletinTemplate: levelTemplate } },
      } as never);
    prismaMock.bulletinTemplate.findFirst.mockResolvedValue({ id: 'tpl-active', config: validPagesConfig } as never);

    const view = await getStudentBulletinView('school_1', 'student_1', null);
    expect(view?.template?.id).toBe('tpl-level');
  });

  it("falls back to the school's active template when the class has no grade-level template", async () => {
    prismaMock.enrollment.findFirst
      .mockResolvedValueOnce({
        ...baseEnrollment,
        class: { ...baseEnrollment.class, gradeLevel: null },
      } as never);
    prismaMock.bulletinTemplate.findFirst
      .mockResolvedValueOnce({ id: 'tpl-active', config: validPagesConfig, isActive: true } as never)
      .mockResolvedValueOnce({ id: 'tpl-global', config: validPagesConfig, isActive: false } as never);

    const view = await getStudentBulletinView('school_1', 'student_1', null);
    expect(view?.template?.id).toBe('tpl-active');
  });

  it('falls back to the oldest global template when the level has none and the school has no active one', async () => {
    prismaMock.enrollment.findFirst
      .mockResolvedValueOnce({
        ...baseEnrollment,
        class: { ...baseEnrollment.class, gradeLevel: { bulletinTemplate: null } },
      } as never);
    prismaMock.bulletinTemplate.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'tpl-global', config: validPagesConfig, isActive: false } as never);

    const view = await getStudentBulletinView('school_1', 'student_1', null);
    expect(view?.template?.id).toBe('tpl-global');
  });
```

The classmates lookup is `prisma.enrollment.findMany` (not a second `findFirst`), and the view also reads `student.findUnique`, `school.findUnique`, `term.findMany`, `academicYear.findUnique` and `classSubject.findMany` before it reaches the template — reuse whatever shared `beforeEach`/helper the existing file already has for those; the three tests above only override `enrollment.findFirst` and `bulletinTemplate.findFirst`. Every test above must contain a real assertion — never commit a test whose body is only a comment. If the existing file's fixture is not named `baseEnrollment`/`validPagesConfig`, use its actual names; if `enrollment.findFirst` is mocked with `mockResolvedValue` (not `Once`) in the file's `beforeEach`, override per-test the same way the file's other tests do.

Read the existing test file's mock setup carefully before writing this — it likely mocks `enrollment.findFirst` once per test via a shared fixture object (`baseEnrollment` or similar name); adapt the exact object shape and the `mockResolvedValueOnce` sequencing (this route makes 2 `Promise.all`-batched queries you must supply mocks for in the same order the code awaits them) to match, rather than inventing a new fixture shape.

- [ ] **Step 4: CLAUDE.md**

In `CLAUDE.md`, the Internationalisation section's bulletin-pages-engine paragraph currently ends with the French-printed-content-carve-out sentence. Add one clause right after the `normalizeConfig` sentence, before that carve-out sentence:

```
 As of 2026-09-05, a template can also be assigned per `GradeLevel`
 (`GradeLevel.bulletinTemplateId`, own school's or global — `PATCH
 /api/school/grade-levels/[id]`, 404 `TEMPLATE_NOT_FOUND` on a foreign
 non-global id) with the resolution order niveau -> école `isActive` ->
 plus ancien modèle global (`getStudentBulletinView`); deleting a template
 refuses with 409 `TEMPLATE_IN_USE` while any grade level of that school
 still points to it. The seeded global "Livret préscolaire" template
 reproduces `bulletin_template/Bulletin prescolaire.docx` using this
 resolution plus the `halves`-layout/`criteriaGrids`/`text`/`cover` block
 types from Plan 2.
```

- [ ] **Step 5: Full gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/bulletin-pdf CLAUDE.md
git commit -m "feat(bulletin): resolve a student's template through their grade level"
```

---

### Task 6: `backfill-class-grade-level.ts`

**Files:**
- Create: `frontend/scripts/backfill-class-grade-level.ts`
- Create: `frontend/scripts/backfill-class-grade-level.test.ts`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: `Class.gradeLevelId`, `GradeLevel` (Task 1).
- Produces: `main(args, deps): Promise<number>` — same contract as the sibling backfill scripts.

- [ ] **Step 1: The script**

Create `frontend/scripts/backfill-class-grade-level.ts`:

```ts
// One-off backfill: for every Class without a gradeLevelId, link it to the
// GradeLevel of the same school whose name matches its free-text `level`
// exactly. No match → left null (the class's level string doesn't correspond
// to any catalog entry — nothing to link it to). Idempotent: classes that
// already have a gradeLevelId are left untouched, so re-running is safe.
// See docs/superpowers/specs/2026-09-05-bulletin-prescolaire-et-pages-design.md §8/§13.
//
// Usage: pnpm db:backfill-class-grade-level

import { PrismaClient } from '@prisma/client';

interface RunDeps {
  prisma?: Pick<PrismaClient, 'class' | 'gradeLevel' | '$disconnect'>;
}

let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

export async function main(_args: string[] = [], deps: RunDeps = {}): Promise<number> {
  const prisma = deps.prisma ?? getPrisma();
  try {
    const classes = await prisma.class.findMany({
      where: { gradeLevelId: null },
      select: { id: true, schoolId: true, level: true },
    });
    let linked = 0;
    for (const cls of classes) {
      const match = await prisma.gradeLevel.findFirst({
        where: { schoolId: cls.schoolId, name: cls.level },
        select: { id: true },
      });
      if (!match) continue;
      await prisma.class.update({ where: { id: cls.id }, data: { gradeLevelId: match.id } });
      linked++;
      console.log(`✓ Linked class ${cls.id} -> grade level ${match.id}`);
    }
    console.log(`Done — ${linked}/${classes.length} class(es) linked.`);
    return 0;
  } finally {
    if (!deps.prisma && prismaClient) {
      await prismaClient.$disconnect();
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
```

- [ ] **Step 2: The test**

Create `frontend/scripts/backfill-class-grade-level.test.ts`:

```ts
// scripts/backfill-class-grade-level
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { main } from './backfill-class-grade-level';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe('scripts/backfill-class-grade-level', () => {
  it('links a class whose level matches an existing grade level by name', async () => {
    prismaMock.class.findMany.mockResolvedValue([
      { id: 'c1', schoolId: 'school_1', level: '6ème' },
    ] as never);
    prismaMock.gradeLevel.findFirst.mockResolvedValue({ id: 'gl1' } as never);
    prismaMock.class.update.mockResolvedValue({} as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.gradeLevel.findFirst).toHaveBeenCalledWith({
      where: { schoolId: 'school_1', name: '6ème' },
      select: { id: true },
    });
    expect(prismaMock.class.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { gradeLevelId: 'gl1' },
    });
    logSpy.mockRestore();
  });

  it("leaves gradeLevelId null when no grade level matches the class's level", async () => {
    prismaMock.class.findMany.mockResolvedValue([
      { id: 'c2', schoolId: 'school_1', level: 'Niveau introuvable' },
    ] as never);
    prismaMock.gradeLevel.findFirst.mockResolvedValue(null);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.class.update).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('is idempotent — never re-queries a class that already has a gradeLevelId', async () => {
    prismaMock.class.findMany.mockResolvedValue([]);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.class.findMany).toHaveBeenCalledWith({
      where: { gradeLevelId: null },
      select: { id: true, schoolId: true, level: true },
    });
    expect(prismaMock.gradeLevel.findFirst).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
```

- [ ] **Step 3: `package.json` script**

In `frontend/package.json`, add, alongside the sibling `db:backfill-bulletin-*` entries:

```json
    "db:backfill-class-grade-level": "tsx --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/backfill-class-grade-level.ts",
```

- [ ] **Step 4: Full gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS, 3 new tests included.

- [ ] **Step 5: Commit**

```bash
git add frontend/scripts/backfill-class-grade-level.ts frontend/scripts/backfill-class-grade-level.test.ts frontend/package.json
git commit -m "feat(bulletin): backfill Class.gradeLevelId from the free-text level"
```

---

### Task 7: Seed the global "Livret préscolaire" template

**Files:**
- Modify: `frontend/scripts/seed-bulletin-templates.ts`
- Modify: `frontend/scripts/seed-bulletin-templates.test.ts`

**Interfaces:**
- Consumes: the pages/blocks `BulletinTemplateConfig` shape (Plan 2, `frontend/src/lib/server/bulletin-templates.ts` — this script duplicates the shape rather than importing it, same reason as `BASE_CONFIG` above it: that module is `server-only`).
- Produces: a 4th global `BulletinTemplate` row named exactly `Livret préscolaire`.

The verse text below is the literal text of `bulletin_template/Bulletin prescolaire.docx` (extracted and verified character-by-character, typographic apostrophes `’` (U+2019), curly quotes `“ ”` (U+201C/U+201D), and the `œ` ligature all preserved) — copy it verbatim, do not retype it.

- [ ] **Step 1: Add the config + template entry**

In `frontend/scripts/seed-bulletin-templates.ts`, add a new constant after `GLOBAL_TEMPLATES`'s closing `];` (after line 80), and add a 4th entry to `GLOBAL_TEMPLATES` itself:

```ts
// "Livret préscolaire" (spec 2026-09-05 §12) reproduces
// bulletin_template/Bulletin prescolaire.docx exactly — already in the
// pages/blocks shape (Plan 2), unlike the 3 legacy-shaped templates above.
const LIVRET_PRESCOLAIRE_CONFIG = {
  primaryColor: '#1f2937',
  pageFormat: 'LETTER',
  orientation: 'LANDSCAPE',
  pages: [
    {
      id: 'interieur',
      layout: 'halves',
      showPageNumber: false,
      blocks: [
        { id: 'grilles', type: 'criteriaGrids', visible: true, showScaleHeader: true },
        {
          id: 'appreciations',
          type: 'appreciation',
          visible: true,
          style: 'lines',
          lines: 6,
        },
        {
          id: 'signatures',
          type: 'signatures',
          visible: true,
          labels: { homeroom: 'La jardinière', director: 'La direction' },
        },
      ],
    },
    {
      id: 'couvertures',
      layout: 'halves',
      showPageNumber: false,
      blocks: [
        {
          id: 'verset',
          type: 'text',
          visible: true,
          align: 'justify',
          fontSize: 12,
          bold: false,
          italic: false,
          text: '“Tu aimerais l’Eternel, ton Dieu, de tout ton cœur, de toute ton âme et de toute ta force. 6 Et ces commandements, que je te donne aujourd’hui, seront dans ton cœur. 7 Tu les inculqueras à tes enfants, et tu en parleras quand tu seras dans ta maison, quand tu iras en voyage, quand tu te coucheras et quand tu te lèveras. 8 Tu les lieras comme un signe sur tes mains, et ils seront comme des fronteaux entre tes yeux. Tu les écriras sur les poteaux de ta maison et sur tes portes”.\n\nDeutéronome 6 : 5-6',
        },
        {
          id: 'couverture',
          type: 'cover',
          visible: true,
          breakBefore: 'column',
          sectionLabel: 'Section Kindergarten',
          titlePattern: 'Bulletin du {term}',
          showLogo: true,
          framed: true,
          fields: ['lastName', 'firstName', 'className', 'studentNumber', 'academicYear'],
        },
      ],
    },
  ],
  columns: {
    coefficient: true,
    classAverage: true,
    minMax: true,
    appreciation: true,
    absences: true,
    rank: true,
  },
  signatures: { director: true, homeroom: true, guardian: false },
  typography: {
    schoolName: 24,
    title: 20,
    tableBody: 11,
    tableHeader: 11,
    noteValue: 11,
    footer: 9,
  },
  content: {
    title: 'Livret préscolaire',
    footerMessage: null,
    pageNumberFormat: '{n} / {total}',
  },
  layout: {
    pageMargin: 36,
    blockSpacing: 14,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#000000',
    cellPaddingX: 6,
    cellPaddingY: 3,
    tableLineHeight: 1.4,
    showTableBackgrounds: false,
    logoSize: 52,
    signatureSize: 32,
  },
} as const;
```

Add a 4th entry to `GLOBAL_TEMPLATES` (after `Moderne Orange`'s closing `},` at line 79):

```ts
  {
    name: 'Livret préscolaire',
    description:
      'Livret plié en deux pour la section Kindergarten : grilles de comportement et de développement, verset et couverture, reproduisant le modèle papier existant.',
    config: LIVRET_PRESCOLAIRE_CONFIG,
  },
```

- [ ] **Step 2: Update the tests**

In `frontend/scripts/seed-bulletin-templates.test.ts`, change `'creates all 3 global templates when none exist'` to expect 4:

```ts
  it('creates all 4 global templates when none exist', async () => {
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([]);
    prismaMock.bulletinTemplate.create.mockResolvedValue({} as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.bulletinTemplate.findMany).toHaveBeenCalledWith({
      where: { schoolId: null },
      select: { name: true },
    });
    expect(prismaMock.bulletinTemplate.create).toHaveBeenCalledTimes(4);
    for (const call of prismaMock.bulletinTemplate.create.mock.calls) {
      expect(call[0]?.data).toMatchObject({ schoolId: null });
    }
    logSpy.mockRestore();
  });
```

and add `'Livret préscolaire'` to the idempotent test's mocked existing names:

```ts
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([
      { name: 'Académique Vert' },
      { name: 'Officiel Rouge' },
      { name: 'Moderne Orange' },
      { name: 'Livret préscolaire' },
    ] as never);
```

Add a new test asserting the seeded config actually validates against the real schema (this is the one place this script's output should be checked against Plan 2's Zod schema, since a typo here would otherwise only surface much later, in the dev seed or in production):

```ts
  it('the Livret préscolaire config validates against the real bulletin-templates schema', async () => {
    const { bulletinTemplateConfigSchema } = await import(
      '../src/lib/server/bulletin-templates'
    );
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([
      { name: 'Académique Vert' },
      { name: 'Officiel Rouge' },
      { name: 'Moderne Orange' },
    ] as never);
    let capturedConfig: unknown;
    prismaMock.bulletinTemplate.create.mockImplementation((args) => {
      if ((args as { data: { name: string } }).data.name === 'Livret préscolaire') {
        capturedConfig = (args as { data: { config: unknown } }).data.config;
      }
      return Promise.resolve({} as never);
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await main([], { prisma: prismaMock });

    expect(bulletinTemplateConfigSchema.safeParse(capturedConfig).success).toBe(true);
    logSpy.mockRestore();
  });
```

(This test imports the real, `server-only`-guarded schema module — confirm this repo's Vitest setup already aliases `server-only` to a no-op for the test environment, per `CLAUDE.md`'s Conventions section; every other `scripts/*.test.ts` file runs in the same Vitest project, so this import works the same way it already does in, e.g., `bulletin-templates.test.ts` itself.)

- [ ] **Step 3: Full gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/scripts/seed-bulletin-templates.ts frontend/scripts/seed-bulletin-templates.test.ts
git commit -m "feat(bulletin): seed the global Livret préscolaire template"
```

---

### Task 8: Seed the Kindergarten dataset

**Files:**
- Modify: `frontend/scripts/seed-dev-school.ts`

**Interfaces:**
- Consumes: `Class.gradeLevelId`, `GradeLevel.bulletinTemplateId` (Task 1); the "Livret préscolaire" global template (Task 7); `Subject.evaluationMode`/`ratingScale`, `SubjectCriterion`, `CriteriaAssessment`, `CriteriaRating` (Plan 1, already shipped).
- Produces: a `GradeLevel` "Kindergarten" (`order: 0`) with `bulletinTemplateId` set to the Livret préscolaire template, a `Class` "Kindergarten A" with 6 students, 3 qualitative subjects with their criteria, one `PUBLISHED` `CriteriaAssessment` per subject for term 1 with varied ratings, and one general `PUBLISHED` `Appreciation` per student.

- [ ] **Step 1: Append the teacher and the room**

In `frontend/scripts/seed-dev-school.ts`, append one entry to the `TEACHERS` array (right before its closing `];`, i.e. after the last existing entry, the one with `key: 'michel'`):

```ts
  {
    key: 'silien',
    civility: 'Mme',
    firstName: 'Nadège',
    lastName: 'Silien',
    contractType: 'Temps plein',
    hiredYearsAgo: 3,
    weeklyHoursTarget: 30,
  },
```

Append one entry to the `ROOMS` array (right before its closing `];`):

```ts
  {
    name: 'Salle Maternelle',
    type: 'CLASSROOM',
    capacity: 20,
    building: 'Bâtiment A',
    floor: 'Rez-de-chaussée',
    equipment: 'Tapis, coin lecture, tableau blanc',
  },
```

Both `TEACHERS` and `ROOMS` already drive fully generic creation loops (teacher/room creation happens before subjects/classes) — no other code changes are needed for either array; `tid('silien')` and `roomId.get('Salle Maternelle')` become valid immediately.

- [ ] **Step 2: The Kindergarten block**

Insert this whole block into `seedEtoiles`, right after the existing `console.log(\`  ${payments.length} paiements, ${disputes.length} litiges\`);` line (the end of the Fees section, immediately before the `// Active bulletin template = a fork of the global "Académique Vert".` comment):

```ts
  // Kindergarten (livret préscolaire) — spec §8/§12/§13. Deliberately built
  // outside LEVELS/CLASSES/SUBJECTS (Ruling R1): the birth-year formula, the
  // GradeLevel.order = 0 requirement, and "a qualitative subject must never
  // get a numeric Evaluation" would each need special-casing inside the
  // generic pipeline otherwise. teacherId/roomId reuse the 'silien'/'Salle
  // Maternelle' entries appended to TEACHERS/ROOMS above.
  const livretTemplate = await prisma.bulletinTemplate.findFirst({
    where: { schoolId: null, name: 'Livret préscolaire' },
    select: { id: true },
  });
  const kinderLevel = await prisma.gradeLevel.create({
    data: {
      schoolId,
      name: 'Kindergarten',
      order: 0,
      bulletinTemplateId: livretTemplate?.id ?? null,
    },
    select: { id: true },
  });
  const kinderClass = await prisma.class.create({
    data: {
      schoolId,
      academicYearId: yearId,
      name: 'Kindergarten A',
      level: 'Kindergarten',
      gradeLevelId: kinderLevel.id,
      room: 'Salle Maternelle',
      roomId: roomId.get('Salle Maternelle') ?? null,
      capacity: 20,
      color: '#fbbf24',
      track: null,
      homeroomTeacherId: tid('silien'),
    },
    select: { id: true },
  });

  const COMPORTEMENT_CRITERIA = [
    'Serviable',
    'Obéissant',
    'Attentif (ve)',
    'Généreux (se)',
    'Ordonné (e)',
    'Propre',
    'Poli (e)',
    'Agressif (ve)',
    'Timide',
    'Gai (e)',
    'Bavard (e)',
    'Remuant (e)',
    'Somnolent (e)',
  ];
  const PHYSIQUE_CRITERIA = [
    'Exercices physiques',
    'Rythmique',
    'Perception visuelle',
    'Perception auditive',
    'Sens du toucher, du goût de l’odorat',
    'Dessin – peinture',
    'Coloriage',
    'Découpage - collage',
    'Modelage',
    'Travaux manuels',
  ];
  const INTELLECTUEL_CRITERIA = [
    'Langage',
    'Poésie',
    'Chant',
    'Imagination',
    'Observation',
    'Schéma corporel',
    'Exercices sensoriels',
    'Connaissances des formes',
    'Orientation spatiale',
    'Orientation temporelle',
    'Pré-lecture',
    'Pré-écriture',
    'Graphisme',
    'Pré-calcul',
    'Comptage',
    'Bible',
  ];
  const COMPORTEMENT_SCALE = ['Toujours', 'Souvent', 'Parfois', 'Jamais'];
  const DEVELOPPEMENT_SCALE = ['Excellent', 'Très bien', 'Bien', 'Assez bien'];

  const comportement = await prisma.subject.create({
    data: {
      schoolId,
      name: 'Comportement',
      domain: 'Développement',
      level: 'Kindergarten',
      kind: 'REQUIRED',
      evaluationMode: 'QUALITATIVE',
      ratingScale: COMPORTEMENT_SCALE,
      responsibleTeacherId: tid('silien'),
    },
    select: { id: true },
  });
  const developpementPhysique = await prisma.subject.create({
    data: {
      schoolId,
      name: 'Développement physique',
      domain: 'Développement',
      level: 'Kindergarten',
      kind: 'REQUIRED',
      evaluationMode: 'QUALITATIVE',
      ratingScale: DEVELOPPEMENT_SCALE,
      responsibleTeacherId: tid('silien'),
    },
    select: { id: true },
  });
  const developpementIntellectuel = await prisma.subject.create({
    data: {
      schoolId,
      name: 'Développement intellectuel',
      domain: 'Développement',
      level: 'Kindergarten',
      kind: 'REQUIRED',
      evaluationMode: 'QUALITATIVE',
      ratingScale: DEVELOPPEMENT_SCALE,
      responsibleTeacherId: tid('silien'),
    },
    select: { id: true },
  });

  await prisma.subjectCriterion.createMany({
    data: [
      ...COMPORTEMENT_CRITERIA.map((label, i) => ({
        subjectId: comportement.id,
        label,
        order: i + 1,
      })),
      ...PHYSIQUE_CRITERIA.map((label, i) => ({
        subjectId: developpementPhysique.id,
        label,
        order: i + 1,
      })),
      ...INTELLECTUEL_CRITERIA.map((label, i) => ({
        subjectId: developpementIntellectuel.id,
        label,
        order: i + 1,
      })),
    ],
  });
  const [comportementCriteria, physiqueCriteria, intellectuelCriteria] = await Promise.all([
    prisma.subjectCriterion.findMany({
      where: { subjectId: comportement.id },
      orderBy: { order: 'asc' },
      select: { id: true },
    }),
    prisma.subjectCriterion.findMany({
      where: { subjectId: developpementPhysique.id },
      orderBy: { order: 'asc' },
      select: { id: true },
    }),
    prisma.subjectCriterion.findMany({
      where: { subjectId: developpementIntellectuel.id },
      orderBy: { order: 'asc' },
      select: { id: true },
    }),
  ]);

  const [csComportement, csPhysique, csIntellectuel] = await Promise.all([
    prisma.classSubject.create({
      data: { classId: kinderClass.id, subjectId: comportement.id, teacherId: tid('silien') },
      select: { id: true },
    }),
    prisma.classSubject.create({
      data: {
        classId: kinderClass.id,
        subjectId: developpementPhysique.id,
        teacherId: tid('silien'),
      },
      select: { id: true },
    }),
    prisma.classSubject.create({
      data: {
        classId: kinderClass.id,
        subjectId: developpementIntellectuel.id,
        teacherId: tid('silien'),
      },
      select: { id: true },
    }),
  ]);

  const kinderBirthYear = yearStart - 5;
  const kinderStudentInputs: Prisma.StudentCreateManyInput[] = [];
  for (let i = 0; i < 6; i++) {
    const female = chance(0.5);
    let firstName = '';
    let lastName = '';
    do {
      firstName = pick(female ? FIRST_NAMES_F : FIRST_NAMES_M);
      lastName = pick(LAST_NAMES);
    } while (usedNames.has(`${firstName} ${lastName}`));
    usedNames.add(`${firstName} ${lastName}`);
    counter += 1;
    kinderStudentInputs.push({
      schoolId,
      studentNumber: `EL-${yearStart}-${String(counter).padStart(3, '0')}`,
      firstName,
      lastName,
      gender: female ? 'Féminin' : 'Masculin',
      dateOfBirth: utc(kinderBirthYear - (chance(0.25) ? 1 : 0), int(1, 12), int(1, 28)),
      placeOfBirth: pick([
        'Port-au-Prince',
        'Pétion-Ville',
        'Cap-Haïtien',
        'Les Cayes',
        'Jacmel',
        'Gonaïves',
      ]),
      nationality: 'Haïtienne',
      address: `${pick(NEIGHBOURHOODS)}, Port-au-Prince`,
      motherTongue: pick(['Créole', 'Créole', 'Français']),
      enrollmentType: 'Nouvelle inscription',
      scholarship: chance(0.08),
      enrolledAt: addDays(cal.start, int(-20, 10)),
      status: 'ENROLLED',
    });
  }
  await prisma.student.createMany({ data: kinderStudentInputs });
  const kinderStudents = await prisma.student.findMany({
    where: { schoolId, studentNumber: { in: kinderStudentInputs.map((s) => s.studentNumber) } },
    orderBy: { studentNumber: 'asc' },
    select: { id: true, firstName: true, lastName: true },
  });

  const kinderGuardians: Prisma.GuardianCreateManyInput[] = kinderStudents.map((s) => {
    const motherFirst = pick(GUARDIAN_FIRST_F);
    return {
      studentId: s.id,
      name: `${motherFirst} ${s.lastName}`,
      relationship: 'Mère',
      phone: PHONE(),
      email: chance(0.6) ? `${slugName(motherFirst)}.${slugName(s.lastName)}@gmail.com` : null,
      profession: pick(PROFESSIONS),
      isPrimary: true,
    };
  });
  await prisma.guardian.createMany({ data: kinderGuardians });
  await prisma.enrollment.createMany({
    data: kinderStudents.map((s) => ({
      studentId: s.id,
      classId: kinderClass.id,
      academicYearId: yearId,
      enrolledAt: cal.start,
    })),
  });
  console.log(`  Kindergarten : niveau, classe, 3 matières qualitatives, ${kinderStudents.length} élèves`);

  const term1 = at(terms, 0);
  const [assessComportement, assessPhysique, assessIntellectuel] = await Promise.all([
    prisma.criteriaAssessment.create({
      data: { classSubjectId: csComportement.id, termId: term1.id, status: 'PUBLISHED' },
      select: { id: true },
    }),
    prisma.criteriaAssessment.create({
      data: { classSubjectId: csPhysique.id, termId: term1.id, status: 'PUBLISHED' },
      select: { id: true },
    }),
    prisma.criteriaAssessment.create({
      data: { classSubjectId: csIntellectuel.id, termId: term1.id, status: 'PUBLISHED' },
      select: { id: true },
    }),
  ]);
  const kinderRatings: Prisma.CriteriaRatingCreateManyInput[] = [];
  for (const grid of [
    { assessmentId: assessComportement.id, criteria: comportementCriteria },
    { assessmentId: assessPhysique.id, criteria: physiqueCriteria },
    { assessmentId: assessIntellectuel.id, criteria: intellectuelCriteria },
  ]) {
    for (const student of kinderStudents) {
      for (const criterion of grid.criteria) {
        kinderRatings.push({
          assessmentId: grid.assessmentId,
          studentId: student.id,
          criterionId: criterion.id,
          level: int(0, 3),
        });
      }
    }
  }
  await prisma.criteriaRating.createMany({ data: kinderRatings });

  const KINDER_APPRECIATIONS = [
    'Une session bien remplie : l’enfant participe avec entrain et progresse à son rythme.',
    'Bon trimestre dans l’ensemble, de la curiosité et de bons progrès au fil des semaines.',
  ];
  await prisma.appreciation.createMany({
    data: kinderStudents.map((s) => ({
      studentId: s.id,
      termId: term1.id,
      subjectId: null,
      mention: 'BIEN',
      text: pick(KINDER_APPRECIATIONS),
      comportement: pick(['Excellent', 'Satisfaisant']),
      investissement: pick(['Excellent', 'Satisfaisant']),
      assiduite: 'Régulier',
      status: 'PUBLISHED',
      authorId: ownerId,
    })),
  });
  console.log('  feuilles de critères publiées, trimestre 1');

```

- [ ] **Step 3: Full gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS — `seed-dev-school.test.ts` needs no changes (confirmed: it only imports/exercises `CLASSES`, `SUBJECTS`, `ROOMS`, `teacherKeyFor`, `schoolCalendar`, `buildTimetable`, none of which this task modifies or extends; `ROOMS` only gains a harmless extra catalog entry the timetable test never looks up).

- [ ] **Step 4: Commit**

```bash
git add frontend/scripts/seed-dev-school.ts
git commit -m "feat(seed): Kindergarten grade level, class, qualitative subjects and students"
```

---

### Task 9: Visual verification (final)

This task has no automated test — it is a direct, human-observable comparison, per the spec's own closing instruction (§14: "Vérification visuelle (tâche finale du plan 3)").

**Prerequisite:** this plan's migration (Task 1) must actually be applied to the database the dev server uses before this task can run for real — `prisma db execute --file frontend/prisma/migrations/39_bulletin_template_per_grade_level/migration.sql --schema frontend/prisma/schema.prisma` followed by `prisma migrate resolve --applied 39_bulletin_template_per_grade_level` (per Ruling R6, this is a deliberate, deploy-time step, not something the earlier tasks did).

- [ ] **Step 1: Apply the migration to the dev database**

```bash
cd frontend
pnpm exec prisma db execute --file prisma/migrations/39_bulletin_template_per_grade_level/migration.sql --schema prisma/schema.prisma
pnpm exec prisma migrate resolve --applied 39_bulletin_template_per_grade_level
pnpm exec prisma generate
```

- [ ] **Step 2: Reseed the dev school**

```bash
pnpm db:seed-bulletin-templates
pnpm seed:dev-school -- --reset
```

Expected console output includes `✓ Created global template: Livret préscolaire` and `Kindergarten : niveau, classe, 3 matières qualitatives, 6 élèves`.

- [ ] **Step 3: Start the dev server and find a Kindergarten A student**

```bash
pnpm dev
```

Log in as the school owner (see `frontend/CREDENTIALS.local.md`), open Élèves, filter to class "Kindergarten A", open any student's fiche, and open their Bulletin for the first term.

- [ ] **Step 4: Compare the on-screen viewer at 375px and 1280px**

Resize the browser (or use responsive dev tools) to 375px width, confirm the two-page livret renders with no horizontal overflow and both `halves` pages genuinely show two columns (not one — this is the exact regression the Plan 2 final review caught and fixed; re-verifying it here, on a REAL two-column template for the first time, is the point of this step). Repeat at 1280px.

- [ ] **Step 5: Download the PDF and render the source document for comparison**

```bash
# From the repo root:
soffice --headless --convert-to pdf --outdir /tmp "bulletin_template/Bulletin prescolaire.docx"
pdftoppm -png -r 150 /tmp/"Bulletin prescolaire.pdf" /tmp/source-page
```

Download the livret's PDF from the Bulletin viewer (the existing "Télécharger le PDF" action), then convert it the same way:

```bash
pdftoppm -png -r 150 <downloaded-livret>.pdf /tmp/generated-page
```

- [ ] **Step 6: Side-by-side comparison**

Compare `/tmp/source-page-1.png` ↔ `/tmp/generated-page-1.png` (both should show: COMPORTEMENT grid left, Développement physique below it, Développement intellectuel filling the right column, Appréciations + signatures) and `/tmp/source-page-2.png` ↔ `/tmp/generated-page-2.png` (verse on the left, framed cover on the right). Report any visual delta — this plan is considered visually verified once both pages are a faithful reproduction; minor font-metric differences from Chromium vs. Word rendering are expected and acceptable, but layout/content/ordering must match.

- [ ] **Step 7: Report**

No commit for this task (nothing in the repo changes) — report the outcome (pass, or the specific deltas found) as the final message of this plan's execution.
