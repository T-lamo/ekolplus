# Attendance Tracking (Présences) — Banani → EkolSuite

## Source
- Banani screen ID: `Ty30SUTuXAwb`, screenName "Attendance Tracking"
- Route: `/pedagogie/presences` (already linked in `SchoolSidebar.tsx`, currently 404)
- Fetched: 2026-08-12

## Decisions confirmed with user (2026-08-12)
1. **Granularity: daily**, not per-session. One `Attendance` row per student per calendar day — matches the mockup's day-column grid exactly, no subject dimension.
2. **Interaction: cycle-on-click.** Clicking a day's presence dot advances Présent → Absent → Retard → Justifié → (clear/not recorded) → Présent…
3. **Editable range: today and past only.** Future days in the selected week render disabled/non-interactive dots.
4. **Justification captures free text**, mirroring `Grade.comment` — a small modal, not a bare status flip.

## New Prisma model
```prisma
model Attendance {
  id            String   @id @default(cuid())
  studentId     String
  student       Student  @relation(fields: [studentId], references: [id], onDelete: Cascade)
  date          DateTime // calendar day, UTC-midnight normalized — no time component
  status        String   // PRESENT | ABSENT | LATE | EXCUSED
  justification String?  // free text, set via the edit/justify modal
  markedById    String?
  markedBy      User?    @relation(fields: [markedById], references: [id], onDelete: SetNull)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([studentId, date])
  @@index([studentId, date])
}
```
No `classId`/`schoolId` stored directly — reached transitively via `studentId → Student.schoolId`
and the active `Enrollment` for the selected class, matching `Goal`/`Appreciation`'s existing
convention (they don't store `classId` either). No `termId` either — a date range derived from
the resolved `Term.startDate/endDate` window (via the existing `resolveCurrentTerm` helper from
`@/lib/server/grades.ts`) drives the term-scoped rate/absence-count columns. "Not recorded" (—)
is simply the absence of a row for that student+date — no extra enum value needed, mirrors
`Grade.score: null`.

## Backend routes
- **`GET /api/school/attendance?classId=&weekStart=`** — resolves the active `AcademicYear`,
  the class's roster via `Enrollment`, the current `Term` (for rate/absence-count window), the
  5 school days (Mon–Fri) of the requested week (default: the week containing today), and
  left-joins `Attendance` rows per student × day. Also computes the 5 summary-card numbers.
- **`PATCH /api/school/attendance`** — body `{ studentId, date, status, justification? }` —
  upserts one day's record (used by: dot-click cycling, the edit modal, the justify modal — one
  endpoint, three UI entry points). Rejects future dates (`VALIDATION_FAILED`). Sets
  `markedById` to the caller.
- **`DELETE /api/school/attendance?studentId=&date=`** — clears one day's record back to "not
  recorded" (the row-kebab's "Supprimer l'entrée", scoped to *today* — see below).

## Component breakdown
- **NEW** `frontend/src/app/(school)/pedagogie/presences/page.tsx` — the screen itself.
- **NEW** `AttendanceEditModal` (co-located) — shared by row-kebab "Modifier la présence" (opens
  on today, all 4 statuses selectable) and "Justifier l'absence" (opens pre-set to Justifié,
  motif field focused). One component, two entry props.
- **REUSE** `Card`, `Button`, `Tabs`, `SearchInput`, `FilterSelect`, `ActionMenu` (plain, 7 static
  items — no `searchable`, unlike Carnet de notes), `Avatar` — all already in
  `components/ui/`.
- **PRIMITIVE, page-local** `SummaryCard` — every sibling screen (Carnet de notes, Appréciations,
  Classes, Matières, Affectations, Bulletins) defines its own copy rather than sharing one from
  `ui/`; matching that existing (if imperfect) convention rather than unilaterally refactoring it
  now. 5 tones needed: `secondary`/`blue`/`success`/`destructive`/`warning` — the `blue` tone's
  hardcoded `#e0f0ff`/`#2563eb` already matches the Banani "Justifié" color exactly.

## Token mapping
All colors already exist as project tokens — the Banani HTML's own rendered `:root` (not the
separate "Lavender SaaS" theme-metadata block, which is a non-applied preset descriptor) matches
this project's `globals.css` 1:1. One exception: "Justifié" uses a hardcoded `#e0f0ff`/`#2563eb`
blue pair with no dedicated token — same as the existing `blue` `SummaryCard` tone elsewhere in
this codebase, so no new token needed, just reuse that established hardcoded pair.

