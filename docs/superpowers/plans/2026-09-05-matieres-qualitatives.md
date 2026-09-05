# Matières qualitatives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a school mark a subject as "qualitative" (rated criterion by criterion on an ordered scale, e.g. Comportement: Toujours / Souvent / Parfois / Jamais), enter and publish those ratings per class-subject and term from the teacher portal and the school app, keep every numeric average, rank and report-card table untouched by such subjects, and expose the published grids to the student portal and to the bulletin view.

**Architecture:** `Subject` gains `evaluationMode` + `ratingScale`; three new tables mirror the numeric trio (`SubjectCriterion` ~ nothing, `CriteriaAssessment` ~ `Evaluation`, `CriteriaRating` ~ `Grade`). All numeric consumers spread one shared `NUMERIC_SUBJECT_FILTER` into their `ClassSubject` query so qualitative subjects never reach `grades.ts`. Entry goes through one server lib (`criteria-assessment.ts`) used by a teacher route and a school route with identical contracts, and one shared client editor rendered by both portals. Read side for students is a `student-views`-style helper reused by the bulletin view.

**Tech Stack:** Next.js 16 App Router route handlers, Prisma 5 (hand-written SQL migration, never `migrate dev`/`db push`), zod, Vitest + `prismaMock`, next-intl (fr/ht/en), Tailwind v4, existing UI primitives.

**Spec:** `docs/superpowers/specs/2026-09-05-bulletin-prescolaire-et-pages-design.md` (this plan implements §4, §5, §6, §7 and the parts of §13/§14 that belong to them; §8 to §12 are plans 2 and 3).

## Global Constraints

