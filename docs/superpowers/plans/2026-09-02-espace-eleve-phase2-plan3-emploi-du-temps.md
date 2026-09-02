# Espace Élève Phase 2 — Plan 3 : Emploi du temps + finitions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the student's Emploi du temps screen (month / week / day / agenda views, legend, period navigation, CSV export) on its own `/api/student/timetable` route, close the navigation (sidebar entry, bottom-nav slot, dashboard links), run the full desktop + 375px verification of the whole portal, and record the work in CLAUDE.md and the session memory.

**Architecture:** `GET /api/student/timetable?from&to` mirrors the school timetable GET's validation (`DAY_RE`, `MAX_RANGE_DAYS = 62`) but scopes the query on the session student's current-enrollment `classId` (no filters, no rooms lookup beyond the returned sessions). The page is a clone of the teacher Emploi du temps page with the `me` fetch removed and `showClass={false}` (one class: subject + room + teacher on each card). The bottom nav keeps five slots by dropping Mon profil (still reachable from the drawer).

**Tech Stack:** Next.js 16 App Router, Prisma 5, zod, Vitest + `@/test-utils/prisma-mock`, next-intl (`ElevePortal.timetable.title` + borrowed `Timetable.toolbar` / `Timetable.export`), the shared `components/school/timetable/*` views.

**Spec:** `docs/superpowers/specs/2026-09-02-espace-eleve-phase2-design.md` (« Surface API » row `/api/student/timetable`, « Écrans » Emploi du temps, « Tests », « Livraison » Plan C).

## Global Constraints

- Route Handler: `export const runtime = 'nodejs'`, `withRequestContext`, `requireStudent(req)`, GET only, 404 for any non-student account; `studentId`/`classId` come from the session, never from the query.
- No `/api/school/*` call from the student page.
- i18n parity fr/ht/en (`ht` keeps `_review`), no em dash in user-facing strings.
- `pnpm format && pnpm lint && pnpm typecheck && pnpm test` green before each commit; explicit-path `git add`; commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Worktree `.claude/worktrees/espace-eleve-phase2`, dev server on port 3001 only (started with `APP_URL=http://localhost:3001` so the PDF print page resolves to the worktree server).

---

### Task 1: `GET /api/student/timetable` + tests + i18n key

**Files:**
- Create: `frontend/src/app/api/student/timetable/route.ts`, `route.test.ts`
- Modify: `frontend/src/messages/{fr,ht,en}/elevePortal.json` (`timetable.title`)

**Interfaces:**
- Produces: `{ academicYear: { id, label } | null, sessions: SerializedSession[], rooms: string[] }` (the client `TimetableResponse` shape).

- [ ] **Step 1: Write the failing tests** — requireStudent 404 passthrough; 400 on missing/invalid `from`/`to`; 400 when the range exceeds 62 days or `to < from`; `{ academicYear: null, sessions: [], rooms: [] }` without active year; `{ academicYear, sessions: [], rooms: [] }` without enrollment (no session query); the session query is scoped on `{ schoolId, academicYearId, classId, date: { gte, lte } }`; rooms are the distinct trimmed rooms of the returned sessions.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**

```ts
export const runtime = 'nodejs';
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireStudent } from '@/lib/server/middleware/require-student';
import { prisma } from '@/lib/server/prisma';
import { resolveActiveAcademicYear } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { DAY_MS, parseDay } from '@/lib/server/timetable';
import { DAY_RE, SESSION_INCLUDE, serializeSession, seriesCounts } from '@/lib/server/timetable-route-helpers';

const MAX_RANGE_DAYS = 62;
const Query = z.object({ from: z.string().regex(DAY_RE), to: z.string().regex(DAY_RE) });
// GET: requireStudent → parse → range check → active year → class scoping → serialize.
```

- [ ] **Step 4: Run → PASS; `runtime-enforcement.test.ts` and `locales.test.ts` green.**
- [ ] **Step 5: Commit** `feat(eleve): /api/student/timetable`.

---

### Task 2: `/eleve/emploi-du-temps` page + navigation

**Files:**
- Create: `frontend/src/app/(eleve)/eleve/emploi-du-temps/page.tsx` (clone of the teacher page: no `me` fetch, `useApi<TimetableResponse>(\`/api/student/timetable?from=&to=\`)`, `showClass={false}`, title `ElevePortal.timetable.title`, error `ElevePortal.loadError`)
- Modify: `frontend/src/components/layout/student/StudentSidebar.tsx` (Scolarité: Emploi du temps `/eleve/emploi-du-temps`, `CalendarDays`, after Mes présences)
- Modify: `frontend/src/components/layout/student/StudentMobileBottomNav.tsx` (home, grades, attendance, timetable + Plus; Mon profil dropped)
- Modify: `frontend/src/app/(eleve)/eleve/page.tsx` (« Voir l'emploi du temps » link in the « Cette semaine » header + a third quick-link card)

- [ ] **Step 1: Apply. Step 2: typecheck + lint + `route-match.test.ts`. Step 3: Commit** `feat(eleve): Emploi du temps page and navigation`.

---

### Task 3: Full browser verification

- [ ] **Step 1:** dev server on 3001 with `APP_URL=http://localhost:3001`; Puppeteer script with the seeded student: `/eleve`, `/eleve/profil`, `/eleve/notes`, `/eleve/presences`, `/eleve/emploi-du-temps` (week + month + agenda views), `/eleve/appreciations`, `/eleve/bulletins`, `/eleve/bulletins/<termId>`, `/eleve/parametres`, logout → `/login`; desktop + 375px screenshots; no `[role=alert]`, no horizontal overflow, no console error other than the expected 404s of the isolation checks; `GET /api/student/bulletin/pdf?termId=` → 200 `application/pdf`; `GET /api/school/timetable?from&to` as the student → 404.
- [ ] **Step 2:** fix anything off; stop only the port-3001 server.
- [ ] **Step 3:** full gate; commit leftovers.

---

### Task 4: Documentation and memory

**Files:**
- Modify: `CLAUDE.md` (new « Espace Élève » paragraph between the Espace Enseignant and Multi-espaces paragraphs)
- Create: `~/.claude/projects/.../memory/espace-eleve-phase2-status.md` + `MEMORY.md` pointer

- [ ] **Step 1: Write both. Step 2: `pnpm test` (doc tripwires). Step 3: Commit** `docs: Espace Élève phase 2 in CLAUDE.md`.

Then hand over to superpowers:finishing-a-development-branch (merge `feat/espace-eleve-phase2` into local `develop`, push, remove the worktree, copy the `jimmy.valcin` row into the main checkout's `frontend/CREDENTIALS.local.md`).
