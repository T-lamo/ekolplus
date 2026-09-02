# Espace Enseignant Phase 2 — Read-only views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a logged-in teacher-linked account real, read-only screens for their own classes/subjects (roster) and their own weekly timetable, on top of Phase 1's foundation (schema, `resolveMyTeacherProfile`, `resolveMySchool` deny-by-default lockdown, invite/accept flow, bare `/espace-enseignant` home) which is already merged to `develop` at commit `f254993`.

**Architecture:** Three new/modified read-only API routes (`GET /api/teacher/me` aggregate endpoint, `GET /api/teacher/classes/[classSubjectId]`, `GET /api/teacher/classes/homeroom/[classId]`), one existing route (`GET /api/school/timetable`) switched to `resolveMySchoolIncludingTeacher` with a forced-`teacherId` scoping rule, a new teacher-specific bottom tab bar, and four new/enriched pages under the existing `(teacher)/espace-enseignant/` route group. No schema changes — Phase 1 already added everything this phase needs (`Teacher.userId`, `resolveMyTeacherProfile`, `resolveMySchoolIncludingTeacher`).

**Tech Stack:** Next.js 16 App Router Route Handlers, Prisma 5, Vitest + `vitest-mock-extended` (`prismaMock`), next-intl, Tailwind v4, `useApi` client hook.

**Spec:** [docs/superpowers/specs/2026-08-30-espace-enseignant-design.md](../specs/2026-08-30-espace-enseignant-design.md) — this plan implements exactly the "2. Read-only views: Mes classes (roster), Emploi du temps" line of that spec's "Rollout phases" section. Phase 1 (section "Foundation + lockdown") is already shipped; do not re-touch it except where explicitly noted below.

## Global Constraints

- Every Route Handler `export const runtime = 'nodejs'` and wraps its body in `withRequestContext(makeRequestContext(req.headers), ...)` (see any existing `/api/school/*` route for the exact shape).
- All Phase 2 endpoints are `GET`-only (read-only views) — no `verifyCsrf` needed, no mutations.
- Deny-by-default stays intact: only the routes this plan explicitly names switch from `resolveMySchool` to `resolveMySchoolIncludingTeacher`. Every other `/api/school/*` route is untouched.
- Ownership-mismatch responses use `{ error: 'NOT_FOUND', message: 'Not found' }` at **404**, never 403 — matches this app's established "don't leak existence" convention (see `frontend/src/app/api/school/classes/[id]/route.ts`).
- Timetable is **read-only** for teachers: a teacher-linked caller's own `teacherId` always wins over any `?teacherId=` query override — never let a teacher pass a different `teacherId` to see someone else's schedule.
- No em dashes (—) in any new user-facing string (UI copy or message JSON) — see CLAUDE.md "Conventions". Use `·`, a comma, or a period instead.
- New message namespaces need 3 file edits beyond the JSON files themselves: `frontend/src/lib/locales.ts`'s `MESSAGE_NAMESPACES` array, `frontend/src/i18n/request.ts`'s import list + `Promise.all` array + returned `messages` object, and `frontend/src/types/next-intl.d.ts`'s import + `Messages` interface. All three locales (fr/ht/en) get the same key set — `locales.test.ts` fails `pnpm test` otherwise. Haitian Creole files carry the exact `_review` note already used by every other `ht/*.json` file (see Task 4).
- Mobile-first, 375px baseline. Cards are plain and uniform — no per-card colour, no stat-tile styling (`rounded-2xl border border-border bg-card`, nothing else per card).
- Date/number formatting never hardcodes `'fr-FR'` — reuse `@/components/school/timetable/timetable-utils`'s existing pure helpers (`mondayOf`, `addDays`, `todayDay`, `weekDays`, `formatDayName`, `formatWeekRange`) and `@/lib/locales`'s `LocaleKey`/`LOCALE_BCP47`, exactly like the already-shipped admin Emploi du temps screen does. That module has no `server-only` guard — safe to import from a client component.
- `useApi<T>(path, options?)` (`frontend/src/lib/useApi.ts`) is this codebase's established client data-fetching hook (`{ data, loading, error, refresh, mutate }`) — used by every new page in this plan; do not hand-roll a `useState`/`useEffect`/`api()` fetch loop.
- Testing: Vitest, `frontend/src/test-utils/prisma-mock.ts` imported **first** in every route test file (hoists `vi.mock('@/lib/server/prisma', ...)` above the route import). UI page components in this plan get `pnpm typecheck` + `pnpm lint` + a manual dev-server check, matching this codebase's existing convention of not writing component-render tests for presentational pages (see Phase 1's Task 9/11 review outcomes) — do not introduce a new testing paradigm.

---

### Task 1: Scope the shared timetable route to teacher accounts

**Files:**
- Modify: `frontend/src/app/api/school/timetable/route.ts:41-131` (the `GET` handler only — `POST` is untouched)
- Test: `frontend/src/app/api/school/timetable/route.test.ts`

**Interfaces:**
- Consumes: `resolveMySchoolIncludingTeacher(userId): Promise<MySchool | null>` and `resolveMyTeacherProfile(userId, schoolId): Promise<MyTeacherProfile | null>`, both already exported by `frontend/src/lib/server/school.ts` (shipped in Phase 1, already unit-tested there).
- Produces: no new interface — the response shape of `GET /api/school/timetable` is unchanged. Task 9's UI calls this same endpoint.

- [ ] **Step 1: Update the test file's mocks**

In `frontend/src/app/api/school/timetable/route.test.ts`, change the `vi.mock('@/lib/server/school', ...)` block to also mock the two new imports, and add mocked-function bindings + defaults:

```ts
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return {
    ...actual,
    resolveMySchool: vi.fn(),
    resolveMySchoolIncludingTeacher: vi.fn(),
    resolveMyTeacherProfile: vi.fn(),
    resolveActiveAcademicYear: vi.fn(),
  };
});
```

Add the import and binding alongside the existing ones:

```ts
import {
  resolveMySchool,
  resolveMySchoolIncludingTeacher,
  resolveMyTeacherProfile,
  resolveActiveAcademicYear,
} from '@/lib/server/school';

const mockResolveMySchool = vi.mocked(resolveMySchool);
const mockResolveIncludingTeacher = vi.mocked(resolveMySchoolIncludingTeacher);
const mockResolveMyTeacherProfile = vi.mocked(resolveMyTeacherProfile);
const mockResolveYear = vi.mocked(resolveActiveAcademicYear);
```

In `beforeEach`, add two lines right after the existing `mockResolveMySchool.mockResolvedValue(adminSchool);` line so every existing test keeps passing unchanged (GET now reads via `resolveMySchoolIncludingTeacher`, POST still reads via `resolveMySchool`):

```ts
mockResolveIncludingTeacher.mockResolvedValue(adminSchool);
mockResolveMyTeacherProfile.mockResolvedValue(null);
```

