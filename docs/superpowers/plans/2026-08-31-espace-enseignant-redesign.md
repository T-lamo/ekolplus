# Espace Enseignant Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the teacher portal's presentation so it uses the exact same shell (sidebar + topbar + mobile bottom nav), design tokens, and screen conventions as the school/admin app, add a real teacher dashboard, admin-grade class/roster/timetable screens, and a personal settings page (profile, theme, language, password).

**Architecture:** Third instance of the existing shell pattern: `TeacherSidebar`/`TeacherTopbar` built on the generic `components/layout/sidebar/*` + `components/layout/topbar/*` bricks (exactly how `SchoolSidebar`/`SchoolTopbar` and `AdminSidebar`/`AdminTopbar` are built), a teacher layout cloned from `(school)/layout.tsx` minus `SchoolPlanProvider`, and page rewrites that reuse the app's shipped components (`KpiCard`, `CardGrid`, `TABLE_SCROLL`/`STICKY_THEAD`/`Pager` tables, the timetable view components in a new read-only mode, the existing settings tabs). One additive API change: `studentCount` on `GET /api/teacher/me`. No new namespaces; all new strings extend `teacherPortal`/`teacherClasses` (fr/ht/en).

**Tech Stack:** Next.js 16 App Router, Tailwind v4 `@theme` tokens, next-intl, `useApi`, Prisma 5, Vitest + `prismaMock`.

**Spec:** [docs/superpowers/specs/2026-08-31-espace-enseignant-redesign-design.md](../specs/2026-08-31-espace-enseignant-redesign-design.md)

## Global Constraints

- Every touched Route Handler keeps `export const runtime = 'nodejs'` (only `/api/teacher/me` is touched; it already has it).
- Teacher-reachable code must never call `/api/school/*` endpoints other than `GET /api/school/timetable` (with explicit `teacherId`), and never mount `SchoolPlanProvider` (`/api/school/billing/plan` is locked for teacher accounts) nor `AcademicYearBadge` (`GET /api/school` is locked). `NotificationsMenu` (`/api/notifications`), `OfflineIndicator`, `HelpMenu`, `CommandPalette`, `Breadcrumbs` have no locked deps and are reusable as-is.
- Admin/school shells must not change behavior: `(school)/layout.tsx`, `SchoolSidebar.tsx`, `SchoolTopbar.tsx`, `MobileBottomNav.tsx` are NOT modified. The only shared files modified are: `KpiRow.tsx` (add `export` to `KpiCard`, nothing else), the four timetable view components (optional `onClick`/`onSessionClick`, existing call sites unchanged), and `route-match.ts` is NOT modified (the `/espace-enseignant` exact-match entry from Phase 2 already does what we need).
- No em dashes (—) in any user-facing string. Use `·`, comma, or period.
- Only `@theme` token classes (`text-primary`, `bg-card`, `border-border`, …). Exception: the two literal hexes inside `KpiRow.tsx` are pre-existing admin styling being reused verbatim via `KpiCard` props; do not add new hardcoded hexes anywhere.
- New message keys land in all 3 locales (`fr`/`ht`/`en`) with identical key trees; `ht` files keep their existing top-level `_review` note untouched. No new namespace files, so `locales.ts`/`request.ts`/`next-intl.d.ts` are untouched.
- UI pages: `pnpm typecheck` + `pnpm lint` + dev-server sanity check; no component-render tests (project convention). API/route changes: full TDD with Vitest, `@/test-utils/prisma-mock` imported first.
- `pnpm format && pnpm lint && pnpm typecheck && pnpm test` must pass before every commit.
- Commit messages: Conventional Commits, matching this repo's style.

## File Structure

New files:
- `frontend/src/components/layout/teacher/TeacherSidebar.tsx` (+ `useTeacherSections()`)
- `frontend/src/components/layout/teacher/TeacherTopbar.tsx`
- `frontend/src/components/layout/teacher/TeacherAcademicYearBadge.tsx`
- `frontend/src/components/layout/teacher/TeacherMobileBottomNav.tsx`
- `frontend/src/app/(teacher)/espace-enseignant/parametres/page.tsx`

Deleted:
- `frontend/src/components/layout/teacher/TeacherBottomNav.tsx` (replaced by TeacherMobileBottomNav)

Rewritten:
- `frontend/src/app/(teacher)/espace-enseignant/layout.tsx`
- `frontend/src/app/(teacher)/espace-enseignant/page.tsx`
- `frontend/src/app/(teacher)/espace-enseignant/classes/page.tsx`
- `frontend/src/app/(teacher)/espace-enseignant/classes/[classSubjectId]/page.tsx`
- `frontend/src/app/(teacher)/espace-enseignant/classes/homeroom/[classId]/page.tsx`
- `frontend/src/app/(teacher)/espace-enseignant/emploi-du-temps/page.tsx`

Modified:
- `frontend/src/app/api/teacher/me/route.ts` (+ test)
- `frontend/src/app/(school)/dashboard/KpiRow.tsx` (export `KpiCard` only)
- `frontend/src/components/school/timetable/{CourseCard,TimetableGrid,TimetableAgenda,TimetableMonth}.tsx` (optional click handlers)
- `frontend/src/messages/{fr,ht,en}/{teacherPortal,teacherClasses}.json`
- `CLAUDE.md` (teacher-portal paragraph refresh)

---

### Task 1: `studentCount` on `GET /api/teacher/me`

**Files:**
- Modify: `frontend/src/app/api/teacher/me/route.ts`
- Test: `frontend/src/app/api/teacher/me/route.test.ts`

**Interfaces:**
- Produces: `homeroomClasses[]` entries gain `studentCount: number`; `classSubjects[]` entries gain `studentCount: number` (enrollment count of that class in the class's own academic year, mirroring the roster endpoints' scoping). All existing fields unchanged. Tasks 5 and 8 consume `studentCount`.

- [ ] **Step 1: Read the two roster routes to confirm the enrollment scoping rule**

