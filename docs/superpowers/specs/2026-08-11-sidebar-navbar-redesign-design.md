# Sidebar & Navbar Redesign — Design Spec

Date: 2026-08-11
Status: Approved for planning

## Problem

`SchoolSidebar` and `AdminSidebar` render every section flat and fully expanded,
which is visually heavy once a section grows past 3-4 items. Neither sidebar
supports a collapsed/icon-only mode. `SchoolTopbar`/`AdminTopbar` have
non-functional search buttons and static breadcrumb maps that must be updated
by hand for every new route. This spec redesigns both sidebar/topbar pairs
into a shared, accordion-based, collapsible shell with a working command
palette, real notifications, and derived breadcrumbs.

## Scope

Both shells are in scope: the School shell (`(school)/layout.tsx`,
`SchoolSidebar`, `SchoolTopbar` — light theme, sections Principal/Pédagogie/
Configuration/Compte) and the Admin shell (`admin/layout.tsx`,
`AdminSidebar`, `AdminTopbar` — dark theme, sections Vue globale/Clients/
Facturation/Système).

Out of scope for this pass (confirmed with the user):
- **Global search**: UI + `⌘K`/`Ctrl+K` shortcut only. The command palette
  filters the existing sidebar nav items (client-side, no new API). No
  cross-entity Prisma search endpoint.
- **Academic year selector**: visual only. Renders a dropdown with a static
  list (no new API, no write endpoint, no wiring to `AcademicYear.isActive`).
- **Help button**: static popover with a couple of fixed links — no help
  content system.
- Notifications *creation*/preferences UI — only consuming the existing
  read/mark-read endpoints.

## Current state (as found)

- Menu data: `SECTIONS: NavSection[]` (`{ label, items: { label, href, icon }[] }`)
  hardcoded in each sidebar file — unchanged by this redesign.
- Active-route check: exact-match (`pathname === href`), so nested/dynamic
  routes (e.g. `/eleves/[id]`) never highlight anything. This is a real bug
  the redesign must fix (needed to auto-open the right accordion section on
  detail pages).
- Breadcrumbs: a `Record<pathname, label>` map per topbar file, single-level,
  manually kept in sync with the sidebar's route list.
- No accordion, tooltip, dropdown-menu, or command-palette primitives exist
  in the codebase (`frontend/src/components/ui/` has `ActionMenu`, `Avatar`,
  `Button`, `Card`, `Field`, `Modal`, `Select`, `Tabs` — none of those cover
  this). Pure Tailwind v4, `lucide-react` icons, no Radix/Framer Motion/cmdk
  installed yet.
- `/api/notifications/count` (GET, unread count) and `/api/notifications`
  (GET list w/ `unread`/`limit`/`cursor`, PATCH mark-read by `ids` or `'all'`)
  already exist server-side and are fully unused by the UI — the topbar bell
  is a static icon with a hardcoded dot.
- `useApi<T>(path)` (`frontend/src/lib/useApi.ts`) provides stale-while-
  revalidate fetching + a shared cache with `invalidateCache(Prefix)` — the
  pattern to reuse for the notifications dropdown, no new fetch abstraction.
- `Avatar` (`components/ui/Avatar.tsx`) renders deterministic-color initials
  from a `name` string — reusable for the sidebar user profile (pass
  `user.email`, matching the existing initials pattern in `AdminSidebar`).
- Both `(school)/layout.tsx` and `admin/layout.tsx` are `'use client'` and
  already lift a `drawerOpen` boolean for the mobile off-canvas drawer — the
  new desktop `collapsed` boolean follows the same lifting pattern.

## New dependencies

| Package | Use |
|---|---|
| `@radix-ui/react-accordion` | Sidebar section expand/collapse |
| `@radix-ui/react-tooltip` | Icon-only rail mode labels |
| `@radix-ui/react-dropdown-menu` | User profile menu, notifications list, academic-year selector |
| `@radix-ui/react-popover` | Help button |
| `framer-motion` | Chevron rotation, sidebar width transition |
| `cmdk` | `⌘K` command palette (client-side filter over nav items) |

All are additive; nothing existing is replaced. Radix primitives are
unstyled — visual styling stays Tailwind utility classes, consistent with
the rest of the codebase.

## Component architecture

New shared folders under `frontend/src/components/layout/`:

