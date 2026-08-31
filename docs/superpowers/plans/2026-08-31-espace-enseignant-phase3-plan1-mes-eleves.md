# Espace Enseignant Phase 3, Plan 1 : Mes élèves — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the teacher portal a school-grade "Mes élèves" screen (search + class/subject/status filters + card grid/table views) and a read-only lightweight student profile, backed by two new scoped `/api/teacher/*` routes and a terms enrichment of `/api/teacher/me`.

**Architecture:** Approach A from the spec — a dedicated `/api/teacher/*` read surface (no `/api/school/*` route is touched). Every route follows `GET /api/teacher/me`'s resolution pattern (`requireAuth` → `resolveMySchoolIncludingTeacher` → `resolveMyTeacherProfile` → 404 anti-leak) and re-verifies class ownership in the database on every request. The UI mirrors `(school)/eleves/page.tsx` component-for-component (SearchInput, FilterSelect, ViewToggle, CardGrid/ListCard, table + Pager) minus every mutation affordance.

**Tech Stack:** Next.js 16 App Router Route Handlers (runtime nodejs), Prisma 5 via `prismaMock` Vitest tests, next-intl (fr/ht/en), Tailwind v4 theme tokens.

**Spec:** `docs/superpowers/specs/2026-08-31-espace-enseignant-phase3-saisie-design.md` (sections « Mes élèves », « Fiche élève allégée », « API », « Garde-fous », « Livraison » Plan 1).

## Global Constraints

- Every new Route Handler exports `export const runtime = 'nodejs'` and wraps its body in `withRequestContext(makeRequestContext(req.headers), …)`.
- Ownership failures answer **404 `NOT_FOUND`** (never 403). Ownership is re-checked in the DB on every request (`classId ∈ my homerooms ∪ my classSubjects' classes`).
- No `/api/school/*` file is modified. No file from CLAUDE.md's protected list is modified.
- User-facing strings: no em dash (—) anywhere; `·` is the separator for label pairings. All three locales (fr/ht/en) ship together; ht carries the standard top-level `_review` string.
- Theme tokens only (`text-foreground`, `bg-card`, …); no hardcoded brand hex.
- TypeScript strict + `exactOptionalPropertyTypes`: conditional spreads for optional props.
- Gate before every commit: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` (baseline 1581 tests, 125 files; grows with each route-test task).
- Shared git index with peer sessions: `git add` explicit paths, commit with `git commit --only <paths>`.

---

### Task 1: Terms + currentTermId on GET /api/teacher/me

**Files:**
- Modify: `frontend/src/app/api/teacher/me/route.ts`
- Test: `frontend/src/app/api/teacher/me/route.test.ts`

**Interfaces:**
- Consumes: `resolveCurrentTerm` from `@/lib/server/grades` (`<T extends { id; order; startDate: Date; endDate: Date }>(terms: T[]) => T | null`).
- Produces: response gains `terms: [{ id, label, order, type, gradeEntryEnabled, startDate, endDate }]` (ISO strings) and `currentTermId: string | null`. Task 7's term selector consumes this.

- [ ] **Step 1: Write the failing tests**

Append to the `describe` block in `frontend/src/app/api/teacher/me/route.test.ts`. First add the term mock to `beforeEach` (after the `timetableSession` mocks):

```ts
  prismaMock.term.findMany.mockResolvedValue([
    {
      id: 'term_1',
      label: '1er Trimestre',
      order: 1,
      type: 'TRIMESTRE',
      gradeEntryEnabled: true,
      startDate: new Date('2025-09-01T00:00:00.000Z'),
      endDate: new Date('2025-12-20T00:00:00.000Z'),
    },
    {
      id: 'term_2',
      label: '2e Trimestre',
      order: 2,
      type: 'TRIMESTRE',
      gradeEntryEnabled: true,
      startDate: new Date('2026-01-05T00:00:00.000Z'),
      endDate: new Date('2026-03-31T00:00:00.000Z'),
    },
  ] as never);
```

Then the two tests:

```ts
  it('returns the active year terms with a resolved currentTermId', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.terms).toEqual([
      {
        id: 'term_1',
        label: '1er Trimestre',
        order: 1,
        type: 'TRIMESTRE',
        gradeEntryEnabled: true,
        startDate: '2025-09-01T00:00:00.000Z',
        endDate: '2025-12-20T00:00:00.000Z',
      },
      {
        id: 'term_2',
        label: '2e Trimestre',
        order: 2,
        type: 'TRIMESTRE',
        gradeEntryEnabled: true,
        startDate: '2026-01-05T00:00:00.000Z',
        endDate: '2026-03-31T00:00:00.000Z',
      },
    ]);
    // Both terms are in the past relative to the test run date (2026+), so
    // resolveCurrentTerm picks the most recently ended one.
    expect(body.currentTermId).toBe('term_2');
    const where = prismaMock.term.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ academicYearId: 'year_1' });
  });

  it('returns empty terms and null currentTermId when no academic year is active', async () => {
    mockResolveYear.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.terms).toEqual([]);
    expect(body.currentTermId).toBeNull();
    expect(prismaMock.term.findMany).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/teacher/me/route.test.ts`
Expected: the two new tests FAIL (`body.terms` undefined); the seven existing ones still pass.

- [ ] **Step 3: Implement**

In `frontend/src/app/api/teacher/me/route.ts`:

Add the import (after the `attendance` import line):

```ts
import { resolveCurrentTerm } from '@/lib/server/grades';
```

After the `thisWeekSessions` block (right before the final `return NextResponse.json(`), insert:

```ts
    let terms: {
      id: string;
      label: string;
      order: number;
      type: string;
      gradeEntryEnabled: boolean;
      startDate: Date;
      endDate: Date;
    }[] = [];
    if (activeYear) {
      terms = await prisma.term.findMany({
        where: { academicYearId: activeYear.id },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          label: true,
          order: true,
          type: true,
          gradeEntryEnabled: true,
          startDate: true,
          endDate: true,
        },
      });
    }
    const currentTerm = resolveCurrentTerm(terms);
```

And extend the response object (after the `academicYear` property):

```ts
        terms: terms.map((t) => ({
          id: t.id,
          label: t.label,
          order: t.order,
          type: t.type,
          gradeEntryEnabled: t.gradeEntryEnabled,
          startDate: t.startDate.toISOString(),
          endDate: t.endDate.toISOString(),
        })),
        currentTermId: currentTerm?.id ?? null,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/teacher/me/route.test.ts`
Expected: all 9 tests PASS.

- [ ] **Step 5: Gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add frontend/src/app/api/teacher/me/route.ts frontend/src/app/api/teacher/me/route.test.ts
git commit --only frontend/src/app/api/teacher/me/route.ts --only frontend/src/app/api/teacher/me/route.test.ts -m "feat(teacher): expose active-year terms and currentTermId on GET /api/teacher/me"
```

---

### Task 2: GET /api/teacher/students

**Files:**
- Create: `frontend/src/app/api/teacher/students/route.ts`
- Test: `frontend/src/app/api/teacher/students/route.test.ts`

**Interfaces:**
- Consumes: `resolveMySchoolIncludingTeacher`, `resolveMyTeacherProfile` from `@/lib/server/school`.
- Produces: `{ students: [{ id, firstName, lastName, studentNumber, photoUrl, status, classId, className, classLevel }] }`, ordered lastName then firstName. Task 6 consumes it.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/teacher/students/route.test.ts`:

```ts
// GET /api/teacher/students — every student enrolled (active year) in a
// class this teacher teaches or homerooms. prismaMock first (auto-hoists
// vi.mock for '@/lib/server/prisma').
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

function req() {
  return new NextRequest('http://localhost/api/teacher/students');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveIncludingTeacher.mockResolvedValue(memberSchool);
  mockResolveMyTeacherProfile.mockResolvedValue({
    teacherId: 'tea_1',
    classSubjectIds: ['cs_1'],
    homeroomClassIds: ['cls_2'],
  });
  prismaMock.classSubject.findMany.mockResolvedValue([{ classId: 'cls_1' }] as never);
  prismaMock.enrollment.findMany.mockResolvedValue([
    {
      classId: 'cls_1',
      class: { name: '3ème A', level: '3ème' },
      student: {
        id: 'stu_1',
        firstName: 'Nadia',
        lastName: 'Alexis',
        studentNumber: 'EL-2026-001',
        photoUrl: null,
        status: 'ENROLLED',
      },
    },
    {
      classId: 'cls_2',
      class: { name: '4ème B', level: '4ème' },
      student: {
        id: 'stu_2',
        firstName: 'Jean',
        lastName: 'Baptiste',
        studentNumber: 'EL-2026-002',
        photoUrl: null,
        status: 'ENROLLED',
      },
    },
  ] as never);
});