Read `frontend/src/app/api/teacher/classes/homeroom/[classId]/route.ts` and note exactly how it scopes `enrollment.findMany` (`classId` + the class's own `academicYearId`). The counts below must use the same rule. Also confirm in `frontend/prisma/schema.prisma` that `Class` has `academicYearId` and `Enrollment` has both `classId` and `academicYearId`.

- [ ] **Step 2: Extend the test file with failing assertions**

In `frontend/src/app/api/teacher/me/route.test.ts`, in the main `beforeEach`, extend the two class-list mocks so each row carries `academicYearId`, and add a `groupBy` mock:

```ts
prismaMock.class.findMany.mockResolvedValue([
  { id: 'cls_1', name: '3ème A', level: '3ème', academicYearId: 'year_1' },
] as never);
prismaMock.classSubject.findMany.mockResolvedValue([
  {
    id: 'cs_1',
    classId: 'cls_1',
    class: { name: '3ème A', level: '3ème', academicYearId: 'year_1' },
    subjectId: 'sub_1',
    subject: { name: 'Mathématiques' },
  },
] as never);
(prismaMock.enrollment.groupBy as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
  { classId: 'cls_1', academicYearId: 'year_1', _count: { _all: 27 } },
] as never);
```

(Adapt to the file's existing fixture style; if the existing tests define these mocks per-test rather than in `beforeEach`, follow the file's own pattern.)

Add a new test:

```ts
it('returns studentCount per homeroom class and class-subject, scoped to the class own academic year', async () => {
  const res = await GET(req());
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.homeroomClasses[0]).toMatchObject({ id: 'cls_1', studentCount: 27 });
  expect(body.classSubjects[0]).toMatchObject({ id: 'cs_1', studentCount: 27 });
  const groupByArgs = (prismaMock.enrollment.groupBy as unknown as ReturnType<typeof vi.fn>).mock
    .calls[0]?.[0];
  expect(groupByArgs).toMatchObject({
    by: ['classId', 'academicYearId'],
    where: { classId: { in: ['cls_1'] } },
  });
});
```

Also add, to an existing happy-path test or as a second assertion in the new test, the mismatched-pair case: a `groupBy` row `{ classId: 'cls_1', academicYearId: 'year_OLD', _count: { _all: 99 } }` alongside the matching one must NOT be counted (assert `studentCount` is still 27, not 99 or 126).

- [ ] **Step 3: Run the test file to see the new test fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/teacher/me/route.test.ts`
Expected: the new test FAILS (`studentCount` is `undefined`).

- [ ] **Step 4: Implement**

In `frontend/src/app/api/teacher/me/route.ts`:

1. Add `academicYearId: true` to the `prisma.class.findMany` select and to the nested `class` select of `prisma.classSubject.findMany`.
2. After the `Promise.all`, compute the counts:

```ts
const countClassKeys = [
  ...homeroomClasses.map((c) => ({ classId: c.id, academicYearId: c.academicYearId })),
  ...classSubjects.map((cs) => ({ classId: cs.classId, academicYearId: cs.class.academicYearId })),
];
const uniqueClassIds = [...new Set(countClassKeys.map((k) => k.classId))];
const enrollmentCounts =
  uniqueClassIds.length > 0
    ? await prisma.enrollment.groupBy({
        by: ['classId', 'academicYearId'],
        where: { classId: { in: uniqueClassIds } },
        _count: { _all: true },
      })
    : [];
function studentCountFor(classId: string, academicYearId: string): number {
  return (
    enrollmentCounts.find((e) => e.classId === classId && e.academicYearId === academicYearId)
      ?._count._all ?? 0
  );
}
```

3. In the response, map `homeroomClasses` to `{ id, name, level, studentCount: studentCountFor(c.id, c.academicYearId) }` (do NOT leak `academicYearId` in the response) and add `studentCount: studentCountFor(cs.classId, cs.class.academicYearId)` to each mapped `classSubjects` entry.

- [ ] **Step 5: Run the full test file**

Run: `pnpm --filter frontend exec vitest run src/app/api/teacher/me/route.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 6: Gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add frontend/src/app/api/teacher/me/route.ts frontend/src/app/api/teacher/me/route.test.ts
git commit -m "feat(teacher): add per-class studentCount to GET /api/teacher/me"
```

---

### Task 2: i18n keys for the new shell and dashboard

**Files:**
- Modify: `frontend/src/messages/fr/teacherPortal.json`, `frontend/src/messages/ht/teacherPortal.json`, `frontend/src/messages/en/teacherPortal.json`
- Modify: `frontend/src/messages/fr/teacherClasses.json`, `frontend/src/messages/ht/teacherClasses.json`, `frontend/src/messages/en/teacherClasses.json`

**Interfaces:**
- Produces: the key groups below, consumed by Tasks 3, 4, 5, 8, 9. No registry file changes (no new namespaces). `locales.test.ts` enforces fr/ht/en parity.

- [ ] **Step 1: Extend `teacherPortal.json` (fr)**

Merge these ADDITIONS into `frontend/src/messages/fr/teacherPortal.json` (keep every existing key; `nav` gains new siblings):

```json
{
  "roleLabel": "Enseignant",
  "nav": {
    "sectionLabel": "Menu",
    "settings": "Paramètres",
    "more": "Plus",
    "moreAriaLabel": "Ouvrir le menu"
  },
  "topbar": {
    "defaultPageTitle": "Espace enseignant"
  },
  "home": {
    "today": "Cours d'aujourd'hui",
    "noCoursesToday": "Aucun cours aujourd'hui.",
    "quickActions": "Accès rapides",
    "sessionsCount": "{count, plural, =0 {Aucun cours} one {# cours} other {# cours}}",
    "stats": {
      "classes": "Classes",
      "subjects": "Matières enseignées",
      "students": "Élèves"
    }
  }
}
```

English (`en/teacherPortal.json`), same tree: `roleLabel` "Teacher"; `nav.sectionLabel` "Menu", `nav.settings` "Settings", `nav.more` "More", `nav.moreAriaLabel` "Open menu"; `topbar.defaultPageTitle` "Teacher portal"; `home.today` "Today's classes", `home.noCoursesToday` "No classes today.", `home.quickActions` "Quick actions", `home.sessionsCount` `"{count, plural, =0 {No classes} one {# class} other {# classes}}"`, `home.stats.classes` "Classes", `home.stats.subjects` "Subjects taught", `home.stats.students` "Students".

Haitian Creole (`ht/teacherPortal.json`), same tree, best-effort (file keeps its `_review` note): `roleLabel` "Pwofesè"; `nav.sectionLabel` "Meni", `nav.settings` "Paramèt", `nav.more` "Plis", `nav.moreAriaLabel` "Louvri meni an"; `topbar.defaultPageTitle` "Espas pwofesè"; `home.today` "Kou jodi a", `home.noCoursesToday` "Pa gen kou jodi a.", `home.quickActions` "Aksè rapid", `home.sessionsCount` `"{count, plural, =0 {Pa gen kou} one {# kou} other {# kou}}"`, `home.stats.classes` "Klas", `home.stats.subjects` "Matyè w ap anseye", `home.stats.students` "Elèv".

- [ ] **Step 2: Extend `teacherClasses.json` (all 3 locales)**

Add a `table` group. fr:

```json
"table": {
  "student": "Élève",
  "studentNumber": "Matricule"
}
```

en: `"student": "Student"`, `"studentNumber": "Student no."`. ht: `"student": "Elèv"`, `"studentNumber": "Nimewo elèv"`.

- [ ] **Step 3: Run the parity test**

Run: `pnpm --filter frontend exec vitest run src/lib/locales.test.ts`
Expected: PASS (identical key trees across locales).

- [ ] **Step 4: Gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add frontend/src/messages/fr/teacherPortal.json frontend/src/messages/ht/teacherPortal.json frontend/src/messages/en/teacherPortal.json frontend/src/messages/fr/teacherClasses.json frontend/src/messages/ht/teacherClasses.json frontend/src/messages/en/teacherClasses.json
git commit -m "feat(i18n): teacher shell, dashboard and roster-table keys"
```

---

### Task 3: TeacherSidebar, TeacherTopbar, TeacherAcademicYearBadge, TeacherMobileBottomNav

**Files:**
- Create: `frontend/src/components/layout/teacher/TeacherSidebar.tsx`
- Create: `frontend/src/components/layout/teacher/TeacherAcademicYearBadge.tsx`
- Create: `frontend/src/components/layout/teacher/TeacherTopbar.tsx`
- Create: `frontend/src/components/layout/teacher/TeacherMobileBottomNav.tsx`

**Interfaces:**
- Consumes: generic `Sidebar` (`@/components/layout/sidebar/Sidebar`, props: `sections`, `variant`, `brand`, `brandCollapsed`, `roleLabel`, `profileHref`, `collapsed`, `onToggleCollapse`, `onNavigate`, optional `footer`/`footerCollapsed`); topbar widgets (`Breadcrumbs`, `getBreadcrumbTrail`, `CommandPalette`, `HelpMenu`, `NotificationsMenu`, `OfflineIndicator`); `isActiveRoute` (`@/components/layout/sidebar/route-match`); `NavSection` (`@/components/layout/sidebar/types`); Task 2's keys.
- Produces: `TeacherSidebar({ onNavigate?, collapsed?, onToggleCollapse? })`, `useTeacherSections(): NavSection[]`, `TeacherTopbar()`, `TeacherMobileBottomNav({ onMoreClick: () => void })`. Task 4 consumes all three components.

- [ ] **Step 1: Create `TeacherSidebar.tsx`**

```tsx
'use client';

import { CalendarDays, LayoutDashboard, School as SchoolIcon, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useMemo } from 'react';
import { Sidebar } from '../sidebar/Sidebar';
import type { NavSection } from '../sidebar/types';

// Teacher shell sidebar — third instance of the shared Sidebar bricks
// (SchoolSidebar and AdminSidebar are the other two). Same `light` variant
// as the school shell so both surfaces read as one product. No role
// filtering: every teacher sees the same four entries. Exposed as a hook for
// the same reason useSchoolSections is one — TeacherTopbar needs the same
// translated sections for breadcrumbs and the command palette.
export function useTeacherSections(): NavSection[] {
  const t = useTranslations('TeacherPortal.nav');
  return useMemo<NavSection[]>(
    () => [
      {
        label: t('sectionLabel'),
        items: [
          { label: t('home'), href: '/espace-enseignant', icon: LayoutDashboard },
          { label: t('classes'), href: '/espace-enseignant/classes', icon: SchoolIcon },
          {
            label: t('timetable'),
            href: '/espace-enseignant/emploi-du-temps',
            icon: CalendarDays,
          },
          { label: t('settings'), href: '/espace-enseignant/parametres', icon: Settings },
        ],
      },
    ],
    [t],
  );
}

interface TeacherSidebarProps {
  onNavigate?: (() => void) | undefined;
  collapsed?: boolean;
  onToggleCollapse?: (() => void) | undefined;
}

export function TeacherSidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: TeacherSidebarProps) {
  const t = useTranslations('TeacherPortal');
  const sections = useTeacherSections();
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
      profileHref="/espace-enseignant/parametres"
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      onNavigate={onNavigate}
    />
  );
}
```

- [ ] **Step 2: Create `TeacherAcademicYearBadge.tsx`**

Same rendering as the school `AcademicYearBadge`, fed by `/api/teacher/me` instead of the locked `GET /api/school`:

```tsx
'use client';

import { Calendar } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { Skeleton } from '@/components/ui/Skeleton';

interface TeacherMeYearResponse {
  academicYear: { label: string } | null;
}

// Teacher twin of topbar/AcademicYearBadge — same pill, different source:
// GET /api/school is deny-by-default for teacher-linked accounts, while
// /api/teacher/me already carries the active year (and is cached by useApi,
// so this costs nothing extra next to the dashboard's own fetch).
export function TeacherAcademicYearBadge() {
  const { data, loading } = useApi<TeacherMeYearResponse>('/api/teacher/me');

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

- [ ] **Step 3: Create `TeacherTopbar.tsx`**

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
import { TeacherAcademicYearBadge } from './TeacherAcademicYearBadge';
import { useTeacherSections } from './TeacherSidebar';

// Teacher twin of SchoolTopbar — same widgets, teacher nav sections, and the
// teacher-safe year badge (see TeacherAcademicYearBadge). NotificationsMenu
// talks to /api/notifications, which is user-scoped, not school-scoped, so
// it works for teacher accounts as-is.
const EXTRA_LABELS: Record<string, string> = {};

export function TeacherTopbar() {
  const t = useTranslations('TeacherPortal.topbar');
  const pathname = usePathname();
  const sections = useTeacherSections();
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
        <TeacherAcademicYearBadge />
        <NotificationsMenu />
        <HelpMenu />
      </div>
    </header>
  );
}
```

Before committing, check `Breadcrumbs`' and `CommandPalette`'s actual prop signatures in their files and adjust the calls if they differ from `SchoolTopbar.tsx`'s usage shown here (this code mirrors `SchoolTopbar.tsx` line for line, so any mismatch means `SchoolTopbar.tsx` changed and its current form wins).

- [ ] **Step 4: Create `TeacherMobileBottomNav.tsx`**

Teacher twin of `mobile/MobileBottomNav.tsx` (same classes, same structure, teacher links + `TeacherPortal.nav` keys):

```tsx
'use client';

// Teacher twin of mobile/MobileBottomNav — same phone-native bottom bar,
// curated to the teacher's four screens plus « Plus » opening the sidebar
// drawer (profile + logout live there via SidebarUserProfile).
import {
  CalendarDays,
  LayoutDashboard,
  Menu,
  School,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActiveRoute } from '../sidebar/route-match';

interface BottomNavLink {
  key: 'home' | 'classes' | 'timetable' | 'settings';
  href: string;
  icon: LucideIcon;
}

const LINK_DEFS: BottomNavLink[] = [
  { key: 'home', href: '/espace-enseignant', icon: LayoutDashboard },
  { key: 'classes', href: '/espace-enseignant/classes', icon: School },
  { key: 'timetable', href: '/espace-enseignant/emploi-du-temps', icon: CalendarDays },
  { key: 'settings', href: '/espace-enseignant/parametres', icon: Settings },
];

export function TeacherMobileBottomNav({ onMoreClick }: { onMoreClick: () => void }) {
  const t = useTranslations('TeacherPortal.nav');
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
      <button
        type="button"
        onClick={onMoreClick}
        aria-label={t('moreAriaLabel')}
        className={`flex flex-1 flex-col items-center justify-center gap-0.5 ${
          moreActive ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        <Menu size={22} strokeWidth={moreActive ? 2.5 : 2} />
        <span className={`text-[10px] ${moreActive ? 'font-semibold' : 'font-medium'}`}>
          {t('more')}
        </span>
      </button>
    </nav>
  );
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. (These components are not yet mounted anywhere; unused-export warnings should not occur under this repo's ESLint config, but if `lint` flags anything, fix it rather than suppressing.)

- [ ] **Step 6: Gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add frontend/src/components/layout/teacher/TeacherSidebar.tsx frontend/src/components/layout/teacher/TeacherTopbar.tsx frontend/src/components/layout/teacher/TeacherAcademicYearBadge.tsx frontend/src/components/layout/teacher/TeacherMobileBottomNav.tsx
git commit -m "feat(teacher): sidebar, topbar, year badge and mobile nav for the teacher shell"
```

---

### Task 4: Teacher layout rewrite (shell assembly)

**Files:**
- Rewrite: `frontend/src/app/(teacher)/espace-enseignant/layout.tsx`
- Delete: `frontend/src/components/layout/teacher/TeacherBottomNav.tsx`

**Interfaces:**
- Consumes: Task 3's `TeacherSidebar`/`TeacherTopbar`/`TeacherMobileBottomNav`; `SIDEBAR_WIDTH_CLASS`, `useSidebarCollapse` (`@/components/layout/sidebar/…`); `Shell` namespace's `closeMenu` key (existing).
- Produces: the shell every `(teacher)` page renders inside. Pages (Tasks 5, 7, 8, 9, 10) assume the same scroller/panel structure as `(school)` pages (`LIST_PAGE` works, no `max-w-lg` wrapper anymore, no per-page logout button).

- [ ] **Step 1: Replace `layout.tsx`**

Full replacement of `frontend/src/app/(teacher)/espace-enseignant/layout.tsx`:

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useUser } from '@/contexts/AuthContext';
import { TeacherMobileBottomNav } from '@/components/layout/teacher/TeacherMobileBottomNav';
import { TeacherSidebar } from '@/components/layout/teacher/TeacherSidebar';
import { TeacherTopbar } from '@/components/layout/teacher/TeacherTopbar';
import { SIDEBAR_WIDTH_CLASS } from '@/components/layout/sidebar/width';
import { useSidebarCollapse } from '@/components/layout/sidebar/useSidebarCollapse';
import { Skeleton } from '@/components/ui/Skeleton';

// Teacher shell — same floating-panel structure as (school)/layout.tsx (one
// flat sidebar+topbar surface, grey rounded content panel, MobileBottomNav
// below lg) so the portal reads as the same product as the admin app. Two
// deliberate differences: no SchoolPlanProvider (its /api/school/billing/plan
// read is deny-by-default for teacher-linked accounts) and no reverse
// redirect — an admin who also teaches may open this portal (their timetable
// page passes its own teacherId explicitly, see the emploi-du-temps page).
// Logout lives in the sidebar's SidebarUserProfile, same as the admin shell.
export default function TeacherLayout({ children }: { children: ReactNode }) {
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
            <TeacherSidebar onNavigate={() => setDrawerOpen(false)} />
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
        <TeacherSidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <TeacherTopbar />
        <main className="mx-3 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-background shadow-[0_1px_2px_rgba(26,26,46,0.04),0_8px_28px_-10px_rgba(26,26,46,0.14)] sm:mx-4 sm:mb-4 lg:ml-3">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-28 sm:px-6 sm:pt-6 sm:pb-28 lg:px-7 lg:py-7">
            {children}
          </div>
        </main>
        <TeacherMobileBottomNav onMoreClick={() => setDrawerOpen(true)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete the old bottom nav**

```bash
git rm frontend/src/components/layout/teacher/TeacherBottomNav.tsx
```

If `pnpm typecheck` then fails on a leftover import of `TeacherBottomNav`, that import can only be in the old layout you just replaced; make sure no other file references it (`grep -rn "TeacherBottomNav" frontend/src` must return only `TeacherMobileBottomNav` matches).

- [ ] **Step 3: Typecheck, lint, and dev sanity check**

Run: `pnpm typecheck && pnpm lint`. Then, if a dev server is reachable, load `/espace-enseignant` as the seeded teacher (`carline.michel@lesetoiles.edu.ht` / `TeacherTest2026!`): sidebar + topbar render, drawer opens below `lg`, bottom nav shows 5 slots. Note in the report if the browser check was not possible.

- [ ] **Step 4: Gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add "frontend/src/app/(teacher)/espace-enseignant/layout.tsx"
git commit -m "feat(teacher): adopt the school shell structure for the teacher portal layout"
```

(The `git rm` above already staged the deletion; `git status` must show exactly these two paths staged.)

---

### Task 5: Accueil dashboard rewrite

**Files:**
- Modify: `frontend/src/app/(school)/dashboard/KpiRow.tsx` (add `export` keyword to `KpiCard` — single-word diff)
- Rewrite: `frontend/src/app/(teacher)/espace-enseignant/page.tsx`

**Interfaces:**
- Consumes: `GET /api/teacher/me` with Task 1's `studentCount`; `KpiCard` (`@/app/(school)/dashboard/KpiRow`, props `{ icon, iconBg, iconFg, value, label }`); `todayDay` (`@/components/school/timetable/timetable-utils`); Task 2's `TeacherPortal.home.*` keys; existing `TeacherPortal` keys (`title`, `welcome`, `loadError`, `home.thisWeek`, `home.noSessions`, `home.myClasses`, `home.viewTimetable`).
- Produces: nothing consumed later.

- [ ] **Step 1: Export `KpiCard`**

In `frontend/src/app/(school)/dashboard/KpiRow.tsx`, change `function KpiCard({` to `export function KpiCard({`. Nothing else in the file changes.

- [ ] **Step 2: Rewrite the Accueil page**

Full replacement of `frontend/src/app/(teacher)/espace-enseignant/page.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowRight, BookOpen, CalendarDays, School as SchoolIcon, Users } from 'lucide-react';
import { useUser } from '@/contexts/AuthContext';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { KpiCard } from '@/app/(school)/dashboard/KpiRow';
import { todayDay, weekDays, formatDayName } from '@/components/school/timetable/timetable-utils';
import type { LocaleKey } from '@/lib/locales';

function minutesToHHMM(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

interface TeacherMeResponse {
  teacher: { id: string; name: string; email: string | null };
  homeroomClasses: { id: string; name: string; level: string; studentCount: number }[];
  classSubjects: {
    id: string;
    classId: string;
    className: string;
    classLevel: string;
    subjectId: string;
    subjectName: string;
    studentCount: number;
  }[];
  thisWeekSessions: {
    id: string;
    date: string;
    startMinutes: number;
    endMinutes: number;
    room: string | null;
    class: { name: string };
    subject: { name: string };
  }[];
  academicYear: { id: string; label: string } | null;
}

export default function EspaceEnseignantHomePage() {
  const t = useTranslations('TeacherPortal');
  const locale = useLocale() as LocaleKey;
  const user = useUser();
  const { data, loading, error } = useApi<TeacherMeResponse>('/api/teacher/me');
  const today = todayDay();

  const stats = useMemo(() => {
    if (!data) return null;
    const classIds = new Set<string>([
      ...data.homeroomClasses.map((c) => c.id),
      ...data.classSubjects.map((cs) => cs.classId),
    ]);
    const subjectIds = new Set(data.classSubjects.map((cs) => cs.subjectId));
    const students = new Map<string, number>();
    for (const c of data.homeroomClasses) students.set(c.id, c.studentCount);
    for (const cs of data.classSubjects) students.set(cs.classId, cs.studentCount);
    let studentTotal = 0;
    for (const n of students.values()) studentTotal += n;
    return { classes: classIds.size, subjects: subjectIds.size, students: studentTotal };
  }, [data]);

  const todaysSessions = useMemo(
    () => (data?.thisWeekSessions ?? []).filter((s) => s.date === today),
    [data, today],
  );

  const weekByDay = useMemo(() => {
    const days = weekDays(today);
    const map = new Map<string, number>(days.map((d) => [d, 0]));
    for (const s of data?.thisWeekSessions ?? []) {
      if (map.has(s.date)) map.set(s.date, (map.get(s.date) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [data, today]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t('welcome', { name: user?.name ?? user?.email ?? '' })}
        </p>
      </div>

      {loading && !data ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[104px] w-full" />
            ))}
          </div>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error || !data || !stats ? (
        <p className="text-sm text-destructive">{t('loadError')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <KpiCard
              icon={SchoolIcon}
              iconBg="bg-secondary"
              iconFg="text-primary"
              value={String(stats.classes)}
              label={t('home.stats.classes')}
            />
            <KpiCard
              icon={BookOpen}
              iconBg="bg-info"
              iconFg="text-info-foreground"
              value={String(stats.subjects)}
              label={t('home.stats.subjects')}
            />
            <KpiCard
              icon={Users}
              iconBg="bg-secondary"
              iconFg="text-primary"
              value={String(stats.students)}
              label={t('home.stats.students')}
            />
          </div>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold text-foreground">{t('home.today')}</h2>
            {todaysSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('home.noCoursesToday')}</p>
            ) : (
              <Card className="divide-y divide-border p-0">
                {todaysSessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className="w-24 shrink-0 text-xs font-semibold text-primary">
                      {minutesToHHMM(s.startMinutes)}-{minutesToHHMM(s.endMinutes)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                      {s.subject.name} · {s.class.name}
                    </span>
                    {s.room && (
                      <span className="shrink-0 text-xs text-muted-foreground">{s.room}</span>
                    )}
                  </div>
                ))}
              </Card>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">{t('home.thisWeek')}</h2>
              <Link
                href="/espace-enseignant/emploi-du-temps"
                className="flex items-center gap-1 text-xs font-semibold text-primary"
              >
                {t('home.viewTimetable')}
                <ArrowRight size={13} />
              </Link>
            </div>
            {data.thisWeekSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('home.noSessions')}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
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
            <h2 className="text-sm font-bold text-foreground">{t('home.quickActions')}</h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Link href="/espace-enseignant/classes">
                <Card className="flex-row items-center gap-3 p-3.5">
                  <div className="flex h-8.5 w-8.5 items-center justify-center rounded-md bg-secondary text-primary">
                    <SchoolIcon size={16} />
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {t('home.myClasses')}
                  </span>
                  <ArrowRight size={14} className="ml-auto text-muted-foreground" />
                </Card>
              </Link>
              <Link href="/espace-enseignant/emploi-du-temps">
                <Card className="flex-row items-center gap-3 p-3.5">
                  <div className="flex h-8.5 w-8.5 items-center justify-center rounded-md bg-secondary text-primary">
                    <CalendarDays size={16} />
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {t('home.viewTimetable')}
                  </span>
                  <ArrowRight size={14} className="ml-auto text-muted-foreground" />
                </Card>
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck, lint, and dev sanity check**

Run: `pnpm typecheck && pnpm lint`. Dev check as in Task 4 Step 3 (dashboard shows 3 KPI cards, today's courses, week preview, quick actions).

- [ ] **Step 4: Gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add "frontend/src/app/(school)/dashboard/KpiRow.tsx" "frontend/src/app/(teacher)/espace-enseignant/page.tsx"
git commit -m "feat(teacher): rebuild Accueil as a dashboard with stats, today and week blocks"
```

---

### Task 6: Read-only mode for the shared timetable view components

**Files:**
- Modify: `frontend/src/components/school/timetable/CourseCard.tsx`
- Modify: `frontend/src/components/school/timetable/TimetableGrid.tsx`
- Modify: `frontend/src/components/school/timetable/TimetableAgenda.tsx`
- Modify: `frontend/src/components/school/timetable/TimetableMonth.tsx`

**Interfaces:**
- Produces: `onClick` (CourseCard) and `onSessionClick` (Grid/Agenda/Month) become OPTIONAL (`?:`). When absent, sessions render as non-interactive elements (no `<button>` semantics, no hover cursor). `onDayClick` (Month) and `onSlotClick` (Grid, already optional) are unchanged. All existing admin call sites pass handlers, so admin behavior is byte-identical. Task 7 consumes the handler-less form.

- [ ] **Step 1: CourseCard**

In `CourseCard.tsx`, change the prop type `onClick: (session: TimetableSession) => void;` to `onClick?: (session: TimetableSession) => void;`. There are two render sites using `onClick={() => onClick(session)}` (a compact and a full variant, around lines 37 and 54). For each, if the clickable element is a `<button>`, render it conditionally:

```tsx
// pattern to apply at each of the two sites — keep each site's exact
// className and children, only the wrapper element becomes conditional:
onClick ? (
  <button type="button" onClick={() => onClick(session)} className={/* existing classes */}>
    {/* existing children */}
  </button>
) : (
  <div className={/* same classes minus hover/cursor utilities */}>{/* same children */}</div>
)
```

Read the file first; if the element is already a `<div role="button">` or similar, the equivalent minimal change is to make the `onClick`/`role`/`tabIndex` attributes conditional (`{...(onClick ? { onClick: () => onClick(session), role: 'button', tabIndex: 0 } : {})}`) and drop hover/cursor classes when `onClick` is absent. The invariant to preserve: with a handler, rendering is IDENTICAL to today; without one, the card is visually the same minus interactivity affordances.

- [ ] **Step 2: TimetableGrid, TimetableAgenda, TimetableMonth**

In each file, change `onSessionClick: (session: TimetableSession) => void;` to `onSessionClick?: (session: TimetableSession) => void;`. Where the prop is forwarded to `CourseCard` (`onClick={onSessionClick}`), forward as-is (now-optional prop into now-optional prop — if `exactOptionalPropertyTypes` complains about `onClick={undefined}`, use conditional spread: `{...(onSessionClick ? { onClick: onSessionClick } : {})}`). In `TimetableAgenda.tsx` line ~80 the handler is used directly on a button: apply the same conditional-wrapper pattern as CourseCard Step 1. `TimetableMonth`'s `onDayClick` stays required.

- [ ] **Step 3: Verify nothing else breaks**

Run: `pnpm typecheck && pnpm lint && pnpm --filter frontend exec vitest run src/components/school/timetable/timetable-utils.test.ts`
Expected: PASS. Also `grep -rn "onSessionClick" frontend/src/app` to confirm the only call sites are the admin emploi-du-temps page (passes handlers, unchanged) and, after Task 7, the teacher page.

- [ ] **Step 4: Gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add frontend/src/components/school/timetable/CourseCard.tsx frontend/src/components/school/timetable/TimetableGrid.tsx frontend/src/components/school/timetable/TimetableAgenda.tsx frontend/src/components/school/timetable/TimetableMonth.tsx
git commit -m "feat(timetable): make session click handlers optional for read-only consumers"
```

---

### Task 7: Teacher Emploi du temps page rewrite (admin views, read-only)

**Files:**
- Rewrite: `frontend/src/app/(teacher)/espace-enseignant/emploi-du-temps/page.tsx`

**Interfaces:**
- Consumes: `GET /api/school/timetable?from&to&teacherId=` (teacher-scoped; own id from `/api/teacher/me`); Task 6's optional handlers; `TimetableGrid`/`TimetableAgenda`/`TimetableMonth`/`TimetableLegend`; `timetable-utils` (`addDays`, `addMonths`, `csvRows`, `formatLong`, `formatMonthYear`, `formatWeekRange`, `isoWeekday`, `mondayOf`, `monthGrid`, `todayDay`, `weekDays`); `exportToCsv` (`@/lib/csv-export`); `Timetable.toolbar` + `Timetable.export` namespaces (shared vocabulary — views, today, export, prev/next; deliberate reuse, NOT duplicated into teacherTimetable); `TeacherTimetable.title`; `TimetableResponse`/`TimetableSession`/`TimetableView` types.
- Produces: nothing consumed later.

- [ ] **Step 1: Rewrite the page**

Full replacement of `frontend/src/app/(teacher)/espace-enseignant/emploi-du-temps/page.tsx`. This is the admin page (`(school)/pedagogie/emploi-du-temps/page.tsx`) minus: the meta fetches (`/api/school`, `/api/school/classes`, `/api/school/teachers`, `/api/school/subjects`, `/api/school/class-subjects`, `/api/school/rooms`), the filter selects, the create button, and the modal — plus the own-`teacherId` fetch:

```tsx
'use client';

// Emploi du temps enseignant — the admin timetable's real views (month /
// week / day / agenda + legend), read-only and scoped to the caller's own
// sessions. The page always passes its own teacherId explicitly: the
// server-side force only applies to MEMBER-role callers, and an admin who
// also teaches must see their own week here, not the whole school's
// (docs/superpowers/specs/2026-08-31-espace-enseignant-redesign-design.md).
// No /api/school/* meta endpoints are called — they are deny-by-default for
// teacher-linked accounts; sessions are the only data source.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Calendar,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  List,
} from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { exportToCsv } from '@/lib/csv-export';
import { cn } from '@/lib/utils';
import { LIST_PAGE } from '@/lib/layout';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { TimetableGrid } from '@/components/school/timetable/TimetableGrid';
import { TimetableAgenda } from '@/components/school/timetable/TimetableAgenda';
import { TimetableMonth } from '@/components/school/timetable/TimetableMonth';
import { TimetableLegend } from '@/components/school/timetable/TimetableLegend';
import type {
  TimetableResponse,
  TimetableSession,
  TimetableView,
} from '@/components/school/timetable/types';
import {
  addDays,
  addMonths,
  csvRows,
  formatLong,
  formatMonthYear,
  formatWeekRange,
  isoWeekday,
  mondayOf,
  monthGrid,
  todayDay,
  weekDays,
} from '@/components/school/timetable/timetable-utils';

const VIEWS: { key: TimetableView; Icon: typeof Calendar }[] = [
  { key: 'month', Icon: Calendar },
  { key: 'week', Icon: CalendarDays },
  { key: 'day', Icon: CalendarClock },
  { key: 'agenda', Icon: List },
];

interface TeacherMeIdResponse {
  teacher: { id: string };
}

export default function EspaceEnseignantTimetablePage() {
  const { toast } = useToast();
  const locale = useLocale();
  const t = useTranslations('Timetable.toolbar');
  const tExport = useTranslations('Timetable.export');
  const tTitle = useTranslations('TeacherTimetable');
  const tPortal = useTranslations('TeacherPortal');
  const today = todayDay();
  const [view, setView] = useState<TimetableView>('week');
  const [anchor, setAnchor] = useState(today);
  useEffect(() => {
    if (window.innerWidth < 1024) setView('day');
  }, []);

  const { data: me, error: meError } = useApi<TeacherMeIdResponse>('/api/teacher/me');
  const teacherId = me?.teacher.id;

  const range = useMemo(() => {
    if (view === 'month') {
      const g = monthGrid(anchor);
      return { from: g[0]?.[0] ?? anchor, to: g[5]?.[6] ?? anchor };
    }
    if (view === 'day') return { from: anchor, to: anchor };
    const monday = mondayOf(anchor);
    return { from: monday, to: addDays(monday, 6) };
  }, [view, anchor]);

  const {
    data,
    loading,
    error: dataError,
  } = useApi<TimetableResponse>(
    teacherId
      ? `/api/school/timetable?from=${range.from}&to=${range.to}&teacherId=${teacherId}`
      : '',
    { skip: !teacherId },
  );

  const sessions = useMemo<TimetableSession[]>(() => data?.sessions ?? [], [data]);
  const weekWithSaturday = sessions.some((s) => isoWeekday(s.date) === 6);
  const days = useMemo(() => {
    if (view === 'day') return [anchor];
    return weekDays(anchor, weekWithSaturday);
  }, [view, anchor, weekWithSaturday]);

  const navLabel =
    view === 'month'
      ? formatMonthYear(anchor, locale)
      : view === 'day'
        ? formatLong(anchor, locale)
        : formatWeekRange(days, locale);

  const step = useCallback(
    (dir: 1 | -1) => {
      setAnchor((a) =>
        view === 'month' ? addMonths(a, dir) : addDays(a, view === 'day' ? dir : 7 * dir),
      );
    },
    [view],
  );

  function onExport() {
    if (sessions.length === 0) {
      toast(t('exportEmpty'), 'info');
      return;
    }
    const headers = [
      tExport('date'),
      tExport('day'),
      tExport('start'),
      tExport('end'),
      tExport('class'),
      tExport('subject'),
      tExport('type'),
      tExport('teacher'),
      tExport('room'),
      tExport('description'),
    ];
    exportToCsv(`emploi-du-temps-${range.from}_${range.to}.csv`, headers, csvRows(sessions, locale));
  }

  const error = meError || dataError;

  return (
    <div className={LIST_PAGE}>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">
            {tTitle('title')}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t(`views.${view}.subtitle`)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label={t('viewsAriaLabel')}
            className="flex max-w-full gap-0.5 overflow-x-auto rounded-md bg-muted p-[3px]"
          >
            {VIEWS.map(({ key, Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={cn(
                  'inline-flex items-center gap-[5px] rounded-sm px-3 py-[5px] text-xs whitespace-nowrap transition-colors',
                  view === key
                    ? 'bg-card font-semibold text-foreground'
                    : 'font-medium text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon size={12} aria-hidden />
                {t(`views.${key}.label`)}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="w-fit" onClick={onExport}>
            <FileSpreadsheet size={13} />
            {t('export')}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive-foreground">
          {tPortal('loadError')}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label={t('prevPeriod')}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-caption font-semibold whitespace-nowrap text-foreground">
          {navLabel}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label={t('nextPeriod')}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted"
        >
          <ChevronRight size={14} />
        </button>
        <button
          type="button"
          onClick={() => setAnchor(today)}
          className={cn(
            'rounded-xl px-2.5 py-[3px] text-xs font-medium transition-colors',
            anchor === today ||
              (view !== 'day' && view !== 'month' && mondayOf(anchor) === mondayOf(today)) ||
              (view === 'month' && anchor.slice(0, 7) === today.slice(0, 7))
              ? 'bg-secondary text-primary'
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {t('today')}
        </button>
      </div>

      {!data ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex gap-px border-b border-border bg-muted">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-11 flex-1 rounded-none bg-card/60" />
            ))}
          </div>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex gap-1.5 border-b border-border p-1.5 last:border-b-0">
              <Skeleton className="h-16 w-12" />
              {Array.from({ length: 5 }, (_, j) => (
                <Skeleton key={j} className="h-16 flex-1" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div
          className={cn('flex flex-col transition-opacity', loading && 'opacity-60')}
          aria-busy={loading}
        >
          {view === 'agenda' ? (
            <TimetableAgenda days={days} sessions={sessions} today={today} />
          ) : view === 'month' ? (
            <TimetableMonth
              anchor={anchor}
              sessions={sessions}
              today={today}
              onDayClick={(day) => {
                setAnchor(day);
                setView('day');
              }}
            />
          ) : (
            <>
              <TimetableGrid days={days} sessions={sessions} today={today} showClass />
              {sessions.length === 0 && (
                <p className="mt-2 text-center text-xs text-muted-foreground">{t('emptyRange')}</p>
              )}
            </>
          )}
        </div>
      )}

      {data && <TimetableLegend sessions={sessions} />}
    </div>
  );
}
```

Note on `useApi('' , { skip: true })`: the current teacher timetable page (pre-rewrite) already uses exactly this teacherId-gated `skip` pattern — read it before replacing and keep whatever exact `skip`/path-gating form it uses, since it was reviewed and verified against `useApi`'s semantics on 2026-08-31.

- [ ] **Step 2: Typecheck, lint, and dev sanity check**

Run: `pnpm typecheck && pnpm lint`. Dev check: `/espace-enseignant/emploi-du-temps` as the seeded teacher shows only Mme Michel's sessions in all four views; sessions are not clickable; the admin page (as amosdorceus2023@gmail.com) still opens the edit modal on click.

- [ ] **Step 3: Gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add "frontend/src/app/(teacher)/espace-enseignant/emploi-du-temps/page.tsx"
git commit -m "feat(teacher): reuse the admin timetable views read-only on the teacher portal"
```

---

### Task 8: Mes classes page restyle

**Files:**
- Rewrite: `frontend/src/app/(teacher)/espace-enseignant/classes/page.tsx`

**Interfaces:**
- Consumes: `GET /api/teacher/me` (with `studentCount`); `CARD_GRID`, `CARD_GRID_CONTAINER` (`@/lib/layout`); `TeacherClasses` keys (`title`, `myHomerooms`, `noHomerooms`, `mySubjects`, `noSubjects`, `plural.students.one`/`other`); `TeacherPortal.loadError`.
- Produces: links to `/espace-enseignant/classes/[classSubjectId]` and `/espace-enseignant/classes/homeroom/[classId]` (Task 9's pages).

- [ ] **Step 1: Rewrite the page**

Full replacement of `frontend/src/app/(teacher)/espace-enseignant/classes/page.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { CARD_GRID, CARD_GRID_CONTAINER } from '@/lib/layout';

interface TeacherClassesResponse {
  homeroomClasses: { id: string; name: string; level: string; studentCount: number }[];
  classSubjects: {
    id: string;
    className: string;
    classLevel: string;
    subjectName: string;
    studentCount: number;
  }[];
}

export default function EspaceEnseignantClassesPage() {
  const t = useTranslations('TeacherClasses');
  const tPortal = useTranslations('TeacherPortal');
  const { data, loading, error } = useApi<TeacherClassesResponse>('/api/teacher/me');

  function studentsLabel(count: number) {
    return t(count === 1 ? 'plural.students.one' : 'plural.students.other', { count });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : error || !data ? (
        <p className="text-sm text-destructive">{tPortal('loadError')}</p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold text-foreground">{t('myHomerooms')}</h2>
            {data.homeroomClasses.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noHomerooms')}</p>
            ) : (
              <div className={CARD_GRID_CONTAINER}>
                <div className={CARD_GRID}>
                  {data.homeroomClasses.map((c) => (
                    <Link key={c.id} href={`/espace-enseignant/classes/homeroom/${c.id}`}>
                      <Card className="gap-1 p-4">
                        <p className="text-sm font-bold text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.level}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Users size={12} />
                          {studentsLabel(c.studentCount)}
                        </p>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold text-foreground">{t('mySubjects')}</h2>
            {data.classSubjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noSubjects')}</p>
            ) : (
              <div className={CARD_GRID_CONTAINER}>
                <div className={CARD_GRID}>
                  {data.classSubjects.map((cs) => (
                    <Link key={cs.id} href={`/espace-enseignant/classes/${cs.id}`}>
                      <Card className="gap-1 p-4">
                        <p className="text-sm font-bold text-foreground">{cs.subjectName}</p>
                        <p className="text-xs text-muted-foreground">
                          {cs.className} · {cs.classLevel}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Users size={12} />
                          {studentsLabel(cs.studentCount)}
                        </p>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck, lint, dev sanity check; gate + commit**

Run: `pnpm typecheck && pnpm lint`, then `pnpm format && pnpm lint && pnpm typecheck && pnpm test`.

```bash
git add "frontend/src/app/(teacher)/espace-enseignant/classes/page.tsx"
git commit -m "feat(teacher): Mes classes as standard card grid with student counts"
```

---

### Task 9: Roster pages restyle (admin-style tables)

**Files:**
- Rewrite: `frontend/src/app/(teacher)/espace-enseignant/classes/[classSubjectId]/page.tsx`
- Rewrite: `frontend/src/app/(teacher)/espace-enseignant/classes/homeroom/[classId]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/teacher/classes/[classSubjectId]` and `GET /api/teacher/classes/homeroom/[classId]` (unchanged responses); `TABLE_SCROLL`, `STICKY_THEAD`, `LIST_PAGE` (`@/lib/layout`); `Pager` (`@/components/ui/Pager`); `Avatar` (`@/components/ui/Avatar` — verify the exact import path with a grep before writing, the eleves page imports it); `TeacherClasses` keys incl. Task 2's `table.*`.
- Produces: nothing consumed later.

- [ ] **Step 1: Rewrite the class-subject roster page**

Full replacement of `frontend/src/app/(teacher)/espace-enseignant/classes/[classSubjectId]/page.tsx`:

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Avatar } from '@/components/ui/Avatar';
import { Pager } from '@/components/ui/Pager';
import { LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';

const PAGE_SIZE = 20;

interface RosterResponse {
  classSubject: { id: string; className: string; classLevel: string; subjectName: string };
  students: { id: string; firstName: string; lastName: string; studentNumber: string }[];
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

export default function ClassSubjectRosterPage() {
  const { classSubjectId } = useParams<{ classSubjectId: string }>();
  const t = useTranslations('TeacherClasses');
  const tPortal = useTranslations('TeacherPortal');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useApi<RosterResponse>(`/api/teacher/classes/${classSubjectId}`);

  const students = data?.students ?? [];
  const paged = students.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className={LIST_PAGE}>
      <Link
        href="/espace-enseignant/classes"
        className="mb-3 flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft size={16} />
        {t('roster.back')}
      </Link>

      {loading && !data ? (
        <Skeleton className="h-64 w-full" />
      ) : error || !data ? (
        <p className="text-sm text-destructive">{tPortal('loadError')}</p>
      ) : (
        <>
          <div className="mb-4">
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">
              {data.classSubject.subjectName}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {data.classSubject.className} · {data.classSubject.classLevel} ·{' '}
              {t(students.length === 1 ? 'plural.students.one' : 'plural.students.other', {
                count: students.length,
              })}
            </p>
          </div>

          {students.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('roster.noStudents')}</p>
          ) : (
            <Card className="p-0">
              <div className={TABLE_SCROLL}>
                <table className="w-full min-w-[420px] border-collapse text-sm">
                  <thead className={STICKY_THEAD}>
                    <tr className="border-b border-border">
                      <Th>{t('table.student')}</Th>
                      <Th className="w-[160px]">{t('table.studentNumber')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((s) => (
                      <tr key={s.id} className="border-b border-border last:border-none">
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={`${s.firstName} ${s.lastName}`} size={32} />
                            <span className="font-semibold text-foreground">
                              {s.firstName} {s.lastName}
                            </span>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 text-muted-foreground">
                          #{s.studentNumber}
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
                total={students.length}
                onChange={setPage}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
```

Before writing, verify `Avatar`'s import path and props against the eleves page (`frontend/src/app/(school)/eleves/page.tsx` imports it; it takes `name`, `size`, optional `src`). If the real path differs from `@/components/ui/Avatar`, use the real one.

- [ ] **Step 2: Rewrite the homeroom roster page**

Full replacement of `frontend/src/app/(teacher)/espace-enseignant/classes/homeroom/[classId]/page.tsx`: identical to Step 1's page with these substitutions: interface is `HomeroomRosterResponse { class: { id: string; name: string; level: string }; students: … }` (same `students` shape); param is `const { classId } = useParams<{ classId: string }>();`; fetch path `/api/teacher/classes/homeroom/${classId}`; component name `HomeroomRosterPage`; header `<h1>` shows `data.class.name` and the subtitle line shows `data.class.level · <count label>`. Everything else (Th, table, Pager, back link, states) is byte-identical to Step 1. (Same deliberate two-file duplication as Phase 2 Task 8 — accepted ruling, do not extract a shared component.)

- [ ] **Step 3: Typecheck, lint, dev sanity check; gate + commit**

Run: `pnpm typecheck && pnpm lint`, then `pnpm format && pnpm lint && pnpm typecheck && pnpm test`.

```bash
git add "frontend/src/app/(teacher)/espace-enseignant/classes/[classSubjectId]/page.tsx" "frontend/src/app/(teacher)/espace-enseignant/classes/homeroom/[classId]/page.tsx"
git commit -m "feat(teacher): roster pages as standard paged tables"
```

---

### Task 10: Paramètres page (profile, theme, language, password)

**Files:**
- Create: `frontend/src/app/(teacher)/espace-enseignant/parametres/page.tsx`

**Interfaces:**
- Consumes: `ProfilTab` (`@/app/(school)/settings/ProfilTab`, props `{ user: User; myRole: MemberData['role'] | null }` — pass `myRole={null}`), `ApparenceTab`, `LangueTab` (both prop-less) from `@/app/(school)/settings/…`; `Tabs` (`@/components/ui/Tabs`); `Settings` namespace (`title`, `subtitle`, `tabs.profil`, `tabs.apparence`, `tabs.langue` — all existing). These tabs only call `/api/auth/*` (verified 2026-08-31), so they work for teacher accounts.
- Produces: nothing consumed later.

- [ ] **Step 1: Create the page**

Create `frontend/src/app/(teacher)/espace-enseignant/parametres/page.tsx`:

```tsx
'use client';

// Paramètres enseignant — the personal subset of the school Paramètres
// screen (profile + password, appearance, language), reusing the exact same
// tab components. The school-scoped tabs (Établissement, Année scolaire,
// Administrateurs, Notifications) have no meaning for a teacher account and
// their APIs are deny-by-default anyway; the three tabs here only talk to
// /api/auth/* (PATCH /api/auth/me, change-password), which is user-scoped.
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

export default function TeacherParametresPage() {
  return (
    <Suspense fallback={null}>
      <TeacherParametresForm />
    </Suspense>
  );
}

function TeacherParametresForm() {
  const t = useTranslations('Settings');
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
    router.replace(
      next === 'profil'
        ? '/espace-enseignant/parametres'
        : `/espace-enseignant/parametres?tab=${next}`,
      { scroll: false },
    );
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
        <p className="mt-0.5 text-xs text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={changeTab} />

      {tab === 'profil' && <ProfilTab user={user} myRole={null} />}
      {tab === 'apparence' && <ApparenceTab />}
      {tab === 'langue' && <LangueTab />}
    </div>
  );
}
```

Before committing, open `frontend/src/app/(school)/settings/ProfilTab.tsx` and confirm `myRole={null}` renders sanely (the role line should simply not render, or render a neutral fallback; if it renders a broken empty label, note it in the report as a concern rather than modifying ProfilTab).

- [ ] **Step 2: Typecheck, lint, dev sanity check; gate + commit**

Run: `pnpm typecheck && pnpm lint`; dev check: `/espace-enseignant/parametres` as the seeded teacher shows the 3 tabs; changing theme/language applies immediately; password form present. Then `pnpm format && pnpm lint && pnpm typecheck && pnpm test`.

```bash
git add "frontend/src/app/(teacher)/espace-enseignant/parametres/page.tsx"
git commit -m "feat(teacher): personal settings page with profile, theme and language tabs"
```

---

### Task 11: CLAUDE.md refresh + final gate

**Files:**
- Modify: `CLAUDE.md` (the "Espace Enseignant (teacher portal)" paragraph)

**Interfaces:** none.

- [ ] **Step 1: Update the teacher-portal paragraph**

In `CLAUDE.md`, extend the existing "**Espace Enseignant (teacher portal).**" paragraph (do not rewrite its security content) with the presentation facts: the portal now renders the same shell as the school app (a `TeacherSidebar`/`TeacherTopbar`/`TeacherMobileBottomNav` trio under `frontend/src/components/layout/teacher/`, built on the shared `components/layout/sidebar|topbar` bricks, `light` variant, no `SchoolPlanProvider` and no `AcademicYearBadge` since both read deny-by-default `/api/school/*` endpoints; the year badge and notifications come from `/api/teacher/me` and `/api/notifications`); the Accueil is a dashboard (stats from `/api/teacher/me`'s per-class `studentCount`, today's courses, week preview); the teacher Emploi du temps reuses the admin timetable view components in a read-only mode (`onSessionClick` now optional on `CourseCard`/`TimetableGrid`/`TimetableAgenda`/`TimetableMonth`); and `/espace-enseignant/parametres` reuses the school `ProfilTab`/`ApparenceTab`/`LangueTab` (all `/api/auth/*`-backed). Keep the paragraph style terse, no em dashes in any sentence you add is NOT required here (CLAUDE.md is not user-facing; match the file's existing style).

- [ ] **Step 2: Verify the namespace count claim is still true**

`grep -c "'" frontend/src/lib/locales.ts` is not the check; count the entries of `MESSAGE_NAMESPACES` (this plan adds none — the count in CLAUDE.md must still match; verify with a quick script or manual count and fix CLAUDE.md only if it drifted).

- [ ] **Step 3: Full gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

```bash
git add CLAUDE.md
git commit -m "docs: document the teacher portal shell alignment and settings page"
```