| Status | Label | Glyph | bg / fg |
|---|---|---|---|
| PRESENT | Présent | P | `bg-success` / `text-success-foreground` |
| ABSENT | Absent | A | `bg-destructive` / `text-destructive-foreground` |
| LATE | Retard | R | `bg-warning` / `text-warning-foreground` |
| EXCUSED | Justifié | J | `bg-[#e0f0ff]` / `text-[#2563eb]` |
| not recorded | Non renseigné | — | `bg-muted` / `text-muted-foreground` |

## Responsive plan
Banani is desktop-only (zero `@media` queries in the fetched CSS) — mobile plan is mine to design,
following this project's existing pattern (every other list screen — Élèves, Enseignants,
Carnet de notes — uses `overflow-x-auto` on the table card rather than a separate stacked mobile
layout, since these are dense data-grids not marketing content):
- **375px+ (base)**: page header stacks (title above actions), 5 summary cards become a 2-col
  grid (`grid-cols-2`, matching every other list screen's existing summary-bar pattern), filters
  row wraps (`flex-wrap`), the presence table sits in a horizontally-scrolling card
  (`overflow-x-auto`) so the 5 day columns stay usable via swipe instead of being crushed.
- **md (768px+)**: summary cards go 4-5 across if they fit; filters row stays single-line.
- **lg (1024px+)**: matches the Banani desktop mock as fetched.

## Interactions / state
- **Dot click**: cycles status, disabled (reduced opacity, no pointer) for future dates, `title`
  tooltip announces current status + next-on-click for a11y/clarity.
- **Row kebab (7 items)**: Voir le détail → navigates to the existing `/eleves/[id]` profile
  (real, reuses existing infra). Modifier la présence / Justifier l'absence → `AttendanceEditModal`
  scoped to *today* (per-row actions target "today", not the whole displayed week — individual
  past days are edited via their own dot directly). Supprimer l'entrée → deletes *today's* record,
  `window.confirm` guard, danger tone (matches existing delete-row precedent app-wide). Historique
  complet / Notifier le tuteur / Générer un rapport → toast stubs (no audit-log, messaging, or
  report generator exists — same honest-placeholder precedent as every prior epic).
- **Header buttons**: Exporter (CSV, reuses `exportToCsv` like every other list page) / Imprimer
  (`window.print()`, matches Carnet de notes) / Notifier les tuteurs / "Affichage" column-config →
  toast stubs. Saisir présences → scrolls to the table (the grid dots already are the entry
  mechanism — no separate page, avoids building two ways to do the same thing).
- **Tabs**: "Vue hebdomadaire" built for real. Vue mensuelle / Statistiques / Alertes → toast
  stubs, matching the Appréciations screen's "Par matière"/"Statistiques" precedent (Banani
  provided no markup for these 3).
- **Checkboxes** (header + per-row): kept visually, no bulk-action wiring — matches the existing
  V1 cut on Students/Teachers lists.
- Loading / empty (`0 élèves` in the selected class) / error states: same shape as every other
  list screen in this app.

## Copy / i18n
All strings live inline in the page (matching every sibling screen's convention — this project
doesn't centralize school-module strings in `constants.ts`, only auth/admin does). Exact French
copy is the Banani copy quoted in the fetch extraction — no invented English placeholders.

## Implementation checklist
- [ ] `Attendance` Prisma model + relation on `Student`/`User` + migration
- [ ] `GET /api/school/attendance`, `PATCH`, `DELETE`
- [ ] Page: header, 5 summary cards, filters (search/classe/période/statut), tabs, legend, table,
      pagination
- [ ] `AttendanceEditModal`
- [ ] 375px / 768px / 1280px checks, no horizontal page scroll (table scrolls internally)
- [ ] Empty / loading / error states
- [ ] `pnpm format && lint && typecheck && test`
- [ ] `STATUS.md` update, Epic 8 → Done

## Open questions for user
None outstanding — the 4 structural decisions were confirmed via AskUserQuestion before this plan
was written; everything else follows this project's own established precedent (see Interactions
section above for each stub/real split and its rationale).
