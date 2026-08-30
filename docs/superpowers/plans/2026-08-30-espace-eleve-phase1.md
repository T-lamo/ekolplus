# Espace Élève — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a `Student` an optional login (staff-invited, target resolved from the student's own email or a primary guardian's), and land a bare `/eleve` home page so a student account has somewhere real to go after logging in — with zero access to any existing `/api/school/*` route by construction (no `OrganizationMember` row is ever created).

**Architecture:** `Student.userId` links a student to a `User`. Unlike the teacher case, a student-linked account gets no `OrganizationMember` row at all, so every existing `/api/school/*` route already returns `null`/404 for it via `resolveMySchool()` with zero additional lockdown work — this design only extends `resolveMySchool()`'s existing `isPortalOnlyAccount()` check to also look up `Student` (a one-line addition to an already-established extension point). Invitations reuse the generic `createPortalInvite()` helper built by the concurrent Espace Enseignant Phase 1 (`createOrgMembership: false`). The accept page/route pair is NOT shared with the teacher flow (see the design spec's "Correction" note) — this plan builds its own.

**Tech Stack:** Next.js 16 App Router Route Handlers, Prisma 5 / Postgres, Zod, Vitest + `vitest-mock-extended` (`prismaMock`), Resend (via the existing outbox → `EmailQueue` → `email-queue-drain` cron), next-intl (fr/en/ht).

**Spec:** `docs/superpowers/specs/2026-08-30-espace-eleve-design.md`

**Prerequisite:** Do not start this plan until the Espace Enseignant Phase 1 plan (`docs/superpowers/plans/2026-08-30-espace-enseignant-phase1.md`) has shipped and merged — this plan's Task 2 and Task 6 both assume `createPortalInvite()`, `isPortalOnlyAccount()`, the `email.portal_invite` outbox event, `portalInviteEmail()`, and `isTeacherOnly` on `GET /api/auth/me` already exist exactly as written in that plan. Read that plan's Tasks 2, 3, 4, 5, 10, 11 first if anything below looks unfamiliar — this plan assumes their output as a starting point rather than re-describing it.

## Global Constraints

- Every Route Handler `export const runtime = 'nodejs'`.
- Every mutating route calls `verifyCsrf(req)` and `requireAuth()`/school-scoped equivalent, wrapped in `withRequestContext`.
- No protected file (per CLAUDE.md) is touched in this plan. `frontend/src/lib/server/school.ts`, `frontend/prisma/schema.prisma` are **not** protected — free to modify.
- A student-linked account never gets an `OrganizationMember` row — `createPortalInvite()` is always called with `createOrgMembership: false` in this plan.
- The `studentId` used by any new route in this plan is **never** taken from a URL or body parameter — always the session's own resolved `studentId` via `resolveMyStudentProfile`.
- Money/PII/security conventions from CLAUDE.md apply throughout (rate limiting on the accept route, cookies `httpOnly` + `Secure` + `SameSite=Lax`, stable error codes the frontend switches on).
- All new user-facing strings go through next-intl message files (`fr`/`en`/`ht`), one namespace per screen, matching `locales.test.ts`'s key-parity enforcement.
- `pnpm format && pnpm lint && pnpm typecheck && pnpm test` must pass before any commit that isn't explicitly a WIP step.

---

## File Structure

New files this plan creates:
- `frontend/src/lib/server/middleware/require-student.ts` — `requireStudent()` HOF.
- `frontend/src/app/api/school/students/[id]/invite/route.ts` — admin-invite + resend.
- `frontend/src/app/api/school/students/[id]/invite/route.test.ts`
- `frontend/src/app/api/auth/student-invite/accept/route.ts` — public accept + set-password.
- `frontend/src/app/api/auth/student-invite/accept/route.test.ts`
- `frontend/src/app/(auth)/definir-mot-de-passe-eleve/page.tsx` — public accept page.
- `frontend/src/app/(eleve)/eleve/layout.tsx` — mobile-first shell (bare for Phase 1).
- `frontend/src/app/(eleve)/eleve/page.tsx` — bare home page.
- `frontend/src/messages/{fr,en,ht}/setPasswordEleve.json`
- `frontend/src/messages/{fr,en,ht}/elevePortal.json`

