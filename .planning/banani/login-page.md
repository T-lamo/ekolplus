# Login Page — Banani → Next.js 16

## Source
- Banani screen ID: `bWrGcKSGTeFc`
- Fetched: 2026-08-11

## System answers (Step 0, before coding)
1. **Route**: `/login`, public (unauthenticated).
2. **Data written**: `POST /api/auth/login` with `{ email, password }` — existing route, issues access/refresh/CSRF cookies on success (`frontend/src/app/api/auth/login/route.ts`).
3. **Navigation**: success → redirect based on role/membership (see below). Failure → inline error under the form (existing `ApiError.code` pattern, mirrors `examples/frontend-pages/login.tsx`).
4. **Reused components**: `Card`, `Field`, `Button` (Epic 0). `AuthContext.refresh()` after login to populate `useAuth()`.
5. **Empty/loading/error states**: submit button shows a loading label while in flight; inline red text under the form on `ApiError`; rate-limit (`TOO_MANY_LOGIN_ATTEMPTS`) gets its own message.

## Discovery — role tabs not in original scope

The Banani export has **3 role tabs** (Administrateur / Enseignant / Élève-Parent) that weren't anticipated in `OVERVIEW.md`'s epic breakdown — no student/parent-facing screens exist among the 28 selected, and decision #6 already ruled out teacher logins for v1.

**Resolution taken** (cheap, reversible, flagged here rather than re-blocking on a question): implement all 3 tabs visually for pixel fidelity, but they're purely a cosmetic pre-selector — the form always posts to the same `/api/auth/login`.

**Redirect target — simplified further during implementation.** The original plan branched on role (`ADMIN`/`SUPERADMIN` → `/admin`, has `OrganizationMember` → `/dashboard`). Neither `/admin` nor `/dashboard` exist yet (Epic 2/3, not built this pass) — redirecting to them today would 404. Shipping a role-branch that points at dead routes is a half-finished implementation, not a complete one. **Actual behavior this pass: redirect to `/` unconditionally on success** (the existing homepage). The role-branch logic is left as a `// TODO(epic-2/3)` comment at the exact call site in `src/app/login/page.tsx` so it's a one-line change once `/admin` and `/dashboard` land — not re-derived from scratch. `/api/auth/me`'s `select` also doesn't return `role` yet; that's the other half of this TODO (add `role: true` to the select when the redirect branch gets built).

## Component breakdown
- **REUSE** `Card` — the white login card container.
- **REUSE** `Field` — email input, password input (with show/hide toggle — new small bit of local state, not worth its own primitive yet).
- **REUSE** `Button` — submit CTA.
- **NEW, page-local** role-tab segmented control — kept inline in the page component, not extracted to `src/components/ui/` yet (single consumer, revisit at rule-of-three if a second segmented-control use appears).

## Token mapping
Standard Epic 0 tokens (see `epic-0-shell.md`). Left panel uses the dark sidebar token (`#16102e`) even though this screen isn't inside the shell — it's login-specific branding, kept local to the page.

## Responsive plan (mandatory, Banani only shipped one 1280px mockup)
- **Base (375px)**: single column. Left branding panel collapses to a short header band (logo + one-line tagline) above the form, not a 480px side panel — no room for it on a phone. Feature list and decorative blobs drop entirely on mobile (decoration, not content).
- **sm (640px)**: same as base, more breathing room.
- **md (768px)**: still stacked (branding band + form) — the two-column split needs real width to not feel cramped; starting the side-by-side layout at `lg` instead.
- **lg (1024px+)**: full two-column split as shipped by Banani — 480px dark panel + centered card on the right.
- Touch targets: role tabs and the show/hide password icon both need ≥48px hit area on mobile even though the visual glyph is smaller (padding, not just icon size).

## Interactions / state
- Password field: show/hide toggle (local `useState`).
- Role tabs: local `useState`, purely presentational per Discovery above.
- Focus states: `--primary` ring on inputs (`box-shadow: 0 0 0 3px rgba(108,43,217,0.1)`), visible keyboard focus on all interactive elements.
- Submit disabled + loading label while request in flight.

## Copy / i18n
All strings already in French from the Banani export — carry them verbatim into `src/lib/constants.ts` (new `AUTH_LOGIN` keys) rather than inlining, matching the project's i18n convention.

## Implementation checklist
- [x] `Button`, `Card`, `Field` primitives (Epic 0)
- [ ] Build `/login` page — mobile-first
- [ ] Wire to `POST /api/auth/login` via `api()` from `@/lib/api`
- [ ] 375px check — branding collapses to header band, form full-width, no horizontal scroll
- [ ] 768px check
- [ ] 1280px check — matches Banani two-column split pixel-for-pixel
- [ ] Touch targets ≥48px on mobile (role tabs, show/hide icon)
- [ ] Empty/loading/error states implemented (loading CTA, inline error, rate-limit message)
- [ ] Keyboard nav + focus rings OK
- [ ] `pnpm lint && pnpm typecheck && pnpm build`, dev server visual check at 375/768/1280
