# Sidebar & Navbar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat, always-expanded School and Admin sidebars with a shared, accordion-based, collapsible-to-icon-rail sidebar shell, and upgrade both topbars with a working `⌘K` command palette, real notification wiring, and breadcrumbs derived from the nav data instead of a hand-maintained map.

**Architecture:** Extract two shared component families — `components/layout/sidebar/*` and `components/layout/topbar/*` — consumed by thin per-shell wrapper files (`SchoolSidebar.tsx`, `AdminSidebar.tsx`, `SchoolTopbar.tsx`, `AdminTopbar.tsx`) that only supply shell-specific data (nav sections, colors, copy). Two small pure functions (`route-match.ts`, `breadcrumb.ts`) carry the route-matching logic and are unit-tested; everything else is UI composition verified via typecheck + manual browser check (no component-test harness exists in this repo).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict (`exactOptionalPropertyTypes`), Tailwind v4, `lucide-react` (already installed) + newly added `@radix-ui/react-accordion`, `@radix-ui/react-tooltip`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-popover`, `framer-motion`, `cmdk`.

## Global Constraints

- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` — never silence with `any`. Optional callback props that get forwarded without a default (`onNavigate`, `onToggleCollapse`) must be typed `?: (() => void) | undefined` at every layer they pass through, per this repo's `exactOptionalPropertyTypes` setting.
- Pre-commit gate, every task: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` must all pass before committing.
- Conventional Commits, `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` trailer.
- Never fabricate real-looking external URLs (support emails, help-center domains) — where the spec calls for "static links" and no real target exists, use static informational content instead (applies to `HelpMenu`).
- Do not modify `frontend/src/lib/api.ts`, `frontend/src/contexts/AuthContext.tsx`, or anything else on CLAUDE.md's protected list — only consume their exported `api()` / `useAuth()` / `useApi()` surfaces.
- `api(path, { method, body })` takes `body` as a **raw object**, not a pre-stringified JSON string — it calls `JSON.stringify` internally (`frontend/src/lib/api.ts:161`).
- `useApi<T>(path, { skip })` (`frontend/src/lib/useApi.ts`) is the existing stale-while-revalidate fetch hook — reuse it, don't build a new one.
- No new backend routes in this plan — search, academic-year switching, and help content stay UI-only per the spec's non-goals.
- French UI copy throughout, matching the existing app.
- Vitest only discovers `src/**/*.test.ts` / `scripts/**/*.test.ts` (not `.tsx`), environment `node`, no DOM — so only the two pure-function modules get automated tests; every UI component task is verified via `tsc --noEmit` + manual browser check, never a fabricated component test.

---

## Task 1: Install new dependencies

**Files:**
- Modify: `frontend/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `@radix-ui/react-accordion`, `@radix-ui/react-tooltip`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-popover`, `framer-motion`, `cmdk` available as imports for every later task.

- [ ] **Step 1: Install the packages**

Run from repo root:
```bash
pnpm --filter frontend add @radix-ui/react-accordion @radix-ui/react-tooltip @radix-ui/react-dropdown-menu @radix-ui/react-popover framer-motion cmdk
```

- [ ] **Step 2: Verify the install**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS (no source changes yet, just confirms the install didn't break anything).

Run: `cat frontend/package.json | grep -E "radix|framer-motion|cmdk"`
Expected: all six packages listed under `dependencies`.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
chore(banani): add Radix UI, Framer Motion, cmdk for sidebar/navbar redesign

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Accordion + command-palette CSS

**Files:**
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- Produces: `.accordion-content` class (used by Task 8's `SidebarSection.tsx`) and the `[cmdk-overlay]` selector (used by Task 15's `CommandPalette.tsx`).

- [ ] **Step 1: Append the CSS block**

Add at the end of `frontend/src/app/globals.css`:

```css

/* Radix Accordion — content height driven by --radix-accordion-content-height,
   which Radix sets automatically after measuring. See SidebarSection.tsx. */
.accordion-content[data-state='open'] {
  animation: accordion-down 200ms ease-out;
}
.accordion-content[data-state='closed'] {
  animation: accordion-up 200ms ease-out;
}
@keyframes accordion-down {
  from {
    height: 0;
  }
  to {
    height: var(--radix-accordion-content-height);
  }
}
@keyframes accordion-up {
  from {
    height: var(--radix-accordion-content-height);
  }
  to {
    height: 0;
  }
}

/* cmdk's Command.Dialog renders a Radix Dialog overlay carrying a
   [cmdk-overlay] attribute — dim the backdrop. See CommandPalette.tsx.
   If the installed cmdk version emits a different attribute, inspect the
   DOM in the browser (Task 15's manual check) and adjust this selector. */
