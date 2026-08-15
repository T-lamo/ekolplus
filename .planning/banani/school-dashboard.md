# School Dashboard — Banani → EkolSuite

## Source
- Banani screen ID: `R94lpPCRDLa8` ("School Dashboard")
- Fetched: 2026-08-14
- Previously deferred (see STATUS.md `school-settings` entry, 2026-08-11): "would have rendered 100% zeros with nothing real to query." Epics 4-8 now all exist (classes, students, teachers, grades/evaluations, attendance, fees, bulletin templates) — unblocked.

## Structure map
Sidebar/topbar in the Banani HTML are **not rebuilt** — `SchoolSidebar`/`SchoolTopbar`/`(school)/layout.tsx` already exist and already contain a dead `/dashboard` nav link (`Tableau de bord`, `LayoutDashboard` icon, "Principal" section) pointing here. This plan only builds the page content:

1. **Page header** — title, subtitle "Bienvenue, {name}", year selector (non-interactive, see open Q4), Export button (real CSV of the KPI summary)
2. **KPI row** — 5 cards: Élèves inscrits, Enseignants, Classes actives, Matières, Taux de présence (cette semaine)
3. **Charts row** — line chart "Évolution des moyennes" (see open Q1), donut "Répartition par niveau"
4. **Scolarité section** — 3 cards: Total Recouvré (circular %), Élèves en Retard (circular %), Prochaine Échéance
5. **Mid row** — bar list "Taux de présence par classe" (ce mois), bar list "Performance par matière" (moyenne /20, toutes classes)
6. **Bottom row** — "À traiter" todo list (see open Q2), "Activité récente" (see open Q3)

