# Espace Enseignant Phase 3, Plan 2 : Carnet de notes enseignant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher create, grade, publish, edit and delete evaluations for their own subjects from the teacher portal, through a dedicated `/api/teacher/*` write surface and screens that mirror the school Carnet de notes.

**Architecture:** Five new teacher routes mirror the school gradebook routes with per-teacher ownership (`ClassSubject.teacherId === my teacherId`, re-checked in DB per request, 404 anti-leak). The UI reuses the school gradebook's pure components verbatim (`ParEvaluationTab`, `StatistiquesTab`, `EvaluationConfigForm` — all props-driven, all already translated under `Gradebook.*`) behind teacher pages that fetch only `/api/teacher/*`. The saisie and edit screens are enumerated-delta clones of their school twins; the offline queue is deliberately NOT used (spec: online-first for the teacher portal). This plan also lands the Plan-1 parked hardening on `students/[id]`.

**Tech Stack:** Next.js 16 Route Handlers (runtime nodejs), Prisma 5 + prismaMock Vitest, next-intl (fr/ht/en), Tailwind v4 tokens.

**Spec:** `docs/superpowers/specs/2026-08-31-espace-enseignant-phase3-saisie-design.md` (sections « Carnet de notes enseignant », « API », « Garde-fous », « Livraison » Plan 2). Two recorded deviations from the spec's API list, both toward what the school screens actually consume: (1) no `GET /api/teacher/evaluations` list route — the school UI is driven by the notebook aggregate, so the teacher mirror is `GET /api/teacher/class-subjects/[id]/notebook` instead; (2) the grade-entry lock error code is `GRADE_ENTRY_DISABLED` (the code the school route actually uses), not the spec's provisional `TERM_GRADE_ENTRY_DISABLED`.

## Global Constraints

- Every new Route Handler: `export const runtime = 'nodejs'`, `withRequestContext(makeRequestContext(req.headers), …)`, `requireAuth`, `verifyCsrf(req)` first on every mutation.
- Resolution preamble on every route: `resolveMySchoolIncludingTeacher(sub)` then `resolveMyTeacherProfile(sub, schoolId)`; missing either → 404 `NOT_FOUND`. Any resource outside my affectations → **404** (never 403), except the grade-entry lock which mirrors the school's **403 `GRADE_ENTRY_DISABLED`** and term-validation failures which mirror the school's **400 `VALIDATION_FAILED`**.
- No `/api/school/*` file modified. No file from CLAUDE.md's protected list modified.
- User-facing strings: no em dash; `·` is the separator; fr uses straight apostrophes in JSON (matching the existing fr files); all three locales ship together, ht with the standard `_review` note.
- TypeScript strict + `exactOptionalPropertyTypes`; theme tokens only.
- Gate before every commit: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` (suite starts at 1604 tests / 127 files).
- Shared git index: `git add` explicit paths, `git commit --only <paths>`.
- Worktree setup note: EnterWorktree branches from origin's default, not local develop — after creating the worktree run `git reset --hard develop` then `pnpm install` and a baseline `pnpm test` before Task 1.

---

### Task 1: Plan-1 hardening — terms on the profile route, tightened guards, notFound message

**Files:**
- Modify: `frontend/src/app/api/teacher/students/[id]/route.ts`
- Modify: `frontend/src/app/api/teacher/students/[id]/route.test.ts`
- Modify: `frontend/src/app/(teacher)/espace-enseignant/eleves/[id]/page.tsx`
- Modify: `frontend/src/messages/{fr,ht,en}/teacherStudents.json` (one new key each)

**Interfaces:**
- Produces: profile response gains `terms: [{ id, label }]` (all the student's year's terms, ordered); the profile page no longer fetches `/api/teacher/me`.

- [ ] **Step 1: Update the route tests (failing first)**

In `route.test.ts`:

1. In the test `omits the general appreciation clause for a non-homeroom teacher`, change the expected `where` to (the empty-subject branch is now built conditionally, so only the subject clause remains for a subject teacher):

```ts
    expect(where).toEqual({
      studentId: 'stu_1',
      termId: 'term_1',
      OR: [{ subjectId: { in: ['sub_1'] } }],
    });
```

(unchanged — this assertion already holds; it is listed to confirm it must keep passing).

2. In the test `serves a homeroom-only teacher: ...`, change the expected `where.OR` to:

```ts
    expect(where).toEqual({
      studentId: 'stu_1',
      termId: 'term_1',
      OR: [{ subjectId: null }],
    });
```

3. In the nominal test (`returns identity, my subjects with a PUBLISHED-only average, and my appreciations`), add after the appreciations assertion:

```ts
    expect(body.terms).toEqual([{ id: 'term_1', label: '1er Trimestre' }]);
```

4. Add two new tests at the end of the describe block:

```ts
  it('404s without querying enrollments when the teacher has no classes at all', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue({
      teacherId: 'tea_1',
      classSubjectIds: [],
      homeroomClassIds: [],
    });
    expect((await call()).status).toBe(404);
    expect(prismaMock.enrollment.findFirst).not.toHaveBeenCalled();
  });

  it('404s when the enrollment year and the class year disagree', async () => {
    prismaMock.enrollment.findFirst.mockResolvedValue({
      classId: 'cls_1',
      academicYearId: 'year_1',
      class: { id: 'cls_1', name: '3ème A', level: '3ème', academicYearId: 'year_OLD' },
      student: {
        id: 'stu_1',
        firstName: 'Nadia',
        lastName: 'Alexis',
        studentNumber: 'EL-2026-001',
        photoUrl: null,
        status: 'ENROLLED',
        schoolId: 'school_1',
      },
    } as never);
    expect((await call()).status).toBe(404);
  });
```

5. The `beforeEach` enrollment mock's `class` select gains `academicYearId: 'year_1'` (matching the route's new select):

```ts
    class: { id: 'cls_1', name: '3ème A', level: '3ème', academicYearId: 'year_1' },
```

- [ ] **Step 2: Run the focused file, confirm the new/changed tests fail**

Run: `pnpm --filter frontend exec vitest run "src/app/api/teacher/students/[id]/route.test.ts"`
Expected: the two new tests FAIL (route still queries with empty scope / lacks the year check), the terms assertion FAILS, the homeroom-only OR assertion FAILS. Pre-existing tests may pass.

- [ ] **Step 3: Apply the route changes**

In `route.ts`, four edits:

1. After `const myClassIds = [...]`, add the short-circuit:

```ts
    if (myClassIds.length === 0) return notFound(ctx.requestId);
```

2. In the enrollment select, add `academicYearId` to the class select:

```ts
        class: { select: { id: true, name: true, level: true, academicYearId: true } },
```

and extend the ownership guard to reject a year mismatch (an Enrollment and its Class carry independent year columns; nothing at the DB level forces them to agree, so make the invariant explicit):

```ts
    if (
      !enrollment ||
      enrollment.student.schoolId !== mySchool.schoolId ||
      enrollment.class.academicYearId !== enrollment.academicYearId
    ) {
      return notFound(ctx.requestId);
    }
```

3. Build both OR branches conditionally (removes the reliance on empty-`in` semantics; the two branches can never both be empty for a class that passed the scoping filter):

```ts
            OR: [
              ...(inThisClass.length > 0
                ? [{ subjectId: { in: inThisClass.map((cs) => cs.subjectId) } }]
                : []),
              ...(isMyHomeroom ? [{ subjectId: null }] : []),
            ],
```

4. In the response object, after `term:`, add:

```ts
        terms: terms.map((t) => ({ id: t.id, label: t.label })),
```

Also strip `academicYearId` before serializing `class` (the select now carries it): replace `class: enrollment.class,` with:

```ts
        class: {
          id: enrollment.class.id,
          name: enrollment.class.name,
          level: enrollment.class.level,
        },
```

- [ ] **Step 4: Run the focused file, confirm all pass**

Run: `pnpm --filter frontend exec vitest run "src/app/api/teacher/students/[id]/route.test.ts"`
Expected: 10 tests PASS.

- [ ] **Step 5: Add the notFound message key (all three locales)**

In `frontend/src/messages/fr/teacherStudents.json`, inside `"profile"`, after `"back"`:

```json
    "notFound": "Cet élève n'est pas ou plus dans vos classes.",
```

In `en/teacherStudents.json`, same position:

```json
    "notFound": "This student is not in your classes anymore.",
```

In `ht/teacherStudents.json`, same position:

```json
    "notFound": "Elèv sa a pa nan klas ou yo ankò.",
```

- [ ] **Step 6: Update the profile page**

In `frontend/src/app/(teacher)/espace-enseignant/eleves/[id]/page.tsx`:

1. Extend `ProfileResponse` with `terms: { id: string; label: string }[];` (after the `term` field), and delete the whole `TeacherMeTermsResponse` interface.
2. Replace the two `useApi` calls and add 404 detection. Delete the `const { data: me } = useApi<TeacherMeTermsResponse>('/api/teacher/me');` line; change the imports line `import { useApi } from '@/lib/useApi';` to also import ApiError support:

```ts
import { ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
```

and replace the profile fetch with:

```ts
  const [notFound, setNotFound] = useState(false);
  const { data, error } = useApi<ProfileResponse>(
    `/api/teacher/students/${id}${termId ? `?termId=${termId}` : ''}`,
    {
      onError: (err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          return true;
        }
      },
    },
  );
