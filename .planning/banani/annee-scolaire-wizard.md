# Passage à l'année scolaire suivante — Banani → Next.js

## Source
- Banani screen ID: `AvMiGaEGWezS`
- Screen name: "Année Scolaire Wizard"
- Fetched: 2026-08-14

## Structure map

**Sidebar + Topbar Shell** — shared with other school settings; back button to `AnneeScolaireTab.tsx`

**Irreversibility Banner** — `.transition-banner`: old year pill (e.g., "2024-2025") → new year pill (e.g., "2025-2026") with warning icon and text: "Cette action ne peut pas être annulée" (this action cannot be undone)

**Stepper Bar** — 3 steps: circles (done/active/pending), connectors, right-aligned chip showing "Année créée: 2025-2026 • 1 Sep 2025 → 30 Jun 2026" (visible once Step 1 is marked done)

**Step 1: Nouvelle année** (Create/edit academic year)
- Form: name (auto-populated as "2025-2026"), startDate, endDate
- Button to proceed to Step 2 once filled
- Save-as-draft button (persists to server, allows closing and resuming)

**Step 2: Promotion des élèves** (Map classes and students)
- `.promo-table`: columns Classe actuelle | Élèves | Niveau actuel | Classe de destination | Créer nouvelle
- Each source class gets one row
- Destination is a `.dest-selector` dropdown (populated from existing classes in the school's previous years, or newly created via inline "Créer nouvelle" button with dashed border)
- Help banner (info/warning tone) explaining the mapping logic
- Step 3 preview visible but read-only ("Disponible après validation de l'étape 2")
- Save-as-draft and proceed-to-Step-3 buttons

**Step 3: Récapitulatif + Promotion des élèves** (Preview and exceptions)
- 3 counter cards: Élèves promus | Exceptions | Non réinscrits (counts auto-updated from Step 2 selections)
- Student table card, grouped by old-class → new-class with student count per group
  - Each `.student-row`: avatar, firstName+lastName, `.student-status-badge` ([status-promu | status-exception | status-nonreinscrit]), destination text, action links ("Modifier destination" or "Ne pas réinscrire" or "Annuler")
- Expand link: "Voir tous les élèves (N) →" to paginate/see full list
- Confirm zone (destructive tone): exact copy from Banani *"La confirmation créera l'année scolaire 2025-2026, promouvra 394 élèves et archivera l'année 2024-2025. Cette action ne peut pas être annulée."* — but adapted with real counts
- Confirm button, previous/next step nav buttons at bottom

## Component breakdown

**NEW** `AcademicYearWizardPage` — `'use client'`, 3-step stateful wizard, fetches/saves draft, atomic confirm
**NEW** `Step1NewYear` — form with name/startDate/endDate, DateField components, validation
**NEW** `Step2Promotion` — class-to-class mapping table, destination dropdown with "create new" inline flow, step-2-only draft save
**NEW** `Step3Summary` — counter cards, paginated student table grouped by flow, exception/status management, final confirm with type-to-confirm gate
**NEW** `StudentStatusBadge` — small badge component for [promu | exception | nonreinscrit]
**NEW** `PromoCounterCard` — stat card showing count + label
**REUSE** `DateField` — already exists, used in Step 1
**REUSE** `Card` — already exists, wrap each section
**REUSE** `Button` — primary, secondary, destructive variants
**PRIMITIVE** Extract `Stepper` if not yet — indicator showing active step with circles and connectors (may be reusable elsewhere)

## Token mapping (Banani → project)

| Banani token | Project value |
|---|---|
| `--primary: #6C4CFF` | `var(--color-primary)` ≈ `#6c2bd9` (check actual project value) |
| `--destructive: #ef4444` | `destructive` / `text-destructive-foreground` |
| `--warning: #f59e0b` | `warning` / `text-warning-foreground` |
| `--success: #10b981` | `success` / `text-success-foreground` |
| Border gray: `#e5e7eb` | `border` / `border-border` |
| Text muted: `#6b7280` | `text-muted-foreground` |

## Tailwind translation notes

- 3-step stepper circles: `.flex.gap-3` with `.h-8.w-8.rounded-full` circles; connector line via `flex-1.h-0.5.bg-border` between circles
- Class destination dropdown: reuse `<select>` or custom combobox; inline "Créer nouvelle" button (dashed border, `border-dashed border-2`)
- Counters: 3-column grid `md:grid-cols-3`, each a `Card` with large heading number + smaller label below
- Student rows: flex with gap, left (avatar + name) and center (status badge), right (destination text + actions)
- Destructive button: `bg-destructive text-destructive-foreground hover:bg-destructive/90`

## Responsive plan

**Base (375px, no prefix):** Mobile-first; form inputs full-width, dropdown full-width, counter cards stack vertically (1 per row), student table collapses—show only name + status badge + action link, group headers visible
**md (768px+):** Counter cards 2-column grid; table gets more columns (destination, full action labels)
**lg (1024px+):** Counter cards 3-column, wizard sidebar visible alongside main content (if kept), full table layout matches Banani desktop mockup

## Interactions / state

- Step 1 → Step 2: validate year form (name required, dates valid, endDate > startDate), save draft, unlock Step 2
- Step 2 → Step 3: validate all classes have destination assigned (or are marked "create new"), save draft, unlock Step 3
- Step 3: type-to-confirm (school name) before enabling confirm button (like `reset-year` / `delete-school` danger-zone pattern)
- Hover: destination dropdown highlights, action links show as links (underline on hover)
- Destination "Créer nouvelle" modal: inline form (class name, level, optional room/capacity/homeroom-teacher), creates draft class in local state, returns to Step 2 with new class selectable
- Exception flow: click "Modifier destination" on a student row → small modal/popover to pick a different destination class or mark "Ne pas réinscrire" → updates local state, badge changes to [exception | nonreinscrit]
- Unjustified-absence / not-a-student edge case: if a student has no current enrollment in the active year, they show as "Ne pas réinscrire" by default (not promoted)

## Copy / i18n

All strings from Banani mockup + derived copy are in `DASHBOARD` or a new `ACADEMIC_YEAR_ROLLOVER` constant block in `frontend/src/lib/constants.ts`:
- Step names, button labels, field labels
- Banner text, help text, counter labels
- Confirm-zone copy (interpolated with counts)
- Empty/error states (e.g., "Aucune classe dans l'année en cours — configure d'abord des classes")

**No English in JSX.**

## Implementation checklist

- [ ] **Create Prisma migration** for `AcademicYearRolloverDraft` model (stores in-progress wizard state as JSON or normalized rows)
- [ ] **Write `/api/school/academic-year-rollover` route** (POST draft body → save/load, PATCH to update draft, DELETE to clear, authenticated + OWNER-only)
- [ ] **Write `/api/school/academic-year-rollover/confirm` route** (POST with type-to-confirm verification, atomic transaction: create AcademicYear + Classes + Enrollments + set old year isActive=false)
- [ ] **Create `Step1NewYear` component** with form, validation, draft save on proceed
- [ ] **Create `Step2Promotion` component** with class-to-class table, destination dropdown + inline "create new" flow
- [ ] **Create `Step3Summary` component** with counter cards, paginated student table, exception management, type-to-confirm input, final confirm button
- [ ] **Create `AcademicYearWizardPage` page** at `frontend/src/app/(school)/settings/nouvelle-annee/page.tsx`, orchestrate 3 steps, fetch active year + classes + students on mount
- [ ] **Update `AnneeScolaireTab.tsx`** to add entry-point button/link to the wizard (shows only for OWNER role, only if active year exists)
- [ ] **Add constants to `ACADEMIC_YEAR_ROLLOVER`** block in `frontend/src/lib/constants.ts`
- [ ] **Run `pnpm format && lint && typecheck && test`** to verify no regressions
- [ ] **E2E test on seeded school** (login as OWNER, navigate to wizard, go through all 3 steps, verify confirm creates new year + archives old one + redirects back to dashboard)
- [ ] **Update `.planning/banani/STATUS.md`** to move `annee-scolaire-wizard` to Done section

## Open questions (resolved during brainstorming)

- **Teacher/fee carry-forward:** No auto-copy. Admin reconfigures ClassSubject assignments and FeeStructure/FeeTranche configs separately after year is created (keeps flexibility, avoids silent misconfiguration).
- **Archive scope:** Wizard only — no need for cross-screen archive-year browsing this pass. Old year's data stays readable via year selector on applicable screens (future work).
- **Draft persistence:** Real server-side persistence via `AcademicYearRolloverDraft` model. User can close and resume the wizard. On final confirm, draft is deleted and real year/classes/enrollments are created atomically.
- **Destination class selection:** Combobox pre-populated from existing classes (grouped by level if sensible, else flat list). Inline "Créer nouvelle" button creates a draft class (name, level, optional room/capacity/homeroom-teacher — copying from source class as template). No algorithmic level-progression guessing (Class.level is free-text, so unsafe).
- **Gating:** OWNER-only. Type-to-confirm school name on final step (reuses `confirmNameMatches` + `enforceDangerZoneRateLimit` from `school-danger-zone.ts`), matching `reset-year` / `delete-school` pattern.
- **Student promotion edge cases:** Unenrolled students (not in an Enrollment for active year) default to "Ne pas réinscrire". Exceptions are tracked in `AcademicYearRolloverDraft.studentExceptions` (studentId → destinationClassId or null/"skip"). On confirm, only students mapped to a destination get new Enrollment rows.

## New data model

**`AcademicYearRolloverDraft`** Prisma model:
```prisma
model AcademicYearRolloverDraft {
  id                   String   @id @default(cuid())
  schoolId             String
  school               School   @relation(fields: [schoolId], references: [id], onDelete: Cascade)

  // Wizard state (Step 1)
  newYearLabel         String   // "2025-2026"
  newYearStartDate     DateTime
  newYearEndDate       DateTime

  // Wizard state (Step 2)
  classMapping         Json     // { oldClassId: { destClassId?, isNew?, newClass?: { name, level, room?, capacity?, homeroomTeacherId? } } }
  studentExceptions    Json     // { studentId: { destClassId?, skip: bool } }

  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  createdBy            String   // userId of OWNER who started the wizard

  @@unique([schoolId])
}
```

---

## Summary

This wizard implements a **real, atomic academic-year rollover** for EkolSuite. Key design decisions:

1. **3-step UX** (Banani pixel-perfect): new year form → class mapping table → review + exceptions + type-to-confirm final commit
2. **Server-side draft persistence** — user can close and resume mid-wizard via `AcademicYearRolloverDraft` model
3. **Flexible class destination selection** — combobox with inline "create new" flow (avoids assuming level progression)
4. **No auto-copy of configs** — teacher/fee assignments are reconfigured post-rollover (keeps data clean, avoids silent misconfiguration)
5. **OWNER-only + type-to-confirm gate** — reuses `school-danger-zone.ts` pattern for safety
6. **Atomic confirm** — single database transaction creates new AcademicYear, Classes, Enrollments, archives old year (isActive=false) in one shot
7. **Student exceptions** — track per-student destination overrides in draft, apply on confirm

**Next:** Present this plan in chat for user confirmation, then invoke `writing-plans` skill to create detailed implementation tasks.