## Component breakdown
- **NEW** `src/app/(school)/dashboard/page.tsx` — page shell, mirrors `pedagogie/presences/page.tsx` conventions (useUser + useEffect/api fetch, `data`/`error` state, no separate loading bool, Skeleton while `!data && !error`)
- **NEW** `src/app/api/school/dashboard/route.ts` — single GET aggregating everything below (one-call-hydrates-page precedent from `admin-statistics`/`admin-subscriptions`/`fees/overview`)
- **NEW** `src/components/school/dashboard/KpiRow.tsx`, `AveragesTrendCard.tsx`, `LevelDistributionCard.tsx`, `FeesSummaryRow.tsx`, `AttendanceByClassCard.tsx`, `SubjectPerformanceCard.tsx`, `TodoListCard.tsx`, `RecentActivityCard.tsx` — one file per card cluster, page.tsx stays a thin composition layer
- **REUSE** `StatCard` (`components/admin/StatCard.tsx`) for the 5 KPI cards — most generic of the 3 existing stat-card variants, per Explore findings
- **REUSE** `Card`, `Skeleton`/`SkeletonStatCards` (loading state)
- **NEW, SVG, no chart lib** — line chart and circular-progress SVGs hand-rolled inline (same approach as `BarChart`/`DonutChart` in `components/admin/charts/` — pure SVG, no dependency). `DonutChart` itself is reused as-is for "Répartition par niveau" (4 levels ≤ its 3-slice hard cap? **No** — 4 levels exceeds `DonutChart`'s hardcoded 3-slice `SLOT_CLASSES`/`SWATCH_CLASSES` arrays. Either extend those arrays to 4 (cheap, backwards-compatible) or hand-roll a 4-slice donut inline like the circular-progress cards. Will extend `DonutChart` to 4 slices since it's the more reusable fix and no existing consumer breaks.
- **NEW** `src/lib/server/school-dashboard.ts` — the aggregation queries, kept out of the route file per the `grades.ts`/`fees/rows.ts` precedent (route = HTTP concerns, lib = query logic)

## Token mapping (Banani → project)
All Banani tokens are already the project's own tokens (this project *is* the "Purple Percent" theme — `--primary:#6c2bd9` etc. match `globals.css` exactly, confirmed in the earlier DateField work). No new `@theme` extensions needed. Icons: all Lucide, already in `package.json`.

## Tailwind translation notes
Standard flex/grid mapping (see skill's quick-reference table). Two custom values to extend if not already present: `kpi-row`'s `repeat(5,1fr)` → `grid-cols-5` (mobile: `grid-cols-2`, tablet `sm:grid-cols-3`, desktop `lg:grid-cols-5`); `charts-row`/`mid-row`'s `1fr 290px` → `lg:grid-cols-[1fr_290px]` (mobile: stacked `grid-cols-1`).

## Responsive plan
- **Base (375px)**: everything stacks `grid-cols-1`. KPI cards: `grid-cols-2` (5 cards → 2+2+1). Scolarité row: `grid-cols-1` (3 stacked cards). Bottom row: `grid-cols-1` stacked. Presence bar labels truncate; chart legend wraps under title instead of inline.
- **sm (640px+)**: KPI cards `grid-cols-3` (3+2). Scolarité row stays 1 col until md.
- **md (768px+)**: Scolarité row `grid-cols-3`. Mid-row and bottom-row switch to 2-col (`1fr 290px` collapses to plain `grid-cols-2` at this breakpoint, full `290px` fixed side col only at `lg`).
- **lg (1024px+)**: KPI cards `grid-cols-5` (Banani's exact layout). Charts-row/mid-row `grid-cols-[1fr_290px]` as shipped.
- **xl (1280px+)**: matches Banani pixel-for-pixel, `main-content` max readable width already bounded by the existing `(school)` layout shell (no new container needed).

## Interactions / state
- Export button: real client-side CSV of the 5 KPI values + fee/attendance summary (same `exportToCsv` helper used everywhere else), no loading state needed (synchronous).
- Todo items and "Voir les détails"/"Détails"/"Tout voir" links: real `<Link>`s to their respective existing pages (`/eleves`, `/pedagogie/carnet-de-notes`, `/pedagogie/presences`, `/scolarite/paiements`, `/scolarite/relances`) — **never a dead click**, per the ActionMenu precedent ("never a silently-dead button").
- Loading: `SkeletonStatCards` for KPI row + generic `Skeleton` blocks for the rest (no existing skeleton shape matches this page's layout — will compose from primitives already in `ui/Skeleton.tsx`).
- Empty/error states: `NO_SCHOOL` → redirect `/`, same as every other page. If a metric's underlying data is genuinely empty (e.g. no fee structure configured yet), show `—` per the established "honest dash, not fake zero" precedent — not a full-page empty state, since most of the page is still meaningful even if one card has no data yet.
- Keyboard/focus: all interactive elements (export button, links, year label if it becomes a button) get visible focus rings via existing `Button`/`Link`/`Card` conventions.

## Copy / i18n
All French, sourced from a new `DASHBOARD` key in `src/lib/constants.ts` (following the `FEES`/`ADMIN_SAAS` pattern) — no hardcoded strings in JSX beyond what constants already centralize elsewhere in the app.

## New backend: `GET /api/school/dashboard`

```ts
{
  academicYear: { id: string; label: string } | null;
  kpis: {
    studentsCount: number;
    studentsDeltaThisMonth: number;      // Enrollment.enrolledAt in current calendar month
    teachersCount: number;                // Teacher.isActive:true
    classesCount: number;                 // Class rows, active year
    subjectsCount: number;                // Subject.isActive:true
    attendanceRateThisWeek: number | null;      // 0-100, school-wide, current ISO week
    attendanceRateDeltaVsLastWeek: number | null; // signed percentage points
  };
  averagesTrend: { month: string; average: number | null }[]; // school-wide weighted avg, PUBLISHED evaluations bucketed by Evaluation.date month, active year Sep→current month
  levelDistribution: { level: string; count: number }[]; // Class.level grouped, sum of current enrollments
  fees: {
    collectedPercent: number;
    overdueStudentPercent: number;
    overdueStudentCount: number;
    nextTranche: { label: string; dueDate: string; studentsConcerned: number } | null;
    daysUntilNextTranche: number | null;
    tranchesElapsed: number;
    tranchesTotal: number;
  };
  attendanceByClass: { classId: string; className: string; ratePercent: number | null }[]; // this month, per class
  subjectPerformance: { subjectId: string; name: string; average: number | null }[]; // school-wide weighted avg /20, active term
  todos: {
    evaluationsToGrade: number;      // status:DRAFT count
    evaluationsOverdue: number;      // DRAFT whose term has already ended
    unjustifiedAbsencesThisWeek: number; // status:ABSENT, justification:null, this ISO week
    overduePayments: number;         // == fees.overdueStudentCount
  };
  recentActivity: { type: 'grade' | 'absence' | 'payment' | 'enrollment'; text: string; at: string }[]; // last 8 across 4 models, sorted desc — see open Q3
}
```

Reuses `weightedAverage`/`roundToTenth` from `lib/server/grades.ts` and `attendanceRate`/date helpers from `lib/server/attendance.ts` where signatures fit; new school-wide (not per-class) loop logic lives in the new `lib/server/school-dashboard.ts`, not bolted onto either existing file (both are currently scoped to per-student/per-class, adding school-wide branches would blur their contracts).

## Implementation checklist
- [ ] `DASHBOARD` constants block
- [ ] `lib/server/school-dashboard.ts` aggregation helpers
- [ ] `GET /api/school/dashboard/route.ts`
- [ ] Extend `DonutChart` to support 4 slices
- [ ] 8 dashboard card components (mobile-first)
- [ ] `app/(school)/dashboard/page.tsx` composition
- [ ] Flip login redirect: `/configuration/classes` → `/dashboard` for school users (`app/login/page.tsx:64`)
- [ ] 375px / 768px / 1280px checks, no horizontal scroll
- [ ] `pnpm format && lint && typecheck && test`
- [ ] Real E2E check against seeded data (dev server), compare to Banani at 1280px

## Open questions for user
1. **Évolution des moyennes** (line chart) — Banani mocks 2 arbitrary class lines (3ème A/3ème B) purely as illustration. Charting all real classes (school likely has 10-14) as separate lines would be unreadable. Recommend: **one line = school-wide overall average per month**, computed from published evaluations. Confirm or propose an alternative?
2. **"Bulletins à générer" todo card** — no `Bulletin` entity is persisted anywhere (Epic 7 deliberate decision: bulletins are computed on-demand, nothing to count as a "backlog"). No honest real proxy exists for this exact metric. Options: (a) drop the card, keep 3 todo items; (b) replace it with a different real, actionable metric — e.g. "Enseignants sans classe assignée" (real, computable from the Epic 4 pivot, currently zero UI surfaces this); (c) something else you have in mind.
3. **Activité récente** — no audit-log model exists (same gap flagged on Student Profile). Two real options: (a) build a genuine lightweight feed — last 8 events unioned from recent grade edits, absences marked, payments recorded, and new student enrollments (all have real timestamps, no new schema needed); (b) honest "Bientôt disponible" placeholder, same treatment as Student Profile's own "Activité récente" gap. Recommend (a) since the data exists cheaply.
4. **Year selector** — only one `AcademicYear.isActive` exists at a time; no screen anywhere in the app has real past-year switching yet. Recommend: **non-interactive label** showing the real active year (matches several existing V1 read-only precedents), not a functional switcher that reruns every KPI for a past year. Confirm, or is real year-switching worth the extra scope now?
