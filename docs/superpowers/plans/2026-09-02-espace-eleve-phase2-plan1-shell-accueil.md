# Espace Élève Phase 2 · Plan 1 (Shell + Accueil + Profil + Paramètres) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the student portal the same admin-grade shell as the teacher portal (sidebar + topbar + mobile bottom nav), one aggregate `GET /api/student/me` read, a real student dashboard at `/eleve`, a read-only « Mon profil » page, a personal « Paramètres » page, and a seeded student login to verify it all with.

**Architecture:** Fourth instance of the shared shell bricks (`components/layout/sidebar/*`, `components/layout/topbar/*`) as `components/layout/student/*`, a `(eleve)/eleve/layout.tsx` cloned from the teacher layout (no `SchoolPlanProvider`), and pages that reuse shipped components (`KpiCard`, `Card`, `Avatar`, `ProfilTab`/`ApparenceTab`/`LangueTab`). One new route, `GET /api/student/me`, behind `requireStudent()`; the session's own `studentId` is the only scoping input, never a parameter. All new strings extend the existing `elevePortal` namespace (fr/ht/en). Navigation entries for the Scolarité screens are NOT added here: Plan 2 (Notes/Présences/Bulletins/Appréciations) and Plan 3 (Emploi du temps) add their own entries with their pages, so this plan merged alone leaves no dead link.

**Tech Stack:** Next.js 16 App Router, Tailwind v4 `@theme` tokens, next-intl, `useApi`, Prisma 5, Vitest + `prismaMock`, Puppeteer (puppeteer-core, system Chrome) for the browser check.

**Spec:** [docs/superpowers/specs/2026-09-02-espace-eleve-phase2-design.md](../specs/2026-09-02-espace-eleve-phase2-design.md)

## Global Constraints

