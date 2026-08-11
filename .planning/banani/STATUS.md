# Banani implementation status

Last updated: 2026-08-11

Full architecture analysis: [OVERVIEW.md](./OVERVIEW.md) (v2 — School/AcademicYear/Term/Enrollment as first-class models). All 6 open questions decided and locked 2026-08-11.

## Done
- [x] `login-page` (`bWrGcKSGTeFc`) → `src/app/login/page.tsx` — plan: `login-page.md` — commit `dcb9470`
  - Discovered mid-implementation: 3 role tabs (Admin/Enseignant/Élève-Parent) not in original scope — resolved as cosmetic-only, form always posts to the same endpoint (see plan). Redirect target simplified to `/` since `/admin`/`/dashboard` don't exist yet — `TODO(epic-2/3)` left at the call site in the page.
- [x] `create-school` (`iAq5FwOgzwir`) → `src/app/admin/schools/new/page.tsx` — plan: `create-school.md` — V1 scope only, not yet committed
  - Discovered mid-implementation: real screen is a 3-step wizard (Informations → Plan & Accès/Stripe → Confirmation+credentials+subdomain) rendered as one static long page — user confirmed V1 = Section 1 ("Informations") only. Plan/coupon/trial/subdomain, the step-bar, and the 2-column layout's right-column summary are all dropped — depend on Stripe billing (deferred, Epic 2 remainder) and an out-of-scope subdomain-per-school concept.
  - New: `School` Prisma model (1:1 `Organization`) + migration `20260811162430_add_school_model`; `/api/auth/me` now returns `role`; `AuthContext.User` + new `useAdminUser()` hook; `POST /api/admin/schools` (owner-by-email dedup, temp-password generation, `logAdminAction`); `Select` primitive; `AdminSidebar`/`AdminTopbar`/`src/app/admin/layout.tsx` (first real consumer of the admin shell spec from `epic-0-shell.md`).
  - Not implemented (flagged, not silently dropped): forced password-change-on-first-login, send-credentials-by-email, school logo upload wiring, `/admin` dashboard + `/admin/schools` list pages (sidebar links to them exist and will 404 until those land).
  - Verified: `pnpm format && pnpm lint && pnpm typecheck && pnpm build && pnpm test` all green (571/571 tests). Dev-server + compiled-CSS checks as above. **Same screenshot-tool caveat as Login — not eyeballed in a real browser.**

## In progress
(none)

## Pending — fetched, not yet individually planned (26 screens remaining, grouped by epic)

### Epic 0 — Shell & primitives (prerequisite, no Banani screen)
- [x] Tailwind `@theme` tokens (Lavender SaaS palette) — `globals.css`
- [x] Primitives: `Button`, `Card`, `Field`, `Select` — `src/components/ui/`
- [ ] `Badge` — still no consumer, skipped (rule-of-three)
- [x] Admin shell (`AdminSidebar`/`AdminTopbar`/`src/app/admin/layout.tsx`) — built for Create School
- [ ] School shell (light sidebar/topbar) — deferred to Epic 3 start, spec in `epic-0-shell.md`
- [ ] Table, StatCard, Modal, Tabs — still no consumer

### Epic 2 — SaaS platform admin
- [ ] `saas-admin-dashboard` (`VZVQxm_1YTAi`) → `/admin` (sidebar link exists, page doesn't — 404 until built)
- [ ] `admin-statistics` (`nSYPhOOZgccA`) → `/admin/statistics`
- [ ] `schools-management` (`72UpLW9LHCiI`) → `/admin/schools` (list view — sidebar + Create School's back-link both point here)
- [x] `create-school` (`iAq5FwOgzwir`) → `/admin/schools/new` — **V1 only**, see Done section
- [ ] `subscription-plans` (`KM_nZ7xzMgAE`) → `/admin/billing/plans`
- [ ] `stripe-checkout` (`2Pl77h7xYQk2`) → route TBD (see OVERVIEW open question 3); also owns Create School's dropped Section 3/step-2 content

### Epic 3 — School onboarding & settings
- [ ] `school-dashboard` (`R94lpPCRDLa8`) → `/dashboard`
- [ ] `school-settings` / `parametres` (`J-YtPdRZUsjN` / `o2cW8OmWvqhD`) → `/settings` (likely one screen, see OVERVIEW open question 5)

### Epic 4 — Academic configuration
- [ ] `classes-config` (`S_OTSGjwNm4c`) → `/configuration/classes`
- [ ] `matieres-list` (`0sucz8IfcpKT`) → `/configuration/matieres`
- [ ] `coefficients-config` (`1pYQiqgzPagc`) → `/configuration/coefficients`
- [ ] `affectations` (`ufpxQ7cv5ffm`) → `/configuration/affectations`

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