- Every route handler starts with `export const runtime = 'nodejs'` (tripwire `runtime-enforcement.test.ts`).
- Every new `/api/school/*` handler calls `requireSchoolPermission(userId, module, action, requestId)` (tripwire `school-permission-enforcement.test.ts`); teacher routes use `resolveMySchoolIncludingTeacher` + `resolveMyTeacherProfile`, ownership = `myTeacher.classSubjectIds.includes(id)` else 404; student routes use `requireStudent(req)`.
- Mutations: `verifyCsrf(req)` first, then `requireAuth()`. Errors are `{ error: 'CODE', message }` with the `x-request-id` header, exactly like the surrounding routes.
- Shared database: never run `prisma migrate dev`, `prisma db push`, `prisma migrate reset`. Only `pnpm --filter frontend exec prisma generate` (local codegen) is allowed. The migration SQL is applied by the reviewer at merge time.
- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`: no `any`, no non-null assertions to silence errors.
- Message keys must exist in all three locales (`fr`, `ht`, `en`) with identical key sets (`locales.test.ts`); `ht` files keep their file-level `_review` key. User-facing strings never contain an em dash (use `.`, `,`, `:` or `·`).
- Fork-on-write for bulletin templates is out of this plan's scope (no template config is touched here) but must not be weakened by anything added.
- Concurrent sessions share the git index: `git add` explicit paths only, never `git add -A`/`git add .`; never touch files you did not change.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Before each commit: `pnpm format` on the touched files' package (`pnpm format` from repo root formats the whole workspace, that is fine), then `pnpm lint`, `pnpm typecheck` and the task's tests must pass.
- Run all commands from the repo root (`/…/ekolplus2` or the worktree root). `pnpm --filter frontend exec vitest run <path relative to frontend/>` runs one test file.

## Rulings made while planning (deviations from the spec text)

1. **Screen paths.** Spec §5.2 says `carnet-de-notes/[classSubjectId]/criteres`. Both gradebook folders already own a dynamic segment `[evaluationId]` at that level and Next.js refuses two differently named dynamic segments in one folder. The screens therefore live under a static segment: `espace-enseignant/carnet-de-notes/criteres/[classSubjectId]` and `pedagogie/carnet-de-notes/criteres/[classSubjectId]`.
2. **Migration folder.** Spec §13 names one migration `38_bulletin_prescolaire_pages` for all three plans. Each plan ships its own migration instead; this plan creates `38_qualitative_subjects` (Task 1 verifies no other `38_*` appeared meanwhile and renumbers if so). Plans 2 and 3 take the next free numbers.
3. **Appreciation screens keep qualitative subjects.** §6 only excludes qualitative subjects from averages, ranks and the numeric bulletin table. The three appreciation query sites (`student-views/appreciations.ts`, `api/teacher/students/[id]/appreciations`, `api/school/classes/[id]/appreciations`) are left unchanged so a teacher can still write a comment on "Comportement"; a subject with no evaluations already yields a null average there.
4. **Criteria can be created while the stored mode is still NUMERIC.** The form lets the user switch the mode and add criteria before saving the profile; the criteria routes therefore do not check `evaluationMode`. Criteria are only ever displayed and rated for QUALITATIVE subjects.
5. **`hasRatings` on the subject detail** drives the form: move arrows of the scale editor are hidden when true (§4 amended rule), and the criteria editor shows "used" on criteria that cannot be deleted through a per-criterion `ratingCount`.
6. **`GRADE_ENTRY_DISABLED` answers 403, not 409.** The spec says "409 … comme `PUT /api/teacher/evaluations/[id]/grades`"; that route answers 403 and the client switches on `ApiError.code`, so one behaviour per code wins.
7. **Sheet `GET` resolves the term itself.** `?termId=` is optional (absent = current term by date, the notebooks' rule) and the sheet carries `terms[]` of the class year, so the two entry pages need no second request for the term picker.
8. **Copy lives under `Gradebook.criteria.*` only.** The entry screen is one shared component; the teacher portal borrows the `Gradebook` namespace wholesale already (recorded precedent), so `teacherGradebook.json` gains no keys.

## File map

| Path | Responsibility |
|---|---|
| `frontend/prisma/schema.prisma` | `Subject.evaluationMode/ratingScale/criteria`, models `SubjectCriterion`, `CriteriaAssessment`, `CriteriaRating`, back-relations |
| `frontend/prisma/migrations/38_qualitative_subjects/migration.sql` | Hand-written SQL for the above |
| `frontend/src/lib/qualitative.ts` (+ `.test.ts`) | Pure, client-safe constants and `normalizeRatingScale` |
| `frontend/src/lib/server/qualitative.ts` (+ `.test.ts`) | `NUMERIC_SUBJECT_FILTER`, `resolveQualitativeProfile`, `findQualitativeConflict`, 409 messages |
| `frontend/src/lib/server/subjects.ts` | Profile body + select + detail gain the new fields, `criteria`, `hasRatings` |
| `frontend/src/app/api/school/subjects/route.ts`, `[id]/route.ts` (+ new `[id]/route.test.ts`) | POST/PATCH write the resolved profile, 409 guards |
| `frontend/src/app/api/school/subjects/[id]/criteria/route.ts`, `criteria/[criterionId]/route.ts`, `criteria/reorder/route.ts` (+ `criteria/route.test.ts`) | Criteria CRUD + reorder |
| 6 numeric query sites (Task 4) + `api/school/evaluations/route.ts` + `api/teacher/evaluations/route.ts` | `NUMERIC_SUBJECT_FILTER`, `SUBJECT_NOT_NUMERIC` |
| `frontend/src/lib/server/criteria-assessment.ts` (+ `.test.ts`) | Sheet read model (virtual empty sheet), save with validation |
| `frontend/src/app/api/teacher/class-subjects/[id]/criteria-assessment/route.ts` (+ test) | Teacher GET/PUT |
| `frontend/src/app/api/school/class-subjects/[id]/criteria-assessment/route.ts` (+ test) | School GET/PUT |
| `frontend/src/lib/server/student-views/criteria.ts` (+ `.test.ts`) | Published grids of one student for one term |
| `frontend/src/app/api/student/criteria-assessments/route.ts` (+ test) | Student GET |
| `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts` (+ test) | `qualitativeSubjects` on the view |
| `frontend/src/components/school/subjects/RatingScaleEditor.tsx`, `CriteriaEditor.tsx`, `SubjectForm.tsx`, `useSubjectForm.ts` | Subject form: mode, scale, criteria |
| `frontend/src/app/(school)/configuration/matieres/types.ts`, `[id]/page.tsx` | Types + wiring of the criteria editor |
| `frontend/src/components/gradebook/CriteriaSheetEditor.tsx` | Shared entry screen (per-student grid, prev/next, draft/validate) |
| `frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/criteres/[classSubjectId]/page.tsx`, `frontend/src/app/(school)/pedagogie/carnet-de-notes/criteres/[classSubjectId]/page.tsx` | Thin pages around the editor |
| Both gradebook list pages, `api/school/class-subjects/route.ts`, `api/teacher/me/route.ts`, `pedagogie/carnet-de-notes/types.ts` | `evaluationMode` in the option payloads, qualitative branch |
| `frontend/src/app/(eleve)/eleve/notes/page.tsx`, `frontend/src/components/student/QualitativeGridsCard.tsx` | Student read-only grids |
| `frontend/src/messages/{fr,ht,en}/configuration.json`, `gradebook.json`, `teacherGradebook.json`, `elevePortal.json` | Copy |
| `CLAUDE.md` | One paragraph documenting the feature |

## Conventions every task follows

**School route boilerplate (copy verbatim, adapt module/action):**

```ts
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const perm = await requireSchoolPermission(auth.user.sub, 'configuration', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;
    const { id } = await params;
    // ...
    return NextResponse.json({ /* ... */ }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

Mutations add `const csrfFail = verifyCsrf(req); if (csrfFail) return csrfFail;` as the first statement inside `withRequestContext`, before `requireAuth()`.

**School route test preamble (copy verbatim):**

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchool: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';

const authUser = { user: { sub: 'user_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };

function req(method: string, url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(authUser as never);
  vi.mocked(verifyCsrf).mockReturnValue(null);
  vi.mocked(resolveMySchool).mockResolvedValue(adminSchool);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});
```

`requireSchoolPermission` resolves through `resolveMySchool`; an ADMIN passes every module/action.

**Teacher route test preamble:** same as above but the `@/lib/server/school` mock exposes `resolveMySchoolIncludingTeacher: vi.fn()` and `resolveMyTeacherProfile: vi.fn()` instead of `resolveMySchool`, `memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const }`, and `beforeEach` sets `vi.mocked(resolveMySchoolIncludingTeacher).mockResolvedValue(memberSchool); vi.mocked(resolveMyTeacherProfile).mockResolvedValue({ teacherId: 'tea_1', classSubjectIds: ['cs_1'], homeroomClassIds: [] });`.

**Student route test preamble:** `vi.mock('@/lib/server/middleware/require-student', () => ({ requireStudent: vi.fn() }));` and `studentCtx = { user: { sub: 'user_1', email: 'eleve@test.local' }, student: { studentId: 'stu_1', schoolId: 'school_1', classId: 'cls_1', academicYearId: 'year_1' } }`.

---

### Task 1: Prisma schema + hand-written migration

**Files:**
- Modify: `frontend/prisma/schema.prisma` (models `Subject` line ~358, `ClassSubject` ~541, `Term` ~287, `Student` ~568)
- Create: `frontend/prisma/migrations/38_qualitative_subjects/migration.sql`

**Interfaces:**
- Produces: Prisma models `SubjectCriterion { id, subjectId, label, order, createdAt, updatedAt }`, `CriteriaAssessment { id, classSubjectId, termId, status, createdAt, updatedAt }` with unique `classSubjectId_termId`, `CriteriaRating { id, assessmentId, studentId, criterionId, level, updatedAt }` with unique `assessmentId_studentId_criterionId`; `Subject.evaluationMode: string` (default `'NUMERIC'`), `Subject.ratingScale: string[]` (default `[]`), relations `Subject.criteria`, `ClassSubject.criteriaAssessments`, `Term.criteriaAssessments`, `Student.criteriaRatings`.

- [ ] **Step 1: Verify the migration number is free**

Run: `ls frontend/prisma/migrations | grep '^38_' ; echo "exit=$?"`
Expected: no line printed, `exit=1`. If a `38_*` folder exists, use the next free number everywhere this task says `38_qualitative_subjects` and mention it in your report.

- [ ] **Step 2: Add the fields and models to the schema**

In `model Subject`, right after the line `showOnBulletin       Boolean  @default(true)`, add:

```prisma
  // NUMERIC | QUALITATIVE. A qualitative subject has no evaluations and no
  // numeric grades, is skipped by every average, and is rated criterion by
  // criterion on `ratingScale` (spec 2026-09-05 §4).
  evaluationMode       String   @default("NUMERIC")
  // Ordered scale of a QUALITATIVE subject, 2 to 6 labels, e.g.
  // ["Toujours","Souvent","Parfois","Jamais"]. Ratings store the index into
  // this array. Empty in NUMERIC mode.
  ratingScale          String[] @default([])
```

In the same model, right after `chapters      SubjectChapter[]`, add:

```prisma
  criteria      SubjectCriterion[]
```

In `model ClassSubject`, right after `evaluations Evaluation[]`, add:

```prisma
  criteriaAssessments CriteriaAssessment[]
```

In `model Term`, right after `chapters      SubjectChapter[]`, add:

```prisma
  criteriaAssessments CriteriaAssessment[]
```

In `model Student`, right after `feeReminderLogs FeeReminderLog[]`, add:

```prisma
  criteriaRatings CriteriaRating[]
```

Immediately before the line `model ClassSubject {`, insert the three new models:

```prisma
// One criterion of a QUALITATIVE subject ("Respecte les consignes", ...).
// Ordered by `order`; deleting a criterion that has ratings is refused by the
// API (409 CRITERION_IN_USE), the cascade only fires with the subject.
model SubjectCriterion {
  id        String   @id @default(cuid())
  subjectId String
  subject   Subject  @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  label     String
  order     Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  ratings CriteriaRating[]

  @@index([subjectId, order])
}

// One sheet per class-subject and term, mirror of Evaluation for qualitative
// subjects. DRAFT | PUBLISHED; only PUBLISHED sheets reach students and the
// bulletin.
model CriteriaAssessment {
  id             String       @id @default(cuid())
  classSubjectId String
  classSubject   ClassSubject @relation(fields: [classSubjectId], references: [id], onDelete: Cascade)
  termId         String
  term           Term         @relation(fields: [termId], references: [id], onDelete: Cascade)
  status         String       @default("DRAFT")
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  ratings CriteriaRating[]

  @@unique([classSubjectId, termId])
}

// One tick per student and criterion on a sheet, mirror of Grade.
// `level` is the index into Subject.ratingScale.
model CriteriaRating {
  id           String             @id @default(cuid())
  assessmentId String
  assessment   CriteriaAssessment @relation(fields: [assessmentId], references: [id], onDelete: Cascade)
  studentId    String
  student      Student            @relation(fields: [studentId], references: [id], onDelete: Cascade)
  criterionId  String
  criterion    SubjectCriterion   @relation(fields: [criterionId], references: [id], onDelete: Cascade)
  level        Int
  updatedAt    DateTime           @updatedAt

  @@unique([assessmentId, studentId, criterionId])
  @@index([studentId])
}

```

- [ ] **Step 3: Validate the schema**

Run: `pnpm --filter frontend exec prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Write the migration SQL by hand**

Create `frontend/prisma/migrations/38_qualitative_subjects/migration.sql`:

```sql
-- Qualitative subjects (spec docs/superpowers/specs/2026-09-05-bulletin-prescolaire-et-pages-design.md §4).
-- Hand-written: the shared dev database is never touched by `migrate dev`.

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN "evaluationMode" TEXT NOT NULL DEFAULT 'NUMERIC',
ADD COLUMN "ratingScale" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "SubjectCriterion" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriteriaAssessment" (
    "id" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CriteriaAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriteriaRating" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CriteriaRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubjectCriterion_subjectId_order_idx" ON "SubjectCriterion"("subjectId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "CriteriaAssessment_classSubjectId_termId_key" ON "CriteriaAssessment"("classSubjectId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "CriteriaRating_assessmentId_studentId_criterionId_key" ON "CriteriaRating"("assessmentId", "studentId", "criterionId");

-- CreateIndex
CREATE INDEX "CriteriaRating_studentId_idx" ON "CriteriaRating"("studentId");

-- AddForeignKey
ALTER TABLE "SubjectCriterion" ADD CONSTRAINT "SubjectCriterion_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriteriaAssessment" ADD CONSTRAINT "CriteriaAssessment_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "ClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriteriaAssessment" ADD CONSTRAINT "CriteriaAssessment_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriteriaRating" ADD CONSTRAINT "CriteriaRating_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "CriteriaAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriteriaRating" ADD CONSTRAINT "CriteriaRating_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriteriaRating" ADD CONSTRAINT "CriteriaRating_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "SubjectCriterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 5: Cross-check the SQL against what Prisma would generate (no database involved)**

Run: `pnpm --filter frontend exec prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > /tmp/claude-1000/full-schema.sql 2>/dev/null; grep -n 'CriteriaRating\|CriteriaAssessment\|SubjectCriterion\|evaluationMode\|ratingScale' /tmp/claude-1000/full-schema.sql`
Expected: the same column types, constraint names and index names as Step 4 (Prisma prints `"ratingScale" TEXT[] DEFAULT ARRAY[]::TEXT[]` and the `_pkey`/`_key`/`_idx`/`_fkey` names above). Fix any drift in the migration file, never in the schema. If the scratch directory does not exist, write to any path under your session scratchpad instead.

- [ ] **Step 6: Regenerate the Prisma client (local codegen only) and typecheck**

Run: `pnpm --filter frontend exec prisma generate && pnpm typecheck`
Expected: generate succeeds; typecheck passes (nothing references the new models yet).

- [ ] **Step 7: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/38_qualitative_subjects/migration.sql
git commit -m "feat(subjects): qualitative subject schema + migration 38

Subject.evaluationMode/ratingScale, SubjectCriterion, CriteriaAssessment,
CriteriaRating (spec 2026-09-05 §4). Hand-written SQL, applied at merge.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Qualitative profile: shared rules, server lib, subject routes

**Files:**
- Create: `frontend/src/lib/qualitative.ts`, `frontend/src/lib/qualitative.test.ts`
- Create: `frontend/src/lib/server/qualitative.ts`, `frontend/src/lib/server/qualitative.test.ts`
- Modify: `frontend/src/lib/server/subjects.ts` (`SubjectProfileBody` lines 27-57, `splitSubjectInput` 73-83, `SUBJECT_PROFILE_SELECT` 116-145, `getSubjectDetail` 156-283)
- Modify: `frontend/src/app/api/school/subjects/route.ts` (POST, the `splitSubjectInput(input)` line ~153)
- Modify: `frontend/src/app/api/school/subjects/[id]/route.ts` (PATCH, lines 119-145)
- Create: `frontend/src/app/api/school/subjects/[id]/route.test.ts`

**Interfaces:**
- Consumes: Task 1 models.
- Produces:
  - `@/lib/qualitative`: `EVALUATION_MODES`, `type EvaluationMode = 'NUMERIC' | 'QUALITATIVE'`, `RATING_SCALE_MIN = 2`, `RATING_SCALE_MAX = 6`, `RATING_LABEL_MAX = 30`, `CRITERION_LABEL_MAX = 80`, `normalizeRatingScale(labels: readonly string[]): { ok: true; scale: string[] } | { ok: false; error: RatingScaleError }`.
  - `@/lib/server/qualitative`: `NUMERIC_SUBJECT_FILTER = { subject: { evaluationMode: 'NUMERIC' } }`, `resolveQualitativeProfile(next: QualitativeProfile): { ok: true; profile: QualitativeProfile } | { ok: false; message: string }`, `findQualitativeConflict(subjectId, current, next): Promise<QualitativeConflict | null>`, `QUALITATIVE_CONFLICT_MESSAGES`.
  - `splitSubjectInput(input)` now returns `{ data, prerequisiteIds, qualitativeInput }` where `qualitativeInput: { evaluationMode: EvaluationMode | undefined; ratingScale: string[] | undefined } | null`.
  - `SUBJECT_PROFILE_SELECT` includes `evaluationMode`, `ratingScale`; `getSubjectDetail` returns additionally `criteria: { id: string; label: string; order: number; ratingCount: number }[]` and `hasRatings: boolean`.
  - Subject API bodies accept `evaluationMode?: 'NUMERIC' | 'QUALITATIVE'` and `ratingScale?: string[]`; PATCH returns 409 `SUBJECT_HAS_EVALUATIONS` / `SUBJECT_HAS_RATINGS` / `SCALE_LEVEL_IN_USE`, 400 `VALIDATION_FAILED` on an invalid scale.

- [ ] **Step 1: Write the failing test for the pure rules**

Create `frontend/src/lib/qualitative.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeRatingScale } from './qualitative';

describe('normalizeRatingScale', () => {
  it('trims labels and accepts 2 to 6 distinct non-empty ones', () => {
    expect(normalizeRatingScale([' Toujours ', 'Souvent', 'Parfois', 'Jamais'])).toEqual({
      ok: true,
      scale: ['Toujours', 'Souvent', 'Parfois', 'Jamais'],
    });
    expect(normalizeRatingScale(['A', 'B']).ok).toBe(true);
    expect(normalizeRatingScale(['A', 'B', 'C', 'D', 'E', 'F']).ok).toBe(true);
  });

  it('refuses fewer than 2 or more than 6 labels', () => {
    expect(normalizeRatingScale(['Seul'])).toEqual({ ok: false, error: 'TOO_FEW' });
    expect(normalizeRatingScale(['A', 'B', 'C', 'D', 'E', 'F', 'G'])).toEqual({
      ok: false,
      error: 'TOO_MANY',
    });
  });

  it('refuses empty, over-long and duplicate labels (after trim)', () => {
    expect(normalizeRatingScale(['A', '   '])).toEqual({ ok: false, error: 'EMPTY_LABEL' });
    expect(normalizeRatingScale(['A', 'x'.repeat(31)])).toEqual({
      ok: false,
      error: 'LABEL_TOO_LONG',
    });
    expect(normalizeRatingScale(['Bien', ' Bien '])).toEqual({
      ok: false,
      error: 'DUPLICATE_LABEL',
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/qualitative.test.ts`
Expected: FAIL, cannot resolve `./qualitative`.

- [ ] **Step 3: Write the pure module**

Create `frontend/src/lib/qualitative.ts`:

```ts
// Qualitative subjects: the pure, client-safe half (no server-only, no
// Prisma), shared by the subject form and by lib/server/qualitative.ts.
// Spec: docs/superpowers/specs/2026-09-05-bulletin-prescolaire-et-pages-design.md §4.
export const EVALUATION_MODES = ['NUMERIC', 'QUALITATIVE'] as const;
export type EvaluationMode = (typeof EVALUATION_MODES)[number];

export const RATING_SCALE_MIN = 2;
export const RATING_SCALE_MAX = 6;
export const RATING_LABEL_MAX = 30;
export const CRITERION_LABEL_MAX = 80;

export type RatingScaleError =
  | 'TOO_FEW'
  | 'TOO_MANY'
  | 'EMPTY_LABEL'
  | 'LABEL_TOO_LONG'
  | 'DUPLICATE_LABEL';

export type NormalizedRatingScale =
  | { ok: true; scale: string[] }
  | { ok: false; error: RatingScaleError };

/**
 * Trims every label and checks the §4 rules: 2 to 6 labels, none empty,
 * none longer than RATING_LABEL_MAX, all distinct after trim. The first
 * broken rule wins.
 */
export function normalizeRatingScale(labels: readonly string[]): NormalizedRatingScale {
  const scale = labels.map((label) => label.trim());
  if (scale.length < RATING_SCALE_MIN) return { ok: false, error: 'TOO_FEW' };
  if (scale.length > RATING_SCALE_MAX) return { ok: false, error: 'TOO_MANY' };
  if (scale.some((label) => label.length === 0)) return { ok: false, error: 'EMPTY_LABEL' };
  if (scale.some((label) => label.length > RATING_LABEL_MAX)) {
    return { ok: false, error: 'LABEL_TOO_LONG' };
  }
  if (new Set(scale).size !== scale.length) return { ok: false, error: 'DUPLICATE_LABEL' };
  return { ok: true, scale };
}
```

- [ ] **Step 4: Run the pure test, expect PASS**

Run: `pnpm --filter frontend exec vitest run src/lib/qualitative.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Write the failing test for the server lib**

Create `frontend/src/lib/server/qualitative.test.ts`:

```ts
// prismaMock first (auto-hoists vi.mock for '@/lib/server/prisma').
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NUMERIC_SUBJECT_FILTER,
  findQualitativeConflict,
  resolveQualitativeProfile,
} from './qualitative';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveQualitativeProfile', () => {
  it('NUMERIC always stores an empty scale', () => {
    expect(
      resolveQualitativeProfile({ evaluationMode: 'NUMERIC', ratingScale: ['A', 'B'] }),
    ).toEqual({ ok: true, profile: { evaluationMode: 'NUMERIC', ratingScale: [] } });
  });

  it('QUALITATIVE normalizes the scale or says why it is invalid', () => {
    expect(
      resolveQualitativeProfile({ evaluationMode: 'QUALITATIVE', ratingScale: [' Bien', 'Mal '] }),
    ).toEqual({ ok: true, profile: { evaluationMode: 'QUALITATIVE', ratingScale: ['Bien', 'Mal'] } });
    expect(
      resolveQualitativeProfile({ evaluationMode: 'QUALITATIVE', ratingScale: ['Seul'] }),
    ).toEqual({ ok: false, message: 'ratingScale needs at least 2 labels' });
  });
});

describe('findQualitativeConflict', () => {
  const numeric = { evaluationMode: 'NUMERIC', ratingScale: [] as string[] };
  const qualitative = { evaluationMode: 'QUALITATIVE', ratingScale: ['A', 'B', 'C'] };
  const toQualitative = { evaluationMode: 'QUALITATIVE' as const, ratingScale: ['A', 'B'] };

  it('NUMERIC to QUALITATIVE is refused while evaluations exist', async () => {
    prismaMock.evaluation.count.mockResolvedValue(2);
    expect(await findQualitativeConflict('subj_1', numeric, toQualitative)).toBe(
      'SUBJECT_HAS_EVALUATIONS',
    );
    expect(prismaMock.evaluation.count).toHaveBeenCalledWith({
      where: { classSubject: { subjectId: 'subj_1' } },
    });
    prismaMock.evaluation.count.mockResolvedValue(0);
    expect(await findQualitativeConflict('subj_1', numeric, toQualitative)).toBeNull();
  });

  it('QUALITATIVE to NUMERIC is refused while ratings exist', async () => {
    prismaMock.criteriaRating.count.mockResolvedValue(1);
    expect(
      await findQualitativeConflict('subj_1', qualitative, {
        evaluationMode: 'NUMERIC',
        ratingScale: [],
      }),
    ).toBe('SUBJECT_HAS_RATINGS');
    expect(prismaMock.criteriaRating.count).toHaveBeenCalledWith({
      where: { criterion: { subjectId: 'subj_1' } },
    });
  });

  it('shrinking the scale is refused only when a removed level is in use', async () => {
    prismaMock.criteriaRating.count.mockResolvedValue(1);
    expect(await findQualitativeConflict('subj_1', qualitative, toQualitative)).toBe(
      'SCALE_LEVEL_IN_USE',
    );
    expect(prismaMock.criteriaRating.count).toHaveBeenCalledWith({
      where: { criterion: { subjectId: 'subj_1' }, level: { gte: 2 } },
    });
    prismaMock.criteriaRating.count.mockResolvedValue(0);
    expect(await findQualitativeConflict('subj_1', qualitative, toQualitative)).toBeNull();
  });

  it('renaming or growing the scale never queries', async () => {
    expect(
      await findQualitativeConflict('subj_1', qualitative, {
        evaluationMode: 'QUALITATIVE',
        ratingScale: ['X', 'Y', 'Z', 'W'],
      }),
    ).toBeNull();
    expect(prismaMock.criteriaRating.count).not.toHaveBeenCalled();
    expect(prismaMock.evaluation.count).not.toHaveBeenCalled();
  });

  it('exposes the filter numeric consumers spread into their ClassSubject where', () => {
    expect(NUMERIC_SUBJECT_FILTER).toEqual({ subject: { evaluationMode: 'NUMERIC' } });
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/qualitative.test.ts`
Expected: FAIL, cannot resolve `./qualitative`.

- [ ] **Step 7: Write the server lib**

Create `frontend/src/lib/server/qualitative.ts`:

```ts
// Qualitative subjects, server half: profile resolution for the subject
// routes, the §4 transition guards (409 codes) and the filter every numeric
// consumer spreads into its ClassSubject query (§6).
// Spec: docs/superpowers/specs/2026-09-05-bulletin-prescolaire-et-pages-design.md.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import {
  type EvaluationMode,
  type RatingScaleError,
  normalizeRatingScale,
} from '@/lib/qualitative';

/**
 * Spread into `prisma.classSubject.findMany({ where: { classId, ...NUMERIC_SUBJECT_FILTER } })`
 * by every consumer that computes or displays numeric grades. A QUALITATIVE
 * subject never has evaluations, so it must neither show up as an empty
 * row nor be offered for a new evaluation.
 */
export const NUMERIC_SUBJECT_FILTER = { subject: { evaluationMode: 'NUMERIC' } } as const;

const SCALE_ERROR_MESSAGE: Record<RatingScaleError, string> = {
  TOO_FEW: 'ratingScale needs at least 2 labels',
  TOO_MANY: 'ratingScale allows at most 6 labels',
  EMPTY_LABEL: 'ratingScale labels must not be empty',
  LABEL_TOO_LONG: 'ratingScale labels must be 30 characters or fewer',
  DUPLICATE_LABEL: 'ratingScale labels must be distinct',
};

export interface QualitativeProfile {
  evaluationMode: EvaluationMode;
  ratingScale: string[];
}

/**
 * Resolves the pair the subject routes write: NUMERIC always stores an empty
 * scale; QUALITATIVE requires a valid scale (trimmed, 2 to 6 distinct labels).
 */
export function resolveQualitativeProfile(
  next: QualitativeProfile,
): { ok: true; profile: QualitativeProfile } | { ok: false; message: string } {
  if (next.evaluationMode === 'NUMERIC') {
    return { ok: true, profile: { evaluationMode: 'NUMERIC', ratingScale: [] } };
  }
  const normalized = normalizeRatingScale(next.ratingScale);
  if (!normalized.ok) return { ok: false, message: SCALE_ERROR_MESSAGE[normalized.error] };
  return { ok: true, profile: { evaluationMode: 'QUALITATIVE', ratingScale: normalized.scale } };
}

export type QualitativeConflict =
  | 'SUBJECT_HAS_EVALUATIONS'
  | 'SUBJECT_HAS_RATINGS'
  | 'SCALE_LEVEL_IN_USE';

export const QUALITATIVE_CONFLICT_MESSAGES: Record<QualitativeConflict, string> = {
  SUBJECT_HAS_EVALUATIONS:
    'Cette matière a déjà des évaluations notées. Supprimez-les avant de passer en mode critères.',
  SUBJECT_HAS_RATINGS:
    'Cette matière a déjà des critères cochés. Effacez-les avant de repasser en mode notes.',
  SCALE_LEVEL_IN_USE: "Un niveau de l'échelle que vous retirez est déjà utilisé par une coche.",
};

/**
 * §4 transition rules, checked by PATCH before writing:
 * - NUMERIC to QUALITATIVE is refused while any evaluation exists on one of
 *   the subject's class-subjects;
 * - QUALITATIVE to NUMERIC is refused while any rating exists;
 * - shrinking the scale is refused while a rating uses a removed level
 *   (ratings store the index, so "removed" means index >= new length).
 * Renaming levels and growing the scale are always allowed and never query.
 */
export async function findQualitativeConflict(
  subjectId: string,
  current: { evaluationMode: string; ratingScale: string[] },
  next: QualitativeProfile,
): Promise<QualitativeConflict | null> {
  if (current.evaluationMode === 'NUMERIC' && next.evaluationMode === 'QUALITATIVE') {
    const evaluations = await prisma.evaluation.count({
      where: { classSubject: { subjectId } },
    });
    return evaluations > 0 ? 'SUBJECT_HAS_EVALUATIONS' : null;
  }
  if (current.evaluationMode === 'QUALITATIVE' && next.evaluationMode === 'NUMERIC') {
    const ratings = await prisma.criteriaRating.count({ where: { criterion: { subjectId } } });
    return ratings > 0 ? 'SUBJECT_HAS_RATINGS' : null;
  }
  if (
    current.evaluationMode === 'QUALITATIVE' &&
    next.ratingScale.length < current.ratingScale.length
  ) {
    const inUse = await prisma.criteriaRating.count({
      where: { criterion: { subjectId }, level: { gte: next.ratingScale.length } },
    });
    return inUse > 0 ? 'SCALE_LEVEL_IN_USE' : null;
  }
  return null;
}
```

- [ ] **Step 8: Run the server lib test, expect PASS**

Run: `pnpm --filter frontend exec vitest run src/lib/server/qualitative.test.ts`
Expected: 7 passed.

- [ ] **Step 9: Extend `subjects.ts`**

In `frontend/src/lib/server/subjects.ts`:

(a) Add the import after `import { prisma } from '@/lib/server/prisma';`:

```ts
import { EVALUATION_MODES, type EvaluationMode } from '@/lib/qualitative';
```

(b) In `SubjectProfileBody`, right after `showOnBulletin: z.boolean().optional(),`, add:

```ts
  evaluationMode: z.enum(EVALUATION_MODES).optional(),
  // Raw labels; trimmed and rule-checked by resolveQualitativeProfile
  // (lib/server/qualitative.ts) before anything is written.
  ratingScale: z.array(z.string().max(200)).max(20).optional(),
```

(c) Replace the whole `splitSubjectInput` function with:

```ts
/**
 * Splits the validated body into scalar Prisma data + relation ids.
 * `evaluationMode` / `ratingScale` are kept apart: the routes only write them
 * after `resolveQualitativeProfile` + `findQualitativeConflict`.
 */
export function splitSubjectInput(input: SubjectProfileInput) {
  const { prerequisiteIds, status, evaluationMode, ratingScale, ...scalars } = input;
  const data: Record<string, unknown> = Object.fromEntries(
    Object.entries(scalars).filter(([, v]) => v !== undefined),
  );
  if (status !== undefined) {
    data.status = status;
    data.isActive = isActiveFromStatus(status);
  }
  const qualitativeInput: {
    evaluationMode: EvaluationMode | undefined;
    ratingScale: string[] | undefined;
  } | null =
    evaluationMode !== undefined || ratingScale !== undefined
      ? { evaluationMode, ratingScale }
      : null;
  return { data, prerequisiteIds, qualitativeInput };
}
```

(d) In `SUBJECT_PROFILE_SELECT`, right after `showOnBulletin: true,`, add:

```ts
  evaluationMode: true,
  ratingScale: true,
```

(e) In `getSubjectDetail`, add to the first `select` (after `_count: { select: { chapters: true } },`):

```ts
      criteria: {
        orderBy: { order: 'asc' },
        select: { id: true, label: true, order: true, _count: { select: { ratings: true } } },
      },
```

Replace `const { _count, responsibleTeacher, prerequisites, ...profile } = subject;` with:

```ts
  const { _count, responsibleTeacher, prerequisites, criteria, ...profile } = subject;
  const criteriaRows = criteria.map((c) => ({
    id: c.id,
    label: c.label,
    order: c.order,
    ratingCount: c._count.ratings,
  }));
```

and add to the returned object, right after `chapterCount: _count.chapters,`:

```ts
    criteria: criteriaRows,
    // Drives the form: scale levels can be renamed but not reordered once a
    // rating exists (§4), so the move arrows hide.
    hasRatings: criteriaRows.some((c) => c.ratingCount > 0),
```

- [ ] **Step 10: Wire the subject routes**

In `frontend/src/app/api/school/subjects/[id]/route.ts`:

(a) Add the import after the `@/lib/server/subjects` import block:

```ts
import {
  QUALITATIVE_CONFLICT_MESSAGES,
  findQualitativeConflict,
  resolveQualitativeProfile,
} from '@/lib/server/qualitative';
import type { EvaluationMode } from '@/lib/qualitative';
```

(b) In `PATCH`, replace

```ts
    const { data, prerequisiteIds } = splitSubjectInput(input);
```

with

```ts
    const { data, prerequisiteIds, qualitativeInput } = splitSubjectInput(input);
    if (qualitativeInput) {
      const resolved = resolveQualitativeProfile({
        evaluationMode:
          qualitativeInput.evaluationMode ?? (existing.evaluationMode as EvaluationMode),
        ratingScale: qualitativeInput.ratingScale ?? existing.ratingScale,
      });
      if (!resolved.ok) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: resolved.message },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      const conflict = await findQualitativeConflict(id, existing, resolved.profile);
      if (conflict) {
        return NextResponse.json(
          { error: conflict, message: QUALITATIVE_CONFLICT_MESSAGES[conflict] },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      data.evaluationMode = resolved.profile.evaluationMode;
      data.ratingScale = resolved.profile.ratingScale;
    }
```

In `frontend/src/app/api/school/subjects/route.ts`:

(c) Add the import next to the other `@/lib/server/*` imports:

```ts
import { resolveQualitativeProfile } from '@/lib/server/qualitative';
```

(d) In `POST`, replace

```ts
    const { data, prerequisiteIds } = splitSubjectInput(input);
```

with

```ts
    const { data, prerequisiteIds, qualitativeInput } = splitSubjectInput(input);
    if (qualitativeInput) {
      const resolved = resolveQualitativeProfile({
        evaluationMode: qualitativeInput.evaluationMode ?? 'NUMERIC',
        ratingScale: qualitativeInput.ratingScale ?? [],
      });
      if (!resolved.ok) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: resolved.message },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      data.evaluationMode = resolved.profile.evaluationMode;
      data.ratingScale = resolved.profile.ratingScale;
    }
```

(If the existing `splitSubjectInput(input)` line in POST is not exactly `const { data, prerequisiteIds } = splitSubjectInput(input);`, adapt the destructuring but keep the inserted block identical.)

- [ ] **Step 11: Write the failing route test**

Create `frontend/src/app/api/school/subjects/[id]/route.test.ts` (preamble from "Conventions", then):

```ts
import { GET, PATCH } from './route';

const numericSubject = {
  id: 'subj_1',
  schoolId: 'school_1',
  name: 'Comportement',
  code: null,
  maxScore: 20,
  passingScore: 10,
  eliminatoryScore: null,
  evaluationMode: 'NUMERIC',
  ratingScale: [] as string[],
};
const qualitativeSubject = {
  ...numericSubject,
  evaluationMode: 'QUALITATIVE',
  ratingScale: ['Toujours', 'Souvent', 'Parfois', 'Jamais'],
};
const params = { params: Promise.resolve({ id: 'subj_1' }) };

function patch(body: unknown) {
  return PATCH(req('PATCH', '/api/school/subjects/subj_1', body), params);
}

describe('PATCH /api/school/subjects/[id] (qualitative profile)', () => {
  beforeEach(() => {
    prismaMock.subject.findUnique.mockResolvedValue(numericSubject as never);
    prismaMock.subject.update.mockResolvedValue({ id: 'subj_1' } as never);
  });

  it('writes a normalized scale when switching a fresh subject to QUALITATIVE', async () => {
    prismaMock.evaluation.count.mockResolvedValue(0);
    const res = await patch({ evaluationMode: 'QUALITATIVE', ratingScale: [' Oui ', 'Non'] });
    expect(res.status).toBe(200);
    expect(prismaMock.subject.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ evaluationMode: 'QUALITATIVE', ratingScale: ['Oui', 'Non'] }),
      }),
    );
  });

  it('400s an invalid scale before touching the database', async () => {
    const res = await patch({ evaluationMode: 'QUALITATIVE', ratingScale: ['Seul'] });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'VALIDATION_FAILED' });
    expect(prismaMock.subject.update).not.toHaveBeenCalled();
  });

  it('409 SUBJECT_HAS_EVALUATIONS when evaluations exist', async () => {
    prismaMock.evaluation.count.mockResolvedValue(3);
    const res = await patch({ evaluationMode: 'QUALITATIVE', ratingScale: ['A', 'B'] });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'SUBJECT_HAS_EVALUATIONS' });
    expect(prismaMock.subject.update).not.toHaveBeenCalled();
  });

  it('409 SUBJECT_HAS_RATINGS when going back to NUMERIC with ratings', async () => {
    prismaMock.subject.findUnique.mockResolvedValue(qualitativeSubject as never);
    prismaMock.criteriaRating.count.mockResolvedValue(1);
    const res = await patch({ evaluationMode: 'NUMERIC' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'SUBJECT_HAS_RATINGS' });
  });

  it('409 SCALE_LEVEL_IN_USE when a removed level is ticked; renaming is free', async () => {
    prismaMock.subject.findUnique.mockResolvedValue(qualitativeSubject as never);
    prismaMock.criteriaRating.count.mockResolvedValue(1);
    const shrink = await patch({ ratingScale: ['Toujours', 'Souvent', 'Parfois'] });
    expect(shrink.status).toBe(409);
    expect(await shrink.json()).toMatchObject({ error: 'SCALE_LEVEL_IN_USE' });

    const rename = await patch({ ratingScale: ['Always', 'Often', 'Sometimes', 'Never'] });
    expect(rename.status).toBe(200);
    expect(prismaMock.subject.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ratingScale: ['Always', 'Often', 'Sometimes', 'Never'] }),
      }),
    );
  });

  it('a PATCH without mode/scale leaves both untouched', async () => {
    await patch({ name: 'Conduite' });
    const call = prismaMock.subject.update.mock.calls[0]?.[0];
    expect(call?.data).not.toHaveProperty('evaluationMode');
    expect(call?.data).not.toHaveProperty('ratingScale');
  });
});

describe('GET /api/school/subjects/[id]', () => {
  it('returns criteria in order plus hasRatings', async () => {
    prismaMock.subject.findFirst.mockResolvedValue({
      ...qualitativeSubject,
      responsibleTeacher: null,
      prerequisites: [],
      _count: { chapters: 0 },
      criteria: [
        { id: 'cr_1', label: 'Respecte les consignes', order: 0, _count: { ratings: 2 } },
        { id: 'cr_2', label: 'Partage', order: 1, _count: { ratings: 0 } },
      ],
    } as never);
    prismaMock.academicYear.findFirst.mockResolvedValue(null);
    prismaMock.class.findMany.mockResolvedValue([]);
    prismaMock.classSubject.findMany.mockResolvedValue([]);
    const res = await GET(req('GET', '/api/school/subjects/subj_1'), params);
    expect(res.status).toBe(200);
    const { subject } = await res.json();
    expect(subject.criteria).toEqual([
      { id: 'cr_1', label: 'Respecte les consignes', order: 0, ratingCount: 2 },
      { id: 'cr_2', label: 'Partage', order: 1, ratingCount: 0 },
    ]);
    expect(subject.hasRatings).toBe(true);
    expect(subject.ratingScale).toEqual(['Toujours', 'Souvent', 'Parfois', 'Jamais']);
  });
});
```

- [ ] **Step 12: Run the route tests, expect PASS; run the existing subject tests too**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/subjects`
Expected: all pass (the new file and the pre-existing `subjects/route.test.ts` and `[id]/chapters/route.test.ts`). If `subjects/route.test.ts` asserted the exact `data` object of `prisma.subject.create`/`update` and now fails, the cause is the new `qualitativeInput` destructuring not being applied; the create/update payload must be unchanged when the body carries neither `evaluationMode` nor `ratingScale`.

- [ ] **Step 13: Format, lint, typecheck, commit**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: all clean.

```bash
git add frontend/src/lib/qualitative.ts frontend/src/lib/qualitative.test.ts frontend/src/lib/server/qualitative.ts frontend/src/lib/server/qualitative.test.ts frontend/src/lib/server/subjects.ts frontend/src/app/api/school/subjects/route.ts "frontend/src/app/api/school/subjects/[id]/route.ts" "frontend/src/app/api/school/subjects/[id]/route.test.ts"
git commit -m "feat(subjects): evaluationMode + ratingScale on the subject profile

Shared rating-scale rules, NUMERIC_SUBJECT_FILTER, transition guards
(SUBJECT_HAS_EVALUATIONS / SUBJECT_HAS_RATINGS / SCALE_LEVEL_IN_USE),
criteria + hasRatings on the subject detail (spec 2026-09-05 §4).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Criteria CRUD + reorder routes

**Files:**
- Create: `frontend/src/lib/server/subject-criteria.ts`
- Create: `frontend/src/app/api/school/subjects/[id]/criteria/route.ts` (GET, POST)
- Create: `frontend/src/app/api/school/subjects/[id]/criteria/[criterionId]/route.ts` (PATCH, DELETE)
- Create: `frontend/src/app/api/school/subjects/[id]/criteria/reorder/route.ts` (PUT)
- Create: `frontend/src/app/api/school/subjects/[id]/criteria/route.test.ts` (covers the three files)

**Interfaces:**
- Consumes: `CRITERION_LABEL_MAX` from `@/lib/qualitative` (Task 2).
- Produces: `GET …/criteria → { criteria: { id, label, order }[] }`; `POST …/criteria { label } → 201 { criterion }`; `PATCH …/criteria/[criterionId] { label } → { criterion }`; `DELETE …/criteria/[criterionId] → { ok: true }` or 409 `CRITERION_IN_USE`; `PUT …/criteria/reorder { ids: string[] } → { criteria }` (400 unless `ids` is exactly the subject's criteria set). Permissions: `configuration.view` for GET, `configuration.edit` for every write (a criterion is part of the subject's profile, so deleting one is an edit, not `configuration.delete`).

Route files may only export handlers and Next config, so the shared bits live in `lib/server/subject-criteria.ts`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/school/subjects/[id]/criteria/route.test.ts` (preamble from "Conventions", then):

```ts
import { GET, POST } from './route';
import { PATCH, DELETE } from './[criterionId]/route';
import { PUT } from './reorder/route';

const subjectParams = { params: Promise.resolve({ id: 'subj_1' }) };
const criterionParams = { params: Promise.resolve({ id: 'subj_1', criterionId: 'cr_1' }) };
const ownedSubject = { id: 'subj_1' };
const rows = [
  { id: 'cr_1', label: 'Respecte les consignes', order: 0 },
  { id: 'cr_2', label: 'Partage avec les autres', order: 1 },
];

beforeEach(() => {
  prismaMock.subject.findFirst.mockResolvedValue(ownedSubject as never);
  prismaMock.subjectCriterion.findMany.mockResolvedValue(rows as never);
});

describe('GET /api/school/subjects/[id]/criteria', () => {
  it('404s a subject of another school', async () => {
    prismaMock.subject.findFirst.mockResolvedValue(null);
    const res = await GET(req('GET', '/api/school/subjects/subj_1/criteria'), subjectParams);
    expect(res.status).toBe(404);
    expect(prismaMock.subject.findFirst).toHaveBeenCalledWith({
      where: { id: 'subj_1', schoolId: 'school_1' },
      select: { id: true },
    });
  });

  it('lists the criteria in order', async () => {
    const res = await GET(req('GET', '/api/school/subjects/subj_1/criteria'), subjectParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ criteria: rows });
    expect(prismaMock.subjectCriterion.findMany).toHaveBeenCalledWith({
      where: { subjectId: 'subj_1' },
      orderBy: { order: 'asc' },
      select: { id: true, label: true, order: true },
    });
  });
});

describe('POST /api/school/subjects/[id]/criteria', () => {
  it('400s an empty or over-long label', async () => {
    expect(
      (await POST(req('POST', '/api/school/subjects/subj_1/criteria', { label: '   ' }), subjectParams))
        .status,
    ).toBe(400);
    expect(
      (
        await POST(
          req('POST', '/api/school/subjects/subj_1/criteria', { label: 'x'.repeat(81) }),
          subjectParams,
        )
      ).status,
    ).toBe(400);
    expect(prismaMock.subjectCriterion.create).not.toHaveBeenCalled();
  });

  it('appends after the last criterion (order = last + 1, 0 when none)', async () => {
    prismaMock.subjectCriterion.findFirst.mockResolvedValue({ order: 4 } as never);
    prismaMock.subjectCriterion.create.mockResolvedValue({
      id: 'cr_new',
      label: 'Range son matériel',
      order: 5,
    } as never);
    const res = await POST(
      req('POST', '/api/school/subjects/subj_1/criteria', { label: '  Range son matériel ' }),
      subjectParams,
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      criterion: { id: 'cr_new', label: 'Range son matériel', order: 5 },
    });
    expect(prismaMock.subjectCriterion.create).toHaveBeenCalledWith({
      data: { subjectId: 'subj_1', label: 'Range son matériel', order: 5 },
      select: { id: true, label: true, order: true },
    });

    prismaMock.subjectCriterion.findFirst.mockResolvedValue(null);
    await POST(req('POST', '/api/school/subjects/subj_1/criteria', { label: 'Premier' }), subjectParams);
    expect(prismaMock.subjectCriterion.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { subjectId: 'subj_1', label: 'Premier', order: 0 } }),
    );
  });
});

describe('PATCH/DELETE /api/school/subjects/[id]/criteria/[criterionId]', () => {
  it('404s a criterion that is not on this subject', async () => {
    prismaMock.subjectCriterion.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      req('PATCH', '/api/school/subjects/subj_1/criteria/cr_1', { label: 'Nouveau' }),
      criterionParams,
    );
    expect(res.status).toBe(404);
    expect(prismaMock.subjectCriterion.findFirst).toHaveBeenCalledWith({
      where: { id: 'cr_1', subjectId: 'subj_1' },
      select: { id: true },
    });
  });

  it('renames a criterion', async () => {
    prismaMock.subjectCriterion.findFirst.mockResolvedValue({ id: 'cr_1' } as never);
    prismaMock.subjectCriterion.update.mockResolvedValue({
      id: 'cr_1',
      label: 'Nouveau',
      order: 0,
    } as never);
    const res = await PATCH(
      req('PATCH', '/api/school/subjects/subj_1/criteria/cr_1', { label: ' Nouveau ' }),
      criterionParams,
    );
    expect(res.status).toBe(200);
    expect(prismaMock.subjectCriterion.update).toHaveBeenCalledWith({
      where: { id: 'cr_1' },
      data: { label: 'Nouveau' },
      select: { id: true, label: true, order: true },
    });
  });

  it('409 CRITERION_IN_USE when a rating references it, deletes otherwise', async () => {
    prismaMock.subjectCriterion.findFirst.mockResolvedValue({ id: 'cr_1' } as never);
    prismaMock.criteriaRating.count.mockResolvedValue(1);
    const blocked = await DELETE(
      req('DELETE', '/api/school/subjects/subj_1/criteria/cr_1'),
      criterionParams,
    );
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ error: 'CRITERION_IN_USE' });
    expect(prismaMock.subjectCriterion.delete).not.toHaveBeenCalled();

    prismaMock.criteriaRating.count.mockResolvedValue(0);
    const ok = await DELETE(req('DELETE', '/api/school/subjects/subj_1/criteria/cr_1'), criterionParams);
    expect(ok.status).toBe(200);
    expect(prismaMock.subjectCriterion.delete).toHaveBeenCalledWith({ where: { id: 'cr_1' } });
  });
});

describe('PUT /api/school/subjects/[id]/criteria/reorder', () => {
  it('400s unless ids is exactly the current set', async () => {
    prismaMock.subjectCriterion.findMany.mockResolvedValueOnce(
      [{ id: 'cr_1' }, { id: 'cr_2' }] as never,
    );
    const res = await PUT(
      req('PUT', '/api/school/subjects/subj_1/criteria/reorder', { ids: ['cr_2', 'cr_ghost'] }),
      subjectParams,
    );
    expect(res.status).toBe(400);
    expect(prismaMock.subjectCriterion.update).not.toHaveBeenCalled();
  });

  it('writes order = index and returns the new list', async () => {
    prismaMock.subjectCriterion.findMany
      .mockResolvedValueOnce([{ id: 'cr_1' }, { id: 'cr_2' }] as never)
      .mockResolvedValueOnce([rows[1], rows[0]] as never);
    const res = await PUT(
      req('PUT', '/api/school/subjects/subj_1/criteria/reorder', { ids: ['cr_2', 'cr_1'] }),
      subjectParams,
    );
    expect(res.status).toBe(200);
    expect(prismaMock.subjectCriterion.update).toHaveBeenCalledWith({
      where: { id: 'cr_2' },
      data: { order: 0 },
    });
    expect(prismaMock.subjectCriterion.update).toHaveBeenCalledWith({
      where: { id: 'cr_1' },
      data: { order: 1 },
    });
    expect(await res.json()).toEqual({ criteria: [rows[1], rows[0]] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run "src/app/api/school/subjects/[id]/criteria/route.test.ts"`
Expected: FAIL, cannot resolve `./route`.

- [ ] **Step 3: Write the shared lib**

Create `frontend/src/lib/server/subject-criteria.ts`:

```ts
// Criteria of a qualitative subject: the bits the three criteria route files
// share (route modules may only export handlers). Spec 2026-09-05 §4.
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { CRITERION_LABEL_MAX } from '@/lib/qualitative';

export const CriterionBody = z.object({
  label: z.string().trim().min(1).max(CRITERION_LABEL_MAX),
});

export const ReorderBody = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export const CRITERION_SELECT = { id: true, label: true, order: true } as const;

/** The subject id when it belongs to `schoolId`, null otherwise (404 upstream). */
export async function findOwnedSubjectId(
  subjectId: string,
  schoolId: string,
): Promise<string | null> {
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, schoolId },
    select: { id: true },
  });
  return subject?.id ?? null;
}

export function listCriteria(subjectId: string) {
  return prisma.subjectCriterion.findMany({
    where: { subjectId },
    orderBy: { order: 'asc' },
    select: CRITERION_SELECT,
  });
}
```

- [ ] **Step 4: Write the list/create route**

Create `frontend/src/app/api/school/subjects/[id]/criteria/route.ts`:

```ts
// GET /api/school/subjects/[id]/criteria — ordered criteria of a subject.
// POST /api/school/subjects/[id]/criteria — append one criterion (order =
// last + 1). Criteria may be created while the stored evaluationMode is
// still NUMERIC (the form adds them before saving the profile); they are
// only displayed and rated for QUALITATIVE subjects. Spec 2026-09-05 §4.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import {
  CRITERION_SELECT,
  CriterionBody,
  findOwnedSubjectId,
  listCriteria,
} from '@/lib/server/subject-criteria';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'configuration',
      'view',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const { id } = await params;
    const subjectId = await findOwnedSubjectId(id, mySchool.schoolId);
    if (!subjectId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Subject not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const criteria = await listCriteria(subjectId);
    return NextResponse.json({ criteria }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'configuration',
      'edit',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const { id } = await params;
    const subjectId = await findOwnedSubjectId(id, mySchool.schoolId);
    if (!subjectId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Subject not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = CriterionBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const last = await prisma.subjectCriterion.findFirst({
      where: { subjectId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const criterion = await prisma.subjectCriterion.create({
      data: { subjectId, label: parsed.data.label, order: last ? last.order + 1 : 0 },
      select: CRITERION_SELECT,
    });
    return NextResponse.json(
      { criterion },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 5: Write the rename/delete route**

Create `frontend/src/app/api/school/subjects/[id]/criteria/[criterionId]/route.ts`:

```ts
// PATCH /api/school/subjects/[id]/criteria/[criterionId] — rename.
// DELETE … — remove, 409 CRITERION_IN_USE once any rating references it
// (archiving is out of scope, spec 2026-09-05 §15).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import {
  CRITERION_SELECT,
  CriterionBody,
  findOwnedSubjectId,
} from '@/lib/server/subject-criteria';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

type Params = { params: Promise<{ id: string; criterionId: string }> };

async function ownedCriterion(
  subjectId: string,
  criterionId: string,
): Promise<{ id: string } | null> {
  return prisma.subjectCriterion.findFirst({
    where: { id: criterionId, subjectId },
    select: { id: true },
  });
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'configuration',
      'edit',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const { id, criterionId } = await params;
    const subjectId = await findOwnedSubjectId(id, mySchool.schoolId);
    const existing = subjectId ? await ownedCriterion(subjectId, criterionId) : null;
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Criterion not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = CriterionBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const criterion = await prisma.subjectCriterion.update({
      where: { id: criterionId },
      data: { label: parsed.data.label },
      select: CRITERION_SELECT,
    });
    return NextResponse.json({ criterion }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'configuration',
      'edit',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const { id, criterionId } = await params;
    const subjectId = await findOwnedSubjectId(id, mySchool.schoolId);
    const existing = subjectId ? await ownedCriterion(subjectId, criterionId) : null;
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Criterion not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const inUse = await prisma.criteriaRating.count({ where: { criterionId } });
    if (inUse > 0) {
      return NextResponse.json(
        {
          error: 'CRITERION_IN_USE',
          message: 'Ce critère a déjà des coches. Il ne peut pas être supprimé.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    await prisma.subjectCriterion.delete({ where: { id: criterionId } });
    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 6: Write the reorder route**

Create `frontend/src/app/api/school/subjects/[id]/criteria/reorder/route.ts`:

```ts
// PUT /api/school/subjects/[id]/criteria/reorder { ids } — `ids` must be
// exactly the subject's criteria set; order becomes the index in `ids`.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { ReorderBody, findOwnedSubjectId, listCriteria } from '@/lib/server/subject-criteria';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'configuration',
      'edit',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const { id } = await params;
    const subjectId = await findOwnedSubjectId(id, mySchool.schoolId);
    if (!subjectId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Subject not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = ReorderBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const ids = parsed.data.ids;
    const current = await prisma.subjectCriterion.findMany({
      where: { subjectId },
      select: { id: true },
    });
    const currentIds = new Set(current.map((c) => c.id));
    const sameSet =
      ids.length === currentIds.size &&
      new Set(ids).size === ids.length &&
      ids.every((cid) => currentIds.has(cid));
    if (!sameSet) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'ids must list every criterion of the subject exactly once',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.$transaction(
      ids.map((cid, index) =>
        prisma.subjectCriterion.update({ where: { id: cid }, data: { order: index } }),
      ),
    );
    const criteria = await listCriteria(subjectId);
    return NextResponse.json({ criteria }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 7: Run the tests, expect PASS; run the tripwires**

Run: `pnpm --filter frontend exec vitest run "src/app/api/school/subjects/[id]/criteria/route.test.ts" src/lib/server/observability`
Expected: criteria tests pass (9 tests); `runtime-enforcement` and `school-permission-enforcement` still pass (the new routes export `runtime` and call `requireSchoolPermission`).

- [ ] **Step 8: Format, lint, typecheck, commit**

Run: `pnpm format && pnpm lint && pnpm typecheck`

```bash
git add frontend/src/lib/server/subject-criteria.ts "frontend/src/app/api/school/subjects/[id]/criteria/route.ts" "frontend/src/app/api/school/subjects/[id]/criteria/[criterionId]/route.ts" "frontend/src/app/api/school/subjects/[id]/criteria/reorder/route.ts" "frontend/src/app/api/school/subjects/[id]/criteria/route.test.ts"
git commit -m "feat(subjects): criteria CRUD + reorder routes

GET/POST …/criteria, PATCH/DELETE …/criteria/[criterionId] (409
CRITERION_IN_USE), PUT …/criteria/reorder (spec 2026-09-05 §4).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Keep qualitative subjects out of every numeric consumer

**Files:**
- Modify: `frontend/src/lib/server/student-views/results.ts` (the `prisma.classSubject.findMany` call, ~line 159)
- Modify: `frontend/src/lib/server/student-views/bulletins.ts` (~line 50)
- Modify: `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts` (~line 171)
- Modify: `frontend/src/app/api/student/me/route.ts` (~line 147)
- Modify: `frontend/src/app/api/school/classes/[id]/notebook/route.ts` (~line 79)
- Modify: `frontend/src/app/api/school/classes/[id]/bulletins/route.ts` (~line 73)
- Modify: `frontend/src/app/api/school/evaluations/route.ts` (POST, lines 94-114)
- Modify: `frontend/src/app/api/teacher/evaluations/route.ts` (POST, lines 77-97)
- Modify: `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.test.ts`, `frontend/src/lib/server/student-views/results.test.ts`, `frontend/src/app/api/teacher/evaluations/route.test.ts`
- Create: `frontend/src/app/api/school/evaluations/route.test.ts`

**Interfaces:**
- Consumes: `NUMERIC_SUBJECT_FILTER` from `@/lib/server/qualitative` (Task 2).
- Produces: `POST /api/school/evaluations` and `POST /api/teacher/evaluations` answer 409 `{ error: 'SUBJECT_NOT_NUMERIC', message: 'Cette matière est évaluée par critères, pas par notes.' }` for a qualitative subject. `grades.ts` is not modified: its pure helpers only ever receive numeric class-subjects because every query site filters.

Teacher-scoped sites that select by `where: { id: { in: myTeacher.classSubjectIds } }` are membership checks and stay unchanged; `/api/teacher/me` and `/api/school/class-subjects` keep listing qualitative subjects (Task 7 adds `evaluationMode` there so the UI can branch).

- [ ] **Step 1: Write the failing assertions**

In `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.test.ts`, inside `describe('getStudentBulletinView', …)`, add:

```ts
  it('loads only NUMERIC subjects into the grades table (qualitative ones never reach grades.ts)', async () => {
    const view = await getStudentBulletinView('school_1', 'stu_1', null);
    expect(prismaMock.classSubject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { classId: 'cls_1', subject: { evaluationMode: 'NUMERIC' } },
      }),
    );
    expect(view?.overallAverage).toBe(14);
    expect(view?.rank).toBe(2);
  });
```

In `frontend/src/lib/server/student-views/results.test.ts`, at the end of the top-level `describe`, add (the file's `beforeEach` already mocks the enrollment / class-subject / evaluation chain; `getStudentResults` takes `{ schoolId, studentId, academicYearId, termId, audience }`):

```ts
  it('loads only NUMERIC subjects', async () => {
    await getStudentResults({
      schoolId: 'school_1',
      studentId: 'stu_1',
      academicYearId: null,
      termId: null,
      audience: 'staff',
    });
    expect(prismaMock.classSubject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ subject: { evaluationMode: 'NUMERIC' } }),
      }),
    );
  });
```

(If the file's fixtures use different ids than `school_1`/`stu_1`, reuse the ids its other tests pass to `getStudentResults`.)

In `frontend/src/app/api/teacher/evaluations/route.test.ts`, add a describe at the end of the file:

```ts
describe('POST /api/teacher/evaluations (qualitative subject)', () => {
  it('409 SUBJECT_NOT_NUMERIC', async () => {
    prismaMock.classSubject.findUnique.mockResolvedValue({
      id: 'cs_1',
      class: { schoolId: 'school_1', academicYearId: 'year_1' },
      subject: { evaluationMode: 'QUALITATIVE' },
    } as never);
    prismaMock.term.findUnique.mockResolvedValue({ id: 'term_1', academicYearId: 'year_1' } as never);
    const res = await POST(
      new NextRequest('http://localhost/api/teacher/evaluations', {
        method: 'POST',
        body: JSON.stringify({ classSubjectId: 'cs_1', termId: 'term_1', label: 'Devoir 1' }),
      }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'SUBJECT_NOT_NUMERIC' });
    expect(prismaMock.evaluation.create).not.toHaveBeenCalled();
  });
});
```

Also update that file's existing `prismaMock.classSubject.findUnique.mockResolvedValue({ … })` fixture (around line 50) to carry `subject: { evaluationMode: 'NUMERIC' },` next to its `class` field, so the pre-existing happy-path tests keep passing once the guard reads `classSubject.subject.evaluationMode`.

Create `frontend/src/app/api/school/evaluations/route.test.ts` (school preamble from "Conventions", then):

```ts
import { POST } from './route';

const body = { classSubjectId: 'cs_1', termId: 'term_1', label: 'Devoir 1' };

beforeEach(() => {
  prismaMock.term.findUnique.mockResolvedValue({
    id: 'term_1',
    academicYear: { schoolId: 'school_1' },
  } as never);
  prismaMock.evaluation.create.mockResolvedValue({ id: 'eva_new', ...body } as never);
});

describe('POST /api/school/evaluations', () => {
  it('409 SUBJECT_NOT_NUMERIC for a qualitative subject', async () => {
    prismaMock.classSubject.findUnique.mockResolvedValue({
      id: 'cs_1',
      class: { schoolId: 'school_1' },
      subject: { evaluationMode: 'QUALITATIVE' },
    } as never);
    const res = await POST(req('POST', '/api/school/evaluations', body));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: 'SUBJECT_NOT_NUMERIC',
      message: 'Cette matière est évaluée par critères, pas par notes.',
    });
    expect(prismaMock.evaluation.create).not.toHaveBeenCalled();
  });

  it('creates the evaluation for a numeric subject', async () => {
    prismaMock.classSubject.findUnique.mockResolvedValue({
      id: 'cs_1',
      class: { schoolId: 'school_1' },
      subject: { evaluationMode: 'NUMERIC' },
    } as never);
    const res = await POST(req('POST', '/api/school/evaluations', body));
    expect(res.status).toBe(201);
    expect(prismaMock.evaluation.create).toHaveBeenCalled();
  });
});
```

(If the school route answers 200 rather than 201 on create, assert the status the route actually returns; do not change the route's success status.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/lib/server/bulletin-pdf/get-bulletin-view.test.ts src/lib/server/student-views/results.test.ts src/app/api/teacher/evaluations/route.test.ts src/app/api/school/evaluations/route.test.ts`
Expected: the four new tests fail (where clause lacks `subject`, status 201/200 instead of 409).

- [ ] **Step 3: Filter the six numeric query sites**

In each of the six files, add `import { NUMERIC_SUBJECT_FILTER } from '@/lib/server/qualitative';` next to the other `@/lib/server/*` imports, then patch only the `prisma.classSubject.findMany` call:

| File | Replace | With |
|---|---|---|
| `lib/server/student-views/results.ts` | `where: { classId: enrollment.classId },` (inside `prisma.classSubject.findMany`) | `where: { classId: enrollment.classId, ...NUMERIC_SUBJECT_FILTER },` |
| `lib/server/student-views/bulletins.ts` | `prisma.classSubject.findMany({ where: { classId: enrollment.classId } }),` | `prisma.classSubject.findMany({ where: { classId: enrollment.classId, ...NUMERIC_SUBJECT_FILTER } }),` |
| `lib/server/bulletin-pdf/get-bulletin-view.ts` | `where: { classId: enrollment.classId },` (inside `prisma.classSubject.findMany`) | `where: { classId: enrollment.classId, ...NUMERIC_SUBJECT_FILTER },` |
| `app/api/student/me/route.ts` | `prisma.classSubject.findMany({ where: { classId } }),` | `prisma.classSubject.findMany({ where: { classId, ...NUMERIC_SUBJECT_FILTER } }),` |
| `app/api/school/classes/[id]/notebook/route.ts` | `where: { classId },` (inside `prisma.classSubject.findMany`) | `where: { classId, ...NUMERIC_SUBJECT_FILTER },` |
| `app/api/school/classes/[id]/bulletins/route.ts` | `prisma.classSubject.findMany({ where: { classId } }),` | `prisma.classSubject.findMany({ where: { classId, ...NUMERIC_SUBJECT_FILTER } }),` |

`where: { classId … }` also appears on other models in some of these files (enrollments, attendance); only the `classSubject.findMany` call changes.

- [ ] **Step 4: Add the `SUBJECT_NOT_NUMERIC` guard to both evaluation POSTs**

In `frontend/src/app/api/school/evaluations/route.ts`, change the class-subject lookup's include to

```ts
        include: {
          class: { select: { schoolId: true } },
          subject: { select: { evaluationMode: true } },
        },
```

and insert, right after the closing `}` of the `Invalid classSubjectId or termId` 400 block (before `const evaluation = await prisma.evaluation.create({`):

```ts
    if (classSubject.subject.evaluationMode !== 'NUMERIC') {
      return NextResponse.json(
        {
          error: 'SUBJECT_NOT_NUMERIC',
          message: 'Cette matière est évaluée par critères, pas par notes.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
```

In `frontend/src/app/api/teacher/evaluations/route.ts`, change the class-subject lookup's select to

```ts
        select: {
          id: true,
          class: { select: { schoolId: true, academicYearId: true } },
          subject: { select: { evaluationMode: true } },
        },
```

and insert the identical 409 block at the same position (after the 400 block, before `prisma.evaluation.create`).

- [ ] **Step 5: Run the affected tests, expect PASS**

Run: `pnpm --filter frontend exec vitest run src/lib/server/bulletin-pdf src/lib/server/student-views src/app/api/teacher/evaluations src/app/api/school/evaluations src/app/api/student/me "src/app/api/school/classes"`
Expected: all pass, including the pre-existing tests of every touched route (their `classSubject.findMany` mocks ignore the `where`).

- [ ] **Step 6: Format, lint, typecheck, full test run, commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add frontend/src/lib/server/student-views/results.ts frontend/src/lib/server/student-views/bulletins.ts frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts frontend/src/app/api/student/me/route.ts "frontend/src/app/api/school/classes/[id]/notebook/route.ts" "frontend/src/app/api/school/classes/[id]/bulletins/route.ts" frontend/src/app/api/school/evaluations/route.ts frontend/src/app/api/school/evaluations/route.test.ts frontend/src/app/api/teacher/evaluations/route.ts frontend/src/app/api/teacher/evaluations/route.test.ts frontend/src/lib/server/bulletin-pdf/get-bulletin-view.test.ts frontend/src/lib/server/student-views/results.test.ts
git commit -m "feat(grades): qualitative subjects never reach numeric consumers

NUMERIC_SUBJECT_FILTER on the six ClassSubject query sites behind
averages, ranks, notebooks and bulletins; 409 SUBJECT_NOT_NUMERIC on both
evaluation POSTs (spec 2026-09-05 §4, §6).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Qualitative sheets: server lib + teacher and school routes

**Files:**
- Create: `frontend/src/lib/server/criteria-assessment.ts`, `frontend/src/lib/server/criteria-assessment.test.ts`
- Create: `frontend/src/app/api/teacher/class-subjects/[id]/criteria-assessment/route.ts`, `route.test.ts`
- Create: `frontend/src/app/api/school/class-subjects/[id]/criteria-assessment/route.ts`, `route.test.ts`

**Interfaces:**
- Consumes: Task 1 models (`criteriaAssessment` unique `classSubjectId_termId`, `criteriaRating` unique `assessmentId_studentId_criterionId`).
- Produces (`@/lib/server/criteria-assessment`):
  - `SaveSheetBody` zod: `{ termId: string; status: 'DRAFT' | 'PUBLISHED'; ratings: { studentId: string; criterionId: string; level: number | null }[] }`.
  - `interface CriteriaSheet { id: string | null; status: 'DRAFT' | 'PUBLISHED'; term: { id; label; gradeEntryEnabled }; terms: { id; label }[]; classSubject: { id; className }; subject: { id; name; ratingScale: string[]; criteria: { id; label }[] }; students: { studentId; firstName; lastName; ratings: Record<string, number> }[] }`.
  - `loadSheetContext(classSubjectId, schoolId): Promise<SheetContext | null>` (null when not in the school or the subject is not QUALITATIVE), `loadSheet(ctx, termId: string | null): Promise<CriteriaSheet | null>` (`termId` null = current term by date; virtual empty sheet when never saved; null when the term is not in the class's year), `saveSheet(ctx, input): Promise<{ ok: true; sheet } | { ok: false; error: SaveSheetError }>`, `saveSheetErrorResponse(error, requestId): NextResponse`.
  - Routes: `GET …/criteria-assessment?termId= → { sheet: CriteriaSheet }` (`termId` optional, defaults to the current term), `PUT …/criteria-assessment (SaveSheetBody) → { sheet }`; 400 `VALIDATION_FAILED` (invalid termId, unknown student/criterion, level out of range), 403 `GRADE_ENTRY_DISABLED` with the grades route's message, 404 for a non-owned or non-qualitative class-subject.

Ruling: the spec says "409 `GRADE_ENTRY_DISABLED` … comme `PUT /api/teacher/evaluations/[id]/grades`"; that route answers **403**, and the client switches on `ApiError.code`, so this plan answers 403 to keep one behaviour per code.

- [ ] **Step 1: Write the failing lib test**

Create `frontend/src/lib/server/criteria-assessment.test.ts`:

```ts
// prismaMock first (auto-hoists vi.mock for '@/lib/server/prisma').
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSheet, loadSheetContext, saveSheet, type SheetContext } from './criteria-assessment';

const ctx: SheetContext = {
  id: 'cs_1',
  classId: 'cls_1',
  class: { name: 'Kindergarten A', academicYearId: 'year_1' },
  subject: {
    id: 'subj_1',
    name: 'Comportement',
    ratingScale: ['Toujours', 'Souvent', 'Parfois', 'Jamais'],
    criteria: [
      { id: 'cr_1', label: 'Respecte les consignes' },
      { id: 'cr_2', label: 'Partage' },
    ],
  },
};
const term = { id: 'term_1', label: '1er Trimestre', gradeEntryEnabled: true };
const roster = [
  { studentId: 'stu_2', student: { firstName: 'Ana', lastName: 'Baptiste' } },
  { studentId: 'stu_1', student: { firstName: 'Jimmy', lastName: 'Valcin' } },
];

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.term.findFirst.mockResolvedValue(term as never);
  prismaMock.term.findMany.mockResolvedValue([
    {
      ...term,
      order: 1,
      startDate: new Date('2025-09-01T00:00:00.000Z'),
      endDate: new Date('2099-12-31T00:00:00.000Z'),
    },
  ] as never);
  prismaMock.enrollment.findMany.mockResolvedValue(roster as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
});

describe('loadSheetContext', () => {
  it('returns null for a numeric subject or a class-subject of another school', async () => {
    prismaMock.classSubject.findFirst.mockResolvedValue(null);
    expect(await loadSheetContext('cs_x', 'school_1')).toBeNull();
    prismaMock.classSubject.findFirst.mockResolvedValue({
      id: 'cs_1',
      classId: 'cls_1',
      class: { name: 'A', academicYearId: 'year_1' },
      subject: { id: 's', name: 'Maths', evaluationMode: 'NUMERIC', ratingScale: [], criteria: [] },
    } as never);
    expect(await loadSheetContext('cs_1', 'school_1')).toBeNull();
    expect(prismaMock.classSubject.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 'cs_1', class: { schoolId: 'school_1' } } }),
    );
  });

  it('returns the context of a qualitative class-subject', async () => {
    prismaMock.classSubject.findFirst.mockResolvedValue({
      id: 'cs_1',
      classId: 'cls_1',
      class: { name: 'Kindergarten A', academicYearId: 'year_1' },
      subject: { ...ctx.subject, evaluationMode: 'QUALITATIVE' },
    } as never);
    expect(await loadSheetContext('cs_1', 'school_1')).toEqual(ctx);
  });
});

describe('loadSheet', () => {
  it('returns a virtual empty DRAFT sheet when nothing was saved, roster in name order', async () => {
    prismaMock.criteriaAssessment.findUnique.mockResolvedValue(null);
    const sheet = await loadSheet(ctx, 'term_1');
    expect(sheet).toEqual({
      id: null,
      status: 'DRAFT',
      term,
      terms: [{ id: 'term_1', label: '1er Trimestre' }],
      classSubject: { id: 'cs_1', className: 'Kindergarten A' },
      subject: ctx.subject,
      students: [
        { studentId: 'stu_2', firstName: 'Ana', lastName: 'Baptiste', ratings: {} },
        { studentId: 'stu_1', firstName: 'Jimmy', lastName: 'Valcin', ratings: {} },
      ],
    });
    expect(prismaMock.criteriaAssessment.create).not.toHaveBeenCalled();
    expect(prismaMock.criteriaAssessment.upsert).not.toHaveBeenCalled();
  });

  it('groups stored ticks per student', async () => {
    prismaMock.criteriaAssessment.findUnique.mockResolvedValue({
      id: 'ca_1',
      status: 'PUBLISHED',
      ratings: [
        { studentId: 'stu_1', criterionId: 'cr_1', level: 0 },
        { studentId: 'stu_1', criterionId: 'cr_2', level: 3 },
      ],
    } as never);
    const sheet = await loadSheet(ctx, 'term_1');
    expect(sheet?.id).toBe('ca_1');
    expect(sheet?.status).toBe('PUBLISHED');
    expect(sheet?.students[1]?.ratings).toEqual({ cr_1: 0, cr_2: 3 });
    expect(sheet?.students[0]?.ratings).toEqual({});
  });

  it('resolves the current term when termId is null, null for a term outside the class year', async () => {
    prismaMock.criteriaAssessment.findUnique.mockResolvedValue(null);
    expect((await loadSheet(ctx, null))?.term.id).toBe('term_1');
    expect(await loadSheet(ctx, 'term_other')).toBeNull();
    expect(prismaMock.term.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { academicYearId: 'year_1' } }),
    );
  });
});

describe('saveSheet', () => {
  const valid = {
    termId: 'term_1',
    status: 'DRAFT' as const,
    ratings: [{ studentId: 'stu_1', criterionId: 'cr_1', level: 1 }],
  };

  beforeEach(() => {
    prismaMock.criteriaAssessment.upsert.mockResolvedValue({ id: 'ca_1' } as never);
    prismaMock.criteriaAssessment.findUnique.mockResolvedValue({
      id: 'ca_1',
      status: 'DRAFT',
      ratings: [{ studentId: 'stu_1', criterionId: 'cr_1', level: 1 }],
    } as never);
  });

  it('refuses when grade entry is disabled for the term', async () => {
    prismaMock.term.findFirst.mockResolvedValue({ ...term, gradeEntryEnabled: false } as never);
    expect(await saveSheet(ctx, valid)).toEqual({ ok: false, error: 'GRADE_ENTRY_DISABLED' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('validates students, criteria and levels before writing', async () => {
    expect(
      await saveSheet(ctx, { ...valid, ratings: [{ studentId: 'ghost', criterionId: 'cr_1', level: 0 }] }),
    ).toEqual({ ok: false, error: 'UNKNOWN_STUDENT' });
    expect(
      await saveSheet(ctx, { ...valid, ratings: [{ studentId: 'stu_1', criterionId: 'cr_x', level: 0 }] }),
    ).toEqual({ ok: false, error: 'UNKNOWN_CRITERION' });
    expect(
      await saveSheet(ctx, { ...valid, ratings: [{ studentId: 'stu_1', criterionId: 'cr_1', level: 4 }] }),
    ).toEqual({ ok: false, error: 'LEVEL_OUT_OF_RANGE' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('upserts the sheet, upserts ticks, deletes null ticks, then reloads', async () => {
    const result = await saveSheet(ctx, {
      termId: 'term_1',
      status: 'PUBLISHED',
      ratings: [
        { studentId: 'stu_1', criterionId: 'cr_1', level: 1 },
        { studentId: 'stu_1', criterionId: 'cr_2', level: null },
      ],
    });
    expect(prismaMock.criteriaAssessment.upsert).toHaveBeenCalledWith({
      where: { classSubjectId_termId: { classSubjectId: 'cs_1', termId: 'term_1' } },
      create: { classSubjectId: 'cs_1', termId: 'term_1', status: 'PUBLISHED' },
      update: { status: 'PUBLISHED' },
      select: { id: true },
    });
    expect(prismaMock.criteriaRating.upsert).toHaveBeenCalledWith({
      where: {
        assessmentId_studentId_criterionId: {
          assessmentId: 'ca_1',
          studentId: 'stu_1',
          criterionId: 'cr_1',
        },
      },
      create: { assessmentId: 'ca_1', studentId: 'stu_1', criterionId: 'cr_1', level: 1 },
      update: { level: 1 },
    });
    expect(prismaMock.criteriaRating.deleteMany).toHaveBeenCalledWith({
      where: { assessmentId: 'ca_1', studentId: 'stu_1', criterionId: 'cr_2' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sheet.students[1]?.ratings).toEqual({ cr_1: 1 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/criteria-assessment.test.ts`
Expected: FAIL, cannot resolve `./criteria-assessment`.

- [ ] **Step 3: Write the lib**

Create `frontend/src/lib/server/criteria-assessment.ts`:

```ts
// Qualitative sheets: one CriteriaAssessment per class-subject and term,
// the mirror of Evaluation + Grade for qualitative subjects. Shared by the
// teacher route and the school route, which expose identical contracts.
// A GET never writes: an unsaved sheet is returned as a virtual empty sheet
// (id null, status DRAFT). Spec 2026-09-05 §5.1.
import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { resolveCurrentTerm } from '@/lib/server/grades';

export const SaveSheetBody = z.object({
  termId: z.string().min(1),
  status: z.enum(['DRAFT', 'PUBLISHED']),
  ratings: z
    .array(
      z.object({
        studentId: z.string().min(1),
        criterionId: z.string().min(1),
        // null erases the tick; otherwise an index into Subject.ratingScale.
        level: z.number().int().min(0).nullable(),
      }),
    )
    .max(5000),
});
export type SaveSheetInput = z.infer<typeof SaveSheetBody>;

export type SheetStatus = 'DRAFT' | 'PUBLISHED';

export interface SheetStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  /** criterionId → level (index into ratingScale); absent = not rated yet. */
  ratings: Record<string, number>;
}

export interface CriteriaSheet {
  /** null while the sheet has never been saved (virtual empty sheet). */
  id: string | null;
  status: SheetStatus;
  term: { id: string; label: string; gradeEntryEnabled: boolean };
  /** Every term of the class year, for the picker. */
  terms: { id: string; label: string }[];
  classSubject: { id: string; className: string };
  subject: {
    id: string;
    name: string;
    ratingScale: string[];
    criteria: { id: string; label: string }[];
  };
  students: SheetStudent[];
}

export interface SheetContext {
  id: string;
  classId: string;
  class: { name: string; academicYearId: string };
  subject: CriteriaSheet['subject'];
}

/**
 * The class-subject when it belongs to `schoolId` AND its subject is
 * QUALITATIVE; null otherwise (a numeric subject has no sheet: 404 upstream).
 */
export async function loadSheetContext(
  classSubjectId: string,
  schoolId: string,
): Promise<SheetContext | null> {
  const cs = await prisma.classSubject.findFirst({
    where: { id: classSubjectId, class: { schoolId } },
    select: {
      id: true,
      classId: true,
      class: { select: { name: true, academicYearId: true } },
      subject: {
        select: {
          id: true,
          name: true,
          evaluationMode: true,
          ratingScale: true,
          criteria: { orderBy: { order: 'asc' }, select: { id: true, label: true } },
        },
      },
    },
  });
  if (!cs || cs.subject.evaluationMode !== 'QUALITATIVE') return null;
  return {
    id: cs.id,
    classId: cs.classId,
    class: { name: cs.class.name, academicYearId: cs.class.academicYearId },
    subject: {
      id: cs.subject.id,
      name: cs.subject.name,
      ratingScale: cs.subject.ratingScale,
      criteria: cs.subject.criteria,
    },
  };
}

function roster(classId: string, academicYearId: string) {
  return prisma.enrollment.findMany({
    where: { classId, academicYearId },
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    select: { studentId: true, student: { select: { firstName: true, lastName: true } } },
  });
}

function findTerm(ctx: SheetContext, termId: string) {
  return prisma.term.findFirst({
    where: { id: termId, academicYearId: ctx.class.academicYearId },
    select: { id: true, label: true, gradeEntryEnabled: true },
  });
}

/**
 * The sheet for `termId` (null = the current term by date, the notebooks'
 * rule), or the virtual empty one; null when the term is not in the class's
 * year.
 */
export async function loadSheet(
  ctx: SheetContext,
  termId: string | null,
): Promise<CriteriaSheet | null> {
  const terms = await prisma.term.findMany({
    where: { academicYearId: ctx.class.academicYearId },
    orderBy: { order: 'asc' },
  });
  const term = termId ? (terms.find((t) => t.id === termId) ?? null) : resolveCurrentTerm(terms);
  if (!term) return null;
  const [enrollments, stored] = await Promise.all([
    roster(ctx.classId, ctx.class.academicYearId),
    prisma.criteriaAssessment.findUnique({
      where: { classSubjectId_termId: { classSubjectId: ctx.id, termId: term.id } },
      select: {
        id: true,
        status: true,
        ratings: { select: { studentId: true, criterionId: true, level: true } },
      },
    }),
  ]);
  const byStudent = new Map<string, Record<string, number>>();
  for (const r of stored?.ratings ?? []) {
    const bucket = byStudent.get(r.studentId) ?? {};
    bucket[r.criterionId] = r.level;
    byStudent.set(r.studentId, bucket);
  }
  return {
    id: stored?.id ?? null,
    status: stored?.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
    term: { id: term.id, label: term.label, gradeEntryEnabled: term.gradeEntryEnabled },
    terms: terms.map((t) => ({ id: t.id, label: t.label })),
    classSubject: { id: ctx.id, className: ctx.class.name },
    subject: ctx.subject,
    students: enrollments.map((e) => ({
      studentId: e.studentId,
      firstName: e.student.firstName,
      lastName: e.student.lastName,
      ratings: byStudent.get(e.studentId) ?? {},
    })),
  };
}

export type SaveSheetError =
  | 'TERM_NOT_FOUND'
  | 'GRADE_ENTRY_DISABLED'
  | 'UNKNOWN_STUDENT'
  | 'UNKNOWN_CRITERION'
  | 'LEVEL_OUT_OF_RANGE';

/**
 * Upserts the sheet (status) and replaces the ticks it receives: `level`
 * null erases, otherwise the tick is upserted. Ticks not mentioned are
 * left as they are, so a per-student screen can save one student at a time.
 */
export async function saveSheet(
  ctx: SheetContext,
  input: SaveSheetInput,
): Promise<{ ok: true; sheet: CriteriaSheet } | { ok: false; error: SaveSheetError }> {
  const term = await findTerm(ctx, input.termId);
  if (!term) return { ok: false, error: 'TERM_NOT_FOUND' };
  if (!term.gradeEntryEnabled) return { ok: false, error: 'GRADE_ENTRY_DISABLED' };

  const criterionIds = new Set(ctx.subject.criteria.map((c) => c.id));
  const scaleSize = ctx.subject.ratingScale.length;
  const enrolled = new Set(
    (await roster(ctx.classId, ctx.class.academicYearId)).map((e) => e.studentId),
  );
  for (const r of input.ratings) {
    if (!enrolled.has(r.studentId)) return { ok: false, error: 'UNKNOWN_STUDENT' };
    if (!criterionIds.has(r.criterionId)) return { ok: false, error: 'UNKNOWN_CRITERION' };
    if (r.level !== null && r.level >= scaleSize) {
      return { ok: false, error: 'LEVEL_OUT_OF_RANGE' };
    }
  }

  await prisma.$transaction(async (tx) => {
    const sheet = await tx.criteriaAssessment.upsert({
      where: { classSubjectId_termId: { classSubjectId: ctx.id, termId: term.id } },
      create: { classSubjectId: ctx.id, termId: term.id, status: input.status },
      update: { status: input.status },
      select: { id: true },
    });
    for (const r of input.ratings) {
      if (r.level === null) {
        await tx.criteriaRating.deleteMany({
          where: { assessmentId: sheet.id, studentId: r.studentId, criterionId: r.criterionId },
        });
      } else {
        await tx.criteriaRating.upsert({
          where: {
            assessmentId_studentId_criterionId: {
              assessmentId: sheet.id,
              studentId: r.studentId,
              criterionId: r.criterionId,
            },
          },
          create: {
            assessmentId: sheet.id,
            studentId: r.studentId,
            criterionId: r.criterionId,
            level: r.level,
          },
          update: { level: r.level },
        });
      }
    }
  });

  const sheet = await loadSheet(ctx, term.id);
  return sheet ? { ok: true, sheet } : { ok: false, error: 'TERM_NOT_FOUND' };
}

const SAVE_ERROR_MESSAGE: Record<Exclude<SaveSheetError, 'GRADE_ENTRY_DISABLED'>, string> = {
  TERM_NOT_FOUND: 'Invalid termId',
  UNKNOWN_STUDENT: 'A rating targets a student who is not enrolled in this class',
  UNKNOWN_CRITERION: 'A rating targets a criterion of another subject',
  LEVEL_OUT_OF_RANGE: 'A rating level is outside the subject scale',
};

/** HTTP mapping shared by the teacher and school routes. */
export function saveSheetErrorResponse(error: SaveSheetError, requestId: string): NextResponse {
  if (error === 'GRADE_ENTRY_DISABLED') {
    return NextResponse.json(
      {
        error: 'GRADE_ENTRY_DISABLED',
        message: 'La saisie des notes est désactivée pour cette période.',
      },
      { status: 403, headers: { 'x-request-id': requestId } },
    );
  }
  return NextResponse.json(
    { error: 'VALIDATION_FAILED', message: SAVE_ERROR_MESSAGE[error] },
    { status: 400, headers: { 'x-request-id': requestId } },
  );
}
```

- [ ] **Step 4: Run the lib test, expect PASS**

Run: `pnpm --filter frontend exec vitest run src/lib/server/criteria-assessment.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Write the failing teacher route test**

Create `frontend/src/app/api/teacher/class-subjects/[id]/criteria-assessment/route.test.ts`:

```ts
// GET/PUT /api/teacher/class-subjects/[id]/criteria-assessment: ownership
// and HTTP mapping only; the sheet logic is tested in
// lib/server/criteria-assessment.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return {
    ...actual,
    resolveMySchoolIncludingTeacher: vi.fn(),
    resolveMyTeacherProfile: vi.fn(),
  };
});
vi.mock('@/lib/server/criteria-assessment', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/criteria-assessment')>(
    '@/lib/server/criteria-assessment',
  );
  return { ...actual, loadSheetContext: vi.fn(), loadSheet: vi.fn(), saveSheet: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { loadSheet, loadSheetContext, saveSheet } from '@/lib/server/criteria-assessment';
import { GET, PUT } from './route';

const authUser = { user: { sub: 'user_1', email: 'teacher@test.local' } };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };
const sheetCtx = {
  id: 'cs_1',
  classId: 'cls_1',
  class: { name: 'Kindergarten A', academicYearId: 'year_1' },
  subject: { id: 'subj_1', name: 'Comportement', ratingScale: ['Oui', 'Non'], criteria: [] },
};
const sheet = {
  id: null,
  status: 'DRAFT',
  term: { id: 'term_1', label: 'T1', gradeEntryEnabled: true },
  terms: [{ id: 'term_1', label: 'T1' }],
  classSubject: { id: 'cs_1', className: 'Kindergarten A' },
  subject: sheetCtx.subject,
  students: [],
};
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const body = { termId: 'term_1', status: 'DRAFT', ratings: [] };

function get(id = 'cs_1', query = '?termId=term_1') {
  return GET(
    new NextRequest(`http://localhost/api/teacher/class-subjects/${id}/criteria-assessment${query}`),
    params(id),
  );
}
function put(payload: unknown, id = 'cs_1') {
  return PUT(
    new NextRequest(`http://localhost/api/teacher/class-subjects/${id}/criteria-assessment`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
    params(id),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(authUser as never);
  vi.mocked(resolveMySchoolIncludingTeacher).mockResolvedValue(memberSchool);
  vi.mocked(resolveMyTeacherProfile).mockResolvedValue({
    teacherId: 'tea_1',
    classSubjectIds: ['cs_1'],
    homeroomClassIds: [],
  });
  vi.mocked(loadSheetContext).mockResolvedValue(sheetCtx);
  vi.mocked(loadSheet).mockResolvedValue(sheet as never);
  vi.mocked(saveSheet).mockResolvedValue({ ok: true, sheet: sheet as never });
});

describe('GET /api/teacher/class-subjects/[id]/criteria-assessment', () => {
  it('401s an unauthenticated caller', async () => {
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    expect((await get()).status).toBe(401);
  });

  it('404s a non-teacher account and a class-subject I do not teach, before any lookup', async () => {
    vi.mocked(resolveMyTeacherProfile).mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    vi.mocked(resolveMyTeacherProfile).mockResolvedValue({
      teacherId: 'tea_1',
      classSubjectIds: ['cs_OTHER'],
      homeroomClassIds: [],
    });
    expect((await get()).status).toBe(404);
    expect(loadSheetContext).not.toHaveBeenCalled();
  });

  it('404s a numeric or foreign class-subject (loadSheetContext null)', async () => {
    vi.mocked(loadSheetContext).mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    expect(loadSheetContext).toHaveBeenCalledWith('cs_1', 'school_1');
  });

  it('defaults to the current term without termId, 400s an unknown term, returns the sheet', async () => {
    await get('cs_1', '');
    expect(loadSheet).toHaveBeenLastCalledWith(sheetCtx, null);
    vi.mocked(loadSheet).mockResolvedValueOnce(null);
    expect((await get('cs_1', '?termId=term_ghost')).status).toBe(400);
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sheet });
    expect(loadSheet).toHaveBeenCalledWith(sheetCtx, 'term_1');
  });
});

describe('PUT /api/teacher/class-subjects/[id]/criteria-assessment', () => {
  it('400s an invalid body', async () => {
    expect((await put({ termId: 'term_1' })).status).toBe(400);
    expect(saveSheet).not.toHaveBeenCalled();
  });

  it('maps GRADE_ENTRY_DISABLED to 403 with the grades route message', async () => {
    vi.mocked(saveSheet).mockResolvedValue({ ok: false, error: 'GRADE_ENTRY_DISABLED' });
    const res = await put(body);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'GRADE_ENTRY_DISABLED',
      message: 'La saisie des notes est désactivée pour cette période.',
    });
  });

  it('maps validation errors to 400 and returns the saved sheet on success', async () => {
    vi.mocked(saveSheet).mockResolvedValue({ ok: false, error: 'LEVEL_OUT_OF_RANGE' });
    expect((await put(body)).status).toBe(400);
    vi.mocked(saveSheet).mockResolvedValue({ ok: true, sheet: sheet as never });
    const res = await put(body);
    expect(res.status).toBe(200);
    expect(saveSheet).toHaveBeenCalledWith(sheetCtx, body);
    expect(await res.json()).toEqual({ sheet });
  });
});
```

- [ ] **Step 6: Write the teacher route**

Create `frontend/src/app/api/teacher/class-subjects/[id]/criteria-assessment/route.ts`:

```ts
// GET /api/teacher/class-subjects/[id]/criteria-assessment?termId= — the
// qualitative sheet of one of MY class-subjects for a term (virtual empty
// sheet when never saved; a GET writes nothing).
// PUT … { termId, status, ratings } — upserts the sheet, replaces the sent
// ticks (null erases), 403 GRADE_ENTRY_DISABLED like the grades route.
// Ownership = ClassSubject.teacherId through myTeacher.classSubjectIds,
// checked before any lookup (404 anti-leak). Spec 2026-09-05 §5.1.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import {
  SaveSheetBody,
  loadSheet,
  loadSheetContext,
  saveSheet,
  saveSheetErrorResponse,
  type SheetContext,
} from '@/lib/server/criteria-assessment';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

