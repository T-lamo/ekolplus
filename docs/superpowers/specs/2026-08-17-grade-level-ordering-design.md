# Grade Level Ordering & Promotion Auto-Suggest — Design Spec

Date: 2026-08-17
Status: Implemented 2026-08-17 — plan: docs/superpowers/plans/2026-08-17-grade-level-ordering.md — **revised the same day, see « Revision 2026-08-17 (user feedback) » at the end.**

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

## Revision 2026-08-17 (user feedback, after the first ship)

Three product decisions from the user, applied the same day (commits on
`develop` after `4d80fa8`):

1. **Niveaux page — reorder by drag & drop, add via a modal.** The ↑/↓
   buttons are replaced by a sortable list (`@dnd-kit/core` + `sortable` +
   `modifiers` + `utilities`, new dependencies): grip handle per row,
   pointer/touch/keyboard sensors, drop → `POST /reorder` (optimistic,
   reverted on error). "Ajouter un niveau" is a header button opening a
   `Modal` (shared `LevelNameModal` with rename). API unchanged.

2. **Wizard Step 2 — pick the destination among EXISTING classes; no
   « Créer nouvelle ».** The destination cell is a `FilterSelect` listing
   the school's current-year classes (`name (level)`) plus one extra
   option **« Fin de cursus — non réinscrits »**. The create-new column,
   its modal and the `allClasses` prop are gone from the UI.

   *Semantics (the one open interpretation, decided as follows):* a
   `destClassId` is a **current-year class used as a template**. At
   confirm, `executeRollover` **clones** it into the new year (name,
   level, room, capacity, homeroom teacher), once per name — two sources
   pointing at the same template share one clone, and a template clone
   and a legacy `isNew` entry with the same name land on the same class —
   then enrolls the source class's students in the clone. Mapping a class
   onto itself is a collective repeat year. A `destClassId` that is not
   one of the old year's classes resolves to nothing (students not
   enrolled). Student-exception `destClassId`s resolve the same way.
   Before this revision the `destClassId` path (dead in v1) would have
   enrolled new-year students into an old-year class row.

   *New `ClassMappingEntry.unenroll: true`* ("Fin de cursus"): an explicit
   decision that the class's students leave the school. Step 2 now
   requires every class to be **decided** (destination OR unenroll —
   `isDecided()`), which is what makes a school with a terminal level
   (Terminale/3ème…) able to pass Step 2 at all. The PATCH schema accepts
   it; `computeStats`/Step 3 treat it as `unenrolled` (unchanged code
   path). Legacy `isNew`/`newClass` entries are still honoured server-side
   and shown as a note under the select.

   *Auto-suggest* now emits `{ destClassId }`: the class named like the
   source with the level substring swapped ("6ème A" → "5ème A"), else the
   only class at the next level, else nothing; and `{ unenroll: true }`
   for classes at the LAST catalog level. Rows already decided are never
   overwritten.

3. **Where "Niveaux" lives:** kept under Configuration (next to Classes /
   Matières / Coefficients) — it is a structural catalog like those, and
   the wizard's hint links there. Moving it under Paramètres → Année
   scolaire was considered and rejected: the catalog is year-independent.

### Revision 2 — 2026-08-17 (second round of user feedback)