```
sidebar/
  Sidebar.tsx              — shell: props { sections, variant: 'light'|'dark',
                              collapsed, onToggleCollapse, footer, drawerOpen?,
                              onNavigate? }. Computes which section contains
                              the active route (via the shared route-match
                              helper) and passes it as the Accordion's
                              defaultValue.
  SidebarSection.tsx        — Radix Accordion.Item wrapper: header button
                              (label + chevron), Accordion.Content holding
                              the section's SidebarItems. In collapsed/rail
                              mode this renders as a plain icon stack (no
                              accordion chrome) instead.
  SidebarItem.tsx           — nav link row; accepts `collapsed` and wraps
                              itself in a Radix Tooltip (icon + label as
                              tooltip content) when true.
  SidebarUserProfile.tsx    — Avatar + email + role label + Radix
                              DropdownMenu ("Mon profil" → /settings or
                              /admin depending on shell, "Déconnexion" →
                              useAuth().logout()). Collapses to avatar-only
                              + Tooltip when the sidebar is collapsed.
  SidebarCollapseToggle.tsx — icon button (PanelLeftClose/PanelLeftOpen),
                              placed in the sidebar header row.
  useSidebarCollapse.ts     — `() => [collapsed, setCollapsed]`, persists to
                              `localStorage['ekolsuite:sidebar-collapsed']`,
                              defaults to false, guarded for SSR (reads in
                              a `useEffect`, so first paint is always
                              expanded — acceptable, no flash-prevention
                              script needed for v1).
  route-match.ts            — `isActiveRoute(pathname, href)` (startsWith-
                              based, boundary-safe: `/eleves` matches
                              `/eleves/123` but not `/eleves-archive`),
                              `findActiveItem(pathname, sections)`, and
                              `findActiveSection(pathname, sections)`. Pure
                              functions, unit-testable in isolation. See
                              "Breadcrumb / active-route logic" below for why
                              a single resolved "active item" (not
                              per-item independent checks) is required.

topbar/
  Breadcrumbs.tsx           — derives "Section › Item" from `sections` +
                              `pathname` via a shared `getBreadcrumbTrail`
                              util; falls back to a small residual
                              `extraLabels` map for sub-pages not in the
                              nav (e.g. `/eleves/[id]` → adds "Fiche élève").
  CommandPalette.tsx         — cmdk `<Command.Dialog>`, global keydown
                              listener for `⌘K`/`Ctrl+K`, flattens the
                              current shell's `sections` into a searchable
                              list, `router.push` + close on select.
  CommandPaletteTrigger.tsx  — the visible search-bar-shaped button in the
                              topbar showing the `⌘K` hint pill; opens the
                              same palette state.
  NotificationsMenu.tsx      — bell icon + real unread badge via
                              `useApi('/api/notifications/count')`; Radix
                              DropdownMenu/Popover body fetches
                              `/api/notifications?unread=true&limit=5` on
                              open, "Tout marquer comme lu" calls
                              `PATCH /api/notifications` with `{ids:'all'}`
                              and invalidates both cache entries.
  HelpMenu.tsx                — Radix Popover, static list of 2-3 links.
  AcademicYearSelector.tsx    — Radix DropdownMenu, static mock array
                              (e.g. `['2025-2026 (actuelle)', '2024-2025']`),
                              School topbar only — not rendered in Admin
                              (an admin manages many schools, no single
                              "current year" makes sense there).
```

`SchoolSidebar.tsx` / `AdminSidebar.tsx` keep their existing `SECTIONS`
constants unchanged and become thin wrappers around `<Sidebar variant=.../>`.
`AdminSidebar` additionally passes its "Retour à l'interface école" link as
part of `footer` (rendered above `SidebarUserProfile`). Same pattern for
`SchoolTopbar.tsx` / `AdminTopbar.tsx`, composing the shared `topbar/*`
pieces; `AdminTopbar` omits `AcademicYearSelector`.

## Layout integration

Both `layout.tsx` files add `const [collapsed, setCollapsed] =
useSidebarCollapse()` next to the existing `drawerOpen` state, pass
`collapsed`/`onToggleCollapse` to the desktop `<Sidebar>`, and the content
wrapper's left offset transitions via a Tailwind `transition-[margin]` class
driven by the same boolean (`ml-[240px]` ↔ `ml-[72px]` equivalents, matching
each shell's actual expanded width — 195px school / 220px admin — with a
shared 72px collapsed width). The mobile drawer is untouched: it always
renders the sidebar in its normal (non-collapsed) form, since `collapsed` is
a desktop-only concept and the drawer already has its own close affordance.

## Interaction & animation details

- **Accordion default-open**: `findActiveSection(pathname, sections)` picks
  the one section to open by default; Radix Accordion `type="single"
  collapsible` so opening one closes the previous (only one open at a time,
  as requested).
