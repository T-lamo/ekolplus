# Espace Élève Phase 2 — Plan 2 : Notes, Présences, Appréciations, Bulletins

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the student portal its four Scolarité screens (Mes notes, Mes présences, Appréciations, Bulletins + bulletin viewer/PDF), read-only, published-only, strictly scoped to the session's own student, by extracting the staff per-student query logic into shared `lib/server/student-views/*` functions with an `audience` switch and reusing the fiche élève's four tab components through additive props.

**Architecture:** Each staff route under `/api/school/students/[id]/{results,attendance,appreciations,bulletins}` keeps its authorization layer and delegates the query to a new `lib/server/student-views/<name>.ts` function (`audience: 'staff'`). Six new `/api/student/*` routes call the same functions with `audience: 'student'` and the `studentId` from `requireStudent`. `getStudentBulletinView` gains an `audience` parameter that also travels inside the PDF print token so the server-generated PDF never prints a draft appreciation for a student. The four tab components and the bulletin viewer get additive props (`apiBase`, `readOnly`, `viewerHrefBase`) so the student pages render the exact same UI as the fiche.

**Tech Stack:** Next.js 16 App Router, Prisma 5, Vitest + `@/test-utils/prisma-mock`, next-intl (`ElevePortal` + reused `Eleves.*` namespaces), Tailwind v4 `@theme` tokens.

**Spec:** `docs/superpowers/specs/2026-09-02-espace-eleve-phase2-design.md` (sections « Surface API », « Extraction `lib/server/student-views/` », « Écrans », « i18n », « Tests »).

## Global Constraints

- Every Route Handler: `export const runtime = 'nodejs'`, `withRequestContext`, `requireStudent(req)`; GET only; 404 `NOT_FOUND` for any non-student account.
- `studentId` is never a URL or body parameter on `/api/student/*`: it always comes from `requireStudent`.
- Student audience: `ranking: []`, no `prevStudentId`/`nextStudentId`/`studentIndex`, `PUBLISHED` evaluations and appreciations only, never `Student.notes`.
- Staff routes keep their exact response shape and status codes; the extraction is behaviour-preserving.
- Additive props only on shared components; defaults preserve the fiche behaviour (`apiBase` = `/api/school/students/${studentId}`, `readOnly` = `false`, `viewerHrefBase` = `/bulletins/${studentId}`).
- No new i18n namespace: `ElevePortal.pages.*` for titles/subtitles, `Eleves.*` reused for the tabs; fr/ht/en parity (`ht` keeps `_review`); no em dash in user-facing strings.
- `pnpm format && pnpm lint && pnpm typecheck && pnpm test` green before each commit; explicit-path `git add`; Conventional Commits; commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Work happens in the worktree `.claude/worktrees/espace-eleve-phase2` (branch `feat/espace-eleve-phase2`), dev server on port 3001 only; never touch port 3000.
- Do not run `pnpm seed:dev-school -- --reset` (dev DB shared with testing.schoolgesti.com).

---

### Task 1: i18n keys for the Scolarité pages and the two tab load errors

**Files:**
- Modify: `frontend/src/messages/{fr,ht,en}/elevePortal.json` (add `pages.*`)
- Modify: `frontend/src/messages/{fr,ht,en}/eleves.json` (add `attendanceTab.loadError`, `appreciations.loadError`)
- Test: `frontend/src/lib/locales.test.ts` (existing parity tripwire)

**Interfaces:**
- Produces: `ElevePortal.pages.{grades,attendance,bulletins,appreciations}.{title,subtitle}`, `Eleves.attendanceTab.loadError`, `Eleves.appreciations.loadError`.

- [ ] **Step 1: Add the keys (fr)**

`elevePortal.json` gains, after `"settings"`:

```json
"pages": {
  "grades": {
    "title": "Mes notes",
    "subtitle": "Vos résultats par matière, votre moyenne et votre rang dans la classe."
  },
  "attendance": {
    "title": "Mes présences",
    "subtitle": "Votre assiduité et le journal de vos présences, période par période."
  },
  "bulletins": {
    "title": "Mes bulletins",
    "subtitle": "Vos bulletins par période, à consulter à l'écran ou à télécharger en PDF."
  },
  "appreciations": {
    "title": "Appréciations",
    "subtitle": "Les appréciations de vos enseignants pour chaque période."
  }
}
```

`eleves.json`: `attendanceTab.loadError = "Impossible de charger les présences."`, `appreciations.loadError = "Impossible de charger les appréciations."`.