4. **No demotion (business rule).** A destination class must be of a level
   **equal or higher** than the source class's level, per the school's
   grade-level catalog — "un élève de 3ème ne peut pas être mis en 4ème ou
   en 5ème". Same level = repeat year (allowed); skipping levels upward is
   allowed; when either level is not in the catalog the rule cannot be
   judged and does not apply. Implemented once, in the pure shared module
   `settings/nouvelle-annee/promotion-rules.ts` (`buildLevelRank`,
   `isDemotion`, `findDemotions`, `findExceptionDemotions`, plus
   `hasDestination`/`isDecided` moved there), enforced in three places:
   - **Step 2 UI** — the destination picker only lists classes of equal or
     higher level; a persisted forbidden destination (draft saved before
     the catalog changed) shows a red per-row hint and blocks « Étape
     suivante » with the full message;
   - **`PATCH /api/school/academic-year-rollover`** — 400
     `DEMOTION_NOT_ALLOWED` (class mappings and per-student exceptions,
     the latter resolved through the active year's enrollments);
   - **`POST …/confirm`** — same check, defense in depth. The confirm
     route's stale-mapping guard now uses `isDecided`, so a class marked
     « Fin de cursus » no longer trips `MAPPING_STALE` (a bug introduced by
     revision 1, caught here).
5. **Wizard header banner** used `text-warning` (`#fff8e1`, the pale
   *background* token) as text colour → invisible. Now the app's warning
   recipe (`bg-warning` + `text-warning-foreground` + `AlertTriangle`).
6. **Consistency with the rest of the app**: the `Button` primitive is
   `w-full` by default and every other screen passes `w-fit`; the wizard's
   nav/back/confirm buttons now do too, and its title/subtitle use the
   shared page-header typography (`text-xl font-extrabold tracking-tight` /
   `text-xs`).


## Revision 3 — 2026-08-17 (user feedback: per-student decisions)

User feedback (transcribed): « ce n'est pas tous les élèves qui vont pouvoir
passer à une année supérieure … un élève qui n'a pas validé l'année va
peut-être redoubler … il faut ajouter une étape dans laquelle on pourra
prendre une décision pour chaque élève … j'arrive sur la page récapitulatif,
je n'ai pas la possibilité d'éditer ». Decisions:

1. **New wizard Step 3 « Décisions par élève »** (`Step3Decisions.tsx`),
   between « Promotion des élèves » and « Récapitulatif » (now Step 4,
   `Step4Summary.tsx`; `WizardStep = 1 | 2 | 3 | 4`). One row per enrolled
   student — *Élève | Classe actuelle | Décision | Destination* — with a
   class filter, a name search and a live summary line (« 12 élèves ·
   7 passent · 2 redoublent · 3 non réinscrits »). The Décision select
   offers: « Comme la classe → <destination de l'étape 2> » (default),
   « Redouble → <classe actuelle> », « Non réinscrit », then « Autre classe
   → X (niveau) » for every class of **equal or higher level** (no-demotion
   rule, `promotion-rules.ts`). Options that coincide with the class default
   are hidden (e.g. « Redouble » when the class already maps onto itself,
   « Non réinscrit » when the class is « Fin de cursus »). « Sauvegarder le
   brouillon » / « Étape précédente » / « Étape suivante — Récapitulatif ».
2. **No new storage, no new route.** Decisions persist in the draft's
   existing `studentExceptions` map (`student-decisions.ts`, pure, tested):
   « Comme la classe » = no entry; « Redouble » = `{ destClassId: <own
   class> }` (the own class is the clone template → same-named class in the
   new year); « Autre classe » = `{ destClassId }`; « Non réinscrit » =
   `{ skip: true }`. `PATCH` already validates ownership + demotions for
   exceptions; `executeRollover` already applies them (exception > class
   mapping > unenrolled).
3. **Outcome vocabulary** shown in Step 3 and the summary: `promu`
   (destination of a higher level), `redoublant` (destination of the **same
   level** — individually or the whole class mapped onto its level),
   `nonreinscrit`. Replaces the technical « Exception » badge/counter;
   `PromotionStats` = `{ promoted, repeating, unenrolled }` (client-side;
   the server's `computeStats` audit counters are unchanged). Summary rows
   are sorted by class then name like Step 3, and « Étape précédente —
   Modifier les décisions » is offered under the confirm zone.
4. **Server hardening (`POST …/confirm`)**: a `destClassId` (class mapping
   or per-student decision) that is no longer one of the active year's
   classes is refused with 400 `MAPPING_STALE` (message pointing to step 2
   or 3) instead of silently not re-enrolling those students
   (`executeRollover` resolves an unknown template to "no destination").
   Confirm errors now surface the server's French `body.message`.

Verified: 965/965 unit tests (14 new for `student-decisions`, 3 new for the
confirm guard), lint + typecheck, and a Playwright pass on the dev server:
Step 3 reached from Step 2, options for a « Fin de cursus » 3ème class =
« Comme la classe → non réinscrit | Redouble → 3ème A | Autre classe →
3ème B (3ème) », redouble/autre → badge « Redoublant », summary line
updates live, class filter + search, draft `PATCH` body =
`{ studentExceptions: { <id>: { destClassId } … } }` → 200, Step 4 counters
7 / 2 / 3 with « Redoublant » badges and « promouvra 7 élèves
(2 redoublants) », decisions persisted across reload, no page overflow at
375 px.
