# Grade Level Ordering & Promotion Auto-Suggest — Design Spec

Date: 2026-08-17
Status: Implemented 2026-08-17 — plan: docs/superpowers/plans/2026-08-17-grade-level-ordering.md

## Problem

The academic-year rollover wizard (`/settings/nouvelle-annee`, shipped
2026-08-14) lets an OWNER promote students from one class to another when
starting a new school year. At Step 2 (`Step2Promotion.tsx`), `allClasses`
is hard-coded to `[]` — the new year's real classes don't exist yet at this
point in the flow (see `page.tsx:344`'s comment) — so the only real action
per source class is "Créer nouvelle": the admin types out, by hand, the
name AND level of the destination class, for every class, every single
year. There is no saved notion of "3ème leads to 2nde" — `Class.level` is
free text with, in the schema's own words, "no fixed catalog yet."

This spec adds a per-school catalog of ordered grade levels, and uses it to
auto-suggest Step 2's class mappings in one click.

## Scope

In scope:
- New `GradeLevel` model: per-school, ordered, name-only catalog (e.g.
  "6ème" → "5ème" → ... → "Terminale").
- New Configuration page (`/configuration/niveaux`) to create, rename,
  reorder (↑/↓), and delete levels.
- Rollover wizard's `GET /api/school/academic-year-rollover` response gains
  the school's ordered `gradeLevels`.
- Step 2 gains a "Suggérer toutes les promotions" button that bulk-prefills
  every unmapped class's destination using the catalog, editable afterward
  exactly like a manual "Créer nouvelle".

Out of scope this pass (confirmed with the user):
- **Per-class-instance mapping** (e.g. "6ème A specifically leads to 5ème
  A specifically"). Ordering is defined once per level, not per section —
  classes are recreated each year so a per-instance mapping would need
  reconfiguring whenever sections change.
- **Converting `Class.level` to a `GradeLevel` foreign key.** `Class.level`
  stays free text, unchanged. `GradeLevel` is a parallel, purely additive
  catalog cross-referenced by exact string match. Zero risk to existing
  class forms, coefficients, subjects, or student screens, none of which
  are touched by this spec.
- **Explicit "end of cursus" marker.** A level with no configured
  successor (typically the last one, e.g. Terminale) simply gets no
  suggestion — the class stays unmapped, which the wizard already renders
  as "non réinscrit" (Step3Summary's existing status). No new UI state.
- **Changes to `academic-year-rollover.ts`'s `executeRollover`.** The
  suggestion is a client-side convenience that populates the exact same
  `classMapping` structure Step 2 already persists and Step 3/confirm
  already consume. The server-side promotion-execution logic is untouched.

## Current state (as found)

- `Class` (`prisma/schema.prisma:393`): `level String // "3ème" — free
  text, no fixed catalog yet`. Scoped by `academicYearId` — classes are
  distinct rows per year, not reused, which is why per-instance mapping
  was rejected above.
- `Step2Promotion.tsx`: renders one row per current-year class. Each row's
  destination cell is either an existing-class `<Select>` (dead code path
  in v1 — `allClasses` is always `[]`) or a "Créer nouvelle" button
  opening `CreateClassModal` (name, level, room?, capacity? — all typed by
  hand). `onMappingChange(classId, { isNew: true, newClass })` is the only
  way a row gets a destination today.
- `page.tsx`'s `RolloverGetResponse` currently returns `{ draft,
  activeYear, classes, students }` — no level/catalog data.
- Configuration routes follow a consistent guard pattern (confirmed by
  reading `/api/school/classes/route.ts`): `requireAuth()` →
  `resolveMySchool(auth.user.sub)` (404 `NO_SCHOOL` if none) → GET is
  readable by any school member, mutating verbs additionally require
  `hasMinRole(mySchool.role, 'ADMIN')` (403 `ORG_ROLE_INSUFFICIENT`
  otherwise) → CSRF via `verifyCsrf(req)` on mutations. The new
  `/api/school/grade-levels*` routes mirror this exactly.

## Data model

```prisma
model GradeLevel {
  id        String   @id @default(cuid())
  schoolId  String
  school    School   @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  name      String   // "6ème", "Terminale" — matched by exact string against Class.level
  order     Int      // 0-based sequence; the suggested next level is order+1
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([schoolId, name])
  @@index([schoolId, order])
}
```

`order` is intentionally NOT part of a unique constraint (only indexed).
The reorder endpoint rewrites every row's `order` for the school in one
transaction on every ↑/↓ move; a unique constraint would force a two-phase
temp-value dance for zero real benefit — nothing else ever writes `order`.

`School` gains the inverse relation (`gradeLevels GradeLevel[]`), same
cascade pattern as every other per-school child model in this schema.

## API — `/api/school/grade-levels`

All routes: `requireAuth()` → `resolveMySchool` → CSRF on mutations →
`ADMIN` minimum on mutations, matching `/api/school/classes`.

- **`GET`** — returns the school's levels ordered by `order asc`:
  `{ levels: [{ id, name, order }] }`.
- **`POST`** — body `{ name }` (trimmed, 1-40 chars, unique per school —
  409 `LEVEL_NAME_TAKEN` on collision). Appended at `order = max(order) +
  1` (or `0` if the school has no levels yet).
- **`PATCH /[id]`** — body `{ name }`. Same validation/collision rule as
  POST.
- **`DELETE /[id]`** — hard delete. No FK from `Class` to `GradeLevel`
  exists (by design — see Scope), so deleting a level can never orphan a
  class row; the only effect is that classes at that free-text level stop
  getting an auto-suggestion. Confirmed client-side with a plain confirm
  dialog (matching existing delete patterns elsewhere in the app), no
  server-side blocking check needed.
- **`POST /reorder`** — body `{ orderedIds: string[] }`, must be exactly
  the set of the school's existing level IDs (400 `INVALID_LEVEL_SET`
  otherwise — catches stale-client races). Rewrites `order` to the array
  index for every row in one `$transaction`.

## UI — Configuration → Niveaux (`/configuration/niveaux`)

New page, added to the Configuration nav alongside Classes/Matières/
Coefficients/Affectations. A single card: ordered list of levels, each row
showing name, an ↑ and ↓ button (disabled at the respective end of the
list, each click calls `POST /reorder` with the swapped order and
optimistically updates), a rename (pencil) icon, and a delete icon.

- **Rename** opens a `Modal` (per the project's standing rule: an edit
  icon always opens a modal, never inline editing) — single `Field` for
  the name, Annuler/Enregistrer footer, mirroring `EditGradingScaleModal`
  in `AnneeScolaireTab.tsx`.
- **Add level**: a `Field` + button at the bottom of the card, appends at
  the end.
- No drag-and-drop: the project has no DnD library, and ↑/↓ buttons are
  equivalent UX for a list of ~5-15 rows reordered infrequently — not
  worth a new dependency.
- Empty state: "Aucun niveau configuré — ajoute ton premier niveau
  ci-dessous." (levels list starts empty for every school; nothing to
  seed/migrate).

## Wizard integration (Step 2)

- `RolloverGetResponse` gains `gradeLevels: { id: string; name: string;
  order: number }[]`, fetched alongside `classes`/`students` in the same
  `GET /api/school/academic-year-rollover` call (one extra `prisma`
  query, same request).
- `Step2Promotion` receives `gradeLevels` as a new prop.
- New button, "Suggérer toutes les promotions", placed above the table
  next to the existing help card. On click, for every class currently
  without a mapping (`!activeMapping[cls.id]?.destClassId &&
  !activeMapping[cls.id]?.newClass`):
  1. Find `gradeLevels.find(l => l.name === cls.level)`. Not found →
     skip this class (stays unmapped, falls through to "non réinscrit" as
     today).
  2. Find the level whose `order` is `+1` from the match. Not found (last
     level in the sequence) → skip this class (same fallthrough — this is
     the "implicit end of cursus" behavior from Scope).
  3. Otherwise, derive the suggested name: `cls.name.includes(cls.level)
     ? cls.name.replace(cls.level, nextLevel.name) : nextLevel.name`
     (handles names like "3ème A" → "2nde A"; falls back to just the bare
     level name for anything that doesn't literally contain the level
     substring, e.g. a class named "3A").
  4. Call the existing `onMappingChange(cls.id, { isNew: true, newClass:
     { name: suggestedName, level: nextLevel.name } })` — the same path
     manual "Créer nouvelle" already uses.
- Rows the button filled in remain fully editable afterward via the
  existing pencil ("modifier la destination") affordance — this is a bulk
  prefill, not a commit. Rows that already had a mapping (manual or from a
  prior click of the button) are left untouched, so re-clicking the button
  after manual edits doesn't clobber them.
- No change to `handleProceed`'s validation, `Step3Summary`, or
  `academic-year-rollover.ts` — they already consume `classMapping`
  exactly as the suggestion produces it.

## Edge cases

- **School has no `GradeLevel` catalog configured at all**: the button
  still renders but every class gets skipped (no match found) — reduces
  to a no-op with no error, and the existing manual flow is unaffected.
  Worth a one-line hint under the button ("Configure l'ordre des niveaux
  dans Configuration > Niveaux pour activer les suggestions automatiques.")
  when `gradeLevels.length === 0`.
- **Two classes share the same `level` value** (e.g. "3ème A" and "3ème
  B"): both independently resolve to the same next level and get their
  own suggested name via the substring-replace rule — no collision, this
  is the expected common case.
- **Class name collision after suggestion** (two suggested names land on
  the same string): already handled today — `Step2Promotion`'s
  `CreateClassModal` warns on same-name collisions client-side, and
  `executeRollover` dedupes same-name creates server-side (per the
  existing implementer note in `academic-year-rollover.ts`). The
  suggestion feature doesn't need its own collision handling.

## Testing plan

- `frontend/src/lib/server/*.test.ts` unit tests for the new
  `/api/school/grade-levels*` routes: create/rename/delete/reorder, name
  collision (409), role guard (403 for non-ADMIN), reorder with a stale
  ID set (400).
- Existing `academic-year-rollover.test.ts` and route tests are unaffected
  (no server-side rollover logic changes) — just re-run to confirm no
  regression from the `RolloverGetResponse` shape addition.
- Manual verification in dev: configure a level sequence, run the wizard,
  click "Suggérer toutes les promotions", confirm names/levels prefill
  correctly including the substring-fallback and last-level-skip cases.