[cmdk-overlay] {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgb(0 0 0 / 0.4);
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter frontend run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "$(cat <<'EOF'
style(banani): accordion + command-palette CSS for sidebar redesign

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Shared nav types + route-matching logic (TDD)

**Files:**
- Create: `frontend/src/components/layout/sidebar/types.ts`
- Create: `frontend/src/components/layout/sidebar/route-match.ts`
- Test: `frontend/src/components/layout/sidebar/route-match.test.ts`

**Interfaces:**
- Produces:
  - `NavItem { label: string; href: string; icon: LucideIcon }`
  - `NavSection { label: string; items: NavItem[] }`
  - `isActiveRoute(pathname: string, href: string): boolean`
  - `findActiveItem(pathname: string, sections: NavSection[]): NavItem | null`
  - `findActiveSection(pathname: string, sections: NavSection[]): string | null`
- Consumed by: Tasks 5, 8, 9, 13 (breadcrumbs).

- [ ] **Step 1: Write `types.ts`**

```typescript
// frontend/src/components/layout/sidebar/types.ts
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// frontend/src/components/layout/sidebar/route-match.test.ts
import { describe, expect, it } from 'vitest';
import { LayoutDashboard, School, Settings, UserPlus } from 'lucide-react';
import { isActiveRoute, findActiveItem, findActiveSection } from './route-match';
import type { NavSection } from './types';

const SECTIONS: NavSection[] = [
  {
    label: 'Vue globale',
    items: [{ label: 'Tableau de bord', href: '/admin', icon: LayoutDashboard }],
  },
  {
    label: 'Clients',
    items: [
      { label: 'Écoles', href: '/admin/schools', icon: School },
      { label: 'Créer une école', href: '/admin/schools/new', icon: UserPlus },
    ],
  },
  {
    label: 'Compte',
    items: [
      { label: 'Abonnement', href: '/settings?tab=subscription', icon: Settings },
      { label: 'Paramètres', href: '/settings', icon: Settings },
    ],
  },
];

describe('isActiveRoute', () => {
  it('matches nested/dynamic routes via prefix', () => {
    expect(isActiveRoute('/eleves/123', '/eleves')).toBe(true);
  });

  it('does not match a route that merely shares a text prefix', () => {
    expect(isActiveRoute('/eleves-archive', '/eleves')).toBe(false);
  });

  it('treats /admin as an exact-only root (would otherwise match every admin sub-route)', () => {
    expect(isActiveRoute('/admin/schools', '/admin')).toBe(false);
    expect(isActiveRoute('/admin', '/admin')).toBe(true);
  });

  it('treats /dashboard as an exact-only root', () => {
    expect(isActiveRoute('/dashboard', '/dashboard')).toBe(true);
    expect(isActiveRoute('/dashboard/foo', '/dashboard')).toBe(false);
  });
});

describe('findActiveItem', () => {
  it('resolves prefix collisions to the most specific (longest) href', () => {
    const active = findActiveItem('/admin/schools/new', SECTIONS);
    expect(active?.href).toBe('/admin/schools/new');
  });

  it('prefers the query-less sibling when hrefs collide on stripped path', () => {
    const active = findActiveItem('/settings', SECTIONS);
    expect(active?.href).toBe('/settings');
    expect(active?.label).toBe('Paramètres');
  });

  it('returns null when nothing matches', () => {
    expect(findActiveItem('/nowhere', SECTIONS)).toBeNull();
  });
});

describe('findActiveSection', () => {
  it('returns the label of the section containing the active item', () => {
    expect(findActiveSection('/admin/schools/new', SECTIONS)).toBe('Clients');
  });

  it('returns null when nothing matches', () => {
    expect(findActiveSection('/nowhere', SECTIONS)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/components/layout/sidebar/route-match.test.ts`
Expected: FAIL — `route-match.ts` does not exist yet.

- [ ] **Step 4: Write `route-match.ts`**

```typescript
// frontend/src/components/layout/sidebar/route-match.ts
import type { NavItem, NavSection } from './types';

export function isActiveRoute(pathname: string, href: string): boolean {
  const path = href.split('?')[0]!;
  if (path === '/dashboard' || path === '/admin') return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * Some hrefs are prefixes of others (e.g. '/admin/schools' vs
 * '/admin/schools/new'), so a naive per-item check would flag both as
 * active simultaneously. Resolve to a single "most specific" match: among
 * matches, drop any with a query string (a query-bearing href like
 * '/settings?tab=subscription' is a shortcut into a page another item
 * already owns — the plain page link wins the highlight), then take the
 * longest remaining href.
 */
export function findActiveItem(pathname: string, sections: NavSection[]): NavItem | null {
  const candidates = sections
    .flatMap((s) => s.items)
    .filter((item) => isActiveRoute(pathname, item.href));
  const withoutQuery = candidates.filter((item) => !item.href.includes('?'));
  const pool = withoutQuery.length > 0 ? withoutQuery : candidates;
  return [...pool].sort((a, b) => b.href.length - a.href.length)[0] ?? null;
}

export function findActiveSection(pathname: string, sections: NavSection[]): string | null {
  const active = findActiveItem(pathname, sections);
  if (!active) return null;
  return sections.find((s) => s.items.includes(active))?.label ?? null;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/components/layout/sidebar/route-match.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Full gate + commit**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
git add frontend/src/components/layout/sidebar/types.ts frontend/src/components/layout/sidebar/route-match.ts frontend/src/components/layout/sidebar/route-match.test.ts
git commit -m "$(cat <<'EOF'
feat(banani): shared nav types + route-matching for sidebar redesign

Prefix-based active-route matching (fixes exact-match missing nested
routes like /eleves/[id]) with a query-collision tiebreak.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `useSidebarCollapse` hook

**Files:**
- Create: `frontend/src/components/layout/sidebar/useSidebarCollapse.ts`

**Interfaces:**
- Produces: `useSidebarCollapse(): [boolean, () => void]`
- Consumed by: Task 12 (both `layout.tsx` files).

- [ ] **Step 1: Write the hook**

```typescript
// frontend/src/components/layout/sidebar/useSidebarCollapse.ts
'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'ekolsuite:sidebar-collapsed';

/**
 * Desktop icon-rail collapse state, persisted to localStorage. Always
 * starts `false` on first render (SSR-safe, no flash-prevention script) —
 * the stored value is read in an effect and applied post-mount.
 */
export function useSidebarCollapse(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY) === '1') setCollapsed(true);
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  return [collapsed, toggle];
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/sidebar/useSidebarCollapse.ts
git commit -m "$(cat <<'EOF'
feat(banani): useSidebarCollapse hook (localStorage-persisted rail state)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `SidebarItem.tsx`

**Files:**
- Create: `frontend/src/components/layout/sidebar/SidebarItem.tsx`

**Interfaces:**
- Consumes: `NavItem` (Task 3).
- Produces:
  ```typescript
  interface SidebarItemProps {
    item: NavItem;
    active: boolean;
    collapsed: boolean;
    variant: 'light' | 'dark';
    onNavigate?: (() => void) | undefined;
  }
  export function SidebarItem(props: SidebarItemProps): JSX.Element
  ```
- Consumed by: Task 8 (`SidebarSection.tsx`).

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/layout/sidebar/SidebarItem.tsx
'use client';

import * as Tooltip from '@radix-ui/react-tooltip';
import Link from 'next/link';
import type { NavItem } from './types';

interface SidebarItemProps {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  variant: 'light' | 'dark';
  onNavigate?: (() => void) | undefined;
}

export function SidebarItem({ item, active, collapsed, variant, onNavigate }: SidebarItemProps) {
  const Icon = item.icon;
  const iconSize = variant === 'light' ? 15 : 14;
  const fontSizeClass = variant === 'light' ? 'text-[13px]' : 'text-xs';

  const activeClasses =
    variant === 'light'
      ? 'border-primary bg-secondary text-primary'
      : 'border-primary bg-white/10 text-white';
  const inactiveClasses =
    variant === 'light'
      ? 'border-transparent text-muted-foreground'
      : 'border-transparent text-white/50';

  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-label={collapsed ? item.label : undefined}
      className={`mb-px flex min-h-11 items-center gap-2 rounded-md border-l-2 font-medium ${fontSizeClass} ${
        collapsed ? 'justify-center px-0' : 'px-2.5'
      } ${active ? activeClasses : inactiveClasses}`}
    >
      <Icon size={iconSize} className="shrink-0" />
      {!collapsed && item.label}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={8}
          className="z-50 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md"
        >
          {item.label}
          <Tooltip.Arrow className="fill-foreground" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/sidebar/SidebarItem.tsx
git commit -m "$(cat <<'EOF'
feat(banani): SidebarItem — nav row with collapsed-mode tooltip

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `SidebarCollapseToggle.tsx`

**Files:**
- Create: `frontend/src/components/layout/sidebar/SidebarCollapseToggle.tsx`

**Interfaces:**
- Produces:
  ```typescript
  interface SidebarCollapseToggleProps {
    collapsed: boolean;
    onToggle: () => void;
    variant: 'light' | 'dark';
  }
  export function SidebarCollapseToggle(props: SidebarCollapseToggleProps): JSX.Element
  ```
- Consumed by: Task 9 (`Sidebar.tsx`).

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/layout/sidebar/SidebarCollapseToggle.tsx
'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface SidebarCollapseToggleProps {
  collapsed: boolean;
  onToggle: () => void;
  variant: 'light' | 'dark';
}

