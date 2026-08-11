# School Settings / Paramètres — Banani → Next.js 16

## Source
- Banani screen IDs: `J-YtPdRZUsjN` ("School Settings") + `o2cW8OmWvqhD` ("Paramètres")
- Fetched: 2026-08-11

## Confirmed: one screen (decision #5)
Both exports share the breadcrumb "Compte › Paramètres" and the same left-nav tab list (Profil / Sécurité / Établissement / Année scolaire / Administrateurs / Système). Each export just froze a different scroll position of one long page — "Paramètres" shows the **Sécurité** section content (password change, 2FA setup, active sessions, security log), "School Settings" shows **Établissement + Année scolaire + Mon profil + Notifications + Zone dangereuse** all stacked. Same conclusion as Create School: Banani renders one static long page per concept, not a real interactive tab switcher — the "tabs" are anchor-scroll nav, not show/hide panels. This build makes them **real tabs** (client-side state, one panel visible at a time) since that's cheaper to build correctly than a giant scrolling page and matches the left-nav's obvious intent.

## Route migration — replaces the starter's existing `/settings`
The repo ships a generic `/settings` page (`examples`-adjacent scaffold, password change + Google-link, gated by plain `useUser()`). This screen **replaces it**: `/settings` becomes the school-shell-wrapped, tabbed page below. The existing password-change/Google-link logic isn't deleted — it moves into the new **Profil** tab verbatim (same API calls, same components, different container). Gating changes from `useUser()` (any logged-in user) to a new `useSchoolUser()` (must have an `OrganizationMember` row) — accounts with no school membership (e.g. plain `USER` test accounts) get redirected to `/`, same pattern as `useAdminUser()`. This is a deliberate product decision, not an oversight: every real persona in EkolPlus is either school staff (this page) or platform staff (`/admin`) — a schoolless plain user isn't a real target persona here.

**"My school" resolution**: a person can theoretically staff more than one school (Create School's owner-dedup logic already allows this). V1 picks the **first** `OrganizationMember` row (by `createdAt`) as "their school" — no school switcher yet. Documented limitation, not silently assumed.

## V1 scope decision
Four tabs built with real backend wiring. Two tabs' content — and the danger-zone block — explicitly **not** built this pass:

| Tab | V1 | Reason |
|---|---|---|
| **Établissement** | ✅ Built | School profile fields — extends the `School` model from Create School with 3 new fields (`officialCode`, `officialEmail`, `website`). Logo upload stays a disabled-looking placeholder (same reason as Create School — no attach target wired). |
| **Année scolaire** | ✅ Built | New `AcademicYear` + `Term` models — this *is* the reason Epic 3 was sequenced before Epic 4 (everything year-scoped in the v2 architecture needs this to exist first). "Nouvelle période" adds a `Term`; the active `AcademicYear` auto-creates on first term add if none exists yet. Term status (Terminé/En cours/À venir) computed from dates vs. today, not stored — avoids a stale-status sync bug. |
| **Administrateurs** | ✅ Built, read-only | Lists current `OrganizationMember`s. Add/remove is an invite flow — a real feature, not a checkbox; deferred. |
| **Profil** | ✅ Built (migrated) | The existing `/settings` page's password-change / set-password / Google-link content, moved here as-is. |
| **Sécurité** | ❌ Not built | 2FA, active-sessions list, security event log — **none of this backend exists** (no TOTP infra, no session-tracking table beyond the single refresh-token cookie, no security-event log model). Building UI for infrastructure that doesn't exist would be pure mockup, not a feature. Real security controls (change password) already live in **Profil** — this tab's actual substance is a distinct, larger project. |
| **Notifications** | ❌ Not built | `NotificationPreferences.prefs` (generic JSON) already exists in the schema and could technically hold these toggles cheaply — flagged as a cheap near-term follow-up, not done this pass to keep scope bounded. |
| **Système** | ❌ Not built | Banani's export didn't actually show this tab's content (empty in both exports) — nothing to translate yet. |
| **Zone dangereuse** (export data / reset year / delete school) | ❌ Not built | Three irreversible, high-blast-radius operations. Building "delete school" or "wipe all grades" quickly, without their own careful design (confirmation flow, audit trail, what "export" even contains), is exactly the kind of thing that shouldn't be rushed. Flagged, not silently dropped. |

## System answers (Step 0)
1. **Route**: `/settings`, inside the (new) school shell, gated by `useSchoolUser()`.
2. **Data read**: new `GET /api/school` — resolves the caller's `OrganizationMember` → `Organization` → `School`, returns `{ school, academicYear: (with nested terms) | null, members }` in one call so all tabs hydrate together.
3. **Data written**: `PUT /api/school` (Établissement tab), `POST /api/school/terms` (Année scolaire tab). Profil tab reuses existing `/api/auth/{change-password,set-password}` + Google OAuth link, untouched.
4. **Auth gate**: `requireOrgRole` needs an explicit `organizationId`, which isn't known ahead of time here (resolved server-side from the caller's membership) — so these two routes authenticate via `requireAuth` + a new small helper `resolveMySchool(userId)` in `src/lib/server/school.ts`, rather than forcing `requireOrgRole`'s URL-param shape onto a "my own school" endpoint. Role check (must be `ADMIN`+ within that org to write) still applies, just computed inline.
5. **Navigation**: none — single page, tab state is local (`useState`, not URL-synced — acceptable for V1, revisit if deep-linking to a specific tab becomes a real need).
6. **Empty/loading/error**: `academicYear: null` (brand-new school, exactly "École Les Étoiles" right now) renders an explicit "Aucune année scolaire configurée — crée la première période" empty state, not a blank section.