- [ ] **Step 2: Add the keys (en, ht)**

en: `pages.grades = { "My grades", "Your results by subject, your average and your rank in the class." }`, `pages.attendance = { "My attendance", "Your attendance record and day-by-day log, term by term." }`, `pages.bulletins = { "My report cards", "Your report cards by term, to read on screen or download as PDF." }`, `pages.appreciations = { "Comments", "Your teachers' comments for each term." }`; `attendanceTab.loadError = "Unable to load attendance."`, `appreciations.loadError = "Unable to load comments."`.

ht: `pages.grades = { "Nòt mwen yo", "Rezilta w pa matyè, mwayèn ou ak ran ou nan klas la." }`, `pages.attendance = { "Prezans mwen yo", "Asidite w ak jounal prezans ou, peryòd pa peryòd." }`, `pages.bulletins = { "Bilten mwen yo", "Bilten ou yo pa peryòd, pou li sou ekran oswa telechaje an PDF." }`, `pages.appreciations = { "Apresyasyon", "Apresyasyon pwofesè w yo pou chak peryòd." }`; `attendanceTab.loadError = "Nou pa ka chaje prezans yo."`, `appreciations.loadError = "Nou pa ka chaje apresyasyon yo."`.

- [ ] **Step 3: Run the parity test**

Run: `pnpm --filter frontend exec vitest run src/lib/locales.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/messages/fr/elevePortal.json frontend/src/messages/ht/elevePortal.json frontend/src/messages/en/elevePortal.json frontend/src/messages/fr/eleves.json frontend/src/messages/ht/eleves.json frontend/src/messages/en/eleves.json
git commit -m "feat(i18n): Espace Élève Scolarité page titles and tab load errors"
```

---

### Task 2: `student-views/results.ts` (extraction + audience) and the staff wrapper

**Files:**
- Create: `frontend/src/lib/server/student-views/audience.ts`
- Create: `frontend/src/lib/server/student-views/results.ts`
- Create: `frontend/src/lib/server/student-views/results.test.ts`
- Modify: `frontend/src/app/api/school/students/[id]/results/route.ts` (body → wrapper)

**Interfaces:**
- Produces: `type ViewAudience = 'staff' | 'student'`; `getStudentResults({ schoolId, studentId, academicYearId, termId, audience }): Promise<StudentResultsView>`; `StudentResultsView` (same shape as the client `StudentResults`).

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/server/student-views/results.test.ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { getStudentResults } from './results';

const T_START = new Date('2025-09-01T00:00:00.000Z');
const T_END = new Date('2099-12-31T00:00:00.000Z');

function evaluation(id: string, status: 'PUBLISHED' | 'DRAFT', scores: [string, number][]) {
  return {
    id,
    label: id,
    classSubjectId: 'cs_1',
    coefficient: 1,
    maxScore: 20,
    status,
    countsTowardAverage: true,
    grades: scores.map(([studentId, score]) => ({ studentId, score, absent: false })),
  };
}

beforeEach(() => {
  prismaMock.academicYear.findMany.mockResolvedValue([
    { id: 'year_1', label: '2025-2026', isActive: true, startDate: T_START },
  ] as never);
  prismaMock.term.findMany.mockResolvedValue([
    { id: 'term_1', label: '1er Trimestre', order: 1, startDate: T_START, endDate: T_END },
  ] as never);
  prismaMock.enrollment.findUnique.mockResolvedValue({
    studentId: 'stu_1',
    classId: 'cls_1',
    class: { id: 'cls_1', name: '6ème A' },
  } as never);
  prismaMock.classSubject.findMany.mockResolvedValue([
    {
      id: 'cs_1',
      classId: 'cls_1',
      subjectId: 'sub_1',
      coefficient: 2,
      subject: { name: 'Mathématiques', domain: 'Sciences' },
    },
  ] as never);
  prismaMock.evaluation.findMany.mockResolvedValue([
    evaluation('ev_pub', 'PUBLISHED', [
      ['stu_1', 12],
      ['stu_2', 16],
    ]),
    evaluation('ev_draft', 'DRAFT', [
      ['stu_1', 5],
      ['stu_2', 5],
    ]),
  ] as never);
  prismaMock.enrollment.findMany.mockResolvedValue([
    { studentId: 'stu_1', student: { id: 'stu_1', firstName: 'Nadia', lastName: 'Joseph' } },
    { studentId: 'stu_2', student: { id: 'stu_2', firstName: 'Paul', lastName: 'Louis' } },
  ] as never);
  prismaMock.goal.findMany.mockResolvedValue([]);
});

