# School Settings v2 (Notifications + Zone dangereuse + Mon profil) — Banani → Next.js 16

## Source
- Banani screen ID: `J-YtPdRZUsjN` ("School Settings") — re-fetched 2026-08-14, flow "Separate Screen Regen"
- Content unchanged from the original 2026-08-11 capture (same single long-scroll export). This pass completes what `school-settings.md` (V1) deliberately deferred: Mon profil's profile-info card, Notifications tab, Zone dangereuse (built for real this time, per user confirmation), plus a few smaller fidelity gaps (logo/avatar upload wiring, per-term edit, grading-scale edit, "Type d'établissement" statut field).

## Decisions confirmed with user (batched question, 2026-08-14)
1. **Tabs**: keep the 4 existing (Profil / Établissement / Année scolaire / Administrateurs) and add a 5th — **Notifications**. Sécurité stays out (no 2FA/session infra, unchanged from V1). Banani's own tab bar (Établissement/Mon profil/Notifications/Sécurité) is NOT reproduced 1:1 — deliberate, to avoid regressing Année scolaire/Administrateurs as real working tabs.
2. **Zone dangereuse**: build all 3 actions for real (Export, Réinitialiser l'année, Supprimer l'école) — not stubs. Highest-risk part of this pass; see safeguards below.

## Code-evidenced findings (resolve remaining ambiguity without asking)
- **"Directeur / Directrice"** in Banani's École Info card — NOT a new field. `AdministrateursTab.tsx` already labels the org `OWNER` role as "Directeur / Directrice" (`ROLE_LABEL.OWNER`). Display = the OWNER member's `name`, read-only, sourced from the existing `members` list already returned by `GET /api/school`. No schema change.
- **"Niveaux d'enseignement"** — already IS `School.schoolType` (Create School's own `schoolTypes` list is level-based: "École primaire", "École primaire & secondaire", etc.) — already built, already wired, no change.
- **"Type d'établissement"** (Banani shows "École privée laïque" — a statut, not a level) — this is a genuinely new axis, not covered by `schoolType`. New optional `School.statute` field (free text, same treatment as `schoolType`).
- **Notifications are per-user, not per-school**: `NotificationPreferences.prefs` (`Json`, keyed `{eventType: {email, inApp}}`) is on `User`, confirmed via schema. Fits Banani's card ("vos" preferences) — Marjorie's toggles are hers, not the org's.
- **Nothing currently reads `NotificationPreferences`** (confirmed: zero references outside the model definition, and `outbox/types.ts` has only `payment.*`/`email.verification_code`/`email.password_reset` event kinds — no `bulletin.generated`/`attendance.unexcused_absence`/etc. exist). Toggles will be **really persisted** (a genuine setting, not fake UI) but **honestly not yet consumed** by any dispatcher — same "flagged, not silently faked" precedent as Épic 4/6's other honest gaps. Will say so plainly in the tab's own copy, not hide it.
- **Logo/avatar upload**: `ImageUploader` (generic, `label/hint/value/onChange`) already exists and is wired for the bulletin template's logo/signature — reusable as-is for both École logo (`School.logoUrl`, already in `PUT /api/school`'s zod schema) and Mon profil's avatar (`User.avatarUrl` — needs a new `PATCH /api/auth/me`, doesn't exist yet; CLAUDE.md itself flags this as a documented future gap).
- **"Rôle" field on Mon profil**: read-only display of the caller's own org role via the same `ROLE_LABEL` map — no new concept.
- **No zip library in `package.json`** — adding `archiver` (streaming, standard, serverless-safe) for the real data export. Flagging this dependency add explicitly rather than silently doing it.
- **`User.phone`**: doesn't exist. New optional field, same precedent as `School.officialCode`/`officialEmail`/`website` being added when Banani showed a real field Create School's owner form didn't need.