describe('GET /api/teacher/students', () => {
  it('401s an unauthenticated caller', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    expect((await GET(req())).status).toBe(401);
  });

  it('404s a non-teacher account', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(404);
  });

  it('404s an account with no school membership at all', async () => {
    mockResolveIncludingTeacher.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(404);
  });

  it('returns flattened students scoped to my homeroom and taught classes, active year only', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.students).toEqual([
      {
        id: 'stu_1',
        firstName: 'Nadia',
        lastName: 'Alexis',
        studentNumber: 'EL-2026-001',
        photoUrl: null,
        status: 'ENROLLED',
        classId: 'cls_1',
        className: '3ème A',
        classLevel: '3ème',
      },
      {
        id: 'stu_2',
        firstName: 'Jean',
        lastName: 'Baptiste',
        studentNumber: 'EL-2026-002',
        photoUrl: null,
        status: 'ENROLLED',
        classId: 'cls_2',
        className: '4ème B',
        classLevel: '4ème',
      },
    ]);
    const where = prismaMock.enrollment.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toEqual({
      classId: { in: ['cls_2', 'cls_1'] },
      academicYear: { isActive: true },
    });
  });

  it('returns an empty list without querying enrollments when the teacher has no classes', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue({
      teacherId: 'tea_1',
      classSubjectIds: [],
      homeroomClassIds: [],
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).students).toEqual([]);
    expect(prismaMock.enrollment.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/teacher/students/route.test.ts`
Expected: FAIL (cannot resolve `./route`).

- [ ] **Step 3: Implement the route**

Create `frontend/src/app/api/teacher/students/route.ts`:

```ts
// GET /api/teacher/students — every student enrolled (active academic year)
// in a class this teacher either homerooms or teaches at least one subject
// in, flattened for the Mes élèves list screen. Read-only, teacher-scoped:
// the class list is re-derived from the caller's own Teacher row on every
// request, so the response can never carry another teacher's students.
// Non-teacher accounts get 404 (not-found-for-you), matching every other
// ownership-scoped route. See
// docs/superpowers/specs/2026-08-31-espace-enseignant-phase3-saisie-design.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
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

    const taughtClasses =
      myTeacher.classSubjectIds.length > 0
        ? await prisma.classSubject.findMany({
            where: { id: { in: myTeacher.classSubjectIds } },
            select: { classId: true },
          })
        : [];
    const classIds = [
      ...new Set([...myTeacher.homeroomClassIds, ...taughtClasses.map((cs) => cs.classId)]),
    ];
    if (classIds.length === 0) {
      return NextResponse.json(
        { students: [] },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Classes are year-scoped rows, so filtering enrollments to the active
    // year naturally drops any stale previous-year assignment.
    const enrollments = await prisma.enrollment.findMany({
      where: { classId: { in: classIds }, academicYear: { isActive: true } },
      select: {
        classId: true,
        class: { select: { name: true, level: true } },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentNumber: true,
            photoUrl: true,
            status: true,
          },
        },
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });

    return NextResponse.json(
      {
        students: enrollments.map((e) => ({
          id: e.student.id,
          firstName: e.student.firstName,
          lastName: e.student.lastName,
          studentNumber: e.student.studentNumber,
          photoUrl: e.student.photoUrl,
          status: e.student.status,
          classId: e.classId,
          className: e.class.name,
          classLevel: e.class.level,
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/teacher/students/route.test.ts`
Expected: 5 tests PASS. (The runtime-enforcement tripwire covers the new file automatically in the full run.)

- [ ] **Step 5: Gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add frontend/src/app/api/teacher/students/route.ts frontend/src/app/api/teacher/students/route.test.ts
git commit --only frontend/src/app/api/teacher/students/route.ts --only frontend/src/app/api/teacher/students/route.test.ts -m "feat(teacher): list the students of my classes via GET /api/teacher/students"
```

---

### Task 3: GET /api/teacher/students/[id]

**Files:**
- Create: `frontend/src/app/api/teacher/students/[id]/route.ts`
- Test: `frontend/src/app/api/teacher/students/[id]/route.test.ts`

**Interfaces:**
- Consumes: `subjectAverageFor`, `resolveCurrentTerm` from `@/lib/server/grades` (real implementations, not mocked in tests, so averages are computed by the production logic).
- Produces: the spec's lightweight profile response (see Step 3 code). Task 7 consumes it.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/teacher/students/[id]/route.test.ts`:

```ts
// GET /api/teacher/students/[id] — lightweight student profile scoped to
// the caller's own subjects. prismaMock first (auto-hoists vi.mock for
// '@/lib/server/prisma').
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

function call(id = 'stu_1', qs = '') {
  return GET(new NextRequest(`http://localhost/api/teacher/students/${id}${qs}`), {
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
    homeroomClassIds: ['cls_1'],
  });
  prismaMock.classSubject.findMany.mockResolvedValue([
    { id: 'cs_1', classId: 'cls_1', subjectId: 'sub_1', subject: { name: 'Mathématiques' } },
  ] as never);
  prismaMock.enrollment.findFirst.mockResolvedValue({
    classId: 'cls_1',
    academicYearId: 'year_1',
    class: { id: 'cls_1', name: '3ème A', level: '3ème' },
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
      classSubjectId: 'cs_1',
      label: 'DS 1',
      type: 'DS',
      date: new Date('2025-10-10T00:00:00.000Z'),
      maxScore: 20,
      coefficient: 2,
      status: 'PUBLISHED',
      countsTowardAverage: true,
      grades: [{ studentId: 'stu_1', score: 15, absent: false, comment: null }],
    },
    {
      id: 'eva_2',
      classSubjectId: 'cs_1',
      label: 'Interro 1',
      type: 'INTERROGATION',
      date: null,
      maxScore: 20,
      coefficient: 1,
      status: 'DRAFT',
      countsTowardAverage: true,
      grades: [{ studentId: 'stu_1', score: 8, absent: false, comment: null }],
    },
  ] as never);
  prismaMock.appreciation.findMany.mockResolvedValue([
    {
      subjectId: 'sub_1',
      mention: 'BIEN',
      text: 'Bon trimestre.',
      comportement: null,
      investissement: null,
      assiduite: null,
      status: 'PUBLISHED',
    },
    {
      subjectId: null,
      mention: 'BIEN',
      text: 'Ensemble satisfaisant.',
      comportement: 'Bon',
      investissement: 'Soutenu',
      assiduite: 'Régulière',
      status: 'DRAFT',
    },
  ] as never);
});

describe('GET /api/teacher/students/[id]', () => {
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

  it('404s a student outside my classes, and scoped the lookup to them', async () => {
    prismaMock.enrollment.findFirst.mockResolvedValue(null);
    expect((await call('stu_other')).status).toBe(404);
    const where = prismaMock.enrollment.findFirst.mock.calls[0]?.[0]?.where;
    expect(where).toEqual({
      studentId: 'stu_other',
      academicYear: { isActive: true },
      classId: { in: ['cls_1'] },
    });
  });

  it('404s a student from another school even when enrolled in a matching class id', async () => {
    prismaMock.enrollment.findFirst.mockResolvedValue({
      classId: 'cls_1',
      academicYearId: 'year_1',
      class: { id: 'cls_1', name: '3ème A', level: '3ème' },
      student: {
        id: 'stu_1',
        firstName: 'X',
        lastName: 'Y',
        studentNumber: 'EL-1',
        photoUrl: null,
        status: 'ENROLLED',
        schoolId: 'school_OTHER',
      },
    } as never);
    expect((await call()).status).toBe(404);
  });

  it('returns identity, my subjects with a PUBLISHED-only average, and my appreciations', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.student).toEqual({
      id: 'stu_1',
      firstName: 'Nadia',
      lastName: 'Alexis',
      studentNumber: 'EL-2026-001',
      photoUrl: null,
      status: 'ENROLLED',
    });
    expect(body.class).toEqual({ id: 'cls_1', name: '3ème A', level: '3ème' });
    expect(body.isMyHomeroom).toBe(true);
    expect(body.term).toEqual({ id: 'term_1', label: '1er Trimestre' });
    expect(body.subjects).toHaveLength(1);
    expect(body.subjects[0]).toMatchObject({
      classSubjectId: 'cs_1',
      subjectId: 'sub_1',
      subjectName: 'Mathématiques',
      average: 15, // the DRAFT Interro (8/20) must not drag it down
    });
    expect(body.subjects[0].evaluations).toEqual([
      {
        id: 'eva_1',
        label: 'DS 1',
        type: 'DS',
        date: '2025-10-10T00:00:00.000Z',
        maxScore: 20,
        coefficient: 2,
        status: 'PUBLISHED',
        score: 15,
        absent: false,
        comment: null,
      },
      {
        id: 'eva_2',
        label: 'Interro 1',
        type: 'INTERROGATION',
        date: null,
        maxScore: 20,
        coefficient: 1,
        status: 'DRAFT',
        score: 8,
        absent: false,
        comment: null,
      },
    ]);
    expect(body.appreciations).toHaveLength(2);
  });

  it('omits the general appreciation clause for a non-homeroom teacher', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue({
      teacherId: 'tea_1',
      classSubjectIds: ['cs_1'],
      homeroomClassIds: [],
    });
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isMyHomeroom).toBe(false);
    const where = prismaMock.appreciation.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toEqual({
      studentId: 'stu_1',
      termId: 'term_1',
      OR: [{ subjectId: { in: ['sub_1'] } }],
    });
  });

  it('404s an explicit termId that does not belong to the student year', async () => {
    expect((await call('stu_1', '?termId=term_OTHER')).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run "src/app/api/teacher/students/[id]/route.test.ts"`
Expected: FAIL (cannot resolve `./route`).

- [ ] **Step 3: Implement the route**

Create `frontend/src/app/api/teacher/students/[id]/route.ts`:

```ts
// GET /api/teacher/students/[id]?termId= — the lightweight student profile
// for the teacher portal: identity + class, then ONLY what this teacher
// owns pedagogically for the selected term (their subjects' evaluations
// with this student's grades and the matching averages, their subjects'
// appreciations, plus the general appreciation when they homeroom the
// student's class). Deliberately NO contacts, guardians, finances or full
// record: that surface belongs to the school back-office. 404 anti-leak
// everywhere, including a termId from another year. See
// docs/superpowers/specs/2026-08-31-espace-enseignant-phase3-saisie-design.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { resolveCurrentTerm, subjectAverageFor } from '@/lib/server/grades';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function notFound(requestId: string): NextResponse {
  return NextResponse.json(
    { error: 'NOT_FOUND', message: 'Not found' },
    { status: 404, headers: { 'x-request-id': requestId } },
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchoolIncludingTeacher(auth.user.sub);
    if (!mySchool) return notFound(ctx.requestId);
    const myTeacher = await resolveMyTeacherProfile(auth.user.sub, mySchool.schoolId);
    if (!myTeacher) return notFound(ctx.requestId);

    const { id } = await params;

    const myClassSubjects =
      myTeacher.classSubjectIds.length > 0
        ? await prisma.classSubject.findMany({
            where: { id: { in: myTeacher.classSubjectIds } },
            select: { id: true, classId: true, subjectId: true, subject: { select: { name: true } } },
          })
        : [];
    const myClassIds = [
      ...new Set([...myTeacher.homeroomClassIds, ...myClassSubjects.map((cs) => cs.classId)]),
    ];

    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId: id, academicYear: { isActive: true }, classId: { in: myClassIds } },
      select: {
        classId: true,
        academicYearId: true,
        class: { select: { id: true, name: true, level: true } },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentNumber: true,
            photoUrl: true,
            status: true,
            schoolId: true,
          },
        },
      },
    });
    if (!enrollment || enrollment.student.schoolId !== mySchool.schoolId) {
      return notFound(ctx.requestId);
    }

    const terms = await prisma.term.findMany({
      where: { academicYearId: enrollment.academicYearId },
      orderBy: { order: 'asc' },
      select: { id: true, label: true, order: true, startDate: true, endDate: true },
    });
    const requestedTermId = req.nextUrl.searchParams.get('termId');
    const term = requestedTermId
      ? (terms.find((t) => t.id === requestedTermId) ?? null)
      : resolveCurrentTerm(terms);
    if (requestedTermId && !term) return notFound(ctx.requestId);

    const inThisClass = myClassSubjects.filter((cs) => cs.classId === enrollment.classId);
    const isMyHomeroom = myTeacher.homeroomClassIds.includes(enrollment.classId);

    const evaluations =
      term && inThisClass.length > 0
        ? await prisma.evaluation.findMany({
            where: { classSubjectId: { in: inThisClass.map((cs) => cs.id) }, termId: term.id },
            orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
            select: {
              id: true,
              classSubjectId: true,
              label: true,
              type: true,
              date: true,
              maxScore: true,
              coefficient: true,
              status: true,
              countsTowardAverage: true,
              grades: {
                where: { studentId: id },
                select: { studentId: true, score: true, absent: true, comment: true },
              },
            },
          })
        : [];

    const subjects = inThisClass.map((cs) => {
      const evals = evaluations.filter((e) => e.classSubjectId === cs.id);
      return {
        classSubjectId: cs.id,
        subjectId: cs.subjectId,
        subjectName: cs.subject.name,
        evaluations: evals.map((e) => {
          const g = e.grades[0];
          return {
            id: e.id,
            label: e.label,
            type: e.type,
            date: e.date ? e.date.toISOString() : null,
            maxScore: e.maxScore,
            coefficient: e.coefficient,
            status: e.status,
            score: g?.score ?? null,
            absent: g?.absent ?? false,
            comment: g?.comment ?? null,
          };
        }),
        average: subjectAverageFor(evals, id),
      };
    });

    const appreciations = term
      ? await prisma.appreciation.findMany({
          where: {
            studentId: id,
            termId: term.id,
            OR: [
              { subjectId: { in: inThisClass.map((cs) => cs.subjectId) } },
              ...(isMyHomeroom ? [{ subjectId: null }] : []),
            ],
          },
          select: {
            subjectId: true,
            mention: true,
            text: true,
            comportement: true,
            investissement: true,
            assiduite: true,
            status: true,
          },
        })
      : [];

    return NextResponse.json(
      {
        student: {
          id: enrollment.student.id,
          firstName: enrollment.student.firstName,
          lastName: enrollment.student.lastName,
          studentNumber: enrollment.student.studentNumber,
          photoUrl: enrollment.student.photoUrl,
          status: enrollment.student.status,
        },
        class: enrollment.class,
        isMyHomeroom,
        term: term ? { id: term.id, label: term.label } : null,
        subjects,
        appreciations,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run "src/app/api/teacher/students/[id]/route.test.ts"`
Expected: 7 tests PASS.

- [ ] **Step 5: Gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add "frontend/src/app/api/teacher/students/[id]/route.ts" "frontend/src/app/api/teacher/students/[id]/route.test.ts"
git commit --only "frontend/src/app/api/teacher/students/[id]/route.ts" --only "frontend/src/app/api/teacher/students/[id]/route.test.ts" -m "feat(teacher): lightweight scoped student profile via GET /api/teacher/students/[id]"
```

---

### Task 4: i18n — teacherStudents namespace, nav keys, registry, CLAUDE.md count

**Files:**
- Create: `frontend/src/messages/fr/teacherStudents.json`, `frontend/src/messages/ht/teacherStudents.json`, `frontend/src/messages/en/teacherStudents.json`
- Modify: `frontend/src/messages/{fr,ht,en}/teacherPortal.json` (2 nav keys each)
- Modify: `frontend/src/lib/locales.ts` (`MESSAGE_NAMESPACES` + 1)
- Modify: `frontend/src/i18n/request.ts` (import + map entry)
- Modify: `frontend/src/types/next-intl.d.ts` (import + map entry)
- Modify: `CLAUDE.md` (namespace count 32 → 33)

**Interfaces:**
- Produces: namespace `TeacherStudents` (Tasks 6-7), keys `TeacherPortal.nav.students` / `nav.studentsShort` (Task 5). Reused-not-created: `Eleves.list.*` (searchPlaceholder, allClasses, allStatuses, status.*, resultsCount, emptyFiltered, export, csv.*, table.student/class/status), `Eleves.mention.*`, `TeacherClasses.table.studentNumber`, `TeacherPortal.loadError`, `Gradebook.evaluationType.*`, `Gradebook.evaluationStatus.*`.

- [ ] **Step 1: Create the three message files**

`frontend/src/messages/fr/teacherStudents.json`:

```json
{
  "list": {
    "title": "Mes élèves",
    "count": "{count, plural, =0 {Aucun élève} one {# élève} other {# élèves}}",
    "allSubjects": "Toutes les matières",
    "emptyNone": "Aucun élève dans vos classes pour le moment."
  },
  "profile": {
    "back": "Retour à mes élèves",
    "homeroom": "Titulaire",
    "notesTitle": "Notes du trimestre",
    "average": "Moyenne",
    "noEvaluations": "Aucune évaluation pour ce trimestre.",
    "table": {
      "evaluation": "Évaluation",
      "type": "Type",
      "date": "Date",
      "score": "Note",
      "coefficient": "Coef.",
      "status": "Statut"
    },
    "notGraded": "Non noté",
    "absent": "Absent(e)",
    "appreciationsTitle": "Appréciations",
    "general": "Appréciation générale",
    "noAppreciations": "Aucune appréciation saisie pour ce trimestre.",
    "comportement": "Comportement",
    "investissement": "Investissement",
    "assiduite": "Assiduité"
  }
}
```

`frontend/src/messages/en/teacherStudents.json`:

```json
{
  "list": {
    "title": "My students",
    "count": "{count, plural, =0 {No students} one {# student} other {# students}}",
    "allSubjects": "All subjects",
    "emptyNone": "No students in your classes yet."
  },
  "profile": {
    "back": "Back to my students",
    "homeroom": "Homeroom teacher",
    "notesTitle": "Term grades",
    "average": "Average",
    "noEvaluations": "No evaluations for this term.",
    "table": {
      "evaluation": "Evaluation",
      "type": "Type",
      "date": "Date",
      "score": "Score",
      "coefficient": "Coef.",
      "status": "Status"
    },
    "notGraded": "Not graded",
    "absent": "Absent",
    "appreciationsTitle": "Comments",
    "general": "General comment",
    "noAppreciations": "No comments entered for this term.",
    "comportement": "Behavior",
    "investissement": "Commitment",
    "assiduite": "Attendance"
  }
}
```

`frontend/src/messages/ht/teacherStudents.json`:

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "list": {
    "title": "Elèv mwen yo",
    "count": "{count, plural, =0 {Pa gen elèv} one {# elèv} other {# elèv}}",
    "allSubjects": "Tout matyè yo",
    "emptyNone": "Poko gen elèv nan klas ou yo."
  },
  "profile": {
    "back": "Retounen sou elèv mwen yo",
    "homeroom": "Titilè",
    "notesTitle": "Nòt trimès la",
    "average": "Mwayèn",
    "noEvaluations": "Pa gen evalyasyon pou trimès sa a.",
    "table": {
      "evaluation": "Evalyasyon",
      "type": "Tip",
      "date": "Dat",
      "score": "Nòt",
      "coefficient": "Koef.",
      "status": "Estati"
    },
    "notGraded": "Poko gen nòt",
    "absent": "Absan",
    "appreciationsTitle": "Apresyasyon",
    "general": "Apresyasyon jeneral",
    "noAppreciations": "Poko gen apresyasyon pou trimès sa a.",
    "comportement": "Konpòtman",
    "investissement": "Angajman",
    "assiduite": "Asiduite"
  }
}
```

(The ht `_review` note deliberately keeps the exact wording used by the other ht files, French second sentence included.)

- [ ] **Step 2: Add the two nav keys to teacherPortal.json (all three locales)**

In `frontend/src/messages/fr/teacherPortal.json`, inside `"nav"`, after `"classes"`:

```json
    "students": "Mes élèves",
    "studentsShort": "Élèves",
```

In `frontend/src/messages/en/teacherPortal.json`, same position (keep whatever the existing en values pattern is for the sibling keys):

```json
    "students": "My students",
    "studentsShort": "Students",
```

In `frontend/src/messages/ht/teacherPortal.json`, same position:

```json
    "students": "Elèv mwen yo",
    "studentsShort": "Elèv",
```

- [ ] **Step 3: Register the namespace in the three registry files**

1. `frontend/src/lib/locales.ts` — in `MESSAGE_NAMESPACES`, after `'teacherTimetable',` add:

```ts
  'teacherStudents',
```

2. `frontend/src/i18n/request.ts` — three synchronized edits, each after the `teacherTimetable` line of its block: add `teacherStudents,` to the destructuring array, add `import(\`../messages/${locale}/teacherStudents.json\`),` to the `Promise.all` array (same position), and add `TeacherStudents: teacherStudents.default,` to the `messages` object.

3. `frontend/src/types/next-intl.d.ts` — add after the `teacherTimetable` lines:

```ts
import type teacherStudents from '@/messages/fr/teacherStudents.json';
```

and in the `Messages` interface:

```ts
      TeacherStudents: typeof teacherStudents;
```

- [ ] **Step 4: Update the CLAUDE.md namespace count**

In `CLAUDE.md`, change the phrase `across 32 message namespaces` to `across 33 message namespaces` (single occurrence).

- [ ] **Step 5: Verify with the consistency test, gate + commit**

Run: `pnpm --filter frontend exec vitest run src/lib/locales.test.ts`
Expected: PASS (33 namespaces on disk in all three locales, registry in sync).

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add frontend/src/messages/fr/teacherStudents.json frontend/src/messages/ht/teacherStudents.json frontend/src/messages/en/teacherStudents.json frontend/src/messages/fr/teacherPortal.json frontend/src/messages/ht/teacherPortal.json frontend/src/messages/en/teacherPortal.json frontend/src/lib/locales.ts frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts CLAUDE.md
git commit --only frontend/src/messages/fr/teacherStudents.json --only frontend/src/messages/ht/teacherStudents.json --only frontend/src/messages/en/teacherStudents.json --only frontend/src/messages/fr/teacherPortal.json --only frontend/src/messages/ht/teacherPortal.json --only frontend/src/messages/en/teacherPortal.json --only frontend/src/lib/locales.ts --only frontend/src/i18n/request.ts --only frontend/src/types/next-intl.d.ts --only CLAUDE.md -m "feat(i18n): teacherStudents namespace and students nav keys"
```

---

### Task 5: Navigation — sidebar item + mobile bottom nav

**Files:**
- Modify: `frontend/src/components/layout/teacher/TeacherSidebar.tsx`
- Modify: `frontend/src/components/layout/teacher/TeacherMobileBottomNav.tsx`

**Interfaces:**
- Consumes: `TeacherPortal.nav.students` / `nav.studentsShort` (Task 4).
- Produces: sidebar + bottom-nav + breadcrumbs + command palette all list `/espace-enseignant/eleves` (breadcrumbs and palette derive from `useTeacherSections()` automatically).

- [ ] **Step 1: Add the sidebar item**

In `TeacherSidebar.tsx`, add `Users` to the lucide import and insert a new item into `useTeacherSections()` between the `classes` and `timetable` items:

```ts
          { label: t('students'), href: '/espace-enseignant/eleves', icon: Users },
```

(The Pédagogie second section arrives with Plan 2; this plan keeps one section.)

- [ ] **Step 2: Rework the bottom nav links**

In `TeacherMobileBottomNav.tsx`, replace the `key` union and `LINK_DEFS` so the four slots become Accueil, Élèves, Classes, Emploi du temps (Paramètres moves to the « Plus » drawer, per the spec's target bar; the Notes slot replaces Classes in Plan 2):

```ts
interface BottomNavLink {
  key: 'home' | 'studentsShort' | 'classes' | 'timetable';
  href: string;
  icon: LucideIcon;
}

const LINK_DEFS: BottomNavLink[] = [
  { key: 'home', href: '/espace-enseignant', icon: LayoutDashboard },
  { key: 'studentsShort', href: '/espace-enseignant/eleves', icon: Users },
  { key: 'classes', href: '/espace-enseignant/classes', icon: School },
  { key: 'timetable', href: '/espace-enseignant/emploi-du-temps', icon: CalendarDays },
];
```

Update the lucide import (`Users` in, `Settings` out) — everything else in the file stays as is (the render loop already reads `t(item.key)`).

- [ ] **Step 3: Verify active-state routing**

Check `frontend/src/components/layout/sidebar/route-match.ts` still lists `/espace-enseignant` in its exact-match set (so Accueil does not light up on `/espace-enseignant/eleves`), and that `/espace-enseignant/eleves/[id]` prefix-matches the Élèves item. No code change expected; if the exact-match list is missing `/espace-enseignant`, stop and report (it is a Phase 2 regression, not this plan's edit).

- [ ] **Step 4: Gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add frontend/src/components/layout/teacher/TeacherSidebar.tsx frontend/src/components/layout/teacher/TeacherMobileBottomNav.tsx
git commit --only frontend/src/components/layout/teacher/TeacherSidebar.tsx --only frontend/src/components/layout/teacher/TeacherMobileBottomNav.tsx -m "feat(teacher): add Mes eleves to the portal navigation"
```

---

### Task 6: Mes élèves screen

**Files:**
- Create: `frontend/src/app/(teacher)/espace-enseignant/eleves/page.tsx`

**Interfaces:**
- Consumes: `GET /api/teacher/students` (Task 2), `GET /api/teacher/me` (classSubjects for the subject filter, homeroomClasses for the class filter), namespaces `TeacherStudents`, `Eleves.list`, `TeacherClasses.table`, `TeacherPortal`.
- Produces: links to `/espace-enseignant/eleves/[id]` (Task 7).

- [ ] **Step 1: Create the page**

Create `frontend/src/app/(teacher)/espace-enseignant/eleves/page.tsx`:

```tsx
'use client';

// Mes élèves — the teacher-portal twin of the school /eleves screen: same
// toolbar (search + class/subject/status filters), same grid/table views,
// same table anatomy, minus every mutation affordance (no add/edit/delete,
// no ActionMenu). Data comes exclusively from /api/teacher/* reads; the
// subject filter is resolved client-side through my classSubjects (subject
// -> the classes where I teach it), since the students payload is flat.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { FileSpreadsheet } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { CardGrid } from '@/components/school/CardGrid';
import { ListCard } from '@/components/school/ListCard';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Skeleton, SkeletonFilters, SkeletonTable } from '@/components/ui/Skeleton';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { Pager } from '@/components/ui/Pager';
import { exportToCsv } from '@/lib/csv-export';
import { GRID_SCROLL, LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';

const PAGE_SIZE = 20;

type StudentStatus = 'ENROLLED' | 'REPEATED_ABSENCES' | 'SUSPENDED';

const STATUS_TONE: Record<StudentStatus, 'success' | 'warning' | 'secondary'> = {
  ENROLLED: 'success',
  REPEATED_ABSENCES: 'warning',
  SUSPENDED: 'secondary',
};

interface TeacherStudentRow {
  id: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  photoUrl: string | null;
  status: StudentStatus;
  classId: string;
  className: string;
  classLevel: string;
}

interface TeacherMeFiltersResponse {
  homeroomClasses: { id: string; name: string }[];
  classSubjects: { id: string; classId: string; className: string; subjectId: string; subjectName: string }[];
}

export default function TeacherStudentsPage() {
  const t = useTranslations('TeacherStudents.list');
  const tEleves = useTranslations('Eleves.list');
  const tStatus = useTranslations('Eleves.list.status');
  const tTeacherClasses = useTranslations('TeacherClasses');
  const tPortal = useTranslations('TeacherPortal');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [status, setStatus] = useState<'' | StudentStatus>('');
  const [view, setView] = useState<'list' | 'grid'>('grid');
  const [page, setPage] = useState(1);

  const { data: studentsData, error: studentsErr } = useApi<{ students: TeacherStudentRow[] }>(
    '/api/teacher/students',
  );
  const { data: me, error: meErr } = useApi<TeacherMeFiltersResponse>('/api/teacher/me');
  const students = studentsData?.students ?? null;
  const error = studentsErr || meErr ? tPortal('loadError') : null;

  const classOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const c of me?.homeroomClasses ?? []) byId.set(c.id, c.name);
    for (const cs of me?.classSubjects ?? []) byId.set(cs.classId, cs.className);
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [me]);

  const subjectOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const cs of me?.classSubjects ?? []) byId.set(cs.subjectId, cs.subjectName);
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [me]);

  const subjectClassIds = useMemo(() => {
    if (!subjectFilter) return null;
    return new Set(
      (me?.classSubjects ?? [])
        .filter((cs) => cs.subjectId === subjectFilter)
        .map((cs) => cs.classId),
    );
  }, [me, subjectFilter]);

  const filtered = useMemo(() => {
    return (students ?? []).filter((s) => {
      if (classFilter && s.classId !== classFilter) return false;
      if (subjectClassIds && !subjectClassIds.has(s.classId)) return false;
      if (status && s.status !== status) return false;
      if (search && !`${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [students, search, classFilter, subjectClassIds, status]);

  useEffect(() => {
    setPage(1);
  }, [search, classFilter, subjectFilter, status]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function onExport() {
    exportToCsv(
      'mes-eleves.csv',
      [tEleves('csv.student'), tEleves('csv.number'), tEleves('csv.class'), tEleves('csv.status')],
      filtered.map((s) => [
        `${s.firstName} ${s.lastName}`,
        s.studentNumber,
        s.className,
        tStatus(s.status),
      ]),
    );
  }

  return (
    <div className={`${LIST_PAGE} gap-5`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
          {students ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('count', { count: students.length })}
            </p>
          ) : (
            <Skeleton className="mt-1.5 h-3 w-28" />
          )}
        </div>
        <Button variant="outline" className="w-fit" onClick={onExport}>
          <FileSpreadsheet size={14} />
          {tEleves('export')}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {students === null && !error && (
        <div className="flex flex-col gap-3.5">
          <SkeletonFilters />
          <Card className="overflow-hidden">
            <SkeletonTable rows={8} cols={4} />
          </Card>
        </div>
      )}

      {students !== null && (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tEleves('searchPlaceholder')}
              className="max-w-[300px]"
            />
            <FilterSelect value={classFilter} onValueChange={setClassFilter}>
              <SelectItem value="">{tEleves('allClasses')}</SelectItem>
              {classOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectItem value="">{t('allSubjects')}</SelectItem>
              {subjectOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={status} onValueChange={(v) => setStatus(v as '' | StudentStatus)}>
              <SelectItem value="">{tEleves('allStatuses')}</SelectItem>
              <SelectItem value="ENROLLED">{tStatus('ENROLLED')}</SelectItem>
              <SelectItem value="REPEATED_ABSENCES">{tStatus('REPEATED_ABSENCES')}</SelectItem>
              <SelectItem value="SUSPENDED">{tStatus('SUSPENDED')}</SelectItem>
            </FilterSelect>
            <span className="text-sm text-muted-foreground">
              {tEleves(filtered.length > 1 ? 'resultsCount.other' : 'resultsCount.one', {
                count: filtered.length,
              })}
            </span>
            <div className="ml-auto hidden md:block">
              <ViewToggle view={view} onChange={setView} />
            </div>
          </div>

          {filtered.length === 0 ? (
            <Card>
              <p className="p-5 text-sm text-muted-foreground">
                {students.length === 0 ? t('emptyNone') : tEleves('emptyFiltered')}
              </p>
            </Card>
          ) : view === 'grid' ? (
            <CardGrid className={GRID_SCROLL}>
              {paged.map((s) => (
                <ListCard
                  key={s.id}
                  tile={<Avatar name={`${s.firstName} ${s.lastName}`} size={38} src={s.photoUrl} />}
                  title={`${s.firstName} ${s.lastName}`}
                  href={`/espace-enseignant/eleves/${s.id}`}
                  subtitle={`#${s.studentNumber}`}
                  metaLeft={<Badge>{s.className}</Badge>}
                  metaRight={<Badge tone={STATUS_TONE[s.status]}>{tStatus(s.status)}</Badge>}
                />
              ))}
            </CardGrid>
          ) : (
            <Card>
              <div className={TABLE_SCROLL}>
                <table className="w-full min-w-[680px] border-collapse text-sm">
                  <thead className={STICKY_THEAD}>
                    <tr className="border-b border-border">
                      <Th>{tEleves('table.student')}</Th>
                      <Th>{tTeacherClasses('table.studentNumber')}</Th>
                      <Th>{tEleves('table.class')}</Th>
                      <Th>{tEleves('table.status')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((s) => (
                      <tr key={s.id} className="border-b border-border last:border-none">
                        <td className="px-3.5 py-2.5">
                          <Link
                            href={`/espace-enseignant/eleves/${s.id}`}
                            className="flex items-center gap-2.5"
                          >
                            <Avatar
                              name={`${s.firstName} ${s.lastName}`}
                              size={32}
                              src={s.photoUrl}
                            />
                            <span className="font-semibold text-foreground">
                              {s.firstName} {s.lastName}
                            </span>
                          </Link>
                        </td>
                        <td className="px-3.5 py-2.5 text-muted-foreground">#{s.studentNumber}</td>
                        <td className="px-3.5 py-2.5">
                          <Badge>{s.className}</Badge>
                        </td>
                        <td className="px-3.5 py-2.5">
                          <Badge tone={STATUS_TONE[s.status]}>{tStatus(s.status)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                centered
                page={page}
                pageSize={PAGE_SIZE}
                total={filtered.length}
                onChange={setPage}
              />
            </Card>
          )}
          {view === 'grid' && filtered.length > 0 && (
            <Pager
              centered
              page={page}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              onChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}

function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase ${className}`}
    >
      {children}
    </th>
  );
}

function Badge({
  children,
  tone = 'secondary',
}: {
  children: ReactNode;
  tone?: 'secondary' | 'success' | 'warning';
}) {
  const toneClasses = {
    secondary: 'bg-secondary text-secondary-foreground',
    success: 'bg-success text-success-foreground',
    warning: 'bg-warning text-warning-foreground',
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add "frontend/src/app/(teacher)/espace-enseignant/eleves/page.tsx"
git commit --only "frontend/src/app/(teacher)/espace-enseignant/eleves/page.tsx" -m "feat(teacher): Mes eleves screen with school-grade filters and views"
```

---

### Task 7: Lightweight student profile screen

**Files:**
- Create: `frontend/src/app/(teacher)/espace-enseignant/eleves/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/teacher/students/[id]?termId=` (Task 3), `GET /api/teacher/me` (`terms`, Task 1), namespaces `TeacherStudents.profile`, `Eleves.list.status`, `Eleves.mention`, `Gradebook.evaluationType`, `Gradebook.evaluationStatus`, `TeacherPortal`.
- Produces: nothing consumed later in this plan (Plans 2-3 add entry links here).

- [ ] **Step 1: Create the page**

Create `frontend/src/app/(teacher)/espace-enseignant/eleves/[id]/page.tsx`:

```tsx
'use client';

// Fiche élève allégée — identity + class header, then only what this
// teacher owns pedagogically for the selected term: their subjects'
// evaluations with this student's scores and averages, and the
// appreciations (their subjects + the general one when they homeroom the
// class). Deliberately no contacts, guardians or finances: that data
// stays on the school back-office profile. Term switching refetches with
// ?termId=; the default term is resolved server-side.
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';
import { LOCALE_BCP47 } from '@/lib/locales';

type StudentStatus = 'ENROLLED' | 'REPEATED_ABSENCES' | 'SUSPENDED';
type EvaluationType = 'DS' | 'INTERROGATION' | 'EXAMEN' | 'AUTRE';
type EvaluationStatus = 'DRAFT' | 'PUBLISHED';
type Mention =
  | 'TRES_BIEN'
  | 'BIEN'
  | 'ASSEZ_BIEN'
  | 'PASSABLE'
  | 'INSUFFISANT'
  | 'FAIBLE';

const STATUS_TONE: Record<StudentStatus, 'success' | 'warning' | 'secondary'> = {
  ENROLLED: 'success',
  REPEATED_ABSENCES: 'warning',
  SUSPENDED: 'secondary',
};

interface ProfileResponse {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    studentNumber: string;
    photoUrl: string | null;
    status: StudentStatus;
  };
  class: { id: string; name: string; level: string };
  isMyHomeroom: boolean;
  term: { id: string; label: string } | null;
  subjects: {
    classSubjectId: string;
    subjectId: string;
    subjectName: string;
    evaluations: {
      id: string;
      label: string;
      type: EvaluationType;
      date: string | null;
      maxScore: number;
      coefficient: number;
      status: EvaluationStatus;
      score: number | null;
      absent: boolean;
      comment: string | null;
    }[];
    average: number | null;
  }[];
  appreciations: {
    subjectId: string | null;
    mention: Mention | null;
    text: string | null;
    comportement: string | null;
    investissement: string | null;
    assiduite: string | null;
    status: EvaluationStatus;
  }[];
}

interface TeacherMeTermsResponse {
  terms: { id: string; label: string }[];
  currentTermId: string | null;
}

export default function TeacherStudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('TeacherStudents.profile');
  const tStatus = useTranslations('Eleves.list.status');
  const tMention = useTranslations('Eleves.mention');
  const tType = useTranslations('Gradebook.evaluationType');
  const tEvalStatus = useTranslations('Gradebook.evaluationStatus');
  const tPortal = useTranslations('TeacherPortal');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const [termId, setTermId] = useState('');

  const { data: me } = useApi<TeacherMeTermsResponse>('/api/teacher/me');
  const { data, error } = useApi<ProfileResponse>(
    `/api/teacher/students/${id}${termId ? `?termId=${termId}` : ''}`,
  );

  const fmtScore = (n: number) => n.toLocaleString(bcp47);
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(bcp47, { day: 'numeric', month: 'short', year: 'numeric' });

  const subjectNameById = new Map((data?.subjects ?? []).map((s) => [s.subjectId, s.subjectName]));
  const sortedAppreciations = [...(data?.appreciations ?? [])].sort((a, b) =>
    a.subjectId === null ? -1 : b.subjectId === null ? 1 : 0,
  );

  return (
    <div className={LIST_PAGE}>
      <Link
        href="/espace-enseignant/eleves"
        className="mb-3 flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft size={16} />
        {t('back')}
      </Link>

      {error ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {tPortal('loadError')}
        </p>
      ) : !data ? (
        <div className="flex flex-col gap-3.5">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Card className="flex-row items-center gap-4 p-4">
            <Avatar
              name={`${data.student.firstName} ${data.student.lastName}`}
              size={56}
              src={data.student.photoUrl}
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-extrabold tracking-tight text-foreground">
                {data.student.firstName} {data.student.lastName}
              </h1>
              <p className="text-xs text-muted-foreground">
                #{data.student.studentNumber} · {data.class.name} · {data.class.level}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge tone={STATUS_TONE[data.student.status]}>
                  {tStatus(data.student.status)}
                </Badge>
                {data.isMyHomeroom && <Badge>{t('homeroom')}</Badge>}
              </div>
            </div>
            {me && me.terms.length > 0 && (
              <FilterSelect
                value={termId || (data.term?.id ?? '')}
                onValueChange={setTermId}
              >
                {me.terms.map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.label}
                  </SelectItem>
                ))}
              </FilterSelect>
            )}
          </Card>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold text-foreground">{t('notesTitle')}</h2>
            {data.subjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noEvaluations')}</p>
            ) : (
              data.subjects.map((subject) => (
                <Card key={subject.classSubjectId} className="gap-0 p-0">
                  <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
                    <h3 className="text-sm font-bold text-foreground">{subject.subjectName}</h3>
                    <span className="text-xs font-semibold text-foreground">
                      {t('average')}{' '}
                      {subject.average === null ? (
                        <span className="text-muted-foreground">·</span>
                      ) : (
                        <span className="text-primary">{fmtScore(subject.average)}/20</span>
                      )}
                    </span>
                  </div>
                  {subject.evaluations.length === 0 ? (
                    <p className="px-3.5 py-3 text-sm text-muted-foreground">
                      {t('noEvaluations')}
                    </p>
                  ) : (
                    <div className={TABLE_SCROLL}>
                      <table className="w-full min-w-[560px] border-collapse text-sm">
                        <thead className={STICKY_THEAD}>
                          <tr className="border-b border-border">
                            <Th>{t('table.evaluation')}</Th>
                            <Th>{t('table.type')}</Th>
                            <Th>{t('table.date')}</Th>
                            <Th>{t('table.score')}</Th>
                            <Th>{t('table.coefficient')}</Th>
                            <Th>{t('table.status')}</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {subject.evaluations.map((e) => (
                            <tr key={e.id} className="border-b border-border last:border-none">
                              <td className="px-3.5 py-2.5 font-semibold text-foreground">
                                {e.label}
                              </td>
                              <td className="px-3.5 py-2.5 text-muted-foreground">
                                {tType(e.type)}
                              </td>
                              <td className="px-3.5 py-2.5 text-muted-foreground">
                                {e.date ? fmtDate(e.date) : '·'}
                              </td>
                              <td className="px-3.5 py-2.5">
                                {e.absent ? (
                                  <span className="text-muted-foreground">{t('absent')}</span>
                                ) : e.score === null ? (
                                  <span className="text-muted-foreground">{t('notGraded')}</span>
                                ) : (
                                  <span className="font-semibold text-foreground">
                                    {fmtScore(e.score)}/{e.maxScore}
                                  </span>
                                )}
                              </td>
                              <td className="px-3.5 py-2.5 text-muted-foreground">
                                {e.coefficient}
                              </td>
                              <td className="px-3.5 py-2.5">
                                <Badge tone={e.status === 'PUBLISHED' ? 'success' : 'secondary'}>
                                  {tEvalStatus(e.status)}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              ))
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold text-foreground">{t('appreciationsTitle')}</h2>
            {sortedAppreciations.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noAppreciations')}</p>
            ) : (
              <Card className="divide-y divide-border p-0">
                {sortedAppreciations.map((a) => (
                  <div key={a.subjectId ?? 'general'} className="flex flex-col gap-1 px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-foreground">
                        {a.subjectId === null
                          ? t('general')
                          : (subjectNameById.get(a.subjectId) ?? '')}
                      </span>
                      {a.mention && <Badge>{tMention(a.mention)}</Badge>}
                      <Badge tone={a.status === 'PUBLISHED' ? 'success' : 'secondary'}>
                        {tEvalStatus(a.status)}
                      </Badge>
                    </div>
                    {a.text && <p className="text-sm text-muted-foreground">{a.text}</p>}
                    {a.subjectId === null && (
                      <p className="text-xs text-muted-foreground">
                        {[
                          a.comportement ? `${t('comportement')} : ${a.comportement}` : null,
                          a.investissement ? `${t('investissement')} : ${a.investissement}` : null,
                          a.assiduite ? `${t('assiduite')} : ${a.assiduite}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                ))}
              </Card>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase ${className}`}
    >
      {children}
    </th>
  );
}

function Badge({
  children,
  tone = 'secondary',
}: {
  children: ReactNode;
  tone?: 'secondary' | 'success' | 'warning';
}) {
  const toneClasses = {
    secondary: 'bg-secondary text-secondary-foreground',
    success: 'bg-success text-success-foreground',
    warning: 'bg-warning text-warning-foreground',
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Gate, manual check, commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

Manual check (against a running `pnpm dev`, account `carline.michel@lesetoiles.edu.ht` / `TeacherTest2026!` from `frontend/CREDENTIALS.local.md`): `/espace-enseignant/eleves` lists students with working filters and both views; clicking one opens the profile; the term selector switches terms; no console error. If the dev server belongs to another terminal, do not kill it, just use the running one.

```bash
git add "frontend/src/app/(teacher)/espace-enseignant/eleves/[id]/page.tsx"
git commit --only "frontend/src/app/(teacher)/espace-enseignant/eleves/[id]/page.tsx" -m "feat(teacher): lightweight student profile with term grades and appreciations"
```