## Component breakdown
- **NEW** School shell: `SchoolSidebar`/`SchoolTopbar` (`src/components/layout/`) + `src/app/(school)/layout.tsx` — the light-sidebar variant spec'd in `epic-0-shell.md`, first real consumer. Uses a route group `(school)` (not a `/school` URL segment) so `/settings`, and later `/dashboard`, `/eleves`, etc. all nest under it without an extra path segment.
- **REUSE** `Card`, `Field`, `Select`, `Button` (Epic 0/2)
- **NEW** `Tabs` primitive (`src/components/ui/Tabs.tsx`) — first real multi-tab consumer (Login's role-tabs were a one-off, page-local; this is the rule-of-three trigger to extract it properly)
- **MIGRATED** the existing `/settings` page's password/Google-link JSX becomes the **Profil** tab's content, same logic

## Token mapping
Standard tokens. No new colors needed.

## Responsive plan
- **Base (375px)**: tabs become a horizontally-scrollable pill row (not a sidebar-style vertical tab list — Banani's own left-nav-as-tabs pattern doesn't fit a phone width). Each tab's content stacks single-column.
- **sm (640px)**: two-column field grids start where the source shows them (e.g. Nom/Code side by side).
- **lg (1024px+)**: school shell sidebar persistent, matches `epic-0-shell.md`'s shared plan.
- Touch targets ≥48px, including tab pills.

## Implementation checklist
- [ ] `AcademicYear` + `Term` Prisma models + migration; `School` gains `officialCode`/`officialEmail`/`website`
- [ ] `src/lib/server/school.ts` — `resolveMySchool(userId)` helper
- [ ] `GET /api/school`, `PUT /api/school`, `POST /api/school/terms`
- [ ] `Tabs` primitive
- [ ] `SchoolSidebar`/`SchoolTopbar` + `src/app/(school)/layout.tsx`
- [ ] `useSchoolUser()` hook in `AuthContext.tsx`
- [ ] `/settings` page rebuilt with 4 tabs (Profil migrated, 3 new); old standalone page content removed, not duplicated
- [ ] 375px / 640px / 1024px checks, touch targets
- [ ] **Restart the dev server before testing** (Prisma Client staleness bit us on Create School — see STATUS.md)
- [ ] `pnpm format && pnpm lint && pnpm typecheck && pnpm build && pnpm test`, real authenticated end-to-end check (not just build-green) via curl or browser