- Every new Route Handler has `export const runtime = 'nodejs'` as its first statement and wraps its body in `withRequestContext(makeRequestContext(req.headers), ...)`.
- Every `/api/student/*` route is `GET` only, calls `requireStudent(req)` first and returns its `NextResponse` unchanged when it gets one; the `studentId`, `schoolId`, `classId` and `academicYearId` it uses come exclusively from the returned `StudentContext.student`. No URL or body parameter ever names a student.
- `Student.notes` and `Evaluation.notes` are never selected nor returned by any student route.
- Only `PUBLISHED` evaluations feed the student-facing summary and recent grades (`status: 'PUBLISHED'` in the Prisma `where`).
- Student-reachable client code never calls any `/api/school/*` endpoint and never mounts `SchoolPlanProvider` or `AcademicYearBadge`. `NotificationsMenu` (`/api/notifications`), `OfflineIndicator`, `HelpMenu`, `CommandPalette`, `Breadcrumbs`, `ProfilTab`/`ApparenceTab`/`LangueTab` (`/api/auth/*` only) are reusable as-is.
- Admin/school/teacher shells do not change: `(school)/layout.tsx`, `(teacher)/espace-enseignant/layout.tsx`, `SchoolSidebar.tsx`, `TeacherSidebar.tsx`, `MobileBottomNav.tsx`, `TeacherMobileBottomNav.tsx` are NOT modified. The only shared file modified is `components/layout/sidebar/route-match.ts` (one more exact-match home).
- No protected file (CLAUDE.md list) is touched. `require-student.ts` and `school.ts` are not protected, but this plan does not need to edit them either.
- No em dashes (—) in any user-facing string in the message files. Use `·`, comma, or period. (The `'—'` glyph used as an empty-value placeholder in JSX, e.g. `value ?? '—'`, is the app's existing convention for missing values and is kept.)
- Only `@theme` token classes (`text-primary`, `bg-card`, `border-border`, `bg-secondary`, `bg-success`, …). No new hardcoded hex anywhere.
- New message keys land in all 3 locales (`fr`/`ht`/`en`) with identical key trees; `ht` keeps its top-level `_review` note. No new namespace file, so `locales.ts`/`request.ts`/`next-intl.d.ts` are untouched. `locales.test.ts` enforces parity.
- UI pages: `pnpm typecheck` + `pnpm lint` + a browser sanity check; no component-render tests (project convention). API/route changes: full TDD with Vitest, `@/test-utils/prisma-mock` imported first.
- Cards stay compact and uniform (no per-card accent colors, no stat tiles); layouts use `lib/layout.ts` constants where a list/aside exists (none in this plan).
- `pnpm format && pnpm lint && pnpm typecheck && pnpm test` must pass before every commit. Run from the repo root. Commit messages: Conventional Commits, `git add` with explicit paths (a peer session may share the tree), and end every commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Work happens in a git worktree on branch `feat/espace-eleve-phase2` (created from local `develop` in Task 0). The dev server for browser checks runs from that worktree on port **3001** (`:3000` serves the main checkout; never kill it).

---

## File Structure

New files:
- `frontend/src/app/api/student/me/route.ts` — the aggregate read (identity, class, year, terms, summary, week sessions, recent grades).
- `frontend/src/app/api/student/me/route.test.ts`
- `frontend/src/components/layout/student/StudentSidebar.tsx` (+ exported `useStudentSections()` hook)
- `frontend/src/components/layout/student/StudentTopbar.tsx`
- `frontend/src/components/layout/student/StudentAcademicYearBadge.tsx`
- `frontend/src/components/layout/student/StudentMobileBottomNav.tsx`
- `frontend/src/app/(eleve)/eleve/types.ts` — client-side `StudentMeResponse` shape shared by the pages and the badge.
- `frontend/src/app/(eleve)/eleve/profil/page.tsx` — read-only « Mon profil ».
- `frontend/src/app/(eleve)/eleve/parametres/page.tsx` — Profil / Apparence / Langue tabs.

Rewritten:
- `frontend/src/app/(eleve)/eleve/layout.tsx` — admin-grade shell (sidebar + topbar + bottom nav) replacing the bare header.
- `frontend/src/app/(eleve)/eleve/page.tsx` — the dashboard replacing the « arrive bientôt » placeholder.
- `frontend/src/messages/{fr,ht,en}/elevePortal.json` — full rewrite (drops `comingSoon`, adds nav/topbar/home/profile/settings groups).

Modified:
- `frontend/src/components/layout/sidebar/route-match.ts` (+ `route-match.test.ts`) — `/eleve` becomes an exact-match home.
- `frontend/scripts/seed-dev-school.ts` — idempotent student portal account for Les Étoiles.
- `frontend/CREDENTIALS.local.md` (untracked, local only) — the new login row.

---

### Task 0: Worktree + branch

**Files:** none (git plumbing).

- [ ] **Step 1: Create the worktree from local develop**

Run from the repo root (`/home/amos-dorceus/Documents/SaaSManagement/ekolplus2`):

```bash
git worktree add .claude/worktrees/espace-eleve-phase2 -b feat/espace-eleve-phase2 develop
cd .claude/worktrees/espace-eleve-phase2
git log --oneline -1
```

Expected: the new branch's tip is develop's tip (the commit that added the Phase 2 spec + this plan).

- [ ] **Step 2: Install deps in the worktree and check the baseline is green**

```bash
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test
```

Expected: typecheck clean, all tests pass (baseline count noted for later).

- [ ] **Step 3: Copy the env file the dev server needs**

```bash
cp /home/amos-dorceus/Documents/SaaSManagement/ekolplus2/frontend/.env.local frontend/.env.local
```

(`.env.local` is untracked and holds the dev Neon `DATABASE_URL`, Upstash and the rest; `.env` is tracked and comes with the worktree.)

---

### Task 1: `/eleve` is an exact-match home in the sidebar route matcher

**Files:**
- Modify: `frontend/src/components/layout/sidebar/route-match.ts:3-7`
- Test: `frontend/src/components/layout/sidebar/route-match.test.ts`

**Interfaces:**
- Produces: `isActiveRoute('/eleve/notes', '/eleve') === false` — the Accueil entry no longer lights up on every sub-page (same rule as `/espace-enseignant`).

- [ ] **Step 1: Write the failing test**

Inside the existing `describe('isActiveRoute', () => { ... })` block of `route-match.test.ts`, add:

```ts
  it('treats /eleve as an exact-match home, like /espace-enseignant', () => {
    expect(isActiveRoute('/eleve', '/eleve')).toBe(true);
    expect(isActiveRoute('/eleve/notes', '/eleve')).toBe(false);
    expect(isActiveRoute('/eleve/notes', '/eleve/notes')).toBe(true);
    expect(isActiveRoute('/eleve/bulletins/term_1', '/eleve/bulletins')).toBe(true);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/components/layout/sidebar/route-match.test.ts`
Expected: FAIL on `expect(isActiveRoute('/eleve/notes', '/eleve')).toBe(false)` (today `/eleve` prefix-matches every sub-page).

- [ ] **Step 3: Implement**

Replace the `isActiveRoute` function in `route-match.ts` with:

```ts
export function isActiveRoute(pathname: string, href: string): boolean {
  const path = href.split('?')[0]!;
  if (
    path === '/dashboard' ||
    path === '/admin' ||
    path === '/espace-enseignant' ||
    path === '/eleve'
  )
    return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/components/layout/sidebar/route-match.test.ts`
Expected: PASS (all cases in the file).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/sidebar/route-match.ts frontend/src/components/layout/sidebar/route-match.test.ts
git commit -m "feat(eleve-portal): exact-match /eleve in the sidebar route matcher

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `elevePortal` messages (fr / ht / en)

**Files:**
- Rewrite: `frontend/src/messages/fr/elevePortal.json`
- Rewrite: `frontend/src/messages/ht/elevePortal.json`
- Rewrite: `frontend/src/messages/en/elevePortal.json`

**Interfaces:**
- Produces: the `ElevePortal.*` keys every later task reads (`nav.*`, `topbar.*`, `home.*`, `profile.*`, `settings.*`, `roleLabel`, `loadError`). `comingSoon` is removed (its only consumer, the old `page.tsx`, is rewritten in Task 5). Nav keys for the Plan 2/3 screens are added now so those plans only touch code.

- [ ] **Step 1: Write `fr/elevePortal.json`**

```json
{
  "roleLabel": "Élève",
  "title": "Espace élève",
  "welcome": "Bienvenue, {name}",
  "logout": "Se déconnecter",
  "loadError": "Impossible de charger vos informations pour le moment.",
  "nav": {
    "ariaLabel": "Navigation principale",
    "sectionLabel": "Principal",
    "home": "Accueil",
    "profile": "Mon profil",
    "schoolSectionLabel": "Scolarité",
    "grades": "Mes notes",
    "attendance": "Mes présences",
    "timetable": "Emploi du temps",
    "bulletins": "Bulletins",
    "appreciations": "Appréciations",
    "accountSectionLabel": "Compte",
    "settings": "Paramètres",
    "moreAriaLabel": "Ouvrir le menu"
  },
  "topbar": {
    "defaultPageTitle": "Espace élève"
  },
  "home": {
    "subtitle": "{className} · {yearLabel}",
    "noClass": "Aucune classe pour l'année en cours.",
    "stats": {
      "overallAverage": "Moyenne générale",
      "attendanceRate": "Taux de présence",
      "absences": "Absences ce trimestre",
      "rank": "Rang de classe",
      "rankOf": "{rank} / {count}"
    },
    "today": "Cours d'aujourd'hui",
    "noCoursesToday": "Aucun cours aujourd'hui.",
    "thisWeek": "Cette semaine",
    "noSessions": "Aucun cours prévu cette semaine.",
    "viewTimetable": "Voir l'emploi du temps",
    "sessionsCount": "{count, plural, =0 {Aucun cours} one {# cours} other {# cours}}",
    "recentGrades": "Dernières notes",
    "noRecentGrades": "Aucune note publiée pour le moment.",
    "absent": "Absent(e)",
    "quickActions": "Accès rapides",
    "myGrades": "Mes notes",
    "myBulletins": "Mes bulletins"
  },
  "profile": {
    "title": "Mon profil",
    "subtitle": "Vos informations telles qu'enregistrées par l'établissement.",
    "readOnlyHint": "Pour corriger une information, adressez-vous au secrétariat de l'école.",
    "homeroomSuffix": "(titulaire)",
    "ageYears": "{age} ans",
    "identity": "Identité",
    "contact": "Coordonnées",
    "guardians": "Tuteurs",
    "noGuardian": "Aucun tuteur renseigné.",
    "primary": "Principal",
    "fields": {
      "fullName": "Nom complet",
      "dateOfBirth": "Date de naissance",
      "placeOfBirth": "Lieu de naissance",
      "gender": "Genre",
      "nationality": "Nationalité",
      "motherTongue": "Langue maternelle",
      "class": "Classe",
      "homeroomTeacher": "Enseignant titulaire",
      "enrolledAt": "Date d'inscription",
      "scholarship": "Bourse",
      "yes": "Oui",
      "no": "Non",
      "status": "Statut",
      "phone": "Téléphone",
      "email": "Email",
      "address": "Adresse"
    }
  },
  "settings": {
    "subtitle": "Votre profil, l'apparence et la langue de votre espace."
  }
}
```

- [ ] **Step 2: Write `en/elevePortal.json`**

```json
{
  "roleLabel": "Student",
  "title": "Student space",
  "welcome": "Welcome, {name}",
  "logout": "Log out",
  "loadError": "We could not load your information right now.",
  "nav": {
    "ariaLabel": "Main navigation",
    "sectionLabel": "Main",
    "home": "Home",
    "profile": "My profile",
    "schoolSectionLabel": "School life",
    "grades": "My grades",
    "attendance": "My attendance",
    "timetable": "Timetable",
    "bulletins": "Report cards",
    "appreciations": "Appreciations",
    "accountSectionLabel": "Account",
    "settings": "Settings",
    "moreAriaLabel": "Open the menu"
  },
  "topbar": {
    "defaultPageTitle": "Student space"
  },
  "home": {
    "subtitle": "{className} · {yearLabel}",
    "noClass": "No class for the current year.",
    "stats": {
      "overallAverage": "Overall average",
      "attendanceRate": "Attendance rate",
      "absences": "Absences this term",
      "rank": "Class rank",
      "rankOf": "{rank} / {count}"
    },
    "today": "Today's classes",
    "noCoursesToday": "No classes today.",
    "thisWeek": "This week",
    "noSessions": "No classes scheduled this week.",
    "viewTimetable": "View the timetable",
    "sessionsCount": "{count, plural, =0 {No classes} one {# class} other {# classes}}",
    "recentGrades": "Latest grades",
    "noRecentGrades": "No published grade yet.",
    "absent": "Absent",
    "quickActions": "Quick access",
    "myGrades": "My grades",
    "myBulletins": "My report cards"
  },
  "profile": {
    "title": "My profile",
    "subtitle": "Your information as recorded by the school.",
    "readOnlyHint": "To correct any detail, contact the school office.",
    "homeroomSuffix": "(homeroom)",
    "ageYears": "{age} years old",
    "identity": "Identity",
    "contact": "Contact details",
    "guardians": "Guardians",
    "noGuardian": "No guardian on file.",
    "primary": "Primary",
    "fields": {
      "fullName": "Full name",
      "dateOfBirth": "Date of birth",
      "placeOfBirth": "Place of birth",
      "gender": "Gender",
      "nationality": "Nationality",
      "motherTongue": "Mother tongue",
      "class": "Class",
      "homeroomTeacher": "Homeroom teacher",
      "enrolledAt": "Enrollment date",
      "scholarship": "Scholarship",
      "yes": "Yes",
      "no": "No",
      "status": "Status",
      "phone": "Phone",
      "email": "Email",
      "address": "Address"
    }
  },
  "settings": {
    "subtitle": "Your profile, the look and the language of your space."
  }
}
```

- [ ] **Step 3: Write `ht/elevePortal.json`**

```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman.",
  "roleLabel": "Elèv",
  "title": "Espas elèv",
  "welcome": "Byenveni, {name}",
  "logout": "Dekonekte",
  "loadError": "Nou pa t kapab chaje enfòmasyon w yo kounye a.",
  "nav": {
    "ariaLabel": "Navigasyon prensipal",
    "sectionLabel": "Prensipal",
    "home": "Akèy",
    "profile": "Pwofil mwen",
    "schoolSectionLabel": "Lavi lekòl",
    "grades": "Nòt mwen yo",
    "attendance": "Prezans mwen yo",
    "timetable": "Orè",
    "bulletins": "Bilten",
    "appreciations": "Apresyasyon",
    "accountSectionLabel": "Kont",
    "settings": "Paramèt",
    "moreAriaLabel": "Louvri meni an"
  },
  "topbar": {
    "defaultPageTitle": "Espas elèv"
  },
  "home": {
    "subtitle": "{className} · {yearLabel}",
    "noClass": "Ou pa nan okenn klas pou ane sa a.",
    "stats": {
      "overallAverage": "Mwayèn jeneral",
      "attendanceRate": "To prezans",
      "absences": "Absans trimès sa a",
      "rank": "Ran nan klas la",
      "rankOf": "{rank} / {count}"
    },
    "today": "Kou jodi a",
    "noCoursesToday": "Pa gen kou jodi a.",
    "thisWeek": "Semèn sa a",
    "noSessions": "Pa gen kou prevwa semèn sa a.",
    "viewTimetable": "Gade orè a",
    "sessionsCount": "{count, plural, =0 {Pa gen kou} one {# kou} other {# kou}}",
    "recentGrades": "Dènye nòt yo",
    "noRecentGrades": "Poko gen nòt pibliye.",
    "absent": "Absan",
    "quickActions": "Aksè rapid",
    "myGrades": "Nòt mwen yo",
    "myBulletins": "Bilten mwen yo"
  },
  "profile": {
    "title": "Pwofil mwen",
    "subtitle": "Enfòmasyon w yo jan lekòl la anrejistre yo.",
    "readOnlyHint": "Pou korije yon enfòmasyon, kontakte sekretarya lekòl la.",
    "homeroomSuffix": "(titilè)",
    "ageYears": "{age} an",
    "identity": "Idantite",
    "contact": "Kowòdone",
    "guardians": "Responsab",
    "noGuardian": "Pa gen responsab anrejistre.",
    "primary": "Prensipal",
    "fields": {
      "fullName": "Non konplè",
      "dateOfBirth": "Dat nesans",
      "placeOfBirth": "Kote ou fèt",
      "gender": "Sèks",
      "nationality": "Nasyonalite",
      "motherTongue": "Lang manman",
      "class": "Klas",
      "homeroomTeacher": "Pwofesè titilè",
      "enrolledAt": "Dat enskripsyon",
      "scholarship": "Bous",
      "yes": "Wi",
      "no": "Non",
      "status": "Estati",
      "phone": "Telefòn",
      "email": "Imèl",
      "address": "Adrès"
    }
  },
  "settings": {
    "subtitle": "Pwofil ou, aparans ak lang espas ou a."
  }
}
```

- [ ] **Step 4: Run the parity tripwire**

Run: `pnpm --filter frontend exec vitest run src/lib/locales.test.ts`
Expected: PASS (three identical key trees; `_review` is ignored).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/messages/fr/elevePortal.json frontend/src/messages/ht/elevePortal.json frontend/src/messages/en/elevePortal.json
git commit -m "feat(eleve-portal): elevePortal messages for the shell, dashboard, profile and settings

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(Typecheck will fail between this commit and Task 5 because `page.tsx` still reads `comingSoon`; that is expected and resolved by Task 5. Do not run the full gate on this commit.)

---

### Task 3: `GET /api/student/me`

**Files:**
- Create: `frontend/src/app/api/student/me/route.ts`
- Test: `frontend/src/app/api/student/me/route.test.ts`

**Interfaces:**
- Consumes: `requireStudent(req: NextRequest): Promise<StudentContext | NextResponse>` from `@/lib/server/middleware/require-student` (`StudentContext = { user: { sub, email }, student: { studentId, schoolId, classId: string | null, academicYearId: string | null } }`); `resolveActiveAcademicYear(schoolId)` from `@/lib/server/school`; `resolveCurrentTerm`, `classGeneralAverages`, `competitionRank` from `@/lib/server/grades`; `attendanceRate`, `absenceCount`, `mondayOf`, `addDays` from `@/lib/server/attendance`; `SESSION_INCLUDE`, `serializeSession`, `seriesCounts`, `SerializedSession` from `@/lib/server/timetable-route-helpers`.
- Produces: the JSON body typed client-side as `StudentMeResponse` (Task 5's `types.ts`):
  ```
  {
    student: { id, studentNumber, firstName, lastName, photoUrl, dateOfBirth (ISO), placeOfBirth, gender, nationality, address, motherTongue, phone, email, status, enrolledAt (ISO), scholarship, guardians: [{ id, name, relationship, phone, email, isPrimary }] },
    school: { id, name },
    class: { id, name, level } | null,
    homeroomTeacher: { id, name } | null,
    academicYear: { id, label } | null,
    terms: [{ id, label, order, type, startDate (ISO), endDate (ISO) }],
    currentTermId: string | null,
    summary: { overallAverage: number | null, rank: number | null, rankedCount: number, attendanceRatePercent: number | null, absences: number },
    thisWeekSessions: SerializedSession[],
    recentGrades: [{ evaluationId, label, subjectName, subjectIcon, subjectColor, date (ISO) | null, score, maxScore, absent }]
  }
  ```

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/student/me/route.test.ts`:

```ts
// GET /api/student/me — the Espace Élève's one aggregate read. prismaMock
// first (auto-hoists vi.mock for '@/lib/server/prisma').
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware/require-student', () => ({ requireStudent: vi.fn() }));
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveActiveAcademicYear: vi.fn() };
});

