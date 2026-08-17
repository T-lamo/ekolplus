# Grade Level Ordering & Promotion Auto-Suggest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each school an ordered catalog of grade levels (`GradeLevel`) with a Configuration → Niveaux page, and let the academic-year rollover wizard's Step 2 bulk-suggest every class's destination from that catalog in one click.

**Architecture:** Purely additive. A new per-school `GradeLevel` model (name + order, no FK from `Class`) with CRUD + reorder routes under `/api/school/grade-levels*` mirroring `/api/school/classes`' guard pattern. The wizard's existing `GET /api/school/academic-year-rollover` gains a `gradeLevels` array; a pure client-side `suggestPromotions()` function turns it into `classMapping` entries through the exact `onMappingChange(classId, { isNew: true, newClass })` path manual "Créer nouvelle" already uses. `executeRollover` and Step 3 are untouched.

**Tech Stack:** Next.js 16 App Router (Route Handlers, `runtime = 'nodejs'`), Prisma 5 (Neon Postgres), zod, Vitest + `vitest-mock-extended` (`prismaMock`), Tailwind v4, lucide-react, existing `@/components/ui/*` primitives (`Card`, `Button`, `Field`, `Modal`).

**Spec:** [docs/superpowers/specs/2026-08-17-grade-level-ordering-design.md](../specs/2026-08-17-grade-level-ordering-design.md)

## Global Constraints

- Every new Route Handler MUST `export const runtime = 'nodejs'` (CI tripwire `runtime-enforcement.test.ts`).
- Mutations: `verifyCsrf(req)` first, then `requireAuth()`, then `resolveMySchool(auth.user.sub)` → 404 `NO_SCHOOL` if none; mutating verbs additionally require `hasMinRole(mySchool.role, 'ADMIN')` → 403 `ORG_ROLE_INSUFFICIENT`. GET is readable by any school member. Every response carries `headers: { 'x-request-id': ctx.requestId }`.
- Stable error codes (spec): `LEVEL_NAME_TAKEN` (409), `INVALID_LEVEL_SET` (400), `VALIDATION_FAILED` (400), `NOT_FOUND` (404).
- Level `name`: trimmed, 1–40 chars, unique per school (`@@unique([schoolId, name])`).
- `Class.level` stays free text — NO foreign key to `GradeLevel`. Matching is exact string equality.
- No change to `academic-year-rollover.ts` (`executeRollover`, `computeStats`, `getPromotionData`) nor to `Step3Summary.tsx`.
- No drag-and-drop dependency — ↑/↓ buttons only.
- Edit affordance rule of the project: a pencil icon always opens a `Modal`, never inline editing.
- UI copy in French, informal "tu" form matches existing settings copy (e.g. "Configure d'abord une année scolaire…", "ajoute ton premier niveau").
- Cards stay simple/compact (`Card` white, `p-4`/`p-6`, no accent colors, no stat tiles).
- Prisma CLI commands run from `frontend/` and target the **dev/test Neon DB** (`.env` → host `ep-rough-dew-zagrevho`). Never point them at `.env.production.local` — production is migrated by the Vercel build (`prisma migrate deploy` runs before every build).
- Working tree contains an unrelated, finished, uncommitted layout change (`ASIDE_GRID` / `SIDEBAR_WIDTH` files). **Only `git add` the paths listed in each task's commit step** — never `git add -A` / `git add .`.
- Before the final commit: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` must all pass (from repo root).

---

## File Structure

| Path | Responsibility |
|---|---|
| `frontend/prisma/schema.prisma` (modify) | `GradeLevel` model + `School.gradeLevels` inverse relation |
| `frontend/prisma/migrations/23_grade_level/migration.sql` (create) | Hand-written SQL, Prisma naming conventions |
| `frontend/src/app/api/school/grade-levels/route.ts` (create) | `GET` list (ordered) + `POST` create (append at max+1) |
| `frontend/src/app/api/school/grade-levels/[id]/route.ts` (create) | `PATCH` rename + `DELETE` |
| `frontend/src/app/api/school/grade-levels/reorder/route.ts` (create) | `POST` rewrite `order` from `orderedIds` in one `$transaction` |
| `frontend/src/app/api/school/grade-levels/route.test.ts` (create) | Vitest for all 5 handlers (imports the 3 route files) |
| `frontend/src/app/(school)/configuration/niveaux/page.tsx` (create) | Configuration → Niveaux page (list, ↑/↓, rename modal, delete, add) |
| `frontend/src/components/layout/SchoolSidebar.tsx` (modify) | Add "Niveaux" nav item under Configuration |
| `frontend/src/app/(school)/settings/nouvelle-annee/suggest-promotions.ts` (create) | Pure `suggestPromotions()` + `hasDestination()` + `GradeLevelOption` type |
| `frontend/src/app/(school)/settings/nouvelle-annee/suggest-promotions.test.ts` (create) | Unit tests for the pure function |
| `frontend/src/app/api/school/academic-year-rollover/route.ts` (modify) | GET response gains `gradeLevels` |
| `frontend/src/app/api/school/academic-year-rollover/route.test.ts` (modify) | Assert `gradeLevels` in GET payload |
| `frontend/src/app/(school)/settings/nouvelle-annee/page.tsx` (modify) | `RolloverGetResponse.gradeLevels`, state, prop to Step 2 |
| `frontend/src/app/(school)/settings/nouvelle-annee/Step2Promotion.tsx` (modify) | `gradeLevels` prop, "Suggérer toutes les promotions" button + hint |
| `frontend/src/lib/constants.ts` (modify) | New copy keys under `ACADEMIC_YEAR_ROLLOVER.step2` |
| `.planning/banani/STATUS.md` + spec status line (modify) | Record shipping |

---

### Task 1: `GradeLevel` Prisma model + migration

**Files:**
- Modify: `frontend/prisma/schema.prisma` (School model relations block; new model right after `model AcademicYearRolloverDraft`)
- Create: `frontend/prisma/migrations/23_grade_level/migration.sql`

**Interfaces:**
- Produces: `prisma.gradeLevel` client delegate with fields `{ id, schoolId, name, order, createdAt, updatedAt }`; unique `(schoolId, name)`; index `(schoolId, order)`; `School.gradeLevels`.

- [ ] **Step 1: Add the model to `schema.prisma`**

In `model School { … }`, right after the line `rolloverDraft         AcademicYearRolloverDraft?`, add:

```prisma
  gradeLevels           GradeLevel[]
```

Right after the closing `}` of `model AcademicYearRolloverDraft`, add:

```prisma

// Per-school ordered catalog of grade levels ("6ème" → "5ème" → … →
// "Terminale"). Cross-referenced with `Class.level` by EXACT string match —
// there is deliberately no FK from Class (Class.level stays free text; see
// docs/superpowers/specs/2026-08-17-grade-level-ordering-design.md). Used by
// the rollover wizard's Step 2 to auto-suggest promotion destinations.
// `order` is only indexed, not unique: the reorder route rewrites every row's
// order for the school in one transaction, and nothing else writes it.
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

- [ ] **Step 2: Write the migration SQL**