- [ ] **Step 2: Write the two failing tests**

Add inside the existing `describe('GET /api/school/timetable', ...)` block, after the last `it(...)`:

```ts
  it('forces a teacher-linked caller to their own teacherId, ignoring ?teacherId override', async () => {
    mockResolveIncludingTeacher.mockResolvedValue(memberSchool);
    mockResolveMyTeacherProfile.mockResolvedValue({
      teacherId: 'tea_1',
      classSubjectIds: ['cs_1'],
      homeroomClassIds: [],
    });
    prismaMock.timetableSession.findMany
      .mockResolvedValueOnce([sessionRow()] as never)
      .mockResolvedValueOnce([] as never);
    prismaMock.class.findMany.mockResolvedValue([] as never);

    const res = await GET(
      req('GET', '/api/school/timetable?from=2026-08-17&to=2026-08-21&teacherId=tea_OTHER'),
    );
    expect(res.status).toBe(200);
    const where = prismaMock.timetableSession.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ teacherId: 'tea_1' });
  });

  it('a non-teacher MEMBER keeps the normal optional ?teacherId filter', async () => {
    mockResolveIncludingTeacher.mockResolvedValue(memberSchool);
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    prismaMock.timetableSession.findMany
      .mockResolvedValueOnce([sessionRow()] as never)
      .mockResolvedValueOnce([] as never);
    prismaMock.class.findMany.mockResolvedValue([] as never);

    const res = await GET(
      req('GET', '/api/school/timetable?from=2026-08-17&to=2026-08-21&teacherId=tea_2'),
    );
    expect(res.status).toBe(200);
    const where = prismaMock.timetableSession.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ teacherId: 'tea_2' });
  });
```

- [ ] **Step 3: Run the new tests to see them fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/timetable/route.test.ts`
Expected: the two new tests FAIL (GET still imports `resolveMySchool`, not `resolveMySchoolIncludingTeacher`, so `mockResolveIncludingTeacher` is never consulted and `where.teacherId` stays `undefined` or `'tea_OTHER'`/`'tea_2'` respectively — either way the `toMatchObject` assertion fails for the first test).

- [ ] **Step 4: Implement the scoping in the route**

In `frontend/src/app/api/school/timetable/route.ts`, change the import line:

```ts
import { resolveMySchool, resolveActiveAcademicYear, hasMinRole } from '@/lib/server/school';
```

to:

```ts
import {
  resolveMySchool,
  resolveMySchoolIncludingTeacher,
  resolveMyTeacherProfile,
  resolveActiveAcademicYear,
  hasMinRole,
} from '@/lib/server/school';
```

In the `GET` function, replace:

```ts
    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