type Params = { params: Promise<{ id: string }> };

function notFound(requestId: string): NextResponse {
  return NextResponse.json(
    { error: 'NOT_FOUND', message: 'Not found' },
    { status: 404, headers: { 'x-request-id': requestId } },
  );
}

async function resolveOwnedContext(
  userSub: string,
  classSubjectId: string,
  requestId: string,
): Promise<SheetContext | NextResponse> {
  const mySchool = await resolveMySchoolIncludingTeacher(userSub);
  if (!mySchool) return notFound(requestId);
  const myTeacher = await resolveMyTeacherProfile(userSub, mySchool.schoolId);
  if (!myTeacher) return notFound(requestId);
  if (!myTeacher.classSubjectIds.includes(classSubjectId)) return notFound(requestId);
  const sheetCtx = await loadSheetContext(classSubjectId, mySchool.schoolId);
  return sheetCtx ?? notFound(requestId);
}

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const sheetCtx = await resolveOwnedContext(auth.user.sub, id, ctx.requestId);
    if (sheetCtx instanceof NextResponse) return sheetCtx;

    const sheet = await loadSheet(sheetCtx, req.nextUrl.searchParams.get('termId'));
    if (!sheet) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'termId must belong to the class year' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json({ sheet }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function PUT(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const sheetCtx = await resolveOwnedContext(auth.user.sub, id, ctx.requestId);
    if (sheetCtx instanceof NextResponse) return sheetCtx;

    const parsed = SaveSheetBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const result = await saveSheet(sheetCtx, parsed.data);
    if (!result.ok) return saveSheetErrorResponse(result.error, ctx.requestId);
    return NextResponse.json({ sheet: result.sheet }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 7: Write the failing school route test**

Create `frontend/src/app/api/school/class-subjects/[id]/criteria-assessment/route.test.ts`: the school preamble from "Conventions" **plus** the same `vi.mock('@/lib/server/criteria-assessment', …)` block as the teacher test, then:

```ts
import { loadSheet, loadSheetContext, saveSheet } from '@/lib/server/criteria-assessment';
import { GET, PUT } from './route';

const sheetCtx = {
  id: 'cs_1',
  classId: 'cls_1',
  class: { name: 'Kindergarten A', academicYearId: 'year_1' },
  subject: { id: 'subj_1', name: 'Comportement', ratingScale: ['Oui', 'Non'], criteria: [] },
};
const sheet = {
  id: 'ca_1',
  status: 'PUBLISHED',
  term: { id: 'term_1', label: 'T1', gradeEntryEnabled: true },
  terms: [{ id: 'term_1', label: 'T1' }],
  classSubject: { id: 'cs_1', className: 'Kindergarten A' },
  subject: sheetCtx.subject,
  students: [],
};
const params = { params: Promise.resolve({ id: 'cs_1' }) };
const body = { termId: 'term_1', status: 'PUBLISHED', ratings: [] };

beforeEach(() => {
  vi.mocked(loadSheetContext).mockResolvedValue(sheetCtx);
  vi.mocked(loadSheet).mockResolvedValue(sheet as never);
  vi.mocked(saveSheet).mockResolvedValue({ ok: true, sheet: sheet as never });
});

describe('GET /api/school/class-subjects/[id]/criteria-assessment', () => {
  it('404s when the class-subject is not a qualitative one of my school', async () => {
    vi.mocked(loadSheetContext).mockResolvedValue(null);
    const res = await GET(
      req('GET', '/api/school/class-subjects/cs_1/criteria-assessment?termId=term_1'),
      params,
    );
    expect(res.status).toBe(404);
    expect(loadSheetContext).toHaveBeenCalledWith('cs_1', 'school_1');
  });

  it('returns the sheet', async () => {
    const res = await GET(
      req('GET', '/api/school/class-subjects/cs_1/criteria-assessment?termId=term_1'),
      params,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sheet });
  });
});

describe('PUT /api/school/class-subjects/[id]/criteria-assessment', () => {
  it('saves and returns the sheet', async () => {
    const res = await PUT(req('PUT', '/api/school/class-subjects/cs_1/criteria-assessment', body), params);
    expect(res.status).toBe(200);
    expect(saveSheet).toHaveBeenCalledWith(sheetCtx, body);
  });

  it('maps GRADE_ENTRY_DISABLED to 403', async () => {
    vi.mocked(saveSheet).mockResolvedValue({ ok: false, error: 'GRADE_ENTRY_DISABLED' });
    const res = await PUT(req('PUT', '/api/school/class-subjects/cs_1/criteria-assessment', body), params);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 8: Write the school route**

Create `frontend/src/app/api/school/class-subjects/[id]/criteria-assessment/route.ts`: same body as the teacher route with these differences: imports `prisma`-free school boilerplate (`requireSchoolPermission` instead of the two teacher resolvers), `resolveOwnedContext` is replaced by:

```ts
    const perm = await requireSchoolPermission(auth.user.sub, 'notes', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;
    const { id } = await params;
    const sheetCtx = await loadSheetContext(id, perm.mySchool.schoolId);
    if (!sheetCtx) return notFound(ctx.requestId);
```

in `GET`, and the same with `'notes', 'edit'` in `PUT` (after `verifyCsrf`/`requireAuth`). Header comment: `// GET/PUT /api/school/class-subjects/[id]/criteria-assessment — school mirror of the teacher route (same contracts), gated notes.view / notes.edit. Spec 2026-09-05 §5.1.`

- [ ] **Step 9: Run both route tests + tripwires, expect PASS**

Run: `pnpm --filter frontend exec vitest run "src/app/api/teacher/class-subjects/[id]/criteria-assessment" "src/app/api/school/class-subjects/[id]/criteria-assessment" src/lib/server/observability`
Expected: 7 + 4 tests pass; tripwires pass.

- [ ] **Step 10: Format, lint, typecheck, commit**

Run: `pnpm format && pnpm lint && pnpm typecheck`

```bash
git add frontend/src/lib/server/criteria-assessment.ts frontend/src/lib/server/criteria-assessment.test.ts "frontend/src/app/api/teacher/class-subjects/[id]/criteria-assessment/route.ts" "frontend/src/app/api/teacher/class-subjects/[id]/criteria-assessment/route.test.ts" "frontend/src/app/api/school/class-subjects/[id]/criteria-assessment/route.ts" "frontend/src/app/api/school/class-subjects/[id]/criteria-assessment/route.test.ts"
git commit -m "feat(gradebook): qualitative sheets, teacher + school routes

CriteriaAssessment read model (virtual empty sheet on GET), validated
upsert with GRADE_ENTRY_DISABLED, identical contracts under
/api/teacher and /api/school (spec 2026-09-05 §5.1).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Student read model, student route, `qualitativeSubjects` on the bulletin view

**Files:**
- Create: `frontend/src/lib/server/student-views/criteria.ts`, `frontend/src/lib/server/student-views/criteria.test.ts`
- Create: `frontend/src/app/api/student/criteria-assessments/route.ts`, `route.test.ts`
- Modify: `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts` (interface `StudentBulletinView`, the `!term` early return, the final return), `get-bulletin-view.test.ts`

**Interfaces:**
- Consumes: `resolveCurrentTerm<T extends TermLike>(terms: T[]): T | null` from `@/lib/server/grades`.
- Produces (`@/lib/server/student-views/criteria`):
  - `interface StudentQualitativeGrid { classSubjectId: string; subjectName: string; ratingScale: string[]; criteria: { id: string; label: string; level: number | null }[] }`.
  - `loadPublishedGrids({ classId, studentId, termId }): Promise<StudentQualitativeGrid[]>` (PUBLISHED sheets only, own ticks only, subjects in class-subject creation order, criteria in `order`).
  - `getStudentQualitativeGrids({ academicYearId, classId, studentId, termId: string | null }): Promise<{ terms: { id; label }[]; term: { id; label } | null; grids: StudentQualitativeGrid[] }>` (`termId` null = current term by date, same rule as `results.ts`).
  - `GET /api/student/criteria-assessments?termId=` returns that object.
  - `StudentBulletinView.qualitativeSubjects: { subjectName: string; ratingScale: string[]; criteria: { label: string; level: number | null }[] }[]` (the §10.2 shape plan 2 renders).

- [ ] **Step 1: Write the failing lib test**

Create `frontend/src/lib/server/student-views/criteria.test.ts`:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getStudentQualitativeGrids, loadPublishedGrids } from './criteria';

const T_START = new Date('2025-09-01T00:00:00.000Z');
const T_END = new Date('2099-12-31T00:00:00.000Z');

const sheets = [
  {
    classSubjectId: 'cs_1',
    classSubject: {
      subject: {
        name: 'Comportement',
        ratingScale: ['Toujours', 'Souvent', 'Parfois', 'Jamais'],
        criteria: [
          { id: 'cr_1', label: 'Respecte les consignes' },
          { id: 'cr_2', label: 'Partage' },
        ],
      },
    },
    ratings: [{ criterionId: 'cr_2', level: 1 }],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.criteriaAssessment.findMany.mockResolvedValue(sheets as never);
  prismaMock.term.findMany.mockResolvedValue([
    { id: 'term_1', label: '1er Trimestre', order: 1, startDate: T_START, endDate: T_END },
    { id: 'term_2', label: '2e Trimestre', order: 2, startDate: T_END, endDate: T_END },
  ] as never);
});

describe('loadPublishedGrids', () => {
  it('reads PUBLISHED sheets of the class, the student own ticks only, criteria in order', async () => {
    const grids = await loadPublishedGrids({ classId: 'cls_1', studentId: 'stu_1', termId: 'term_1' });
    expect(grids).toEqual([
      {
        classSubjectId: 'cs_1',
        subjectName: 'Comportement',
        ratingScale: ['Toujours', 'Souvent', 'Parfois', 'Jamais'],
        criteria: [
          { id: 'cr_1', label: 'Respecte les consignes', level: null },
          { id: 'cr_2', label: 'Partage', level: 1 },
        ],
      },
    ]);
    const call = prismaMock.criteriaAssessment.findMany.mock.calls[0]?.[0];
    expect(call?.where).toEqual({
      termId: 'term_1',
      status: 'PUBLISHED',
      classSubject: { classId: 'cls_1', subject: { evaluationMode: 'QUALITATIVE' } },
    });
    expect(call?.orderBy).toEqual({ classSubject: { createdAt: 'asc' } });
    expect((call?.select as { ratings: { where: unknown } }).ratings.where).toEqual({
      studentId: 'stu_1',
    });
  });
});

describe('getStudentQualitativeGrids', () => {
  it('resolves the current term when termId is null', async () => {
    const view = await getStudentQualitativeGrids({
      academicYearId: 'year_1',
      classId: 'cls_1',
      studentId: 'stu_1',
      termId: null,
    });
    expect(view.term).toEqual({ id: 'term_1', label: '1er Trimestre' });
    expect(view.terms).toEqual([
      { id: 'term_1', label: '1er Trimestre' },
      { id: 'term_2', label: '2e Trimestre' },
    ]);
    expect(view.grids).toHaveLength(1);
  });

  it('uses the requested term, and returns no grids for an unknown one', async () => {
    const view = await getStudentQualitativeGrids({
      academicYearId: 'year_1',
      classId: 'cls_1',
      studentId: 'stu_1',
      termId: 'term_2',
    });
    expect(view.term?.id).toBe('term_2');
    const unknown = await getStudentQualitativeGrids({
      academicYearId: 'year_1',
      classId: 'cls_1',
      studentId: 'stu_1',
      termId: 'term_ghost',
    });
    expect(unknown.term).toBeNull();
    expect(unknown.grids).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/student-views/criteria.test.ts`
Expected: FAIL, cannot resolve `./criteria`.

- [ ] **Step 3: Write the lib**

Create `frontend/src/lib/server/student-views/criteria.ts`:

```ts
// Published qualitative grids of ONE student for one term: the read model
// of GET /api/student/criteria-assessments and of the bulletin view's
// `qualitativeSubjects`. Only PUBLISHED sheets, only the student's own
// ticks (never a classmate's), subjects in class-subject creation order,
// criteria in `order`. Spec 2026-09-05 §7, §10.2.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { resolveCurrentTerm } from '@/lib/server/grades';

export interface StudentQualitativeGrid {
  classSubjectId: string;
  subjectName: string;
  ratingScale: string[];
  criteria: { id: string; label: string; level: number | null }[];
}

export async function loadPublishedGrids(args: {
  classId: string;
  studentId: string;
  termId: string;
}): Promise<StudentQualitativeGrid[]> {
  const sheets = await prisma.criteriaAssessment.findMany({
    where: {
      termId: args.termId,
      status: 'PUBLISHED',
      classSubject: { classId: args.classId, subject: { evaluationMode: 'QUALITATIVE' } },
    },
    orderBy: { classSubject: { createdAt: 'asc' } },
    select: {
      classSubjectId: true,
      classSubject: {
        select: {
          subject: {
            select: {
              name: true,
              ratingScale: true,
              criteria: { orderBy: { order: 'asc' }, select: { id: true, label: true } },
            },
          },
        },
      },
      ratings: { where: { studentId: args.studentId }, select: { criterionId: true, level: true } },
    },
  });
  return sheets.map((s) => {
    const levels = new Map(s.ratings.map((r) => [r.criterionId, r.level] as const));
    return {
      classSubjectId: s.classSubjectId,
      subjectName: s.classSubject.subject.name,
      ratingScale: s.classSubject.subject.ratingScale,
      criteria: s.classSubject.subject.criteria.map((c) => ({
        id: c.id,
        label: c.label,
        level: levels.get(c.id) ?? null,
      })),
    };
  });
}

export interface StudentQualitativeView {
  terms: { id: string; label: string }[];
  term: { id: string; label: string } | null;
  grids: StudentQualitativeGrid[];
}

/** `termId` null = the current term by date (same rule as results.ts). */
export async function getStudentQualitativeGrids(args: {
  academicYearId: string;
  classId: string;
  studentId: string;
  termId: string | null;
}): Promise<StudentQualitativeView> {
  const terms = await prisma.term.findMany({
    where: { academicYearId: args.academicYearId },
    orderBy: { order: 'asc' },
  });
  const term = args.termId
    ? (terms.find((t) => t.id === args.termId) ?? null)
    : resolveCurrentTerm(terms);
  const grids = term
    ? await loadPublishedGrids({ classId: args.classId, studentId: args.studentId, termId: term.id })
    : [];
  return {
    terms: terms.map((t) => ({ id: t.id, label: t.label })),
    term: term ? { id: term.id, label: term.label } : null,
    grids,
  };
}
```

- [ ] **Step 4: Run the lib test, expect PASS**

Run: `pnpm --filter frontend exec vitest run src/lib/server/student-views/criteria.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Write the failing student route test**

Create `frontend/src/app/api/student/criteria-assessments/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware/require-student', () => ({ requireStudent: vi.fn() }));
vi.mock('@/lib/server/student-views/criteria', () => ({ getStudentQualitativeGrids: vi.fn() }));

import { requireStudent } from '@/lib/server/middleware/require-student';
import { getStudentQualitativeGrids } from '@/lib/server/student-views/criteria';
import { GET } from './route';

const studentCtx = {
  user: { sub: 'user_1', email: 'eleve@test.local' },
  student: { studentId: 'stu_1', schoolId: 'school_1', classId: 'cls_1', academicYearId: 'year_1' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireStudent).mockResolvedValue(studentCtx as never);
  vi.mocked(getStudentQualitativeGrids).mockResolvedValue({ terms: [], term: null, grids: [] });
});

describe('GET /api/student/criteria-assessments', () => {
  it('passes the requireStudent response through', async () => {
    vi.mocked(requireStudent).mockResolvedValue(
      NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }) as never,
    );
    const res = await GET(new NextRequest('http://localhost/api/student/criteria-assessments'));
    expect(res.status).toBe(404);
    expect(getStudentQualitativeGrids).not.toHaveBeenCalled();
  });

  it('builds the view for the session student only (studentId never a parameter)', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/student/criteria-assessments?termId=term_2'),
    );
    expect(res.status).toBe(200);
    expect(getStudentQualitativeGrids).toHaveBeenCalledWith({
      academicYearId: 'year_1',
      classId: 'cls_1',
      studentId: 'stu_1',
      termId: 'term_2',
    });
    await GET(new NextRequest('http://localhost/api/student/criteria-assessments'));
    expect(vi.mocked(getStudentQualitativeGrids).mock.calls[1]?.[0]?.termId).toBeNull();
  });
});
```

- [ ] **Step 6: Write the student route**

Create `frontend/src/app/api/student/criteria-assessments/route.ts`:

```ts
// GET /api/student/criteria-assessments?termId= — the Espace Élève's
// qualitative grids: PUBLISHED sheets of the student's class for the term,
// reduced to the student's own ticks. The studentId is never a parameter:
// it is the session's own resolved id (requireStudent). Spec 2026-09-05 §7.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStudent } from '@/lib/server/middleware/require-student';
import { getStudentQualitativeGrids } from '@/lib/server/student-views/criteria';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStudent(req);
    if (auth instanceof NextResponse) return auth;

    const view = await getStudentQualitativeGrids({
      academicYearId: auth.student.academicYearId,
      classId: auth.student.classId,
      studentId: auth.student.studentId,
      termId: req.nextUrl.searchParams.get('termId'),
    });
    return NextResponse.json(view, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 7: Run the route test, expect PASS**

Run: `pnpm --filter frontend exec vitest run src/app/api/student/criteria-assessments`
Expected: 2 passed.

- [ ] **Step 8: Write the failing bulletin-view test**

In `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.test.ts`, add to the file's `beforeEach` (after the `prismaMock.appreciation.findMany…` block):

```ts
  prismaMock.criteriaAssessment.findMany.mockResolvedValue([] as never);
```

and add inside `describe('getStudentBulletinView', …)`:

```ts
  it('carries the published qualitative grids of the student as qualitativeSubjects', async () => {
    prismaMock.criteriaAssessment.findMany.mockResolvedValue([
      {
        classSubjectId: 'cs_q',
        classSubject: {
          subject: {
            name: 'Comportement',
            ratingScale: ['Toujours', 'Souvent', 'Parfois', 'Jamais'],
            criteria: [
              { id: 'cr_1', label: 'Respecte les consignes' },
              { id: 'cr_2', label: 'Partage' },
            ],
          },
        },
        ratings: [{ criterionId: 'cr_1', level: 0 }],
      },
    ] as never);
    const view = await getStudentBulletinView('school_1', 'stu_1', null, 'student');
    expect(view?.qualitativeSubjects).toEqual([
      {
        subjectName: 'Comportement',
        ratingScale: ['Toujours', 'Souvent', 'Parfois', 'Jamais'],
        criteria: [
          { label: 'Respecte les consignes', level: 0 },
          { label: 'Partage', level: null },
        ],
      },
    ]);
    const where = prismaMock.criteriaAssessment.findMany.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where.status).toBe('PUBLISHED');
    expect(where.termId).toBe('term_1');
  });
```

- [ ] **Step 9: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/bulletin-pdf/get-bulletin-view.test.ts`
Expected: the new test fails (`qualitativeSubjects` undefined).

- [ ] **Step 10: Extend the bulletin view**

In `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts`:

(a) Import: `import { loadPublishedGrids } from '@/lib/server/student-views/criteria';`

(b) In `interface StudentBulletinView`, after the `subjects: { … }[];` member, add:

```ts
  // Published qualitative grids of this student for the resolved term
  // (spec §10.2 shape; plan 2 renders them). Empty when no term resolves.
  qualitativeSubjects: {
    subjectName: string;
    ratingScale: string[];
    criteria: { label: string; level: number | null }[];
  }[];
```

(c) In the early return taken when no term resolves (the object that already contains `subjects: []`), add `qualitativeSubjects: [],`.

(d) Before the function's final `return { … }`, add:

```ts
  const qualitativeSubjects = (
    await loadPublishedGrids({ classId: enrollment.classId, studentId, termId: term.id })
  ).map((g) => ({
    subjectName: g.subjectName,
    ratingScale: g.ratingScale,
    criteria: g.criteria.map((c) => ({ label: c.label, level: c.level })),
  }));
```

and add `qualitativeSubjects,` to that final returned object. Both audiences read PUBLISHED sheets only (the grids are a student's own ticks either way), so no `audience` switch is needed here.

- [ ] **Step 11: Run the bulletin tests, then the whole suite**

Run: `pnpm --filter frontend exec vitest run src/lib/server/bulletin-pdf && pnpm test`
Expected: all pass. If another test calls the real `getStudentBulletinView` against `prismaMock` and now fails on `.map` of `undefined`, add the same `prismaMock.criteriaAssessment.findMany.mockResolvedValue([] as never)` default to its `beforeEach`.

- [ ] **Step 12: Format, lint, typecheck, commit**

Run: `pnpm format && pnpm lint && pnpm typecheck`

```bash
git add frontend/src/lib/server/student-views/criteria.ts frontend/src/lib/server/student-views/criteria.test.ts frontend/src/app/api/student/criteria-assessments/route.ts frontend/src/app/api/student/criteria-assessments/route.test.ts frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts frontend/src/lib/server/bulletin-pdf/get-bulletin-view.test.ts
git commit -m "feat(student): published qualitative grids for the student and the bulletin view

student-views/criteria read model, GET /api/student/criteria-assessments,
qualitativeSubjects on StudentBulletinView (spec 2026-09-05 §7, §10.2).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Subject form (mode, scale, criteria) + `evaluationMode` in the class-subject payloads

**Files:**
- Modify: `frontend/src/app/(school)/configuration/matieres/types.ts` (`SubjectProfile`, `SubjectDetail`)
- Modify: `frontend/src/components/school/subjects/useSubjectForm.ts` (`SubjectFormValues`, `initialValues`, `SubjectFormErrorCode`, `validate`, `toBody`, `submit`)
- Create: `frontend/src/components/school/subjects/RatingScaleEditor.tsx`
- Create: `frontend/src/components/school/subjects/CriteriaEditor.tsx`
- Modify: `frontend/src/components/school/subjects/SubjectForm.tsx` (props + structure card, lines 393-406)
- Modify: `frontend/src/app/(school)/configuration/matieres/[id]/page.tsx` (line 233-239, the `<SubjectForm …/>` in edit mode)
- Modify: `frontend/src/app/api/school/class-subjects/route.ts` (`INCLUDE`, line 22), `frontend/src/app/api/teacher/me/route.ts` (lines 68 and 159), `frontend/src/app/(school)/pedagogie/carnet-de-notes/types.ts` (`ClassSubjectOption`)
- Modify: `frontend/src/messages/{fr,ht,en}/configuration.json` (`matieres.form.structure`, `matieres.form.errors`)

**Interfaces:**
- Consumes: `EvaluationMode`, `normalizeRatingScale`, `RATING_*`, `CRITERION_LABEL_MAX` from `@/lib/qualitative`; `getSubjectDetail`'s `criteria` + `hasRatings` (Task 2); criteria routes (Task 3).
- Produces: `SubjectProfile.evaluationMode: EvaluationMode`, `SubjectProfile.ratingScale: string[]`, `SubjectDetail.criteria: SubjectCriterionRow[]`, `SubjectDetail.hasRatings: boolean`, `export interface SubjectCriterionRow { id: string; label: string; order: number; ratingCount: number }`; `SubjectForm` prop `qualitative?: { subjectId: string; criteria: SubjectCriterionRow[]; hasRatings: boolean; onChanged: () => void }`; `ClassSubjectOption.subject.evaluationMode?: EvaluationMode`; `/api/teacher/me` class-subject rows gain `subjectEvaluationMode: string`.

No component-rendering tests exist in this repo (no React Testing Library); this task's verification is `pnpm typecheck`, `pnpm lint`, the `locales.test.ts` key-parity check and a manual pass on the dev server. `useSubjectForm.ts`'s pure `validate`/`toBody` gain a unit test.

- [ ] **Step 1: Write the failing unit test for the form's pure helpers**

Create `frontend/src/components/school/subjects/useSubjectForm.qualitative.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { initialValues, toBody, validate } from './useSubjectForm';

const base = initialValues(null, []);

describe('subject form, qualitative fields', () => {
  it('defaults to NUMERIC with an empty scale', () => {
    expect(base.evaluationMode).toBe('NUMERIC');
    expect(base.ratingScale).toEqual([]);
    expect(toBody(base, 'ACTIVE')).toMatchObject({ evaluationMode: 'NUMERIC', ratingScale: [] });
  });

  it('flags an invalid scale only in QUALITATIVE mode', () => {
    const bad = { ...base, evaluationMode: 'QUALITATIVE' as const, ratingScale: ['Oui', ''] };
    expect(validate(bad).codes.ratingScale).toBe('ratingScaleInvalid');
    const numericWithJunk = { ...base, ratingScale: ['Oui', ''] };
    expect(validate(numericWithJunk).codes.ratingScale).toBeUndefined();
  });

  it('sends a trimmed scale in QUALITATIVE mode and an empty one otherwise', () => {
    const q = { ...base, evaluationMode: 'QUALITATIVE' as const, ratingScale: [' Oui ', 'Non'] };
    expect(toBody(q, 'ACTIVE')).toMatchObject({
      evaluationMode: 'QUALITATIVE',
      ratingScale: ['Oui', 'Non'],
    });
    expect(toBody({ ...q, evaluationMode: 'NUMERIC' }, 'ACTIVE')).toMatchObject({
      evaluationMode: 'NUMERIC',
      ratingScale: [],
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/components/school/subjects/useSubjectForm.qualitative.test.ts`
Expected: FAIL (`evaluationMode` undefined / type errors).

- [ ] **Step 3: Extend the client types**

In `frontend/src/app/(school)/configuration/matieres/types.ts`:

Add at the top: `import type { EvaluationMode } from '@/lib/qualitative';`

In `SubjectProfile`, after `showOnBulletin: boolean;`, add:

```ts
  evaluationMode: EvaluationMode;
  ratingScale: string[];
```

Add before `SubjectDetail`:

```ts
export interface SubjectCriterionRow {
  id: string;
  label: string;
  order: number;
  /** Ticks referencing it; > 0 blocks deletion (409 CRITERION_IN_USE). */
  ratingCount: number;
}
```

In `SubjectDetail`, add two members:

```ts
  criteria: SubjectCriterionRow[];
  /** True once any tick exists: the scale can be renamed but not reordered. */
  hasRatings: boolean;
```

- [ ] **Step 4: Extend `useSubjectForm.ts`**

(a) Import: `import { type EvaluationMode, normalizeRatingScale } from '@/lib/qualitative';`

(b) In `SubjectFormValues`, after `showOnBulletin: boolean;`, add:

```ts
  evaluationMode: EvaluationMode;
  ratingScale: string[];
```

(c) In `initialValues`, after `showOnBulletin: subject?.showOnBulletin ?? true,`, add:

```ts
    evaluationMode: subject?.evaluationMode ?? 'NUMERIC',
    ratingScale: subject?.ratingScale ?? [],
```

(d) Add `| 'ratingScaleInvalid'` to the `SubjectFormErrorCode` union.

(e) In `validate`, before `return { codes: errors, max };`, add:

```ts
  if (v.evaluationMode === 'QUALITATIVE' && !normalizeRatingScale(v.ratingScale).ok) {
    errors.ratingScale = 'ratingScaleInvalid';
  }
```

(f) In `toBody`, after `showOnBulletin: v.showOnBulletin,`, add:

```ts
    evaluationMode: v.evaluationMode,
    ratingScale:
      v.evaluationMode === 'QUALITATIVE' ? v.ratingScale.map((label) => label.trim()) : [],
```

(g) In `submit`, drafts skip validation except the name; a QUALITATIVE draft with a broken scale would still be refused by the server, so right after the `if (intent === 'draft' && values.name.trim().length < 2) { … }` block add:

```ts
      if (
        intent === 'draft' &&
        values.evaluationMode === 'QUALITATIVE' &&
        !normalizeRatingScale(values.ratingScale).ok
      ) {
        nextCodes.ratingScale = 'ratingScaleInvalid';
      }
```

(h) In the `catch`, replace

```ts
        if (err instanceof ApiError && err.code === 'SUBJECT_CODE_TAKEN') {
          setErrors((prev) => ({ ...prev, code: err.message }));
        } else {
```

with

```ts
        if (err instanceof ApiError && err.code === 'SUBJECT_CODE_TAKEN') {
          setErrors((prev) => ({ ...prev, code: err.message }));
        } else if (
          err instanceof ApiError &&
          (err.code === 'SUBJECT_HAS_EVALUATIONS' || err.code === 'SUBJECT_HAS_RATINGS')
        ) {
          setErrors((prev) => ({ ...prev, evaluationMode: err.message }));
        } else if (err instanceof ApiError && err.code === 'SCALE_LEVEL_IN_USE') {
          setErrors((prev) => ({ ...prev, ratingScale: err.message }));
        } else {
```

(The three server messages are French, like `SUBJECT_CODE_TAKEN`'s, the recorded precedent for field-level server errors.)

- [ ] **Step 5: Run the unit test, expect PASS**

Run: `pnpm --filter frontend exec vitest run src/components/school/subjects/useSubjectForm.qualitative.test.ts`
Expected: 3 passed.

- [ ] **Step 6: Create `RatingScaleEditor.tsx`**

```tsx
'use client';

// Ordered scale of a qualitative subject (2 to 6 labels). Renaming is always
// allowed; moving is hidden once ratings exist (`lockedOrder`) because the
// server cannot tell a rename from a permutation (spec 2026-09-05 §4).
import { type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { RATING_LABEL_MAX, RATING_SCALE_MAX, RATING_SCALE_MIN } from '@/lib/qualitative';
import { TextInput } from './form-primitives';

export function RatingScaleEditor({
  value,
  onChange,
  lockedOrder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  lockedOrder: boolean;
}) {
  const t = useTranslations('Configuration.matieres.form.structure');
  const update = (index: number, label: string) =>
    onChange(value.map((l, i) => (i === index ? label : l)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item ?? '');
    onChange(next);
  };
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    <div className="flex flex-col gap-2">
      {value.map((label, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-center text-2xs font-bold text-muted-foreground">
            {index + 1}
          </span>
          <TextInput
            value={label}
            maxLength={RATING_LABEL_MAX}
            placeholder={t('ratingScaleLevelPlaceholder', { index: index + 1 })}
            aria-label={t('ratingScaleLevelPlaceholder', { index: index + 1 })}
            onChange={(e) => update(index, e.target.value)}
          />
          {!lockedOrder && (
            <>
              <IconButton
                label={t('ratingScaleMoveUp')}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <ArrowUp size={14} />
              </IconButton>
              <IconButton
                label={t('ratingScaleMoveDown')}
                disabled={index === value.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <ArrowDown size={14} />
              </IconButton>
            </>
          )}
          <IconButton
            label={t('ratingScaleRemove')}
            disabled={value.length <= RATING_SCALE_MIN}
            onClick={() => remove(index)}
          >
            <X size={14} />
          </IconButton>
        </div>
      ))}
      {lockedOrder && <p className="text-2xs text-muted-foreground">{t('ratingScaleLocked')}</p>}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={value.length >= RATING_SCALE_MAX}
        onClick={() => onChange([...value, ''])}
      >
        <Plus size={14} />
        {t('ratingScaleAdd')}
      </Button>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 7: Create `CriteriaEditor.tsx`**

```tsx
'use client';

// Criteria of a qualitative subject, edited live against
// /api/school/subjects/[id]/criteria (add, rename, delete, move). Each
// action refetches the subject detail through `onChanged`; the form's
// other fields are not re-seeded by that refetch (useSubjectForm only
// re-seeds when the subject id changes). Spec 2026-09-05 §4.
import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/contexts/ToastContext';
import { CRITERION_LABEL_MAX } from '@/lib/qualitative';
import type { SubjectCriterionRow } from '@/app/(school)/configuration/matieres/types';
import { TextInput } from './form-primitives';

export function CriteriaEditor({
  subjectId,
  criteria,
  onChanged,
}: {
  subjectId: string;
  criteria: SubjectCriterionRow[];
  onChanged: () => void;
}) {
  const t = useTranslations('Configuration.matieres.form.structure');
  const { toast } = useToast();
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const base = `/api/school/subjects/${subjectId}/criteria`;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('criterionSaveError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    void run(async () => {
      await api(base, { method: 'POST', body: { label } });
      setNewLabel('');
    });
  };
  const rename = (id: string) => {
    const label = editingLabel.trim();
    if (!label) return;
    void run(async () => {
      await api(`${base}/${id}`, { method: 'PATCH', body: { label } });
      setEditingId(null);
    });
  };
  const remove = (id: string) =>
    void run(() => api(`${base}/${id}`, { method: 'DELETE' }));
  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= criteria.length) return;
    const ids = criteria.map((c) => c.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(to, 0, moved ?? '');
    void run(() => api(`${base}/reorder`, { method: 'PUT', body: { ids } }));
  };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-caption font-semibold text-foreground">{t('criteriaTitle')}</p>
        <p className="text-2xs text-muted-foreground">{t('criteriaHint')}</p>
      </div>
      {criteria.length === 0 && (
        <p className="text-2xs text-muted-foreground">{t('criteriaEmpty')}</p>
      )}
      <ol className="flex flex-col gap-1.5">
        {criteria.map((c, index) => (
          <li key={c.id} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-center text-2xs font-bold text-muted-foreground">
              {index + 1}
            </span>
            {editingId === c.id ? (
              <>
                <TextInput
                  value={editingLabel}
                  maxLength={CRITERION_LABEL_MAX}
                  autoFocus
                  onChange={(e) => setEditingLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') rename(c.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
                <Button type="button" size="sm" disabled={busy} onClick={() => rename(c.id)}>
                  <Check size={14} />
                  {t('criterionSave')}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  <X size={14} />
                  {t('criterionCancel')}
                </Button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-caption text-foreground">
                  {c.label}
                </span>
                <RowButton
                  label={t('ratingScaleMoveUp')}
                  disabled={busy || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={14} />
                </RowButton>
                <RowButton
                  label={t('ratingScaleMoveDown')}
                  disabled={busy || index === criteria.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={14} />
                </RowButton>
                <RowButton
                  label={t('criterionRename')}
                  disabled={busy}
                  onClick={() => {
                    setEditingId(c.id);
                    setEditingLabel(c.label);
                  }}
                >
                  <Pencil size={14} />
                </RowButton>
                <RowButton
                  label={c.ratingCount > 0 ? t('criterionInUse') : t('criterionDelete')}
                  disabled={busy || c.ratingCount > 0}
                  onClick={() => remove(c.id)}
                >
                  <Trash2 size={14} />
                </RowButton>
              </>
            )}
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-2">
        <TextInput
          value={newLabel}
          maxLength={CRITERION_LABEL_MAX}
          placeholder={t('criterionPlaceholder')}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" size="sm" variant="outline" disabled={busy || !newLabel.trim()} onClick={add}>
          <Plus size={14} />
          {t('criterionAdd')}
        </Button>
      </div>
    </div>
  );
}

function RowButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
```

(If ESLint rejects the `React.ReactNode` namespace access, import `type ReactNode` from `'react'` and use it, as `RatingScaleEditor` does.)

- [ ] **Step 8: Wire the form**

In `frontend/src/components/school/subjects/SubjectForm.tsx`:

(a) Imports: add `import type { EvaluationMode } from '@/lib/qualitative';`, `import type { SubjectCriterionRow } from '@/app/(school)/configuration/matieres/types';`, `import { RatingScaleEditor } from './RatingScaleEditor';`, `import { CriteriaEditor } from './CriteriaEditor';`. `SelectItem`, `FormGroup`, `BareSelect`, `SectionDivider` are already imported from `./form-primitives`.

(b) Props: add after `onToggleClass?: (classId: string, checked: boolean) => void;`

```ts
  /** Edit mode only: live criteria editing + the "ratings exist" lock. */
  qualitative?: {
    subjectId: string;
    criteria: SubjectCriterionRow[];
    hasRatings: boolean;
    onChanged: () => void;
  };
```

and destructure it (`qualitative,`) in the parameter list.

(c) In the structure card, replace the block

```tsx
            <SectionDivider />
            <ToggleRow
              title={t('structure.includeInAverageTitle')}
```

with

```tsx
            <SectionDivider />
            <FormGroup
              label={t('structure.evaluationModeLabel')}
              hint={t('structure.evaluationModeHint')}
              error={errors.evaluationMode}
              htmlFor="subject-evaluation-mode"
            >
              <BareSelect
                id="subject-evaluation-mode"
                value={v.evaluationMode}
                onValueChange={(value) => {
                  const mode = value as EvaluationMode;
                  setField('evaluationMode', mode);
                  if (mode === 'QUALITATIVE' && v.ratingScale.length === 0) {
                    setField('ratingScale', ['', '']);
                  }
                }}
              >
                <SelectItem value="NUMERIC">{t('structure.evaluationModeNumeric')}</SelectItem>
                <SelectItem value="QUALITATIVE">
                  {t('structure.evaluationModeQualitative')}
                </SelectItem>
              </BareSelect>
            </FormGroup>
            {v.evaluationMode === 'QUALITATIVE' && (
              <>
                <FormGroup
                  label={t('structure.ratingScaleLabel')}
                  required
                  hint={t('structure.ratingScaleHint')}
                  error={errors.ratingScale}
                >
                  <RatingScaleEditor
                    value={v.ratingScale}
                    onChange={(scale) => setField('ratingScale', scale)}
                    lockedOrder={qualitative?.hasRatings ?? false}
                  />
                </FormGroup>
                {qualitative ? (
                  <CriteriaEditor
                    subjectId={qualitative.subjectId}
                    criteria={qualitative.criteria}
                    onChanged={qualitative.onChanged}
                  />
                ) : (
                  <p className="text-2xs text-muted-foreground">{t('structure.criteriaAfterSave')}</p>
                )}
              </>
            )}
            <SectionDivider />
            <ToggleRow
              title={t('structure.includeInAverageTitle')}
```

In `frontend/src/app/(school)/configuration/matieres/[id]/page.tsx`, add to the edit-mode `<SubjectForm …/>` (after `onToggleClass={onToggleClass}`):

```tsx
            qualitative={{
              subjectId: subject.id,
              criteria: subject.criteria,
              hasRatings: subject.hasRatings,
              onChanged: loadDetail,
            }}
```

(`subject` is non-null in that branch, the page already guards it; if TypeScript disagrees, use `subject!` is forbidden, so hoist the guard: this branch renders only when `subject` is loaded.)

- [ ] **Step 9: Expose `evaluationMode` in the class-subject payloads**

`frontend/src/app/api/school/class-subjects/route.ts`, `INCLUDE`: `subject: { select: { id: true, name: true, code: true, domain: true, evaluationMode: true } },`.

`frontend/src/app/api/teacher/me/route.ts`: line 68 becomes `subject: { select: { name: true, icon: true, color: true, evaluationMode: true } },` and after `subjectName: cs.subject.name,` (line 159) add `subjectEvaluationMode: cs.subject.evaluationMode,`. Then in `frontend/src/app/api/teacher/me/route.test.ts`, the `expect(json.classSubjects).toEqual([…])` around line 127 needs `subjectEvaluationMode: 'NUMERIC'` on each row and the fixture's `subject` object needs `evaluationMode: 'NUMERIC'`.

`frontend/src/app/(school)/pedagogie/carnet-de-notes/types.ts`: add `import type { EvaluationMode } from '@/lib/qualitative';` and change `subject: { id: string; name: string };` to `subject: { id: string; name: string; evaluationMode?: EvaluationMode };` (optional: other producers of `ClassSubjectOption` keep compiling; consumers treat `undefined` as NUMERIC).

- [ ] **Step 10: Add the copy in the three locales**

In `frontend/src/messages/fr/configuration.json`, inside `matieres.form.structure` after `"showOnBulletinDesc": …`, add:

```json
        "evaluationModeLabel": "Mode d'évaluation",
        "evaluationModeHint": "Par notes : évaluations chiffrées et moyenne. Par critères : grille cochée sur une échelle, sans note ni moyenne.",
        "evaluationModeNumeric": "Par notes",
        "evaluationModeQualitative": "Par critères",
        "ratingScaleLabel": "Échelle d'appréciation",
        "ratingScaleHint": "De 2 à 6 niveaux, du meilleur au moins bon. Ex : Toujours, Souvent, Parfois, Jamais.",
        "ratingScaleLevelPlaceholder": "Niveau {index}",
        "ratingScaleAdd": "Ajouter un niveau",
        "ratingScaleRemove": "Retirer ce niveau",
        "ratingScaleMoveUp": "Monter",
        "ratingScaleMoveDown": "Descendre",
        "ratingScaleLocked": "Des coches existent déjà : les niveaux peuvent être renommés, plus réordonnés.",
        "criteriaTitle": "Critères évalués",
        "criteriaHint": "Une ligne par critère, dans l'ordre d'affichage sur le bulletin.",
        "criteriaEmpty": "Aucun critère pour le moment.",
        "criteriaAfterSave": "Enregistrez la matière pour ajouter des critères.",
        "criterionPlaceholder": "Ex : Respecte les consignes",
        "criterionAdd": "Ajouter",
        "criterionRename": "Renommer",
        "criterionSave": "Enregistrer",
        "criterionCancel": "Annuler",
        "criterionDelete": "Supprimer",
        "criterionInUse": "Ce critère a des coches : il ne peut pas être supprimé.",
        "criterionSaveError": "Impossible d'enregistrer le critère."
```

and in `matieres.form.errors`: `"ratingScaleInvalid": "Entre 2 et 6 niveaux, tous remplis, distincts et de 30 caractères maximum."`

In `frontend/src/messages/en/configuration.json`, same keys:

```json
        "evaluationModeLabel": "Assessment mode",
        "evaluationModeHint": "By grades: scored assessments and an average. By criteria: a grid ticked on a scale, no grade and no average.",
        "evaluationModeNumeric": "By grades",
        "evaluationModeQualitative": "By criteria",
        "ratingScaleLabel": "Rating scale",
        "ratingScaleHint": "2 to 6 levels, best first. E.g. Always, Often, Sometimes, Never.",
        "ratingScaleLevelPlaceholder": "Level {index}",
        "ratingScaleAdd": "Add a level",
        "ratingScaleRemove": "Remove this level",
        "ratingScaleMoveUp": "Move up",
        "ratingScaleMoveDown": "Move down",
        "ratingScaleLocked": "Ratings already exist: levels can be renamed but no longer reordered.",
        "criteriaTitle": "Assessed criteria",
        "criteriaHint": "One line per criterion, in the order shown on the report card.",
        "criteriaEmpty": "No criteria yet.",
        "criteriaAfterSave": "Save the subject to add criteria.",
        "criterionPlaceholder": "E.g. Follows instructions",
        "criterionAdd": "Add",
        "criterionRename": "Rename",
        "criterionSave": "Save",
        "criterionCancel": "Cancel",
        "criterionDelete": "Delete",
        "criterionInUse": "This criterion has ratings: it cannot be deleted.",
        "criterionSaveError": "The criterion could not be saved."
```

and `"ratingScaleInvalid": "2 to 6 levels, all filled in, distinct and 30 characters at most."`

In `frontend/src/messages/ht/configuration.json` (best-effort Creole, the file keeps its `_review` key):

```json
        "evaluationModeLabel": "Mòd evalyasyon",
        "evaluationModeHint": "Pa nòt : evalyasyon ak chif ak mwayèn. Pa kritè : yon griy yo tcheke sou yon echèl, san nòt ni mwayèn.",
        "evaluationModeNumeric": "Pa nòt",
        "evaluationModeQualitative": "Pa kritè",
        "ratingScaleLabel": "Echèl apresyasyon",
        "ratingScaleHint": "2 a 6 nivo, pi bon an anvan. Egz. : Toujou, Souvan, Pafwa, Jamè.",
        "ratingScaleLevelPlaceholder": "Nivo {index}",
        "ratingScaleAdd": "Ajoute yon nivo",
        "ratingScaleRemove": "Retire nivo sa a",
        "ratingScaleMoveUp": "Monte",
        "ratingScaleMoveDown": "Desann",
        "ratingScaleLocked": "Gen kwa ki egziste deja : ou ka chanje non nivo yo, men ou pa ka chanje lòd yo ankò.",
        "criteriaTitle": "Kritè yo evalye",
        "criteriaHint": "Yon liy pou chak kritè, nan lòd yo parèt sou bilten an.",
        "criteriaEmpty": "Poko gen kritè.",
        "criteriaAfterSave": "Anrejistre matyè a pou ajoute kritè.",
        "criterionPlaceholder": "Egz. : Respekte konsiy yo",
        "criterionAdd": "Ajoute",
        "criterionRename": "Chanje non",
        "criterionSave": "Anrejistre",
        "criterionCancel": "Anile",
        "criterionDelete": "Efase",
        "criterionInUse": "Kritè sa a gen kwa : ou pa ka efase l.",
        "criterionSaveError": "Nou pa t ka anrejistre kritè a."
```

and `"ratingScaleInvalid": "2 a 6 nivo, tout ranpli, diferan, 30 karaktè maksimòm."`

- [ ] **Step 11: Typecheck, lint, locale parity, then a manual pass**

Run: `pnpm typecheck && pnpm lint && pnpm --filter frontend exec vitest run src/lib/locales.test.ts src/app/api/teacher/me src/app/api/school/class-subjects`
Expected: all clean.

Manual (dev server on the worktree's own port, never :3000, e.g. `PORT=3001 pnpm --filter frontend exec next dev --port 3001`): open `/configuration/matieres/nouvelle`, switch "Mode d'évaluation" to "Par critères": two empty levels appear, "Enregistrer" flags the empty scale, filling "Toujours / Souvent / Parfois / Jamais" saves; open the created subject: the criteria editor adds, renames, moves and deletes criteria; switching back to "Par notes" saves with an empty scale. Note anything off in your report; do not leave the dev server running.

- [ ] **Step 12: Format and commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add "frontend/src/app/(school)/configuration/matieres/types.ts" frontend/src/components/school/subjects/useSubjectForm.ts frontend/src/components/school/subjects/useSubjectForm.qualitative.test.ts frontend/src/components/school/subjects/RatingScaleEditor.tsx frontend/src/components/school/subjects/CriteriaEditor.tsx frontend/src/components/school/subjects/SubjectForm.tsx "frontend/src/app/(school)/configuration/matieres/[id]/page.tsx" frontend/src/app/api/school/class-subjects/route.ts frontend/src/app/api/teacher/me/route.ts frontend/src/app/api/teacher/me/route.test.ts "frontend/src/app/(school)/pedagogie/carnet-de-notes/types.ts" frontend/src/messages/fr/configuration.json frontend/src/messages/en/configuration.json frontend/src/messages/ht/configuration.json
git commit -m "feat(subjects): qualitative mode, rating scale and criteria on the subject form

Mode select + RatingScaleEditor + live CriteriaEditor (fr/ht/en copy),
evaluationMode exposed by /api/school/class-subjects and /api/teacher/me
(spec 2026-09-05 §4).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Entry screens (teacher portal + school app) and the gradebook branch

**Files:**
- Create: `frontend/src/components/gradebook/criteria-sheet-utils.ts`, `criteria-sheet-utils.test.ts`
- Create: `frontend/src/components/gradebook/CriteriaSheetEditor.tsx`
- Create: `frontend/src/components/gradebook/QualitativeSubjectCard.tsx`
- Create: `frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/criteres/[classSubjectId]/page.tsx`
- Create: `frontend/src/app/(school)/pedagogie/carnet-de-notes/criteres/[classSubjectId]/page.tsx`
- Modify: `frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/page.tsx` (`TeacherMeResponse` line 43-54, notebook `useApi` line 114-116, Button line 156-163, `{!unified ? (` line 196)
- Modify: `frontend/src/app/(school)/pedagogie/carnet-de-notes/page.tsx` (`notebookPath` `useApi` ~line 252-255, Button ~line 488-496, `{!unified ? (` ~line 649)
- Modify: `frontend/src/messages/{fr,ht,en}/gradebook.json` (new top-level `criteria` group)

**Interfaces:**
- Consumes: the sheet routes (Task 5: `GET/PUT {apiBase}/class-subjects/[id]/criteria-assessment`, `CriteriaSheet` shape incl. `terms`), `ClassSubjectOption.subject.evaluationMode` and `/api/teacher/me`'s `subjectEvaluationMode` (Task 7).
- Produces: `CriteriaSheetEditor({ apiBase: '/api/teacher' | '/api/school'; classSubjectId: string; backHref: string; canEdit: boolean })`, `QualitativeSubjectCard({ href })`, pure helpers `mergeSheetRatings`, `ratedCount`, `flattenOverrides`.

- [ ] **Step 1: Write the failing test for the pure helpers**

Create `frontend/src/components/gradebook/criteria-sheet-utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { flattenOverrides, mergeSheetRatings, ratedCount } from './criteria-sheet-utils';

describe('criteria-sheet-utils', () => {
  it('unsaved ticks win over stored ones and null clears a tick', () => {
    const merged = mergeSheetRatings(
      [
        { studentId: 's1', ratings: { c1: 0, c2: 2 } },
        { studentId: 's2', ratings: {} },
      ],
      { s1: { c2: null, c3: 1 } },
    );
    expect(merged.get('s1')).toEqual({ c1: 0, c2: null, c3: 1 });
    expect(ratedCount(merged.get('s1'))).toBe(2);
    expect(ratedCount(merged.get('s2'))).toBe(0);
    expect(ratedCount(undefined)).toBe(0);
  });

  it('flattens the unsaved ticks into the PUT body shape', () => {
    expect(flattenOverrides({ s1: { c1: 1, c2: null } })).toEqual([
      { studentId: 's1', criterionId: 'c1', level: 1 },
      { studentId: 's1', criterionId: 'c2', level: null },
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/components/gradebook/criteria-sheet-utils.test.ts`
Expected: FAIL, cannot resolve `./criteria-sheet-utils`.

- [ ] **Step 3: Write the helpers**

Create `frontend/src/components/gradebook/criteria-sheet-utils.ts`:

```ts
// Pure state helpers of CriteriaSheetEditor: the stored sheet plus the
// unsaved ticks (`overrides`, student → criterion → level | null).
export type RatingOverrides = Record<string, Record<string, number | null>>;
export type MergedRatings = Map<string, Record<string, number | null>>;

export function mergeSheetRatings(
  students: { studentId: string; ratings: Record<string, number> }[],
  overrides: RatingOverrides,
): MergedRatings {
  const map: MergedRatings = new Map();
  for (const s of students) {
    map.set(s.studentId, { ...s.ratings, ...(overrides[s.studentId] ?? {}) });
  }
  return map;
}

export function ratedCount(ratings: Record<string, number | null> | undefined): number {
  return Object.values(ratings ?? {}).filter((level) => level !== null).length;
}

export function flattenOverrides(
  overrides: RatingOverrides,
): { studentId: string; criterionId: string; level: number | null }[] {
  return Object.entries(overrides).flatMap(([studentId, byCriterion]) =>
    Object.entries(byCriterion).map(([criterionId, level]) => ({
      studentId,
      criterionId,
      level: level ?? null,
    })),
  );
}
```

- [ ] **Step 4: Run the helper test, expect PASS**

Run: `pnpm --filter frontend exec vitest run src/components/gradebook/criteria-sheet-utils.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Create the shared editor**

Create `frontend/src/components/gradebook/CriteriaSheetEditor.tsx`:

```tsx
'use client';

// Per-student entry screen of a qualitative sheet, shared by the teacher
// portal (/api/teacher) and the school app (/api/school): term picker,
// completion list (student × "n/N"), the selected student's grid (criteria ×
// scale, one tick per row, click the active tick to clear), prev/next
// student, "Enregistrer brouillon" and "Valider" (publishes the whole
// sheet). Read-only when the term's grade entry is off or the caller lacks
// the edit right; the lock and the scale labels come from the data.
// Spec 2026-09-05 §5.2.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Lock, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Skeleton } from '@/components/ui/Skeleton';
import { LIST_PAGE } from '@/lib/layout';
import { cn } from '@/lib/utils';
import {
  type RatingOverrides,
  flattenOverrides,
  mergeSheetRatings,
  ratedCount,
} from './criteria-sheet-utils';

export interface CriteriaSheetDto {
  id: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  term: { id: string; label: string; gradeEntryEnabled: boolean };
  terms: { id: string; label: string }[];
  classSubject: { id: string; className: string };
  subject: {
    id: string;
    name: string;
    ratingScale: string[];
    criteria: { id: string; label: string }[];
  };
  students: {
    studentId: string;
    firstName: string;
    lastName: string;
    ratings: Record<string, number>;
  }[];
}

export function CriteriaSheetEditor({
  apiBase,
  classSubjectId,
  backHref,
  canEdit,
}: {
  apiBase: '/api/teacher' | '/api/school';
  classSubjectId: string;
  backHref: string;
  canEdit: boolean;
}) {
  const t = useTranslations('Gradebook.criteria');
  const { toast } = useToast();
  const [termId, setTermId] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [overrides, setOverrides] = useState<RatingOverrides>({});
  const [saving, setSaving] = useState<'DRAFT' | 'PUBLISHED' | null>(null);

  const endpoint = `${apiBase}/class-subjects/${classSubjectId}/criteria-assessment`;
  const { data, error, refresh } = useApi<{ sheet: CriteriaSheetDto }>(
    `${endpoint}${termId ? `?termId=${termId}` : ''}`,
  );
  const sheet = data?.sheet ?? null;

  // Unsaved ticks belong to the sheet they were made on: drop them on a term change.
  useEffect(() => {
    setOverrides({});
    setSelected(0);
  }, [termId]);

  const locked = !canEdit || !sheet || !sheet.term.gradeEntryEnabled;
  const merged = useMemo(() => mergeSheetRatings(sheet?.students ?? [], overrides), [sheet, overrides]);
  const student = sheet?.students[selected] ?? null;
  const criteriaCount = sheet?.subject.criteria.length ?? 0;
  const dirty = Object.keys(overrides).length > 0;

  const setLevel = (criterionId: string, level: number | null) => {
    if (locked || !student) return;
    const id = student.studentId;
    setOverrides((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [criterionId]: level } }));
  };

  const save = async (status: 'DRAFT' | 'PUBLISHED') => {
    if (!sheet) return;
    setSaving(status);
    try {
      await api(endpoint, {
        method: 'PUT',
        body: { termId: sheet.term.id, status, ratings: flattenOverrides(overrides) },
      });
      await refresh();
      setOverrides({});
      toast(status === 'PUBLISHED' ? t('validatedToast') : t('draftSavedToast'), 'success');
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === 'GRADE_ENTRY_DISABLED'
          ? t('locked')
          : err instanceof ApiError
            ? err.message
            : t('saveError');
      toast(message, 'error');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className={`${LIST_PAGE} gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} />
            {t('back')}
          </Link>
          <h1 className="text-lg font-bold text-foreground">
            {sheet ? `${sheet.classSubject.className} · ${sheet.subject.name}` : t('title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {sheet && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-2xs font-bold',
                sheet.status === 'PUBLISHED'
                  ? 'bg-success text-success-foreground'
                  : 'bg-warning text-warning-foreground',
              )}
            >
              {sheet.status === 'PUBLISHED' ? t('statusPublished') : t('statusDraft')}
            </span>
          )}
          {!locked && (
            <>
              <Button
                variant="outline"
                className="w-fit"
                disabled={!dirty || saving !== null}
                loading={saving === 'DRAFT'}
                onClick={() => void save('DRAFT')}
              >
                <Save size={14} />
                {t('saveDraft')}
              </Button>
              <Button
                className="w-fit"
                disabled={saving !== null}
                loading={saving === 'PUBLISHED'}
                onClick={() => void save('PUBLISHED')}
              >
                <Check size={14} />
                {t('validate')}
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {t('loadError')}
        </p>
      )}
      {sheet && !sheet.term.gradeEntryEnabled && (
        <p className="flex items-center gap-2 rounded-md bg-warning/15 px-3 py-2 text-sm text-foreground">
          <Lock size={14} />
          {t('locked')}
        </p>
      )}

      <Card className="flex-row flex-wrap items-center gap-3 p-3.5">
        <FilterSelect value={sheet?.term.id ?? ''} onValueChange={setTermId}>
          {(sheet?.terms ?? []).map((term) => (
            <SelectItem key={term.id} value={term.id}>
              {term.label}
            </SelectItem>
          ))}
        </FilterSelect>
        {sheet && (
          <span className="text-xs text-muted-foreground">
            {t('scaleHint', { scale: sheet.subject.ratingScale.join(' · ') })}
          </span>
        )}
      </Card>

      {!sheet ? (
        <Skeleton className="h-72 w-full" />
      ) : sheet.students.length === 0 ? (
        <Card className="items-center gap-2 p-10 text-center">
          <p className="text-sm text-muted-foreground">{t('noStudents')}</p>
        </Card>
      ) : sheet.subject.criteria.length === 0 ? (
        <Card className="items-center gap-2 p-10 text-center">
          <p className="text-sm text-muted-foreground">{t('noCriteria')}</p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card className="gap-0 p-0">
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {sheet.students.map((s, i) => {
                const n = ratedCount(merged.get(s.studentId));
                return (
                  <li key={s.studentId}>
                    <button
                      type="button"
                      onClick={() => setSelected(i)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted',
                        i === selected && 'bg-primary/10 font-semibold',
                      )}
                    >
                      <span className="truncate">
                        {s.lastName} {s.firstName}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 text-xs',
                          n === criteriaCount ? 'text-success' : 'text-muted-foreground',
                        )}
                      >
                        {n}/{criteriaCount}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {student && (
            <Card className="gap-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={selected === 0}
                  onClick={() => setSelected(selected - 1)}
                >
                  <ChevronLeft size={14} />
                  {t('prevStudent')}
                </Button>
                <p className="text-sm font-semibold text-foreground">
                  {student.lastName} {student.firstName}{' '}
                  <span className="font-normal text-muted-foreground">
                    ({selected + 1}/{sheet.students.length})
                  </span>
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={selected === sheet.students.length - 1}
                  onClick={() => setSelected(selected + 1)}
                >
                  {t('nextStudent')}
                  <ChevronRight size={14} />
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="py-2 pr-2 text-left text-xs font-semibold text-muted-foreground">
                        {t('criterionColumn')}
                      </th>
                      {sheet.subject.ratingScale.map((label, level) => (
                        <th
                          key={level}
                          className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.subject.criteria.map((c) => {
                      const current = merged.get(student.studentId)?.[c.id] ?? null;
                      return (
                        <tr key={c.id} className="border-t border-border">
                          <td className="py-2 pr-2 text-foreground">{c.label}</td>
                          {sheet.subject.ratingScale.map((label, level) => (
                            <td key={level} className="px-2 py-2 text-center">
                              <button
                                type="button"
                                role="radio"
                                aria-checked={current === level}
                                aria-label={`${c.label}: ${label}`}
                                disabled={locked}
                                onClick={() => setLevel(c.id, current === level ? null : level)}
                                className={cn(
                                  'h-6 w-6 rounded-full border-2 transition-colors',
                                  current === level
                                    ? 'border-primary bg-primary'
                                    : 'border-border bg-card hover:border-primary/60',
                                  locked && 'cursor-not-allowed opacity-60',
                                )}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
```

(`useApi`'s `refresh` is awaited so the unsaved ticks stay displayed until the fresh sheet lands; if `refresh` returns `void` in this codebase the `await` is a harmless no-op.)

- [ ] **Step 6: Create the gradebook card and the two pages**

Create `frontend/src/components/gradebook/QualitativeSubjectCard.tsx`:

```tsx
'use client';

// Shown by both gradebook list pages in place of the notebook when the
// selected class-subject is evaluated by criteria (spec 2026-09-05 §4).
import { ListChecks } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function QualitativeSubjectCard({ href }: { href: string }) {
  const t = useTranslations('Gradebook.criteria');
  const router = useRouter();
  return (
    <Card className="items-center gap-3 p-10 text-center">
      <ListChecks size={28} className="text-muted-foreground" />
      <p className="max-w-md text-sm text-muted-foreground">{t('qualitativeSubjectHint')}</p>
      <Button className="w-fit" onClick={() => router.push(href)}>
        <ListChecks size={14} />
        {t('openSheet')}
      </Button>
    </Card>
  );
}
```

Create `frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/criteres/[classSubjectId]/page.tsx`:

```tsx
'use client';

// Grille de critères (teacher portal): the shared editor over
// /api/teacher, ownership enforced server-side (404 for a class-subject I
// do not teach). Static `criteres/` segment: the folder above already owns
// the `[evaluationId]` dynamic segment.
import { useParams } from 'next/navigation';
import { CriteriaSheetEditor } from '@/components/gradebook/CriteriaSheetEditor';

export default function TeacherCriteriaSheetPage() {
  const { classSubjectId } = useParams<{ classSubjectId: string }>();
  return (
    <CriteriaSheetEditor
      apiBase="/api/teacher"
      classSubjectId={classSubjectId}
      backHref="/espace-enseignant/carnet-de-notes"
      canEdit
    />
  );
}
```

Create `frontend/src/app/(school)/pedagogie/carnet-de-notes/criteres/[classSubjectId]/page.tsx`:

```tsx
'use client';

// Grille de critères (school app): notes.view to read, notes.edit to tick.
import { useParams } from 'next/navigation';
import { usePermissions } from '@/lib/usePermissions';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { CriteriaSheetEditor } from '@/components/gradebook/CriteriaSheetEditor';

export default function SchoolCriteriaSheetPage() {
  const { classSubjectId } = useParams<{ classSubjectId: string }>();
  const { can, canSee } = usePermissions();
  if (!canSee('notes')) return <AccessDenied />;
  return (
    <CriteriaSheetEditor
      apiBase="/api/school"
      classSubjectId={classSubjectId}
      backHref="/pedagogie/carnet-de-notes"
      canEdit={can('notes', 'edit')}
    />
  );
}
```

- [ ] **Step 7: Branch the two gradebook list pages**

Teacher page `frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/page.tsx`:

(a) Import: `import { QualitativeSubjectCard } from '@/components/gradebook/QualitativeSubjectCard';`

(b) In `TeacherMeResponse.classSubjects[]`, after `subjectName: string;`, add `subjectEvaluationMode: string;`.

(c) After `const myClassSubjects = useMemo(() => me?.classSubjects ?? [], [me]);` add:

```ts
  const qualitative =
    myClassSubjects.find((cs) => cs.id === classSubjectId)?.subjectEvaluationMode ===
    'QUALITATIVE';
```

(d) Notebook fetch: `skip: !classSubjectId,` becomes `skip: !classSubjectId || qualitative,`.

(e) New-evaluation button: `disabled={!classSubjectId || !termId}` becomes `disabled={!classSubjectId || !termId || qualitative}`.

(f) Replace `{!unified ? (` (the skeleton branch after the filter card) with:

```tsx
          {qualitative ? (
            <QualitativeSubjectCard
              href={`/espace-enseignant/carnet-de-notes/criteres/${classSubjectId}`}
            />
          ) : !unified ? (
```

School page `frontend/src/app/(school)/pedagogie/carnet-de-notes/page.tsx`:

(a) Same import.

(b) After the line that defines `classSubjects` (the array from `/api/school/class-subjects`) and before the `notebookPath` const, add:

```ts
  const qualitative =
    classSubjects.find((cs) => cs.id === subjectValue)?.subject.evaluationMode === 'QUALITATIVE';
```

(c) Notebook fetch: `skip: !classId || !subjectValue,` becomes `skip: !classId || !subjectValue || qualitative,`.

(d) New-evaluation button: `disabled={combined || !subjectValue}` becomes `disabled={combined || !subjectValue || qualitative}`.

(e) Replace the `{!unified ? (` that precedes the 8-row skeleton card with:

```tsx
          {qualitative ? (
            <QualitativeSubjectCard href={`/pedagogie/carnet-de-notes/criteres/${subjectValue}`} />
          ) : !unified ? (
```

- [ ] **Step 8: Add the copy**

`frontend/src/messages/fr/gradebook.json`, new top-level group (after `"page": { … }`):

```json
  "criteria": {
    "title": "Grille de critères",
    "subtitle": "Une coche par critère et par élève, sur l'échelle de la matière.",
    "back": "Retour au carnet de notes",
    "statusDraft": "Brouillon",
    "statusPublished": "Validée",
    "saveDraft": "Enregistrer brouillon",
    "validate": "Valider",
    "locked": "La saisie est désactivée pour cette période.",
    "scaleHint": "Échelle : {scale}",
    "criterionColumn": "Critère",
    "prevStudent": "Précédent",
    "nextStudent": "Suivant",
    "noStudents": "Aucun élève inscrit dans cette classe.",
    "noCriteria": "Cette matière n'a pas encore de critères. Ajoutez-les dans la fiche matière.",
    "loadError": "Impossible de charger la grille pour le moment.",
    "saveError": "Impossible d'enregistrer la grille.",
    "draftSavedToast": "Brouillon enregistré.",
    "validatedToast": "Grille validée et publiée.",
    "qualitativeSubjectHint": "Cette matière est évaluée par critères, sans notes ni moyenne.",
    "openSheet": "Ouvrir la grille de critères"
  }
```

`frontend/src/messages/en/gradebook.json`:

```json
  "criteria": {
    "title": "Criteria grid",
    "subtitle": "One tick per criterion and per student, on the subject's scale.",
    "back": "Back to the grade book",
    "statusDraft": "Draft",
    "statusPublished": "Validated",
    "saveDraft": "Save draft",
    "validate": "Validate",
    "locked": "Grade entry is disabled for this term.",
    "scaleHint": "Scale: {scale}",
    "criterionColumn": "Criterion",
    "prevStudent": "Previous",
    "nextStudent": "Next",
    "noStudents": "No student is enrolled in this class.",
    "noCriteria": "This subject has no criteria yet. Add them on the subject page.",
    "loadError": "The grid cannot be loaded right now.",
    "saveError": "The grid could not be saved.",
    "draftSavedToast": "Draft saved.",
    "validatedToast": "Grid validated and published.",
    "qualitativeSubjectHint": "This subject is assessed by criteria, without grades or an average.",
    "openSheet": "Open the criteria grid"
  }
```

`frontend/src/messages/ht/gradebook.json` (best-effort Creole):

```json
  "criteria": {
    "title": "Griy kritè",
    "subtitle": "Yon kwa pou chak kritè ak chak elèv, sou echèl matyè a.",
    "back": "Retounen nan kanè nòt la",
    "statusDraft": "Bouyon",
    "statusPublished": "Valide",
    "saveDraft": "Anrejistre bouyon",
    "validate": "Valide",
    "locked": "Sezi nòt yo fèmen pou peryòd sa a.",
    "scaleHint": "Echèl : {scale}",
    "criterionColumn": "Kritè",
    "prevStudent": "Anvan",
    "nextStudent": "Apre",
    "noStudents": "Pa gen okenn elèv enskri nan klas sa a.",
    "noCriteria": "Matyè sa a poko gen kritè. Ajoute yo nan fich matyè a.",
    "loadError": "Nou pa ka chaje griy la kounye a.",
    "saveError": "Nou pa t ka anrejistre griy la.",
    "draftSavedToast": "Bouyon anrejistre.",
    "validatedToast": "Griy la valide epi pibliye.",
    "qualitativeSubjectHint": "Matyè sa a evalye pa kritè, san nòt ni mwayèn.",
    "openSheet": "Louvri griy kritè a"
  }
```

- [ ] **Step 9: Verify: typecheck, lint, locale parity, manual pass**

Run: `pnpm typecheck && pnpm lint && pnpm --filter frontend exec vitest run src/lib/locales.test.ts src/components/gradebook`
Expected: clean.

Manual (worktree dev server on its own port, e.g. 3001; log in as the seeded teacher and as the school admin from `frontend/CREDENTIALS.local.md`; you need one qualitative subject with criteria attached to a class from Task 7's manual pass): on both gradebook list pages the qualitative class-subject shows the card instead of the notebook and "Nouvelle évaluation" is disabled; the criteria page lists the roster with `0/N`, ticking updates the count, "Enregistrer brouillon" then "Valider" flip the pill; disabling grade entry on the term (Paramètres › Année scolaire) locks the grid; a MEMBER with `notes.view` only sees a read-only grid. Report anything off. Stop the dev server afterwards.

- [ ] **Step 10: Format and commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add frontend/src/components/gradebook/criteria-sheet-utils.ts frontend/src/components/gradebook/criteria-sheet-utils.test.ts frontend/src/components/gradebook/CriteriaSheetEditor.tsx frontend/src/components/gradebook/QualitativeSubjectCard.tsx "frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/criteres/[classSubjectId]/page.tsx" "frontend/src/app/(school)/pedagogie/carnet-de-notes/criteres/[classSubjectId]/page.tsx" "frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/page.tsx" "frontend/src/app/(school)/pedagogie/carnet-de-notes/page.tsx" frontend/src/messages/fr/gradebook.json frontend/src/messages/en/gradebook.json frontend/src/messages/ht/gradebook.json
git commit -m "feat(gradebook): criteria grid entry screens, teacher portal + school app

Shared CriteriaSheetEditor (per-student grid, prev/next, draft/validate,
term lock), static criteres/[classSubjectId] pages, qualitative branch on
both gradebook list pages (spec 2026-09-05 §5.2).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Student portal grids, CLAUDE.md, final gate

**Files:**
- Create: `frontend/src/components/student/QualitativeGridsCard.tsx`
- Modify: `frontend/src/app/(eleve)/eleve/notes/page.tsx`
- Modify: `frontend/src/messages/{fr,ht,en}/elevePortal.json` (new top-level `qualitative` group)
- Modify: `CLAUDE.md` (one paragraph after the "Espace Élève" paragraph)

**Interfaces:**
- Consumes: `GET /api/student/criteria-assessments?termId=` → `{ terms, term, grids }` (Task 6).

- [ ] **Step 1: Create the card**

Create `frontend/src/components/student/QualitativeGridsCard.tsx`:

```tsx
'use client';

// Read-only grids of the student's PUBLISHED qualitative sheets, under the
// grades table of Mes notes (spec 2026-09-05 §7). The term follows the
// API's current-term rule; the picker lets the student look back. The card
// is not rendered at all when the class has no qualitative subject.
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

interface QualitativeView {
  terms: { id: string; label: string }[];
  term: { id: string; label: string } | null;
  grids: {
    classSubjectId: string;
    subjectName: string;
    ratingScale: string[];
    criteria: { id: string; label: string; level: number | null }[];
  }[];
}

export function QualitativeGridsCard() {
  const t = useTranslations('ElevePortal.qualitative');
  const [termId, setTermId] = useState<string | null>(null);
  const { data, error } = useApi<QualitativeView>(
    `/api/student/criteria-assessments${termId ? `?termId=${termId}` : ''}`,
  );

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive-foreground">
        {t('loadError')}
      </p>
    );
  }
  if (!data) return <Skeleton className="h-24 w-full" />;
  if (data.grids.length === 0 && termId === null) return null;

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-foreground">{t('title')}</h2>
          <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
        </div>
        <FilterSelect value={data.term?.id ?? ''} onValueChange={setTermId}>
          {data.terms.map((term) => (
            <SelectItem key={term.id} value={term.id}>
              {term.label}
            </SelectItem>
          ))}
        </FilterSelect>
      </div>
      {data.grids.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        data.grids.map((g) => (
          <div key={g.classSubjectId} className="overflow-x-auto">
            <h3 className="mb-1 text-sm font-semibold text-foreground">{g.subjectName}</h3>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="py-1.5 pr-2 text-left text-xs font-semibold text-muted-foreground">
                    {t('criterionColumn')}
                  </th>
                  {g.ratingScale.map((label, i) => (
                    <th
                      key={i}
                      className="px-2 py-1.5 text-center text-xs font-semibold text-muted-foreground"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.criteria.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-1.5 pr-2 text-foreground">{c.label}</td>
                    {g.ratingScale.map((label, level) => (
                      <td key={level} className="px-2 py-1.5 text-center">
                        <span
                          role="img"
                          aria-label={c.level === level ? `${c.label}: ${label}` : ''}
                          className={cn(
                            'inline-block h-4 w-4 rounded-full border-2',
                            c.level === level ? 'border-primary bg-primary' : 'border-border',
                          )}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Mount it under the grades table**

In `frontend/src/app/(eleve)/eleve/notes/page.tsx`, add `import { QualitativeGridsCard } from '@/components/student/QualitativeGridsCard';` and replace

```tsx
        results ? (
          <NotesResultatsTab
            studentId={me.student.id}
            studentName={`${me.student.firstName} ${me.student.lastName}`}
            initial={results}
            apiBase="/api/student"
            readOnly
          />
        ) : error ? (
```

with

```tsx
        results ? (
          <div className="flex flex-col gap-4">
            <NotesResultatsTab
              studentId={me.student.id}
              studentName={`${me.student.firstName} ${me.student.lastName}`}
              initial={results}
              apiBase="/api/student"
              readOnly
            />
            <QualitativeGridsCard />
          </div>
        ) : error ? (
```

- [ ] **Step 3: Add the copy**

`frontend/src/messages/fr/elevePortal.json`, new top-level group:

```json
  "qualitative": {
    "title": "Grilles de critères",
    "subtitle": "Vos matières évaluées par critères, telles que publiées par vos enseignants.",
    "empty": "Aucune grille publiée pour cette période.",
    "criterionColumn": "Critère",
    "loadError": "Impossible de charger les grilles pour le moment."
  }
```

`frontend/src/messages/en/elevePortal.json`:

```json
  "qualitative": {
    "title": "Criteria grids",
    "subtitle": "Your subjects assessed by criteria, as published by your teachers.",
    "empty": "No grid published for this term.",
    "criterionColumn": "Criterion",
    "loadError": "The grids cannot be loaded right now."
  }
```

`frontend/src/messages/ht/elevePortal.json`:

```json
  "qualitative": {
    "title": "Griy kritè",
    "subtitle": "Matyè ou yo ki evalye pa kritè, jan pwofesè ou yo pibliye yo.",
    "empty": "Pa gen okenn griy pibliye pou peryòd sa a.",
    "criterionColumn": "Kritè",
    "loadError": "Nou pa ka chaje griy yo kounye a."
  }
```

- [ ] **Step 4: Document the feature in CLAUDE.md**

Insert this paragraph right after the "**Espace Élève (student portal, 2026-09-02).**" paragraph:

```markdown
**Matières qualitatives (2026-09-05).** A `Subject` carries `evaluationMode` (`NUMERIC` | `QUALITATIVE`) and, in qualitative mode, an ordered `ratingScale` (2 to 6 labels, ratings store the index) plus `SubjectCriterion` rows; ratings live in `CriteriaAssessment` (one sheet per class-subject and term, `DRAFT` | `PUBLISHED`, mirror of `Evaluation`) and `CriteriaRating` (mirror of `Grade`), migration `38_qualitative_subjects`. Invariant for anyone adding a numeric consumer: a qualitative subject never has evaluations, so every `prisma.classSubject.findMany` behind averages, ranks, notebooks or the bulletin table spreads `NUMERIC_SUBJECT_FILTER` from [frontend/src/lib/server/qualitative.ts](frontend/src/lib/server/qualitative.ts) into its `where` (the six existing sites do; the appreciation screens deliberately keep qualitative subjects so a comment on « Comportement » stays possible), and both evaluation POSTs answer 409 `SUBJECT_NOT_NUMERIC`. Transition guards on `PATCH /api/school/subjects/[id]`: 409 `SUBJECT_HAS_EVALUATIONS` (to qualitative while evaluations exist), `SUBJECT_HAS_RATINGS` (back to numeric while ticks exist), `SCALE_LEVEL_IN_USE` (removing a ticked level; renaming is always free, reordering only while no tick exists, which the form enforces through `hasRatings`); criteria CRUD under `/api/school/subjects/[id]/criteria` (409 `CRITERION_IN_USE` on delete). Entry: `GET/PUT /api/teacher/class-subjects/[id]/criteria-assessment` (ownership = `myTeacher.classSubjectIds`) and its school mirror under `/api/school/class-subjects/[id]/criteria-assessment` (`notes.view`/`notes.edit`), same contracts through [frontend/src/lib/server/criteria-assessment.ts](frontend/src/lib/server/criteria-assessment.ts) (a `GET` never writes: an unsaved sheet comes back virtual with `id: null`; `PUT` upserts, `null` erases a tick, 403 `GRADE_ENTRY_DISABLED` like the grades route); screens are the shared `CriteriaSheetEditor` under the static `carnet-de-notes/criteres/[classSubjectId]` segment of both gradebooks (the folder already owns `[evaluationId]`), copy under `Gradebook.criteria.*`. Students read their own `PUBLISHED` grids through `GET /api/student/criteria-assessments` (`student-views/criteria.ts`, never a classmate's tick), shown under Mes notes, and `getStudentBulletinView` exposes them as `qualitativeSubjects` for the report-card templates. See [docs/superpowers/specs/2026-09-05-bulletin-prescolaire-et-pages-design.md](docs/superpowers/specs/2026-09-05-bulletin-prescolaire-et-pages-design.md).
```

- [ ] **Step 5: Full gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: all green, including `locales.test.ts` (key parity for `configuration`, `gradebook`, `elevePortal`), the runtime and RBAC tripwires, and the CLAUDE.md shape tests under `src/lib/server/observability/`.

Manual (worktree dev server, log in as the seeded student `jimmy.valcin@eleves.lesetoiles.edu.ht`): `/eleve/notes` shows no extra card while the class has no published qualitative sheet; after validating a sheet as the teacher for that class (Task 8), the card appears with the student's own ticks only. Stop the dev server afterwards.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/student/QualitativeGridsCard.tsx "frontend/src/app/(eleve)/eleve/notes/page.tsx" frontend/src/messages/fr/elevePortal.json frontend/src/messages/en/elevePortal.json frontend/src/messages/ht/elevePortal.json CLAUDE.md
git commit -m "feat(student): read-only criteria grids on Mes notes + CLAUDE.md

QualitativeGridsCard over /api/student/criteria-assessments, elevePortal
copy (fr/ht/en), feature paragraph in CLAUDE.md (spec 2026-09-05 §7).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Out of scope for this plan (spec §15 and plans 2-3)

Whole-class matrix entry, criterion archiving, wiring `includeInAverage`/`showOnBulletin`, batch PDF export, translated printed content, the page engine (§9-§11), the preschool template, per-level template selection and the dev seed (§8, §12, §13's seeds and backfills).