import { requireStudent } from '@/lib/server/middleware/require-student';
import { resolveActiveAcademicYear } from '@/lib/server/school';
import { GET } from './route';

const mockRequireStudent = vi.mocked(requireStudent);
const mockResolveYear = vi.mocked(resolveActiveAcademicYear);
const groupByMock = prismaMock.timetableSession.groupBy as unknown as ReturnType<typeof vi.fn>;

const studentCtx = {
  user: { sub: 'user_1', email: 'eleve@test.local' },
  student: { studentId: 'stu_1', schoolId: 'school_1', classId: 'cls_1', academicYearId: 'year_1' },
};

function req() {
  return new NextRequest('http://localhost/api/student/me');
}

const T1_START = new Date('2025-09-01T00:00:00.000Z');
// Ends far in the future so resolveCurrentTerm picks it whatever the run date.
const T1_END = new Date('2099-12-31T00:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudent.mockResolvedValue(studentCtx as never);
  mockResolveYear.mockResolvedValue({ id: 'year_1', label: '2025-2026', startDate: T1_START });
  prismaMock.student.findUniqueOrThrow.mockResolvedValue({
    id: 'stu_1',
    studentNumber: 'EL-2025-001',
    firstName: 'Nadia',
    lastName: 'Joseph',
    photoUrl: null,
    dateOfBirth: new Date('2012-03-04T00:00:00.000Z'),
    placeOfBirth: 'Port-au-Prince',
    gender: 'Féminin',
    nationality: 'Haïtienne',
    address: 'Delmas 33',
    motherTongue: 'Créole',
    phone: null,
    email: 'nadia.joseph@eleves.test.local',
    status: 'ENROLLED',
    enrolledAt: new Date('2025-09-02T00:00:00.000Z'),
    scholarship: false,
    guardians: [
      {
        id: 'g_1',
        name: 'Marie Joseph',
        relationship: 'Mère',
        phone: '+509 3700 0000',
        email: null,
        isPrimary: true,
      },
    ],
  } as never);
  prismaMock.school.findUniqueOrThrow.mockResolvedValue({
    id: 'school_1',
    name: 'École Les Étoiles',
  } as never);
  prismaMock.class.findUnique.mockResolvedValue({
    id: 'cls_1',
    name: '6ème A',
    level: '6ème',
    homeroomTeacher: { id: 'tea_1', name: 'Carline Michel' },
  } as never);
  prismaMock.term.findMany.mockResolvedValue([
    {
      id: 'term_1',
      label: '1er Trimestre',
      order: 1,
      type: 'TRIMESTRE',
      startDate: T1_START,
      endDate: T1_END,
    },
  ] as never);
  prismaMock.timetableSession.findMany.mockResolvedValue([]);
  groupByMock.mockResolvedValue([]);
  prismaMock.classSubject.findMany.mockResolvedValue([
    { id: 'cs_1', classId: 'cls_1', subjectId: 'sub_1', coefficient: 2 },
  ] as never);
  prismaMock.enrollment.findMany.mockResolvedValue([
    { studentId: 'stu_1' },
    { studentId: 'stu_2' },
  ] as never);
  prismaMock.attendance.findMany.mockResolvedValue([
    { status: 'PRESENT' },
    { status: 'PRESENT' },
    { status: 'ABSENT' },
    { status: 'LATE' },
  ] as never);
  prismaMock.evaluation.findMany.mockResolvedValue([
    {
      id: 'ev_1',
      classSubjectId: 'cs_1',
      coefficient: 1,
      maxScore: 20,
      status: 'PUBLISHED',
      countsTowardAverage: true,
      grades: [
        { studentId: 'stu_1', score: 14, absent: false },
        { studentId: 'stu_2', score: 16, absent: false },
      ],
    },
  ] as never);
  prismaMock.grade.findMany.mockResolvedValue([]);
});