- **Chevron rotation**: `framer-motion`'s `animate={{ rotate: open ? 90 : 0 }}`
  on the chevron icon.
- **Accordion content height**: Radix's built-in `--radix-accordion-content-height`
  CSS var driving a CSS transition (no JS measurement needed, no
  layout-thrash) — Framer Motion is not used here, Radix's native mechanism
  is simpler and sufficient.
- **Sidebar collapse width**: `framer-motion`'s `animate={{ width }}` on the
  `<aside>` wrapper (240/220/195px ↔ 72px), ~200ms ease.
- **Tooltips**: Radix Tooltip, 300ms delay, only mounted/active when
  `collapsed` is true (avoids redundant tooltips on full labels).
- **Active item emphasis**: kept as background + text color swap (existing
  pattern: `bg-secondary text-primary` light / `bg-white/10 text-white`
  dark), now also gets a `border-l-2 border-primary` accent for stronger
  contrast against inactive items, per the "nettement en valeur" requirement.

## Breadcrumb / active-route logic (shared, testable)

```ts
// route-match.ts
export function isActiveRoute(pathname: string, href: string): boolean {
  const path = href.split('?')[0];
  if (path === '/dashboard' || path === '/admin') return pathname === path; // exact-only roots
  return pathname === path || pathname.startsWith(path + '/');
}

// Some hrefs are prefixes of others (e.g. '/admin/schools' vs
// '/admin/schools/new'), so a naive per-item isActiveRoute check would
// highlight both simultaneously. Resolve to a single "most specific" match
// — the candidate with the longest href — once per render, and have every
// consumer (sidebar highlighting, accordion default-open, breadcrumbs)
// compare against that single resolved item instead of re-deriving it.
export function findActiveItem(pathname: string, sections: NavSection[]): NavItem | null {
  const candidates = sections
    .flatMap((s) => s.items)
    .filter((item) => isActiveRoute(pathname, item.href));
  return candidates.sort((a, b) => b.href.length - a.href.length)[0] ?? null;
}

export function findActiveSection(pathname: string, sections: NavSection[]): string | null {
  const active = findActiveItem(pathname, sections);
  if (!active) return null;
  return sections.find((s) => s.items.includes(active))?.label ?? null;
}
```

`Sidebar.tsx` calls `findActiveItem` once and passes the resolved
`activeHref` down; `SidebarItem` highlights itself via `item.href ===
activeHref` (plain equality against the already-resolved item), not a
second independent `isActiveRoute` call — this is what avoids the
double-highlight case above.

`getBreadcrumbTrail(pathname, sections, extraLabels)` calls the same
`findActiveItem` to get `[sectionLabel, itemLabel]`, then appends any
`extraLabels[pathname]` entry as a third crumb (e.g. `/eleves/[id]` →
"Fiche élève"). This removes the need to hand-maintain a full
pathname→label map per page while still allowing detail-page crumbs.

## Notifications wiring detail

- Badge: `const { data } = useApi<{count:number}>('/api/notifications/count')`.
- Dropdown list: fetched lazily via `useApi` on first open (Radix
  DropdownMenu `onOpenChange`), `useApi('/api/notifications?unread=true&limit=5', {skip: !open})`.
  Not real-time/polling in this pass — refreshes on open and after mark-read
  (`refresh()` from the hook + `invalidateCache('/api/notifications/count')`).
- Clicking a single notification: `PATCH` with `{ids:[id]}`, then navigate if
  the notification has a relevant deep link in `data` (best-effort — if
  absent, just marks read).

## Testing

- Unit tests (Vitest) for the two pure functions in `route-match.ts` and
  `getBreadcrumbTrail` — these carry real logic (boundary matching, fallback
  precedence) and are cheap to test in isolation, consistent with the
  project's existing unit-test-only strategy (no component test harness in
  this starter).
- No new integration/e2e tests — matches existing project convention
  (integration tests are deferred per `CLAUDE.md`).
- Manual verification: `pnpm dev`, click through both shells — expand/
  collapse rail, accordion open/close, tooltip on hover in rail mode, ⌘K
  palette open/filter/navigate, notifications badge/list/mark-read against
  real seeded data, breadcrumbs on a top-level page and a `/eleves/[id]`
  detail page, mobile drawer still works unchanged.

## Non-goals / explicitly deferred

- Server-side search endpoint.
- Real academic-year switching + its downstream effects on year-scoped data.
- Notification preferences/creation UI.
- Persisting accordion open/close state beyond "active section defaults
  open" (no localStorage for individual section state — only the
  collapsed/expanded *rail* state persists).