## Zone dangereuse — safety design (since this is being built for real)
All 3 gated to org role **OWNER** exactly (`hasMinRole(mySchool.role, 'OWNER')`), not just ADMIN — matches "Directeur/Directrice" being the only one Banani's mock shows this section to conceptually.
1. **Exporter toutes les données** (`GET /api/school/export`) — read-only, not destructive. Streams a ZIP: `school.json`, `students.json` (+ guardians + enrollments), `teachers.json`, `classes.json`, `subjects.json`, `class-subjects.json`, `evaluations.json`, `grades.json`, `attendance.json`, `appreciations.json`, `bulletin-templates.json` (school's own forks only) — everything scoped to `mySchool.schoolId`/`organizationId`. No confirmation needed (safe, read-only).
2. **Réinitialiser l'année scolaire** (`POST /api/school/reset-year`) — deletes `Grade`+`Evaluation`+`Attendance`+`Appreciation`+`Goal` rows scoped to the **active** `AcademicYear`'s terms/enrollments only. Students/Teachers/Classes/Subjects/ClassSubject/the AcademicYear+Terms themselves are kept (matches Banani's own description verbatim: "Les élèves et enseignants seront conservés"). Requires body `{ confirmName: string }` matching the school's exact current name (server-side re-check, not just client-side), inside one `$transaction`. Logs an `AdminAction` row (`action: 'school.reset_year'`, `actorId` = the OWNER, `targetType: 'School'`) for an audit trail even though this isn't the platform back-office — the existing `AdminAction` table has no restriction to platform staff, and it's the only audit mechanism in the codebase.
3. **Supprimer le compte de l'établissement** (`DELETE /api/school`) — deletes the `Organization` row (cascades `School` → every school-scoped model, and `OrganizationMember` rows, per `schema.prisma`'s existing `onDelete: Cascade` chain — same mechanism verified live during this session's security audit when cleaning up a test account). Does **not** delete the `User` row itself (`Organization.ownerId` is `onDelete: Restrict` — deleting the org, not the owner, is exactly what's wanted; the owner keeps their account, just loses school access). Requires `{ confirmName: string }` matching the school's exact current name, server-side re-checked. Logs an `AdminAction` row **before** the transaction commits (can't log against a row that no longer exists after). Response clears auth cookies (`clearAuthCookies`/`clearCsrfCookie`, same helpers `/api/auth/logout` uses) since the caller has nothing left to manage — frontend redirects to `/login` with a toast.
- **Both destructive routes**: CSRF-gated, `requireAuth`, OWNER-only, transactional, rate-limited via the existing `enforceAdminRateLimit`-style per-user limiter (repurposed, not admin-only despite the name — or a small dedicated limiter if that one assumes app-role ADMIN; will check at implementation time and use whichever is correctly scoped).
- **Frontend confirmation UX**: a `Modal` (existing primitive) per action, title = the action, body = the exact Banani warning copy, a `Field` requiring the user to type the school's current name verbatim before the destructive button enables (classic type-to-confirm, same weight as GitHub repo deletion) — not a plain `window.confirm()` (too easy to blow through for something this size, unlike the existing single-row deletes elsewhere in the app).

## Component breakdown
- **NEW** `Switch` (`src/components/ui/Switch.tsx`) — pill toggle, Banani's `.toggle-switch`/`.toggle-knob` pattern (primary when on, muted when off). First real consumer: Notifications tab.
- **NEW** `NotificationsTab.tsx` — 5 toggles (Bulletins générés / Absences non justifiées / Rappel de renouvellement / Activité des enseignants / Résumé hebdomadaire), `GET/PUT /api/notifications/preferences`.
- **NEW** `ZoneDangereuseCard` (or inline in `EtablissementTab`/own tab section) + 3 confirmation `Modal`s.
- **EXTEND** `ProfilTab.tsx` — new profile-info card above the existing password card (avatar upload, name, email read-only, phone, role read-only) — `PATCH /api/auth/me`.
- **EXTEND** `EtablissementTab.tsx` — wire the existing disabled-looking logo dropzone to `ImageUploader`, add `statute` field, add read-only "Directeur / Directrice" (from `members`).
- **EXTEND** `AnneeScolaireTab.tsx` — per-term pencil-edit (`PATCH /api/school/terms/[id]`, doesn't exist yet), editable "Système de notation" (`gradingScale` — currently write-once via nothing; needs `PATCH` on the AcademicYear, or fold into `PUT /api/school` — will scope at implementation).
- **REUSE** `Card`, `Field`, `Button`, `Modal`, `ImageUploader`, `PhoneInput`.

## Token mapping
Standard tokens, no new colors. Destructive buttons use existing `destructive`/`destructive-foreground` tokens (already used elsewhere, e.g. delete-student confirms).

## Responsive plan
- **375px**: Notifications toggles stack full-width, label+toggle same row (toggle stays right-aligned, ≥44px hit target). Zone dangereuse's danger-item rows stack label/desc above the button on narrow screens (button becomes full-width) rather than Banani's fixed side-by-side (which would overflow at 375px). Mon profil's avatar+upload-button row stacks below ~400px.
- **sm/md**: 2-column form rows resume as already built elsewhere in this page.
- **lg**: matches Banani's card layout as captured.

## Implementation checklist
- [x] Migration: `User.phone String?`, `School.statute String?`
- [x] `PATCH /api/auth/me` (name/phone/avatarUrl)
- [x] Notifications preferences — found already built as `GET/PATCH /api/notifications/prefs` (NOTIF-04), wired `NotificationsTab.tsx` to it instead of building a new `/api/notifications/preferences`
- [x] `PATCH /api/school/terms/[id]`; grading-scale write path (`PATCH /api/school/academic-year`)
- [x] `GET /api/school/export` (archiver ZIP — v8's `new ZipArchive()` API, not the old factory call)
- [x] `POST /api/school/reset-year` (transactional, confirm-name, AdminAction log)
- [x] `DELETE /api/school` (transactional, confirm-name, AdminAction log, clears cookies)
- [x] `Switch` primitive
- [x] Wire logo (Établissement) + avatar (Profil) via `ImageUploader`
- [x] `NotificationsTab.tsx`, add to `TABS`
- [x] Zone dangereuse UI + 3 confirmation modals
- [x] 375 / 640 / 1024 checks
- [x] Restart dev server after migration before testing
- [x] `pnpm format && lint && typecheck && build && test` all green (634/634); real authenticated E2E via Puppeteer against a disposable throwaway school (real reset-year, real school-delete verified via raw fetch, notification toggle, profile update, screenshots at all 3 breakpoints)

## Open questions for user
None blocking — the two real forks were resolved via the batched question. Remaining calls (statute as new field, archiver dependency, AdminAction reuse for org-self-service audit) are stated above as evidenced decisions, flagged for veto rather than blocking.
