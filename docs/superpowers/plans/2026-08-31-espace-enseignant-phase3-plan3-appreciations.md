# Espace Enseignant Phase 3, Plan 3 : Appréciations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers write and publish report-card appreciations for their own subjects, plus the general appreciation for classes they homeroom, from the teacher portal.

**Architecture:** Two new `/api/teacher/*` routes mirror the school appreciations routes with per-teacher DB-checked scoping (`ClassSubject.teacherId` via `resolveMyTeacherProfile`, `Class.homeroomTeacherId` via `homeroomClassIds`, active-year `Enrollment`), always 404 anti-leak. Two new screens under `/espace-enseignant/appreciations`: a class-cards list and a merged detail+saisie screen delta-cloned from the school saisie wizard (no offline queue, teacher portal is online-first). Reuses the school module's pure `types.ts`/`format.ts` and the `Appreciations.*` message namespaces wholesale, with a thin `teacherAppreciations` namespace of its own.

**Tech Stack:** Next.js 16 App Router Route Handlers, Prisma 5 (prismaMock in Vitest), zod, next-intl, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-31-espace-enseignant-phase3-saisie-design.md` (sections « Appréciations enseignant », « GET / PUT / DELETE /api/teacher/students/[id]/appreciations », « Garde-fous et invariants », « Découpage » item 3).

## Global Constraints

- Every Route Handler MUST `export const runtime = 'nodejs'` (runtime-enforcement test fails CI otherwise).
- Guard chain on every `/api/teacher/*` route: `requireAuth` → `resolveMySchoolIncludingTeacher(sub)` → `resolveMyTeacherProfile(sub, schoolId)`; any missing link → **404 NOT_FOUND** (never 403, anti-leak). `verifyCsrf(req)` first on every mutation.
- Ownership is re-checked **in DB on every request** (`ClassSubject.teacherId` via `classSubjectIds`, `Class.homeroomTeacherId` via `homeroomClassIds`, `Enrollment` of the active year), never trusted from the client.
- No `/api/school/*` route is modified. `resolveMySchool()` stays deny-by-default.
- The teacher portal deliberately skips the offline queue: writes are plain `api()` calls (same decision as the Plan 2 grade entry, recorded in CLAUDE.md).
- The Comportement/Investissement/Assiduité `<Select>`s keep their persisted **French values** (only visible labels are translated) — same carve-out as the school module, already documented in CLAUDE.md.
- User-facing strings: no em dashes; use `·` for short label pairings. HT strings carry `"_review": true`.
- Stable error codes: `NOT_FOUND`, `VALIDATION_FAILED`. The frontend switches on `ApiError.code`/status, never on messages.
- Before every commit: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` must pass (the shared-tree pre-commit hook also runs prettier/eslint/tsc on staged files).
- Worktree hygiene: EnterWorktree's default baseRef branches from **origin**, not local develop. After creating the worktree: `git reset --hard develop` then `pnpm install`, and copy `frontend/.env.local` from the main checkout if you need `pnpm dev`. Re-anchor every file path to the worktree.
- **Known concurrent edit:** the main checkout has an uncommitted edit to `frontend/src/messages/fr/teacherPortal.json` (renames `nav.sectionLabel` to « Principal », adds `nav.accountSectionLabel`). Task 4 adds one key (`nav.appreciations`) to the same file's three locales. At merge time, re-check the main checkout's `git status` and resolve by keeping both changes.

---

### Task 1: GET /api/teacher/students/[id]/appreciations

**Files:**
- Create: `frontend/src/app/api/teacher/students/[id]/appreciations/route.ts` (GET only; Task 2 appends PUT/DELETE)
- Test: `frontend/src/app/api/teacher/students/[id]/appreciations/route.test.ts`

**Interfaces:**
- Consumes: `resolveMySchoolIncludingTeacher`, `resolveMyTeacherProfile` from `@/lib/server/school`; `resolveCurrentTerm`, `subjectAverageFor`, `weightedAverage`, `competitionRank` from `@/lib/server/grades`.
- Produces: JSON consumed by Task 6's screen —
  `{ studentId, firstName, lastName, studentNumber, classId, className, isMyHomeroom, terms: [{id,label,order}], resolvedTermId, studentIndex, classSize, prevStudentId, nextStudentId, classmates: [{studentId, firstName, lastName, saisieStatus}], overallAverage, classAverage, rank, rankedCount, general, subjects: [{classSubjectId, subjectId, subjectName, coefficient, average, mention, text, status}] }`.
  `general` and the four rank/average fields are non-null **only when `isMyHomeroom`**; `subjects` covers **only my classSubjects** in the student's class. `classmates.saisieStatus` is `'PUBLISHED' | 'DRAFT' | 'NONE'`: when homeroom, the classmate's general-row status; otherwise `PUBLISHED` when every one of my subjects has a PUBLISHED row for that classmate, `DRAFT` when any row exists, else `NONE`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/teacher/students/[id]/appreciations/route.test.ts`:

```ts
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
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveIncludingTeacher = vi.mocked(resolveMySchoolIncludingTeacher);
const mockResolveMyTeacherProfile = vi.mocked(resolveMyTeacherProfile);

const authUser = { user: { sub: 'user_1', email: 'teacher@test.local' } };
const memberSchool = { schoolId: 'school_1' };
const subjectTeacher = { teacherId: 'teacher_1', classSubjectIds: ['cs_1'], homeroomClassIds: [] };
const homeroomTeacher = {
  teacherId: 'teacher_1',
  classSubjectIds: ['cs_1'],
  homeroomClassIds: ['cls_1'],
};

const callGet = async (id = 'stu_1', qs = '') => {
  const req = new NextRequest(`http://localhost:3000/api/teacher/students/${id}/appreciations${qs}`);
  return GET(req, { params: Promise.resolve({ id }) });
};

function seedHappyPath() {
  prismaMock.classSubject.findMany.mockResolvedValue([
    {
      id: 'cs_1',
      classId: 'cls_1',
      subjectId: 'sub_1',
      coefficient: 3,
      subject: { name: 'Français' },
    },
  ] as never);
  prismaMock.enrollment.findFirst.mockResolvedValue({
    classId: 'cls_1',
    academicYearId: 'year_1',
    class: { id: 'cls_1', name: '3ème A', academicYearId: 'year_1' },
    student: {
      id: 'stu_1',
      firstName: 'Yolande',
      lastName: 'Cadet',
      studentNumber: 'EL-2025-020',
      schoolId: 'school_1',
    },
  } as never);
  prismaMock.term.findMany.mockResolvedValue([
    { id: 'term_1', label: '1er Trimestre', order: 1, startDate: null, endDate: null },
  ] as never);
  prismaMock.enrollment.findMany.mockResolvedValue([
    { studentId: 'stu_1', student: { id: 'stu_1', firstName: 'Yolande', lastName: 'Cadet' } },
    { studentId: 'stu_2', student: { id: 'stu_2', firstName: 'Frantz', lastName: 'Alexis' } },
  ] as never);
  prismaMock.evaluation.findMany.mockResolvedValue([] as never);
  prismaMock.appreciation.findMany.mockResolvedValue([] as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveIncludingTeacher.mockResolvedValue(memberSchool as never);
  mockResolveMyTeacherProfile.mockResolvedValue(subjectTeacher as never);
  seedHappyPath();
});

describe('GET /api/teacher/students/[id]/appreciations', () => {
  it('401s an unauthenticated caller', async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({}, { status: 401 }) as never);
    expect((await callGet()).status).toBe(401);
  });

  it('404s a non-teacher account', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    expect((await callGet()).status).toBe(404);
  });

  it('404s a student outside my classes without leaking existence', async () => {
    prismaMock.enrollment.findFirst.mockResolvedValue(null);
    const res = await callGet('stu_other');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NOT_FOUND');
  });

  it('404s an explicit termId from another year', async () => {
    expect((await callGet('stu_1', '?termId=term_evil')).status).toBe(404);
  });

  it('scopes subjects to my classSubjects and hides rank data when not homeroom', async () => {
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isMyHomeroom).toBe(false);
    expect(body.subjects.map((s: { subjectId: string }) => s.subjectId)).toEqual(['sub_1']);
    expect(body.general).toBeNull();
    expect(body.overallAverage).toBeNull();
    expect(body.rank).toBeNull();
    expect(body.rankedCount).toBe(0);
    expect(body.prevStudentId).toBeNull();
    expect(body.nextStudentId).toBe('stu_2');
  });

  it('never queries the general row for a non-homeroom teacher', async () => {
    await callGet();
    const apprCalls = prismaMock.appreciation.findMany.mock.calls;
    for (const call of apprCalls) {
      const where = (call[0] as { where: { OR?: { subjectId: unknown }[] } }).where;
      expect(where.OR?.some((c) => c.subjectId === null)).not.toBe(true);
    }
  });

  it('returns the general row and rank fields for the homeroom teacher', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(homeroomTeacher as never);
    prismaMock.appreciation.findMany.mockResolvedValue([
      {
        studentId: 'stu_1',
        subjectId: null,
        mention: 'BIEN',
        text: 'Bon trimestre',
        comportement: 'Excellent',
        investissement: null,
        assiduite: null,
        status: 'PUBLISHED',
        createdAt: new Date('2026-01-10'),
        updatedAt: new Date('2026-01-11'),
        author: { name: 'Carline Michel', email: null },
      },
    ] as never);
    const res = await callGet();
    const body = await res.json();
    expect(body.isMyHomeroom).toBe(true);
    expect(body.general).toMatchObject({ mention: 'BIEN', status: 'PUBLISHED' });
    expect(body.rankedCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run "src/app/api/teacher/students/[id]/appreciations/route.test.ts"`
Expected: FAIL (cannot resolve `./route`).

- [ ] **Step 3: Implement the GET handler**

Create `frontend/src/app/api/teacher/students/[id]/appreciations/route.ts`:

```ts
// GET /api/teacher/students/[id]/appreciations?termId= — the teacher-scoped
// mirror of the school appreciations wizard read model: prev/next within
// the class, classmates roster with my saisie progress, one row per MY
// subject in the student's class, and the general row plus overall
// average/rank ONLY when I homeroom the class (bulletin-level data belongs
// to the titulaire). 404 anti-leak everywhere. PUT upserts one row
// (find-then-branch: NULL subjectId does not dedupe in the unique index),
// DELETE removes one row; both re-check ownership in DB. See
// docs/superpowers/specs/2026-08-31-espace-enseignant-phase3-saisie-design.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import {
  competitionRank,
  resolveCurrentTerm,
  subjectAverageFor,
  weightedAverage,
} from '@/lib/server/grades';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function notFound(requestId: string): NextResponse {
  return NextResponse.json(
    { error: 'NOT_FOUND', message: 'Not found' },
    { status: 404, headers: { 'x-request-id': requestId } },
  );
}

// Shared by GET/PUT/DELETE: the caller's teacher profile, their
// classSubjects, and the student's active-year enrollment restricted to the
// caller's classes. Returns null for any scoping failure (one 404 shape).
async function resolveScope(userSub: string, studentId: string) {
  const mySchool = await resolveMySchoolIncludingTeacher(userSub);
  if (!mySchool) return null;
  const myTeacher = await resolveMyTeacherProfile(userSub, mySchool.schoolId);
  if (!myTeacher) return null;

  const myClassSubjects =
    myTeacher.classSubjectIds.length > 0
      ? await prisma.classSubject.findMany({
          where: { id: { in: myTeacher.classSubjectIds } },
          select: {
            id: true,
            classId: true,
            subjectId: true,
            coefficient: true,
            subject: { select: { name: true } },
          },
        })
      : [];
  const myClassIds = [
    ...new Set([...myTeacher.homeroomClassIds, ...myClassSubjects.map((cs) => cs.classId)]),
  ];
  if (myClassIds.length === 0) return null;

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, academicYear: { isActive: true }, classId: { in: myClassIds } },
    select: {
      classId: true,
      academicYearId: true,
      class: { select: { id: true, name: true, academicYearId: true } },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          studentNumber: true,
          schoolId: true,
        },
      },
    },
  });
  if (
    !enrollment ||
    enrollment.student.schoolId !== mySchool.schoolId ||
    enrollment.class.academicYearId !== enrollment.academicYearId
  ) {
    return null;
  }

  const inThisClass = myClassSubjects.filter((cs) => cs.classId === enrollment.classId);
  const isMyHomeroom = myTeacher.homeroomClassIds.includes(enrollment.classId);
  return { mySchool, myTeacher, enrollment, inThisClass, isMyHomeroom };
}

type SaisieStatus = 'PUBLISHED' | 'DRAFT' | 'NONE';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id: studentId } = await params;
    const scope = await resolveScope(auth.user.sub, studentId);
    if (!scope) return notFound(ctx.requestId);
    const { enrollment, inThisClass, isMyHomeroom } = scope;

    const terms = await prisma.term.findMany({
      where: { academicYearId: enrollment.academicYearId },
      orderBy: { order: 'asc' },
      select: { id: true, label: true, order: true, startDate: true, endDate: true },
    });
    const requestedTermId = req.nextUrl.searchParams.get('termId');
    let term = requestedTermId ? (terms.find((t) => t.id === requestedTermId) ?? null) : null;
    if (requestedTermId && !term) return notFound(ctx.requestId);
    const mySubjectIds = inThisClass.map((cs) => cs.subjectId);
    const myScopeOr = [
      ...(mySubjectIds.length > 0 ? [{ subjectId: { in: mySubjectIds } }] : []),
      ...(isMyHomeroom ? [{ subjectId: null }] : []),
    ];
    if (!requestedTermId) {
      // Same default as the school wizard: prefer a term that actually holds
      // data (in MY scope) over the naive current term, so a freshly saved
      // appreciation is never invisible by default.
      const current = resolveCurrentTerm(terms);
      const termIds = terms.map((t) => t.id);
      const existing =
        termIds.length === 0 || myScopeOr.length === 0
          ? []
          : await prisma.appreciation.findMany({
              where: { studentId, termId: { in: termIds }, OR: myScopeOr },
              select: { termId: true },
            });
      const withData = new Set(existing.map((a) => a.termId));
      term =
        current && !withData.has(current.id) && withData.size > 0
          ? (terms.filter((t) => withData.has(t.id)).sort((a, b) => b.order - a.order)[0] ??
            current)
          : current;
    }

    const classmates = await prisma.enrollment.findMany({
      where: { classId: enrollment.classId, academicYearId: enrollment.academicYearId },
      include: { student: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });
    const idx = classmates.findIndex((cm) => cm.studentId === studentId);
    const prevStudentId = idx > 0 ? classmates[idx - 1]!.studentId : null;
    const nextStudentId =
      idx >= 0 && idx < classmates.length - 1 ? classmates[idx + 1]!.studentId : null;

    const shell = {
      studentId,
      firstName: enrollment.student.firstName,
      lastName: enrollment.student.lastName,
      studentNumber: enrollment.student.studentNumber,
      classId: enrollment.classId,
      className: enrollment.class.name,
      isMyHomeroom,
      terms: terms.map((t) => ({ id: t.id, label: t.label, order: t.order })),
      resolvedTermId: term?.id ?? null,
      studentIndex: idx >= 0 ? idx + 1 : null,
      classSize: classmates.length,
      prevStudentId,
      nextStudentId,
    };

    if (!term) {
      return NextResponse.json(
        {
          ...shell,
          classmates: classmates.map((cm) => ({
            studentId: cm.studentId,
            firstName: cm.student.firstName,
            lastName: cm.student.lastName,
            saisieStatus: 'NONE' as SaisieStatus,
          })),
          overallAverage: null,
          classAverage: null,
          rank: null,
          rankedCount: 0,
          general: null,
          subjects: [],
        },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // My subjects: this student's averages only (grades filtered per student).
    const myEvaluations =
      inThisClass.length > 0
        ? await prisma.evaluation.findMany({
            where: { classSubjectId: { in: inThisClass.map((cs) => cs.id) }, termId: term.id },
            include: { grades: { where: { studentId } } },
          })
        : [];

    // Appreciations in my scope, for the whole class in one query: this
    // student's rows feed the form, the classmates' rows feed the roster's
    // saisie progress.
    const classStudentIds = classmates.map((cm) => cm.studentId);
    const scopedAppreciations =
      myScopeOr.length === 0 || classStudentIds.length === 0
        ? []
        : await prisma.appreciation.findMany({
            where: { studentId: { in: classStudentIds }, termId: term.id, OR: myScopeOr },
            include: { author: { select: { name: true, email: true } } },
          });
    const mine = scopedAppreciations.filter((a) => a.studentId === studentId);
    const generalRow = isMyHomeroom ? (mine.find((a) => a.subjectId == null) ?? null) : null;
    const mineBySubject = new Map(
      mine.filter((a) => a.subjectId != null).map((a) => [a.subjectId!, a]),
    );

    function saisieStatusFor(cmId: string): SaisieStatus {
      const rows = scopedAppreciations.filter((a) => a.studentId === cmId);
      if (isMyHomeroom) {
        const general = rows.find((a) => a.subjectId == null);
        return (general?.status as SaisieStatus | undefined) ?? 'NONE';
      }
      const subjectRows = rows.filter((a) => a.subjectId != null);
      if (subjectRows.length === 0) return 'NONE';
      const allPublished =
        subjectRows.length >= mySubjectIds.length &&
        subjectRows.every((a) => a.status === 'PUBLISHED');
      return allPublished ? 'PUBLISHED' : 'DRAFT';
    }

    // Bulletin-level numbers (overall average, class average, rank) span ALL
    // the class's subjects, so they are computed, and disclosed, only for
    // the homeroom teacher.
    let overallAverage: number | null = null;
    let classAverage: number | null = null;
    let rank: number | null = null;
    let rankedCount = 0;
    if (isMyHomeroom) {
      const allClassSubjects = await prisma.classSubject.findMany({
        where: { classId: enrollment.classId },
        select: { id: true, coefficient: true },
      });
      const allEvaluations =
        allClassSubjects.length > 0
          ? await prisma.evaluation.findMany({
              where: {
                classSubjectId: { in: allClassSubjects.map((cs) => cs.id) },
                termId: term.id,
              },
              include: { grades: true },
            })
          : [];
      const evalsByClassSubject = new Map<string, typeof allEvaluations>();
      for (const ev of allEvaluations) {
        const list = evalsByClassSubject.get(ev.classSubjectId) ?? [];
        list.push(ev);
        evalsByClassSubject.set(ev.classSubjectId, list);
      }
      function generalAverageFor(sid: string): number | null {
        const rows = allClassSubjects
          .map((cs) => {
            const avg = subjectAverageFor(evalsByClassSubject.get(cs.id) ?? [], sid);
            return avg != null ? { value: avg, weight: cs.coefficient } : null;
          })
          .filter((r): r is { value: number; weight: number | null } => r != null);
        return weightedAverage(rows);
      }
      overallAverage = generalAverageFor(studentId);
      const averages = classmates
        .map((cm) => ({ studentId: cm.studentId, average: generalAverageFor(cm.studentId) }))
        .filter((r): r is { studentId: string; average: number } => r.average != null)
        .sort((a, b) => b.average - a.average);
      classAverage = averages.length
        ? Math.round((averages.reduce((a, b) => a + b.average, 0) / averages.length) * 10) / 10
        : null;
      const ranks = competitionRank(averages, (r) => r.average);
      const entry = averages.findIndex((r) => r.studentId === studentId);
      rank = entry >= 0 ? ranks[entry]! : null;
      rankedCount = averages.length;
    }

    return NextResponse.json(
      {
        ...shell,
        classmates: classmates.map((cm) => ({
          studentId: cm.studentId,
          firstName: cm.student.firstName,
          lastName: cm.student.lastName,
          saisieStatus: saisieStatusFor(cm.studentId),
        })),
        overallAverage,
        classAverage,
        rank,
        rankedCount,
        general: generalRow
          ? {
              mention: generalRow.mention,
              text: generalRow.text,
              comportement: generalRow.comportement,
              investissement: generalRow.investissement,
              assiduite: generalRow.assiduite,
              status: generalRow.status,
              authorName: generalRow.author?.name ?? generalRow.author?.email ?? null,
              createdAt: generalRow.createdAt,
              updatedAt: generalRow.updatedAt,
            }
          : null,
        subjects: inThisClass.map((cs) => {
          const appr = mineBySubject.get(cs.subjectId);
          const evals = myEvaluations.filter((e) => e.classSubjectId === cs.id);
          return {
            classSubjectId: cs.id,
            subjectId: cs.subjectId,
            subjectName: cs.subject.name,
            coefficient: cs.coefficient,
            average: subjectAverageFor(evals, studentId),
            mention: appr?.mention ?? null,
            text: appr?.text ?? null,
            status: appr?.status ?? 'NONE',
          };
        }),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run "src/app/api/teacher/students/[id]/appreciations/route.test.ts"`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/api/teacher/students/[id]/appreciations/route.ts" "frontend/src/app/api/teacher/students/[id]/appreciations/route.test.ts"
git commit --only "frontend/src/app/api/teacher/students/[id]/appreciations/route.ts" --only "frontend/src/app/api/teacher/students/[id]/appreciations/route.test.ts" -m "feat(teacher): appreciation read model scoped to my subjects and homerooms"
```

---

### Task 2: PUT and DELETE /api/teacher/students/[id]/appreciations

**Files:**
- Modify: `frontend/src/app/api/teacher/students/[id]/appreciations/route.ts` (append PUT + DELETE; `z`, `verifyCsrf` already imported in Task 1)
- Test: `frontend/src/app/api/teacher/students/[id]/appreciations/route.test.ts` (append two describes)

**Interfaces:**
- Consumes: `resolveScope` from Task 1 (same file).
- Produces: `PUT` body `{ termId, subjectId: string|null, mention?, text?, comportement?, investissement?, assiduite?, status? }` → `{ appreciation }`; `DELETE ?termId=&subjectId=` → 204. Task 6's screen calls both.

- [ ] **Step 1: Append the failing tests**

Append to the test file (inside the existing imports/beforeEach; also `import { GET, PUT, DELETE } from './route';` replaces the GET-only import):

```ts
const callPut = async (body: unknown, id = 'stu_1') => {
  const req = new NextRequest(
    `http://localhost:3000/api/teacher/students/${id}/appreciations`,
    { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } },
  );
  return PUT(req, { params: Promise.resolve({ id }) });
};
const callDelete = async (qs: string, id = 'stu_1') => {
  const req = new NextRequest(
    `http://localhost:3000/api/teacher/students/${id}/appreciations${qs}`,
    { method: 'DELETE' },
  );
  return DELETE(req, { params: Promise.resolve({ id }) });
};

describe('PUT /api/teacher/students/[id]/appreciations', () => {
  const validSubjectBody = { termId: 'term_1', subjectId: 'sub_1', text: 'Bon travail', status: 'DRAFT' };

  it('404s a subjectId outside my subjects in this class', async () => {
    const res = await callPut({ ...validSubjectBody, subjectId: 'sub_other' });
    expect(res.status).toBe(404);
    expect(prismaMock.appreciation.create).not.toHaveBeenCalled();
  });

  it('404s the general row for a non-homeroom teacher', async () => {
    const res = await callPut({ termId: 'term_1', subjectId: null, mention: 'BIEN' });
    expect(res.status).toBe(404);
  });

  it('400s a termId outside the enrollment year', async () => {
    const res = await callPut({ ...validSubjectBody, termId: 'term_evil' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('creates a subject row with my userId as author when none exists', async () => {
    prismaMock.appreciation.findFirst.mockResolvedValue(null);
    prismaMock.appreciation.create.mockResolvedValue({ id: 'appr_1' } as never);
    const res = await callPut(validSubjectBody);
    expect(res.status).toBe(200);
    expect(prismaMock.appreciation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: 'stu_1',
        termId: 'term_1',
        subjectId: 'sub_1',
        text: 'Bon travail',
        status: 'DRAFT',
        authorId: 'user_1',
      }),
    });
  });

  it('updates in place when a row exists (find-then-branch, no NULL-dedupe upsert)', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(homeroomTeacher as never);
    prismaMock.appreciation.findFirst.mockResolvedValue({ id: 'appr_1' } as never);
    prismaMock.appreciation.update.mockResolvedValue({ id: 'appr_1' } as never);
    const res = await callPut({ termId: 'term_1', subjectId: null, mention: 'BIEN' });
    expect(res.status).toBe(200);
    expect(prismaMock.appreciation.update).toHaveBeenCalledWith({
      where: { id: 'appr_1' },
      data: expect.objectContaining({ mention: 'BIEN', authorId: 'user_1' }),
    });
    expect(prismaMock.appreciation.create).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/teacher/students/[id]/appreciations', () => {
  it('400s without termId', async () => {
    expect((await callDelete('')).status).toBe(400);
  });

  it('404s the general row for a non-homeroom teacher', async () => {
    expect((await callDelete('?termId=term_1')).status).toBe(404);
  });

  it('deletes my subject row and returns 204', async () => {
    prismaMock.appreciation.findFirst.mockResolvedValue({ id: 'appr_1' } as never);
    prismaMock.appreciation.delete.mockResolvedValue({} as never);
    const res = await callDelete('?termId=term_1&subjectId=sub_1');
    expect(res.status).toBe(204);
    expect(prismaMock.appreciation.delete).toHaveBeenCalledWith({ where: { id: 'appr_1' } });
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm --filter frontend exec vitest run "src/app/api/teacher/students/[id]/appreciations/route.test.ts"`
Expected: FAIL (`PUT is not a function`).

- [ ] **Step 3: Append PUT and DELETE to the route**

```ts
const UpsertAppreciationBody = z.object({
  termId: z.string().min(1),
  subjectId: z.string().min(1).nullable(),
  mention: z
    .enum(['TRES_BIEN', 'BIEN', 'ASSEZ_BIEN', 'PASSABLE', 'INSUFFISANT', 'FAIBLE'])
    .nullable()
    .optional(),
  text: z.string().trim().max(1000).nullable().optional(),
  comportement: z.string().trim().max(60).nullable().optional(),
  investissement: z.string().trim().max(60).nullable().optional(),
  assiduite: z.string().trim().max(60).nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
});

// One scoping rule for both mutations: a non-null subjectId must be one of
// MY subjects in the student's class; the general row (null) requires the
// homeroom. Returns false on any violation (caller answers 404).
function canTouchRow(
  scope: NonNullable<Awaited<ReturnType<typeof resolveScope>>>,
  subjectId: string | null,
): boolean {
  if (subjectId === null) return scope.isMyHomeroom;
  return scope.inThisClass.some((cs) => cs.subjectId === subjectId);
}

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

    const { id: studentId } = await params;
    const scope = await resolveScope(auth.user.sub, studentId);
    if (!scope) return notFound(ctx.requestId);

    const parsed = UpsertAppreciationBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { termId, subjectId } = parsed.data;
    if (!canTouchRow(scope, subjectId)) return notFound(ctx.requestId);

    const term = await prisma.term.findUnique({ where: { id: termId } });
    if (!term || term.academicYearId !== scope.enrollment.academicYearId) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid termId' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const data = {
      mention: parsed.data.mention,
      text: parsed.data.text,
      comportement: parsed.data.comportement,
      investissement: parsed.data.investissement,
      assiduite: parsed.data.assiduite,
      status: parsed.data.status,
      authorId: auth.user.sub,
    };
    const cleanData = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

    const existing = await prisma.appreciation.findFirst({
      where: { studentId, termId, subjectId },
    });
    const appreciation = existing
      ? await prisma.appreciation.update({ where: { id: existing.id }, data: cleanData })
      : await prisma.appreciation.create({ data: { studentId, termId, subjectId, ...cleanData } });

    return NextResponse.json({ appreciation }, { headers: { 'x-request-id': ctx.requestId } });
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

    const { id: studentId } = await params;
    const scope = await resolveScope(auth.user.sub, studentId);
    if (!scope) return notFound(ctx.requestId);

    const termId = req.nextUrl.searchParams.get('termId');
    if (!termId) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'termId is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const subjectId = req.nextUrl.searchParams.get('subjectId');
    if (!canTouchRow(scope, subjectId)) return notFound(ctx.requestId);

    const existing = await prisma.appreciation.findFirst({
      where: { studentId, termId, subjectId },
    });
    if (!existing) return notFound(ctx.requestId);

    await prisma.appreciation.delete({ where: { id: existing.id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 4: Run the file's tests, then the full suite**

Run: `pnpm --filter frontend exec vitest run "src/app/api/teacher/students/[id]/appreciations/route.test.ts"` → PASS.
Run: `pnpm test` → all green (runtime-enforcement picks up the new route automatically).

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/api/teacher/students/[id]/appreciations/route.ts" "frontend/src/app/api/teacher/students/[id]/appreciations/route.test.ts"
git commit --only "frontend/src/app/api/teacher/students/[id]/appreciations/route.ts" --only "frontend/src/app/api/teacher/students/[id]/appreciations/route.test.ts" -m "feat(teacher): write and delete my own appreciations with homeroom-gated general row"
```

---

### Task 3: GET /api/teacher/appreciations (list aggregate)

**Files:**
- Create: `frontend/src/app/api/teacher/appreciations/route.ts`
- Test: `frontend/src/app/api/teacher/appreciations/route.test.ts`

**Interfaces:**
- Produces (consumed by Task 5's list page):
  `{ terms: [{id,label,order}], resolvedTermId, classes: [{ classId, className, level, studentCount, isMyHomeroom, firstStudentId, generalSaisieCount, subjects: [{subjectId, subjectName, saisieCount}] }] }`.
  `classes` = active-year classes where I have a `ClassSubject` or a homeroom, ordered by name; `firstStudentId` = first enrolled student (lastName/firstName) or null; `generalSaisieCount` = PUBLISHED general rows (null unless homeroom); `saisieCount` per subject = PUBLISHED rows for that subject among the class's students.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/teacher/appreciations/route.test.ts` (same mock harness as Task 1, but `import { GET } from './route';` and no `enrollment.findFirst` seed):

```ts
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

const call = async (qs = '') =>
  GET(new NextRequest(`http://localhost:3000/api/teacher/appreciations${qs}`));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveIncludingTeacher.mockResolvedValue({ schoolId: 'school_1' } as never);
  mockResolveMyTeacherProfile.mockResolvedValue({
    teacherId: 'teacher_1',
    classSubjectIds: ['cs_1'],
    homeroomClassIds: ['cls_2'],
  } as never);
  prismaMock.academicYear.findFirst.mockResolvedValue({ id: 'year_1' } as never);
  prismaMock.term.findMany.mockResolvedValue([
    { id: 'term_1', label: '1er Trimestre', order: 1, startDate: null, endDate: null },
  ] as never);
  prismaMock.classSubject.findMany.mockResolvedValue([
    {
      id: 'cs_1',
      classId: 'cls_1',
      subjectId: 'sub_1',
      subject: { name: 'Français' },
      class: { id: 'cls_1', name: '3ème A', level: '3ème', academicYearId: 'year_1' },
    },
  ] as never);
  prismaMock.class.findMany.mockResolvedValue([
    { id: 'cls_2', name: 'Seconde B', level: 'Seconde', academicYearId: 'year_1' },
  ] as never);
  prismaMock.enrollment.findMany.mockResolvedValue([
    {
      classId: 'cls_1',
      studentId: 'stu_1',
      student: { id: 'stu_1', firstName: 'Frantz', lastName: 'Alexis' },
    },
    {
      classId: 'cls_2',
      studentId: 'stu_2',
      student: { id: 'stu_2', firstName: 'Yolande', lastName: 'Cadet' },
    },
  ] as never);
  prismaMock.appreciation.findMany.mockResolvedValue([
    { studentId: 'stu_1', subjectId: 'sub_1', status: 'PUBLISHED' },
    { studentId: 'stu_2', subjectId: null, status: 'DRAFT' },
  ] as never);
});

describe('GET /api/teacher/appreciations', () => {
  it('401s an unauthenticated caller', async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({}, { status: 401 }) as never);
    expect((await call()).status).toBe(401);
  });

  it('404s a non-teacher account', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it('404s an unknown explicit termId', async () => {
    expect((await call('?termId=term_evil')).status).toBe(404);
  });

  it('lists my classes with per-scope saisie progress', async () => {
    const res = await call('?termId=term_1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resolvedTermId).toBe('term_1');
    const byId = Object.fromEntries(
      body.classes.map((c: { classId: string }) => [c.classId, c]),
    );
    expect(byId.cls_1).toMatchObject({
      className: '3ème A',
      isMyHomeroom: false,
      studentCount: 1,
      firstStudentId: 'stu_1',
      generalSaisieCount: null,
      subjects: [{ subjectId: 'sub_1', subjectName: 'Français', saisieCount: 1 }],
    });
    expect(byId.cls_2).toMatchObject({
      className: 'Seconde B',
      isMyHomeroom: true,
      studentCount: 1,
      firstStudentId: 'stu_2',
      generalSaisieCount: 0,
      subjects: [],
    });
  });

  it('returns empty classes when the school has no active year', async () => {
    prismaMock.academicYear.findFirst.mockResolvedValue(null);
    const res = await call();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.classes).toEqual([]);
    expect(body.resolvedTermId).toBeNull();
  });
});
```

(The `generalSaisieCount: 0` expectation for cls_2 is correct: the seeded general row is DRAFT, and only PUBLISHED counts as saisie, mirroring the school list route.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/teacher/appreciations/route.test.ts`
Expected: FAIL (cannot resolve `./route`).

- [ ] **Step 3: Implement the route**

Create `frontend/src/app/api/teacher/appreciations/route.ts`:

```ts
// GET /api/teacher/appreciations?termId= — the Appréciations list screen's
// aggregate: one card per class I teach in or homeroom (active year only),
// with my per-subject PUBLISHED saisie counts, the general-row count when I
// am the homeroom teacher, and the first student to enter the per-student
// wizard on. Mirrors the school classes/[id]/appreciations read model,
// collapsed to one call and scoped to my affectations. 404 anti-leak.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { resolveCurrentTerm } from '@/lib/server/grades';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function notFound(requestId: string): NextResponse {
  return NextResponse.json(
    { error: 'NOT_FOUND', message: 'Not found' },
    { status: 404, headers: { 'x-request-id': requestId } },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchoolIncludingTeacher(auth.user.sub);
    if (!mySchool) return notFound(ctx.requestId);
    const myTeacher = await resolveMyTeacherProfile(auth.user.sub, mySchool.schoolId);
    if (!myTeacher) return notFound(ctx.requestId);

    const activeYear = await prisma.academicYear.findFirst({
      where: { schoolId: mySchool.schoolId, isActive: true },
      select: { id: true },
    });
    if (!activeYear) {
      return NextResponse.json(
        { terms: [], resolvedTermId: null, classes: [] },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const terms = await prisma.term.findMany({
      where: { academicYearId: activeYear.id },
      orderBy: { order: 'asc' },
      select: { id: true, label: true, order: true, startDate: true, endDate: true },
    });
    const requestedTermId = req.nextUrl.searchParams.get('termId');
    const term = requestedTermId
      ? (terms.find((t) => t.id === requestedTermId) ?? null)
      : resolveCurrentTerm(terms);
    if (requestedTermId && !term) return notFound(ctx.requestId);

    const myClassSubjects =
      myTeacher.classSubjectIds.length > 0
        ? await prisma.classSubject.findMany({
            where: { id: { in: myTeacher.classSubjectIds } },
            select: {
              id: true,
              classId: true,
              subjectId: true,
              subject: { select: { name: true } },
              class: { select: { id: true, name: true, level: true, academicYearId: true } },
            },
          })
        : [];
    const homeroomClasses =
      myTeacher.homeroomClassIds.length > 0
        ? await prisma.class.findMany({
            where: { id: { in: myTeacher.homeroomClassIds } },
            select: { id: true, name: true, level: true, academicYearId: true },
          })
        : [];

    // Active-year classes only: a stale ClassSubject from a previous year
    // must not resurface here (same active-year scoping as Mes élèves).
    const classById = new Map<string, { id: string; name: string; level: string | null }>();
    for (const cs of myClassSubjects) {
      if (cs.class.academicYearId === activeYear.id) classById.set(cs.class.id, cs.class);
    }
    for (const c of homeroomClasses) {
      if (c.academicYearId === activeYear.id) classById.set(c.id, c);
    }
    const classIds = [...classById.keys()];

    const enrollments =
      classIds.length > 0
        ? await prisma.enrollment.findMany({
            where: { classId: { in: classIds }, academicYearId: activeYear.id },
            include: { student: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
          })
        : [];
    const enrollmentsByClass = new Map<string, typeof enrollments>();
    for (const en of enrollments) {
      const list = enrollmentsByClass.get(en.classId) ?? [];
      list.push(en);
      enrollmentsByClass.set(en.classId, list);
    }

    const mySubjectIdsByClass = new Map<string, { subjectId: string; subjectName: string }[]>();
    for (const cs of myClassSubjects) {
      if (!classById.has(cs.classId)) continue;
      const list = mySubjectIdsByClass.get(cs.classId) ?? [];
      list.push({ subjectId: cs.subjectId, subjectName: cs.subject.name });
      mySubjectIdsByClass.set(cs.classId, list);
    }

    const allStudentIds = enrollments.map((en) => en.studentId);
    const allMySubjectIds = [...new Set(myClassSubjects.map((cs) => cs.subjectId))];
    const scopeOr = [
      ...(allMySubjectIds.length > 0 ? [{ subjectId: { in: allMySubjectIds } }] : []),
      ...(myTeacher.homeroomClassIds.length > 0 ? [{ subjectId: null }] : []),
    ];
    const appreciations =
      term && allStudentIds.length > 0 && scopeOr.length > 0
        ? await prisma.appreciation.findMany({
            where: { studentId: { in: allStudentIds }, termId: term.id, OR: scopeOr },
            select: { studentId: true, subjectId: true, status: true },
          })
        : [];
    const studentClass = new Map(enrollments.map((en) => [en.studentId, en.classId]));

    const classes = [...classById.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => {
        const classEnrollments = enrollmentsByClass.get(c.id) ?? [];
        const isMyHomeroom = myTeacher.homeroomClassIds.includes(c.id);
        const mySubjects = mySubjectIdsByClass.get(c.id) ?? [];
        const classAppr = appreciations.filter((a) => studentClass.get(a.studentId) === c.id);
        return {
          classId: c.id,
          className: c.name,
          level: c.level,
          studentCount: classEnrollments.length,
          isMyHomeroom,
          firstStudentId: classEnrollments[0]?.studentId ?? null,
          generalSaisieCount: isMyHomeroom
            ? classAppr.filter((a) => a.subjectId === null && a.status === 'PUBLISHED').length
            : null,
          subjects: mySubjects.map((s) => ({
            subjectId: s.subjectId,
            subjectName: s.subjectName,
            saisieCount: classAppr.filter(
              (a) => a.subjectId === s.subjectId && a.status === 'PUBLISHED',
            ).length,
          })),
        };
      });

    return NextResponse.json(
      {
        terms: terms.map((t) => ({ id: t.id, label: t.label, order: t.order })),
        resolvedTermId: term?.id ?? null,
        classes,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run tests to verify they pass, then the full suite**

Run: `pnpm --filter frontend exec vitest run src/app/api/teacher/appreciations/route.test.ts` → PASS (5 tests).
Run: `pnpm test` → all green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/teacher/appreciations/route.ts frontend/src/app/api/teacher/appreciations/route.test.ts
git commit --only frontend/src/app/api/teacher/appreciations/route.ts --only frontend/src/app/api/teacher/appreciations/route.test.ts -m "feat(teacher): appreciations list aggregate for my classes"
```

---

### Task 4: i18n — teacherAppreciations namespace, nav and fiche keys, registry

**Files:**
- Create: `frontend/src/messages/{fr,ht,en}/teacherAppreciations.json`
- Modify: `frontend/src/messages/{fr,ht,en}/teacherPortal.json` (one key in `nav`)
- Modify: `frontend/src/messages/{fr,ht,en}/teacherStudents.json` (one key)
- Modify: `frontend/src/lib/locales.ts` (`MESSAGE_NAMESPACES`: add `'teacherAppreciations'` after `'teacherGradebook'`; the count goes 34 → 35)
- Modify: `frontend/src/i18n/request.ts` (three spots, mirror the `teacherGradebook` lines at ~57/92/131: static import list, dynamic import list, `TeacherAppreciations: teacherAppreciations.default`)
- Modify: `frontend/src/types/next-intl.d.ts` (import + `TeacherAppreciations: typeof teacherAppreciations;` after the TeacherGradebook line)

**Interfaces:**
- Produces: `useTranslations('TeacherAppreciations')` for Task 5, `useTranslations('TeacherPortal.nav')`'s `appreciations` key for Task 7, `useTranslations('TeacherStudents')`'s `appreciationsEdit` key for Task 7. Task 6 reuses the existing `Appreciations.saisie/mention` namespaces and adds nothing.

- [ ] **Step 1: Create the three teacherAppreciations.json files**

`frontend/src/messages/fr/teacherAppreciations.json`:

```json
{
  "title": "Appréciations",
  "subtitle": "Saisie des appréciations de vos matières et de vos classes.",
  "empty": "Aucune classe ne vous est encore assignée.",
  "loadError": "Impossible de charger les appréciations pour le moment.",
  "studentCount": "{count} élèves",
  "homeroomBadge": "Titulaire",
  "subjectProgress": "{subject} · {count}/{total} saisies",
  "generalProgress": "Générale · {count}/{total} saisies",
  "noStudents": "Aucun élève inscrit"
}
```

`frontend/src/messages/en/teacherAppreciations.json`:

```json
{
  "title": "Appreciations",
  "subtitle": "Enter appreciations for your subjects and your classes.",
  "empty": "No class has been assigned to you yet.",
  "loadError": "Unable to load appreciations right now.",
  "studentCount": "{count} students",
  "homeroomBadge": "Homeroom",
  "subjectProgress": "{subject} · {count}/{total} entered",
  "generalProgress": "General · {count}/{total} entered",
  "noStudents": "No enrolled students"
}
```

`frontend/src/messages/ht/teacherAppreciations.json`:

```json
{
  "_review": true,
  "title": "Apresyasyon",
  "subtitle": "Antre apresyasyon pou matyè ou yo ak klas ou yo.",
  "empty": "Poko gen okenn klas ki asiyen ba ou.",
  "loadError": "Nou pa ka chaje apresyasyon yo kounye a.",
  "studentCount": "{count} elèv",
  "homeroomBadge": "Titilè",
  "subjectProgress": "{subject} · {count}/{total} antre",
  "generalProgress": "Jeneral · {count}/{total} antre",
  "noStudents": "Pa gen elèv enskri"
}
```

- [ ] **Step 2: Add the nav key to teacherPortal.json (fr/ht/en)**

In each locale's `nav` object, after the `"gradebook"` group (keep key order aligned across locales; the fr file may already carry an unrelated uncommitted edit in the main checkout — this change is one added line):

- fr: `"appreciations": "Appréciations",`
- en: `"appreciations": "Appreciations",`
- ht: `"appreciations": "Apresyasyon",`

- [ ] **Step 3: Add the fiche key to teacherStudents.json (fr/ht/en)**

In the detail-screen section of each file (next to `appreciationsTitle`):

- fr: `"appreciationsEdit": "Saisir",`
- en: `"appreciationsEdit": "Enter",`
- ht: `"appreciationsEdit": "Sezi",`

- [ ] **Step 4: Register the namespace**

`frontend/src/lib/locales.ts` — in `MESSAGE_NAMESPACES`, after `'teacherGradebook',` add `'teacherAppreciations',`.

`frontend/src/i18n/request.ts` — three edits, each directly below its `teacherGradebook` sibling:
1. static import list: add `teacherAppreciations,`
2. dynamic import list: add `import(`../messages/${locale}/teacherAppreciations.json`),` (and the matching destructured name in the awaited tuple)
3. messages map: add `TeacherAppreciations: teacherAppreciations.default,`

Read the file first and copy the exact local pattern — the two import styles (eager fr, lazy other locales) must both be updated or `locales.test.ts` fails.

`frontend/src/types/next-intl.d.ts` — add
`import type teacherAppreciations from '@/messages/fr/teacherAppreciations.json';` next to the teacherGradebook import, and `TeacherAppreciations: typeof teacherAppreciations;` in the Messages interface after `TeacherGradebook`.

- [ ] **Step 5: Run the registry tests**

Run: `pnpm --filter frontend exec vitest run src/lib/locales.test.ts`
Expected: PASS — key parity across fr/ht/en, registry count 35, request.ts and next-intl.d.ts cross-checks all green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/messages/fr/teacherAppreciations.json frontend/src/messages/en/teacherAppreciations.json frontend/src/messages/ht/teacherAppreciations.json frontend/src/messages/fr/teacherPortal.json frontend/src/messages/en/teacherPortal.json frontend/src/messages/ht/teacherPortal.json frontend/src/messages/fr/teacherStudents.json frontend/src/messages/en/teacherStudents.json frontend/src/messages/ht/teacherStudents.json frontend/src/lib/locales.ts frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts
git commit --only frontend/src/messages/fr/teacherAppreciations.json --only frontend/src/messages/en/teacherAppreciations.json --only frontend/src/messages/ht/teacherAppreciations.json --only frontend/src/messages/fr/teacherPortal.json --only frontend/src/messages/en/teacherPortal.json --only frontend/src/messages/ht/teacherPortal.json --only frontend/src/messages/fr/teacherStudents.json --only frontend/src/messages/en/teacherStudents.json --only frontend/src/messages/ht/teacherStudents.json --only frontend/src/lib/locales.ts --only frontend/src/i18n/request.ts --only frontend/src/types/next-intl.d.ts -m "feat(i18n): teacherAppreciations namespace, appreciations nav and fiche keys"
```

---

### Task 5: Appreciations list page (class cards)

**Files:**
- Create: `frontend/src/app/(teacher)/espace-enseignant/appreciations/types.ts`
- Create: `frontend/src/app/(teacher)/espace-enseignant/appreciations/page.tsx`

**Interfaces:**
- Consumes: `GET /api/teacher/appreciations` (Task 3), `TeacherAppreciations` namespace (Task 4), `CardGrid`/`ListCard` from `@/components/school/`, `FilterSelect`/`SelectItem` from `@/components/ui/FilterSelect`, school `Mention`/`AppreciationStatus` types.
- Produces: `TeacherAppreciationsListData` and `TeacherStudentAppreciationData` types consumed by Task 6.

- [ ] **Step 1: Create types.ts**

```ts
// Teacher-side shapes for the Appréciations screens. Mention/status enums
// and MENTIONS ordering are shared with the school module (pure module, no
// fetches) — do not duplicate them.
import type {
  AppreciationStatus,
  GeneralAppreciation,
  Mention,
  TermOption,
} from '@/app/(school)/pedagogie/appreciations/types';

export interface TeacherApprClassCard {
  classId: string;
  className: string;
  level: string | null;
  studentCount: number;
  isMyHomeroom: boolean;
  firstStudentId: string | null;
  generalSaisieCount: number | null;
  subjects: { subjectId: string; subjectName: string; saisieCount: number }[];
}

export interface TeacherAppreciationsListData {
  terms: TermOption[];
  resolvedTermId: string | null;
  classes: TeacherApprClassCard[];
}

export interface TeacherClassmateRow {
  studentId: string;
  firstName: string;
  lastName: string;
  saisieStatus: AppreciationStatus;
}

export interface TeacherSubjectApprRow {
  classSubjectId: string;
  subjectId: string;
  subjectName: string;
  coefficient: number | null;
  average: number | null;
  mention: Mention | null;
  text: string | null;
  status: AppreciationStatus;
}

export interface TeacherStudentAppreciationData {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  classId: string;
  className: string;
  isMyHomeroom: boolean;
  terms: TermOption[];
  resolvedTermId: string | null;
  studentIndex: number | null;
  classSize: number;
  prevStudentId: string | null;
  nextStudentId: string | null;
  classmates: TeacherClassmateRow[];
  overallAverage: number | null;
  classAverage: number | null;
  rank: number | null;
  rankedCount: number;
  general: GeneralAppreciation | null;
  subjects: TeacherSubjectApprRow[];
}
```

(If `GeneralAppreciation`'s date fields are typed `string` in the school types, this import works as-is; verify the school `types.ts` export list before writing.)

- [ ] **Step 2: Create page.tsx**

```tsx
'use client';

// Appréciations enseignant, liste : one card per class I teach in or
// homeroom, with my per-subject saisie progress for the selected term.
// Clicking a card opens the per-student wizard on the class's first
// student. Mirrors the Mes élèves grid look (CardGrid/ListCard) rather
// than the school module's table, per the spec's « cartes standard ».
import { useState } from 'react';
import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useApi } from '@/lib/useApi';
import { useUser } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { CardGrid } from '@/components/school/CardGrid';
import { ListCard } from '@/components/school/ListCard';
import { Badge } from '@/components/ui/Badge';
import type { TeacherAppreciationsListData } from './types';

export default function TeacherAppreciationsPage() {
  const t = useTranslations('TeacherAppreciations');
  const user = useUser();
  const [termId, setTermId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data } = useApi<TeacherAppreciationsListData>(
    `/api/teacher/appreciations${termId ? `?termId=${termId}` : ''}`,
    {
      skip: !user,
      onError: () => {
        setError(t('loadError'));
        return true;
      },
    },
  );

  if (!user || (!data && !error)) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {data && data.terms.length > 0 && (
          <FilterSelect
            value={termId || (data.resolvedTermId ?? '')}
            onValueChange={setTermId}
          >
            {data.terms.map((term) => (
              <SelectItem key={term.id} value={term.id}>
                {term.label}
              </SelectItem>
            ))}
          </FilterSelect>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      ) : data && data.classes.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        </Card>
      ) : (
        data && (
          <CardGrid>
            {data.classes.map((c) => {
              const href =
                c.firstStudentId && data.resolvedTermId
                  ? `/espace-enseignant/appreciations/${c.firstStudentId}?termId=${termId || data.resolvedTermId}`
                  : c.firstStudentId
                    ? `/espace-enseignant/appreciations/${c.firstStudentId}`
                    : undefined;
              const progressLines = [
                ...(c.generalSaisieCount != null
                  ? [t('generalProgress', { count: c.generalSaisieCount, total: c.studentCount })]
                  : []),
                ...c.subjects.map((s) =>
                  t('subjectProgress', {
                    subject: s.subjectName,
                    count: s.saisieCount,
                    total: c.studentCount,
                  }),
                ),
              ];
              return (
                <ListCard
                  key={c.classId}
                  tile={
                    <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-secondary text-primary">
                      <Star size={18} />
                    </div>
                  }
                  title={c.className}
                  {...(href ? { href } : {})}
                  subtitle={
                    c.studentCount > 0
                      ? t('studentCount', { count: c.studentCount })
                      : t('noStudents')
                  }
                  metaLeft={c.level ? <Badge>{c.level}</Badge> : undefined}
                  metaRight={
                    c.isMyHomeroom ? <Badge tone="success">{t('homeroomBadge')}</Badge> : undefined
                  }
                  footerLeft={
                    progressLines.length > 0 ? (
                      <span className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                        {progressLines.map((line) => (
                          <span key={line}>{line}</span>
                        ))}
                      </span>
                    ) : undefined
                  }
                />
              );
            })}
          </CardGrid>
        )
      )}
    </div>
  );
}
```

Verified import facts: `Badge` is shared at `@/components/ui/Badge` and its `tone` union includes `'success'` (`frontend/src/components/ui/Badge.tsx:8`); `FilterSelect` usage copied from `eleves/[id]/page.tsx:157`; `ListCard` props are `tile/title/href/subtitle/menu/metaLeft/metaRight/footerLeft/footerRight` (`frontend/src/components/school/ListCard.tsx:20`). With `exactOptionalPropertyTypes`, spread-conditional optional props as shown rather than passing `undefined`.

- [ ] **Step 3: Typecheck and eyeball**

Run: `pnpm typecheck` → green.
Run: `pnpm dev` (or reuse a running server) → log in as `carline.michel@lesetoiles.edu.ht` / `TeacherTest2026!` → open `/espace-enseignant/appreciations` directly (nav comes in Task 7) → cards render with progress lines.

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(teacher)/espace-enseignant/appreciations/types.ts" "frontend/src/app/(teacher)/espace-enseignant/appreciations/page.tsx"
git commit --only "frontend/src/app/(teacher)/espace-enseignant/appreciations/types.ts" --only "frontend/src/app/(teacher)/espace-enseignant/appreciations/page.tsx" -m "feat(teacher): appreciations class-cards screen"
```

---

### Task 6: Per-student saisie screen (delta clone of the school wizard)

**Files:**
- Create: `frontend/src/app/(teacher)/espace-enseignant/appreciations/[studentId]/page.tsx` — start from a copy of `frontend/src/app/(school)/pedagogie/appreciations/[studentId]/saisie/page.tsx` (751 lines) and apply the deltas below.

**Interfaces:**
- Consumes: `GET/PUT /api/teacher/students/[id]/appreciations` (Tasks 1-2), `TeacherStudentAppreciationData` (Task 5), school `format.ts` (`fmtAverage`), school `types.ts` (`MENTIONS`, `Mention`), `Appreciations.saisie` + `Appreciations.mention` namespaces (reused wholesale, recorded borrowing).

- [ ] **Step 1: Copy the school saisie page and apply these deltas**

Copy the school file to the new path, then:

1. **Header comment** — replace the school one:

```tsx
// Saisie des appréciations, côté enseignant — the school wizard retargeted
// at the teacher surface: same mention buttons, general form and
// per-subject rows, but data and writes go through
// /api/teacher/students/[id]/appreciations (ownership enforced
// server-side), the general card renders only when I homeroom the class,
// the roster comes from the same response (no second fetch), and saves are
// plain api() calls — the offline queue is deliberately not used on the
// teacher portal (spec: online-first).
```

2. **Imports** —
   - drop `import { submitOrQueue } from '@/lib/offline-queue';` and `import { OFFLINE_SYNC } from '@/lib/constants';`
   - add `import { api } from '@/lib/api';` (keep the existing `ApiError` import)
   - retarget the relative school imports:
     `import { fmtAverage } from '@/app/(school)/pedagogie/appreciations/format';`
     `import { MENTIONS } from '@/app/(school)/pedagogie/appreciations/types';`
     `import type { Mention } from '@/app/(school)/pedagogie/appreciations/types';`
     `import type { TeacherStudentAppreciationData } from '../types';`
   - drop the now-unused `AppreciationsListData`/`StudentAppreciationData` type imports and `getCache` stays (seeding effect keeps working).

3. **Data path** — `const dataPath = `/api/teacher/students/${params.studentId}/appreciations${dataQs}`;` typed as `useApi<TeacherStudentAppreciationData>(...)`.

4. **Roster** — delete the second `useApi` (`rosterPath`/`roster`) entirely. Everywhere `roster` was used:
   - progress bar card: compute from classmates —
     ```tsx
     const saisieCount = data.classmates.filter((s) => s.saisieStatus === 'PUBLISHED').length;
     ```
     and use `data.classSize` as the total.
   - roster list: `data.classmates.map((s) => ...)` — drop the average column (`fmtAverage(s.average, ...)` line) and switch the status icon on `s.saisieStatus` instead of `s.status`.
   - `prevName`/`nextName`: find in `data.classmates` instead of `roster.students`.

5. **Save flow** — replace the `submitOrQueue` blocks with plain calls, and only write the general row when homeroom:

```tsx
async function save(publish: boolean) {
  if (!data || !user) return;
  setSaving(true);
  setError(null);
  const status = publish ? 'PUBLISHED' : 'DRAFT';
  try {
    if (data.isMyHomeroom) {
      await api(`/api/teacher/students/${data.studentId}/appreciations`, {
        method: 'PUT',
        body: {
          termId: data.resolvedTermId,
          subjectId: null,
          mention,
          text,
          comportement,
          investissement,
          assiduite,
          status,
        },
      });
    }
    await Promise.all(
      data.subjects
        .filter((s) => (subjectRows[s.subjectId]?.text ?? '').trim() !== '')
        .map((s) =>
          api(`/api/teacher/students/${data.studentId}/appreciations`, {
            method: 'PUT',
            body: {
              termId: data.resolvedTermId,
              subjectId: s.subjectId,
              text: subjectRows[s.subjectId]!.text,
              mention: suggestMention(s.average),
              status,
            },
          }),
        ),
    );
    toast(publish ? t('validatedToast') : t('draftSavedToast'), 'success');
    if (publish) {
      if (data.nextStudentId) {
        router.push(
          `/espace-enseignant/appreciations/${data.nextStudentId}?termId=${data.resolvedTermId}`,
        );
      } else {
        router.push('/espace-enseignant/appreciations');
      }
    }
  } catch (err) {
    setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
  } finally {
    setSaving(false);
  }
}
```

6. **Links and navigation** — every `/pedagogie/appreciations` becomes `/espace-enseignant/appreciations`, and every `/pedagogie/appreciations/${id}/saisie?...` becomes `/espace-enseignant/appreciations/${id}?...` (the teacher screen has no separate `/saisie` sub-path).

7. **Homeroom gating** — wrap the « Appréciation générale » card (`Star` icon card with mention buttons, textarea, three Selects) in `{data.isMyHomeroom && ( ... )}`. The mention/text/comportement seeding effect can stay as-is (it reads `data.general`, which is null for non-homeroom, so the fields just stay empty and hidden). In the aside summary, the `overallAverage`/`rank`/`classAverage` InfoRows render `—`-style fallbacks already (`fmtAverage(null)` and `?? '—'`); keep them but hide the rank rows entirely when `data.rank == null && !data.isMyHomeroom` if the copied markup would otherwise show a misleading dash trio, and keep the `subjectGrades` list (it shows my subjects' averages, which is exactly the teacher's scope).

8. **Quick phrases card** — keep it (pure UI writing helpers, `Appreciations.saisie.quickPhrases` keys); it appends to whichever textarea is focused in the school version — if the school implementation targets only the general textarea, gate the card with the same `data.isMyHomeroom &&` as the general card.

9. **Seeding effect** — unchanged except it reads `TeacherStudentAppreciationData` (`rows[s.subjectId] = { text: s.text ?? '' }` still matches the `subjects` shape).

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck` → green. (`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on — keep the copied file's existing null-guards.)

- [ ] **Step 3: Manual check in the browser**

As the teacher account: open a class card from `/espace-enseignant/appreciations` → the wizard shows the student header, prev/next, roster; a class the teacher homerooms (see the seed: Carline Michel homerooms a class) shows the general card, another class hides it; type a subject appreciation → « Enregistrer brouillon » persists (reload keeps text); « Valider » publishes and advances to the next student; the list card's progress line increments.

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(teacher)/espace-enseignant/appreciations/[studentId]/page.tsx"
git commit --only "frontend/src/app/(teacher)/espace-enseignant/appreciations/[studentId]/page.tsx" -m "feat(teacher): per-student appreciation wizard with homeroom-gated general form"
```

---

### Task 7: Navigation, fiche élève link, CLAUDE.md

**Files:**
- Modify: `frontend/src/components/layout/teacher/TeacherSidebar.tsx` (Pédagogie section gains Appréciations)
- Modify: `frontend/src/app/(teacher)/espace-enseignant/eleves/[id]/page.tsx` (appreciations section header links to the wizard)
- Modify: `CLAUDE.md` (teacher-portal paragraph + namespace count)

- [ ] **Step 1: Sidebar**

In `useTeacherSections()`, add `Star` to the lucide import and extend the Pédagogie section:

```ts
      {
        label: t('pedagogySectionLabel'),
        items: [
          {
            label: t('gradebook'),
            href: '/espace-enseignant/carnet-de-notes',
            icon: NotebookPen,
          },
          {
            label: t('appreciations'),
            href: '/espace-enseignant/appreciations',
            icon: Star,
          },
        ],
      },
```

(The bottom nav keeps its four slots — Accueil, Élèves, Notes, Emploi du temps — per the spec's target bar; Appréciations is reachable from the sidebar and the « Plus » drawer.)

- [ ] **Step 2: Fiche élève link**

In `eleves/[id]/page.tsx`, the appreciations section header (around line 249) becomes:

```tsx
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">{t('appreciationsTitle')}</h2>
              <Link
                href={`/espace-enseignant/appreciations/${id}${termId || data.term?.id ? `?termId=${termId || data.term?.id}` : ''}`}
                className="text-caption font-semibold text-primary hover:underline"
              >
                {t('appreciationsEdit')}
              </Link>
            </div>
```

`id` is the page's student id param and `termId` its term-filter state (`eleves/[id]/page.tsx:87`); `Link` is already imported. Close the added `div` where the `h2` line used to end.

- [ ] **Step 3: CLAUDE.md**

In the « **Espace Enseignant (teacher portal)** » paragraph:
1. Route inventory: after `` `GET /api/teacher/class-subjects/[id]/notebook` `` add `` , `GET /api/teacher/appreciations` + `GET/PUT/DELETE /api/teacher/students/[id]/appreciations` (general row homeroom-gated via `Class.homeroomTeacherId`) ``.
2. After the Carnet de notes sentence, add: `The teacher Appréciations screens (`/espace-enseignant/appreciations` list + per-student wizard) delta-clone the school saisie wizard on the same `Appreciations.saisie`/`Appreciations.mention` namespaces with a thin `teacherAppreciations` namespace, render the general form only for the homeroom teacher, and also skip the offline queue.`
3. In the i18n paragraph, update the namespace count from « 34 » to « 35 » (`across 35 message namespaces tracked in MESSAGE_NAMESPACES`).

- [ ] **Step 4: Full gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` → all green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/teacher/TeacherSidebar.tsx "frontend/src/app/(teacher)/espace-enseignant/eleves/[id]/page.tsx" CLAUDE.md
git commit --only frontend/src/components/layout/teacher/TeacherSidebar.tsx --only "frontend/src/app/(teacher)/espace-enseignant/eleves/[id]/page.tsx" --only CLAUDE.md -m "feat(teacher): appreciations navigation, fiche link and portal docs"
```

---

### Task 8: End-to-end check and merge readiness

- [ ] **Step 1: Browser E2E** (Puppeteer or by hand, `pnpm dev`, account `carline.michel@lesetoiles.edu.ht` / `TeacherTest2026!`)

Checklist:
1. Sidebar's Pédagogie section shows Carnet de notes AND Appréciations.
2. `/espace-enseignant/appreciations` lists my classes with progress; the homeroom class carries the Titulaire badge.
3. A card opens the first student's wizard; prev/next walks the class in lastName/firstName order.
4. Non-homeroom class: no general card; my subject rows accept text; draft persists across reload.
5. Homeroom class: general card with mention buttons + three French-valued Selects; Valider publishes and advances; the fiche élève then shows the published general row.
6. Fiche élève's Appréciations header « Saisir » link opens the wizard for that student and term.
7. Clean up any test appreciations you created (DELETE endpoint or the school UI) so the dev dataset stays pristine.

Automation notes from Plan 2's session: the form's dropdowns are Radix Selects (`button[role="combobox"]` + portal `[role="option"]`) — native-select DOM tricks silently no-op; drive them with real clicks. Never pipe a background `pnpm dev` through `head` (SIGPIPE wedges the server). Appreciations have no `gradeEntryEnabled` lock, so any term works.

- [ ] **Step 2: Merge-readiness checks**

1. `git -C <main-checkout> status --short` — resolve the known uncommitted `fr/teacherPortal.json` edit (keep both its renames and our added key) and any stray files at paths this branch creates.
2. Re-verify the live namespace count in `locales.ts` matches what CLAUDE.md claims (35).
3. Full gate one last time on the tree being merged.