```

3. In the render, replace the error branch:

```tsx
      {notFound ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {t('notFound')}
        </p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {tPortal('loadError')}
        </p>
      ) : !data ? (
```

4. Replace the term selector's source: the condition `{me && me.terms.length > 0 && (` becomes `{data.terms.length > 0 && (` and inside, `me.terms.map` becomes `data.terms.map`. (The selector block already sits inside the `data`-present branch.)

- [ ] **Step 7: Gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add "frontend/src/app/api/teacher/students/[id]/route.ts" "frontend/src/app/api/teacher/students/[id]/route.test.ts" "frontend/src/app/(teacher)/espace-enseignant/eleves/[id]/page.tsx" frontend/src/messages/fr/teacherStudents.json frontend/src/messages/ht/teacherStudents.json frontend/src/messages/en/teacherStudents.json
git commit --only "frontend/src/app/api/teacher/students/[id]/route.ts" --only "frontend/src/app/api/teacher/students/[id]/route.test.ts" --only "frontend/src/app/(teacher)/espace-enseignant/eleves/[id]/page.tsx" --only frontend/src/messages/fr/teacherStudents.json --only frontend/src/messages/ht/teacherStudents.json --only frontend/src/messages/en/teacherStudents.json -m "feat(teacher): serve terms from the student profile route and harden its guards"
```

---

### Task 2: POST /api/teacher/evaluations

**Files:**
- Create: `frontend/src/app/api/teacher/evaluations/route.ts`
- Test: `frontend/src/app/api/teacher/evaluations/route.test.ts`

**Interfaces:**
- Consumes: `resolveMySchoolIncludingTeacher`, `resolveMyTeacherProfile`.
- Produces: `POST` body identical to the school `CreateEvaluationBody`; 201 `{ evaluation }`. Consumed by Task 7's modal.

- [ ] **Step 1: Write the failing tests**

Create `route.test.ts`:

```ts
// POST /api/teacher/evaluations — a teacher creates an evaluation for one
// of their own class-subjects. prismaMock first.
import { prismaMock } from '@/test-utils/prisma-mock';
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

import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveIncludingTeacher = vi.mocked(resolveMySchoolIncludingTeacher);
const mockResolveMyTeacherProfile = vi.mocked(resolveMyTeacherProfile);

const authUser = { user: { sub: 'user_1', email: 'teacher@test.local' } };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };

function call(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/teacher/evaluations', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

const validBody = { classSubjectId: 'cs_1', termId: 'term_1', label: 'DS 1' };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveIncludingTeacher.mockResolvedValue(memberSchool);
  mockResolveMyTeacherProfile.mockResolvedValue({
    teacherId: 'tea_1',
    classSubjectIds: ['cs_1'],
    homeroomClassIds: [],
  });
  prismaMock.classSubject.findUnique.mockResolvedValue({
    id: 'cs_1',
    classId: 'cls_1',
    class: { schoolId: 'school_1', academicYearId: 'year_1' },
  } as never);
  prismaMock.term.findUnique.mockResolvedValue({
    id: 'term_1',
    academicYearId: 'year_1',
  } as never);
  prismaMock.evaluation.create.mockResolvedValue({
    id: 'eva_1',
    classSubjectId: 'cs_1',
    termId: 'term_1',
    label: 'DS 1',
    type: 'AUTRE',
    status: 'DRAFT',
  } as never);
});

describe('POST /api/teacher/evaluations', () => {
  it('401s an unauthenticated caller', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    expect((await call(validBody)).status).toBe(401);
  });

  it('404s a non-teacher account', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    expect((await call(validBody)).status).toBe(404);
  });

  it('404s a classSubject that is not one of my affectations, without touching the DB', async () => {
    const res = await call({ ...validBody, classSubjectId: 'cs_OTHER' });
    expect(res.status).toBe(404);
    expect(prismaMock.classSubject.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.evaluation.create).not.toHaveBeenCalled();
  });

  it('400s a term that does not belong to the class year', async () => {
    prismaMock.term.findUnique.mockResolvedValue({
      id: 'term_1',
      academicYearId: 'year_OTHER',
    } as never);
    const res = await call(validBody);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(prismaMock.evaluation.create).not.toHaveBeenCalled();
  });

  it('400s an invalid body', async () => {
    expect((await call({ classSubjectId: 'cs_1' })).status).toBe(400);
  });

  it('creates with defaults and returns 201', async () => {
    const res = await call(validBody);
    expect(res.status).toBe(201);
    expect((await res.json()).evaluation).toMatchObject({ id: 'eva_1' });
    expect(prismaMock.evaluation.create).toHaveBeenCalledWith({
      data: {
        classSubjectId: 'cs_1',
        termId: 'term_1',
        label: 'DS 1',
        type: 'AUTRE',
        maxScore: 20,
        coefficient: 1,
        countsTowardAverage: true,
        notes: null,
        order: 0,
        date: null,
      },
    });
  });
});
```

- [ ] **Step 2: Run to confirm failure** — `pnpm --filter frontend exec vitest run src/app/api/teacher/evaluations/route.test.ts` → FAIL (no `./route`).

- [ ] **Step 3: Implement the route**

Create `route.ts`:

```ts
// POST /api/teacher/evaluations — a teacher creates an evaluation for one
// of their OWN class-subjects. Same body contract as the school route; the
// authorization differs: the classSubjectId must be in the caller's own
// affectations (404 anti-leak otherwise, checked BEFORE any lookup so a
// foreign id costs nothing), and the term must belong to the class's
// academic year (stricter than the school route's school-level check, and
// what the spec intends). Teachers publish their own evaluations via the
// sibling [id] route. See
// docs/superpowers/specs/2026-08-31-espace-enseignant-phase3-saisie-design.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const CreateEvaluationBody = z.object({
  classSubjectId: z.string().min(1),
  termId: z.string().min(1),
  label: z.string().trim().min(1).max(60),
  type: z.enum(['DS', 'INTERROGATION', 'EXAMEN', 'AUTRE']).optional(),
  maxScore: z.number().int().min(1).max(1000).optional(),
  coefficient: z.number().int().min(1).max(10).optional(),
  countsTowardAverage: z.boolean().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  order: z.number().int().min(0).optional(),
  date: z.coerce.date().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchoolIncludingTeacher(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const myTeacher = await resolveMyTeacherProfile(auth.user.sub, mySchool.schoolId);
    if (!myTeacher) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = CreateEvaluationBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (!myTeacher.classSubjectIds.includes(parsed.data.classSubjectId)) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [classSubject, term] = await Promise.all([
      prisma.classSubject.findUnique({
        where: { id: parsed.data.classSubjectId },
        select: { id: true, class: { select: { schoolId: true, academicYearId: true } } },
      }),
      prisma.term.findUnique({
        where: { id: parsed.data.termId },
        select: { id: true, academicYearId: true },
      }),
    ]);
    if (
      !classSubject ||
      classSubject.class.schoolId !== mySchool.schoolId ||
      !term ||
      term.academicYearId !== classSubject.class.academicYearId
    ) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid classSubjectId or termId' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const evaluation = await prisma.evaluation.create({
      data: {
        classSubjectId: parsed.data.classSubjectId,
        termId: parsed.data.termId,
        label: parsed.data.label,
        type: parsed.data.type ?? 'AUTRE',
        maxScore: parsed.data.maxScore ?? 20,
        coefficient: parsed.data.coefficient ?? 1,
        countsTowardAverage: parsed.data.countsTowardAverage ?? true,
        notes: parsed.data.notes ?? null,
        order: parsed.data.order ?? 0,
        date: parsed.data.date ?? null,
      },
    });

    return NextResponse.json(
      { evaluation },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run to confirm pass** — 6 tests PASS.

- [ ] **Step 5: Gate + commit**

```bash
git add frontend/src/app/api/teacher/evaluations/route.ts frontend/src/app/api/teacher/evaluations/route.test.ts
git commit --only frontend/src/app/api/teacher/evaluations/route.ts --only frontend/src/app/api/teacher/evaluations/route.test.ts -m "feat(teacher): create evaluations for my own class-subjects"
```

---

### Task 3: GET/PATCH/DELETE /api/teacher/evaluations/[id]

**Files:**
- Create: `frontend/src/app/api/teacher/evaluations/[id]/route.ts`
- Test: `frontend/src/app/api/teacher/evaluations/[id]/route.test.ts`

**Interfaces:**
- Produces: `GET` → `{ evaluation }` with `classSubject.{class{id,name},subject{id,name},teacher}` and `term{id,label}` (the shape Task 8's saisie/edit pages consume); `PATCH` same body as the school `UpdateEvaluationBody` (publish = `{ status: 'PUBLISHED' }`); `DELETE` → 204.

- [ ] **Step 1: Write the failing tests**

Create `route.test.ts`:

```ts
// GET/PATCH/DELETE /api/teacher/evaluations/[id] — read, edit, publish and
// delete ONE of my own evaluations. Ownership is the evaluation's
// classSubject.teacherId, re-read from the DB per request. prismaMock first.
import { prismaMock } from '@/test-utils/prisma-mock';
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

import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { GET, PATCH, DELETE } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveIncludingTeacher = vi.mocked(resolveMySchoolIncludingTeacher);
const mockResolveMyTeacherProfile = vi.mocked(resolveMyTeacherProfile);

const authUser = { user: { sub: 'user_1', email: 'teacher@test.local' } };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };

const ownedEvaluation = {
  id: 'eva_1',
  classSubjectId: 'cs_1',
  termId: 'term_1',
  label: 'DS 1',
  type: 'DS',
  maxScore: 20,
  coefficient: 2,
  countsTowardAverage: true,
  status: 'DRAFT',
  notes: null,
  order: 0,
  date: null,
  classSubject: {
    teacherId: 'tea_1',
    class: { id: 'cls_1', name: '3ème A', schoolId: 'school_1', academicYearId: 'year_1' },
    subject: { id: 'sub_1', name: 'Mathématiques' },
    teacher: { id: 'tea_1', name: 'Carline Michel' },
  },
  term: { id: 'term_1', label: '1er Trimestre' },
};

function reqFor(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/teacher/evaluations/eva_1', {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const params = { params: Promise.resolve({ id: 'eva_1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveIncludingTeacher.mockResolvedValue(memberSchool);
  mockResolveMyTeacherProfile.mockResolvedValue({
    teacherId: 'tea_1',
    classSubjectIds: ['cs_1'],
    homeroomClassIds: [],
  });
  prismaMock.evaluation.findUnique.mockResolvedValue(ownedEvaluation as never);
  prismaMock.grade.findFirst.mockResolvedValue(null);
  prismaMock.evaluation.update.mockResolvedValue({
    ...ownedEvaluation,
    status: 'PUBLISHED',
  } as never);
  prismaMock.evaluation.delete.mockResolvedValue(ownedEvaluation as never);
});

describe('/api/teacher/evaluations/[id]', () => {
  it('401s an unauthenticated caller', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    expect((await GET(reqFor('GET'), params)).status).toBe(401);
  });

  it('404s a non-teacher account', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    expect((await GET(reqFor('GET'), params)).status).toBe(404);
  });

  it("404s another teacher's evaluation on all three verbs", async () => {
    prismaMock.evaluation.findUnique.mockResolvedValue({
      ...ownedEvaluation,
      classSubject: { ...ownedEvaluation.classSubject, teacherId: 'tea_OTHER' },
    } as never);
    expect((await GET(reqFor('GET'), params)).status).toBe(404);
    expect((await PATCH(reqFor('PATCH', { label: 'X' }), params)).status).toBe(404);
    expect((await DELETE(reqFor('DELETE'), params)).status).toBe(404);
    expect(prismaMock.evaluation.update).not.toHaveBeenCalled();
    expect(prismaMock.evaluation.delete).not.toHaveBeenCalled();
  });

  it('GET returns the evaluation with class, subject and term meta', async () => {
    const res = await GET(reqFor('GET'), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.evaluation).toMatchObject({
      id: 'eva_1',
      classSubjectId: 'cs_1',
      termId: 'term_1',
      classSubject: {
        class: { id: 'cls_1', name: '3ème A' },
        subject: { id: 'sub_1', name: 'Mathématiques' },
      },
      term: { id: 'term_1', label: '1er Trimestre' },
    });
  });

  it('PATCH publishes an evaluation', async () => {
    const res = await PATCH(reqFor('PATCH', { status: 'PUBLISHED' }), params);
    expect(res.status).toBe(200);
    expect(prismaMock.evaluation.update).toHaveBeenCalledWith({
      where: { id: 'eva_1' },
      data: { status: 'PUBLISHED' },
    });
  });

  it('PATCH refuses to move the evaluation to a classSubject that is not mine', async () => {
    const res = await PATCH(reqFor('PATCH', { classSubjectId: 'cs_OTHER' }), params);
    expect(res.status).toBe(404);
    expect(prismaMock.evaluation.update).not.toHaveBeenCalled();
  });

  it('PATCH refuses to lower maxScore below an existing grade', async () => {
    prismaMock.grade.findFirst.mockResolvedValue({ id: 'gr_1', score: 18 } as never);
    const res = await PATCH(reqFor('PATCH', { maxScore: 10 }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(prismaMock.evaluation.update).not.toHaveBeenCalled();
  });

  it('PATCH validates a termId change against the class year', async () => {
    prismaMock.term.findUnique.mockResolvedValue({
      id: 'term_X',
      academicYearId: 'year_OTHER',
    } as never);
    const res = await PATCH(reqFor('PATCH', { termId: 'term_X' }), params);
    expect(res.status).toBe(400);
    expect(prismaMock.evaluation.update).not.toHaveBeenCalled();
  });

  it('DELETE removes my evaluation and returns 204', async () => {
    const res = await DELETE(reqFor('DELETE'), params);
    expect(res.status).toBe(204);
    expect(prismaMock.evaluation.delete).toHaveBeenCalledWith({ where: { id: 'eva_1' } });
  });
});
```

- [ ] **Step 2: Run to confirm failure** — `pnpm --filter frontend exec vitest run "src/app/api/teacher/evaluations/[id]/route.test.ts"` → FAIL.

- [ ] **Step 3: Implement the route**

Create `route.ts`:

```ts
// GET/PATCH/DELETE /api/teacher/evaluations/[id] — one of MY evaluations.
// Ownership = evaluation.classSubject.teacherId === my teacherId, re-read
// per request (404 anti-leak otherwise). PATCH mirrors the school route's
// contract (config edits + DRAFT/PUBLISHED flips + the lowered-maxScore
// guard); a classSubjectId change must stay inside my own affectations and
// a termId change must belong to the target class's academic year. DELETE
// cascades grades, same as the school route. See
// docs/superpowers/specs/2026-08-31-espace-enseignant-phase3-saisie-design.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import {
  resolveMySchoolIncludingTeacher,
  resolveMyTeacherProfile,
  type MyTeacherProfile,
} from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function notFound(requestId: string): NextResponse {
  return NextResponse.json(
    { error: 'NOT_FOUND', message: 'Not found' },
    { status: 404, headers: { 'x-request-id': requestId } },
  );
}

async function resolveCaller(sub: string): Promise<MyTeacherProfile | null> {
  const mySchool = await resolveMySchoolIncludingTeacher(sub);
  if (!mySchool) return null;
  return resolveMyTeacherProfile(sub, mySchool.schoolId);
}

async function findMyEvaluation(id: string, teacherId: string) {
  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    include: {
      classSubject: {
        select: {
          teacherId: true,
          class: { select: { id: true, name: true, schoolId: true, academicYearId: true } },
          subject: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
        },
      },
      term: { select: { id: true, label: true } },
    },
  });
  if (!evaluation || evaluation.classSubject.teacherId !== teacherId) return null;
  return evaluation;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const myTeacher = await resolveCaller(auth.user.sub);
    if (!myTeacher) return notFound(ctx.requestId);

    const { id } = await params;
    const evaluation = await findMyEvaluation(id, myTeacher.teacherId);
    if (!evaluation) return notFound(ctx.requestId);

    return NextResponse.json({ evaluation }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

const UpdateEvaluationBody = z.object({
  classSubjectId: z.string().min(1).optional(),
  termId: z.string().min(1).optional(),
  label: z.string().trim().min(1).max(60).optional(),
  type: z.enum(['DS', 'INTERROGATION', 'EXAMEN', 'AUTRE']).optional(),
  maxScore: z.number().int().min(1).max(1000).optional(),
  coefficient: z.number().int().min(1).max(10).optional(),
  countsTowardAverage: z.boolean().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  date: z.coerce.date().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const myTeacher = await resolveCaller(auth.user.sub);
    if (!myTeacher) return notFound(ctx.requestId);

    const { id } = await params;
    const existing = await findMyEvaluation(id, myTeacher.teacherId);
    if (!existing) return notFound(ctx.requestId);

    const parsed = UpdateEvaluationBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Moving the evaluation stays inside my own affectations.
    let targetYearId = existing.classSubject.class.academicYearId;
    if (parsed.data.classSubjectId && parsed.data.classSubjectId !== existing.classSubjectId) {
      if (!myTeacher.classSubjectIds.includes(parsed.data.classSubjectId)) {
        return notFound(ctx.requestId);
      }
      const target = await prisma.classSubject.findUnique({
        where: { id: parsed.data.classSubjectId },
        select: { class: { select: { academicYearId: true } } },
      });
      if (!target) return notFound(ctx.requestId);
      targetYearId = target.class.academicYearId;
    }
    if (parsed.data.termId) {
      const term = await prisma.term.findUnique({
        where: { id: parsed.data.termId },
        select: { id: true, academicYearId: true },
      });
      if (!term || term.academicYearId !== targetYearId) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Invalid termId' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    // Same guard as the school route: lowering maxScore under an existing
    // score would corrupt every normalized average computed from it.
    if (parsed.data.maxScore != null) {
      const overMax = await prisma.grade.findFirst({
        where: { evaluationId: id, score: { gt: parsed.data.maxScore } },
      });
      if (overMax) {
        return NextResponse.json(
          {
            error: 'VALIDATION_FAILED',
            message: 'Existing grades exceed the new max score — update those grades first',
          },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const data = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
    const evaluation = await prisma.evaluation.update({ where: { id }, data });

    return NextResponse.json({ evaluation }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const myTeacher = await resolveCaller(auth.user.sub);
    if (!myTeacher) return notFound(ctx.requestId);

    const { id } = await params;
    const existing = await findMyEvaluation(id, myTeacher.teacherId);
    if (!existing) return notFound(ctx.requestId);

    await prisma.evaluation.delete({ where: { id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
```

Note for the implementer: the server error message on the maxScore guard contains an em dash — that is the school route's exact existing message, mirrored verbatim (API messages are not part of the UI-copy rule; the frontend switches on `.error`, not `.message`).

- [ ] **Step 4: Run to confirm pass** — 9 tests PASS.

- [ ] **Step 5: Gate + commit**

```bash
git add "frontend/src/app/api/teacher/evaluations/[id]/route.ts" "frontend/src/app/api/teacher/evaluations/[id]/route.test.ts"
git commit --only "frontend/src/app/api/teacher/evaluations/[id]/route.ts" --only "frontend/src/app/api/teacher/evaluations/[id]/route.test.ts" -m "feat(teacher): read, edit, publish and delete my own evaluations"
```

---

### Task 4: PUT /api/teacher/evaluations/[id]/grades

**Files:**
- Create: `frontend/src/app/api/teacher/evaluations/[id]/grades/route.ts`
- Test: `frontend/src/app/api/teacher/evaluations/[id]/grades/route.test.ts`

**Interfaces:**
- Produces: same contract as the school grades route: body `{ grades: [{ studentId, score: number|null, absent?, comment? }] }` (1-200), 403 `GRADE_ENTRY_DISABLED` when the term's grade entry is off, 400 on over-max scores or non-enrolled students, 200 `{ grades }`.

- [ ] **Step 1: Write the failing tests**

Create `route.test.ts`:

```ts
// PUT /api/teacher/evaluations/[id]/grades — bulk grade upsert for one of
// my own evaluations, mirroring the school route's guards. prismaMock first.
import { prismaMock } from '@/test-utils/prisma-mock';
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

import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { PUT } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveIncludingTeacher = vi.mocked(resolveMySchoolIncludingTeacher);
const mockResolveMyTeacherProfile = vi.mocked(resolveMyTeacherProfile);

const authUser = { user: { sub: 'user_1', email: 'teacher@test.local' } };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };

const ownedEvaluation = {
  id: 'eva_1',
  maxScore: 20,
  classSubject: {
    teacherId: 'tea_1',
    classId: 'cls_1',
    class: { schoolId: 'school_1' },
  },
  term: { gradeEntryEnabled: true },
};

function call(body: unknown) {
  return PUT(
    new NextRequest('http://localhost/api/teacher/evaluations/eva_1/grades', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'eva_1' }) },
  );
}

const validBody = { grades: [{ studentId: 'stu_1', score: 15, absent: false, comment: null }] };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveIncludingTeacher.mockResolvedValue(memberSchool);
  mockResolveMyTeacherProfile.mockResolvedValue({
    teacherId: 'tea_1',
    classSubjectIds: ['cs_1'],
    homeroomClassIds: [],
  });
  prismaMock.evaluation.findUnique.mockResolvedValue(ownedEvaluation as never);
  prismaMock.enrollment.count.mockResolvedValue(1);
  prismaMock.$transaction.mockResolvedValue([] as never);
  prismaMock.grade.findMany.mockResolvedValue([
    { id: 'gr_1', evaluationId: 'eva_1', studentId: 'stu_1', score: 15, absent: false },
  ] as never);
});

describe('PUT /api/teacher/evaluations/[id]/grades', () => {
  it('401s an unauthenticated caller', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    expect((await call(validBody)).status).toBe(401);
  });

  it('404s a non-teacher account', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    expect((await call(validBody)).status).toBe(404);
  });

  it("404s another teacher's evaluation", async () => {
    prismaMock.evaluation.findUnique.mockResolvedValue({
      ...ownedEvaluation,
      classSubject: { ...ownedEvaluation.classSubject, teacherId: 'tea_OTHER' },
    } as never);
    expect((await call(validBody)).status).toBe(404);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('403s with GRADE_ENTRY_DISABLED when the term lock is on', async () => {
    prismaMock.evaluation.findUnique.mockResolvedValue({
      ...ownedEvaluation,
      term: { gradeEntryEnabled: false },
    } as never);
    const res = await call(validBody);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('GRADE_ENTRY_DISABLED');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('400s a score above the evaluation maxScore', async () => {
    const res = await call({ grades: [{ studentId: 'stu_1', score: 25, absent: false }] });
    expect(res.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('400s a student who is not enrolled in the class', async () => {
    prismaMock.enrollment.count.mockResolvedValue(0);
    const res = await call(validBody);
    expect(res.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    const where = prismaMock.enrollment.count.mock.calls[0]?.[0]?.where;
    expect(where).toEqual({ classId: 'cls_1', studentId: { in: ['stu_1'] } });
  });

  it('upserts the batch in a transaction and returns the fresh grades', async () => {
    const res = await call(validBody);
    expect(res.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.grades).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to confirm failure.**

- [ ] **Step 3: Implement the route**

Create `route.ts`:

```ts
// PUT /api/teacher/evaluations/[id]/grades — bulk upsert grades for one of
// MY evaluations. Same contract and guards as the school route (over-max
// batch rejection, enrolled-students check, per-term grade-entry lock with
// the same stable GRADE_ENTRY_DISABLED code so the frontend handles both
// surfaces identically); only the authorization differs: ownership is the
// evaluation's classSubject.teacherId. `score: null` clears a grade;
// Grade.absent stays a real state distinct from not-yet-graded. See
// docs/superpowers/specs/2026-08-31-espace-enseignant-phase3-saisie-design.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const BulkGradesBody = z.object({
  grades: z
    .array(
      z.object({
        studentId: z.string().min(1),
        score: z.number().min(0).max(1000).nullable(),
        absent: z.boolean().optional(),
        comment: z.string().trim().max(300).nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});

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

    const mySchool = await resolveMySchoolIncludingTeacher(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const myTeacher = await resolveMyTeacherProfile(auth.user.sub, mySchool.schoolId);
    if (!myTeacher) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const evaluation = await prisma.evaluation.findUnique({
      where: { id },
      include: {
        classSubject: { select: { teacherId: true, classId: true, class: { select: { schoolId: true } } } },
        term: { select: { gradeEntryEnabled: true } },
      },
    });
    if (
      !evaluation ||
      evaluation.classSubject.teacherId !== myTeacher.teacherId ||
      evaluation.classSubject.class.schoolId !== mySchool.schoolId
    ) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!evaluation.term.gradeEntryEnabled) {
      return NextResponse.json(
        {
          error: 'GRADE_ENTRY_DISABLED',
          message: 'La saisie des notes est désactivée pour cette période.',
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = BulkGradesBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const scoreTooHigh = parsed.data.grades.some(
      (g) => !g.absent && g.score != null && g.score > evaluation.maxScore,
    );
    if (scoreTooHigh) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: `Score exceeds this evaluation's max score (${evaluation.maxScore})`,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const studentIds = parsed.data.grades.map((g) => g.studentId);
    const enrolledCount = await prisma.enrollment.count({
      where: { classId: evaluation.classSubject.classId, studentId: { in: studentIds } },
    });
    if (enrolledCount !== new Set(studentIds).size) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'One or more students are not enrolled in this class',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.$transaction(
      parsed.data.grades.map((g) =>
        prisma.grade.upsert({
          where: { evaluationId_studentId: { evaluationId: id, studentId: g.studentId } },
          create: {
            evaluationId: id,
            studentId: g.studentId,
            score: g.absent ? null : g.score,
            absent: g.absent ?? false,
            comment: g.comment ?? null,
          },
          update: {
            score: g.absent ? null : g.score,
            absent: g.absent ?? false,
            ...(g.comment !== undefined ? { comment: g.comment } : {}),
          },
        }),
      ),
    );

    const grades = await prisma.grade.findMany({ where: { evaluationId: id } });
    return NextResponse.json({ grades }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 4: Run to confirm pass** — 7 tests PASS.

- [ ] **Step 5: Gate + commit**

```bash
git add "frontend/src/app/api/teacher/evaluations/[id]/grades/route.ts" "frontend/src/app/api/teacher/evaluations/[id]/grades/route.test.ts"
git commit --only "frontend/src/app/api/teacher/evaluations/[id]/grades/route.ts" --only "frontend/src/app/api/teacher/evaluations/[id]/grades/route.test.ts" -m "feat(teacher): bulk grade entry for my own evaluations"
```

---

### Task 5: GET /api/teacher/class-subjects/[id]/notebook

**Files:**
- Create: `frontend/src/app/api/teacher/class-subjects/[id]/notebook/route.ts`
- Test: `frontend/src/app/api/teacher/class-subjects/[id]/notebook/route.test.ts`

**Interfaces:**
- Produces: byte-identical response shape to the school notebook route (`NotebookData`: shell + evaluations + students with grades/average/rank + aggregates). Consumed by Task 7's list page and Task 8's saisie page.

- [ ] **Step 1: Write the failing tests**

Create `route.test.ts`:

```ts
// GET /api/teacher/class-subjects/[id]/notebook — the school notebook
// aggregate, restricted to MY OWN class-subject. Averages and ranks come
// from the real grades helpers (not mocked). prismaMock first.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return {
    ...actual,
    resolveMySchoolIncludingTeacher: vi.fn(),
    resolveMyTeacherProfile: vi.fn(),
  };
});

import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveIncludingTeacher = vi.mocked(resolveMySchoolIncludingTeacher);
const mockResolveMyTeacherProfile = vi.mocked(resolveMyTeacherProfile);

const authUser = { user: { sub: 'user_1', email: 'teacher@test.local' } };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };

function call(id = 'cs_1', qs = '') {
  return GET(new NextRequest(`http://localhost/api/teacher/class-subjects/${id}/notebook${qs}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveIncludingTeacher.mockResolvedValue(memberSchool);
  mockResolveMyTeacherProfile.mockResolvedValue({
    teacherId: 'tea_1',
    classSubjectIds: ['cs_1'],
    homeroomClassIds: [],
  });
  prismaMock.classSubject.findUnique.mockResolvedValue({
    id: 'cs_1',
    classId: 'cls_1',
    coefficient: 4,
    class: { id: 'cls_1', name: '3ème A', schoolId: 'school_1', academicYearId: 'year_1' },
    subject: { id: 'sub_1', name: 'Mathématiques' },
  } as never);
  prismaMock.term.findMany.mockResolvedValue([
    {
      id: 'term_1',
      label: '1er Trimestre',
      order: 1,
      startDate: new Date('2025-09-01T00:00:00.000Z'),
      endDate: new Date('2025-12-20T00:00:00.000Z'),
    },
  ] as never);
  prismaMock.evaluation.findMany.mockResolvedValue([
    {
      id: 'eva_1',
      label: 'DS 1',
      type: 'DS',
      maxScore: 20,
      coefficient: 1,
      countsTowardAverage: true,
      status: 'PUBLISHED',
      date: null,
      grades: [
        { studentId: 'stu_1', score: 16, absent: false, comment: null },
        { studentId: 'stu_2', score: 10, absent: false, comment: null },
      ],
    },
  ] as never);
  prismaMock.enrollment.findMany.mockResolvedValue([
    {
      studentId: 'stu_1',
      student: { id: 'stu_1', firstName: 'Nadia', lastName: 'Alexis', studentNumber: 'EL-1' },
    },
    {
      studentId: 'stu_2',
      student: { id: 'stu_2', firstName: 'Jean', lastName: 'Baptiste', studentNumber: 'EL-2' },
    },
  ] as never);
});

describe('GET /api/teacher/class-subjects/[id]/notebook', () => {
  it('401s an unauthenticated caller', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    expect((await call()).status).toBe(401);
  });

  it('404s a non-teacher account', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it('404s a classSubject that is not mine, without touching the DB', async () => {
    expect((await call('cs_OTHER')).status).toBe(404);
    expect(prismaMock.classSubject.findUnique).not.toHaveBeenCalled();
  });

  it('returns the notebook with real averages and ranks', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      classSubjectId: 'cs_1',
      className: '3ème A',
      subjectName: 'Mathématiques',
      subjectCoefficient: 4,
      resolvedTermId: 'term_1',
      classAverage: 13,
      bestScore: 16,
      worstScore: 10,
      gradedCount: 2,
      totalCount: 2,
    });
    expect(body.terms).toEqual([{ id: 'term_1', label: '1er Trimestre', order: 1 }]);
    expect(body.students[0]).toMatchObject({
      studentId: 'stu_1',
      average: 16,
      rank: 1,
      grades: [{ evaluationId: 'eva_1', score: 16, absent: false, comment: null }],
    });
    expect(body.students[1]).toMatchObject({ studentId: 'stu_2', average: 10, rank: 2 });
    const enrollWhere = prismaMock.enrollment.findMany.mock.calls[0]?.[0]?.where;
    expect(enrollWhere).toEqual({ classId: 'cls_1', academicYearId: 'year_1' });
  });

  it('returns the empty shell when the requested termId is not in the class year', async () => {
    const res = await call('cs_1', '?termId=term_OTHER');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resolvedTermId).toBeNull();
    expect(body.evaluations).toEqual([]);
    expect(body.students).toEqual([]);
    expect(prismaMock.evaluation.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm failure.**

- [ ] **Step 3: Implement the route**

Create `route.ts` — the school notebook route with the teacher preamble; everything from the terms fetch down is copied verbatim from `frontend/src/app/api/school/class-subjects/[id]/notebook/route.ts` (open it side by side):

```ts
// GET /api/teacher/class-subjects/[id]/notebook?termId= — the school Grade
// Notebook read model (evaluations + per-student scores + weighted average
// + rank + class aggregates), restricted to a class-subject the caller
// actually teaches (404 anti-leak otherwise, checked before any lookup).
// Same response shape as the school route so the gradebook's pure
// components (ParEvaluationTab, StatistiquesTab) consume either source.
// A termId outside the class's year resolves to the empty shell, exactly
// like the school route (the class-subject itself is already mine, so
// nothing leaks). See
// docs/superpowers/specs/2026-08-31-espace-enseignant-phase3-saisie-design.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { competitionRank, resolveCurrentTerm, subjectAverageFor } from '@/lib/server/grades';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchoolIncludingTeacher(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const myTeacher = await resolveMyTeacherProfile(auth.user.sub, mySchool.schoolId);
    if (!myTeacher) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id: classSubjectId } = await params;
    if (!myTeacher.classSubjectIds.includes(classSubjectId)) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const classSubject = await prisma.classSubject.findUnique({
      where: { id: classSubjectId },
      include: {
        class: { select: { id: true, name: true, schoolId: true, academicYearId: true } },
        subject: true,
      },
    });
    if (!classSubject || classSubject.class.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const terms = await prisma.term.findMany({
      where: { academicYear: { id: classSubject.class.academicYearId } },
      orderBy: { order: 'asc' },
    });
    const termIdParam = req.nextUrl.searchParams.get('termId');
    const term = termIdParam
      ? (terms.find((t) => t.id === termIdParam) ?? null)
      : resolveCurrentTerm(terms);

    const shell = {
      classSubjectId,
      className: classSubject.class.name,
      subjectName: classSubject.subject.name,
      subjectCoefficient: classSubject.coefficient,
      terms: terms.map((t) => ({ id: t.id, label: t.label, order: t.order })),
      resolvedTermId: term?.id ?? null,
    };

    if (!term) {
      return NextResponse.json(
        {
          ...shell,
          evaluations: [],
          students: [],
          classAverage: null,
          bestScore: null,
          worstScore: null,
          absentCount: 0,
          gradedCount: 0,
          totalCount: 0,
        },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [evaluations, enrollments] = await Promise.all([
      prisma.evaluation.findMany({
        where: { classSubjectId, termId: term.id },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        include: { grades: true },
      }),
      prisma.enrollment.findMany({
        where: { classId: classSubject.classId, academicYearId: classSubject.class.academicYearId },
        include: {
          student: { select: { id: true, firstName: true, lastName: true, studentNumber: true } },
        },
        orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
      }),
    ]);

    const students = enrollments.map((en) => ({
      studentId: en.studentId,
      firstName: en.student.firstName,
      lastName: en.student.lastName,
      studentNumber: en.student.studentNumber,
      grades: evaluations.map((e) => {
        const g = e.grades.find((gr) => gr.studentId === en.studentId);
        return {
          evaluationId: e.id,
          score: g?.score ?? null,
          absent: g?.absent ?? false,
          comment: g?.comment ?? null,
        };
      }),
      average: subjectAverageFor(evaluations, en.studentId),
    }));

    const ranked = [...students]
      .filter((s) => s.average != null)
      .sort((a, b) => b.average! - a.average!);
    const ranks = competitionRank(ranked, (s) => s.average!);
    const rankByStudent = new Map(ranked.map((s, i) => [s.studentId, ranks[i]!]));
    const studentsWithRank = students.map((s) => ({
      ...s,
      rank: rankByStudent.get(s.studentId) ?? null,
    }));

    const averages = ranked.map((s) => s.average!);
    const classAverage = averages.length
      ? Math.round((averages.reduce((a, b) => a + b, 0) / averages.length) * 10) / 10
      : null;
    const absentCount = students.filter((s) => s.grades.some((g) => g.absent)).length;
    const gradedCount = students.filter((s) => s.average != null).length;

    return NextResponse.json(
      {
        ...shell,
        evaluations: evaluations.map((e) => ({
          id: e.id,
          label: e.label,
          type: e.type,
          maxScore: e.maxScore,
          coefficient: e.coefficient,
          countsTowardAverage: e.countsTowardAverage,
          status: e.status,
          date: e.date,
        })),
        students: studentsWithRank,
        classAverage,
        bestScore: averages.length ? Math.max(...averages) : null,
        worstScore: averages.length ? Math.min(...averages) : null,
        absentCount,
        gradedCount,
        totalCount: students.length,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run to confirm pass** — 5 tests PASS.

- [ ] **Step 5: Gate + commit**

```bash
git add "frontend/src/app/api/teacher/class-subjects/[id]/notebook/route.ts" "frontend/src/app/api/teacher/class-subjects/[id]/notebook/route.test.ts"
git commit --only "frontend/src/app/api/teacher/class-subjects/[id]/notebook/route.ts" --only "frontend/src/app/api/teacher/class-subjects/[id]/notebook/route.test.ts" -m "feat(teacher): notebook aggregate for my own class-subjects"
```

---

### Task 6: i18n — teacherGradebook namespace, nav keys, registry, saisie-link prop

**Files:**
- Create: `frontend/src/messages/{fr,ht,en}/teacherGradebook.json`
- Modify: `frontend/src/messages/{fr,ht,en}/teacherPortal.json` (3 nav keys each)
- Modify: `frontend/src/lib/locales.ts`, `frontend/src/i18n/request.ts`, `frontend/src/types/next-intl.d.ts`
- Modify: `CLAUDE.md` (count 33 → 34)
- Modify: `frontend/src/app/(school)/pedagogie/carnet-de-notes/ParEvaluationTab.tsx` (optional `saisieHrefBase` prop)

**Interfaces:**
- Produces: namespace `TeacherGradebook` (`title`, `subtitle`, `classSubjectLabel`, `empty`, `loadError`); `TeacherPortal.nav.{gradebook,gradebookShort,pedagogySectionLabel}`; `ParEvaluationTab` accepts `saisieHrefBase?: string` (default `/pedagogie/carnet-de-notes` — admin call site unchanged).

- [ ] **Step 1: Create the three message files**

`fr/teacherGradebook.json`:

```json
{
  "title": "Carnet de notes",
  "subtitle": "Saisie et publication des notes de vos matières.",
  "classSubjectLabel": "Classe et matière",
  "empty": "Aucune matière ne vous est encore assignée.",
  "loadError": "Impossible de charger le carnet de notes pour le moment."
}
```

`en/teacherGradebook.json`:

```json
{
  "title": "Grade book",
  "subtitle": "Enter and publish grades for your subjects.",
  "classSubjectLabel": "Class and subject",
  "empty": "No subjects are assigned to you yet.",
  "loadError": "Unable to load the grade book right now."
}
```

`ht/teacherGradebook.json`:

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "title": "Kanè nòt",
  "subtitle": "Antre epi pibliye nòt pou matyè ou yo.",
  "classSubjectLabel": "Klas ak matyè",
  "empty": "Poko gen matyè ki asiyen pou ou.",
  "loadError": "Nou pa ka chaje kanè nòt la pou kounye a."
}
```

- [ ] **Step 2: Add the three nav keys to teacherPortal.json (all three locales)**

fr, inside `"nav"` after `"studentsShort"`:

```json
    "gradebook": "Carnet de notes",
    "gradebookShort": "Notes",
    "pedagogySectionLabel": "Pédagogie",
```

en:

```json
    "gradebook": "Grade book",
    "gradebookShort": "Grades",
    "pedagogySectionLabel": "Teaching",
```

ht:

```json
    "gradebook": "Kanè nòt",
    "gradebookShort": "Nòt",
    "pedagogySectionLabel": "Pedagoji",
```

- [ ] **Step 3: Register the namespace**

Same three-file drill as Plan 1's Task 4, entry `teacherGradebook` / `TeacherGradebook` added after the `teacherStudents` lines in each of `frontend/src/lib/locales.ts` (`MESSAGE_NAMESPACES`), `frontend/src/i18n/request.ts` (destructuring array + `Promise.all` import + `messages` map, same relative position in all three), `frontend/src/types/next-intl.d.ts` (type import + `Messages` entry).

- [ ] **Step 4: CLAUDE.md count**

Change `across 33 message namespaces` to `across 34 message namespaces` (single occurrence).

- [ ] **Step 5: ParEvaluationTab saisie-link prop**

In `frontend/src/app/(school)/pedagogie/carnet-de-notes/ParEvaluationTab.tsx`, change the component signature:

```ts
export function ParEvaluationTab({
  unified,
  saisieHrefBase = '/pedagogie/carnet-de-notes',
}: {
  unified: UnifiedNotebookData;
  /** Base path for the per-evaluation grade-entry link — the teacher portal passes its own. */
  saisieHrefBase?: string;
}) {
```

and the link href from `` `/pedagogie/carnet-de-notes/${r.key}/saisie` `` to `` `${saisieHrefBase}/${r.key}/saisie` ``. Nothing else in the file changes; the admin page keeps calling `<ParEvaluationTab unified={unified} />`.

- [ ] **Step 6: Verify + gate + commit**

Run: `pnpm --filter frontend exec vitest run src/lib/locales.test.ts` → PASS (34 namespaces; suite grows by 6 parametric cases).
Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add frontend/src/messages/fr/teacherGradebook.json frontend/src/messages/ht/teacherGradebook.json frontend/src/messages/en/teacherGradebook.json frontend/src/messages/fr/teacherPortal.json frontend/src/messages/ht/teacherPortal.json frontend/src/messages/en/teacherPortal.json frontend/src/lib/locales.ts frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts CLAUDE.md "frontend/src/app/(school)/pedagogie/carnet-de-notes/ParEvaluationTab.tsx"
git commit --only frontend/src/messages/fr/teacherGradebook.json --only frontend/src/messages/ht/teacherGradebook.json --only frontend/src/messages/en/teacherGradebook.json --only frontend/src/messages/fr/teacherPortal.json --only frontend/src/messages/ht/teacherPortal.json --only frontend/src/messages/en/teacherPortal.json --only frontend/src/lib/locales.ts --only frontend/src/i18n/request.ts --only frontend/src/types/next-intl.d.ts --only CLAUDE.md --only "frontend/src/app/(school)/pedagogie/carnet-de-notes/ParEvaluationTab.tsx" -m "feat(i18n): teacherGradebook namespace, gradebook nav keys, parametrized saisie link"
```

---

### Task 7: Teacher gradebook list page + creation modal

**Files:**
- Create: `frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/TeacherNewEvaluationModal.tsx`
- Create: `frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/page.tsx`

**Interfaces:**
- Consumes: `GET /api/teacher/me` (classSubjects + terms + currentTermId), `GET /api/teacher/class-subjects/[id]/notebook`, `POST /api/teacher/evaluations`; school gradebook pure components `ParEvaluationTab` (with `saisieHrefBase`), `StatistiquesTab`, `EvaluationConfigForm` and types from `@/app/(school)/pedagogie/carnet-de-notes/*`; namespaces `TeacherGradebook`, `Gradebook.page` (summary/tab/filter labels — recorded borrowing), `Gradebook.newEvaluationModal`.
- Produces: links to `/espace-enseignant/carnet-de-notes/[evaluationId]/saisie` (Task 8).

- [ ] **Step 1: Create the modal**

`TeacherNewEvaluationModal.tsx` — the school `NewEvaluationModal` retargeted at the teacher endpoint (the form component itself is reused):

```tsx
'use client';

// Teacher twin of the school NewEvaluationModal: same reused
// EvaluationConfigForm, same Gradebook.newEvaluationModal strings, but the
// create goes to POST /api/teacher/evaluations (teacher-scoped).
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EvaluationConfigForm } from '@/app/(school)/pedagogie/carnet-de-notes/EvaluationConfigForm';
import type {
  ClassSubjectOption,
  EvaluationConfig,
  TermOption,
} from '@/app/(school)/pedagogie/carnet-de-notes/types';

export function TeacherNewEvaluationModal({
  classSubjects,
  terms,
  defaultClassSubjectId,
  defaultTermId,
  onClose,
  onCreated,
}: {
  classSubjects: ClassSubjectOption[];
  terms: TermOption[];
  defaultClassSubjectId: string;
  defaultTermId: string;
  onClose: () => void;
  onCreated: (evaluationId: string) => void;
}) {
  const t = useTranslations('Gradebook.newEvaluationModal');
  const tCommon = useTranslations('Common');
  const { toast } = useToast();
  const [value, setValue] = useState<EvaluationConfig>({
    classSubjectId: defaultClassSubjectId,
    termId: defaultTermId,
    label: '',
    type: 'DS',
    maxScore: 20,
    coefficient: 1,
    countsTowardAverage: true,
    notes: null,
    date: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (!value.label.trim() || !value.classSubjectId || !value.termId) {
      setError(t('validationError'));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<{ evaluation: { id: string } }>('/api/teacher/evaluations', {
        method: 'POST',
        body: value,
      });
      toast(t('createdToast'), 'success');
      onCreated(res.evaluation.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t('title')} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <EvaluationConfigForm
          value={value}
          onChange={setValue}
          classSubjects={classSubjects}
          terms={terms}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <Button onClick={onSubmit} loading={submitting}>
          {submitting ? t('submitting') : t('submitLabel')}
        </Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Create the page**

`page.tsx`:

```tsx
'use client';

// Carnet de notes enseignant — the school gradebook's Par évaluation and
// Statistiques views over MY class-subjects only. The heavy lifting is
// reused verbatim from the school module (ParEvaluationTab, StatistiquesTab,
// EvaluationConfigForm are pure, props-driven components); this page only
// swaps the data source for /api/teacher/* and drops the admin-only Vue
// tableau (the per-student entry grid lives on the saisie screen). The
// spec's tab set for this screen is Par évaluation + Statistiques
// (2026-08-31-espace-enseignant-phase3-saisie-design.md).
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart2,
  Calendar,
  ListChecks,
  NotebookPen,
  PieChart,
  Plus,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { LIST_PAGE } from '@/lib/layout';
import { LOCALE_BCP47 } from '@/lib/locales';
import { ParEvaluationTab } from '@/app/(school)/pedagogie/carnet-de-notes/ParEvaluationTab';
import { StatistiquesTab } from '@/app/(school)/pedagogie/carnet-de-notes/StatistiquesTab';
import type {
  ClassSubjectOption,
  NotebookData,
  TermOption,
  UnifiedNotebookData,
} from '@/app/(school)/pedagogie/carnet-de-notes/types';
import { TeacherNewEvaluationModal } from './TeacherNewEvaluationModal';

interface TeacherMeResponse {
  classSubjects: {
    id: string;
    classId: string;
    className: string;
    classLevel: string;
    subjectId: string;
    subjectName: string;
  }[];
  terms: TermOption[];
  currentTermId: string | null;
}

function toUnifiedSingle(d: NotebookData): UnifiedNotebookData {
  return {
    combined: false,
    className: d.className,
    terms: d.terms,
    resolvedTermId: d.resolvedTermId,
    subjects: [
      { classSubjectId: d.classSubjectId, subjectName: d.subjectName, evaluations: d.evaluations },
    ],
    students: d.students.map((s) => ({
      studentId: s.studentId,
      firstName: s.firstName,
      lastName: s.lastName,
      studentNumber: s.studentNumber,
      bySubject: {
        [d.classSubjectId]: {
          classSubjectId: d.classSubjectId,
          grades: s.grades,
          average: s.average,
        },
      },
      generalAverage: s.average,
      rank: s.rank,
    })),
    classAverage: d.classAverage,
    bestScore: d.bestScore,
    worstScore: d.worstScore,
    gradedCount: d.gradedCount,
    totalCount: d.totalCount,
  };
}

export default function TeacherGradebookPage() {
  const t = useTranslations('TeacherGradebook');
  const tPage = useTranslations('Gradebook.page');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const router = useRouter();
  const [classSubjectId, setClassSubjectId] = useState('');
  const [termId, setTermId] = useState('');
  const [view, setView] = useState<'byEval' | 'stats'>('byEval');
  const [showNew, setShowNew] = useState(false);

  const { data: me, error: meErr } = useApi<TeacherMeResponse>('/api/teacher/me');
  const myClassSubjects = useMemo(() => me?.classSubjects ?? [], [me]);

  useEffect(() => {
    if (!classSubjectId && myClassSubjects.length > 0) {
      setClassSubjectId(myClassSubjects[0]!.id);
    }
  }, [classSubjectId, myClassSubjects]);
  useEffect(() => {
    if (!termId && me?.currentTermId) setTermId(me.currentTermId);
  }, [termId, me]);

  const notebookPath = classSubjectId
    ? `/api/teacher/class-subjects/${classSubjectId}/notebook${termId ? `?termId=${termId}` : ''}`
    : '';
  const { data: rawNotebook, error: notebookErr } = useApi<NotebookData>(notebookPath, {
    skip: !classSubjectId,
  });

  // The notebook response names its own classSubjectId, so a stale response
  // from the previous selection can never render under the new one.
  const unified = useMemo(
    () =>
      rawNotebook && rawNotebook.classSubjectId === classSubjectId
        ? toUnifiedSingle(rawNotebook)
        : null,
    [rawNotebook, classSubjectId],
  );

  const formOptions = useMemo<ClassSubjectOption[]>(
    () =>
      myClassSubjects.map((cs) => ({
        id: cs.id,
        classId: cs.classId,
        subjectId: cs.subjectId,
        class: { id: cs.classId, name: cs.className },
        subject: { id: cs.subjectId, name: cs.subjectName },
        teacher: null,
        coefficient: null,
      })),
    [myClassSubjects],
  );
  const terms = me?.terms ?? [];
  const error = meErr || notebookErr ? t('loadError') : null;

  const fmt = (n: number | null) =>
    n == null ? '·' : n.toLocaleString(bcp47, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div className={`${LIST_PAGE} gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button
          className="w-fit"
          onClick={() => setShowNew(true)}
          disabled={!classSubjectId || !termId}
        >
          <Plus size={14} />
          {tPage('newEvaluation')}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {me && myClassSubjects.length === 0 ? (
        <Card className="items-center gap-2 p-10 text-center">
          <NotebookPen size={28} className="text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">{t('empty')}</p>
        </Card>
      ) : (
        <>
          <Card className="flex-row flex-wrap items-center gap-3 p-3.5">
            <FilterSelect value={classSubjectId} onValueChange={setClassSubjectId}>
              {myClassSubjects.map((cs) => (
                <SelectItem key={cs.id} value={cs.id}>
                  {cs.className} · {cs.subjectName}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={termId} onValueChange={setTermId}>
              {terms.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.label}
                </SelectItem>
              ))}
            </FilterSelect>
          </Card>

          {!unified ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-[74px] w-full" />
                ))}
              </div>
              <Skeleton className="h-56 w-full" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <SummaryCard
                  icon={Users}
                  tone="secondary"
                  label={tPage('gradedStudents')}
                  value={`${unified.gradedCount}`}
                  sub={tPage('outOfStudents', { count: unified.totalCount })}
                />
                <SummaryCard
                  icon={BarChart2}
                  tone="blue"
                  label={tPage('classAverage')}
                  value={fmt(unified.classAverage)}
                  sub={tPage('outOf20')}
                  help={tPage('help.averageComputation')}
                />
                <SummaryCard
                  icon={TrendingUp}
                  tone="success"
                  label={tPage('bestAverage')}
                  value={fmt(unified.bestScore)}
                  sub=""
                />
                <SummaryCard
                  icon={TrendingDown}
                  tone="destructive"
                  label={tPage('insufficientGrade')}
                  value={`${unified.students.filter((s) => s.generalAverage != null && s.generalAverage < 8).length}`}
                  sub={tPage('belowAverage')}
                  help={tPage('help.insufficientThreshold')}
                />
                <SummaryCard
                  icon={Calendar}
                  tone="warning"
                  label={tPage('period')}
                  value={terms.find((term) => term.id === unified.resolvedTermId)?.label ?? '·'}
                  sub=""
                />
              </div>

              <div role="tablist" className="flex w-fit gap-0 border-b-2 border-border">
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'byEval'}
                  onClick={() => setView('byEval')}
                  className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${
                    view === 'byEval'
                      ? 'border-primary text-primary'
                      : 'border-transparent font-medium text-muted-foreground'
                  }`}
                >
                  <ListChecks size={13} />
                  {tPage('tabByEval')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'stats'}
                  onClick={() => setView('stats')}
                  className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-caption font-semibold ${
                    view === 'stats'
                      ? 'border-primary text-primary'
                      : 'border-transparent font-medium text-muted-foreground'
                  }`}
                >
                  <PieChart size={13} />
                  {tPage('tabStats')}
                </button>
              </div>

              {view === 'byEval' ? (
                <ParEvaluationTab
                  unified={unified}
                  saisieHrefBase="/espace-enseignant/carnet-de-notes"
                />
              ) : (
                <StatistiquesTab unified={unified} />
              )}
            </>
          )}
        </>
      )}

      {showNew && classSubjectId && termId && (
        <TeacherNewEvaluationModal
          classSubjects={formOptions}
          terms={terms}
          defaultClassSubjectId={classSubjectId}
          defaultTermId={termId}
          onClose={() => setShowNew(false)}
          onCreated={(evaluationId) =>
            router.push(`/espace-enseignant/carnet-de-notes/${evaluationId}/saisie`)
          }
        />
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  tone: t,
  label,
  value,
  sub,
  help,
}: {
  icon: typeof Users;
  tone: 'secondary' | 'blue' | 'success' | 'destructive' | 'warning';
  label: string;
  value: string;
  sub: string;
  help?: string;
}) {
  const iconBg: Record<string, string> = {
    secondary: 'bg-secondary text-primary',
    blue: 'bg-info text-info-foreground',
    success: 'bg-success text-success-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
    warning: 'bg-warning text-warning-foreground',
  };
  const valueColor: Record<string, string> = {
    secondary: 'text-foreground',
    blue: 'text-info-foreground',
    success: 'text-success-foreground',
    destructive: 'text-destructive-foreground',
    warning: 'text-foreground',
  };
  return (
    <Card className="flex-row items-center gap-3 p-3.5">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${iconBg[t]}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-2xs font-medium text-muted-foreground">
          <span className="truncate">{label}</span>
          {help && <HelpTooltip label={help} />}
        </div>
        <div className={`text-lg font-bold ${valueColor[t]}`}>{value}</div>
        {sub && <div className="truncate text-2xs text-muted-foreground">{sub}</div>}
      </div>
    </Card>
  );
}
```

Before committing, verify the two `Gradebook.page.help.*` keys used (`help.averageComputation`, `help.insufficientThreshold`) exist in `frontend/src/messages/fr/gradebook.json` (they are used by the school page's identical SummaryCards); if a key differs, use the school page's exact key.

- [ ] **Step 3: Gate + commit**

```bash
git add "frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/TeacherNewEvaluationModal.tsx" "frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/page.tsx"
git commit --only "frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/TeacherNewEvaluationModal.tsx" --only "frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/page.tsx" -m "feat(teacher): gradebook screen reusing the school evaluation and stats views"
```

---

### Task 8: Saisie and edit screens (delta clones)

**Files:**
- Create: `frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/[evaluationId]/saisie/page.tsx`
- Create: `frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/[evaluationId]/edit/page.tsx`

**Interfaces:**
- Consumes: `GET /api/teacher/evaluations/[id]`, `GET /api/teacher/class-subjects/[id]/notebook?termId=`, `PUT /api/teacher/evaluations/[id]/grades`, `PATCH/DELETE /api/teacher/evaluations/[id]`, `GET /api/teacher/me` (edit page form options); namespaces `Gradebook.saisie` / `Gradebook.editEvaluation` (recorded borrowing, reused whole).

- [ ] **Step 1: Create the saisie page as a delta clone**

Copy `frontend/src/app/(school)/pedagogie/carnet-de-notes/[evaluationId]/saisie/page.tsx` to `frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/[evaluationId]/saisie/page.tsx`, then apply EXACTLY these edits and no others:

1. Add a header comment under `'use client';`:

```ts
// Saisie enseignant — the school grade-entry screen retargeted at the
// teacher surface: same grid, same Gradebook.saisie strings, but data and
// writes go through /api/teacher/* (ownership enforced server-side) and
// saves are plain api() calls — the offline queue is deliberately not used
// on the teacher portal (spec: online-first).
```

2. Imports: replace the line `import { ApiError } from '@/lib/api';` with `import { api, ApiError } from '@/lib/api';` and DELETE the two lines:

```ts
import { submitOrQueue } from '@/lib/offline-queue';
import { OFFLINE_SYNC } from '@/lib/constants';
```

3. Endpoint swaps (three):
   - `` `/api/school/evaluations/${params.evaluationId}` `` → `` `/api/teacher/evaluations/${params.evaluationId}` ``
   - `` `/api/school/class-subjects/${evaluation.classSubjectId}/notebook?termId=${evaluation.termId}` `` → `` `/api/teacher/class-subjects/${evaluation.classSubjectId}/notebook?termId=${evaluation.termId}` ``

4. Path swaps (every occurrence, five in total): `/pedagogie/carnet-de-notes` → `/espace-enseignant/carnet-de-notes` (the two back links, the edit link `` `/pedagogie/carnet-de-notes/${evaluation.id}/edit` ``, the cancel `router.push`, and the post-publish `router.push`).

5. Replace the whole `save` function body's network section — from `const gradesResult = await submitOrQueue(` down to the closing `}` of the `if (queued) { … } else if (publish) { … } else { … }` block — with:

```ts
      await api(`/api/teacher/evaluations/${evaluation.id}/grades`, {
        method: 'PUT',
        body: { grades },
      });
      if (publish) {
        await api(`/api/teacher/evaluations/${evaluation.id}`, {
          method: 'PATCH',
          body: { status: 'PUBLISHED' },
        });
        toast(t('validatedToast'), 'success');
      } else {
        toast(t('draftSavedToast'), 'success');
      }
```

(The `grades` construction above it and the `if (publish) { router.push(...) }` navigation below it stay unchanged. The `user` guard in the first line of `save` stays; `user.id` is simply no longer referenced.)

6. Everything else — the `RowState` seeding, `previewAverage`, `stats`, `hasInvalidScore`, the entire table and footer JSX, the local `Badge`, all `Gradebook.saisie` strings including the CSV-import stub button — stays byte-identical to the school file.

- [ ] **Step 2: Create the edit page as a delta clone**

Copy `frontend/src/app/(school)/pedagogie/carnet-de-notes/[evaluationId]/edit/page.tsx` to `frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/[evaluationId]/edit/page.tsx`, then apply EXACTLY these edits:

1. Header comment under `'use client';`:

```ts
// Edition enseignant — the school Edit Evaluation screen retargeted at the
// teacher surface. Class-subject options and terms come from
// /api/teacher/me (the school lists are deny-by-default for teachers);
// reads and writes go through /api/teacher/evaluations/[id].
```

2. Import fix: the school file imports the form and types relatively (`../../EvaluationConfigForm`, `../../types`); change both to the absolute school-module paths:

```ts
import { EvaluationConfigForm } from '@/app/(school)/pedagogie/carnet-de-notes/EvaluationConfigForm';
import type {
  ClassSubjectOption,
  EvaluationConfig,
  TermOption,
} from '@/app/(school)/pedagogie/carnet-de-notes/types';
```

3. Endpoint swaps: `` `/api/school/evaluations/${params.evaluationId}` `` → `` `/api/teacher/evaluations/${params.evaluationId}` `` (the GET), and in `onSave`/`onDelete`: `` `/api/school/evaluations/${value.id}` `` → `` `/api/teacher/evaluations/${value.id}` `` (both).

4. Replace the two school list fetches (`/api/school/class-subjects` and `/api/school` blocks, lines with `classSubjectsData` and `schoolData`) with one `/api/teacher/me` fetch and mapped options:

```ts
  const { data: me, error: meErr } = useApi<{
    classSubjects: {
      id: string;
      classId: string;
      className: string;
      subjectId: string;
      subjectName: string;
    }[];
    terms: TermOption[];
  }>('/api/teacher/me', { skip: !user });
  const classSubjects: ClassSubjectOption[] = (me?.classSubjects ?? []).map((cs) => ({
    id: cs.id,
    classId: cs.classId,
    subjectId: cs.subjectId,
    class: { id: cs.classId, name: cs.className },
    subject: { id: cs.subjectId, name: cs.subjectName },
    teacher: null,
    coefficient: null,
  }));
  const terms = me?.terms ?? [];
  const error = loadError ?? (meErr ? t('loadError') : null);
```

(The old `const error = loadError ?? (classSubjectsErr || schoolErr ? t('loadError') : null);` line is replaced by the last line above.)

5. Path swaps (every occurrence, four in total): `/pedagogie/carnet-de-notes` → `/espace-enseignant/carnet-de-notes` (post-save `router.push` to saisie, post-delete `router.push`, the error-state back link, the header back link to saisie).

6. Everything else stays byte-identical (the `Gradebook.editEvaluation` strings, the warning banner, the delete confirm, the save/cancel footer).

- [ ] **Step 3: Gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add "frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/[evaluationId]/saisie/page.tsx" "frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/[evaluationId]/edit/page.tsx"
git commit --only "frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/[evaluationId]/saisie/page.tsx" --only "frontend/src/app/(teacher)/espace-enseignant/carnet-de-notes/[evaluationId]/edit/page.tsx" -m "feat(teacher): grade entry and evaluation edit screens on the teacher surface"
```

---

### Task 9: Navigation, fiche élève links, CLAUDE.md, final gate

**Files:**
- Modify: `frontend/src/components/layout/teacher/TeacherSidebar.tsx` (two sections)
- Modify: `frontend/src/components/layout/teacher/TeacherMobileBottomNav.tsx` (Classes slot → Notes)
- Modify: `frontend/src/app/(teacher)/espace-enseignant/eleves/[id]/page.tsx` (evaluation rows link to saisie)
- Modify: `CLAUDE.md` (teacher-portal paragraph: route inventory + gradebook screens)

- [ ] **Step 1: Sidebar becomes two sections**

In `TeacherSidebar.tsx`, replace the single-section array in `useTeacherSections()` with (add `NotebookPen` to the lucide import; update the stale count comment to say the teacher now sees two sections):

```ts
    () => [
      {
        label: t('sectionLabel'),
        items: [
          { label: t('home'), href: '/espace-enseignant', icon: LayoutDashboard },
          { label: t('classes'), href: '/espace-enseignant/classes', icon: SchoolIcon },
          { label: t('students'), href: '/espace-enseignant/eleves', icon: Users },
          {
            label: t('timetable'),
            href: '/espace-enseignant/emploi-du-temps',
            icon: CalendarDays,
          },
          { label: t('settings'), href: '/espace-enseignant/parametres', icon: Settings },
        ],
      },
      {
        label: t('pedagogySectionLabel'),
        items: [
          {
            label: t('gradebook'),
            href: '/espace-enseignant/carnet-de-notes',
            icon: NotebookPen,
          },
        ],
      },
    ],
```

- [ ] **Step 2: Bottom nav — Notes replaces Classes**

In `TeacherMobileBottomNav.tsx` (per the spec's target bar: Accueil, Élèves, Notes, Emploi du temps; Classes moves to the « Plus » drawer):

```ts
interface BottomNavLink {
  key: 'home' | 'studentsShort' | 'gradebookShort' | 'timetable';
  href: string;
  icon: LucideIcon;
}

const LINK_DEFS: BottomNavLink[] = [
  { key: 'home', href: '/espace-enseignant', icon: LayoutDashboard },
  { key: 'studentsShort', href: '/espace-enseignant/eleves', icon: Users },
  { key: 'gradebookShort', href: '/espace-enseignant/carnet-de-notes', icon: NotebookPen },
  { key: 'timetable', href: '/espace-enseignant/emploi-du-temps', icon: CalendarDays },
];
```

Lucide import: `NotebookPen` in, `School` out.

- [ ] **Step 3: Fiche élève — evaluation rows deep-link to saisie**

In `frontend/src/app/(teacher)/espace-enseignant/eleves/[id]/page.tsx`, the evaluation label cell becomes a link (add `Link` to the imports if not present):

```tsx
                              <td className="px-3.5 py-2.5">
                                <Link
                                  href={`/espace-enseignant/carnet-de-notes/${e.id}/saisie`}
                                  className="font-semibold text-foreground hover:text-primary hover:underline"
                                >
                                  {e.label}
                                </Link>
                              </td>
```

(replacing the previous plain `<td className="px-3.5 py-2.5 font-semibold text-foreground">{e.label}</td>`).

- [ ] **Step 4: CLAUDE.md**

In the "**Espace Enseignant (teacher portal)**" paragraph:
1. Extend the surface parenthetical with the five new routes: after `` `GET /api/teacher/students/[id]` `` add `` , `GET/POST /api/teacher/evaluations` + `GET/PATCH/DELETE /api/teacher/evaluations/[id]` + `PUT /api/teacher/evaluations/[id]/grades` (write surface, ownership = `ClassSubject.teacherId`), `GET /api/teacher/class-subjects/[id]/notebook` ``. (Note: the plan ships POST on the collection route but no collection GET; word the inventory accordingly: `` `POST /api/teacher/evaluations` ``.)
2. After the sentence recording the Mes élèves message-key borrowing, add: `The teacher Carnet de notes (`/espace-enseignant/carnet-de-notes` + saisie/edit subroutes) reuses the school gradebook's pure components (`ParEvaluationTab` via its `saisieHrefBase` prop, `StatistiquesTab`, `EvaluationConfigForm`) and the `Gradebook.*` namespaces wholesale, with only a thin `teacherGradebook` namespace of its own; grade entry respects the same per-term `gradeEntryEnabled` lock and the same `GRADE_ENTRY_DISABLED` code as the school route, and deliberately skips the offline queue.`

- [ ] **Step 5: Final gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

Manual check (running `pnpm dev`, account `carline.michel@lesetoiles.edu.ht` / `TeacherTest2026!`): the Pédagogie section shows Carnet de notes; creating an evaluation lands on the saisie grid; entering scores + Enregistrer brouillon persists; Valider publishes and returns to the list; the published evaluation's average appears on the fiche élève; the fiche's evaluation label links back to the saisie screen. If the dev server belongs to another terminal, use it, do not kill it.

```bash
git add frontend/src/components/layout/teacher/TeacherSidebar.tsx frontend/src/components/layout/teacher/TeacherMobileBottomNav.tsx "frontend/src/app/(teacher)/espace-enseignant/eleves/[id]/page.tsx" CLAUDE.md
git commit --only frontend/src/components/layout/teacher/TeacherSidebar.tsx --only frontend/src/components/layout/teacher/TeacherMobileBottomNav.tsx --only "frontend/src/app/(teacher)/espace-enseignant/eleves/[id]/page.tsx" --only CLAUDE.md -m "feat(teacher): pedagogy nav section, saisie deep links and gradebook docs"
```