```

with:

```ts
    const mySchool = await resolveMySchoolIncludingTeacher(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const myTeacher =
      mySchool.role === 'MEMBER' ? await resolveMyTeacherProfile(auth.user.sub, mySchool.schoolId) : null;
```

(`resolveMySchool`'s import stays — `POST` below still uses it unchanged.)

Then in the `prisma.timetableSession.findMany` call's `where`, replace:

```ts
          ...(parsed.data.teacherId ? { teacherId: parsed.data.teacherId } : {}),
```

with:

```ts
          ...(myTeacher
            ? { teacherId: myTeacher.teacherId }
            : parsed.data.teacherId
              ? { teacherId: parsed.data.teacherId }
              : {}),
```

- [ ] **Step 5: Run the full test file to verify everything passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/timetable/route.test.ts`
Expected: PASS, all tests including the pre-existing ones.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/school/timetable/route.ts frontend/src/app/api/school/timetable/route.test.ts
git commit -m "feat(teacher): scope timetable reads to a teacher's own sessions"
```

---

### Task 2: `GET /api/teacher/me` aggregate endpoint

**Files:**
- Create: `frontend/src/app/api/teacher/me/route.ts`
- Test: `frontend/src/app/api/teacher/me/route.test.ts`

**Interfaces:**
- Consumes: `resolveMySchoolIncludingTeacher`, `resolveMyTeacherProfile`, `resolveActiveAcademicYear` (`@/lib/server/school`); `SESSION_INCLUDE`, `serializeSession`, `seriesCounts` (`@/lib/server/timetable-route-helpers`); `mondayOf`, `addDays`, `SCHOOL_WEEK_DAYS` (`@/lib/server/attendance`).
- Produces: `GET /api/teacher/me` → `200` body:
  ```ts
  {
    teacher: { id: string; name: string; email: string | null };
    homeroomClasses: { id: string; name: string; level: string }[];
    classSubjects: {
      id: string; classId: string; className: string; classLevel: string;
      subjectId: string; subjectName: string;
    }[];
    thisWeekSessions: SerializedSession[]; // same shape /api/school/timetable already returns per session
    academicYear: { id: string; label: string } | null;
  }
  ```
  Task 6 and Task 7's pages both call this endpoint.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/teacher/me/route.test.ts`:

```ts
// GET /api/teacher/me — the Espace Enseignant home screen's one aggregate
// read. prismaMock first (auto-hoists vi.mock for '@/lib/server/prisma').
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return {
    ...actual,
    resolveMySchoolIncludingTeacher: vi.fn(),
    resolveMyTeacherProfile: vi.fn(),
    resolveActiveAcademicYear: vi.fn(),
  };
});

import { requireAuth } from '@/lib/server/middleware';
import {
  resolveMySchoolIncludingTeacher,
  resolveMyTeacherProfile,
  resolveActiveAcademicYear,
} from '@/lib/server/school';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveIncludingTeacher = vi.mocked(resolveMySchoolIncludingTeacher);
const mockResolveMyTeacherProfile = vi.mocked(resolveMyTeacherProfile);
const mockResolveYear = vi.mocked(resolveActiveAcademicYear);

const authUser = { user: { sub: 'user_1', email: 'teacher@test.local' } };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };
const groupByMock = prismaMock.timetableSession.groupBy as unknown as ReturnType<typeof vi.fn>;

function req() {
  return new NextRequest('http://localhost/api/teacher/me');
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
  mockResolveYear.mockResolvedValue({
    id: 'year_1',
    label: '2025-2026',
    startDate: new Date('2025-09-01T00:00:00.000Z'),
  });
  prismaMock.teacher.findUniqueOrThrow.mockResolvedValue({
    id: 'tea_1',
    name: 'Carline Michel',
    email: 'carline.michel@lesetoiles.edu.ht',
  } as never);
  prismaMock.class.findMany.mockResolvedValue([
    { id: 'cls_1', name: '3ème A', level: '3ème' },
  ] as never);
  prismaMock.classSubject.findMany.mockResolvedValue([
    {
      id: 'cs_1',
      classId: 'cls_1',
      class: { name: '3ème A', level: '3ème' },
      subjectId: 'sub_1',
      subject: { name: 'Mathématiques' },
    },
  ] as never);
  prismaMock.timetableSession.findMany.mockResolvedValue([]);
  groupByMock.mockResolvedValue([]);
});

describe('GET /api/teacher/me', () => {
  it('401s an unauthenticated caller', async () => {
    mockRequireAuth.mockResolvedValue(
      new Response(null, { status: 401 }) as never,
    );
    expect((await GET(req())).status).toBe(401);
  });

  it('404s a non-teacher account', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(404);
  });

  it('returns identity, homeroom classes, taught class-subjects and academic year', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.teacher).toEqual({
      id: 'tea_1',
      name: 'Carline Michel',
      email: 'carline.michel@lesetoiles.edu.ht',
    });
    expect(json.homeroomClasses).toEqual([{ id: 'cls_1', name: '3ème A', level: '3ème' }]);
    expect(json.classSubjects).toEqual([
      {
        id: 'cs_1',
        classId: 'cls_1',
        className: '3ème A',
        classLevel: '3ème',
        subjectId: 'sub_1',
        subjectName: 'Mathématiques',
      },
    ]);
    expect(json.academicYear).toEqual({ id: 'year_1', label: '2025-2026' });
    expect(json.thisWeekSessions).toEqual([]);
    const where = prismaMock.class.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ id: { in: ['cls_1'] } });
  });

  it('scopes this-week sessions to the caller’s own teacherId', async () => {
    await GET(req());
    const where = prismaMock.timetableSession.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ schoolId: 'school_1', teacherId: 'tea_1' });
  });
});
```

Note on the 401 test: the real `requireAuth` returns a `NextResponse`, but for this file's purposes any object with `.status === 401` that the route returns as-is works, since `GET` does `if (auth instanceof NextResponse) return auth;` — mocking a plain `NextResponse` import would need importing `NextResponse` from `next/server`; use that instead of a raw `Response` for type-correctness:

```ts
import { NextResponse } from 'next/server';
// ...
mockRequireAuth.mockResolvedValue(NextResponse.json({ error: 'Missing token' }, { status: 401 }));
```

- [ ] **Step 2: Run the test file to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/teacher/me/route.test.ts`
Expected: FAIL — `./route` does not exist yet.

- [ ] **Step 3: Implement the route**

Create `frontend/src/app/api/teacher/me/route.ts`:

```ts
// GET /api/teacher/me — the Espace Enseignant home screen's one aggregate
// read: this teacher's identity, homeroom classes, taught ClassSubjects
// (with class/subject names), this week's timetable sessions, and the
// active academic year. One round trip avoids a phone-network waterfall of
// separate admin-shaped list endpoints. Teacher-linked accounts only — any
// other account gets 404 (not-found-for-you, matching every other
// ownership-scoped route in this app). See
// docs/superpowers/specs/2026-08-30-espace-enseignant-design.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import {
  resolveMySchoolIncludingTeacher,
  resolveMyTeacherProfile,
  resolveActiveAcademicYear,
} from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { mondayOf, addDays, SCHOOL_WEEK_DAYS } from '@/lib/server/attendance';
import {
  SESSION_INCLUDE,
  serializeSession,
  seriesCounts,
  type SerializedSession,
} from '@/lib/server/timetable-route-helpers';

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

    const [teacher, homeroomClasses, classSubjects, activeYear] = await Promise.all([
      prisma.teacher.findUniqueOrThrow({
        where: { id: myTeacher.teacherId },
        select: { id: true, name: true, email: true },
      }),
      prisma.class.findMany({
        where: { id: { in: myTeacher.homeroomClassIds } },
        select: { id: true, name: true, level: true },
        orderBy: { name: 'asc' },
      }),
      prisma.classSubject.findMany({
        where: { id: { in: myTeacher.classSubjectIds } },
        select: {
          id: true,
          classId: true,
          class: { select: { name: true, level: true } },
          subjectId: true,
          subject: { select: { name: true } },
        },
        orderBy: { class: { name: 'asc' } },
      }),
      resolveActiveAcademicYear(mySchool.schoolId),
    ]);

    let thisWeekSessions: SerializedSession[] = [];
    if (activeYear) {
      const from = mondayOf(new Date());
      const to = addDays(from, SCHOOL_WEEK_DAYS - 1);
      const rows = await prisma.timetableSession.findMany({
        where: {
          schoolId: mySchool.schoolId,
          academicYearId: activeYear.id,
          teacherId: myTeacher.teacherId,
          date: { gte: from, lte: to },
        },
        orderBy: [{ date: 'asc' }, { startMinutes: 'asc' }],
        include: SESSION_INCLUDE,
      });
      const counts = await seriesCounts(prisma, rows);
      thisWeekSessions = rows.map((s) => serializeSession(s, s.seriesId ? counts.get(s.seriesId) : 1));
    }

    return NextResponse.json(
      {
        teacher,
        homeroomClasses,
        classSubjects: classSubjects.map((cs) => ({
          id: cs.id,
          classId: cs.classId,
          className: cs.class.name,
          classLevel: cs.class.level,
          subjectId: cs.subjectId,
          subjectName: cs.subject.name,
        })),
        thisWeekSessions,
        academicYear: activeYear ? { id: activeYear.id, label: activeYear.label } : null,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run the test file to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/teacher/me/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/teacher/me
git commit -m "feat(teacher): add GET /api/teacher/me aggregate endpoint"
```

---

### Task 3: Roster endpoints (taught class-subject + homeroom class)

**Files:**
- Create: `frontend/src/app/api/teacher/classes/[classSubjectId]/route.ts`
- Create: `frontend/src/app/api/teacher/classes/homeroom/[classId]/route.ts`
- Test: `frontend/src/app/api/teacher/classes/[classSubjectId]/route.test.ts`
- Test: `frontend/src/app/api/teacher/classes/homeroom/[classId]/route.test.ts`

**Interfaces:**
- Consumes: `resolveMySchoolIncludingTeacher`, `resolveMyTeacherProfile` (`@/lib/server/school`).
- Produces:
  - `GET /api/teacher/classes/[classSubjectId]` → `200`:
    ```ts
    {
      classSubject: { id: string; classId: string; className: string; classLevel: string; subjectId: string; subjectName: string };
      students: { id: string; firstName: string; lastName: string; studentNumber: string }[];
    }
    ```
    or `404 { error: 'NOT_FOUND', message: 'Not found' }` when `classSubjectId` isn't one of the caller's own.
  - `GET /api/teacher/classes/homeroom/[classId]` → `200`:
    ```ts
    {
      class: { id: string; name: string; level: string };
      students: { id: string; firstName: string; lastName: string; studentNumber: string }[];
    }
    ```
    same 404 convention.
  Both consumed by Task 8's pages. Next.js resolves the static `homeroom` segment ahead of the sibling `[classSubjectId]` dynamic segment at the same directory depth, so the two routes never collide.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/teacher/classes/[classSubjectId]/route.test.ts`:

```ts
// GET /api/teacher/classes/[classSubjectId] — roster of a taught
// class-subject. prismaMock first (auto-hoists vi.mock for
// '@/lib/server/prisma').
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchoolIncludingTeacher: vi.fn(), resolveMyTeacherProfile: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveIncludingTeacher = vi.mocked(resolveMySchoolIncludingTeacher);
const mockResolveMyTeacherProfile = vi.mocked(resolveMyTeacherProfile);

const authUser = { user: { sub: 'user_1', email: 'teacher@test.local' } };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };
const params = (classSubjectId: string) => ({ params: Promise.resolve({ classSubjectId }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveIncludingTeacher.mockResolvedValue(memberSchool);
  mockResolveMyTeacherProfile.mockResolvedValue({
    teacherId: 'tea_1',
    classSubjectIds: ['cs_1'],
    homeroomClassIds: [],
  });
  prismaMock.classSubject.findUniqueOrThrow.mockResolvedValue({
    id: 'cs_1',
    classId: 'cls_1',
    class: { id: 'cls_1', name: '3ème A', level: '3ème', academicYearId: 'year_1' },
    subjectId: 'sub_1',
    subject: { id: 'sub_1', name: 'Mathématiques' },
  } as never);
  prismaMock.enrollment.findMany.mockResolvedValue([
    {
      student: { id: 'stu_1', firstName: 'Jean', lastName: 'Baptiste', studentNumber: 'EL-2024-001' },
    },
  ] as never);
});

describe('GET /api/teacher/classes/[classSubjectId]', () => {
  it('404s a class-subject that is not this teacher’s own', async () => {
    const res = await GET(new NextRequest('http://localhost/x'), params('cs_OTHER'));
    expect(res.status).toBe(404);
  });

  it('404s a non-teacher account', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/x'), params('cs_1'));
    expect(res.status).toBe(404);
  });

  it('returns the class-subject header and roster for the caller’s own class-subject', async () => {
    const res = await GET(new NextRequest('http://localhost/x'), params('cs_1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.classSubject).toEqual({
      id: 'cs_1',
      classId: 'cls_1',
      className: '3ème A',
      classLevel: '3ème',
      subjectId: 'sub_1',
      subjectName: 'Mathématiques',
    });
    expect(json.students).toEqual([
      { id: 'stu_1', firstName: 'Jean', lastName: 'Baptiste', studentNumber: 'EL-2024-001' },
    ]);
    const where = prismaMock.enrollment.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ classId: 'cls_1', academicYearId: 'year_1' });
  });
});
```

Create `frontend/src/app/api/teacher/classes/homeroom/[classId]/route.test.ts` following the exact same shape, substituting `classId`/`resolveMyTeacherProfile`'s `homeroomClassIds: ['cls_1']` (empty `classSubjectIds`), `prismaMock.class.findUniqueOrThrow` instead of `classSubject.findUniqueOrThrow` (resolving `{ id: 'cls_1', name: '3ème A', level: '3ème', academicYearId: 'year_1' }`), and asserting `json.class` instead of `json.classSubject`:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchoolIncludingTeacher: vi.fn(), resolveMyTeacherProfile: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveIncludingTeacher = vi.mocked(resolveMySchoolIncludingTeacher);
const mockResolveMyTeacherProfile = vi.mocked(resolveMyTeacherProfile);

const authUser = { user: { sub: 'user_1', email: 'teacher@test.local' } };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };
const params = (classId: string) => ({ params: Promise.resolve({ classId }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveIncludingTeacher.mockResolvedValue(memberSchool);
  mockResolveMyTeacherProfile.mockResolvedValue({
    teacherId: 'tea_1',
    classSubjectIds: [],
    homeroomClassIds: ['cls_1'],
  });
  prismaMock.class.findUniqueOrThrow.mockResolvedValue({
    id: 'cls_1',
    name: '3ème A',
    level: '3ème',
    academicYearId: 'year_1',
  } as never);
  prismaMock.enrollment.findMany.mockResolvedValue([
    {
      student: { id: 'stu_1', firstName: 'Jean', lastName: 'Baptiste', studentNumber: 'EL-2024-001' },
    },
  ] as never);
});

describe('GET /api/teacher/classes/homeroom/[classId]', () => {
  it('404s a class that is not this teacher’s own homeroom', async () => {
    const res = await GET(new NextRequest('http://localhost/x'), params('cls_OTHER'));
    expect(res.status).toBe(404);
  });

  it('404s a non-teacher account', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/x'), params('cls_1'));
    expect(res.status).toBe(404);
  });

  it('returns the class header and roster for the caller’s own homeroom class', async () => {
    const res = await GET(new NextRequest('http://localhost/x'), params('cls_1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.class).toEqual({ id: 'cls_1', name: '3ème A', level: '3ème' });
    expect(json.students).toEqual([
      { id: 'stu_1', firstName: 'Jean', lastName: 'Baptiste', studentNumber: 'EL-2024-001' },
    ]);
  });
});
```

- [ ] **Step 2: Run both test files to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/teacher/classes`
Expected: FAIL — neither `./route` exists yet.

- [ ] **Step 3: Implement `frontend/src/app/api/teacher/classes/[classSubjectId]/route.ts`**

```ts
// GET /api/teacher/classes/[classSubjectId] — roster (via Enrollment, the
// class's own AcademicYear) of a class-subject this teacher is assigned to,
// plus the class/subject names for the page header. 404s (not found for
// you, not 403) when classSubjectId isn't one of this teacher's own
// assignments — same non-leaking convention as every other ownership-scoped
// route in this app.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ classSubjectId: string }> },
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
    const { classSubjectId } = await params;
    if (!myTeacher || !myTeacher.classSubjectIds.includes(classSubjectId)) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const classSubject = await prisma.classSubject.findUniqueOrThrow({
      where: { id: classSubjectId },
      select: {
        id: true,
        classId: true,
        class: { select: { id: true, name: true, level: true, academicYearId: true } },
        subjectId: true,
        subject: { select: { id: true, name: true } },
      },
    });

    const enrollments = await prisma.enrollment.findMany({
      where: { classId: classSubject.classId, academicYearId: classSubject.class.academicYearId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, studentNumber: true } },
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });

    return NextResponse.json(
      {
        classSubject: {
          id: classSubject.id,
          classId: classSubject.classId,
          className: classSubject.class.name,
          classLevel: classSubject.class.level,
          subjectId: classSubject.subjectId,
          subjectName: classSubject.subject.name,
        },
        students: enrollments.map((e) => e.student),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Implement `frontend/src/app/api/teacher/classes/homeroom/[classId]/route.ts`**

```ts
// GET /api/teacher/classes/homeroom/[classId] — roster of a class this
// teacher is titulaire (homeroom teacher) of. Separate route from
// [classSubjectId] because a homeroom relationship is keyed by Class, not
// ClassSubject — a titulaire is not necessarily also a subject teacher in
// their own homeroom class. Same 404-not-403 ownership convention.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
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
    const { classId } = await params;
    if (!myTeacher || !myTeacher.homeroomClassIds.includes(classId)) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const cls = await prisma.class.findUniqueOrThrow({
      where: { id: classId },
      select: { id: true, name: true, level: true, academicYearId: true },
    });

    const enrollments = await prisma.enrollment.findMany({
      where: { classId: cls.id, academicYearId: cls.academicYearId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, studentNumber: true } },
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });

    return NextResponse.json(
      {
        class: { id: cls.id, name: cls.name, level: cls.level },
        students: enrollments.map((e) => e.student),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 5: Run both test files to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/teacher/classes`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/teacher/classes
git commit -m "feat(teacher): add class-subject and homeroom roster endpoints"
```

---

### Task 4: i18n scaffolding — `teacherClasses`, `teacherTimetable`, extend `teacherPortal`

**Files:**
- Create: `frontend/src/messages/{fr,ht,en}/teacherClasses.json`
- Create: `frontend/src/messages/{fr,ht,en}/teacherTimetable.json`
- Modify: `frontend/src/messages/{fr,ht,en}/teacherPortal.json`
- Modify: `frontend/src/lib/locales.ts` (`MESSAGE_NAMESPACES` array)
- Modify: `frontend/src/i18n/request.ts` (import list, `Promise.all` array, returned `messages` object)
- Modify: `frontend/src/types/next-intl.d.ts` (import, `Messages` interface)

**Interfaces:**
- Produces: three next-intl namespaces — `TeacherPortal` (extended), `TeacherClasses` (new), `TeacherTimetable` (new) — consumed by Tasks 5-9's components via `useTranslations('TeacherPortal')` / `useTranslations('TeacherClasses')` / `useTranslations('TeacherTimetable')`.

- [ ] **Step 1: Replace `frontend/src/messages/fr/teacherPortal.json`**

```json
{
  "title": "Espace enseignant",
  "welcome": "Bienvenue, {name}",
  "logout": "Se déconnecter",
  "loadError": "Impossible de charger vos informations pour le moment.",
  "nav": {
    "ariaLabel": "Navigation principale",
    "home": "Accueil",
    "classes": "Classes",
    "timetable": "Emploi du temps"
  },
  "home": {
    "thisWeek": "Cette semaine",
    "noSessions": "Aucun cours prévu cette semaine.",
    "myClasses": "Mes classes",
    "viewTimetable": "Voir l'emploi du temps"
  }
}
```

- [ ] **Step 2: Replace `frontend/src/messages/en/teacherPortal.json`**

```json
{
  "title": "Teacher space",
  "welcome": "Welcome, {name}",
  "logout": "Log out",
  "loadError": "We could not load your information right now.",
  "nav": {
    "ariaLabel": "Main navigation",
    "home": "Home",
    "classes": "Classes",
    "timetable": "Timetable"
  },
  "home": {
    "thisWeek": "This week",
    "noSessions": "No classes scheduled this week.",
    "myClasses": "My classes",
    "viewTimetable": "View timetable"
  }
}
```

- [ ] **Step 3: Replace `frontend/src/messages/ht/teacherPortal.json`**

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "title": "Espas anseyan",
  "welcome": "Byenveni, {name}",
  "logout": "Dekonekte",
  "loadError": "Nou pa t kapab chaje enfòmasyon w yo kounye a.",
  "nav": {
    "ariaLabel": "Navigasyon prensipal",
    "home": "Akèy",
    "classes": "Klas",
    "timetable": "Orè"
  },
  "home": {
    "thisWeek": "Semèn sa a",
    "noSessions": "Pa gen kou pwograme semèn sa a.",
    "myClasses": "Klas mwen yo",
    "viewTimetable": "Gade orè a"
  }
}
```

- [ ] **Step 4: Create `frontend/src/messages/fr/teacherClasses.json`**

```json
{
  "title": "Mes classes",
  "mySubjects": "Mes matières",
  "myHomerooms": "Classe dont je suis titulaire",
  "noSubjects": "Aucune matière ne vous est encore assignée.",
  "noHomerooms": "Vous n'êtes titulaire d'aucune classe.",
  "plural": {
    "students": {
      "one": "{count} élève",
      "other": "{count} élèves"
    }
  },
  "roster": {
    "back": "Retour à mes classes",
    "noStudents": "Aucun élève inscrit dans cette classe.",
    "studentNumber": "N° {number}"
  }
}
```

- [ ] **Step 5: Create `frontend/src/messages/en/teacherClasses.json`**

```json
{
  "title": "My classes",
  "mySubjects": "My subjects",
  "myHomerooms": "Homeroom class",
  "noSubjects": "No subject has been assigned to you yet.",
  "noHomerooms": "You are not the homeroom teacher of any class.",
  "plural": {
    "students": {
      "one": "{count} student",
      "other": "{count} students"
    }
  },
  "roster": {
    "back": "Back to my classes",
    "noStudents": "No student enrolled in this class.",
    "studentNumber": "No. {number}"
  }
}
```

- [ ] **Step 6: Create `frontend/src/messages/ht/teacherClasses.json`**

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "title": "Klas mwen yo",
  "mySubjects": "Matyè mwen yo",
  "myHomerooms": "Klas mwen se titilè a",
  "noSubjects": "Poko gen matyè ki asiyen pou ou.",
  "noHomerooms": "Ou pa titilè okenn klas.",
  "plural": {
    "students": {
      "one": "{count} elèv",
      "other": "{count} elèv"
    }
  },
  "roster": {
    "back": "Tounen nan klas mwen yo",
    "noStudents": "Pa gen elèv enskri nan klas sa a.",
    "studentNumber": "N° {number}"
  }
}
```

- [ ] **Step 7: Create `frontend/src/messages/fr/teacherTimetable.json`**

```json
{
  "title": "Emploi du temps",
  "previousWeek": "Semaine précédente",
  "nextWeek": "Semaine suivante",
  "today": "Aujourd'hui",
  "noSessions": "Aucun cours ce jour.",
  "room": "Salle : {room}",
  "noRoom": "Salle non précisée"
}
```

- [ ] **Step 8: Create `frontend/src/messages/en/teacherTimetable.json`**

```json
{
  "title": "Timetable",
  "previousWeek": "Previous week",
  "nextWeek": "Next week",
  "today": "Today",
  "noSessions": "No classes this day.",
  "room": "Room: {room}",
  "noRoom": "No room set"
}
```

- [ ] **Step 9: Create `frontend/src/messages/ht/teacherTimetable.json`**

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman. À faire relire par un locuteur natif avant mise en production.",
  "title": "Orè",
  "previousWeek": "Semèn anvan",
  "nextWeek": "Semèn apre",
  "today": "Jodi a",
  "noSessions": "Pa gen kou jou sa a.",
  "room": "Sal: {room}",
  "noRoom": "Sal pa presize"
}
```

- [ ] **Step 10: Register the two new namespaces in `frontend/src/lib/locales.ts`**

In the `MESSAGE_NAMESPACES` array, change:

```ts
  'setPassword',
  'teacherPortal',
] as const;
```

to:

```ts
  'setPassword',
  'teacherPortal',
  'teacherClasses',
  'teacherTimetable',
] as const;
```

- [ ] **Step 11: Wire them into `frontend/src/i18n/request.ts`**

Add `teacherClasses` and `teacherTimetable` to the destructured array and the `Promise.all` array, right after `teacherPortal`:

```ts
    teacherPortal,
    teacherClasses,
    teacherTimetable,
  ] = await Promise.all([
    // ...
    import(`../messages/${locale}/teacherPortal.json`),
    import(`../messages/${locale}/teacherClasses.json`),
    import(`../messages/${locale}/teacherTimetable.json`),
  ]);
