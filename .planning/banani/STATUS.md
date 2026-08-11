# Banani implementation status

Last updated: 2026-08-11

Full architecture analysis: [OVERVIEW.md](./OVERVIEW.md) (v2 — School/AcademicYear/Term/Enrollment as first-class models). All 6 open questions decided and locked 2026-08-11.

## Done
- [x] `login-page` (`bWrGcKSGTeFc`) → `src/app/login/page.tsx` — plan: `login-page.md` — commit `dcb9470`
  - Discovered mid-implementation: 3 role tabs (Admin/Enseignant/Élève-Parent) not in original scope — resolved as cosmetic-only, form always posts to the same endpoint (see plan). Redirect target simplified to `/` since `/admin`/`/dashboard` don't exist yet — `TODO(epic-2/3)` left at the call site in the page.
- [x] `create-school` (`iAq5FwOgzwir`) → `src/app/admin/schools/new/page.tsx` — plan: `create-school.md` — V1 scope only — commit `436156c`
  - Discovered mid-implementation: real screen is a 3-step wizard (Informations → Plan & Accès/Stripe → Confirmation+credentials+subdomain) rendered as one static long page — user confirmed V1 = Section 1 ("Informations") only. Plan/coupon/trial/subdomain, the step-bar, and the 2-column layout's right-column summary are all dropped — depend on Stripe billing (deferred, Epic 2 remainder) and an out-of-scope subdomain-per-school concept.
  - New: `School` Prisma model (1:1 `Organization`) + migration `20260811162430_add_school_model`; `/api/auth/me` now returns `role`; `AuthContext.User` + new `useAdminUser()` hook; `POST /api/admin/schools` (owner-by-email dedup, temp-password generation, `logAdminAction`); `Select` primitive; `AdminSidebar`/`AdminTopbar`/`src/app/admin/layout.tsx` (first real consumer of the admin shell spec from `epic-0-shell.md`).
  - Not implemented (flagged, not silently dropped): forced password-change-on-first-login, send-credentials-by-email, school logo upload wiring, `/admin` dashboard + `/admin/schools` list pages (sidebar links to them exist and will 404 until those land).
  - Verified: `pnpm format && pnpm lint && pnpm typecheck && pnpm build && pnpm test` all green (571/571 tests). Dev-server + compiled-CSS checks as above. **Same screenshot-tool caveat as Login — not eyeballed in a real browser.**
  - **Real end-to-end check** (login as seeded `admin@example.com` → `POST /api/admin/schools` with cookies+CSRF): first attempt hit `TypeError: Cannot read properties of undefined (reading 'create')` — the already-running dev server's in-memory Prisma Client predated the `School` model migration (Turbopack HMR doesn't reload `node_modules/@prisma/client`). Restarting the dev server fixed it; retry succeeded (201, real `Organization`+`School`+owner created, slug `ecole-les-etoiles`). **Lesson**: after any Prisma schema change, restart the dev server before testing, don't rely on hot-reload. Format/lint/typecheck/build only weren't enough to catch this — worth remembering for every future backend-touching screen in this plan.
