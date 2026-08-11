# Epic 0 — Shell & primitives — Banani → Next.js 16 / Tailwind v4

## Source
- Banani screens referenced: School Dashboard (`R94lpPCRDLa8`), SaaS Admin Dashboard (`VZVQxm_1YTAi`), Login Page (`bWrGcKSGTeFc`)
- Fetched: 2026-08-11

## Scope of this pass
Built now (consumed by Login, fully routable/verifiable): Tailwind `@theme` tokens, `Button`, `Card`, `Field`, `Badge`.
Deferred to Epic 3 start (spec captured below so it isn't re-fetched, but not wired to a route yet — no consuming page exists this pass, and an unrouted layout can't be verified in the dev server): `Sidebar`, `Topbar`, `(school)` and `(admin)` route-group layouts.

## Token mapping (Banani → Tailwind `@theme`)

Identical `:root` tokens across all 28 screens (confirmed by diffing Login/School Dashboard/SaaS Admin Dashboard):

| Banani token | Value | Tailwind `@theme` name |
|---|---|---|
| `--background` | `#f3f3f7` | `--color-background` |
| `--foreground` | `#1a1a2e` | `--color-foreground` |
| `--border` | `#e2e2ee` | `--color-border` |
| `--input` | `#ffffff` | `--color-input` |
| `--primary` | `#6c2bd9` | `--color-primary` |
| `--primary-foreground` | `#ffffff` | `--color-primary-foreground` |
| `--secondary` | `#ede9fb` | `--color-secondary` |
| `--secondary-foreground` | `#6c2bd9` | `--color-secondary-foreground` |
| `--muted` | `#ececf3` | `--color-muted` |
| `--muted-foreground` | `#8884a0` | `--color-muted-foreground` |
| `--success` | `#e6f9f0` | `--color-success` |
| `--success-foreground` | `#1a9e5c` | `--color-success-foreground` |
| `--accent` | `#7c3aed` | `--color-accent` |
| `--accent-foreground` | `#ffffff` | `--color-accent-foreground` |
| `--destructive` | `#fdecea` | `--color-destructive` |
| `--destructive-foreground` | `#d93025` | `--color-destructive-foreground` |
| `--warning` | `#fff8e1` | `--color-warning` |
| `--warning-foreground` | `#f59e0b` | `--color-warning-foreground` |
| `--card` | `#ffffff` | `--color-card` |
| `--card-foreground` | `#1a1a2e` | `--color-card-foreground` |
| `--sidebar` | `#16102e` (dark shells) / `#ffffff` (school shell) | `--color-sidebar-dark` / `--color-sidebar-light` — two tokens, shells pick per variant |
| `--sidebar-foreground` | `#e8e3f7` / `#1a1a2e` | same split |
| `--radius-sm/md/lg/xl` | `4/6/8/12px` | `--radius-sm/md/lg/xl` |
| font | Inter | already wired via `next/font/google` in `layout.tsx` |

Note: `--sidebar` differs between the School shell (white, `#ffffff`) and the two dark shells (Login left panel, SaaS Admin sidebar, `#16102e`) — not a single reusable token, kept as two named tokens.

## Primitives built this pass

- **PRIMITIVE** `Button` (`src/components/ui/Button.tsx`) — variants `primary` (solid `--primary`) / `ghost` (transparent, `--muted-foreground` text). Axes match what Login actually uses (one filled CTA); no size prop yet — add only when a second size appears in a real screen.
- **PRIMITIVE** `Card` (`src/components/ui/Card.tsx`) — white surface, `--radius-xl`, `1px solid --border`. Matches `.login-card` shape and every dashboard card CSS seen so far (`--card`, `--radius-lg`/`xl`).
- **PRIMITIVE** `Field` (`src/components/ui/Field.tsx`) — label + input wrapper matching `.form-group`/`.form-input-wrap` (icon slot, focus ring `box-shadow: 0 0 0 3px rgba(108,43,217,0.1)`).
- **PRIMITIVE** `Badge` (`src/components/ui/Badge.tsx`) — small pill, matches `.school-badge`/`.admin-sidebar-logo-badge` shape (used later by Schools Management status pills etc.) — built now since Login's security-note row uses the same pill shape for the shield icon chip pattern. *(If Login ends up not needing a distinct pill, skip and build on first real consumer instead — verify during implementation.)*

## Sidebar/Topbar spec (captured for Epic 3, not built this pass)

### School shell sidebar (`.sidebar`, 195px, white bg, border-right)
Sections, in order:
- **Principal**: Tableau de bord (`layout-dashboard`), Élèves (`users`), Enseignants (`user-check`)
- **Pédagogie**: Carnet de notes (`notebook-pen`), Présences (`calendar-check`), Bulletins (`file-text`), Appréciations (`star`)
- **Configuration**: Classes (`school`), Matières (`book-open`), Affectations (`link`), Coefficients (`percent`), Modèle de bulletin (`layout-template`)
- **Compte**: Abonnement (`credit-card`), Paramètres (`settings`)
- Footer: user avatar + name + role label ("Marjorie Etienne" / "Administratrice") + badge

### SaaS admin shell sidebar (`.admin-sidebar`, 220px, dark `#16102e` bg)
Sections, in order:
- **Vue globale**: Tableau de bord (`layout-dashboard`), Statistiques (`activity`)
- **Clients**: Écoles (`school`), Créer une école (`user-plus`), Utilisateurs (`users`)
- **Facturation**: Abonnements (`credit-card`), Transactions (`receipt`), Coupons (`tag`)
- **Système**: Modèles de bulletin (`layout-template`), Paramètres système (`settings`)
- Footer: "Retour à l'interface école" link (`arrow-left`) + user avatar/name/role ("Thomas Leclair" / "Propriétaire SaaS")

### Shared Topbar pattern (both shells)
Breadcrumb (left) + search box + notification bell (with dot) + help icon (school only) + user menu button (right). 52px height, `--card` background, border-bottom.

### Icon mapping
All icons are `lucide:*` via Banani's `iconify-icon` web component → map 1:1 to `lucide-react` (not yet in `package.json`, add on Epic 3 start: `pnpm --filter frontend add lucide-react`).

## Responsive plan (applies once Sidebar/Topbar are built in Epic 3)
- **Base (375px)**: sidebar collapses to an off-canvas drawer (hamburger in topbar), full-width content, stacked stat cards.
- **md (768px+)**: sidebar becomes a persistent icon-only rail OR stays off-canvas — decide against the actual dashboard content when Epic 3 starts (Banani only shipped the 1280px desktop mockup, per project convention we design the mobile/tablet states ourselves).
- **lg (1024px+)**: full sidebar as shipped by Banani (195px/220px fixed width).

## Implementation checklist (this pass)
- [x] Tailwind `@theme` tokens in `globals.css`
- [x] `Button`, `Card`, `Field` primitives
- [x] `Badge` — turned out not needed (Login's security note used a plain flex row, not a pill). Skipped per rule-of-three; build on first real consumer (likely Schools Management status pills, Epic 2).
- [x] Login page (see `login-page.md`)
- [ ] Sidebar/Topbar — deferred to Epic 3, spec above is ready to consume