```

And to the returned `messages` object:

```ts
      TeacherPortal: teacherPortal.default,
      TeacherClasses: teacherClasses.default,
      TeacherTimetable: teacherTimetable.default,
```

- [ ] **Step 12: Wire them into `frontend/src/types/next-intl.d.ts`**

Add imports after the `teacherPortal` one:

```ts
import type teacherPortal from '@/messages/fr/teacherPortal.json';
import type teacherClasses from '@/messages/fr/teacherClasses.json';
import type teacherTimetable from '@/messages/fr/teacherTimetable.json';
```

And to the `Messages` interface, after `TeacherPortal`:

```ts
      TeacherPortal: typeof teacherPortal;
      TeacherClasses: typeof teacherClasses;
      TeacherTimetable: typeof teacherTimetable;
```

- [ ] **Step 13: Run the locale consistency test and typecheck**

Run: `pnpm --filter frontend exec vitest run src/lib/locales.test.ts`
Expected: PASS (all three locales now have matching key sets for `teacherPortal`, `teacherClasses`, `teacherTimetable`, and `MESSAGE_NAMESPACES` matches the files on disk).

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add frontend/src/messages/fr/teacherPortal.json frontend/src/messages/en/teacherPortal.json frontend/src/messages/ht/teacherPortal.json \
  frontend/src/messages/fr/teacherClasses.json frontend/src/messages/en/teacherClasses.json frontend/src/messages/ht/teacherClasses.json \
  frontend/src/messages/fr/teacherTimetable.json frontend/src/messages/en/teacherTimetable.json frontend/src/messages/ht/teacherTimetable.json \
  frontend/src/lib/locales.ts frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts
git commit -m "feat(i18n): add teacherClasses/teacherTimetable namespaces, extend teacherPortal"
```