Create `frontend/prisma/migrations/23_grade_level/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "GradeLevel" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeLevel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GradeLevel_schoolId_order_idx" ON "GradeLevel"("schoolId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "GradeLevel_schoolId_name_key" ON "GradeLevel"("schoolId", "name");

-- AddForeignKey
ALTER TABLE "GradeLevel" ADD CONSTRAINT "GradeLevel_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Validate schema, apply to the dev DB, regenerate the client**

Run (from `frontend/`):
```bash
pnpm exec prisma validate
pnpm exec prisma migrate deploy
pnpm exec prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
pnpm exec prisma generate
```
Expected: `validate` → "The schema … is valid"; `migrate deploy` → "1 migration found… Applying migration `23_grade_level`… All migrations have been successfully applied"; `migrate diff … --exit-code` → exit code 0 / "No difference detected" (proves the hand-written SQL matches the model exactly); `generate` → "Generated Prisma Client".

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck` (repo root)
Expected: PASS (nothing consumes the model yet; this just proves the generated client compiles).

- [ ] **Step 5: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/23_grade_level/migration.sql
git commit -m "feat(grade-levels): add per-school GradeLevel model + migration 23

Ordered, name-only catalog cross-referenced with Class.level by exact
string (no FK by design — see 2026-08-17-grade-level-ordering-design.md).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `GET` + `POST /api/school/grade-levels`

**Files:**
- Create: `frontend/src/app/api/school/grade-levels/route.ts`
- Create: `frontend/src/app/api/school/grade-levels/route.test.ts`

**Interfaces:**
- Consumes: `prisma.gradeLevel` (Task 1); `requireAuth`, `verifyCsrf`, `resolveMySchool`, `hasMinRole`, `makeRequestContext`/`withRequestContext` (existing).
- Produces: `GET → 200 { levels: { id: string; name: string; order: number }[] }` ordered by `order asc`; `POST { name } → 201 { level: { id, name, order } }`; `409 LEVEL_NAME_TAKEN`; `400 VALIDATION_FAILED`; `403 ORG_ROLE_INSUFFICIENT`; `404 NO_SCHOOL`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/school/grade-levels/route.test.ts`:

```ts
// /api/school/grade-levels — per-school ordered catalog of grade levels
// (spec: docs/superpowers/specs/2026-08-17-grade-level-ordering-design.md).
// prismaMock first (auto-hoists vi.mock for '@/lib/server/prisma'), then
// mock requireAuth + verifyCsrf + resolveMySchool — modeled on
// src/app/api/school/subjects/route.test.ts.
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
import { GET, POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);

const authUser = { user: { sub: 'user_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };

function req(method: string, url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const now = new Date('2026-08-17T00:00:00Z');
const row = (id: string, name: string, order: number) => ({
  id,
  schoolId: 'school_1',
  name,
  order,
  createdAt: now,
  updatedAt: now,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(adminSchool);
});

describe('GET /api/school/grade-levels', () => {
  it('propagates 401 from requireAuth', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }) as never,
    );
    const res = await GET(req('GET', '/api/school/grade-levels'));
    expect(res.status).toBe(401);
  });

  it('no school membership → 404 NO_SCHOOL', async () => {
    mockResolveMySchool.mockResolvedValueOnce(null);
    const res = await GET(req('GET', '/api/school/grade-levels'));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('NO_SCHOOL');
  });

  it('MEMBER can read; levels come back ordered by `order asc` with id/name/order only', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    prismaMock.gradeLevel.findMany.mockResolvedValue([
      row('l1', '6ème', 0),
      row('l2', '5ème', 1),
    ] as never);
    const res = await GET(req('GET', '/api/school/grade-levels'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    const body = (await res.json()) as { levels: unknown[] };
    expect(body.levels).toEqual([
      { id: 'l1', name: '6ème', order: 0 },
      { id: 'l2', name: '5ème', order: 1 },
    ]);
    expect(prismaMock.gradeLevel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: 'school_1' },
        orderBy: { order: 'asc' },
      }),
    );
  });
});