export function SidebarCollapseToggle({ collapsed, onToggle, variant }: SidebarCollapseToggleProps) {
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const colorClasses =
    variant === 'light'
      ? 'text-muted-foreground hover:text-foreground'
      : 'text-white/50 hover:text-white';

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? 'Étendre la barre latérale' : 'Réduire la barre latérale'}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${colorClasses}`}
    >
      <Icon size={16} />
    </button>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/sidebar/SidebarCollapseToggle.tsx
git commit -m "$(cat <<'EOF'
feat(banani): SidebarCollapseToggle — icon-rail collapse button

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `SidebarUserProfile.tsx`

**Files:**
- Create: `frontend/src/components/layout/sidebar/SidebarUserProfile.tsx`

**Interfaces:**
- Consumes: `useAuth()` from `@/contexts/AuthContext` (`user: User | null`, `logout: () => Promise<void>`), `Avatar` from `@/components/ui/Avatar` (`{ name: string; size?: number }`).
- Produces:
  ```typescript
  interface SidebarUserProfileProps {
    variant: 'light' | 'dark';
    collapsed: boolean;
    roleLabel: string;
    profileHref?: string; // defaults to '/settings'
  }
  export function SidebarUserProfile(props: SidebarUserProfileProps): JSX.Element
  ```
- Consumed by: Task 9 (`Sidebar.tsx`).

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/layout/sidebar/SidebarUserProfile.tsx
'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { LogOut, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarUserProfileProps {
  variant: 'light' | 'dark';
  collapsed: boolean;
  roleLabel: string;
  profileHref?: string;
}

export function SidebarUserProfile({
  variant,
  collapsed,
  roleLabel,
  profileHref = '/settings',
}: SidebarUserProfileProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const email = user?.email ?? '';

  const nameClasses = variant === 'light' ? 'text-foreground' : 'text-white';
  const roleClasses = variant === 'light' ? 'text-muted-foreground' : 'text-white/40';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Compte de ${email}`}
          className={`flex w-full items-center gap-2 rounded-md py-1.5 outline-none ${
            collapsed ? 'justify-center px-0' : 'px-2'
          }`}
        >
          <Avatar name={email} size={28} />
          {!collapsed && (
            <div className="min-w-0 flex-1 text-left">
              <div className={`truncate text-xs font-semibold ${nameClasses}`}>{email}</div>
              <div className={`text-[11px] ${roleClasses}`}>{roleLabel}</div>
            </div>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 w-56 rounded-lg border border-border bg-card p-1.5 shadow-xl"
        >
          <div className="truncate px-2 py-1.5 text-xs font-semibold text-foreground">{email}</div>
          <div className="px-2 pb-1.5 text-[11px] text-muted-foreground">{roleLabel}</div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            onSelect={() => router.push(profileHref)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-none data-[highlighted]:bg-secondary data-[highlighted]:text-primary"
          >
            <UserRound size={14} />
            Mon profil
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => void logout()}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive-foreground outline-none data-[highlighted]:bg-destructive"
          >
            <LogOut size={14} />
            Déconnexion
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/sidebar/SidebarUserProfile.tsx
git commit -m "$(cat <<'EOF'
feat(banani): SidebarUserProfile — avatar/role/menu footer component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `SidebarSection.tsx`

**Files:**
- Create: `frontend/src/components/layout/sidebar/SidebarSection.tsx`

**Interfaces:**
- Consumes: `NavSection` (Task 3), `SidebarItem` (Task 5), `.accordion-content` CSS class (Task 2).
- Produces:
  ```typescript
  interface SidebarSectionProps {
    section: NavSection;
    variant: 'light' | 'dark';
    collapsed: boolean;
    open: boolean;
    activeHref: string | null;
    onNavigate?: (() => void) | undefined;
  }
  export function SidebarSection(props: SidebarSectionProps): JSX.Element
  ```
- Consumed by: Task 9 (`Sidebar.tsx`). Must render as an `Accordion.Item` when `collapsed` is false (so it can live inside `Sidebar.tsx`'s `Accordion.Root`), and as a plain icon stack (no accordion chrome) when `collapsed` is true.

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/layout/sidebar/SidebarSection.tsx
'use client';

import * as Accordion from '@radix-ui/react-accordion';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import type { NavSection } from './types';

interface SidebarSectionProps {
  section: NavSection;
  variant: 'light' | 'dark';
  collapsed: boolean;
  open: boolean;
  activeHref: string | null;
  onNavigate?: (() => void) | undefined;
}

export function SidebarSection({
  section,
  variant,
  collapsed,
  open,
  activeHref,
  onNavigate,
}: SidebarSectionProps) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 px-2 py-1.5">
        {section.items.map((item) => (
          <SidebarItem
            key={item.href}
            item={item}
            active={item.href === activeHref}
            collapsed
            variant={variant}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    );
  }

  return (
    <Accordion.Item value={section.label} className="px-2.5 pt-3.5 pb-0.5">
      <Accordion.Header>
        <Accordion.Trigger
          className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-[10px] font-semibold tracking-wide uppercase ${
            variant === 'light' ? 'text-muted-foreground' : 'text-white/28'
          }`}
        >
          {section.label}
          <motion.span
            className="inline-flex items-center"
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <ChevronRight size={12} />
          </motion.span>
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="accordion-content overflow-hidden">
        <div className="flex flex-col gap-px pt-0.5">
          {section.items.map((item) => (
            <SidebarItem
              key={item.href}
              item={item}
              active={item.href === activeHref}
              collapsed={false}
              variant={variant}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/sidebar/SidebarSection.tsx
git commit -m "$(cat <<'EOF'
feat(banani): SidebarSection — Radix Accordion section / collapsed rail stack

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `Sidebar.tsx` shell

**Files:**
- Create: `frontend/src/components/layout/sidebar/Sidebar.tsx`

**Interfaces:**
- Consumes: `findActiveItem`, `findActiveSection` (Task 3), `SidebarSection` (Task 8), `SidebarUserProfile` (Task 7), `SidebarCollapseToggle` (Task 6).
- Produces:
  ```typescript
  interface SidebarProps {
    sections: NavSection[];
    variant: 'light' | 'dark';
    width: number;
    brandIcon: ReactNode;
    brandText: ReactNode;
    roleLabel: string;
    profileHref: string;
    collapsed?: boolean;
    onToggleCollapse?: (() => void) | undefined;
    footer?: ReactNode;
    onNavigate?: (() => void) | undefined;
  }
  export function Sidebar(props: SidebarProps): JSX.Element
  ```
- Consumed by: Task 10 (`SchoolSidebar.tsx`), Task 11 (`AdminSidebar.tsx`).
- Only one accordion section open at a time (`type="single" collapsible`); the open section resets to whichever contains the active route whenever the route changes (not on every render, so manually toggling other sections isn't fought).

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/layout/sidebar/Sidebar.tsx
'use client';

import { type ReactNode, useEffect, useState } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import * as Tooltip from '@radix-ui/react-tooltip';
import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { findActiveItem, findActiveSection } from './route-match';
import { SidebarCollapseToggle } from './SidebarCollapseToggle';
import { SidebarSection } from './SidebarSection';
import { SidebarUserProfile } from './SidebarUserProfile';
import type { NavSection } from './types';

const COLLAPSED_WIDTH = 72;

interface SidebarProps {
  sections: NavSection[];
  variant: 'light' | 'dark';
  width: number;
  brandIcon: ReactNode;
  brandText: ReactNode;
  roleLabel: string;
  profileHref: string;
  collapsed?: boolean;
  onToggleCollapse?: (() => void) | undefined;
  footer?: ReactNode;
  onNavigate?: (() => void) | undefined;
}

export function Sidebar({
  sections,
  variant,
  width,
  brandIcon,
  brandText,
  roleLabel,
  profileHref,
  collapsed = false,
  onToggleCollapse,
  footer,
  onNavigate,
}: SidebarProps) {
  const pathname = usePathname();
  const [openSection, setOpenSection] = useState<string | null>(() =>
    findActiveSection(pathname, sections),
  );

  useEffect(() => {
    setOpenSection(findActiveSection(pathname, sections));
  }, [pathname, sections]);

  const activeHref = findActiveItem(pathname, sections)?.href ?? null;
  const bgClass =
    variant === 'light'
      ? 'bg-sidebar-light text-sidebar-light-foreground'
      : 'bg-sidebar-dark text-sidebar-dark-foreground';
  const borderClass = variant === 'light' ? 'border-border' : 'border-white/[0.07]';

  return (
    <Tooltip.Provider delayDuration={300}>
      <motion.aside
        animate={{ width: collapsed ? COLLAPSED_WIDTH : width }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className={`flex h-full shrink-0 flex-col overflow-hidden border-r ${borderClass} ${bgClass}`}
      >
        <div
          className={`flex shrink-0 border-b ${borderClass} ${
            collapsed
              ? 'flex-col items-center gap-2 py-3'
              : 'items-center justify-between gap-2 px-4 pt-[18px] pb-3.5'
          }`}
        >
          <div className={collapsed ? 'flex flex-col items-center gap-2' : 'flex items-center gap-2'}>
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-primary">
              {brandIcon}
            </div>
            {!collapsed && brandText}
          </div>
          {onToggleCollapse && (
            <SidebarCollapseToggle collapsed={collapsed} onToggle={onToggleCollapse} variant={variant} />
          )}
        </div>

        <nav className="flex-1 overflow-y-auto">
          {collapsed ? (
            sections.map((section) => (
              <SidebarSection
                key={section.label}
                section={section}
                variant={variant}
                collapsed
                open={false}
                activeHref={activeHref}
                onNavigate={onNavigate}
              />
            ))
          ) : (
            <Accordion.Root
              type="single"
              collapsible
              value={openSection ?? ''}
              onValueChange={(v) => setOpenSection(v === '' ? null : v)}
            >
              {sections.map((section) => (
                <SidebarSection
                  key={section.label}
                  section={section}
                  variant={variant}
                  collapsed={false}
                  open={openSection === section.label}
                  activeHref={activeHref}
                  onNavigate={onNavigate}
                />
              ))}
            </Accordion.Root>
          )}
        </nav>

        <div className={`border-t ${borderClass} p-2.5`}>
          {!collapsed && footer}
          <SidebarUserProfile
            variant={variant}
            collapsed={collapsed}
            roleLabel={roleLabel}
            profileHref={profileHref}
          />
        </div>
      </motion.aside>
    </Tooltip.Provider>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Full gate + commit**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
git add frontend/src/components/layout/sidebar/Sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(banani): Sidebar shell — accordion, icon rail, active-section sync

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Rewrite `SchoolSidebar.tsx`

**Files:**
- Modify: `frontend/src/components/layout/SchoolSidebar.tsx` (full rewrite)

**Interfaces:**
- Consumes: `Sidebar` (Task 9), `NavSection` (Task 3).
- Produces:
  - `export const SCHOOL_SECTIONS: NavSection[]` — consumed by Task 19 (`SchoolTopbar.tsx`).
  - `SchoolSidebarProps { onNavigate?: (() => void) | undefined; collapsed?: boolean; onToggleCollapse?: (() => void) | undefined }`
  - `export function SchoolSidebar(props: SchoolSidebarProps): JSX.Element`
- Consumed by: Task 12 (`(school)/layout.tsx`). The nav data (labels/hrefs/icons) is unchanged from the current file — only the rendering delegates to `Sidebar`.

- [ ] **Step 1: Replace the file contents**

```tsx
// frontend/src/components/layout/SchoolSidebar.tsx
'use client';

import {
  BookOpen,
  CalendarCheck,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LayoutTemplate,
  Link as LinkIcon,
  NotebookPen,
  Percent,
  School as SchoolIcon,
  Settings,
  Star,
  UserCheck,
  Users,
} from 'lucide-react';
import { Sidebar } from './sidebar/Sidebar';
import type { NavSection } from './sidebar/types';

// Spec: .planning/banani/epic-0-shell.md — school shell sidebar (light).
export const SCHOOL_SECTIONS: NavSection[] = [
  {
    label: 'Principal',
    items: [
      { label: 'Tableau de bord', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Élèves', href: '/eleves', icon: Users },
      { label: 'Enseignants', href: '/enseignants', icon: UserCheck },
    ],
  },
  {
    label: 'Pédagogie',
    items: [
      { label: 'Carnet de notes', href: '/pedagogie/carnet-de-notes', icon: NotebookPen },
      { label: 'Présences', href: '/pedagogie/presences', icon: CalendarCheck },
      { label: 'Bulletins', href: '/bulletins', icon: FileText },
      { label: 'Appréciations', href: '/pedagogie/appreciations', icon: Star },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { label: 'Classes', href: '/configuration/classes', icon: SchoolIcon },
      { label: 'Matières', href: '/configuration/matieres', icon: BookOpen },
      { label: 'Affectations', href: '/configuration/affectations', icon: LinkIcon },
      { label: 'Coefficients', href: '/configuration/coefficients', icon: Percent },
      { label: 'Modèle de bulletin', href: '/configuration/modele-bulletin', icon: LayoutTemplate },
    ],
  },
  {
    label: 'Compte',
    items: [
      { label: 'Abonnement', href: '/settings?tab=subscription', icon: CreditCard },
      { label: 'Paramètres', href: '/settings', icon: Settings },
    ],
  },
];

interface SchoolSidebarProps {
  onNavigate?: (() => void) | undefined;
  collapsed?: boolean;
  onToggleCollapse?: (() => void) | undefined;
}

export function SchoolSidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: SchoolSidebarProps) {
  return (
    <Sidebar
      sections={SCHOOL_SECTIONS}
      variant="light"
      width={195}
      brandIcon={<GraduationCap size={15} className="text-white" />}
      brandText={<span className="text-[15px] font-bold text-foreground">EkolSuite</span>}
      roleLabel="Administratrice"
      profileHref="/settings"
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      onNavigate={onNavigate}
    />
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS. (The `(school)/layout.tsx` call sites still compile against the old prop shape at this point — they're updated in Task 12 — so this task's typecheck must still pass on its own since all three props are optional.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/SchoolSidebar.tsx
git commit -m "$(cat <<'EOF'
refactor(banani): SchoolSidebar — thin wrapper over shared Sidebar shell

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Rewrite `AdminSidebar.tsx`

**Files:**
- Modify: `frontend/src/components/layout/AdminSidebar.tsx` (full rewrite)

**Interfaces:**
- Consumes: `Sidebar` (Task 9), `NavSection` (Task 3).
- Produces:
  - `export const ADMIN_SECTIONS: NavSection[]` — consumed by Task 20 (`AdminTopbar.tsx`).
  - `AdminSidebarProps { onNavigate?: (() => void) | undefined; collapsed?: boolean; onToggleCollapse?: (() => void) | undefined }`
  - `export function AdminSidebar(props: AdminSidebarProps): JSX.Element`
- Consumed by: Task 12 (`admin/layout.tsx`).

- [ ] **Step 1: Replace the file contents**

```tsx
// frontend/src/components/layout/AdminSidebar.tsx
'use client';

import {
  Activity,
  ArrowLeft,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  LayoutTemplate,
  Receipt,
  School,
  Settings,
  Tag,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { Sidebar } from './sidebar/Sidebar';
import type { NavSection } from './sidebar/types';

// Spec: .planning/banani/epic-0-shell.md — SaaS admin shell sidebar.
export const ADMIN_SECTIONS: NavSection[] = [
  {
    label: 'Vue globale',
    items: [
      { label: 'Tableau de bord', href: '/admin', icon: LayoutDashboard },
      { label: 'Statistiques', href: '/admin/statistics', icon: Activity },
    ],
  },
  {
    label: 'Clients',
    items: [
      { label: 'Écoles', href: '/admin/schools', icon: School },
      { label: 'Créer une école', href: '/admin/schools/new', icon: UserPlus },
      { label: 'Utilisateurs', href: '/admin/users', icon: Users },
    ],
  },
  {
    label: 'Facturation',
    items: [
      { label: 'Abonnements', href: '/admin/billing/subscriptions', icon: CreditCard },
      { label: 'Transactions', href: '/admin/billing/transactions', icon: Receipt },
      { label: 'Coupons', href: '/admin/billing/coupons', icon: Tag },
    ],
  },
  {
    label: 'Système',
    items: [
      {
        label: 'Modèles de bulletin',
        href: '/admin/system/bulletin-templates',
        icon: LayoutTemplate,
      },
      { label: 'Paramètres système', href: '/admin/system/settings', icon: Settings },
    ],
  },
];

interface AdminSidebarProps {
  onNavigate?: (() => void) | undefined;
  collapsed?: boolean;
  onToggleCollapse?: (() => void) | undefined;
}

export function AdminSidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: AdminSidebarProps) {
  return (
    <Sidebar
      sections={ADMIN_SECTIONS}
      variant="dark"
      width={220}
      brandIcon={<GraduationCap size={15} className="text-white" />}
      brandText={
        <div className="flex flex-col gap-px">
          <div className="text-[13px] font-extrabold text-white">EkolSuite</div>
          <div className="w-fit rounded-full bg-primary/22 px-1.5 py-px text-[9px] font-bold tracking-wide text-primary uppercase">
            Administration
          </div>
        </div>
      }
      roleLabel="Propriétaire SaaS"
      profileHref="/settings"
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      footer={
        <Link
          href="/"
          className="mb-2 flex min-h-11 items-center gap-2 rounded-md px-2.5 text-[11px] text-white/38"
        >
          <ArrowLeft size={12} className="shrink-0" />
          Retour à l&apos;interface école
        </Link>
      }
      onNavigate={onNavigate}
    />
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/AdminSidebar.tsx
git commit -m "$(cat <<'EOF'
refactor(banani): AdminSidebar — thin wrapper over shared Sidebar shell

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Wire collapse state into both layouts

**Files:**
- Modify: `frontend/src/app/(school)/layout.tsx`
- Modify: `frontend/src/app/admin/layout.tsx`

**Interfaces:**
- Consumes: `useSidebarCollapse` (Task 4), `SchoolSidebar`/`AdminSidebar` (Tasks 10–11, now accepting `collapsed`/`onToggleCollapse`).
- The sidebar and content area are plain flexbox siblings (no `position: fixed`), so animating the `<aside>`'s width in Task 9 already reflows the content — no margin/CSS-variable synchronization needed here, just prop wiring.
- The mobile drawer keeps calling `<SchoolSidebar onNavigate={...} />` / `<AdminSidebar onNavigate={...} />` **without** `collapsed`/`onToggleCollapse` — it always renders expanded, matching current behavior.

- [ ] **Step 1: Update `(school)/layout.tsx`**

```tsx
// frontend/src/app/(school)/layout.tsx
'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useUser } from '@/contexts/AuthContext';
import { SchoolSidebar } from '@/components/layout/SchoolSidebar';
import { SchoolTopbar } from '@/components/layout/SchoolTopbar';
import { useSidebarCollapse } from '@/components/layout/sidebar/useSidebarCollapse';

// Basic auth gate here (any logged-in user) — school-membership itself is
// checked by individual pages that need it (e.g. /settings via GET
// /api/school's NO_SCHOOL response), not the shell. See
// .planning/banani/school-settings.md.
export default function SchoolLayout({ children }: { children: ReactNode }) {
  const user = useUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useSidebarCollapse();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="relative z-50 flex h-full w-[195px]">
            <SchoolSidebar onNavigate={() => setDrawerOpen(false)} />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Fermer le menu"
              className="absolute top-3 -right-11 flex h-9 w-9 items-center justify-center rounded-md bg-black/60 text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="hidden lg:flex">
        <SchoolSidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <SchoolTopbar onMenuClick={() => setDrawerOpen(true)} />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-7 lg:py-7">
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `admin/layout.tsx`**

```tsx
// frontend/src/app/admin/layout.tsx
'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useAdminUser } from '@/contexts/AuthContext';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { AdminTopbar } from '@/components/layout/AdminTopbar';
import { useSidebarCollapse } from '@/components/layout/sidebar/useSidebarCollapse';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const admin = useAdminUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useSidebarCollapse();

  if (!admin) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Off-canvas drawer below lg — Banani only shipped the 1280px desktop
          mockup, mobile/tablet behavior designed per epic-0-shell.md. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="relative z-50 flex h-full w-[220px]">
            <AdminSidebar onNavigate={() => setDrawerOpen(false)} />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Fermer le menu"
              className="absolute top-3 -right-11 flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="hidden lg:flex">
        <AdminSidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar onMenuClick={() => setDrawerOpen(true)} />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-7 lg:py-7">
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Full gate + commit**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
git add "frontend/src/app/(school)/layout.tsx" frontend/src/app/admin/layout.tsx
git commit -m "$(cat <<'EOF'
feat(banani): wire desktop sidebar collapse into School + Admin layouts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Manual checkpoint (do not skip)**

Run: `pnpm dev`, open `/dashboard` (or `/admin`), confirm:
- Sidebar renders, only the section containing the current page is expanded.
- Clicking the collapse toggle shrinks the sidebar to an icon rail (~72px) and the main content reflows to fill the space, no layout jump/overlap.
- Hovering an icon in rail mode shows its tooltip label.
- Reload the page — collapsed state persists (localStorage).
- Clicking the avatar at the bottom opens the profile menu ("Mon profil" / "Déconnexion").
- Resize below `lg` breakpoint — the mobile drawer still opens via the hamburger button and is always fully expanded (no rail mode there).

---

## Task 13: `getBreadcrumbTrail` (TDD)

**Files:**
- Create: `frontend/src/components/layout/topbar/breadcrumb.ts`
- Test: `frontend/src/components/layout/topbar/breadcrumb.test.ts`

**Interfaces:**
- Consumes: `findActiveItem` (Task 3), `NavSection` (Task 3).
- Produces: `getBreadcrumbTrail(pathname: string, sections: NavSection[], extraLabels?: Record<string, string>): string[]`
- Consumed by: Task 14 (`Breadcrumbs.tsx` usage sites in Tasks 19–20).

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/components/layout/topbar/breadcrumb.test.ts
import { describe, expect, it } from 'vitest';
import { CreditCard, Settings, UserCheck, Users } from 'lucide-react';
import { getBreadcrumbTrail } from './breadcrumb';
import type { NavSection } from '../sidebar/types';

const SECTIONS: NavSection[] = [
  {
    label: 'Principal',
    items: [
      { label: 'Élèves', href: '/eleves', icon: Users },
      { label: 'Enseignants', href: '/enseignants', icon: UserCheck },
    ],
  },
  {
    label: 'Compte',
    items: [
      { label: 'Abonnement', href: '/settings?tab=subscription', icon: CreditCard },
      { label: 'Paramètres', href: '/settings', icon: Settings },
    ],
  },
];

describe('getBreadcrumbTrail', () => {
  it('derives [section, item] for a top-level nav route', () => {
    expect(getBreadcrumbTrail('/eleves', SECTIONS)).toEqual(['Principal', 'Élèves']);
  });

  it('appends an extra crumb for a sub-page not in the nav', () => {
    expect(getBreadcrumbTrail('/eleves/42', SECTIONS, { '/eleves/42': 'Fiche élève' })).toEqual([
      'Principal',
      'Élèves',
      'Fiche élève',
    ]);
  });

  it('returns an empty trail for an unknown route', () => {
    expect(getBreadcrumbTrail('/unknown-route', SECTIONS)).toEqual([]);
  });

  it('resolves the /settings query-collision to the plain Paramètres item', () => {
    expect(getBreadcrumbTrail('/settings', SECTIONS)).toEqual(['Compte', 'Paramètres']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/components/layout/topbar/breadcrumb.test.ts`
Expected: FAIL — `breadcrumb.ts` does not exist yet.

- [ ] **Step 3: Write `breadcrumb.ts`**

```typescript
// frontend/src/components/layout/topbar/breadcrumb.ts
import { findActiveItem } from '../sidebar/route-match';
import type { NavSection } from '../sidebar/types';

export function getBreadcrumbTrail(
  pathname: string,
  sections: NavSection[],
  extraLabels: Record<string, string> = {},
): string[] {
  const active = findActiveItem(pathname, sections);
  const trail: string[] = [];

  if (active) {
    const section = sections.find((s) => s.items.includes(active));
    if (section) trail.push(section.label);
    trail.push(active.label);
  }

  const extra = extraLabels[pathname];
  if (extra) trail.push(extra);

  return trail;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/components/layout/topbar/breadcrumb.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Full gate + commit**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
git add frontend/src/components/layout/topbar/breadcrumb.ts frontend/src/components/layout/topbar/breadcrumb.test.ts
git commit -m "$(cat <<'EOF'
feat(banani): getBreadcrumbTrail — derive breadcrumbs from nav sections

Replaces the hand-maintained per-page label map with a pure function
sourced from the same SECTIONS data the sidebar renders.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: `Breadcrumbs.tsx`

**Files:**
- Create: `frontend/src/components/layout/topbar/Breadcrumbs.tsx`

**Interfaces:**
- Produces:
  ```typescript
  interface BreadcrumbsProps { root: ReactNode; trail: string[] }
  export function Breadcrumbs(props: BreadcrumbsProps): JSX.Element
  ```
- Consumed by: Tasks 19–20.

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/layout/topbar/Breadcrumbs.tsx
import type { ReactNode } from 'react';

interface BreadcrumbsProps {
  root: ReactNode;
  trail: string[];
}

export function Breadcrumbs({ root, trail }: BreadcrumbsProps) {
  return (
    <div className="hidden items-center gap-1.5 text-[13px] text-muted-foreground sm:flex">
      {root}
      {trail.map((label, i) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="text-border">›</span>
          <span className={i === trail.length - 1 ? 'font-medium text-foreground' : ''}>
            {label}
          </span>
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/topbar/Breadcrumbs.tsx
git commit -m "$(cat <<'EOF'
feat(banani): Breadcrumbs component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: `CommandPalette.tsx`

**Files:**
- Create: `frontend/src/components/layout/topbar/CommandPalette.tsx`

**Interfaces:**
- Consumes: `NavSection` (Task 3), `[cmdk-overlay]` CSS (Task 2).
- Produces: `export function CommandPalette({ sections }: { sections: NavSection[] }): JSX.Element` — renders both the visible search-bar-shaped trigger button and the `⌘K` modal.
- Consumed by: Tasks 19–20.

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/layout/topbar/CommandPalette.tsx
'use client';

import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { NavSection } from '../sidebar/types';

export function CommandPalette({ sections }: { sections: NavSection[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden min-w-[180px] items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground sm:flex"
      >
        <Search size={13} />
        <span className="flex-1 text-left">Recherche globale...</span>
        <kbd className="rounded border border-border bg-card px-1 py-0.5 text-[10px] font-medium">
          ⌘K
        </kbd>
      </button>
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Recherche globale"
        className="fixed top-[15%] left-1/2 z-50 w-full max-w-md -translate-x-1/2 rounded-lg border border-border bg-card p-2 shadow-xl"
      >
        <Command.Input
          placeholder="Rechercher une page..."
          className="w-full border-b border-border bg-transparent px-2 py-2 text-sm text-foreground outline-none"
        />
        <Command.List className="max-h-80 overflow-y-auto py-2">
          <Command.Empty className="px-2 py-4 text-center text-sm text-muted-foreground">
            Aucun résultat.
          </Command.Empty>
          {sections.map((section) => (
            <Command.Group
              key={section.label}
              heading={section.label}
              className="px-2 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase [&_[cmdk-group-items]]:mt-1"
            >
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Command.Item
                    key={item.href}
                    value={`${section.label} ${item.label}`}
                    onSelect={() => go(item.href)}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground normal-case data-[selected=true]:bg-secondary data-[selected=true]:text-primary"
                  >
                    <Icon size={14} />
                    {item.label}
                  </Command.Item>
                );
              })}
            </Command.Group>
          ))}
        </Command.List>
      </Command.Dialog>
    </>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/topbar/CommandPalette.tsx
git commit -m "$(cat <<'EOF'
feat(banani): CommandPalette — cmdk-based global ⌘K navigation

UI + keyboard shortcut only; filters the existing nav sections
client-side, no server search endpoint (per design spec non-goals).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Manual checkpoint**

This component isn't wired into a page yet (Tasks 19–20 do that), so defer the visual/keyboard check to Task 19's checkpoint.

---

## Task 16: `NotificationsMenu.tsx`

**Files:**
- Create: `frontend/src/components/layout/topbar/NotificationsMenu.tsx`

**Interfaces:**
- Consumes: `useApi<T>(path, { skip })` and `invalidateCache(path)` from `@/lib/useApi`; `api(path, { method, body })` from `@/lib/api`. Backend contract (unchanged, already shipped): `GET /api/notifications/count` → `{ count: number }`; `GET /api/notifications?unread=true&limit=5` → `{ items: NotificationItem[]; nextCursor: string | null }` where `NotificationItem = { id, type, title, body, data, readAt, createdAt }`; `PATCH /api/notifications` with body `{ ids: string[] | 'all' }` → `{ updated: number; unreadCount: number }`.
- Produces: `export function NotificationsMenu(): JSX.Element` (no props).
- Consumed by: Tasks 19–20.

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/layout/topbar/NotificationsMenu.tsx
'use client';

import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bell } from 'lucide-react';
import { api } from '@/lib/api';
import { invalidateCache, useApi } from '@/lib/useApi';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
  readAt: string | null;
  createdAt: string;
}
interface NotificationsListResponse {
  items: NotificationItem[];
  nextCursor: string | null;
}
interface NotificationsCountResponse {
  count: number;
}

const COUNT_PATH = '/api/notifications/count';
const LIST_PATH = '/api/notifications?unread=true&limit=5';

export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const { data: countData, refresh: refreshCount } =
    useApi<NotificationsCountResponse>(COUNT_PATH);
  const {
    data: listData,
    loading,
    refresh: refreshList,
  } = useApi<NotificationsListResponse>(LIST_PATH, { skip: !open });
  const unreadCount = countData?.count ?? 0;

  async function markRead(ids: string[] | 'all') {
    await api(LIST_PATH.split('?')[0]!, { method: 'PATCH', body: { ids } });
    invalidateCache(COUNT_PATH);
    invalidateCache(LIST_PATH);
    await Promise.all([refreshCount(), refreshList()]);
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex h-11 w-11 items-center justify-center text-muted-foreground"
        >
          <Bell size={17} />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive-foreground px-1 text-[9px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 rounded-lg border border-border bg-card p-2 shadow-xl"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markRead('all')}
                className="text-xs font-medium text-primary"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>
          {loading && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">Chargement…</div>
          )}
          {!loading && (listData?.items.length ?? 0) === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              Aucune nouvelle notification.
            </div>
          )}
          {listData?.items.map((n) => (
            <DropdownMenu.Item
              key={n.id}
              onSelect={(e) => {
                e.preventDefault();
                void markRead([n.id]);
              }}
              className="flex flex-col gap-0.5 rounded-md px-2 py-2 text-sm outline-none data-[highlighted]:bg-secondary"
            >
              <span className="font-medium text-foreground">{n.title}</span>
              <span className="text-xs text-muted-foreground">{n.body}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/topbar/NotificationsMenu.tsx
git commit -m "$(cat <<'EOF'
feat(banani): NotificationsMenu — real badge + mark-read via existing API

Wires the previously-static bell icon to GET /api/notifications/count,
GET /api/notifications, and PATCH /api/notifications (all pre-existing,
unused by the UI until now).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: `HelpMenu.tsx`

**Files:**
- Create: `frontend/src/components/layout/topbar/HelpMenu.tsx`

**Interfaces:**
- Produces: `export function HelpMenu(): JSX.Element` (no props).
- Consumed by: Tasks 19–20.
- No external URLs — static informational content only (per Global Constraints: never fabricate a real-looking support URL).

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/layout/topbar/HelpMenu.tsx
'use client';

import * as Popover from '@radix-ui/react-popover';
import { CircleHelp } from 'lucide-react';

export function HelpMenu() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Aide"
          className="hidden h-11 w-11 items-center justify-center text-muted-foreground sm:flex"
        >
          <CircleHelp size={17} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-64 rounded-lg border border-border bg-card p-3 text-sm shadow-xl"
        >
          <p className="font-semibold text-foreground">Besoin d&apos;aide ?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Contactez l&apos;administrateur de votre établissement pour toute question sur
            EkolSuite.
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/topbar/HelpMenu.tsx
git commit -m "$(cat <<'EOF'
feat(banani): HelpMenu — static help popover

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: `AcademicYearSelector.tsx`

**Files:**
- Create: `frontend/src/components/layout/topbar/AcademicYearSelector.tsx`

**Interfaces:**
- Produces: `export function AcademicYearSelector(): JSX.Element` (no props).
- Consumed by: Task 19 only (School topbar — not rendered in Admin).
- Purely visual, local `useState`, static mock data — no API calls (per user's explicit "just UI" answer during brainstorming).

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/layout/topbar/AcademicYearSelector.tsx
'use client';

import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Calendar, ChevronDown } from 'lucide-react';

const MOCK_YEARS = ['2025-2026', '2024-2025', '2023-2024'];

export function AcademicYearSelector() {
  const [selected, setSelected] = useState(MOCK_YEARS[0]!);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="hidden items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground sm:flex"
        >
          <Calendar size={13} className="text-muted-foreground" />
          {selected}
          <ChevronDown size={12} className="text-muted-foreground" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-40 rounded-lg border border-border bg-card p-1 shadow-xl"
        >
          {MOCK_YEARS.map((year) => (
            <DropdownMenu.Item
              key={year}
              onSelect={() => setSelected(year)}
              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-secondary ${
                year === selected ? 'font-semibold text-primary' : 'text-foreground'
              }`}
            >
              {year}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Full gate + commit**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
git add frontend/src/components/layout/topbar/AcademicYearSelector.tsx
git commit -m "$(cat <<'EOF'
feat(banani): AcademicYearSelector — visual-only year picker (School topbar)

Static mock data, no API — real switching is out of scope for this pass.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: Rewrite `SchoolTopbar.tsx`

**Files:**
- Modify: `frontend/src/components/layout/SchoolTopbar.tsx` (full rewrite)

**Interfaces:**
- Consumes: `SCHOOL_SECTIONS` (Task 10), `getBreadcrumbTrail` (Task 13), `Breadcrumbs` (Task 14), `CommandPalette` (Task 15), `NotificationsMenu` (Task 16), `HelpMenu` (Task 17), `AcademicYearSelector` (Task 18).
- Produces: `export function SchoolTopbar({ onMenuClick }: { onMenuClick?: () => void }): JSX.Element` — same external signature as before, unchanged call site in `(school)/layout.tsx`.
- The standalone avatar button that used to sit in the topbar's right side is intentionally removed — the user profile now lives in the sidebar footer (Task 7), not duplicated here.

- [ ] **Step 1: Replace the file contents**

```tsx
// frontend/src/components/layout/SchoolTopbar.tsx
'use client';

import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { SCHOOL_SECTIONS } from './SchoolSidebar';
import { AcademicYearSelector } from './topbar/AcademicYearSelector';
import { Breadcrumbs } from './topbar/Breadcrumbs';
import { getBreadcrumbTrail } from './topbar/breadcrumb';
import { CommandPalette } from './topbar/CommandPalette';
import { HelpMenu } from './topbar/HelpMenu';
import { NotificationsMenu } from './topbar/NotificationsMenu';

// Sub-pages not covered by SCHOOL_SECTIONS (detail views etc.) — extend as
// new ones land.
const EXTRA_LABELS: Record<string, string> = {};

export function SchoolTopbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const trail = getBreadcrumbTrail(pathname, SCHOOL_SECTIONS, EXTRA_LABELS);

  return (
    <header className="flex h-13 shrink-0 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Ouvrir le menu"
          className="flex h-11 w-11 items-center justify-center text-muted-foreground lg:hidden"
        >
          <Menu size={20} />
        </button>
        <Breadcrumbs root={<span>EkolSuite</span>} trail={trail} />
      </div>

      <div className="flex items-center gap-1.5">
        <CommandPalette sections={SCHOOL_SECTIONS} />
        <AcademicYearSelector />
        <NotificationsMenu />
        <HelpMenu />
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Full gate + commit**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
git add frontend/src/components/layout/SchoolTopbar.tsx
git commit -m "$(cat <<'EOF'
refactor(banani): SchoolTopbar — compose shared breadcrumb/search/notif/help

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Manual checkpoint (do not skip)**

Run: `pnpm dev`, on any `(school)` page confirm:
- Breadcrumb shows `EkolSuite › {Section} › {Item}` matching the current page (e.g. `/eleves` → `EkolSuite › Principal › Élèves`).
- Press `⌘K`/`Ctrl+K` — the command palette opens, backdrop dims, typing filters the list, selecting an item navigates and closes the palette. Press `Escape` — closes it.
- Academic year selector opens, selecting a different year updates the displayed label (visual only).
- Notification bell shows the real unread count (compare against `pnpm --filter frontend exec prisma studio` or existing seeded data); opening it lists recent unread notifications; "Tout marquer comme lu" clears the badge.
- Help icon opens the static popover.

---

## Task 20: Rewrite `AdminTopbar.tsx`

**Files:**
- Modify: `frontend/src/components/layout/AdminTopbar.tsx` (full rewrite)

**Interfaces:**
- Consumes: `ADMIN_SECTIONS` (Task 11), `getBreadcrumbTrail` (Task 13), `Breadcrumbs` (Task 14), `CommandPalette` (Task 15), `NotificationsMenu` (Task 16), `HelpMenu` (Task 17). No `AcademicYearSelector` — an admin manages many schools, there's no single "current year".
- Produces: `export function AdminTopbar({ onMenuClick }: { onMenuClick?: () => void }): JSX.Element` — same external signature, unchanged call site in `admin/layout.tsx`.
- Drops the old standalone avatar button (same reasoning as Task 19 — profile now lives in `AdminSidebar`'s footer).

- [ ] **Step 1: Replace the file contents**

```tsx
// frontend/src/components/layout/AdminTopbar.tsx
'use client';

import { Menu, Shield } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { ADMIN_SECTIONS } from './AdminSidebar';
import { Breadcrumbs } from './topbar/Breadcrumbs';
import { getBreadcrumbTrail } from './topbar/breadcrumb';
import { CommandPalette } from './topbar/CommandPalette';
import { HelpMenu } from './topbar/HelpMenu';
import { NotificationsMenu } from './topbar/NotificationsMenu';

// Sub-pages not covered by ADMIN_SECTIONS (detail views etc.) — extend as
// new ones land.
const EXTRA_LABELS: Record<string, string> = {};

export function AdminTopbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const trail = getBreadcrumbTrail(pathname, ADMIN_SECTIONS, EXTRA_LABELS);

  return (
    <header className="flex h-13 shrink-0 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Ouvrir le menu"
          className="flex h-11 w-11 items-center justify-center text-muted-foreground lg:hidden"
        >
          <Menu size={20} />
        </button>
        <Breadcrumbs
          root={
            <span className="flex items-center gap-1.5">
              <Shield size={13} className="text-primary" />
              Administration
            </span>
          }
          trail={trail}
        />
      </div>

      <div className="flex items-center gap-2">
        <CommandPalette sections={ADMIN_SECTIONS} />
        <NotificationsMenu />
        <HelpMenu />
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Full gate + commit**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
git add frontend/src/components/layout/AdminTopbar.tsx
git commit -m "$(cat <<'EOF'
refactor(banani): AdminTopbar — compose shared breadcrumb/search/notif/help

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Manual checkpoint**

Run: `pnpm dev`, log in as an ADMIN/SUPERADMIN user, open `/admin`, repeat the same checks as Task 19's checkpoint (breadcrumb, ⌘K palette, notifications, help) minus the academic-year selector (should not be present).

---

## Task 21: Final verification pass

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Full gate**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
```
Expected: all four PASS, zero diffs from `pnpm format` (everything already formatted by earlier tasks).

- [ ] **Step 2: Full manual click-through**

Run `pnpm dev` and walk both shells end to end:
- **School** (`/dashboard`, `/eleves`, `/eleves/[id]`, `/configuration/classes`, `/settings`, `/settings?tab=subscription`): correct section auto-opens per page, correct item highlighted (verify `/settings` **and** `/settings?tab=subscription` both highlight "Paramètres" and both breadcrumb to "Compte › Paramètres" — per Task 3's query-collision tiebreak, the query-less item always wins the highlight, so "Abonnement" is a navigation shortcut that never itself highlights; this is the intended behavior, not a bug), breadcrumbs match, collapse/expand + tooltips work, mobile drawer (resize `<lg`) still opens/closes and stays expanded.
- **Admin** (`/admin`, `/admin/schools`, `/admin/schools/new`, `/admin/system/settings`): same checks, plus confirm `/admin/schools/new` highlights "Créer une école" and NOT "Écoles" (the prefix-collision fix), and "Retour à l'interface école" still appears in the footer (hidden when collapsed, visible when expanded).
- Both shells: ⌘K palette, notifications badge/list/mark-read, help popover.

- [ ] **Step 3: Report**

If every check passes, the feature is done — no further commit needed (Step 1 already confirmed a clean tree). If anything fails, fix it as a small follow-up commit through the normal `pnpm format && pnpm lint && pnpm typecheck && pnpm test` gate before considering the task closed.

---

## Self-Review Notes (already applied above)

- **Spec coverage:** accordion sections ✅ (Task 8–9), active-section-only-open ✅ (Task 9), global collapse + rail tooltips ✅ (Tasks 4, 6, 9), user profile footer ✅ (Task 7), ⌘K search UI ✅ (Task 15), breadcrumbs ✅ (Tasks 13–14), notifications badge/help/academic-year quick actions ✅ (Tasks 16–18), animations ✅ (Framer Motion in Tasks 8–9, Radix CSS-var accordion in Task 2), active-item emphasis ✅ (Task 5's `border-l-2` accent).
- **Route-matching bug caught during planning:** a naive per-item `pathname.startsWith(href)` check double-highlights `/admin/schools` + `/admin/schools/new` on the latter page, and `/settings` + `/settings?tab=subscription` on the plain settings page. Fixed via `findActiveItem`'s longest-match-without-query tiebreak (Task 3), covered by tests, and re-verified manually in Task 21.
- **No `useSearchParams()` needed:** considered making the `/settings` vs `/settings?tab=subscription` resolution query-aware via `useSearchParams()`, rejected — it would require a `Suspense` boundary consideration in the App Router and adds complexity for a single cosmetic edge case. The simpler rule ("plain-path item always wins the highlight") is correct enough and avoids that entirely.
- **No CSS-variable/margin plumbing needed:** the existing layouts use flexbox siblings, not `position: fixed` — animating the sidebar's width alone reflows the content, confirmed against the actual current `layout.tsx` files rather than assumed.
- **`exactOptionalPropertyTypes` compliance:** every optional callback prop that's forwarded without a default (`onNavigate`, `onToggleCollapse`) is typed `?: (() => void) | undefined` at each layer; every optional prop with a sensible default (`collapsed`, `profileHref`) is defaulted at destructuring so no `T | undefined` value is ever forwarded into a plain `?: T` prop.
- **No fabricated URLs:** `HelpMenu` uses static informational copy instead of inventing a support email or help-center domain.