---

### Task 5: Teacher bottom tab bar

**Files:**
- Create: `frontend/src/components/layout/teacher/TeacherBottomNav.tsx`
- Modify: `frontend/src/components/layout/sidebar/route-match.ts` (the `isActiveRoute` exact-match list)
- Modify: `frontend/src/components/layout/sidebar/route-match.test.ts`
- Modify: `frontend/src/app/(teacher)/espace-enseignant/layout.tsx`

**Interfaces:**
- Consumes: `isActiveRoute(pathname, href): boolean` (`@/components/layout/sidebar/route-match`, existing, generic — used by the admin `MobileBottomNav` too).
- Produces: `<TeacherBottomNav />`, a client component with no props, rendered by the teacher layout. Adds bottom padding so page content never sits under the fixed bar.

- [ ] **Step 1: Write the failing test for the new exact-match route**

In `frontend/src/components/layout/sidebar/route-match.test.ts`, find the test(s) covering `/dashboard`/`/admin` exact-match behavior and add a sibling case:

```ts
  it('treats /espace-enseignant as exact-match only (not a prefix of its own subpages)', () => {
    expect(isActiveRoute('/espace-enseignant', '/espace-enseignant')).toBe(true);
    expect(isActiveRoute('/espace-enseignant/classes', '/espace-enseignant')).toBe(false);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/components/layout/sidebar/route-match.test.ts`