describe('getStudentResults', () => {
  it('staff audience keeps the nominative ranking and lists draft evaluations', async () => {
    const view = await getStudentResults({
      schoolId: 'school_1',
      studentId: 'stu_1',
      academicYearId: null,
      termId: null,
      audience: 'staff',
    });
    expect(view.enrolled).toBe(true);
    expect(view.ranking.map((r) => [r.name, r.position, r.isSelf])).toEqual([
      ['Paul Louis', 1, false],
      ['Nadia Joseph', 2, true],
    ]);
    expect(view.subjects[0]?.evaluations.map((e) => e.id)).toEqual(['ev_pub', 'ev_draft']);
    const where = prismaMock.evaluation.findMany.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where.status).toBeUndefined();
  });

  it('student audience empties the ranking, keeps the rank, and asks only for PUBLISHED evaluations', async () => {
    const view = await getStudentResults({
      schoolId: 'school_1',
      studentId: 'stu_1',
      academicYearId: null,
      termId: null,
      audience: 'student',
    });
    expect(view.ranking).toEqual([]);
    expect(view.rank).toBe(2);
    expect(view.rankedCount).toBe(2);
    expect(view.overallAverage).toBe(12);
    for (const call of prismaMock.evaluation.findMany.mock.calls) {
      expect((call[0]?.where as Record<string, unknown>).status).toBe('PUBLISHED');
    }
  });

  it('returns the empty shell when the student has no enrollment for the year', async () => {
    prismaMock.enrollment.findUnique.mockResolvedValue(null);
    const view = await getStudentResults({
      schoolId: 'school_1',
      studentId: 'stu_1',
      academicYearId: null,
      termId: null,
      audience: 'student',
    });
    expect(view.enrolled).toBe(false);
    expect(view.resolvedAcademicYearId).toBe('year_1');
    expect(view.subjects).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/student-views/results.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `audience.ts` and `results.ts`**

```ts
// frontend/src/lib/server/student-views/audience.ts
// Who a per-student read model is being built for. `staff` is the fiche
// élève (school app) and keeps everything the school sees; `student` is the
// Espace Élève and applies the portal rules from the Phase 2 spec:
// no nominative ranking, no prev/next classmate ids, PUBLISHED evaluations
// and appreciations only. Kept as a plain type module so it can be imported
// by both server code and the print-token payload.
export type ViewAudience = 'staff' | 'student';
```

`results.ts` = the body of the staff route from `const years = …` to the final object, wrapped in:

```ts
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import {
  appreciationFor,
  competitionRank,
  resolveCurrentTerm,
  subjectAverageFor as scoreOf,
  trendBetween,
  weightedAverage,
} from '@/lib/server/grades';
import type { ViewAudience } from './audience';

export interface StudentResultsInput {
  schoolId: string;
  studentId: string;
  academicYearId: string | null;
  termId: string | null;
  audience: ViewAudience;
}

export interface StudentResultsView { /* same fields as the client StudentResults */ }

export async function getStudentResults(input: StudentResultsInput): Promise<StudentResultsView> {
  const { schoolId, studentId, audience } = input;
  const publishedOnly = audience === 'student' ? { status: 'PUBLISHED' as const } : {};
  … // evaluation + prevEvaluation `where` spread `...publishedOnly`
  … // ranking: audience === 'student' ? [] : ranking
}
```

The route keeps auth, permission, ownership check and returns `NextResponse.json(await getStudentResults({...audience:'staff'}))`.

- [ ] **Step 4: Run the test and the full test suite**

Run: `pnpm --filter frontend exec vitest run src/lib/server/student-views/results.test.ts` → PASS; `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/student-views/audience.ts frontend/src/lib/server/student-views/results.ts frontend/src/lib/server/student-views/results.test.ts "frontend/src/app/api/school/students/[id]/results/route.ts"
git commit -m "refactor(students): extract getStudentResults with an audience switch"
```

---

### Task 3: `student-views/attendance.ts` + staff wrapper

**Files:**
- Create: `frontend/src/lib/server/student-views/attendance.ts`, `attendance.test.ts`
- Modify: `frontend/src/app/api/school/students/[id]/attendance/route.ts`

**Interfaces:**
- Produces: `getStudentAttendance({ studentId, termId }): Promise<StudentAttendanceView | null>` (`null` = no enrollment, the route maps it to the existing 404). No `audience` parameter: the attendance model carries no staff-only field today, so the switch would be dead code (documented deviation from the spec's signature).

- [ ] **Step 1: Test** — `null` without enrollment; `resolvedTermId` follows `termId`; rows queried on the session `studentId` and the term window; `ratePercent`/`absences`/`summary` computed.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** (route body from `const enrollment = …` onward, returning the object instead of `NextResponse.json`; `student.firstName/lastName` come from a `prisma.student.findUniqueOrThrow` select inside the view).
- [ ] **Step 4: Run → PASS; typecheck.**
- [ ] **Step 5: Commit** `refactor(students): extract getStudentAttendance`.

---

### Task 4: `student-views/appreciations.ts` + staff wrapper (GET only)

**Files:**
- Create: `frontend/src/lib/server/student-views/appreciations.ts`, `appreciations.test.ts`
- Modify: `frontend/src/app/api/school/students/[id]/appreciations/route.ts` (GET body → wrapper; PUT/DELETE untouched)

**Interfaces:**
- Produces: `getStudentAppreciations({ studentId, termId, audience }): Promise<StudentAppreciationsView | null>`.
- Student audience: `studentIndex`, `prevStudentId`, `nextStudentId` are `null`; every `prisma.appreciation.findMany` gets `status: 'PUBLISHED'`; classmates are still read (class average + rank) but never exposed.

- [ ] **Step 1: Test** — staff: prev/next computed from the lastName-ordered classmates, no status filter; student: prev/next/studentIndex null, both appreciation queries filtered on PUBLISHED, `rank`/`classAverage` still present.
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement.** **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `refactor(students): extract getStudentAppreciations with an audience switch`.

---

### Task 5: `student-views/bulletins.ts` + staff wrapper

**Files:**
- Create: `frontend/src/lib/server/student-views/bulletins.ts`, `bulletins.test.ts`
- Modify: `frontend/src/app/api/school/students/[id]/bulletins/route.ts`

**Interfaces:**
- Produces: `getStudentBulletinSummaries({ studentId, audience }): Promise<{ terms: TermBulletinSummary[] }>`; `TermBulletinSummary = { termId, label, order, overallAverage, rank, rankedCount }`.

- [ ] **Step 1: Test** — `{ terms: [] }` without enrollment; one row per term with rank; student audience adds `status: 'PUBLISHED'` to every evaluation query.
- [ ] **Step 2–4: FAIL → implement → PASS.**
- [ ] **Step 5: Commit** `refactor(students): extract getStudentBulletinSummaries`.

---

### Task 6: `audience` on `getStudentBulletinView`, the print token and the PDF generator

**Files:**
- Modify: `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.ts` (4th param `audience: ViewAudience = 'staff'`)
- Modify: `frontend/src/lib/server/bulletin-pdf/print-token.ts` (`PrintTokenPayload.audience?: ViewAudience`)
- Modify: `frontend/src/lib/server/bulletin-pdf/generate.ts` (`generateBulletinPdf(..., options, audience = 'staff')`)
- Modify: `frontend/src/app/print/bulletin/[studentId]/[termId]/page.tsx` (passes `payload.audience ?? 'staff'`)
- Create: `frontend/src/lib/server/bulletin-pdf/get-bulletin-view.test.ts`
- Modify: `frontend/src/lib/server/bulletin-pdf/print-token.test.ts` (round-trips `audience`)

- [ ] **Step 1: Tests** — view: staff keeps prev/next + unfiltered appreciations; student nulls prev/next/studentIndex and filters `status: 'PUBLISHED'` on appreciations and evaluations. Token: `signPrintToken({..., audience: 'student'})` → `verifyPrintToken` returns `audience: 'student'`; omitted stays `undefined`.
- [ ] **Step 2–4: FAIL → implement → PASS.**
- [ ] **Step 5: Commit** `feat(bulletins): audience-aware bulletin view and print token`.

---

### Task 7: The six `/api/student/*` routes + tests

**Files:**
- Create: `frontend/src/app/api/student/results/route.ts` + `route.test.ts`
- Create: `frontend/src/app/api/student/attendance/route.ts` + `route.test.ts`
- Create: `frontend/src/app/api/student/appreciations/route.ts` + `route.test.ts`
- Create: `frontend/src/app/api/student/bulletins/route.ts` + `route.test.ts`
- Create: `frontend/src/app/api/student/bulletin/route.ts` + `route.test.ts`
- Create: `frontend/src/app/api/student/bulletin/pdf/route.ts` + `route.test.ts`

Each route:

```ts
export const runtime = 'nodejs';
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStudent } from '@/lib/server/middleware/require-student';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getStudentResults } from '@/lib/server/student-views/results';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStudent(req);
    if (auth instanceof NextResponse) return auth;
    const view = await getStudentResults({
      schoolId: auth.student.schoolId,
      studentId: auth.student.studentId,
      academicYearId: req.nextUrl.searchParams.get('academicYearId'),
      termId: req.nextUrl.searchParams.get('termId'),
      audience: 'student',
    });
    return NextResponse.json(view, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

`attendance`/`appreciations`: `null` → 404 `{ error: 'NOT_FOUND', message: 'Student has no active enrollment' }` (same as staff). `bulletin`: `getStudentBulletinView(schoolId, studentId, termId, 'student')`, `null` → 404. `bulletin/pdf`: clone of the staff PDF route with `maxDuration = 60`, `generateBulletinPdf(schoolId, studentId, termId, opts, 'student')`.

Tests (per route): requireStudent 404 passthrough (view never called); view called with the session ids + `audience: 'student'` + query params; JSON echoes the view. PDF: 400 without `termId`, 404 without template, 200 `application/pdf` with `attachment`/`inline` disposition, 502 on `PdfGenerationError`.

- [ ] **Step 1: Write the tests. Step 2: FAIL. Step 3: Implement. Step 4: PASS + `runtime-enforcement.test.ts` green.**
- [ ] **Step 5: Commit** `feat(eleve): /api/student results, attendance, appreciations, bulletins, bulletin and PDF routes`.

---

### Task 8: Additive props on the four fiche tabs

**Files:**
- Modify: `frontend/src/app/(school)/eleves/[id]/NotesResultatsTab.tsx` (`apiBase?`, `readOnly?`)
- Modify: `frontend/src/app/(school)/eleves/[id]/PresencesTab.tsx` (`apiBase?`, load-error card)
- Modify: `frontend/src/app/(school)/eleves/[id]/AppreciationsTab.tsx` (`apiBase?`, `readOnly?`, load-error card)
- Modify: `frontend/src/app/(school)/eleves/[id]/BulletinsTab.tsx` (`apiBase?`, `viewerHrefBase?`)

Rules:
- `apiBase` default `` `/api/school/students/${studentId}` `` (default initializer may reference `studentId`, destructured first).
- Notes `readOnly`: no « Fixer un objectif » button, no `GoalModal`, the ranking card shows the rank pill and a single « Moy. de classe » line (`classOverallAverage`) instead of the nominative list; the CSV export stays.
- Appréciations `readOnly`: no « Modifier l'appréciation » button and no « Rédiger une appréciation » link.
- Bulletins: « Voir » → `` `${viewerHrefBase}/${termId}` ``, PDF → `` `${apiBase}/bulletin/pdf?termId=` ``.
- Presences/Appréciations: `const { data, loading, error } = useApi(...)`; when `!data && error` render a `Card` with `t('loadError')` instead of the skeleton forever.

- [ ] **Step 1: Apply. Step 2: `pnpm typecheck && pnpm lint`. Step 3: Commit** `feat(eleves): apiBase/readOnly/viewerHrefBase props on the fiche tabs`.

---

### Task 9: `BulletinViewer` extraction

**Files:**
- Create: `frontend/src/components/bulletin/BulletinViewer.tsx`
- Modify: `frontend/src/app/(school)/bulletins/[studentId]/[termId]/page.tsx` (becomes a thin wrapper)

**Interfaces:**
- Produces: `BulletinViewer({ bulletinPath, pdfBase, backHref, readOnly = false })` — `bulletinPath` is the full GET path (`?termId=` included), `pdfBase` the PDF route without query, `backHref` the « Retour aux bulletins » target. `readOnly` hides « Modifier l'appréciation » and the prev/next Navigation card. Its French chrome strings are moved unchanged (documented i18n carve-out).

- [ ] **Step 1: Move the page body into the component, parameterise the four URLs. Step 2: rewrite the staff page as:**

```tsx
'use client';
import { useParams } from 'next/navigation';
import { BulletinViewer } from '@/components/bulletin/BulletinViewer';

export default function BulletinViewerPage() {
  const params = useParams<{ studentId: string; termId: string }>();
  const qs = params.termId ? `?termId=${params.termId}` : '';
  return (
    <BulletinViewer
      bulletinPath={`/api/school/students/${params.studentId}/bulletin${qs}`}
      pdfBase={`/api/school/students/${params.studentId}/bulletin/pdf`}
      backHref="/bulletins"
    />
  );
}
```

- [ ] **Step 3: typecheck + lint. Step 4: Commit** `refactor(bulletins): extract BulletinViewer from the viewer page`.

---

### Task 10: Student pages

**Files:**
- Create: `frontend/src/app/(eleve)/eleve/ScolaritePage.tsx` (header + `/api/student/me` loader, render-prop children)
- Create: `frontend/src/app/(eleve)/eleve/notes/page.tsx`
- Create: `frontend/src/app/(eleve)/eleve/presences/page.tsx`
- Create: `frontend/src/app/(eleve)/eleve/appreciations/page.tsx`
- Create: `frontend/src/app/(eleve)/eleve/bulletins/page.tsx`
- Create: `frontend/src/app/(eleve)/eleve/bulletins/[termId]/page.tsx`

`ScolaritePage`:

```tsx
'use client';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useApi } from '@/lib/useApi';
import { Skeleton } from '@/components/ui/Skeleton';
import type { StudentMeResponse } from './types';

export function ScolaritePage({ title, subtitle, children }: {
  title: string;
  subtitle: string;
  children: (me: StudentMeResponse) => ReactNode;
}) {
  const t = useTranslations('ElevePortal');
  const { data, loading, error } = useApi<StudentMeResponse>('/api/student/me');
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{title}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {loading && !data ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : error || !data ? (
        <p role="alert" className="text-sm text-destructive-foreground">{t('loadError')}</p>
      ) : (
        children(data)
      )}
    </div>
  );
}
```

Pages wire the tabs: notes (`useApi<StudentResults>('/api/student/results')` for `initial`, `apiBase="/api/student"`, `readOnly`), presences (`apiBase`), appreciations (`apiBase`, `readOnly`), bulletins (`apiBase`, `viewerHrefBase="/eleve/bulletins"`), viewer (`BulletinViewer` with `/api/student/bulletin?termId=`, `/api/student/bulletin/pdf`, `backHref="/eleve/bulletins"`, `readOnly`).

- [ ] **Step 1: Create. Step 2: typecheck + lint. Step 3: Commit** `feat(eleve): Mes notes, Mes présences, Appréciations and Bulletins pages`.

---

### Task 11: Navigation (sidebar Scolarité, bottom nav, dashboard quick actions)

**Files:**
- Modify: `frontend/src/components/layout/student/StudentSidebar.tsx` (Scolarité section: Mes notes `/eleve/notes` BarChart2, Mes présences `/eleve/presences` CalendarCheck, Bulletins `/eleve/bulletins` FileText, Appréciations `/eleve/appreciations` Star)
- Modify: `frontend/src/components/layout/student/StudentMobileBottomNav.tsx` (home, grades, attendance, profile + Plus)
- Modify: `frontend/src/app/(eleve)/eleve/page.tsx` (« Accès rapides » section: Mes notes → `/eleve/notes`, Mes bulletins → `/eleve/bulletins`)

- [ ] **Step 1: Apply. Step 2: typecheck + lint + `route-match.test.ts`. Step 3: Commit** `feat(eleve): Scolarité navigation and dashboard quick links`.

---

### Task 12: Browser verification and gate

- [ ] **Step 1:** dev server on 3001 (`pnpm --filter frontend exec next dev --port 3001 --turbopack`), Puppeteer script (login `jimmy.valcin@eleves.lesetoiles.edu.ht` / `StudentTest2026!`): `/eleve`, `/eleve/notes`, `/eleve/presences`, `/eleve/appreciations`, `/eleve/bulletins`, `/eleve/bulletins/<termId>`, desktop + 375px screenshots, no `[role=alert]`, no horizontal overflow, `GET /api/student/bulletin/pdf?termId=` → 200 `application/pdf`, `GET /api/school/students/<id>/results` as the student → 404.
- [ ] **Step 2:** fix anything off; stop only the port-3001 server.
- [ ] **Step 3:** `pnpm format && pnpm lint && pnpm typecheck && pnpm test` → all green; commit any prettier leftovers.
