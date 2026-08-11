# Banani implementation status

Last updated: 2026-08-11

Full architecture analysis: [OVERVIEW.md](./OVERVIEW.md) (v2 — School/AcademicYear/Term/Enrollment as first-class models). All 6 open questions decided and locked 2026-08-11.

## Done
- [x] `login-page` (`bWrGcKSGTeFc`) → `src/app/login/page.tsx` — plan: `login-page.md` — not yet committed
  - Discovered mid-implementation: 3 role tabs (Admin/Enseignant/Élève-Parent) not in original scope — resolved as cosmetic-only, form always posts to the same endpoint (see plan). Redirect target simplified to `/` since `/admin`/`/dashboard` don't exist yet — `TODO(epic-2/3)` left at the call site in the page.
  - Verified: `pnpm format && pnpm lint && pnpm typecheck && pnpm build && pnpm test` all green (570/570 tests). Dev-server content check via curl + compiled-CSS grep confirmed all Tailwind classes (incl. arbitrary values `430px`/`34px`/`480px` and the `85`/`55`/`70` dynamic-scale sizes) generated real rules and both `sm`/`lg` media queries are present. **No screenshot tool available in this environment — visual pixel-parity at 375/768/1280px was not eyeballed in a real browser; recommend the user check `localhost:3000/login` directly before marking fully Done.**

## In progress
(none)

## Pending — fetched, not yet individually planned (27 screens remaining, grouped by epic)

### Epic 0 — Shell & primitives (prerequisite, no Banani screen)
- [x] Tailwind `@theme` tokens (Lavender SaaS palette) — `globals.css`
- [x] Primitives: `Button`, `Card`, `Field` — `src/components/ui/`
- [ ] `Badge` — not needed by Login after all, skipped (rule-of-three: build on first real consumer)
- [ ] Sidebar/Topbar × 2 (school shell, admin shell), Table, StatCard, Modal, Tabs — deferred to Epic 3 start (spec captured in `epic-0-shell.md`, not wired to a route yet — no consuming page existed this pass)

### Epic 2 — SaaS platform admin
- [ ] `saas-admin-dashboard` (`VZVQxm_1YTAi`) → `/admin`
- [ ] `admin-statistics` (`nSYPhOOZgccA`) → `/admin/statistics`
- [ ] `schools-management` (`72UpLW9LHCiI`) → `/admin/schools`
- [ ] `create-school` (`iAq5FwOgzwir`) → `/admin/schools/new`
- [ ] `subscription-plans` (`KM_nZ7xzMgAE`) → `/admin/billing/plans`
- [ ] `stripe-checkout` (`2Pl77h7xYQk2`) → route TBD (see OVERVIEW open question 3)

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