Expected: FAIL — `/espace-enseignant/classes` currently matches `/espace-enseignant` via the `startsWith` fallback.

- [ ] **Step 3: Add `/espace-enseignant` to the exact-match list**

In `frontend/src/components/layout/sidebar/route-match.ts`, change:

```ts
  if (path === '/dashboard' || path === '/admin') return pathname === path;
```

to:

```ts
  if (path === '/dashboard' || path === '/admin' || path === '/espace-enseignant') return pathname === path;
```

- [ ] **Step 4: Run the test file to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/components/layout/sidebar/route-match.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `TeacherBottomNav`**

Create `frontend/src/components/layout/teacher/TeacherBottomNav.tsx`:

```tsx
'use client';

// Teacher portal's own fixed bottom tab bar — deliberately not a reuse of
// the admin MobileBottomNav (that one's 4 links and "Plus" drawer are
// admin-shaped). Phase 2 ships 3 real destinations; Phase 3/4 extend
// LINK_DEFS with Notes/Appréciations/Présences per
// docs/superpowers/specs/2026-08-30-espace-enseignant-design.md's final
// 5-tab shell design.
import { Home, Users, CalendarDays, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActiveRoute } from '../sidebar/route-match';

interface TeacherNavLink {
  key: 'home' | 'classes' | 'timetable';
  href: string;
  icon: LucideIcon;
}

const LINK_DEFS: TeacherNavLink[] = [
  { key: 'home', href: '/espace-enseignant', icon: Home },
  { key: 'classes', href: '/espace-enseignant/classes', icon: Users },
  { key: 'timetable', href: '/espace-enseignant/emploi-du-temps', icon: CalendarDays },
];

export function TeacherBottomNav() {
  const t = useTranslations('TeacherPortal.nav');
  const pathname = usePathname();

  return (
    <nav
      aria-label={t('ariaLabel')}
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
    >
      {LINK_DEFS.map((item) => {
        const active = isActiveRoute(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 ${
              active ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 2} />
            <span className={`text-[10px] ${active ? 'font-semibold' : 'font-medium'}`}>
              {t(item.key)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 6: Wire it into the teacher layout**

In `frontend/src/app/(teacher)/espace-enseignant/layout.tsx`, add the import:

```ts
import { TeacherBottomNav } from '@/components/layout/teacher/TeacherBottomNav';
```

Change the outer wrapper's bottom padding so content clears the fixed bar, and render the bar after `{children}`:

```tsx
    <div className="mx-auto min-h-screen max-w-lg px-4 py-6 pb-24">
      <header className="mb-4 flex items-center justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={async () => {
            await logout();
            router.replace('/login');
          }}
        >
          <LogOut size={14} />
          {t('logout')}
        </Button>
      </header>
      {children}
      <TeacherBottomNav />
    </div>