Modified files:
- `frontend/prisma/schema.prisma` (+ new migration under `frontend/prisma/migrations/`)
- `frontend/src/lib/server/school.ts` (extend `isPortalOnlyAccount()`; add `MyStudentProfile`/`resolveMyStudentProfile()`)
- `frontend/src/lib/server/school.test.ts`
- `frontend/src/app/(school)/eleves/[id]/page.tsx` (invite/resend UI)
- `frontend/src/messages/{fr,en,ht}/eleves.json` (new `invite` key group)
- `frontend/src/app/api/school/students/[id]/route.ts` (GET: add `userId`, and the linked user's `emailVerifiedAt`, to the response)
- `frontend/src/app/api/auth/me/route.ts` (+ its route.test.ts) — add `isStudentOnly`
- `frontend/src/app/login/page.tsx` — add the student branch to the redirect chain Espace Enseignant's Task 11 already added
- `frontend/src/app/(school)/layout.tsx` — add the student bounce-back guard alongside the teacher one
- `frontend/src/contexts/AuthContext.tsx` — add `isStudentOnly?: boolean` to the user type
- `frontend/src/lib/locales.ts` (register the 2 new namespaces)

---

### Task 1: Schema — `Student.userId`

**Files:**
- Modify: `frontend/prisma/schema.prisma` (the `Student` model, ~line 525; the `User` model relations block, ~line 61-73)
- Create: migration via `pnpm db:migrate:dev` (do not hand-write the SQL)

**Interfaces:**
- Produces: `Student.userId: string | null`, `Student.user?: User | null` relation, `User.studentProfile?: Student | null` relation — consumed by Task 2's `isPortalOnlyAccount()` extension and Task 5's invite route.

- [ ] **Step 1: Add the fields to schema.prisma**

In the `Student` model, add after the existing `feeReminderLogs` relation line:

```prisma
  userId String? @unique
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
```

In the `User` model, add to the relations block (near `teacherProfile`, if the Espace Enseignant plan already landed it — otherwise near `oauthAccounts`):

```prisma
  studentProfile Student?
```

- [ ] **Step 2: Generate and apply the migration**

Run: `pnpm db:migrate:dev` (name it `student_user_link` when prompted)
Expected: a new folder under `frontend/prisma/migrations/` containing an `ALTER TABLE "Student" ADD COLUMN "userId" TEXT; CREATE UNIQUE INDEX ...` migration, purely additive (no drops).

- [ ] **Step 3: Regenerate the Prisma client**

Run: `pnpm --filter frontend exec prisma generate`
Expected: no errors; `Student.userId` and `User.studentProfile` are now valid in generated types (verify with `pnpm typecheck` — should still pass since nothing references the new fields yet).

- [ ] **Step 4: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations
git commit -m "feat(schema): add Student.userId login link"
```

---

### Task 2: `school.ts` — extend the lockdown + add `resolveMyStudentProfile`

**Files:**
- Modify: `frontend/src/lib/server/school.ts` (extends the `isPortalOnlyAccount()` function the Espace Enseignant plan's Task 2 already landed)
- Modify: `frontend/src/lib/server/school.test.ts`

**Interfaces:**
- Consumes: `Student.userId` (Task 1), `prisma`.
- Produces:
  - `isPortalOnlyAccount()` (already exists from the teacher plan) — extended to also return `true` for a student-linked account. Signature unchanged: `(userId: string, schoolId: string): Promise<boolean>`.
  - `interface MyStudentProfile { studentId: string; schoolId: string; classId: string | null; academicYearId: string | null }`
  - `resolveMyStudentProfile(userId: string): Promise<MyStudentProfile | null>` — new, used by Task 3's `requireStudent`.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/lib/server/school.test.ts` (alongside the existing `resolveMySchool`/`resolveMySchoolIncludingTeacher`/`resolveMyTeacherProfile` describe blocks the teacher plan added):

```ts
describe('resolveMySchool — student lockdown', () => {
  it('returns null for a student-linked MEMBER (deny-by-default)', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      organizationId: 'org_1',
      role: 'MEMBER',
      organization: { school: { id: 'school_1' } },
    } as never);
    prismaMock.teacher.findFirst.mockResolvedValue(null as never);
    prismaMock.student.findFirst.mockResolvedValue({ id: 'student_1' } as never);
    expect(await resolveMySchool('user_1')).toBeNull();
  });
});

describe('resolveMyStudentProfile', () => {
  it('returns null when the user has no Student row', async () => {
    prismaMock.student.findFirst.mockResolvedValue(null as never);
    expect(await resolveMyStudentProfile('user_1')).toBeNull();
  });

  it('returns the current-year classId/academicYearId via the active Enrollment', async () => {
    prismaMock.student.findFirst.mockResolvedValue({
      id: 'student_1',
      schoolId: 'school_1',
      enrollments: [{ classId: 'class_1', academicYearId: 'year_1' }],
    } as never);
    expect(await resolveMyStudentProfile('user_1')).toEqual({
      studentId: 'student_1',
      schoolId: 'school_1',
      classId: 'class_1',
      academicYearId: 'year_1',
    });
  });

  it('returns classId/academicYearId as null when there is no current-year Enrollment', async () => {
    prismaMock.student.findFirst.mockResolvedValue({
      id: 'student_1',
      schoolId: 'school_1',
      enrollments: [],
    } as never);
    expect(await resolveMyStudentProfile('user_1')).toEqual({
      studentId: 'student_1',
      schoolId: 'school_1',
      classId: null,
      academicYearId: null,
    });
  });
});
```

Add the necessary imports at the top of the test file (extend the existing `import { ... } from './school'` line to include `resolveMyStudentProfile`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/lib/server/school.test.ts`
Expected: FAIL — `resolveMyStudentProfile` is not exported yet, and `isPortalOnlyAccount` doesn't check `Student` yet.

- [ ] **Step 3: Implement**

In `frontend/src/lib/server/school.ts`, find the `isPortalOnlyAccount` function (landed by the teacher plan) and extend it:

```ts
// Currently checks Teacher; extended here (2026-08-30, Espace Élève) to also
// check Student — either linked entity makes a MEMBER-role account
// portal-only and denied by resolveMySchool() by default.
async function isPortalOnlyAccount(userId: string, schoolId: string): Promise<boolean> {
  const [teacher, student] = await Promise.all([
    prisma.teacher.findFirst({ where: { userId, schoolId }, select: { id: true } }),
    prisma.student.findFirst({ where: { userId, schoolId }, select: { id: true } }),
  ]);
  return teacher !== null || student !== null;
}
```

Add, after `resolveMyTeacherProfile` (or wherever the teacher-specific helpers end):

```ts
export interface MyStudentProfile {
  studentId: string;
  schoolId: string;
  classId: string | null;
  academicYearId: string | null;
}

// A Student has no classId of its own — it's derived from the current-year
// Enrollment (year-scoped studentId+classId+academicYearId). A student with
// no Enrollment yet for the active year (e.g. mid-rollover) gets nulls
// rather than an error — portal pages that need a class show an empty
// state instead of crashing (see design spec's "no automatic access
// revocation" decision — the account still logs in either way).
export async function resolveMyStudentProfile(userId: string): Promise<MyStudentProfile | null> {
  const student = await prisma.student.findFirst({
    where: { userId },
    select: {
      id: true,
      schoolId: true,
      enrollments: {
        where: { academicYear: { isActive: true } },
        select: { classId: true, academicYearId: true },
        take: 1,
      },
    },
  });
  if (!student) return null;
  const enrollment = student.enrollments[0];
  return {
    studentId: student.id,
    schoolId: student.schoolId,
    classId: enrollment?.classId ?? null,
    academicYearId: enrollment?.academicYearId ?? null,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/lib/server/school.test.ts`
Expected: PASS, all tests (existing teacher ones + the new student ones).

- [ ] **Step 5: Run the FULL test suite — this changes shared behavior**

Run: `pnpm --filter frontend exec vitest run`
Expected: PASS. Same caveat as the teacher plan's Task 2 Step 5: any test exercising the *real* `resolveMySchool()` against `prismaMock` without stubbing `prismaMock.student.findFirst` will now hang/reject on an unmocked call. Grep: `grep -rL "vi.mock('@/lib/server/school'" frontend/src/app/api/school/**/*.test.ts` and add `prismaMock.student.findFirst.mockResolvedValue(null as never)` to any such file's `beforeEach` if it fails.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/school.ts frontend/src/lib/server/school.test.ts
git commit -m "feat(auth): extend portal-only lockdown + add resolveMyStudentProfile"
```

---

### Task 3: `requireStudent()` middleware HOF

**Files:**
- Create: `frontend/src/lib/server/middleware/require-student.ts`
- Create: `frontend/src/lib/server/middleware/require-student.test.ts`

**Interfaces:**
- Consumes: `requireAuth` (`@/lib/server/middleware`, imported not modified), `resolveMyStudentProfile` (Task 2).
- Produces: `requireStudent(req: NextRequest): Promise<StudentContext | NextResponse>` where `StudentContext = { user: AuthContext['user']; student: MyStudentProfile }` — consumed by every `/api/student/*` route in later phases, and by Task 6's accept flow is NOT needed (that route is pre-session).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/server/middleware/require-student.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse, NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/school', () => ({ resolveMyStudentProfile: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { resolveMyStudentProfile } from '@/lib/server/school';
import { requireStudent } from './require-student';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveMyStudentProfile = vi.mocked(resolveMyStudentProfile);

function req() {
  return new NextRequest('http://localhost/api/student/me');
}

beforeEach(() => vi.clearAllMocks());

describe('requireStudent', () => {
  it('returns the 401 from requireAuth unchanged when unauthenticated', async () => {
    const unauth = NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    mockRequireAuth.mockResolvedValue(unauth);
    const result = await requireStudent(req());
    expect(result).toBe(unauth);
  });

  it('returns 404 when the account has no linked Student', async () => {
    mockRequireAuth.mockResolvedValue({ user: { sub: 'user_1', email: 'x@test.local' } } as never);
    mockResolveMyStudentProfile.mockResolvedValue(null);
    const result = await requireStudent(req());
    expect(result).not.toBeInstanceOf(Object); // placeholder replaced below
  });

  it('returns the student context when linked', async () => {
    mockRequireAuth.mockResolvedValue({ user: { sub: 'user_1', email: 'x@test.local' } } as never);
    mockResolveMyStudentProfile.mockResolvedValue({
      studentId: 'student_1',
      schoolId: 'school_1',
      classId: 'class_1',
      academicYearId: 'year_1',
    });
    const result = await requireStudent(req());
    expect(result).toEqual({
      user: { sub: 'user_1', email: 'x@test.local' },
      student: {
        studentId: 'student_1',
        schoolId: 'school_1',
        classId: 'class_1',
        academicYearId: 'year_1',
      },
    });
  });
});
```

Fix the second test's placeholder assertion before running it — replace with a real check:

```ts
  it('returns 404 when the account has no linked Student', async () => {
    mockRequireAuth.mockResolvedValue({ user: { sub: 'user_1', email: 'x@test.local' } } as never);
    mockResolveMyStudentProfile.mockResolvedValue(null);
    const result = await requireStudent(req());
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(404);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/lib/server/middleware/require-student.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/server/middleware/require-student.ts`:

```ts
// requireStudent — mirrors the shape of requireAuth/requireAdmin/
// requireOrgRole (each returns Context | NextResponse) but for a
// Student-linked account. Composes on top of the existing requireAuth
// export rather than duplicating cookie/JWT verification — this file is
// NOT one of CLAUDE.md's 3 protected middleware files, so it's free to
// add, but it never edits requireAuth itself.
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { resolveMyStudentProfile, type MyStudentProfile } from '@/lib/server/school';

export interface StudentContext {
  user: { sub: string; email: string };
  student: MyStudentProfile;
}

export async function requireStudent(req: NextRequest): Promise<StudentContext | NextResponse> {
  const auth = await requireAuth(req.headers.get('authorization'));
  if (auth instanceof NextResponse) return auth;

  const student = await resolveMyStudentProfile(auth.user.sub);
  if (!student) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  return { user: auth.user, student };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/lib/server/middleware/require-student.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/middleware/require-student.ts frontend/src/lib/server/middleware/require-student.test.ts
git commit -m "feat(auth): add requireStudent middleware HOF"
```

---

### Task 4: Expose `Student.userId` + linked-user status from `GET /api/school/students/[id]`

**Files:**
- Modify: `frontend/src/app/api/school/students/[id]/route.ts` (GET handler's `select`/response shape only)
- Modify: `frontend/src/app/api/school/students/[id]/route.test.ts` (check first if it exists; extend if so)

**Interfaces:**
- Produces: the GET response's `student` object gains `userId: string | null` and `userEmailVerifiedAt: string | null` — consumed by Task 7's fiche UI.

- [ ] **Step 1: Write the failing test**

Find the existing GET test file (`find frontend/src/app/api/school/students/\[id\] -name "route.test.ts"`) and add a case to its existing `describe('GET ...')` block (match its existing mocking style for `prismaMock.student.findUnique`):

```ts
it('includes userId and the linked user\'s emailVerifiedAt in the response', async () => {
  prismaMock.student.findUnique.mockResolvedValue({
    id: 's1',
    schoolId: 'school_1',
    userId: 'user_1',
    user: { emailVerifiedAt: new Date('2026-08-01') },
    guardians: [],
    enrollments: [],
    studentNumber: 'EL-1',
    firstName: 'A',
    lastName: 'B',
  } as never);
  const res = await GET(req(), params);
  const json = await res.json();
  expect(json.student.userId).toBe('user_1');
  expect(json.student.userEmailVerifiedAt).toBe('2026-08-01T00:00:00.000Z');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/students/\[id\]/route.test.ts`
Expected: FAIL — `userId`/`userEmailVerifiedAt` not in the response yet.

- [ ] **Step 3: Implement**

In the GET handler's Prisma query, add `userId: true` and a `user: { select: { emailVerifiedAt: true } }` to the existing `select`/`include` block (read the current file first to match its exact style — it likely uses `include` given the `guardians`/`enrollments` relations already there). In the response object construction, add:

```ts
userId: student.userId,
userEmailVerifiedAt: student.user?.emailVerifiedAt ?? null,
```

right after wherever `studentNumber` is already returned.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/students/\[id\]/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/school/students/\[id\]/route.ts frontend/src/app/api/school/students/\[id\]/route.test.ts
git commit -m "feat(students): expose userId + linked-account status on GET /api/school/students/[id]"
```

---

### Task 5: `POST /api/school/students/[id]/invite`

**Files:**
- Create: `frontend/src/app/api/school/students/[id]/invite/route.ts`
- Create: `frontend/src/app/api/school/students/[id]/invite/route.test.ts`

**Interfaces:**
- Consumes: `createPortalInvite` (from the Espace Enseignant Phase 1 — `@/lib/server/portal-invite`), `resolveMySchool`/`hasMinRole` (Task 2 — unchanged signatures).
- Produces: `POST` handler returning `{ ok: true, resent: boolean }` (201) or one of `NOT_FOUND` / `VALIDATION_FAILED` (no resolvable email) / `EMAIL_ALREADY_IN_USE` (400/409) — consumed by Task 7's UI.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/school/students/[id]/invite/route.test.ts` (this mirrors the Espace Enseignant plan's Task 6 test file almost exactly — same mocking shape, `prisma.student` instead of `prisma.teacher`, plus the guardian-fallback case that has no teacher analogue):

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchool: vi.fn() };
});
vi.mock('@/lib/server/portal-invite', () => ({ createPortalInvite: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';
import { createPortalInvite } from '@/lib/server/portal-invite';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);
const mockCreatePortalInvite = vi.mocked(createPortalInvite);

const authUser = { user: { sub: 'admin_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };
const memberSchool = { ...adminSchool, role: 'MEMBER' as const };

function req() {
  return new NextRequest('http://localhost/api/school/students/s1/invite', { method: 'POST' });
}
const params = { params: Promise.resolve({ id: 's1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(adminSchool);
});

describe('POST /api/school/students/[id]/invite', () => {
  it('404s when the student does not belong to this school', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 's1',
      schoolId: 'other_school',
      email: null,
      userId: null,
      guardians: [],
    } as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(404);
  });

  it('rejects a non-admin caller', async () => {
    mockResolveMySchool.mockResolvedValue(memberSchool);
    prismaMock.student.findUnique.mockResolvedValue({
      id: 's1',
      schoolId: 'school_1',
      email: 'x@test.local',
      userId: null,
      guardians: [],
    } as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(403);
  });

  it('rejects a student with no resolvable email (no own email, no guardian email)', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 's1',
      schoolId: 'school_1',
      email: null,
      userId: null,
      guardians: [{ isPrimary: true, email: null }],
    } as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('NO_INVITE_TARGET');
  });

  it("invites using the student's own email when set", async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 's1',
      schoolId: 'school_1',
      email: 'student@test.local',
      userId: null,
      guardians: [{ isPrimary: true, email: 'parent@test.local' }],
    } as never);
    mockCreatePortalInvite.mockResolvedValue({ ok: true, userId: 'user_new' });
    const res = await POST(req(), params);
    expect(res.status).toBe(201);
    expect(mockCreatePortalInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'student@test.local',
        inviteType: 'STUDENT_INVITE',
        createOrgMembership: false,
      }),
    );
  });

  it("falls back to the primary guardian's email when the student has none", async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 's1',
      schoolId: 'school_1',
      email: null,
      userId: null,
      guardians: [
        { isPrimary: false, email: 'other@test.local' },
        { isPrimary: true, email: 'parent@test.local' },
      ],
    } as never);
    mockCreatePortalInvite.mockResolvedValue({ ok: true, userId: 'user_new' });
    const res = await POST(req(), params);
    expect(res.status).toBe(201);
    expect(mockCreatePortalInvite).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'parent@test.local' }),
    );
  });

  it('links Student.userId via the linkExisting callback', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 's1',
      schoolId: 'school_1',
      email: 'student@test.local',
      userId: null,
      guardians: [],
    } as never);
    mockCreatePortalInvite.mockResolvedValue({ ok: true, userId: 'user_new' });
    await POST(req(), params);
    const callback = mockCreatePortalInvite.mock.calls[0]![0].linkExisting;
    await callback(prismaMock as never, 'user_new');
    expect(prismaMock.student.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { userId: 'user_new' },
    });
  });

  it('treats an already-linked student as a resend, not an error', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 's1',
      schoolId: 'school_1',
      email: 'student@test.local',
      userId: 'user_existing',
      guardians: [],
    } as never);
    prismaMock.verificationCode.updateMany.mockResolvedValue({ count: 1 } as never);
    mockCreatePortalInvite.mockResolvedValue({ ok: true, userId: 'user_existing' });
    const res = await POST(req(), params);
    expect(res.status).toBe(201);
    expect((await res.json()).resent).toBe(true);
    expect(prismaMock.verificationCode.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_existing', type: 'STUDENT_INVITE', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('surfaces EMAIL_ALREADY_IN_USE from createPortalInvite', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 's1',
      schoolId: 'school_1',
      email: 'student@test.local',
      userId: null,
      guardians: [],
    } as never);
    mockCreatePortalInvite.mockResolvedValue({ ok: false, error: 'EMAIL_ALREADY_IN_USE' });
    const res = await POST(req(), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('EMAIL_ALREADY_IN_USE');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/students/\[id\]/invite/route.test.ts`
Expected: FAIL — route module doesn't exist.

- [ ] **Step 3: Implement**

Create `frontend/src/app/api/school/students/[id]/invite/route.ts`:

```ts
// POST /api/school/students/[id]/invite — admin invites a student to log
// in. Target email resolution: the student's own email if set, otherwise
// the primary guardian's email (the resulting account is always a STUDENT
// account regardless of which address received the invite — see design
// spec's "Invitation target" decision). Calling this again on an
// already-linked student is a resend (invalidate the previous unused
// invite code, issue a fresh one), not an error — same convention as the
// teacher invite route.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { createPortalInvite } from '@/lib/server/portal-invite';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — same reasoning as the teacher invite (onboarding link, not a security code)

function resolveInviteTarget(student: {
  email: string | null;
  guardians: { isPrimary: boolean; email: string | null }[];
}): string | null {
  if (student.email) return student.email;
  return student.guardians.find((g) => g.isPrimary && g.email)?.email ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const csrfError = verifyCsrf(req);
    if (csrfError) return csrfError;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Admin role required' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const student = await prisma.student.findUnique({
      where: { id },
      include: { guardians: { select: { isPrimary: true, email: true } } },
    });
    if (!student || student.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const targetEmail = resolveInviteTarget(student);
    if (!targetEmail) {
      return NextResponse.json(
        {
          error: 'NO_INVITE_TARGET',
          message: 'This student has no email on file and no primary guardian email.',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (student.userId) {
      await prisma.verificationCode.updateMany({
        where: { userId: student.userId, type: 'STUDENT_INVITE', usedAt: null },
        data: { usedAt: new Date() },
      });
      const result = await createPortalInvite({
        schoolId: mySchool.schoolId,
        organizationId: mySchool.organizationId,
        email: targetEmail,
        inviteType: 'STUDENT_INVITE',
        portalLabel: 'espace élève',
        expiresInMs: INVITE_TTL_MS,
        createOrgMembership: false,
        linkExisting: async () => {}, // already linked
      });
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error, message: 'This email is already in use.' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      return NextResponse.json(
        { ok: true, resent: true },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const result = await createPortalInvite({
      schoolId: mySchool.schoolId,
      organizationId: mySchool.organizationId,
      email: targetEmail,
      inviteType: 'STUDENT_INVITE',
      portalLabel: 'espace élève',
      expiresInMs: INVITE_TTL_MS,
      createOrgMembership: false,
      linkExisting: async (tx, userId) => {
        await tx.student.update({ where: { id: student.id }, data: { userId } });
      },
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, message: 'This email is already in use.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      { ok: true, resent: false },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/students/\[id\]/invite/route.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/school/students/\[id\]/invite
git commit -m "feat(students): add POST /api/school/students/[id]/invite"
```

---

### Task 6: `POST /api/auth/student-invite/accept`

**Files:**
- Create: `frontend/src/app/api/auth/student-invite/accept/route.ts`
- Create: `frontend/src/app/api/auth/student-invite/accept/route.test.ts`

**Interfaces:**
- Consumes: `VERIFICATION_CODE_REGEX`, `hashPassword`, `setAuthCookies`, `setCsrfCookie`, `createAccessToken`, `createRefreshToken`, `timingSafeCompare` (all from `@/lib/server/auth`, called not modified), `isBanned`, `isPwned`.
- Produces: `POST` handler, `{ ok: true, user: { sub, email } }` on success, issuing the standard auth cookies — consumed by Task 8's page.

This task is a direct structural mirror of the Espace Enseignant plan's Task 8 (`/api/auth/teacher-invite/accept`) — same validation, same rate limiter, same password checks, same transaction shape. Only the `VerificationCode.type` filter (`'STUDENT_INVITE'` instead of `'TEACHER_INVITE'`), the rate-limit bucket name, and the log line differ.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/auth/student-invite/accept/route.test.ts` — copy the Espace Enseignant plan's Task 8 test file verbatim, with these substitutions: import `POST` from `./route` (this file), and in every `verificationCode.findFirst` mock call's expected `where`, `type: 'STUDENT_INVITE'` instead of `'TEACHER_INVITE'`. The four test cases (unknown email, wrong/used code, expired code, success) are otherwise identical in shape:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/redis', () => ({ redis: null }));
vi.mock('@/lib/server/auth/banned-passwords', () => ({ isBanned: vi.fn().mockReturnValue(false) }));
vi.mock('@/lib/server/auth/hibp', () => ({ isPwned: vi.fn().mockResolvedValue(false) }));

import { POST } from './route';

function req(body: unknown) {
  return new NextRequest('http://localhost/api/auth/student-invite/accept', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  email: 'student@school.test',
  code: 'ABCD2345',
  newPassword: 'a-long-enough-password',
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('POST /api/auth/student-invite/accept', () => {
  it('returns VERIFICATION_CODE_INVALID for an unknown email', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null as never);
    const res = await POST(req(validBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VERIFICATION_CODE_INVALID');
  });

  it('returns VERIFICATION_CODE_INVALID for a wrong/used code', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'student@school.test',
      tokenVersion: 0,
    } as never);
    prismaMock.verificationCode.findFirst.mockResolvedValue(null as never);
    const res = await POST(req(validBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VERIFICATION_CODE_INVALID');
  });

  it('returns VERIFICATION_CODE_EXPIRED for an expired code', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'student@school.test',
      tokenVersion: 0,
    } as never);
    prismaMock.verificationCode.findFirst.mockResolvedValue({
      id: 'code_1',
      code: 'ABCD2345',
      expiresAt: new Date(Date.now() - 1000),
    } as never);
    const res = await POST(req(validBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VERIFICATION_CODE_EXPIRED');
  });

  it('sets the password, marks the code used, and issues cookies on success', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'student@school.test',
      tokenVersion: 0,
    } as never);
    prismaMock.verificationCode.findFirst.mockResolvedValue({
      id: 'code_1',
      code: 'ABCD2345',
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    prismaMock.verificationCode.updateMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_1' },
        data: expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/auth/student-invite/accept/route.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `frontend/src/app/api/auth/student-invite/accept/route.ts` — copy the Espace Enseignant plan's Task 8 implementation verbatim, with these substitutions: `type: 'TEACHER_INVITE'` → `type: 'STUDENT_INVITE'` in the `verificationCode.findFirst` where clause, rate-limit `bucket: 'auth:teacher-invite-accept'` → `'auth:student-invite-accept'`, and the log line `'teacher-invite accept success'` → `'student-invite accept success'`:

```ts
// POST /api/auth/student-invite/accept — AUTH-style code consumption.
//
// Consumes a STUDENT_INVITE code, hashes the submitted password into
// User.passwordHash, marks emailVerifiedAt, marks the code usedAt, and
// issues all three auth cookies. Direct structural mirror of
// /api/auth/teacher-invite/accept (Espace Enseignant Phase 1, Task 8) —
// see that route for the shared reasoning; only the VerificationCode.type
// filter and rate-limit bucket differ.
//
// CSRF carve-out: pre-session route — the CSRF cookie is set HERE on
// success, so calling verifyCsrf would 403 every legitimate request.
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { zEmail } from '@/lib/server/zod-helpers';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import {
  VERIFICATION_CODE_REGEX,
  hashPassword,
  setAuthCookies,
  setCsrfCookie,
  createAccessToken,
  createRefreshToken,
  timingSafeCompare,
} from '@/lib/server/auth';
import { isBanned } from '@/lib/server/auth/banned-passwords';
import { isPwned } from '@/lib/server/auth/hibp';

const PASSWORD_MIN = Number(process.env.AUTH_PASSWORD_MIN_LENGTH ?? 10);

const Body = z.object({
  email: zEmail,
  code: z.string().regex(VERIFICATION_CODE_REGEX, 'Invalid verification code format'),
  newPassword: z.string().min(1),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'auth:student-invite-accept',
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_VERIFY_RATE_LIMIT_MAX ?? 5),
  code: 'TOO_MANY_VERIFY_ATTEMPTS',
  message: 'Too many attempts. Try again later.',
});

function formatIssues(err: z.ZodError) {
  return err.issues.map((e) => ({ path: e.path.join('.'), message: e.message }));
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      const res = NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: formatIssues(parsed.error) },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    const { email, code, newPassword } = parsed.data;

    const rateFail = await limiter.check(req, email);
    if (rateFail) return rateFail;

    if (isBanned(newPassword)) {
      const res = NextResponse.json(
        { error: 'PASSWORD_BANNED', message: 'This password is too common.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (newPassword.length < PASSWORD_MIN) {
      const res = NextResponse.json(
        { error: 'PASSWORD_TOO_SHORT', message: `Password must be at least ${PASSWORD_MIN} characters` },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (process.env.PASSWORD_HIBP_CHECK === '1' && (await isPwned(newPassword))) {
      const res = NextResponse.json(
        { error: 'PASSWORD_PWNED', message: 'This password appeared in a known data breach.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, tokenVersion: true },
    });
    if (!user) {
      const res = NextResponse.json(
        { error: 'VERIFICATION_CODE_INVALID', message: 'Verification code is invalid.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    const codeRow = await prisma.verificationCode.findFirst({
      where: { userId: user.id, code, type: 'STUDENT_INVITE', usedAt: null },
      select: { id: true, code: true, expiresAt: true },
    });
    if (!codeRow) {
      const res = NextResponse.json(
        { error: 'VERIFICATION_CODE_INVALID', message: 'Verification code is invalid.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (codeRow.expiresAt.getTime() < Date.now()) {
      const res = NextResponse.json(
        { error: 'VERIFICATION_CODE_EXPIRED', message: 'Verification code has expired.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (!timingSafeCompare(code, codeRow.code)) {
      const res = NextResponse.json(
        { error: 'VERIFICATION_CODE_INVALID', message: 'Verification code is invalid.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    const passwordHash = await hashPassword(newPassword);

    try {
      await prisma.$transaction(async (tx) => {
        const consumed = await tx.verificationCode.updateMany({
          where: { id: codeRow.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (consumed.count === 0) {
          throw new Error('VERIFICATION_CODE_RACE');
        }
        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash, emailVerifiedAt: new Date() },
        });
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'VERIFICATION_CODE_RACE') {
        const res = NextResponse.json(
          { error: 'VERIFICATION_CODE_INVALID', message: 'Verification code is invalid.' },
          { status: 400 },
        );
        res.headers.set('x-request-id', ctx.requestId);
        return res;
      }
      throw err;
    }

    const access = await createAccessToken({ sub: user.id, email: user.email, tokenVersion: user.tokenVersion });
    const refresh = await createRefreshToken(user.id, user.tokenVersion);
    await setAuthCookies(access, refresh);
    await setCsrfCookie();

    log.info('student-invite accept success', { userId: user.id });
    const res = NextResponse.json({ ok: true, user: { sub: user.id, email: user.email } });
    res.headers.set('x-request-id', ctx.requestId);
    return res;
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/auth/student-invite/accept/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/auth/student-invite
git commit -m "feat(auth): add POST /api/auth/student-invite/accept"
```

---

### Task 7: Élève fiche UI — invite / resend

**Files:**
- Modify: `frontend/src/app/(school)/eleves/[id]/page.tsx` (the "Informations" tab's `personalInfo` Card — read the file first, the exact insertion point is right after the `edit` button row inside that Card, ~line 320-330 as of this plan's writing but re-check since this file is actively maintained)
- Modify: `frontend/src/messages/{fr,en,ht}/eleves.json`

**Interfaces:**
- Consumes: `POST /api/school/students/[id]/invite` (Task 5) via the existing `api()` wrapper (`@/lib/api`); `student.userId`/`student.userEmailVerifiedAt` (Task 4).
- Produces: nothing consumed by later tasks — this is a leaf UI task.

- [ ] **Step 1: Add the `invite` message group**

To each of `frontend/src/messages/fr/eleves.json`, `en/eleves.json`, `ht/eleves.json`, add a top-level `invite` object (read each file first to match its exact indentation/quoting style):

fr:
```json
"invite": {
  "button": "Inviter à se connecter",
  "buttonDisabledNoEmail": "Ajoutez un email (élève ou tuteur principal) pour pouvoir inviter cet élève",
  "resendButton": "Renvoyer l'invitation",
  "pendingSince": "Invitation envoyée",
  "activeSince": "Compte actif",
  "sentToast": "Invitation envoyée.",
  "resentToast": "Invitation renvoyée.",
  "errorEmailInUse": "Cette adresse email est déjà utilisée par un autre compte.",
  "errorNoTarget": "Ajoutez un email (élève ou tuteur principal) avant d'inviter."
}
```

en:
```json
"invite": {
  "button": "Invite to log in",
  "buttonDisabledNoEmail": "Add an email (student or primary guardian) to invite this student",
  "resendButton": "Resend invitation",
  "pendingSince": "Invitation sent",
  "activeSince": "Account active",
  "sentToast": "Invitation sent.",
  "resentToast": "Invitation resent.",
  "errorEmailInUse": "This email is already used by another account.",
  "errorNoTarget": "Add an email (student or primary guardian) before inviting."
}
```

ht:
```json
"invite": {
  "button": "Envite pou konekte",
  "buttonDisabledNoEmail": "Ajoute yon imèl (elèv oswa tutè prensipal) pou envite elèv sa a",
  "resendButton": "Voye envitasyon an ankò",
  "pendingSince": "Envitasyon voye",
  "activeSince": "Kont aktif",
  "sentToast": "Envitasyon voye.",
  "resentToast": "Envitasyon voye ankò.",
  "errorEmailInUse": "Imèl sa a deja itilize pa yon lòt kont.",
  "errorNoTarget": "Ajoute yon imèl (elèv oswa tutè prensipal) anvan w envite."
}
```

- [ ] **Step 2: Add the invite/resend UI**

In `frontend/src/app/(school)/eleves/[id]/page.tsx`, add `const tInvite = useTranslations('Eleves.invite');` alongside the page's existing `useTranslations` calls (`t`, `tStatus`, `tOrdinal`). Confirm `api`, `ApiError`, `useToast` are already imported (the page already uses `useToast` at line 77) — add `import { api, ApiError } from '@/lib/api';` if not already present.

Inside the `personalInfo` Card (the block starting at the `t('personalInfo')` heading), right after the existing edit-button row `<div className="mb-3.5 flex items-center justify-between">...</div>`, add:

```tsx
<div className="mb-3.5 flex items-center justify-between border-b border-border pb-3">
  {student.userId === null ? (
    <>
      <span className="text-xs text-muted-foreground">{tInvite('button')}</span>
      <Button
        size="sm"
        disabled={!student.email && !student.guardians.some((g) => g.isPrimary && g.email)}
        title={
          !student.email && !student.guardians.some((g) => g.isPrimary && g.email)
            ? tInvite('buttonDisabledNoEmail')
            : undefined
        }
        onClick={async () => {
          try {
            await api(`/api/school/students/${student.id}/invite`, { method: 'POST' });
            toast(tInvite('sentToast'), 'success');
            router.refresh();
          } catch (err) {
            toast(
              err instanceof ApiError && err.code === 'EMAIL_ALREADY_IN_USE'
                ? tInvite('errorEmailInUse')
                : err instanceof ApiError && err.code === 'NO_INVITE_TARGET'
                  ? tInvite('errorNoTarget')
                  : tCommon('errors.network'),
              'error',
            );
          }
        }}
      >
        {tInvite('button')}
      </Button>
    </>
  ) : student.userEmailVerifiedAt ? (
    <span className="text-xs text-muted-foreground">{tInvite('activeSince')}</span>
  ) : (
    <>
      <span className="text-xs text-muted-foreground">{tInvite('pendingSince')}</span>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          try {
            await api(`/api/school/students/${student.id}/invite`, { method: 'POST' });
            toast(tInvite('resentToast'), 'success');
          } catch {
            toast(tCommon('errors.network'), 'error');
          }
        }}
      >
        {tInvite('resendButton')}
      </Button>
    </>
  )}
</div>
```

Note: `student.userId`/`student.userEmailVerifiedAt` come from Task 4's response addition — confirm `tCommon` (a `useTranslations('Common')` instance) already exists on this page; if not, add it alongside the other `useTranslations` calls. `router` must already be in scope (the page navigates elsewhere) — if not, add `const router = useRouter();` from `next/navigation`.

- [ ] **Step 3: Manual verification**

Run `pnpm dev`, open a student fiche with an email set, click "Inviter à se connecter", confirm the toast and that re-opening the fiche shows the pending state. Confirm the disabled state + tooltip when neither the student nor a primary guardian has an email.

- [ ] **Step 4: Run the full gate and commit**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: all clean.

```bash
git add "frontend/src/app/(school)/eleves/[id]/page.tsx" frontend/src/messages/*/eleves.json
git commit -m "feat(eleves): add invite-to-login action on the student fiche"
```

---

### Task 8: `/definir-mot-de-passe-eleve` public page

**Files:**
- Create: `frontend/src/app/(auth)/definir-mot-de-passe-eleve/page.tsx` (check first, per Task 8's own Step 1, whether `(auth)` exists as a route group in this codebase — if `/login`/`/reset-password` live ungrouped at the app root, create this ungrouped too, at `frontend/src/app/definir-mot-de-passe-eleve/page.tsx`)
- Create: `frontend/src/messages/{fr,en,ht}/setPasswordEleve.json`
- Modify: `frontend/src/lib/locales.ts` (register `setPasswordEleve` in `MESSAGE_NAMESPACES`)

**Interfaces:**
- Consumes: `POST /api/auth/student-invite/accept` (Task 6) via `@/lib/api`'s `api()` wrapper.

- [ ] **Step 1: Check the existing auth pages' location**

Run: `find frontend/src/app -maxdepth 1 -iname "reset-password" -o -maxdepth 1 -iname "verify-email"`
Use whatever structure that reveals (route group or flat) — and check whether the Espace Enseignant plan's own Task 9 already created a `(auth)` group when its `/definir-mot-de-passe` page landed; if so, put this page as a sibling inside that same group.

- [ ] **Step 2: Create the message files**

`frontend/src/messages/fr/setPasswordEleve.json`:
```json
{
  "title": "Définir votre mot de passe",
  "subtitle": "Vous avez été invité(e) à rejoindre votre espace élève.",
  "passwordLabel": "Nouveau mot de passe",
  "submit": "Créer mon compte",
  "submitting": "Création en cours…",
  "success": "Compte créé, vous êtes connecté(e).",
  "errors": {
    "VERIFICATION_CODE_INVALID": "Ce lien n'est plus valide.",
    "VERIFICATION_CODE_EXPIRED": "Ce lien a expiré — demandez une nouvelle invitation.",
    "PASSWORD_TOO_SHORT": "Mot de passe trop court.",
    "PASSWORD_BANNED": "Ce mot de passe est trop courant.",
    "PASSWORD_PWNED": "Ce mot de passe est apparu dans une fuite de données connue.",
    "generic": "Une erreur est survenue."
  }
}
```

`frontend/src/messages/en/setPasswordEleve.json`:
```json
{
  "title": "Set your password",
  "subtitle": "You've been invited to your student portal.",
  "passwordLabel": "New password",
  "submit": "Create my account",
  "submitting": "Creating…",
  "success": "Account created, you're signed in.",
  "errors": {
    "VERIFICATION_CODE_INVALID": "This link is no longer valid.",
    "VERIFICATION_CODE_EXPIRED": "This link has expired — ask for a new invitation.",
    "PASSWORD_TOO_SHORT": "Password too short.",
    "PASSWORD_BANNED": "This password is too common.",
    "PASSWORD_PWNED": "This password appeared in a known data breach.",
    "generic": "Something went wrong."
  }
}
```

`frontend/src/messages/ht/setPasswordEleve.json`:
```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman.",
  "title": "Chwazi modpas ou",
  "subtitle": "Yo envite w nan espas elèv ou.",
  "passwordLabel": "Nouvo modpas",
  "submit": "Kreye kont mwen",
  "submitting": "N ap kreye…",
  "success": "Kont kreye, ou konekte.",
  "errors": {
    "VERIFICATION_CODE_INVALID": "Lyen sa a pa valab ankò.",
    "VERIFICATION_CODE_EXPIRED": "Lyen sa a ekspire — mande yon nouvo envitasyon.",
    "PASSWORD_TOO_SHORT": "Modpas twò kout.",
    "PASSWORD_BANNED": "Modpas sa a twò komen.",
    "PASSWORD_PWNED": "Modpas sa a parèt nan yon fuit done li te ye.",
    "generic": "Yon bagay pa mache."
  }
}
```

- [ ] **Step 3: Register the namespace**

In `frontend/src/lib/locales.ts`, add `'setPasswordEleve'` to the `MESSAGE_NAMESPACES` array (alphabetical position, matching the file's convention — note this sorts differently from the teacher plan's `'setPassword'`, so don't assume adjacency).

- [ ] **Step 4: Implement the page**

Create the page (path per Step 1's finding), modeled on the Espace Enseignant plan's Task 9 page (read it first if it has already landed, to match its exact `Suspense`/layout wrapper) but posting to the student accept route and redirecting to `/eleve`:

```tsx
'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

function SetPasswordEleveForm() {
  const t = useTranslations('SetPasswordEleve');
  const router = useRouter();
  const { refresh } = useAuth();
  const params = useSearchParams();
  const email = params.get('email') ?? '';
  const code = params.get('code') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/student-invite/accept', {
        method: 'POST',
        body: { email, code, newPassword: password },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      router.push('/eleve');
    } catch (err) {
      const knownCode =
        err instanceof ApiError && err.code in t.raw('errors') ? err.code : 'generic';
      setError(t(`errors.${knownCode}` as never));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mx-auto mt-16 max-w-md p-6">
      <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
        <Field
          label={t('passwordLabel')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <Button type="submit" loading={submitting}>
          {submitting ? t('submitting') : t('submit')}
        </Button>
      </form>
    </Card>
  );
}

export default function SetPasswordElevePage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordEleveForm />
    </Suspense>
  );
}
```

(Adjust the `Field`/`Card`/`Button` import paths and prop names to match whatever the Espace Enseignant plan's Task 9 page actually used, once it has landed — this plan writes them per the current `Field`/`Card`/`Button` component APIs as a best-known-shape; re-check against the sibling page before committing if it differs.)

- [ ] **Step 5: Manual verification**

Run `pnpm dev`, invite a student (Task 7's UI), open the invite email link (check the local email log / EmailQueue sink per this project's dev setup), set a password, confirm landing on `/eleve`.

- [ ] **Step 6: Run the full gate and commit**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: all clean.

```bash
git add "frontend/src/app/(auth)/definir-mot-de-passe-eleve" frontend/src/messages/*/setPasswordEleve.json frontend/src/lib/locales.ts
git commit -m "feat(auth): add /definir-mot-de-passe-eleve accept page"
```

---

### Task 9: `isStudentOnly` on `/api/auth/me`

**Files:**
- Modify: `frontend/src/app/api/auth/me/route.ts` (GET handler only)
- Modify: `frontend/src/app/api/auth/me/route.test.ts`

**Interfaces:**
- Consumes: `resolveMyStudentProfile` (Task 2).
- Produces: adds `isStudentOnly: boolean` to the existing `{ user }` response shape, alongside the teacher plan's `isTeacherOnly` — consumed by Task 10's login redirect and layout guard.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/app/api/auth/me/route.test.ts` (alongside the existing `isTeacherOnly` tests the teacher plan added):

```ts
it('reports isStudentOnly=true for a student-linked account', async () => {
  prismaMock.user.findUnique.mockResolvedValue({
    id: 'user_1',
    email: 'student@school.test',
    role: 'STUDENT',
  } as never);
  mockResolveMyStudentProfile.mockResolvedValue({
    studentId: 's1',
    schoolId: 'school_1',
    classId: 'class_1',
    academicYearId: 'year_1',
  });
  const res = await GET(reqWithAuthHeader());
  expect((await res.json()).user.isStudentOnly).toBe(true);
});

it('reports isStudentOnly=false for a plain staff account', async () => {
  mockResolveMyStudentProfile.mockResolvedValue(null);
  const res = await GET(reqWithAuthHeader());
  expect((await res.json()).user.isStudentOnly).toBe(false);
});
```

Add a `vi.mock('@/lib/server/school', ...)` entry for `resolveMyStudentProfile` if the existing mock block (added by the teacher plan's Task 10) doesn't already cover it — extend the same mock factory rather than adding a second one.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/auth/me/route.test.ts`
Expected: FAIL — `isStudentOnly` not in the response yet.

- [ ] **Step 3: Implement**

In `frontend/src/app/api/auth/me/route.ts`'s `GET` handler, alongside the teacher plan's `isTeacherOnly` computation, add:

```ts
import { resolveMyStudentProfile } from '@/lib/server/school';

// ... inside GET, near the isTeacherOnly computation:
const studentProfile = await resolveMyStudentProfile(auth.user.sub);
const isStudentOnly = studentProfile !== null;
```

Add `isStudentOnly` to the returned `user` object literal, right after `isTeacherOnly`:

```ts
      isTeacherOnly,
      isStudentOnly,
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/auth/me/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `pnpm --filter frontend exec vitest run`
Expected: PASS — same caveat as the teacher plan's Task 10 Step 5 regarding `toEqual({ user: ... })` fixtures; add `isStudentOnly: false` to any that need it.

```bash
git add frontend/src/app/api/auth/me
git commit -m "feat(auth): expose isStudentOnly on GET /api/auth/me"
```

---

### Task 10: `/eleve` bare home page + redirects

**Files:**
- Create: `frontend/src/app/(eleve)/eleve/layout.tsx`
- Create: `frontend/src/app/(eleve)/eleve/page.tsx`
- Create: `frontend/src/messages/{fr,en,ht}/elevePortal.json`
- Modify: `frontend/src/lib/locales.ts` (register `elevePortal`)
- Modify: `frontend/src/app/login/page.tsx`
- Modify: `frontend/src/app/(school)/layout.tsx`
- Modify: `frontend/src/contexts/AuthContext.tsx` (add `isStudentOnly?: boolean` to the user type, alongside `isTeacherOnly`)

**Interfaces:**
- Consumes: `useAuth()`/`useUser()` (`@/contexts/AuthContext`) — specifically the `isStudentOnly` field added in Task 9.

- [ ] **Step 1: Message files**

`frontend/src/messages/fr/elevePortal.json`:
```json
{
  "title": "Espace élève",
  "welcome": "Bienvenue, {name}",
  "comingSoon": "Vos notes, présences, emploi du temps, bulletins et appréciations arrivent bientôt ici."
}
```
`frontend/src/messages/en/elevePortal.json`:
```json
{
  "title": "Student space",
  "welcome": "Welcome, {name}",
  "comingSoon": "Your grades, attendance, timetable, report cards and appreciations are coming here soon."
}
```
`frontend/src/messages/ht/elevePortal.json`:
```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman.",
  "title": "Espas elèv",
  "welcome": "Byenveni, {name}",
  "comingSoon": "Nòt, prezans, orè, bilten ak apresyasyon w yo ap vini isit la byento."
}
```

Register `'elevePortal'` in `MESSAGE_NAMESPACES` (`frontend/src/lib/locales.ts`).

- [ ] **Step 2: Bare layout + page**

Create `frontend/src/app/(eleve)/eleve/layout.tsx`:

```tsx
'use client';

import { type ReactNode } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/Skeleton';

// Mobile-first shell for the student-facing portal — deliberately NOT the
// admin (school)/layout.tsx (no SchoolSidebar/SchoolTopbar), matching the
// Espace Enseignant portal's own shell choice. Phase 1 ships this bare;
// the bottom tab bar + Notes/Présences/Bulletins nav is built in later
// phases per docs/superpowers/specs/2026-08-30-espace-eleve-design.md.
export default function EleveLayout({ children }: { children: ReactNode }) {
  const user = useUser();
  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }
  return <div className="mx-auto min-h-screen max-w-lg px-4 py-6">{children}</div>;
}
```

Create `frontend/src/app/(eleve)/eleve/page.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useUser } from '@/contexts/AuthContext';

export default function EspaceElevePage() {
  const t = useTranslations('ElevePortal');
  const user = useUser();
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
      <p className="text-sm text-foreground">{t('welcome', { name: user?.name ?? user?.email ?? '' })}</p>
      <p className="text-sm text-muted-foreground">{t('comingSoon')}</p>
    </div>
  );
}
```

- [ ] **Step 3: Wire the login redirect**

In `frontend/src/app/login/page.tsx`, extend the redirect chain the Espace Enseignant plan's Task 11 already added:

```tsx
      const isPlatformStaff = me?.role === 'SUPERADMIN' || me?.role === 'ADMIN';
      const destination = isPlatformStaff
        ? '/admin'
        : me?.isTeacherOnly
          ? '/espace-enseignant'
          : me?.isStudentOnly
            ? '/eleve'
            : '/dashboard';
      router.push(destination);
```

Add `isStudentOnly?: boolean` to whatever local type `me`/the `AuthContext` user shape uses (`frontend/src/contexts/AuthContext.tsx`, alongside the `isTeacherOnly?: boolean` the teacher plan already added).

- [ ] **Step 4: Add the student bounce-back guard in `(school)/layout.tsx`**

Extend the guard the Espace Enseignant plan's Task 11 Step 4 already added:

```tsx
  useEffect(() => {
    if (user?.isTeacherOnly) {
      router.replace('/espace-enseignant');
    } else if (user?.isStudentOnly) {
      router.replace('/eleve');
    }
  }, [user, router]);

  if (!user || user.isTeacherOnly || user.isStudentOnly) {
```

- [ ] **Step 5: Manual verification**

Run `pnpm dev`, invite a student (Task 7's UI), open the invite email link, set a password, confirm landing on `/eleve`, confirm navigating to `/dashboard` bounces back to `/eleve`, confirm a normal admin login and a teacher-only login are both unaffected.

- [ ] **Step 6: Run the full gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm --filter frontend exec vitest run`
Expected: all clean, full suite green.

- [ ] **Step 7: Commit**

```bash
git add "frontend/src/app/(eleve)" "frontend/src/app/(school)/layout.tsx" frontend/src/app/login/page.tsx frontend/src/contexts/AuthContext.tsx frontend/src/messages/*/elevePortal.json frontend/src/lib/locales.ts
git commit -m "feat(eleve-portal): bare /eleve home + role-aware redirect"
```

---

## Phase 1 exit criteria

- A student with a resolvable email (own or primary guardian's) can be invited from their fiche, receives an email, sets a password, and lands on `/eleve`.
- That account cannot read or write anything under any `/api/school/*` route (verify with a manual `curl -H "Cookie: ..." /api/school/students` returning 404) or navigate to `/dashboard`/`/eleves`/etc. without being bounced back — for free, via `resolveMySchool()`, with zero per-route edits.
- An admin is completely unaffected by any of this — no student account can ever also be an admin (mutually exclusive by construction, no combined-role handling needed).
- `pnpm format && pnpm lint && pnpm typecheck && pnpm test` all pass.
- Nothing in Phases 2-4 of the design spec's rollout (Notes/Présences/Appréciations/Bulletins reusing the existing per-student tab components, then Emploi du temps) exists yet — expected, to be planned in a follow-up plan once Phase 1 ships.

## Self-review notes

- **Spec coverage**: every "Decisions confirmed" item in the design spec has a corresponding task — invitation target resolution (Task 5), `createOrgMembership: false` (Task 5), no automatic `Student.status`-based revocation (Task 2's `resolveMyStudentProfile` returns nulls rather than rejecting, matching the spec's explicit choice), fiche invite/resend UI (Task 7), bare `/eleve` home (Task 10). The "Délier le compte" unlink action and Phases 2-4 are explicitly out of scope for this plan (see design spec's rollout phases) — not a gap, a deferred follow-up plan.
- **Placeholder scan**: none found — every step has concrete code, not a description of code.
- **Type consistency**: `MyStudentProfile` (Task 2) is used identically in Task 3 (`StudentContext.student`) and referenced by name (not redefined) everywhere else. `resolveMyStudentProfile` return shape is consistent across Tasks 2, 3, 9. `createPortalInvite`'s params (`inviteType`, `portalLabel`, `createOrgMembership`, `linkExisting`) are used identically in Task 5 to how the teacher plan's Task 5 defined them — no renamed fields.
- **Scope check**: this plan covers only Phase 1 (Foundation) of the design spec's 4-phase rollout, matching the granularity of the Espace Enseignant Phase 1 plan it mirrors. Phases 2-4 (data views) are intentionally deferred to a follow-up plan, written once Phase 1 has shipped and the exact reused-tab-component wiring can be verified against then-current code.