describe('POST /api/school/grade-levels', () => {
  it('missing CSRF → 403 short-circuits before auth', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await POST(req('POST', '/api/school/grade-levels', { name: '6ème' }));
    expect(res.status).toBe(403);
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });

  it('MEMBER → 403 ORG_ROLE_INSUFFICIENT', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    const res = await POST(req('POST', '/api/school/grade-levels', { name: '6ème' }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('ORG_ROLE_INSUFFICIENT');
    expect(prismaMock.gradeLevel.create).not.toHaveBeenCalled();
  });

  it('empty / too-long / missing name → 400 VALIDATION_FAILED', async () => {
    for (const body of [{ name: '   ' }, { name: 'x'.repeat(41) }, {}]) {
      const res = await POST(req('POST', '/api/school/grade-levels', body));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('VALIDATION_FAILED');
    }
    expect(prismaMock.gradeLevel.create).not.toHaveBeenCalled();
  });

  it('name already used in this school → 409 LEVEL_NAME_TAKEN', async () => {
    prismaMock.gradeLevel.findFirst.mockResolvedValue(row('l1', '6ème', 0) as never);
    const res = await POST(req('POST', '/api/school/grade-levels', { name: ' 6ème ' }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('LEVEL_NAME_TAKEN');
    expect(prismaMock.gradeLevel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: 'school_1', name: '6ème' } }),
    );
    expect(prismaMock.gradeLevel.create).not.toHaveBeenCalled();
  });

  it('appends at max(order)+1 → 201 { level }', async () => {
    prismaMock.gradeLevel.findFirst.mockResolvedValue(null);
    prismaMock.gradeLevel.aggregate.mockResolvedValue({ _max: { order: 4 } } as never);
    prismaMock.gradeLevel.create.mockResolvedValue(row('l6', '2nde', 5) as never);
    const res = await POST(req('POST', '/api/school/grade-levels', { name: '2nde' }));
    expect(res.status).toBe(201);
    expect((await res.json()) as unknown).toEqual({ level: { id: 'l6', name: '2nde', order: 5 } });
    expect(prismaMock.gradeLevel.create).toHaveBeenCalledWith({
      data: { schoolId: 'school_1', name: '2nde', order: 5 },
    });
  });

  it('first level of a school gets order 0', async () => {
    prismaMock.gradeLevel.findFirst.mockResolvedValue(null);
    prismaMock.gradeLevel.aggregate.mockResolvedValue({ _max: { order: null } } as never);
    prismaMock.gradeLevel.create.mockResolvedValue(row('l1', '6ème', 0) as never);
    const res = await POST(req('POST', '/api/school/grade-levels', { name: '6ème' }));
    expect(res.status).toBe(201);
    expect(prismaMock.gradeLevel.create).toHaveBeenCalledWith({
      data: { schoolId: 'school_1', name: '6ème', order: 0 },
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/grade-levels/route.test.ts`
Expected: FAIL — `Failed to resolve import "./route"` (file doesn't exist yet).

- [ ] **Step 3: Implement the route**

Create `frontend/src/app/api/school/grade-levels/route.ts`:

```ts
// GET /api/school/grade-levels — the school's ordered grade-level catalog.
// POST — append a level at the end (order = max+1). ADMIN+ for mutations,
// any school member may read. Names are unique per school (409
// LEVEL_NAME_TAKEN). Spec: docs/superpowers/specs/2026-08-17-grade-level-ordering-design.md
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export const LEVEL_SELECT = { id: true, name: true, order: true } as const;

export const LevelNameBody = z.object({
  name: z.string().trim().min(1).max(40),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const levels = await prisma.gradeLevel.findMany({
      where: { schoolId: mySchool.schoolId },
      orderBy: { order: 'asc' },
      select: LEVEL_SELECT,
    });

    return NextResponse.json({ levels }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = LevelNameBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const name = parsed.data.name;

    const clash = await prisma.gradeLevel.findFirst({
      where: { schoolId: mySchool.schoolId, name },
      select: { id: true },
    });
    if (clash) {
      return NextResponse.json(
        { error: 'LEVEL_NAME_TAKEN', message: `Le niveau « ${name} » existe déjà.` },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { _max } = await prisma.gradeLevel.aggregate({
      where: { schoolId: mySchool.schoolId },
      _max: { order: true },
    });
    const order = (_max.order ?? -1) + 1;

    try {
      const level = await prisma.gradeLevel.create({
        data: { schoolId: mySchool.schoolId, name, order },
      });
      return NextResponse.json(
        { level: { id: level.id, name: level.name, order: level.order } },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      // Two admins adding the same name at once: the pre-check above races,
      // the @@unique([schoolId, name]) constraint doesn't.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return NextResponse.json(
          { error: 'LEVEL_NAME_TAKEN', message: `Le niveau « ${name} » existe déjà.` },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/grade-levels/route.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/school/grade-levels/route.ts frontend/src/app/api/school/grade-levels/route.test.ts
git commit -m "feat(grade-levels): GET list + POST create routes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `PATCH` + `DELETE /api/school/grade-levels/[id]`

**Files:**
- Create: `frontend/src/app/api/school/grade-levels/[id]/route.ts`
- Modify: `frontend/src/app/api/school/grade-levels/route.test.ts` (append two `describe` blocks + one import)

**Interfaces:**
- Consumes: `LevelNameBody`, `LEVEL_SELECT` exported from `../route` (Task 2).
- Produces: `PATCH { name } → 200 { level: { id, name, order } }`; `DELETE → 204`; `404 NOT_FOUND` for unknown/foreign id; `409 LEVEL_NAME_TAKEN`.

- [ ] **Step 1: Write the failing tests**

In `route.test.ts`, change the import line `import { GET, POST } from './route';` to:

```ts
import { GET, POST } from './route';
import { PATCH, DELETE } from './[id]/route';
```

Append at the end of the file:

```ts
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('PATCH /api/school/grade-levels/[id]', () => {
  it('missing CSRF → 403', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await PATCH(
      req('PATCH', '/api/school/grade-levels/l1', { name: '6e' }),
      params('l1'),
    );
    expect(res.status).toBe(403);
  });

  it('MEMBER → 403 ORG_ROLE_INSUFFICIENT', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    const res = await PATCH(
      req('PATCH', '/api/school/grade-levels/l1', { name: '6e' }),
      params('l1'),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.gradeLevel.update).not.toHaveBeenCalled();
  });

  it('unknown id or another school\'s level → 404 NOT_FOUND', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValueOnce(null);
    let res = await PATCH(
      req('PATCH', '/api/school/grade-levels/nope', { name: '6e' }),
      params('nope'),
    );
    expect(res.status).toBe(404);

    prismaMock.gradeLevel.findUnique.mockResolvedValueOnce({
      ...row('lx', '6ème', 0),
      schoolId: 'school_OTHER',
    } as never);
    res = await PATCH(req('PATCH', '/api/school/grade-levels/lx', { name: '6e' }), params('lx'));
    expect(res.status).toBe(404);
    expect(prismaMock.gradeLevel.update).not.toHaveBeenCalled();
  });

  it('invalid body → 400 VALIDATION_FAILED', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue(row('l1', '6ème', 0) as never);
    const res = await PATCH(
      req('PATCH', '/api/school/grade-levels/l1', { name: '' }),
      params('l1'),
    );
    expect(res.status).toBe(400);
  });

  it('renaming to a name used by ANOTHER level → 409 LEVEL_NAME_TAKEN', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue(row('l1', '6ème', 0) as never);
    prismaMock.gradeLevel.findFirst.mockResolvedValue(row('l2', '5ème', 1) as never);
    const res = await PATCH(
      req('PATCH', '/api/school/grade-levels/l1', { name: '5ème' }),
      params('l1'),
    );
    expect(res.status).toBe(409);
    expect(prismaMock.gradeLevel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: 'school_1', name: '5ème', NOT: { id: 'l1' } },
      }),
    );
    expect(prismaMock.gradeLevel.update).not.toHaveBeenCalled();
  });

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
      level: { id: 'l1', name: 'Sixième', order: 0 },
    });
    expect(prismaMock.gradeLevel.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'l1' }, data: { name: 'Sixième' } }),
    );
  });
});

describe('DELETE /api/school/grade-levels/[id]', () => {
  it('missing CSRF → 403', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await DELETE(req('DELETE', '/api/school/grade-levels/l1'), params('l1'));
    expect(res.status).toBe(403);
  });

  it('MEMBER → 403 ORG_ROLE_INSUFFICIENT', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    const res = await DELETE(req('DELETE', '/api/school/grade-levels/l1'), params('l1'));
    expect(res.status).toBe(403);
    expect(prismaMock.gradeLevel.delete).not.toHaveBeenCalled();
  });

  it('another school\'s level → 404 NOT_FOUND', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValueOnce({
      ...row('lx', '6ème', 0),
      schoolId: 'school_OTHER',
    } as never);
    const res = await DELETE(req('DELETE', '/api/school/grade-levels/lx'), params('lx'));
    expect(res.status).toBe(404);
    expect(prismaMock.gradeLevel.delete).not.toHaveBeenCalled();
  });

  it('deletes → 204', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue(row('l1', '6ème', 0) as never);
    prismaMock.gradeLevel.delete.mockResolvedValue(row('l1', '6ème', 0) as never);
    const res = await DELETE(req('DELETE', '/api/school/grade-levels/l1'), params('l1'));
    expect(res.status).toBe(204);
    expect(prismaMock.gradeLevel.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/grade-levels/route.test.ts`
Expected: FAIL — `Failed to resolve import "./[id]/route"`.

- [ ] **Step 3: Implement the `[id]` route**

Create `frontend/src/app/api/school/grade-levels/[id]/route.ts`:

```ts
// PATCH /api/school/grade-levels/[id] — rename a level (409 LEVEL_NAME_TAKEN
// on collision with another level of the same school).
// DELETE — hard delete. There is no FK from Class to GradeLevel (by design),
// so this can never orphan a class row; classes at that free-text level just
// stop getting an auto-suggestion in the rollover wizard.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { LevelNameBody } from '../route';

type Ctx = { params: Promise<{ id: string }> };

/** Shared guard chain for both mutating verbs: CSRF → auth → school → ADMIN
 * → owned level. Returns either the level row + school, or the NextResponse
 * to bail with. */
async function guard(req: NextRequest, params: Ctx['params'], requestId: string) {
  const csrfFail = verifyCsrf(req);
  if (csrfFail) return csrfFail;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const mySchool = await resolveMySchool(auth.user.sub);
  if (!mySchool) {
    return NextResponse.json(
      { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
      { status: 404, headers: { 'x-request-id': requestId } },
    );
  }
  if (!hasMinRole(mySchool.role, 'ADMIN')) {
    return NextResponse.json(
      { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
      { status: 403, headers: { 'x-request-id': requestId } },
    );
  }

  const { id } = await params;
  const level = await prisma.gradeLevel.findUnique({ where: { id } });
  if (!level || level.schoolId !== mySchool.schoolId) {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: 'Grade level not found' },
      { status: 404, headers: { 'x-request-id': requestId } },
    );
  }
  return { level, schoolId: mySchool.schoolId };
}

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const g = await guard(req, params, ctx.requestId);
    if (g instanceof NextResponse) return g;

    const parsed = LevelNameBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
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

    const updated = await prisma.gradeLevel.update({
      where: { id: g.level.id },
      data: { name },
    });
    return NextResponse.json(
      { level: { id: updated.id, name: updated.name, order: updated.order } },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const g = await guard(req, params, ctx.requestId);
    if (g instanceof NextResponse) return g;

    await prisma.gradeLevel.delete({ where: { id: g.level.id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/grade-levels/route.test.ts`
Expected: PASS — 19 tests.

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/api/school/grade-levels/[id]/route.ts" frontend/src/app/api/school/grade-levels/route.test.ts
git commit -m "feat(grade-levels): PATCH rename + DELETE routes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `POST /api/school/grade-levels/reorder`

**Files:**
- Create: `frontend/src/app/api/school/grade-levels/reorder/route.ts`
- Modify: `frontend/src/app/api/school/grade-levels/route.test.ts` (append one `describe` + one import)

**Interfaces:**
- Produces: `POST { orderedIds: string[] } → 200 { levels: { id, name, order }[] }` (new order = array index); `400 INVALID_LEVEL_SET` when `orderedIds` is not exactly the school's level-id set (missing, extra, or duplicate ids).

- [ ] **Step 1: Write the failing tests**

In `route.test.ts`, below `import { PATCH, DELETE } from './[id]/route';` add:

```ts
import { POST as REORDER } from './reorder/route';
```

Append at the end of the file:

```ts
describe('POST /api/school/grade-levels/reorder', () => {
  const existing = [row('l1', '6ème', 0), row('l2', '5ème', 1), row('l3', '4ème', 2)];

  beforeEach(() => {
    prismaMock.gradeLevel.findMany.mockResolvedValue(existing as never);
    prismaMock.$transaction.mockResolvedValue([] as never);
  });

  it('missing CSRF → 403', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await REORDER(
      req('POST', '/api/school/grade-levels/reorder', { orderedIds: ['l1', 'l2', 'l3'] }),
    );
    expect(res.status).toBe(403);
  });

  it('MEMBER → 403 ORG_ROLE_INSUFFICIENT', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    const res = await REORDER(
      req('POST', '/api/school/grade-levels/reorder', { orderedIds: ['l1', 'l2', 'l3'] }),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('non-array / empty body → 400 VALIDATION_FAILED', async () => {
    for (const body of [{}, { orderedIds: 'l1' }, { orderedIds: [] }]) {
      const res = await REORDER(req('POST', '/api/school/grade-levels/reorder', body));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('VALIDATION_FAILED');
    }
  });

  it('missing / extra / duplicate ids → 400 INVALID_LEVEL_SET', async () => {
    for (const orderedIds of [
      ['l1', 'l2'], // missing l3
      ['l1', 'l2', 'l3', 'l9'], // extra
      ['l1', 'l2', 'l2'], // duplicate (same length as existing)
    ]) {
      const res = await REORDER(req('POST', '/api/school/grade-levels/reorder', { orderedIds }));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('INVALID_LEVEL_SET');
    }
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rewrites order = array index in one $transaction → 200 { levels }', async () => {
    const res = await REORDER(
      req('POST', '/api/school/grade-levels/reorder', { orderedIds: ['l3', 'l1', 'l2'] }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({
      levels: [
        { id: 'l3', name: '4ème', order: 0 },
        { id: 'l1', name: '6ème', order: 1 },
        { id: 'l2', name: '5ème', order: 2 },
      ],
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.gradeLevel.update).toHaveBeenCalledTimes(3);
    expect(prismaMock.gradeLevel.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'l3' },
      data: { order: 0 },
    });
    expect(prismaMock.gradeLevel.update).toHaveBeenNthCalledWith(3, {
      where: { id: 'l2' },
      data: { order: 2 },
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/grade-levels/route.test.ts`
Expected: FAIL — `Failed to resolve import "./reorder/route"`.

- [ ] **Step 3: Implement the reorder route**

Create `frontend/src/app/api/school/grade-levels/reorder/route.ts`:

```ts
// POST /api/school/grade-levels/reorder — body { orderedIds: string[] } must
// be exactly the set of the school's level ids (400 INVALID_LEVEL_SET
// otherwise — catches a stale client racing another admin's add/delete).
// Rewrites every row's `order` to its array index in one $transaction.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const ReorderBody = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = ReorderBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { orderedIds } = parsed.data;

    const existing = await prisma.gradeLevel.findMany({
      where: { schoolId: mySchool.schoolId },
      select: { id: true, name: true },
    });
    const byId = new Map(existing.map((l) => [l.id, l]));
    const sameSet =
      orderedIds.length === existing.length &&
      new Set(orderedIds).size === orderedIds.length &&
      orderedIds.every((id) => byId.has(id));
    if (!sameSet) {
      return NextResponse.json(
        {
          error: 'INVALID_LEVEL_SET',
          message: 'La liste des niveaux a changé — recharge la page et réessaie.',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.$transaction(
      orderedIds.map((id, order) => prisma.gradeLevel.update({ where: { id }, data: { order } })),
    );

    return NextResponse.json(
      {
        levels: orderedIds.map((id, order) => ({
          id,
          name: byId.get(id)!.name,
          order,
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

Note: `byId.get(id)!` — the non-null assertion is justified by the `sameSet` check right above (every id is in the map). If ESLint's `no-non-null-assertion` flags it, replace with `byId.get(id)?.name ?? ''`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/grade-levels/route.test.ts`
Expected: PASS — 24 tests.

- [ ] **Step 5: Run the runtime-enforcement tripwire + lint on the new routes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/observability/runtime-enforcement.test.ts && pnpm lint`
Expected: PASS (all three new `route.ts` export `runtime = 'nodejs'`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/school/grade-levels/reorder/route.ts frontend/src/app/api/school/grade-levels/route.test.ts
git commit -m "feat(grade-levels): POST reorder route (exact-set check, single tx)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Configuration → Niveaux page + sidebar entry

**Files:**
- Create: `frontend/src/app/(school)/configuration/niveaux/page.tsx`
- Modify: `frontend/src/components/layout/SchoolSidebar.tsx` (Configuration `items` array + lucide import)

**Interfaces:**
- Consumes: the 5 handlers from Tasks 2–4 via `api()`; `useUser`, `useToast`, `Card`, `Button`, `Field`, `Modal`, `Skeleton` (existing).
- Produces: route `/configuration/niveaux`.

- [ ] **Step 1: Add the nav item**

In `frontend/src/components/layout/SchoolSidebar.tsx`, add `ListOrdered` to the existing `lucide-react` import list, and in the `Configuration` section's `items` array insert **right after** the `Classes` entry:

```ts
      { label: 'Niveaux', href: '/configuration/niveaux', icon: ListOrdered },
```

- [ ] **Step 2: Create the page**

Create `frontend/src/app/(school)/configuration/niveaux/page.tsx`:

```tsx
'use client';

// Configuration → Niveaux — the school's ordered grade-level catalog
// ("6ème" → "5ème" → … → "Terminale"). Feeds the rollover wizard's
// "Suggérer toutes les promotions" (Step 2). ↑/↓ reorder (no DnD dep),
// pencil → rename Modal (project rule: edit icons open modals), trash →
// window.confirm (matches classes/matières delete pattern). The API enforces
// ADMIN on mutations; a MEMBER just gets the 403 message as a toast.
// Spec: docs/superpowers/specs/2026-08-17-grade-level-ordering-design.md

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';

interface GradeLevel {
  id: string;
  name: string;
  order: number;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.';
}

function RenameLevelModal({
  level,
  onRenamed,
  onClose,
}: {
  level: GradeLevel;
  onRenamed: (level: GradeLevel) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState(level.name);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const name = value.trim();
    if (!name) {
      setError('Le nom est requis.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ level: GradeLevel }>(`/api/school/grade-levels/${level.id}`, {
        method: 'PATCH',
        body: { name },
      });
      onRenamed(res.level);
      toast('Niveau renommé.', 'success');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Renommer le niveau" onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <Field
          label="Nom du niveau"
          autoFocus
          maxLength={40}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" className="w-fit" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={submitting} className="w-fit">
            Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function NiveauxPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const [levels, setLevels] = useState<GradeLevel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  const [renaming, setRenaming] = useState<GradeLevel | null>(null);

  useEffect(() => {
    if (!user) return;
    api<{ levels: GradeLevel[] }>('/api/school/grade-levels')
      .then((res) => setLevels(res.levels))
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        setError('Impossible de charger les niveaux.');
      });
  }, [user, router]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const res = await api<{ level: GradeLevel }>('/api/school/grade-levels', {
        method: 'POST',
        body: { name },
      });
      setLevels((prev) => [...(prev ?? []), res.level]);
      setNewName('');
      toast('Niveau ajouté.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setAdding(false);
    }
  }

  async function onMove(index: number, delta: -1 | 1) {
    if (!levels) return;
    const target = index + delta;
    if (target < 0 || target >= levels.length) return;
    const previous = levels;
    const next = [...levels];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    // Optimistic — orders are re-derived from the server response below.
    setLevels(next.map((l, order) => ({ ...l, order })));
    setMoving(true);
    try {
      const res = await api<{ levels: GradeLevel[] }>('/api/school/grade-levels/reorder', {
        method: 'POST',
        body: { orderedIds: next.map((l) => l.id) },
      });
      setLevels(res.levels);
    } catch (err) {
      setLevels(previous);
      toast(errorMessage(err), 'error');
    } finally {
      setMoving(false);
    }
  }

  async function onDelete(level: GradeLevel) {
    if (!window.confirm(`Supprimer le niveau « ${level.name} » ?`)) return;
    try {
      await api(`/api/school/grade-levels/${level.id}`, { method: 'DELETE' });
      setLevels((prev) => (prev ? prev.filter((l) => l.id !== level.id) : prev));
      toast('Niveau supprimé.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-5">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">Niveaux</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Ordre des niveaux scolaires, du premier au dernier — utilisé pour suggérer les
          promotions lors du passage à l&apos;année suivante.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {levels === null && !error && (
        <Card className="gap-3 p-4 sm:p-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </Card>
      )}

      {levels !== null && (
        <Card className="max-w-2xl gap-4 p-4 sm:p-6">
          {levels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun niveau configuré — ajoute ton premier niveau ci-dessous.
            </p>
          ) : (
            <ol className="flex flex-col divide-y divide-border">
              {levels.map((level, index) => (
                <li key={level.id} className="flex items-center gap-3 py-2">
                  <span className="w-6 text-right text-xs font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium text-foreground">
                    {level.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-fit px-2"
                      aria-label={`Monter ${level.name}`}
                      disabled={moving || index === 0}
                      onClick={() => onMove(index, -1)}
                    >
                      <ArrowUp size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-fit px-2"
                      aria-label={`Descendre ${level.name}`}
                      disabled={moving || index === levels.length - 1}
                      onClick={() => onMove(index, 1)}
                    >
                      <ArrowDown size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-fit px-2"
                      aria-label={`Renommer ${level.name}`}
                      onClick={() => setRenaming(level)}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-fit px-2 text-destructive-foreground hover:text-destructive-foreground"
                      aria-label={`Supprimer ${level.name}`}
                      onClick={() => onDelete(level)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <form onSubmit={onAdd} className="flex items-end gap-2 border-t border-border pt-4">
            <div className="flex-1">
              <Field
                label="Nouveau niveau"
                name="newLevel"
                placeholder="Ex. 6ème"
                maxLength={40}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-fit" loading={adding} disabled={!newName.trim()}>
              <Plus size={14} />
              Ajouter
            </Button>
          </form>
        </Card>
      )}

      {renaming && (
        <RenameLevelModal
          level={renaming}
          onRenamed={(updated) =>
            setLevels((prev) =>
              prev ? prev.map((l) => (l.id === updated.id ? updated : l)) : prev,
            )
          }
          onClose={() => setRenaming(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint + layout tripwire**

Run: `pnpm typecheck && pnpm lint && pnpm --filter frontend exec vitest run src/lib/layout.test.ts`
Expected: all PASS. (`layout.test.ts` auto-discovers the new page under `src/app/(school)` and asserts it doesn't hard-code a `grid-cols-[1fr_NNNpx]` — it doesn't.)

If `Skeleton` doesn't accept `className` the way used above, check `frontend/src/components/ui/Skeleton.tsx` and use its actual API (it is used as `<Skeleton className="…" />` in `settings/nouvelle-annee/page.tsx`).

- [ ] **Step 4: Browser check (dev server)**

Start `pnpm dev` (repo root, background) and, logged in as the test OWNER (`amosdorceus2023@gmail.com` / `TestEcole2026!` on the dev DB, as prior sessions did with Playwright from the scratchpad), open `http://localhost:3000/configuration/niveaux`:
1. Empty state text renders; sidebar shows "Niveaux" under Configuration, highlighted.
2. Add "6ème", "5ème", "4ème" → rows 1–3 appear; add "6ème" again → error toast "Le niveau « 6ème » existe déjà.".
3. Click ↓ on row 1 → order becomes 5ème, 6ème, 4ème (network: `POST /reorder` 200). ↑ on the first row and ↓ on the last are disabled.
4. Pencil → modal → rename "4ème" to "Quatrième" → row updates.
5. Trash on "Quatrième" → confirm → row gone.
6. No console/page errors; no horizontal overflow at 375px.

If no browser automation is available in the session, at minimum `curl -sI http://localhost:3000/configuration/niveaux` returns a 200/307 (not 500) and the dev-server log shows no compile error — and say so explicitly in the task report (do not claim a visual check that wasn't done).

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/(school)/configuration/niveaux/page.tsx" frontend/src/components/layout/SchoolSidebar.tsx
git commit -m "feat(grade-levels): Configuration → Niveaux page (add, rename, ↑/↓ reorder, delete)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Pure `suggestPromotions()` helper

**Files:**
- Create: `frontend/src/app/(school)/settings/nouvelle-annee/suggest-promotions.ts`
- Create: `frontend/src/app/(school)/settings/nouvelle-annee/suggest-promotions.test.ts`

**Interfaces:**
- Consumes: `ClassForPromotion`, `ClassMappingEntry` from `./types`.
- Produces:
  ```ts
  export interface GradeLevelOption { id: string; name: string; order: number }
  export function hasDestination(entry: ClassMappingEntry | undefined): boolean
  export function suggestPromotions(
    classes: ClassForPromotion[],
    gradeLevels: GradeLevelOption[],
    activeMapping: Record<string, ClassMappingEntry>,
  ): Array<{ classId: string; entry: ClassMappingEntry }>
  ```

Design note (deviation from the spec's literal `order + 1`): the successor is the **next level in `order`-sorted sequence**, not literally `order + 1`. `DELETE` doesn't compact orders, so after deleting a middle level the catalog can be `0, 1, 3` — positional lookup keeps the chain working; literal `+1` would silently stop suggesting past the gap. Same result whenever orders are contiguous (which the reorder route always restores).

- [ ] **Step 1: Write the failing tests**

Create `suggest-promotions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hasDestination, suggestPromotions, type GradeLevelOption } from './suggest-promotions';
import type { ClassForPromotion, ClassMappingEntry } from './types';

const levels: GradeLevelOption[] = [
  { id: 'l1', name: '6ème', order: 0 },
  { id: 'l2', name: '5ème', order: 1 },
  { id: 'l3', name: '3ème', order: 2 },
  { id: 'l4', name: '2nde', order: 3 },
  { id: 'l5', name: 'Terminale', order: 4 },
];

const cls = (id: string, name: string, level: string): ClassForPromotion => ({
  id,
  name,
  level,
  studentCount: 10,
});

describe('hasDestination', () => {
  it('true for an existing destClassId', () => {
    expect(hasDestination({ destClassId: 'c9' })).toBe(true);
  });
  it('true for isNew + newClass', () => {
    expect(hasDestination({ isNew: true, newClass: { name: '5ème A', level: '5ème' } })).toBe(
      true,
    );
  });
  it('false for undefined, empty, or malformed isNew without newClass', () => {
    expect(hasDestination(undefined)).toBe(false);
    expect(hasDestination({})).toBe(false);
    expect(hasDestination({ isNew: true })).toBe(false);
  });
});

describe('suggestPromotions', () => {
  it('replaces the level substring inside the class name ("3ème A" → "2nde A")', () => {
    const out = suggestPromotions([cls('c1', '3ème A', '3ème')], levels, {});
    expect(out).toEqual([
      { classId: 'c1', entry: { isNew: true, newClass: { name: '2nde A', level: '2nde' } } },
    ]);
  });

  it('falls back to the bare next-level name when the class name does not contain the level', () => {
    const out = suggestPromotions([cls('c1', '3A', '3ème')], levels, {});
    expect(out[0]?.entry.newClass).toEqual({ name: '2nde', level: '2nde' });
  });

  it('skips the last level of the sequence (implicit end of cursus)', () => {
    expect(suggestPromotions([cls('c1', 'Terminale S', 'Terminale')], levels, {})).toEqual([]);
  });

  it('skips a class whose level is not in the catalog', () => {
    expect(suggestPromotions([cls('c1', 'CP A', 'CP')], levels, {})).toEqual([]);
  });

  it('returns nothing when the catalog is empty', () => {
    expect(suggestPromotions([cls('c1', '6ème A', '6ème')], [], {})).toEqual([]);
  });

  it('leaves already-mapped classes untouched (manual mapping wins), but fills malformed ones', () => {
    const mapping: Record<string, ClassMappingEntry> = {
      c1: { destClassId: 'existing' },
      c2: { isNew: true, newClass: { name: 'Custom', level: '5ème' } },
      c3: { isNew: true }, // malformed — counts as unmapped
    };
    const out = suggestPromotions(
      [cls('c1', '6ème A', '6ème'), cls('c2', '6ème B', '6ème'), cls('c3', '6ème C', '6ème')],
      levels,
      mapping,
    );
    expect(out.map((s) => s.classId)).toEqual(['c3']);
    expect(out[0]?.entry.newClass).toEqual({ name: '5ème C', level: '5ème' });
  });

  it('two sections of the same level are each suggested independently', () => {
    const out = suggestPromotions([cls('a', '6ème A', '6ème'), cls('b', '6ème B', '6ème')], levels, {});
    expect(out.map((s) => s.entry.newClass?.name)).toEqual(['5ème A', '5ème B']);
  });

  it('follows the sorted sequence even when orders have gaps (after a delete)', () => {
    const gappy: GradeLevelOption[] = [
      { id: 'x', name: 'CE1', order: 0 },
      { id: 'y', name: 'CE2', order: 2 },
      { id: 'z', name: 'CM1', order: 5 },
    ];
    const out = suggestPromotions([cls('c1', 'CE1 A', 'CE1'), cls('c2', 'CE2 A', 'CE2')], gappy, {});
    expect(out.map((s) => s.entry.newClass?.name)).toEqual(['CE2 A', 'CM1 A']);
  });

  it('is order-agnostic about the input array (sorts by `order` itself)', () => {
    const shuffled = [...levels].reverse();
    const out = suggestPromotions([cls('c1', '6ème A', '6ème')], shuffled, {});
    expect(out[0]?.entry.newClass?.level).toBe('5ème');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run "src/app/(school)/settings/nouvelle-annee/suggest-promotions.test.ts"`
Expected: FAIL — cannot resolve `./suggest-promotions`.

- [ ] **Step 3: Implement**

Create `suggest-promotions.ts`:

```ts
// Pure helpers behind Step 2's "Suggérer toutes les promotions". No React,
// no fetch — unit-tested in isolation. The suggestion produces the exact
// `ClassMappingEntry` shape manual "Créer nouvelle" produces, so Step 3 and
// executeRollover consume it unchanged.
// Spec: docs/superpowers/specs/2026-08-17-grade-level-ordering-design.md
import type { ClassForPromotion, ClassMappingEntry } from './types';

export interface GradeLevelOption {
  id: string;
  name: string;
  order: number;
}

/** Same rule as `handleProceed`'s validation and `computeStats`'s class-
 * creation guard: an `isNew` entry only counts once `newClass` is present. */
export function hasDestination(entry: ClassMappingEntry | undefined): boolean {
  return Boolean(entry?.destClassId) || Boolean(entry?.isNew && entry?.newClass);
}

/** For every class without a destination, propose "create new class at the
 * next level". Successor = the next level in `order`-sorted sequence
 * (positional, so a gap left by a deleted level doesn't break the chain).
 * Skips: level not in catalog, last level (implicit end of cursus). */
export function suggestPromotions(
  classes: ClassForPromotion[],
  gradeLevels: GradeLevelOption[],
  activeMapping: Record<string, ClassMappingEntry>,
): Array<{ classId: string; entry: ClassMappingEntry }> {
  const sorted = [...gradeLevels].sort((a, b) => a.order - b.order);
  const nextByName = new Map<string, GradeLevelOption>();
  sorted.forEach((level, i) => {
    const next = sorted[i + 1];
    if (next) nextByName.set(level.name, next);
  });

  const suggestions: Array<{ classId: string; entry: ClassMappingEntry }> = [];
  for (const cls of classes) {
    if (hasDestination(activeMapping[cls.id])) continue;
    const next = nextByName.get(cls.level);
    if (!next) continue;
    const name = cls.name.includes(cls.level)
      ? cls.name.replace(cls.level, next.name)
      : next.name;
    suggestions.push({
      classId: cls.id,
      entry: { isNew: true, newClass: { name, level: next.name } },
    });
  }
  return suggestions;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run "src/app/(school)/settings/nouvelle-annee/suggest-promotions.test.ts"`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/(school)/settings/nouvelle-annee/suggest-promotions.ts" "frontend/src/app/(school)/settings/nouvelle-annee/suggest-promotions.test.ts"
git commit -m "feat(rollover): pure suggestPromotions() helper for Step 2 auto-suggest

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Rollover `GET` returns `gradeLevels`

**Files:**
- Modify: `frontend/src/app/api/school/academic-year-rollover/route.ts` (GET handler, the `getPromotionData` call + JSON body)
- Modify: `frontend/src/app/api/school/academic-year-rollover/route.test.ts` (`beforeEach` default + one new test)

**Interfaces:**
- Produces: `GET` payload gains `gradeLevels: { id: string; name: string; order: number }[]` ordered by `order asc`.

- [ ] **Step 1: Write the failing test**

In `route.test.ts`, inside the top-level `beforeEach` (after `mockResolveMySchool.mockResolvedValue(ownerSchool);`), add a safe default so existing GET tests keep a well-formed payload:

```ts
  prismaMock.gradeLevel.findMany.mockResolvedValue([]);
```

Then, inside `describe('GET /api/school/academic-year-rollover', …)`, after the test `'existing draft → returns draft fields alongside activeYear/classes/students'`, add:

```ts
  it('includes the school\'s gradeLevels ordered by `order asc` (id/name/order only)', async () => {
    prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(null);
    mockResolveActiveAcademicYear.mockResolvedValueOnce({
      id: 'ay_1',
      label: '2025-2026',
      startDate: new Date('2025-09-01T00:00:00Z'),
    });
    mockGetPromotionData.mockResolvedValueOnce({ classes: [], students: [] });
    prismaMock.gradeLevel.findMany.mockResolvedValueOnce([
      { id: 'l1', name: '6ème', order: 0 },
      { id: 'l2', name: '5ème', order: 1 },
    ] as never);

    const res = await GET(makeReq('GET', URL));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { gradeLevels: unknown[] };
    expect(body.gradeLevels).toEqual([
      { id: 'l1', name: '6ème', order: 0 },
      { id: 'l2', name: '5ème', order: 1 },
    ]);
    expect(prismaMock.gradeLevel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: 'school_1' },
        orderBy: { order: 'asc' },
        select: { id: true, name: true, order: true },
      }),
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/academic-year-rollover/route.test.ts -t "gradeLevels"`
Expected: FAIL — `body.gradeLevels` is `undefined`.

- [ ] **Step 3: Implement**

In `route.ts` GET, replace

```ts
    const { classes, students } = await getPromotionData(mySchool.schoolId, activeYear.id);

    return NextResponse.json(
      {
        draft: draft ? serializeDraft(draft) : null,
        activeYear: { id: activeYear.id, label: activeYear.label },
        classes,
        students,
      },
```

with

```ts
    // `gradeLevels` feeds Step 2's "Suggérer toutes les promotions" — the
    // school's ordered level catalog (Configuration → Niveaux). One extra
    // query in the same request; empty array when the school hasn't
    // configured any (the button then no-ops with a hint).
    const [{ classes, students }, gradeLevels] = await Promise.all([
      getPromotionData(mySchool.schoolId, activeYear.id),
      prisma.gradeLevel.findMany({
        where: { schoolId: mySchool.schoolId },
        orderBy: { order: 'asc' },
        select: { id: true, name: true, order: true },
      }),
    ]);

    return NextResponse.json(
      {
        draft: draft ? serializeDraft(draft) : null,
        activeYear: { id: activeYear.id, label: activeYear.label },
        classes,
        students,
        gradeLevels,
      },
```

Also update the header comment of the route file: after "…via `getPromotionData`);" append " — plus the school's ordered `gradeLevels` for Step 2's auto-suggest;".

- [ ] **Step 4: Run the whole rollover test file**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/academic-year-rollover/route.test.ts`
Expected: PASS — all previous tests + the new one.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/school/academic-year-rollover/route.ts frontend/src/app/api/school/academic-year-rollover/route.test.ts
git commit -m "feat(rollover): GET returns the school's ordered gradeLevels

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Step 2 — "Suggérer toutes les promotions"

**Files:**
- Modify: `frontend/src/lib/constants.ts` (`ACADEMIC_YEAR_ROLLOVER.step2` block)
- Modify: `frontend/src/app/(school)/settings/nouvelle-annee/page.tsx` (`RolloverGetResponse`, state, `load()`, `<Step2Promotion …>` props)
- Modify: `frontend/src/app/(school)/settings/nouvelle-annee/Step2Promotion.tsx` (props, imports, `handleProceed`, help card)

**Interfaces:**
- Consumes: `suggestPromotions`, `hasDestination`, `GradeLevelOption` (Task 6); `gradeLevels` in the GET payload (Task 7).
- Produces: `Step2Promotion` prop `gradeLevels: GradeLevelOption[]` (required).

- [ ] **Step 1: Add the copy**

In `frontend/src/lib/constants.ts`, inside `ACADEMIC_YEAR_ROLLOVER.step2`, after the `help:` line add:

```ts
    suggestAll: 'Suggérer toutes les promotions',
    suggestHint:
      "Configure l'ordre des niveaux dans Configuration > Niveaux pour activer les suggestions automatiques.",
    suggestApplied: (n: number) =>
      n === 1
        ? '1 classe pré-remplie — vérifie et ajuste si besoin.'
        : `${n} classes pré-remplies — vérifie et ajuste si besoin.`,
    suggestNone:
      "Aucune classe à pré-remplir : toutes ont déjà une destination, ou leur niveau n'est pas dans le catalogue (ou est le dernier).",
```

- [ ] **Step 2: Wire the page**

In `page.tsx`:

1. Add the import (next to the other `./` imports):
   ```ts
   import type { GradeLevelOption } from './suggest-promotions';
   ```
2. In `interface RolloverGetResponse`, after `students: StudentForPromotion[];` add:
   ```ts
     gradeLevels: GradeLevelOption[];
   ```
3. After `const [students, setStudents] = useState<StudentForPromotion[]>([]);` add:
   ```ts
     const [gradeLevels, setGradeLevels] = useState<GradeLevelOption[]>([]);
   ```
4. In `load()`, after `setStudents(rollover.students);` add:
   ```ts
           setGradeLevels(rollover.gradeLevels ?? []);
   ```
5. In the `<Step2Promotion` JSX, after `classes={classes}` add:
   ```tsx
               gradeLevels={gradeLevels}
   ```

- [ ] **Step 3: Wire Step2Promotion**

In `Step2Promotion.tsx`:

1. Imports — change `import { Pencil, Plus } from 'lucide-react';` to
   ```ts
   import { Pencil, Plus, Wand2 } from 'lucide-react';
   import Link from 'next/link';
   ```
   and after `import type { ClassForPromotion, ClassMappingEntry } from './types';` add
   ```ts
   import { hasDestination, suggestPromotions, type GradeLevelOption } from './suggest-promotions';
   ```
2. In `interface Step2PromotionProps`, after `classes: ClassForPromotion[];` add:
   ```ts
     /** School's ordered level catalog (Configuration → Niveaux). Empty →
      * the suggest button is a no-op and a hint points to the config page. */
     gradeLevels: GradeLevelOption[];
   ```
3. Destructure it: in `export function Step2Promotion({ classes, allClasses, …` add `gradeLevels,` after `classes,`.
4. After `const [creatingForClassId, setCreatingForClassId] = useState<string | null>(null);` add:
   ```ts
     // Feedback line under the suggest button ("N classes pré-remplies" /
     // "aucune…"). Cleared on the next click.
     const [suggestNotice, setSuggestNotice] = useState<string | null>(null);

     const handleSuggestAll = () => {
       setError('');
       const suggestions = suggestPromotions(classes, gradeLevels, activeMapping);
       // `onMappingChange` is a functional setState in the parent, so a burst
       // of calls in one tick doesn't clobber itself.
       for (const s of suggestions) onMappingChange(s.classId, s.entry);
       setSuggestNotice(
         suggestions.length > 0 ? t.suggestApplied(suggestions.length) : t.suggestNone,
       );
     };
   ```
5. In `handleProceed`, replace the two lines
   ```ts
         const hasDestination =
           Boolean(mapping?.destClassId) || Boolean(mapping?.isNew && mapping?.newClass);
         if (!hasDestination) {
   ```
   with
   ```ts
         if (!hasDestination(mapping)) {
   ```
   (the local `const mapping = activeMapping[cls.id];` line stays).
6. Replace the help card
   ```tsx
         <Card className="p-4 sm:p-6">
           <p className="text-sm text-muted-foreground">{t.help}</p>
         </Card>
   ```
   with
   ```tsx
         <Card className="gap-3 p-4 sm:p-6">
           <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
             <p className="text-sm text-muted-foreground">{t.help}</p>
             <Button
               type="button"
               variant="outline"
               className="w-fit shrink-0"
               onClick={handleSuggestAll}
               disabled={isLoading || classes.length === 0}
             >
               <Wand2 size={14} />
               {t.suggestAll}
             </Button>
           </div>
           {gradeLevels.length === 0 && (
             <p className="text-xs text-muted-foreground">
               {t.suggestHint}{' '}
               <Link href="/configuration/niveaux" className="font-medium text-primary hover:underline">
                 Ouvrir Configuration &gt; Niveaux
               </Link>
             </p>
           )}
           {suggestNotice && (
             <p role="status" className="text-xs text-muted-foreground">
               {suggestNotice}
             </p>
           )}
         </Card>
   ```

- [ ] **Step 4: Typecheck, lint, existing tests**

Run: `pnpm typecheck && pnpm lint && pnpm --filter frontend exec vitest run "src/app/(school)/settings/nouvelle-annee" src/lib/layout.test.ts`
Expected: all PASS. (`page.tsx` is the only consumer of `Step2Promotion`, so making `gradeLevels` required can't break another call site — typecheck confirms.)

- [ ] **Step 5: Browser check of the wizard**

With `pnpm dev` running and logged in as the OWNER test account, having configured levels 6ème → 5ème → 4ème → 3ème in `/configuration/niveaux`:
1. Open `/settings/nouvelle-annee`, complete Step 1 (or resume the draft), reach Step 2.
2. Click "Suggérer toutes les promotions": every class whose level is in the catalog and not last gets a "create new" destination with the substring-replaced name (e.g. "6ème A" → "5ème A", level 5ème); the notice reads "N classes pré-remplies…"; classes at the last level stay unmapped.
3. Edit one suggested row via the pencil, then click the button again → the edited row is NOT clobbered.
4. Delete all levels in `/configuration/niveaux`, reload the wizard → the hint with the "Ouvrir Configuration > Niveaux" link shows and the button reports "Aucune classe à pré-remplir…".
5. Proceed to Step 3 → counters reflect the suggested mappings; no console errors.
Same fallback rule as Task 5 Step 4 if no browser automation is available: say so explicitly.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/constants.ts "frontend/src/app/(school)/settings/nouvelle-annee/page.tsx" "frontend/src/app/(school)/settings/nouvelle-annee/Step2Promotion.tsx"
git commit -m "feat(rollover): Step 2 'Suggérer toutes les promotions' from the grade-level catalog

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Docs + full gate

**Files:**
- Modify: `docs/superpowers/specs/2026-08-17-grade-level-ordering-design.md` (status line)
- Modify: `.planning/banani/STATUS.md` (rollover entry: one follow-up bullet)

- [ ] **Step 1: Mark the spec shipped**

In the spec, change `Status: Approved for planning` to `Status: Implemented 2026-08-17 — plan: docs/superpowers/plans/2026-08-17-grade-level-ordering.md`.

- [ ] **Step 2: Record in STATUS.md**

Under the `annee-scolaire-wizard` entry's bullets in `.planning/banani/STATUS.md`, append one bullet:

```md
  - **Follow-up 2026-08-17 — niveaux ordonnés + suggestion automatique** (spec `docs/superpowers/specs/2026-08-17-grade-level-ordering-design.md`, plan `docs/superpowers/plans/2026-08-17-grade-level-ordering.md`) : modèle `GradeLevel` par école (migration `23_grade_level`, catalogue nom + ordre, **aucune FK depuis `Class.level`** qui reste du texte libre), routes `/api/school/grade-levels` (GET/POST), `/[id]` (PATCH/DELETE), `/reorder` (POST, jeu d'ids exact sinon 400 `INVALID_LEVEL_SET`), page `Configuration → Niveaux` (`/configuration/niveaux` : ajout, renommage en modale, ↑/↓, suppression), et à l'étape 2 du wizard le bouton « Suggérer toutes les promotions » (`suggestPromotions()` pur, testé) qui pré-remplit chaque classe non mappée en « créer nouvelle » au niveau suivant (`"3ème A"` → `"2nde A"`, repli sur le nom du niveau nu ; dernier niveau / niveau inconnu → ignoré ; lignes déjà mappées jamais écrasées). Aucun changement de `executeRollover`.
```

Also bump the `Last updated:` line at the top of STATUS.md to mention `grade-level-ordering`.

- [ ] **Step 3: Full pre-commit gate**

Run (repo root): `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: all green. If `pnpm format` rewrites any of THIS feature's files, they get included in the commit below; if it touches the unrelated uncommitted layout files, leave those out of the commit (they were already formatted in the prior session — if format changed them, note it in the report).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-17-grade-level-ordering-design.md .planning/banani/STATUS.md
# plus any feature file rewritten by pnpm format (check `git status --short`; never `git add -A`)
git commit -m "docs(rollover): record grade-level ordering + auto-suggest as shipped

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-review (done while writing)

- **Spec coverage:** Data model → T1. API GET/POST/PATCH/DELETE/reorder + error codes → T2–T4. Configuration → Niveaux page (list, ↑/↓ disabled at ends, rename modal, add at bottom, delete with confirm, empty state copy) + nav → T5. `RolloverGetResponse.gradeLevels` → T7 (server) + T8 (client type). Step 2 button, unmapped-only rule, substring/fallback naming, last-level & unknown-level skip, no clobber on re-click, hint when catalog empty → T6 (logic, tested) + T8 (UI). "No change to executeRollover/Step3/handleProceed validation" → T8 only refactors `handleProceed` to call `hasDestination` with identical semantics (asserted by T6 tests). Testing plan → T2–T4 route tests, T7 regression + new test, T5/T8 manual dev checks.
- **Placeholder scan:** none — every code step is complete.
- **Type consistency:** `GradeLevelOption { id, name, order }` (T6) = wire shape from T2 `LEVEL_SELECT` / T7 select; `LevelNameBody` and `LEVEL_SELECT` exported from T2 and consumed in T3; `hasDestination`/`suggestPromotions` names match between T6 and T8; `Step2Promotion` prop `gradeLevels` matches page wiring.