```

(Only the wrapper `<div>`'s className and the added `<TeacherBottomNav />` line change — everything else in the file is untouched.)

- [ ] **Step 7: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/layout/teacher/TeacherBottomNav.tsx \
  frontend/src/components/layout/sidebar/route-match.ts \
  frontend/src/components/layout/sidebar/route-match.test.ts \
  "frontend/src/app/(teacher)/espace-enseignant/layout.tsx"
git commit -m "feat(teacher): add teacher portal bottom tab bar"
```

---

### Task 6: Enrich the Accueil (home) page with real data

**Files:**
- Modify: `frontend/src/app/(teacher)/espace-enseignant/page.tsx` (full rewrite of the existing bare page)

**Interfaces:**
- Consumes: `GET /api/teacher/me` (Task 2); `TeacherPortal` namespace (Task 4); `useApi` (`@/lib/useApi`).

- [ ] **Step 1: Replace the page**

Replace the full contents of `frontend/src/app/(teacher)/espace-enseignant/page.tsx`:

```tsx
'use client';

import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { format } from 'date-fns';
import { enUS, fr, type Locale } from 'date-fns/locale';
import { useUser } from '@/contexts/AuthContext';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import type { LocaleKey } from '@/lib/locales';

// 'ht' has no distinct date-formatting convention in wide practical use —
// maps to French, mirroring locales.ts's LOCALE_BCP47 and the admin
// Emploi du temps module's own CALENDAR_LOCALE.
const CALENDAR_LOCALE: Record<LocaleKey, Locale> = { fr, ht: fr, en: enUS };

function minutesToHHMM(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

interface TeacherMeResponse {
  thisWeekSessions: {
    id: string;
    date: string;
    startMinutes: number;
    endMinutes: number;
    class: { name: string };
    subject: { name: string };
  }[];
}

export default function EspaceEnseignantHomePage() {
  const t = useTranslations('TeacherPortal');
  const locale = useLocale() as LocaleKey;
  const user = useUser();
  const { data, loading, error } = useApi<TeacherMeResponse>('/api/teacher/me');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('welcome', { name: user?.name ?? user?.email ?? '' })}
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{t('loadError')}</p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-foreground">{t('home.thisWeek')}</h2>
            {data!.thisWeekSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('home.noSessions')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {data!.thisWeekSessions.map((s) => (
                  <Card key={s.id} className="gap-1 p-3.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      {format(new Date(`${s.date}T00:00:00`), 'EEEE d MMMM', {
                        locale: CALENDAR_LOCALE[locale],
                      })}
                      {' · '}
                      {minutesToHHMM(s.startMinutes)}-{minutesToHHMM(s.endMinutes)}
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {s.subject.name} · {s.class.name}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <Link
            href="/espace-enseignant/classes"
            className="rounded-2xl border border-border bg-card p-3.5 text-sm font-semibold text-foreground"
          >
            {t('home.myClasses')}
          </Link>
          <Link
            href="/espace-enseignant/emploi-du-temps"
            className="rounded-2xl border border-border bg-card p-3.5 text-sm font-semibold text-foreground"
          >
            {t('home.viewTimetable')}
          </Link>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Manual dev-server check**

Run `pnpm dev`, log in as the seeded teacher account (`carline.michel@lesetoiles.edu.ht` / `TeacherTest2026!`, or invite+accept a fresh one), open `/espace-enseignant` at a 375px viewport width. Confirm: the welcome header renders, this week's sessions list (or the empty state) renders, both quick-link cards navigate correctly, no horizontal scroll.

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(teacher)/espace-enseignant/page.tsx"
git commit -m "feat(teacher): show this week's sessions and quick links on Accueil"
```

---

### Task 7: Mes classes list page

**Files:**
- Create: `frontend/src/app/(teacher)/espace-enseignant/classes/page.tsx`

**Interfaces:**
- Consumes: `GET /api/teacher/me` (Task 2); `TeacherClasses` + `TeacherPortal` namespaces (Task 4); `useApi`.
- Produces: links into `/espace-enseignant/classes/[classSubjectId]` and `/espace-enseignant/classes/homeroom/[classId]`, both built by Task 8.

- [ ] **Step 1: Create the page**

Create `frontend/src/app/(teacher)/espace-enseignant/classes/page.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

interface TeacherClassesResponse {
  homeroomClasses: { id: string; name: string; level: string }[];
  classSubjects: { id: string; className: string; classLevel: string; subjectName: string }[];
}

export default function EspaceEnseignantClassesPage() {
  const t = useTranslations('TeacherClasses');
  const tPortal = useTranslations('TeacherPortal');
  const { data, loading, error } = useApi<TeacherClassesResponse>('/api/teacher/me');

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{tPortal('loadError')}</p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-foreground">{t('myHomerooms')}</h2>
            {data!.homeroomClasses.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noHomerooms')}</p>
            ) : (
              data!.homeroomClasses.map((c) => (
                <Link key={c.id} href={`/espace-enseignant/classes/homeroom/${c.id}`}>
                  <Card className="p-3.5">
                    <p className="text-sm font-semibold text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.level}</p>
                  </Card>
                </Link>
              ))
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-foreground">{t('mySubjects')}</h2>
            {data!.classSubjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noSubjects')}</p>
            ) : (
              data!.classSubjects.map((cs) => (
                <Link key={cs.id} href={`/espace-enseignant/classes/${cs.id}`}>
                  <Card className="p-3.5">
                    <p className="text-sm font-semibold text-foreground">{cs.subjectName}</p>
                    <p className="text-xs text-muted-foreground">
                      {cs.className} · {cs.classLevel}
                    </p>
                  </Card>
                </Link>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Manual dev-server check**

At 375px, open `/espace-enseignant/classes` as the seeded teacher. Confirm both sections render (or their empty states), cards are uniform (no per-card colour), and each card is a tappable link.

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(teacher)/espace-enseignant/classes/page.tsx"
git commit -m "feat(teacher): add Mes classes list page"
```

---

### Task 8: Roster detail pages