describe('GET /api/student/me', () => {
  it('passes the requireStudent response through without touching the DB', async () => {
    mockRequireStudent.mockResolvedValue(
      NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }) as never,
    );
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect(prismaMock.student.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('reads the session student only and never the staff-only notes field', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const call = prismaMock.student.findUniqueOrThrow.mock.calls[0]?.[0];
    expect(call?.where).toEqual({ id: 'stu_1' });
    const select = call?.select as Record<string, unknown>;
    expect(select.notes).toBeUndefined();
    expect(select.userId).toBeUndefined();
    const body = await res.json();
    expect(body.student).toMatchObject({
      id: 'stu_1',
      studentNumber: 'EL-2025-001',
      firstName: 'Nadia',
      lastName: 'Joseph',
      dateOfBirth: '2012-03-04T00:00:00.000Z',
      enrolledAt: '2025-09-02T00:00:00.000Z',
    });
    expect(body.student.notes).toBeUndefined();
    expect(body.student.guardians).toEqual([
      {
        id: 'g_1',
        name: 'Marie Joseph',
        relationship: 'Mère',
        phone: '+509 3700 0000',
        email: null,
        isPrimary: true,
      },
    ]);
  });

  it('returns school, class, homeroom teacher, academic year, terms and currentTermId', async () => {
    const body = await (await GET(req())).json();
    expect(body.school).toEqual({ id: 'school_1', name: 'École Les Étoiles' });
    expect(body.class).toEqual({ id: 'cls_1', name: '6ème A', level: '6ème' });
    expect(body.homeroomTeacher).toEqual({ id: 'tea_1', name: 'Carline Michel' });
    expect(body.academicYear).toEqual({ id: 'year_1', label: '2025-2026' });
    expect(body.terms).toEqual([
      {
        id: 'term_1',
        label: '1er Trimestre',
        order: 1,
        type: 'TRIMESTRE',
        startDate: T1_START.toISOString(),
        endDate: T1_END.toISOString(),
      },
    ]);
    expect(body.currentTermId).toBe('term_1');
    expect(prismaMock.class.findUnique.mock.calls[0]?.[0]?.where).toEqual({ id: 'cls_1' });
  });

  it("scopes this week's sessions to the student's own class, school and active year", async () => {
    await GET(req());
    const where = prismaMock.timetableSession.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ schoolId: 'school_1', academicYearId: 'year_1', classId: 'cls_1' });
  });

  it('computes the current-term summary from PUBLISHED evaluations and the term attendance rows', async () => {
    const body = await (await GET(req())).json();
    expect(prismaMock.evaluation.findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      termId: 'term_1',
      status: 'PUBLISHED',
    });
    expect(prismaMock.attendance.findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      studentId: 'stu_1',
      date: { gte: T1_START, lte: T1_END },
    });
    expect(body.summary).toEqual({
      overallAverage: 14,
      rank: 2,
      rankedCount: 2,
      attendanceRatePercent: 75,
      absences: 1,
    });
  });

  it('returns the 5 most recent PUBLISHED grades, dated ones newest first, undated last', async () => {
    const row = (id: string, date: Date | null, updatedAt: Date) => ({
      score: 12,
      absent: false,
      evaluation: {
        id,
        label: id,
        date,
        updatedAt,
        maxScore: 20,
        classSubject: { subject: { name: 'Maths', icon: null, color: null } },
      },
    });
    prismaMock.grade.findMany.mockResolvedValue([
      row('undated_new', null, new Date('2026-02-01T00:00:00.000Z')),
      row('old', new Date('2026-01-05T00:00:00.000Z'), new Date('2026-01-05T00:00:00.000Z')),
      row('new', new Date('2026-01-20T00:00:00.000Z'), new Date('2026-01-20T00:00:00.000Z')),
      row('undated_old', null, new Date('2026-01-01T00:00:00.000Z')),
      row('mid', new Date('2026-01-10T00:00:00.000Z'), new Date('2026-01-10T00:00:00.000Z')),
      row('oldest', new Date('2025-12-01T00:00:00.000Z'), new Date('2025-12-01T00:00:00.000Z')),
    ] as never);
    const body = await (await GET(req())).json();
    expect(prismaMock.grade.findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      studentId: 'stu_1',
      evaluation: { status: 'PUBLISHED', term: { academicYearId: 'year_1' } },
    });
    expect(body.recentGrades.map((g: { evaluationId: string }) => g.evaluationId)).toEqual([
      'new',
      'mid',
      'old',
      'oldest',
      'undated_new',
    ]);
    expect(body.recentGrades[0]).toEqual({
      evaluationId: 'new',
      label: 'new',
      subjectName: 'Maths',
      subjectIcon: null,
      subjectColor: null,
      date: '2026-01-20T00:00:00.000Z',
      score: 12,
      maxScore: 20,
      absent: false,
    });
  });

  it('degrades gracefully without a current enrollment: no class, no sessions, empty summary', async () => {
    mockRequireStudent.mockResolvedValue({
      ...studentCtx,
      student: { ...studentCtx.student, classId: null, academicYearId: null },
    } as never);
    const body = await (await GET(req())).json();
    expect(body.class).toBeNull();
    expect(body.homeroomTeacher).toBeNull();
    expect(body.thisWeekSessions).toEqual([]);
    expect(body.summary).toEqual({
      overallAverage: null,
      rank: null,
      rankedCount: 0,
      attendanceRatePercent: null,
      absences: 0,
    });
    expect(prismaMock.class.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.timetableSession.findMany).not.toHaveBeenCalled();
    expect(prismaMock.evaluation.findMany).not.toHaveBeenCalled();
  });

  it('returns empty terms, null currentTermId and no recent grades when no academic year is active', async () => {
    mockResolveYear.mockResolvedValue(null);
    const body = await (await GET(req())).json();
    expect(body.academicYear).toBeNull();
    expect(body.terms).toEqual([]);
    expect(body.currentTermId).toBeNull();
    expect(body.recentGrades).toEqual([]);
    expect(prismaMock.term.findMany).not.toHaveBeenCalled();
    expect(prismaMock.grade.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/student/me/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement the route**

Create `frontend/src/app/api/student/me/route.ts`:

```ts
// GET /api/student/me — the Espace Élève's one aggregate read: this
// student's identity (minus staff-only fields), current class + homeroom
// teacher, active academic year + terms, the current-term summary behind
// the dashboard KPIs, this week's class sessions, and the 5 most recent
// published grades. One round trip avoids a phone-network waterfall of
// separate reads. Student-linked accounts only — anything else gets the
// 404 requireStudent returns (not-found-for-you, matching every other
// ownership-scoped route). The studentId is never a parameter: it is the
// session's own resolved id. See
// docs/superpowers/specs/2026-09-02-espace-eleve-phase2-design.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStudent } from '@/lib/server/middleware/require-student';
import { prisma } from '@/lib/server/prisma';
import { resolveActiveAcademicYear } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { absenceCount, addDays, attendanceRate, mondayOf } from '@/lib/server/attendance';
import { classGeneralAverages, competitionRank, resolveCurrentTerm } from '@/lib/server/grades';
import {
  SESSION_INCLUDE,
  serializeSession,
  seriesCounts,
  type SerializedSession,
} from '@/lib/server/timetable-route-helpers';

// Monday → Saturday: some schools run Saturday classes; the dashboard's
// week preview only widens to 6 columns when a Saturday session exists.
const WEEK_SPAN_DAYS = 6;
const RECENT_GRADES = 5;

interface Summary {
  overallAverage: number | null;
  rank: number | null;
  rankedCount: number;
  attendanceRatePercent: number | null;
  absences: number;
}

const EMPTY_SUMMARY: Summary = {
  overallAverage: null,
  rank: null,
  rankedCount: 0,
  attendanceRatePercent: null,
  absences: 0,
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStudent(req);
    if (auth instanceof NextResponse) return auth;
    const { studentId, schoolId, classId } = auth.student;

    const [student, school, cls, activeYear] = await Promise.all([
      prisma.student.findUniqueOrThrow({
        where: { id: studentId },
        // Deliberately no `notes` (staff-only observations) and no
        // `userId`/`user` (invite-state plumbing the fiche needs, not the
        // student). Spec decision 5.
        select: {
          id: true,
          studentNumber: true,
          firstName: true,
          lastName: true,
          photoUrl: true,
          dateOfBirth: true,
          placeOfBirth: true,
          gender: true,
          nationality: true,
          address: true,
          motherTongue: true,
          phone: true,
          email: true,
          status: true,
          enrolledAt: true,
          scholarship: true,
          guardians: {
            orderBy: { isPrimary: 'desc' },
            select: {
              id: true,
              name: true,
              relationship: true,
              phone: true,
              email: true,
              isPrimary: true,
            },
          },
        },
      }),
      prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { id: true, name: true } }),
      classId
        ? prisma.class.findUnique({
            where: { id: classId },
            select: {
              id: true,
              name: true,
              level: true,
              homeroomTeacher: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve(null),
      resolveActiveAcademicYear(schoolId),
    ]);

    const terms = activeYear
      ? await prisma.term.findMany({
          where: { academicYearId: activeYear.id },
          orderBy: { order: 'asc' },
          select: { id: true, label: true, order: true, type: true, startDate: true, endDate: true },
        })
      : [];
    const currentTerm = resolveCurrentTerm(terms);

    let thisWeekSessions: SerializedSession[] = [];
    if (activeYear && classId) {
      const from = mondayOf(new Date());
      const to = addDays(from, WEEK_SPAN_DAYS - 1);
      const rows = await prisma.timetableSession.findMany({
        where: { schoolId, academicYearId: activeYear.id, classId, date: { gte: from, lte: to } },
        orderBy: [{ date: 'asc' }, { startMinutes: 'asc' }],
        include: SESSION_INCLUDE,
      });
      const counts = await seriesCounts(prisma, rows);
      thisWeekSessions = rows.map((s) =>
        serializeSession(s, s.seriesId ? counts.get(s.seriesId) : 1),
      );
    }

    // Same moyenne/rang math as /api/school/students/[id]/bulletins, for the
    // current term only; attendance via the same helpers the Présences
    // roster uses, so the dashboard never drifts from the Présences page.
    let summary: Summary = EMPTY_SUMMARY;
    if (activeYear && classId && currentTerm) {
      const [classSubjects, classmates, attendanceRows] = await Promise.all([
        prisma.classSubject.findMany({ where: { classId } }),
        prisma.enrollment.findMany({
          where: { classId, academicYearId: activeYear.id },
          select: { studentId: true },
        }),
        prisma.attendance.findMany({
          where: { studentId, date: { gte: currentTerm.startDate, lte: currentTerm.endDate } },
          select: { status: true },
        }),
      ]);
      const classSubjectIds = classSubjects.map((cs) => cs.id);
      // subjectAverageFor already ignores drafts; the explicit status filter
      // keeps the published-only rule (spec decision 4) visible at the query.
      const evaluations =
        classSubjectIds.length === 0
          ? []
          : await prisma.evaluation.findMany({
              where: {
                classSubjectId: { in: classSubjectIds },
                termId: currentTerm.id,
                status: 'PUBLISHED',
              },
              include: { grades: true },
            });
      const evalsByClassSubject = new Map<string, typeof evaluations>();
      for (const ev of evaluations) {
        const list = evalsByClassSubject.get(ev.classSubjectId) ?? [];
        list.push(ev);
        evalsByClassSubject.set(ev.classSubjectId, list);
      }
      const classmateIds = classmates.map((cm) => cm.studentId);
      const averages = classGeneralAverages(classSubjects, evalsByClassSubject, classmateIds);
      const ranked = classmateIds
        .map((id) => ({ studentId: id, average: averages.get(id) ?? null }))
        .filter((r): r is { studentId: string; average: number } => r.average != null)
        .sort((a, b) => b.average - a.average);
      const ranks = competitionRank(ranked, (r) => r.average);
      const rankEntry = ranked.findIndex((r) => r.studentId === studentId);
      summary = {
        overallAverage: averages.get(studentId) ?? null,
        rank: rankEntry >= 0 ? ranks[rankEntry]! : null,
        rankedCount: ranked.length,
        attendanceRatePercent: attendanceRate(attendanceRows),
        absences: absenceCount(attendanceRows),
      };
    }

    // Recent grades: fetch a small window, then order in memory — dated
    // evaluations newest first, undated ones after them (Postgres would put
    // NULL dates FIRST in a DESC sort, which is the opposite of what a
    // student expects at the top of « Dernières notes »).
    const recentRows = activeYear
      ? await prisma.grade.findMany({
          where: {
            studentId,
            evaluation: { status: 'PUBLISHED', term: { academicYearId: activeYear.id } },
          },
          orderBy: { evaluation: { updatedAt: 'desc' } },
          take: RECENT_GRADES * 4,
          select: {
            score: true,
            absent: true,
            evaluation: {
              select: {
                id: true,
                label: true,
                date: true,
                updatedAt: true,
                maxScore: true,
                classSubject: {
                  select: { subject: { select: { name: true, icon: true, color: true } } },
                },
              },
            },
          },
        })
      : [];
    const recentGrades = [...recentRows]
      .sort((a, b) => {
        const da = a.evaluation.date?.getTime() ?? null;
        const db = b.evaluation.date?.getTime() ?? null;
        if (da != null && db != null) return db - da;
        if (da != null) return -1;
        if (db != null) return 1;
        return b.evaluation.updatedAt.getTime() - a.evaluation.updatedAt.getTime();
      })
      .slice(0, RECENT_GRADES)
      .map((g) => ({
        evaluationId: g.evaluation.id,
        label: g.evaluation.label,
        subjectName: g.evaluation.classSubject.subject.name,
        subjectIcon: g.evaluation.classSubject.subject.icon,
        subjectColor: g.evaluation.classSubject.subject.color,
        date: g.evaluation.date ? g.evaluation.date.toISOString() : null,
        score: g.score,
        maxScore: g.evaluation.maxScore,
        absent: g.absent,
      }));

    return NextResponse.json(
      {
        student: {
          ...student,
          dateOfBirth: student.dateOfBirth.toISOString(),
          enrolledAt: student.enrolledAt.toISOString(),
        },
        school,
        class: cls ? { id: cls.id, name: cls.name, level: cls.level } : null,
        homeroomTeacher: cls?.homeroomTeacher ?? null,
        academicYear: activeYear ? { id: activeYear.id, label: activeYear.label } : null,
        terms: terms.map((t) => ({
          id: t.id,
          label: t.label,
          order: t.order,
          type: t.type,
          startDate: t.startDate.toISOString(),
          endDate: t.endDate.toISOString(),
        })),
        currentTermId: currentTerm?.id ?? null,
        summary,
        thisWeekSessions,
        recentGrades,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/student/me/route.test.ts`
Expected: PASS, 8 tests. Then run the two tripwires that cover new routes:

Run: `pnpm --filter frontend exec vitest run src/lib/server/observability/runtime-enforcement.test.ts src/lib/server/observability/school-permission-enforcement.test.ts`
Expected: PASS (runtime export present; the RBAC tripwire only walks `/api/school/*`).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck` — expected: only the pre-existing `comingSoon` error from `(eleve)/eleve/page.tsx` (Task 5 fixes it); nothing from the new route.

```bash
git add frontend/src/app/api/student/me/route.ts frontend/src/app/api/student/me/route.test.ts
git commit -m "feat(eleve-portal): GET /api/student/me aggregate read (identity, class, term summary, week, recent grades)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Student shell (sidebar, topbar, year badge, bottom nav, layout)

**Files:**
- Create: `frontend/src/components/layout/student/StudentSidebar.tsx`
- Create: `frontend/src/components/layout/student/StudentTopbar.tsx`
- Create: `frontend/src/components/layout/student/StudentAcademicYearBadge.tsx`
- Create: `frontend/src/components/layout/student/StudentMobileBottomNav.tsx`
- Rewrite: `frontend/src/app/(eleve)/eleve/layout.tsx`

**Interfaces:**
- Consumes: `Sidebar` (`components/layout/sidebar/Sidebar.tsx`, props `sections, variant, brand, brandCollapsed, roleLabel, profileHref, collapsed, onToggleCollapse, onNavigate, currentSpace`), `NavSection` type, `useSidebarCollapse()` → `[collapsed, toggle]`, `SIDEBAR_WIDTH_CLASS`, `isActiveRoute`, `Breadcrumbs`, `getBreadcrumbTrail(pathname, sections, extraLabels)`, `CommandPalette`, `HelpMenu`, `NotificationsMenu`, `OfflineIndicator`, `useApi`, `Skeleton`, `useUser`, `Shell.closeMenu` message.
- Produces: `useStudentSections(): NavSection[]` (exported from `StudentSidebar.tsx`, reused by the topbar and by Plans 2/3 when they add entries), `StudentSidebar`, `StudentTopbar`, `StudentAcademicYearBadge`, `StudentMobileBottomNav({ onMoreClick })`.

- [ ] **Step 1: `StudentSidebar.tsx`**

```tsx
'use client';

import { LayoutDashboard, Settings, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useMemo } from 'react';
import { Sidebar } from '../sidebar/Sidebar';
import type { NavSection } from '../sidebar/types';

// Student shell sidebar — fourth instance of the shared Sidebar bricks
// (SchoolSidebar, AdminSidebar and TeacherSidebar are the other three).
// Same `light` variant as the school and teacher shells so every surface
// reads as one product. Sections: Principal (Accueil, Mon profil) /
// Scolarité (added by Plan 2: Mes notes, Mes présences, Bulletins,
// Appréciations; Plan 3: Emploi du temps) / Compte (Paramètres). No role
// filtering: every student sees the same entries. Exposed as a hook for
// the same reason useTeacherSections is one — StudentTopbar needs the same
// translated sections for breadcrumbs and the command palette.
export function useStudentSections(): NavSection[] {
  const t = useTranslations('ElevePortal.nav');
  return useMemo<NavSection[]>(
    () => [
      {
        label: t('sectionLabel'),
        items: [
          { label: t('home'), href: '/eleve', icon: LayoutDashboard },
          { label: t('profile'), href: '/eleve/profil', icon: UserRound },
        ],
      },
      {
        label: t('accountSectionLabel'),
        items: [{ label: t('settings'), href: '/eleve/parametres', icon: Settings }],
      },
    ],
    [t],
  );
}

interface StudentSidebarProps {
  onNavigate?: (() => void) | undefined;
  collapsed?: boolean;
  onToggleCollapse?: (() => void) | undefined;
}

export function StudentSidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: StudentSidebarProps) {
  const t = useTranslations('ElevePortal');
  const sections = useStudentSections();
  return (
    <Sidebar
      sections={sections}
      variant="light"
      brand={
        <Image
          src="/logos/schoolgesti-lockup.svg"
          alt="Schoolgesti"
          width={164}
          height={44}
          className="h-10 w-auto"
          priority
        />
      }
      brandCollapsed={
        <Image src="/logos/schoolgesti-monogramme.svg" alt="Schoolgesti" width={34} height={34} />
      }
      roleLabel={t('roleLabel')}
      profileHref="/eleve/parametres"
      currentSpace="student"
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      onNavigate={onNavigate}
    />
  );
}
```

- [ ] **Step 2: `StudentAcademicYearBadge.tsx`**

```tsx
'use client';

import { Calendar } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { Skeleton } from '@/components/ui/Skeleton';

interface StudentMeYearResponse {
  academicYear: { label: string } | null;
}

// Student twin of topbar/AcademicYearBadge — same pill, different source:
// GET /api/school is deny-by-default for a student account, while
// /api/student/me already carries the active year (and is cached by
// useApi, so this costs nothing extra next to the dashboard's own fetch).
export function StudentAcademicYearBadge() {
  const { data, loading } = useApi<StudentMeYearResponse>('/api/student/me');

  if (loading && !data) {
    return <Skeleton className="hidden h-10 w-28 rounded-full sm:block" />;
  }

  const label = data?.academicYear?.label;
  if (!label) return null;

  return (
    <div className="hidden h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-medium text-foreground sm:flex">
      <Calendar size={13} className="text-muted-foreground" />
      {label}
    </div>
  );
}
```

- [ ] **Step 3: `StudentTopbar.tsx`**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { Breadcrumbs } from '../topbar/Breadcrumbs';
import { getBreadcrumbTrail } from '../topbar/breadcrumb';
import { CommandPalette } from '../topbar/CommandPalette';
import { HelpMenu } from '../topbar/HelpMenu';
import { NotificationsMenu } from '../topbar/NotificationsMenu';
import { OfflineIndicator } from '../topbar/OfflineIndicator';
import { StudentAcademicYearBadge } from './StudentAcademicYearBadge';
import { useStudentSections } from './StudentSidebar';

// Student twin of TeacherTopbar — same widgets, student nav sections, and
// the student-safe year badge (see StudentAcademicYearBadge).
// NotificationsMenu talks to /api/notifications, which is user-scoped, not
// school-scoped, so it works for student accounts as-is.
const EXTRA_LABELS: Record<string, string> = {};

export function StudentTopbar() {
  const t = useTranslations('ElevePortal.topbar');
  const pathname = usePathname();
  const sections = useStudentSections();
  const trail = getBreadcrumbTrail(pathname, sections, EXTRA_LABELS);
  const pageTitle = trail[trail.length - 1] ?? t('defaultPageTitle');

  return (
    <header className="flex h-13 shrink-0 items-center justify-between px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate text-[15px] font-bold text-foreground sm:hidden">
          {pageTitle}
        </span>
        <Breadcrumbs root={<span>Schoolgesti</span>} trail={trail} />
      </div>

      <div className="flex items-center gap-2">
        <OfflineIndicator />
        <CommandPalette sections={sections} />
        <StudentAcademicYearBadge />
        <NotificationsMenu />
        <HelpMenu />
      </div>
    </header>
  );
}
```

- [ ] **Step 4: `StudentMobileBottomNav.tsx`**

```tsx
'use client';

// Student twin of teacher/TeacherMobileBottomNav — same phone-native bottom
// bar. Plan 1 ships Accueil + Mon profil + « Plus » (opens the sidebar
// drawer, where profile + logout live via SidebarUserProfile); Plan 2 adds
// Mes notes and Mes présences; Plan 3 adds Emploi du temps and drops Mon
// profil so the bar keeps 5 slots (the profile stays reachable from the
// drawer).
import { LayoutDashboard, Menu, UserRound, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActiveRoute } from '../sidebar/route-match';

interface BottomNavLink {
  key: 'home' | 'profile' | 'grades' | 'attendance' | 'timetable';
  href: string;
  icon: LucideIcon;
}

const LINK_DEFS: BottomNavLink[] = [
  { key: 'home', href: '/eleve', icon: LayoutDashboard },
  { key: 'profile', href: '/eleve/profil', icon: UserRound },
];

// Icon-only: a label under each narrow tab made the row read unevenly on
// the teacher bar. The name still reaches screen readers via `aria-label`.
export function StudentMobileBottomNav({ onMoreClick }: { onMoreClick: () => void }) {
  const t = useTranslations('ElevePortal.nav');
  const pathname = usePathname();
  const activeHref = LINK_DEFS.find((l) => isActiveRoute(pathname, l.href))?.href ?? null;
  const moreActive = activeHref === null;

  return (
    <nav
      aria-label={t('ariaLabel')}
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch bg-sidebar-light pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(26,26,46,0.08)] lg:hidden"
    >
      {LINK_DEFS.map((item) => {
        const active = item.href === activeHref;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={t(item.key)}
            className={`flex flex-1 items-center justify-center ${
              active ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <Icon size={24} strokeWidth={active ? 2.5 : 2} />
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMoreClick}
        aria-label={t('moreAriaLabel')}
        className={`flex flex-1 items-center justify-center ${
          moreActive ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        <Menu size={24} strokeWidth={moreActive ? 2.5 : 2} />
      </button>
    </nav>
  );
}
```

- [ ] **Step 5: Rewrite `(eleve)/eleve/layout.tsx`**

Replace the whole file with:

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useUser } from '@/contexts/AuthContext';
import { StudentMobileBottomNav } from '@/components/layout/student/StudentMobileBottomNav';
import { StudentSidebar } from '@/components/layout/student/StudentSidebar';
import { StudentTopbar } from '@/components/layout/student/StudentTopbar';
import { SIDEBAR_WIDTH_CLASS } from '@/components/layout/sidebar/width';
import { useSidebarCollapse } from '@/components/layout/sidebar/useSidebarCollapse';
import { Skeleton } from '@/components/ui/Skeleton';

// Student shell — same floating-panel structure as (school)/layout.tsx and
// (teacher)/espace-enseignant/layout.tsx (one flat sidebar+topbar surface,
// grey rounded content panel, bottom nav below lg) so the portal reads as
// the same product as the admin app. No SchoolPlanProvider: its
// /api/school/billing/plan read is deny-by-default for a student account.
// No reverse redirect either: the login and /espaces already route a
// student-only account here, and a multi-space account may open this
// portal deliberately. Logout lives in the sidebar's SidebarUserProfile,
// same as the other shells. See
// docs/superpowers/specs/2026-09-02-espace-eleve-phase2-design.md.
export default function EleveLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('Shell');
  const user = useUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useSidebarCollapse();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-sidebar-light">
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className={`relative z-50 flex h-full ${SIDEBAR_WIDTH_CLASS}`}>
            <StudentSidebar onNavigate={() => setDrawerOpen(false)} />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label={t('closeMenu')}
              className="absolute top-3 -right-11 flex h-9 w-9 items-center justify-center rounded-md bg-black/60 text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="hidden lg:flex">
        <StudentSidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <StudentTopbar />
        <main className="mx-3 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-background shadow-[0_1px_2px_rgba(26,26,46,0.04),0_8px_28px_-10px_rgba(26,26,46,0.14)] sm:mx-4 sm:mb-4 lg:ml-3">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-28 sm:px-6 sm:pt-6 sm:pb-28 lg:px-7 lg:py-7">
            {children}
          </div>
        </main>
        <StudentMobileBottomNav onMoreClick={() => setDrawerOpen(true)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Lint + typecheck**

Run: `pnpm lint` — expected: clean. Run: `pnpm typecheck` — expected: only the `comingSoon` error in `(eleve)/eleve/page.tsx` remains (Task 5). If anything else fails, fix it before committing.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/layout/student "frontend/src/app/(eleve)/eleve/layout.tsx"
git commit -m "feat(eleve-portal): admin-grade student shell (sidebar, topbar, year badge, bottom nav)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Accueil dashboard (`/eleve`) + shared client types

**Files:**
- Create: `frontend/src/app/(eleve)/eleve/types.ts`
- Rewrite: `frontend/src/app/(eleve)/eleve/page.tsx`

**Interfaces:**
- Consumes: `GET /api/student/me` (Task 3); `KpiCard` from `@/app/(school)/dashboard/KpiRow` (props `icon, iconBg, iconFg, value, label, sub?`); `formatOrdinal(rank, bcp47, t)` from `@/app/(school)/eleves/ordinal` with `t = useTranslations('Eleves.ordinal')`; `todayDay, weekDays, formatDayName, isoWeekday, minutesToHHMM` from `@/components/school/timetable/timetable-utils`; `getSubjectVisual(name, { icon, color })` → `{ Icon, iconFg, ... }` from `@/lib/subject-visuals`; `LOCALE_BCP47`, `LocaleKey` from `@/lib/locales`.
- Produces: `StudentMeResponse` and friends (`types.ts`), reused by Task 6 and by Plans 2/3.

- [ ] **Step 1: `types.ts`**

```ts
// Client-side shape of GET /api/student/me (app/api/student/me/route.ts).
// Kept local to the (eleve) group, the way the teacher pages keep theirs.
import type { StudentStatus } from '@/app/(school)/eleves/types';

export interface StudentMeGuardian {
  id: string;
  name: string;
  relationship: string;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
}

export interface StudentMeStudent {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  dateOfBirth: string;
  placeOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
  address: string | null;
  motherTongue: string | null;
  phone: string | null;
  email: string | null;
  status: StudentStatus;
  enrolledAt: string;
  scholarship: boolean;
  guardians: StudentMeGuardian[];
}

export interface StudentMeSession {
  id: string;
  date: string;
  startMinutes: number;
  endMinutes: number;
  room: string | null;
  type: string;
  class: { id: string; name: string; color: string | null };
  subject: {
    id: string;
    name: string;
    abbreviation: string | null;
    color: string | null;
    icon: string | null;
  };
  teacher: { id: string; name: string; photoUrl: string | null } | null;
}

export interface StudentMeRecentGrade {
  evaluationId: string;
  label: string;
  subjectName: string;
  subjectIcon: string | null;
  subjectColor: string | null;
  date: string | null;
  score: number | null;
  maxScore: number;
  absent: boolean;
}

export interface StudentMeTerm {
  id: string;
  label: string;
  order: number;
  type: string;
  startDate: string;
  endDate: string;
}

export interface StudentMeResponse {
  student: StudentMeStudent;
  school: { id: string; name: string };
  class: { id: string; name: string; level: string } | null;
  homeroomTeacher: { id: string; name: string } | null;
  academicYear: { id: string; label: string } | null;
  terms: StudentMeTerm[];
  currentTermId: string | null;
  summary: {
    overallAverage: number | null;
    rank: number | null;
    rankedCount: number;
    attendanceRatePercent: number | null;
    absences: number;
  };
  thisWeekSessions: StudentMeSession[];
  recentGrades: StudentMeRecentGrade[];
}
```

- [ ] **Step 2: Rewrite `page.tsx`**

```tsx
'use client';

// Accueil de l'Espace Élève — the student's own dashboard: current-term
// KPIs (moyenne, présence, absences, rang), today's courses, the week at a
// glance and the latest published grades, all from the single
// /api/student/me aggregate. Same building blocks as the teacher home
// (KpiCard, compact Cards, subject visuals) so the two portals read as one
// product. The « Voir l'emploi du temps » link and the quick-access cards
// to the Scolarité screens are added by Plans 2 and 3 with those screens.
import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BarChart2, CalendarCheck, CalendarX2, Trophy } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { LOCALE_BCP47, type LocaleKey } from '@/lib/locales';
import { getSubjectVisual } from '@/lib/subject-visuals';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { KpiCard } from '@/app/(school)/dashboard/KpiRow';
import { formatOrdinal } from '@/app/(school)/eleves/ordinal';
import {
  todayDay,
  weekDays,
  formatDayName,
  isoWeekday,
  minutesToHHMM,
} from '@/components/school/timetable/timetable-utils';
import type { StudentMeResponse } from './types';

function fmtNumber(n: number | null, bcp47: string): string {
  return n == null
    ? '—'
    : n.toLocaleString(bcp47, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtShortDate(iso: string, bcp47: string): string {
  return new Date(iso).toLocaleDateString(bcp47, { day: 'numeric', month: 'short' });
}

export default function EspaceElevePage() {
  const t = useTranslations('ElevePortal');
  const tOrdinal = useTranslations('Eleves.ordinal');
  const locale = useLocale() as LocaleKey;
  const bcp47 = LOCALE_BCP47[locale];
  const { data, loading, error } = useApi<StudentMeResponse>('/api/student/me');
  const today = todayDay();

  const todaysSessions = useMemo(
    () => (data?.thisWeekSessions ?? []).filter((s) => s.date === today),
    [data, today],
  );

  const weekByDay = useMemo(() => {
    const sessions = data?.thisWeekSessions ?? [];
    const withSaturday = sessions.some((s) => isoWeekday(s.date) === 6);
    const days = weekDays(today, withSaturday);
    const map = new Map<string, number>(days.map((d) => [d, 0]));
    for (const s of sessions) {
      if (map.has(s.date)) map.set(s.date, (map.get(s.date) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [data, today]);

  const currentTermLabel =
    data?.terms.find((term) => term.id === data.currentTermId)?.label ?? null;
  const termSub = currentTermLabel ? { sub: currentTermLabel } : {};

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
        {data && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('welcome', { name: data.student.firstName })}
            {' · '}
            {data.class
              ? t('home.subtitle', {
                  className: data.class.name,
                  yearLabel: data.academicYear?.label ?? '',
                })
              : t('home.noClass')}
          </p>
        )}
      </div>

      {loading && !data ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[104px] w-full" />
            ))}
          </div>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : error || !data ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {t('loadError')}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <KpiCard
              icon={BarChart2}
              iconBg="bg-secondary"
              iconFg="text-primary"
              value={fmtNumber(data.summary.overallAverage, bcp47)}
              label={t('home.stats.overallAverage')}
              {...termSub}
            />
            <KpiCard
              icon={CalendarCheck}
              iconBg="bg-success"
              iconFg="text-success-foreground"
              value={
                data.summary.attendanceRatePercent != null
                  ? `${data.summary.attendanceRatePercent}%`
                  : '—'
              }
              label={t('home.stats.attendanceRate')}
              {...termSub}
            />
            <KpiCard
              icon={CalendarX2}
              iconBg="bg-warning"
              iconFg="text-warning-foreground"
              value={String(data.summary.absences)}
              label={t('home.stats.absences')}
              {...termSub}
            />
            <KpiCard
              icon={Trophy}
              iconBg="bg-secondary"
              iconFg="text-primary"
              value={
                data.summary.rank != null
                  ? t('home.stats.rankOf', {
                      rank: formatOrdinal(data.summary.rank, bcp47, tOrdinal),
                      count: data.summary.rankedCount,
                    })
                  : '—'
              }
              label={t('home.stats.rank')}
              {...termSub}
            />
          </div>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold text-foreground">{t('home.today')}</h2>
            {todaysSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('home.noCoursesToday')}</p>
            ) : (
              <Card className="divide-y divide-border p-0">
                {todaysSessions.map((s) => {
                  const visual = getSubjectVisual(s.subject.name, {
                    icon: s.subject.icon,
                    color: s.subject.color,
                  });
                  const meta = [s.teacher?.name ?? null, s.room].filter(
                    (v): v is string => !!v,
                  );
                  return (
                    <div key={s.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span className="w-24 shrink-0 text-xs font-semibold text-primary">
                        {minutesToHHMM(s.startMinutes)}-{minutesToHHMM(s.endMinutes)}
                      </span>
                      <visual.Icon
                        size={15}
                        className="shrink-0"
                        style={{ color: visual.iconFg }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                        {s.subject.name}
                      </span>
                      {meta.length > 0 && (
                        <span className="shrink-0 truncate text-xs text-muted-foreground">
                          {meta.join(' · ')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </Card>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold text-foreground">{t('home.thisWeek')}</h2>
            {data.thisWeekSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('home.noSessions')}</p>
            ) : (
              <div
                className={`grid grid-cols-2 gap-2.5 ${
                  weekByDay.length === 6 ? 'sm:grid-cols-6' : 'sm:grid-cols-5'
                }`}
              >
                {weekByDay.map(([day, count]) => (
                  <Card
                    key={day}
                    className={`gap-0.5 p-3 ${day === today ? 'border-primary' : ''}`}
                  >
                    <span className="text-xs font-semibold text-foreground capitalize">
                      {formatDayName(day, locale)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t('home.sessionsCount', { count })}
                    </span>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold text-foreground">{t('home.recentGrades')}</h2>
            {data.recentGrades.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('home.noRecentGrades')}</p>
            ) : (
              <Card className="divide-y divide-border p-0">
                {data.recentGrades.map((g) => {
                  const visual = getSubjectVisual(g.subjectName, {
                    icon: g.subjectIcon,
                    color: g.subjectColor,
                  });
                  return (
                    <div key={g.evaluationId} className="flex items-center gap-3 px-3.5 py-2.5">
                      <visual.Icon
                        size={15}
                        className="shrink-0"
                        style={{ color: visual.iconFg }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {g.subjectName}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {g.label}
                          {g.date ? ` · ${fmtShortDate(g.date, bcp47)}` : ''}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-sm bg-secondary px-2 py-0.5 text-xs font-bold text-primary">
                        {g.absent
                          ? t('home.absent')
                          : g.score != null
                            ? `${fmtNumber(g.score, bcp47)} / ${g.maxScore}`
                            : '—'}
                      </span>
                    </div>
                  );
                })}
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck` — expected: both clean (the `comingSoon` error is gone with the rewrite). If `KpiCard`'s `sub` typing rejects the spread, keep the `termSub` object pattern (it exists precisely because `exactOptionalPropertyTypes` forbids passing `sub={undefined}`).

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(eleve)/eleve/types.ts" "frontend/src/app/(eleve)/eleve/page.tsx"
git commit -m "feat(eleve-portal): student dashboard (term KPIs, today, week, recent grades)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: « Mon profil » (`/eleve/profil`)

**Files:**
- Create: `frontend/src/app/(eleve)/eleve/profil/page.tsx`

**Interfaces:**
- Consumes: `StudentMeResponse` (Task 5), `Avatar` (`name, size, src?`), `Card`, `Skeleton`, `studentStatusLabel(status, t)` from `@/app/(school)/eleves/status-label` with `t = useTranslations('Eleves.status')`, `LOCALE_BCP47`.

- [ ] **Step 1: Write the page**

```tsx
'use client';

// Mon profil — the student's own record as the school holds it, read-only
// (the school stays the only editor: no edit, invite or unlink control
// here). The identity card mirrors the admin fiche's hero; the info cards
// mirror its « Informations » tab minus every edit affordance. Guardians
// are the student's own family contacts, shown with their phone/email.
import { useLocale, useTranslations } from 'next-intl';
import { Calendar, Hash, School as SchoolIcon, UserCheck, UserRound, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { LOCALE_BCP47 } from '@/lib/locales';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { studentStatusLabel } from '@/app/(school)/eleves/status-label';
import type { StudentMeResponse } from '../types';

function fmtDate(iso: string, bcp47: string): string {
  return new Date(iso).toLocaleDateString(bcp47, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function ageFrom(iso: string): number {
  const dob = new Date(iso);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

export default function EleveProfilPage() {
  const t = useTranslations('ElevePortal.profile');
  const tPortal = useTranslations('ElevePortal');
  const tStatus = useTranslations('Eleves.status');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const { data, loading, error } = useApi<StudentMeResponse>('/api/student/me');

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-40 rounded-md" />
        <Card className="gap-4 p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-64" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        </Card>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="mb-3.5 h-4 w-48" />
              <div className="flex flex-col gap-3">
                {Array.from({ length: 6 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <Skeleton className="h-3 w-28 shrink-0" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <p role="alert" className="text-sm text-destructive-foreground">
        {tPortal('loadError')}
      </p>
    );
  }

  const s = data.student;
  const fullName = `${s.firstName} ${s.lastName}`;
  const statusLabel = studentStatusLabel(s.status, tStatus);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Card className="gap-4 p-6">
        <div className="flex items-end gap-4">
          <div className="shrink-0 rounded-full border-[3px] border-card shadow-lg">
            <Avatar name={fullName} size={80} src={s.photoUrl} />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">{fullName}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Hash size={12} />#{s.studentNumber}
              </span>
              {data.class && (
                <span className="flex items-center gap-1">
                  <SchoolIcon size={12} />
                  {data.class.name}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar size={12} />
                {fmtDate(s.dateOfBirth, bcp47)} · {t('ageYears', { age: ageFrom(s.dateOfBirth) })}
              </span>
              {data.homeroomTeacher && (
                <span className="flex items-center gap-1">
                  <UserCheck size={12} />
                  {data.homeroomTeacher.name} {t('homeroomSuffix')}
                </span>
              )}
            </div>
            <div className="mt-2">
              <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-2xs font-semibold text-secondary-foreground">
                {statusLabel}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle icon={UserRound} label={t('identity')} />
          <InfoRow label={t('fields.fullName')} value={fullName} />
          <InfoRow label={t('fields.dateOfBirth')} value={fmtDate(s.dateOfBirth, bcp47)} />
          <InfoRow label={t('fields.placeOfBirth')} value={s.placeOfBirth ?? '—'} />
          <InfoRow label={t('fields.gender')} value={s.gender ?? '—'} />
          <InfoRow label={t('fields.nationality')} value={s.nationality ?? '—'} />
          <InfoRow label={t('fields.motherTongue')} value={s.motherTongue ?? '—'} />
          <InfoRow label={t('fields.class')} value={data.class?.name ?? '—'} />
          <InfoRow label={t('fields.homeroomTeacher')} value={data.homeroomTeacher?.name ?? '—'} />
          <InfoRow label={t('fields.enrolledAt')} value={fmtDate(s.enrolledAt, bcp47)} />
          <InfoRow
            label={t('fields.scholarship')}
            value={s.scholarship ? t('fields.yes') : t('fields.no')}
          />
          <InfoRow label={t('fields.status')} value={statusLabel} last />
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <SectionTitle icon={UserCheck} label={t('contact')} />
            <InfoRow label={t('fields.phone')} value={s.phone ?? '—'} />
            <InfoRow label={t('fields.email')} value={s.email ?? '—'} />
            <InfoRow label={t('fields.address')} value={s.address ?? '—'} last />
          </Card>

          <Card className="p-5">
            <SectionTitle icon={Users} label={t('guardians')} />
            {s.guardians.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noGuardian')}</p>
            ) : (
              <div className="flex flex-col gap-4">
                {s.guardians.map((g, i) => (
                  <div key={g.id} className={i > 0 ? 'border-t border-border pt-4' : ''}>
                    <div className="mb-2 flex items-center gap-2.5">
                      <Avatar name={g.name} size={36} />
                      <div>
                        <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
                          {g.name}
                          {g.isPrimary && (
                            <span className="rounded-full bg-secondary px-2 py-0.5 text-2xs font-semibold text-secondary-foreground">
                              {t('primary')}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{g.relationship}</div>
                      </div>
                    </div>
                    <InfoRow label={t('fields.phone')} value={g.phone ?? '—'} />
                    <InfoRow label={t('fields.email')} value={g.email ?? '—'} last />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t('readOnlyHint')}</p>
    </div>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="mb-3.5 flex items-center gap-2 text-caption font-semibold text-foreground">
      <Icon size={14} className="text-primary" />
      {label}
    </div>
  );
}

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-start gap-2 py-1.5 ${last ? '' : 'border-b border-border'}`}>
      <span className="min-w-[130px] shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-caption font-medium text-foreground">{value}</span>
    </div>
  );
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck` — expected: clean. (If `Avatar`'s `src` prop rejects `null`, check its signature in `components/ui/Avatar.tsx` and pass `src={s.photoUrl ?? undefined}` only if the prop is `string | undefined`; the admin fiche passes `student.photoUrl` directly, so `string | null` is expected to type.)

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/(eleve)/eleve/profil/page.tsx"
git commit -m "feat(eleve-portal): read-only Mon profil page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: « Paramètres » (`/eleve/parametres`)

**Files:**
- Create: `frontend/src/app/(eleve)/eleve/parametres/page.tsx`

**Interfaces:**
- Consumes: `ProfilTab({ user, myRole })`, `ApparenceTab`, `LangueTab` from `@/app/(school)/settings/*` (all `/api/auth/*`-backed), `Tabs({ tabs, active, onChange })`, `Settings.title`/`Settings.tabs.*` messages, `ElevePortal.settings.subtitle`.

- [ ] **Step 1: Write the page**

```tsx
'use client';

// Paramètres élève — the personal subset of the school Paramètres screen
// (profile + password, appearance, language), reusing the exact same tab
// components the teacher portal reuses. The school-scoped tabs have no
// meaning for a student account and their APIs are deny-by-default
// anyway; the three tabs here only talk to /api/auth/* (PATCH
// /api/auth/me, change-password), which is user-scoped.
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useUser } from '@/contexts/AuthContext';
import { Tabs } from '@/components/ui/Tabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { ProfilTab } from '@/app/(school)/settings/ProfilTab';
import { ApparenceTab } from '@/app/(school)/settings/ApparenceTab';
import { LangueTab } from '@/app/(school)/settings/LangueTab';

const TAB_KEYS = ['profil', 'apparence', 'langue'];

export default function EleveParametresPage() {
  return (
    <Suspense fallback={null}>
      <EleveParametresForm />
    </Suspense>
  );
}

function EleveParametresForm() {
  const t = useTranslations('Settings');
  const tPortal = useTranslations('ElevePortal.settings');
  const user = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState(
    initialTab && TAB_KEYS.includes(initialTab) ? initialTab : 'profil',
  );

  const TABS = [
    { key: 'profil', label: t('tabs.profil') },
    { key: 'apparence', label: t('tabs.apparence') },
    { key: 'langue', label: t('tabs.langue') },
  ];

  function changeTab(next: string) {
    setTab(next);
    router.replace(next === 'profil' ? '/eleve/parametres' : `/eleve/parametres?tab=${next}`, {
      scroll: false,
    });
  }

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-4">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{tPortal('subtitle')}</p>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={changeTab} />

      {tab === 'profil' && <ProfilTab user={user} myRole={null} />}
      {tab === 'apparence' && <ApparenceTab />}
      {tab === 'langue' && <LangueTab />}
    </div>
  );
}
```

- [ ] **Step 2: Lint + typecheck + full gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` — expected: all green (the tree is now consistent again).

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/(eleve)/eleve/parametres/page.tsx"
git commit -m "feat(eleve-portal): Paramètres page (profil, apparence, langue)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Seeded student login for Les Étoiles

**Files:**
- Modify: `frontend/scripts/seed-dev-school.ts` (constant near `TEACHER_PASSWORD` ~line 39; new helper after `upsertTeacherPortalAccount` ~line 883; one call + one summary line in `main()` ~lines 830-850)
- Modify (local, untracked): `frontend/CREDENTIALS.local.md`

**Interfaces:**
- Produces: a `User` (`role: 'USER'`, no `OrganizationMember`) linked via `Student.userId` to the first student (by `studentNumber`) of École Les Étoiles, email `<prenom>.<nom>@eleves.lesetoiles.edu.ht`, password `StudentTest2026!`. Idempotent; works with or without `--reset`.

- [ ] **Step 1: Add the password constant**

Right after `const TEACHER_PASSWORD = 'TeacherTest2026!';` add:

```ts
const STUDENT_PASSWORD = 'StudentTest2026!';
```

- [ ] **Step 2: Add the helper after `upsertTeacherPortalAccount`**

```ts
// Espace Élève test account — the first student (by matricule) of Les
// Étoiles gets a real, already-active login, the same seed-time shortcut
// as the teacher account above (no invite code). Runs on every invocation,
// with or without --reset, so an existing dev dataset gains the account
// without being rebuilt. A student account never gets an
// OrganizationMember row (Phase 1 design: that is exactly what keeps every
// /api/school/* route closed to it). Idempotent: upsert the User by email,
// then (re)link Student.userId. The PRNG is seeded, so the first student's
// name (hence the email) is stable across --reset runs.
async function ensureStudentPortalAccount(
  prisma: PrismaClient,
  schoolId: string,
  passwordHash: string,
): Promise<string | null> {
  const student = await prisma.student.findFirst({
    where: { schoolId },
    orderBy: { studentNumber: 'asc' },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!student) return null;
  const email = `${slugName(student.firstName)}.${slugName(student.lastName)}@eleves.lesetoiles.edu.ht`;
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, emailVerifiedAt: new Date(), status: 'ACTIVE' },
    create: { email, passwordHash, emailVerifiedAt: new Date(), role: 'USER' },
    select: { id: true },
  });
  // Student.userId is @unique: a previous run may have linked this User to
  // a Student row that still exists (no --reset) — unlink it first so the
  // update below cannot collide.
  await prisma.student.updateMany({
    where: { userId: user.id, NOT: { id: student.id } },
    data: { userId: null },
  });
  await prisma.student.update({ where: { id: student.id }, data: { email, userId: user.id } });
  return email;
}
```

- [ ] **Step 3: Call it from `main()`**

Right after the `// 4. École Les Étoiles.` block (after the `if (existing) { ... } else { await seedEtoiles(...) }` statement), add:

```ts
    // 4b. Espace Élève test account — idempotent, also on an existing dataset.
    const studentEmail = await ensureStudentPortalAccount(
      prisma,
      ETOILES.schoolId,
      await bcrypt.hash(STUDENT_PASSWORD, 12),
    );
    if (studentEmail) console.log(`— Compte espace élève : ${studentEmail}`);
```

and in the « Connexions » summary at the end of the `try` block, after the `carline.michel` line, add:

```ts
    if (studentEmail) {
      console.log(`  ${studentEmail}  → espace élève (premier élève de Les Étoiles)`);
    }
```

- [ ] **Step 4: Run the seed WITHOUT `--reset` against the dev database**

Run from the repo root: `pnpm seed:dev-school`
Expected output includes `— École Les Étoiles existe déjà — dataset ignoré` then `— Compte espace élève : <prenom>.<nom>@eleves.lesetoiles.edu.ht` and the same email in the « Connexions » list. Copy that email; it is the login for Task 9.

Do NOT pass `--reset`: the dev database is shared with testing.schoolgesti.com and holds the user's manual test data (invited teacher accounts, etc.).

- [ ] **Step 5: Record the login locally**

In `frontend/CREDENTIALS.local.md`, under « Comptes réels », add a table row (untracked file, never committed):

```
| `<prenom>.<nom>@eleves.lesetoiles.edu.ht` | `StudentTest2026!` | École Les Étoiles | Espace élève (premier élève par matricule, `pnpm seed:dev-school` le (re)crée sans `--reset`) |
```

- [ ] **Step 6: Lint + typecheck + commit**

Run: `pnpm lint && pnpm typecheck` — expected: clean.

```bash
git add frontend/scripts/seed-dev-school.ts
git commit -m "chore(seed): idempotent Espace Élève test account for Les Étoiles

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Browser verification (desktop + 375px) and final gate

**Files:** none in the repo (a throwaway Puppeteer script in the scratchpad directory).

- [ ] **Step 1: Start the worktree's dev server on port 3001**

From the worktree root, in the background (never pipe it through `head`):

```bash
pnpm --filter frontend exec next dev --port 3001 --turbopack > /tmp/eleve-dev.log 2>&1 &
```

Wait until `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/login` prints `200`.

- [ ] **Step 2: Run the smoke script**

Save as `<scratchpad>/eleve-plan1-smoke.mjs` (replace `STUDENT_EMAIL` with the email printed by Task 8):

```js
import { createRequire } from 'module';
const require = createRequire(
  '/home/amos-dorceus/Documents/SaaSManagement/ekolplus2/frontend/package.json',
);
const puppeteer = require('puppeteer-core');

const BASE = 'http://localhost:3001';
const STUDENT_EMAIL = 'REPLACE_ME@eleves.lesetoiles.edu.ht';
const PASSWORD = 'StudentTest2026!';
const OUT = process.argv[2] ?? '/tmp';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push('CONSOLE ' + m.text()));
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/api/')) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });

  await page.setViewport({ width: 1366, height: 900 });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await page.type('input[type="email"]', STUDENT_EMAIL);
  await page.type('input[type="password"]', PASSWORD);
  const submit = await page.$('button[type="submit"]');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    submit.click(),
  ]);
  console.log('after login url:', page.url()); // expect .../eleve

  async function check(path, name) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1500));
    const alert = await page.evaluate(
      () => document.querySelector('[role="alert"]')?.textContent ?? null,
    );
    const h1 = await page.evaluate(() => document.querySelector('h1')?.textContent ?? null);
    await page.screenshot({ path: `${OUT}/${name}-desktop.png`, fullPage: true });
    await page.setViewport({ width: 375, height: 812 });
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    await page.screenshot({ path: `${OUT}/${name}-375.png`, fullPage: true });
    await page.setViewport({ width: 1366, height: 900 });
    console.log(`${path} -> h1: ${h1} | alert: ${alert ?? 'none'} | 375px horizontal overflow: ${overflow}`);
  }

  await check('/eleve', 'accueil');
  await check('/eleve/profil', 'profil');
  await check('/eleve/parametres', 'parametres');
  await check('/eleve/parametres?tab=langue', 'parametres-langue');

  // Deny-by-default: a student must not reach the school app.
  const res = await page.goto(`${BASE}/api/school/students`, { waitUntil: 'networkidle2' });
  console.log('GET /api/school/students as student ->', res.status()); // expect 404

  console.log('errors:', errors.length ? '\n' + errors.join('\n') : 'none');
} finally {
  await browser.close();
}
```

Run: `mkdir -p <scratchpad>/shots && node <scratchpad>/eleve-plan1-smoke.mjs <scratchpad>/shots`

Expected:
- `after login url: http://localhost:3001/eleve`
- each page: a non-null `h1`, `alert: none`, `375px horizontal overflow: false`
- `GET /api/school/students as student -> 404`
- `errors: none`

- [ ] **Step 3: Look at the screenshots**

Open `accueil-desktop.png`, `accueil-375.png`, `profil-desktop.png`, `profil-375.png`, `parametres-desktop.png` (Read tool). Check: sidebar with the three entries (Accueil, Mon profil, Paramètres) and the « Élève » role label, the year badge in the topbar, four KPI cards with real values (the seeded first student has published grades and attendance for the current term), today's courses (if the seed's timetable covers today), the week row, recent grades; on 375px the bottom bar shows Accueil + Mon profil + menu, no horizontal overflow. Fix anything off before moving on.

- [ ] **Step 4: Stop the dev server**

```bash
pkill -f "next dev --port 3001" || true
```

(Only the port-3001 process. The user's own `:3000` server serves the main checkout.)

- [ ] **Step 5: Final gate**

Run from the worktree root: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` — expected: all green, test count = baseline + 9 (8 route tests + 1 route-match test).

If `pnpm format` touched any file, commit it:

```bash
git add -A frontend/src frontend/scripts
git status --short   # review: only files from this plan
git commit -m "style(eleve-portal): prettier pass

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Plan 1 exit criteria

- A seeded student logs in and lands on `/eleve` inside the admin-grade shell (sidebar, topbar with year badge, bottom nav on mobile, « Mes espaces » in the user menu when applicable).
- `/eleve` shows the four current-term KPIs, today's courses, the week row and the latest published grades; `/eleve/profil` shows identity, contact details and guardians read-only; `/eleve/parametres` lets the student change name/avatar/password, theme and language.
- `GET /api/student/me` is covered by 8 Vitest cases (404 passthrough, session-only scoping, no `notes`, class/year/terms, week-session scoping, published-only summary, recent-grade ordering, graceful degradation).
- `pnpm format && pnpm lint && pnpm typecheck && pnpm test` green; no `/api/school/*` call from any student-reachable code.
- Plans 2 and 3 can start: `useStudentSections()`, `StudentMobileBottomNav`'s `LINK_DEFS` and the dashboard are the three places they extend.

## Self-review notes

- Spec coverage: shell (Task 4), navigation subset for this plan (Tasks 1, 4), `/api/student/me` incl. `summary` and `recentGrades` (Task 3), Accueil (Task 5), Mon profil (Task 6), Paramètres (Task 7), i18n (Task 2), seed (Task 8), browser check + gate (Task 9). The Scolarité nav entries, quick actions and the timetable link are deliberately deferred to Plans 2/3 per the spec's « aucun lien mort » rule.
- Type consistency: `StudentMeResponse` (Task 5) mirrors Task 3's JSON exactly (dates as ISO strings; `summary` keys `overallAverage/rank/rankedCount/attendanceRatePercent/absences`; `recentGrades` keys `evaluationId/label/subjectName/subjectIcon/subjectColor/date/score/maxScore/absent`); `useStudentSections` is the name both `StudentSidebar.tsx` and `StudentTopbar.tsx` use.
- Placeholder scan: the only `REPLACE_ME` is the smoke script's login email, which Task 8 prints at seed time (it depends on the seeded dataset, not on this plan).