- [x] `school-settings` / `parametres` (`J-YtPdRZUsjN` / `o2cW8OmWvqhD`) → `src/app/(school)/settings/` — plan: `school-settings.md` — V1 scope only, not yet committed
  - **Phasing correction discovered mid-flow**: School Dashboard (originally next per OVERVIEW.md's phasing) turned out to be a rollup of Epic 4-8 data (classes/students/grades/attendance/bulletins) that doesn't exist yet — would have rendered 100% zeros with nothing real to query. User redirected to build School Settings first instead (self-contained: school profile + `AcademicYear`/`Term`, which is *why* Epic 3 was sequenced before Epic 4 in the first place). Dashboard now explicitly deferred until Epic 4+5 exist. **OVERVIEW.md's phasing list itself is now stale on this point** — treat this STATUS.md entry as the correction until OVERVIEW.md gets a pass.
  - **Route replaces the starter's generic `/settings`** (old standalone page deleted, not duplicated) — its password-change/Google-link content moved into the new **Profil** tab verbatim.
  - V1 built 4 of 7 tabs (Profil migrated, Établissement, Année scolaire, Administrateurs read-only). **Not built, explicitly flagged**: Sécurité (2FA/sessions/security-log — no backing infra exists at all), Notifications (cheap follow-up — `NotificationPreferences.prefs` JSON already exists), Système (Banani export had no content for it), Zone dangereuse/export+reset+delete (three irreversible ops, deliberately not rushed).
  - New: `AcademicYear`+`Term` Prisma models, `School` gains `officialCode`/`officialEmail`/`website`; `resolveMySchool()` helper (picks the *first* org membership — no multi-school switcher yet); `GET/PUT /api/school`, `POST /api/school/terms` (auto-creates the active year on first term, widens its date span as terms are added, term status computed from dates not stored); `Tabs` primitive; `SchoolSidebar`/`SchoolTopbar`/`src/app/(school)/layout.tsx` (light-shell spec from `epic-0-shell.md`, first consumer).
  - **Migration-naming bug hit and fixed**: this repo's existing migrations use sequential-integer folder names (`0_init`, `1_oauth_accounts`, …) rather than Prisma's default timestamp prefix. My first two migrations this project (`create-school`'s `School` model, and this one) were generated with the default `prisma migrate dev --name X` and got timestamp-prefixed folders, which **sort lexicographically in the wrong place** relative to the integer-named ones (`"2026..." < "2_organizations"` as strings) — this silently corrupted shadow-DB replay ordering and broke the next `migrate dev` call. Fixed by renaming folders to the next sequential integer (`5_add_school_model`, `6_add_academic_year_and_school_fields`) and hand-patching the `_prisma_migrations` history table to match. **Going forward**: always generate with `prisma migrate dev --name X --create-only`, rename the folder to `N_name` before applying, then apply via `prisma migrate deploy` — never let a plain `migrate dev` commit a timestamp-prefixed folder to this repo.
  - Verified: `pnpm format && pnpm lint && pnpm typecheck && pnpm build && pnpm test` all green (573/573 tests). Dev server restarted after the schema change (per the Create School lesson) — real authenticated end-to-end check as Marie (the school owner): `GET /api/school`, `PUT /api/school` (address/officialCode/officialEmail persisted), `POST /api/school/terms` ×2 (AcademicYear auto-created as "2024-2025", date span widened correctly on the 2nd term, `order` incremented, `status` computed as `DONE` for both against real dates). **Same screenshot-tool caveat — not eyeballed in a real browser.**

- [x] `classes-config` (`S_OTSGjwNm4c`) → `/configuration/classes` — plan: `classes-config.md` — V1 scope only
- [x] `matieres-list` (`0sucz8IfcpKT`) → `/configuration/matieres` — plan: `matieres-list.md` — V1 scope only
- [x] `coefficients-config` (`1pYQiqgzPagc`) → `/configuration/coefficients` — plan: `coefficients-config.md` — V1 scope only
- [x] `affectations` (`ufpxQ7cv5ffm`) → `/configuration/affectations` — plan: `affectations.md` — V1 scope only
  - **Data-model discovery** (documented in full in [epic-4-data-model.md](./epic-4-data-model.md)): the 4 screens don't map to 4 independent resources. Coefficients (per-class edit) and Affectations (cross-class edit) both read/write the same `ClassSubject` pivot row (class × subject × teacher × coefficient × weeklyHours) — confirmed by cross-referencing identical coefficient values shown in both screens' Banani mockups for the same (class, subject) pairs. Matières'/Classes' per-row aggregates (Classes/Enseignant assigné/Matières count) are computed from the same pivot grouped the other way. One pivot table, four views.
  - New Prisma models: `Subject`, `Teacher` (minimal stub — full profile is Epic 5's `teachers-list`), `Class`, `ClassSubject` (the shared pivot). Migration `7_epic4_academic_config`, following the corrected `--create-only` → rename → `migrate deploy` workflow from the `school-settings` lesson — no naming-order bug this time.
  - New API surface: `GET/POST /api/school/subjects`, `PATCH/DELETE /api/school/subjects/[id]`, `GET/POST /api/school/teachers`, `GET/POST /api/school/classes`, `PATCH/DELETE /api/school/classes/[id]`, `GET/POST /api/school/class-subjects` (upsert on `(classId, subjectId)` — partial body accepted, e.g. Coefficients sends `{coefficient}` only and it doesn't clobber `teacherId`/`weeklyHours`), `DELETE /api/school/class-subjects/[id]`.
  - New frontend: `Modal` primitive (first consumer — shared by all 3 form modals this pass); `TeacherPicker` (`src/components/school/`, shared by Class/Assignment forms — inline "+ Nouvel enseignant" create, since full Teacher CRUD doesn't exist until Epic 5); `SubjectFormModal`, `ClassFormModal`, `AssignmentFormModal`, `CoefficientStepper`.
  - **V1 scope cuts** (all depend on Epic 5/6 data that doesn't exist yet, or cut for time — full list in `epic-4-data-model.md`): no élèves/enrollment counts, no "moyenne générale", no CSV export on any of the 4 screens, no bulk actions/multi-select, no coefficient-change history, no "copier vers une classe"/"dupliquer" bulk-copy actions, no per-assignment editable "Période" (shown read-only from the school's active `AcademicYear`).
  - Verified: `pnpm format && pnpm lint && pnpm typecheck && pnpm build && pnpm test` all green (580/580 tests — up from 573, the runtime-enforcement tripwire auto-covers the 10 new route files). Dev server restarted after the schema change before testing (lesson from Create School applied without incident this time). **Real end-to-end check** as Marie: created a Subject, a Class, a Teacher; created a full assignment (teacher+hours+coefficient) via `POST /api/school/class-subjects`; re-POSTed the same `(classId, subjectId)` pair with a coefficient-only body and confirmed it updated the *same row* while preserving `teacherId`/`weeklyHours` (upsert semantics work as designed, this is the core mechanism both Coefficients and Affectations depend on); confirmed the Matières aggregate view reflects the join; confirmed `DELETE` on a still-referenced Subject returns 409, then 204 after removing the reference. Compiled-CSS check confirmed arbitrary-value classes (`min-w-[720px]`, `w-[70px]`, `bg-[#e0f0ff]`) generated correctly. **Same screenshot-tool caveat as prior screens — not eyeballed in a real browser**, but this pass had unusually thorough API-contract verification given the shared-pivot design's correctness hinges entirely on the upsert behavior.

## In progress
(none)

## Pending — fetched, not yet individually planned (21 screens remaining, grouped by epic)

### Epic 0 — Shell & primitives (prerequisite, no Banani screen)
- [x] Tailwind `@theme` tokens (Lavender SaaS palette) — `globals.css`
- [x] Primitives: `Button`, `Card`, `Field`, `Select`, `Tabs` — `src/components/ui/`
- [ ] `Badge` — still no consumer, skipped (rule-of-three)
- [x] Admin shell (`AdminSidebar`/`AdminTopbar`/`src/app/admin/layout.tsx`) — built for Create School
- [x] School shell (`SchoolSidebar`/`SchoolTopbar`/`src/app/(school)/layout.tsx`) — built for School Settings
- [x] `Modal` — built for Epic 4's form modals
- [ ] Table, StatCard — still no consumer

### Epic 2 — SaaS platform admin
- [ ] `saas-admin-dashboard` (`VZVQxm_1YTAi`) → `/admin` (sidebar link exists, page doesn't — 404 until built)
- [ ] `admin-statistics` (`nSYPhOOZgccA`) → `/admin/statistics`
- [ ] `schools-management` (`72UpLW9LHCiI`) → `/admin/schools` (list view — sidebar + Create School's back-link both point here)
- [x] `create-school` (`iAq5FwOgzwir`) → `/admin/schools/new` — **V1 only**, see Done section
- [ ] `subscription-plans` (`KM_nZ7xzMgAE`) → `/admin/billing/plans`
- [ ] `stripe-checkout` (`2Pl77h7xYQk2`) → route TBD (see OVERVIEW open question 3); also owns Create School's dropped Section 3/step-2 content

### Epic 3 — School onboarding & settings
- [ ] `school-dashboard` (`R94lpPCRDLa8`) → `/dashboard` — **deferred until Epic 4+5 exist** (see Done section note above)
- [x] `school-settings` / `parametres` (`J-YtPdRZUsjN` / `o2cW8OmWvqhD`) → `/settings` — **V1 only**, see Done section

### Epic 5 — People
- [ ] `students-list` (`irP1FJzNcIpq`) → `/eleves`
- [ ] `student-profile` (`IOcz_ptC61M8`) → `/eleves/[id]`
- [ ] `teachers-list` (`OyxtQcFdbEC9`) → `/enseignants`

### Epic 6 — Grades / evaluations
- [ ] `grade-notebook` (`AsaJl2Igbuoc`) → `/pedagogie/carnet-de-notes`
- [ ] `grade-entry` (`y4wdrHvC280E`) → `/pedagogie/carnet-de-notes/[evaluationId]/saisie`
- [ ] `edit-evaluation` (`pgYFX9zWSY_5`) → `/pedagogie/carnet-de-notes/[evaluationId]/edit`
- [ ] `notes-resultats` (`7c3XE9G80S3x`) → `/pedagogie/resultats`
- [ ] `appreciations` (`cyn9D35k5T6D`) → `/pedagogie/appreciations`

### Epic 7 — Bulletins
- [ ] `report-cards` (`IqXAVGK62iQ6`) → `/bulletins`
- [ ] `bulletin-viewer` (`fVG1xU5deplt`) → `/bulletins/[studentId]/[termId]`
- [ ] `bulletin-templates` (`cluqUYO18ujp`) → `/configuration/modele-bulletin`
- [ ] `bulletin-builder` (`Xc7dKiq2Nw6n`) → `/configuration/modele-bulletin/new`
- [ ] `bulletin-editor` (`FhIiyqa-Luo7`) → `/configuration/modele-bulletin/[id]/edit`

### Epic 8 — Attendance
- [ ] `attendance-tracking` (`Ty30SUTuXAwb`) → `/pedagogie/presences`

## Open design questions
None — all resolved 2026-08-11, see [OVERVIEW.md](./OVERVIEW.md) § Decision log.