**Files:**
- Create: `frontend/src/app/(teacher)/espace-enseignant/classes/[classSubjectId]/page.tsx`
- Create: `frontend/src/app/(teacher)/espace-enseignant/classes/homeroom/[classId]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/teacher/classes/[classSubjectId]` and `GET /api/teacher/classes/homeroom/[classId]` (Task 3); `TeacherClasses` + `TeacherPortal` namespaces (Task 4); `useApi`; `useParams` (`next/navigation`, this codebase's established way for a client page to read dynamic route params — see `frontend/src/app/(school)/eleves/[id]/page.tsx:74`).

- [ ] **Step 1: Create the class-subject roster page**

Create `frontend/src/app/(teacher)/espace-enseignant/classes/[classSubjectId]/page.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

interface RosterResponse {
  classSubject: { id: string; className: string; classLevel: string; subjectName: string };
  students: { id: string; firstName: string; lastName: string; studentNumber: string }[];
}

export default function ClassSubjectRosterPage() {
  const { classSubjectId } = useParams<{ classSubjectId: string }>();
  const t = useTranslations('TeacherClasses');
  const tPortal = useTranslations('TeacherPortal');
  const { data, loading, error } = useApi<RosterResponse>(`/api/teacher/classes/${classSubjectId}`);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/espace-enseignant/classes"
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft size={16} />
        {t('roster.back')}
      </Link>

      {loading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : error ? (
        <p className="text-sm text-destructive">{tPortal('loadError')}</p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-bold text-foreground">{data!.classSubject.subjectName}</h1>
            <p className="text-sm text-muted-foreground">
              {data!.classSubject.className} · {data!.classSubject.classLevel}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(data!.students.length === 1 ? 'plural.students.one' : 'plural.students.other', {
                count: data!.students.length,
              })}
            </p>
          </div>

          {data!.students.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('roster.noStudents')}</p>
          ) : (
            <Card className="divide-y divide-border p-0">
              {data!.students.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-3.5 py-3">
                  <span className="text-sm font-medium text-foreground">
                    {s.firstName} {s.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t('roster.studentNumber', { number: s.studentNumber })}
                  </span>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the homeroom roster page**

Create `frontend/src/app/(teacher)/espace-enseignant/classes/homeroom/[classId]/page.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

interface HomeroomRosterResponse {
  class: { id: string; name: string; level: string };
  students: { id: string; firstName: string; lastName: string; studentNumber: string }[];
}

export default function HomeroomRosterPage() {
  const { classId } = useParams<{ classId: string }>();
  const t = useTranslations('TeacherClasses');
  const tPortal = useTranslations('TeacherPortal');
  const { data, loading, error } = useApi<HomeroomRosterResponse>(
    `/api/teacher/classes/homeroom/${classId}`,
  );

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/espace-enseignant/classes"
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft size={16} />
        {t('roster.back')}
      </Link>

      {loading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : error ? (
        <p className="text-sm text-destructive">{tPortal('loadError')}</p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-bold text-foreground">{data!.class.name}</h1>
            <p className="text-sm text-muted-foreground">{data!.class.level}</p>
            <p className="text-xs text-muted-foreground">
              {t(data!.students.length === 1 ? 'plural.students.one' : 'plural.students.other', {
                count: data!.students.length,
              })}
            </p>
          </div>

          {data!.students.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('roster.noStudents')}</p>
          ) : (
            <Card className="divide-y divide-border p-0">
              {data!.students.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-3.5 py-3">
                  <span className="text-sm font-medium text-foreground">
                    {s.firstName} {s.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t('roster.studentNumber', { number: s.studentNumber })}
                  </span>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Manual dev-server check**

From `/espace-enseignant/classes`, tap into one taught subject and one homeroom class (seed a homeroom assignment first if the seeded teacher has none). Confirm the roster renders, the student count pluralizes correctly at 0/1/2+ students, the empty state shows for a class with no enrollments, and "Retour" navigates back.

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/(teacher)/espace-enseignant/classes/[classSubjectId]/page.tsx" \
  "frontend/src/app/(teacher)/espace-enseignant/classes/homeroom/[classId]/page.tsx"
git commit -m "feat(teacher): add class-subject and homeroom roster pages"
```

---

### Task 9: Emploi du temps read-only weekly view

**Files:**
- Create: `frontend/src/app/(teacher)/espace-enseignant/emploi-du-temps/page.tsx`

**Interfaces:**
- Consumes: `GET /api/school/timetable?from=&to=` (Task 1's teacher-scoped version); `TeacherTimetable` + `TeacherPortal` namespaces (Task 4); `useApi`; pure date helpers `addDays`, `formatDayName`, `formatWeekRange`, `mondayOf`, `todayDay`, `weekDays` from `@/components/school/timetable/timetable-utils` (existing, not `server-only` — safe from a client component).

- [ ] **Step 1: Create the page**

Create `frontend/src/app/(teacher)/espace-enseignant/emploi-du-temps/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import {
  addDays,
  formatDayName,
  formatWeekRange,
  mondayOf,
  todayDay,
  weekDays,
} from '@/components/school/timetable/timetable-utils';
import type { LocaleKey } from '@/lib/locales';

interface TimetableResponse {
  sessions: {
    id: string;
    date: string;
    startMinutes: number;
    endMinutes: number;
    room: string | null;
    class: { name: string };
    subject: { name: string };
  }[];
}

function minutesToHHMM(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export default function EspaceEnseignantTimetablePage() {
  const t = useTranslations('TeacherTimetable');
  const tPortal = useTranslations('TeacherPortal');
  const locale = useLocale() as LocaleKey;
  const [anchor, setAnchor] = useState(() => mondayOf(todayDay()));
  const days = weekDays(anchor);
  const { data, loading, error } = useApi<TimetableResponse>(
    `/api/school/timetable?from=${days[0]}&to=${days[days.length - 1]}`,
  );

  const sessionsByDay = new Map<string, TimetableResponse['sessions']>();
  for (const day of days) sessionsByDay.set(day, []);
  for (const s of data?.sessions ?? []) {
    sessionsByDay.get(s.date)?.push(s);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t('previousWeek')}
          onClick={() => setAnchor((a) => addDays(a, -7))}
        >
          <ChevronLeft size={18} />
        </Button>
        <span className="text-sm font-medium text-foreground">{formatWeekRange(days, locale)}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t('nextWeek')}
          onClick={() => setAnchor((a) => addDays(a, 7))}
        >
          <ChevronRight size={18} />
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{tPortal('loadError')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {days.map((day) => (
            <section key={day} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                {formatDayName(day, locale)}
                {day === todayDay() ? ` · ${t('today')}` : ''}
              </h2>
              {sessionsByDay.get(day)!.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('noSessions')}</p>
              ) : (
                sessionsByDay.get(day)!.map((s) => (
                  <Card key={s.id} className="gap-1 p-3.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      {minutesToHHMM(s.startMinutes)}-{minutesToHHMM(s.endMinutes)}
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {s.subject.name} · {s.class.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.room ? t('room', { room: s.room }) : t('noRoom')}
                    </p>
                  </Card>
                ))
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Manual dev-server check**

At 375px, open `/espace-enseignant/emploi-du-temps` as the seeded teacher. Confirm: the current week's Mon-Fri sections render with only that teacher's own sessions (cross-check against the admin Emploi du temps page filtered to the same teacher), previous/next week navigation works, and a `?teacherId=` query string cannot be attached from this page (there is no such control) — the scoping guarantee comes from Task 1's backend change, not from UI omission alone.

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(teacher)/espace-enseignant/emploi-du-temps/page.tsx"
git commit -m "feat(teacher): add read-only weekly timetable page"
```
