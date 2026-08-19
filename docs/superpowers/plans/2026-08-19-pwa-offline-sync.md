# PWA + Offline Sync (Présences / Notes / Appréciations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Schoolgesti installable as a PWA that loads instantly offline, keeps the three already-visited screens (Présences, Carnet de notes, Appréciations) readable offline, and lets a teacher mark attendance / enter grades / write appreciations offline — auto-syncing through the existing `api()` wrapper the moment connectivity returns.

**Architecture:** Two independent, additive layers on top of the existing app, neither of which changes any protected file or server contract. (1) A Serwist-generated service worker (`app/sw.ts`) precaches the app shell and network-first-caches the GET endpoints behind the three target screens. (2) A small IndexedDB mutation queue (`lib/offline-queue.ts`) that the three screens' existing save handlers fall back to when `api()` reports a connectivity failure — queued entries replay through the exact same `api()` function later (which already handles token refresh + CSRF), so no new auth or idempotency plumbing is needed; the three target server endpoints were verified to already be upsert-by-natural-key.

**Tech Stack:** Next.js 16 App Router, `@serwist/next`/`serwist` (service worker), `idb` (IndexedDB wrapper), `next/og`'s `ImageResponse` (app icons, zero extra dependency), Vitest + `fake-indexeddb` (queue unit tests), Puppeteer with Chrome DevTools Protocol network emulation (live offline E2E, mirroring this session's established login+fetch pattern).

**Spec:** [docs/superpowers/specs/2026-08-19-pwa-offline-sync-design.md](../specs/2026-08-19-pwa-offline-sync-design.md)

## Global Constraints

- No new routes under `app/api/**` in this plan except the icon-512 image route, which deliberately lives OUTSIDE `app/api/` (`app/icon-512/route.ts`) — it is still given `export const runtime = 'nodejs'` for consistency even though the CI tripwire (`runtime-enforcement.test.ts`) only scans `src/app/api/**/route.ts`.
- **Verified, not assumed:** `pnpm build` (`next build`, no flag) uses **Turbopack** in this repo (`▲ Next.js 16.3.0 (Turbopack)`, confirmed by actually running the build). Serwist supports Turbopack production builds — **do not** add a `--webpack` flag to `pnpm build`/`pnpm start`. `--webpack` is only ever needed on `next dev` if someone wants to manually exercise the service worker in dev, which this plan does not do (the SW stays `disable: true` in dev, matching Serwist's own documented recommendation).
- Package install shape confirmed via the official Serwist docs: `@serwist/next` is a regular dependency, `serwist` is a **devDependency** (only used inside the service-worker source, which is compiled away — never shipped as app runtime code). `idb` is a regular dependency (used by client-side app code, `lib/offline-queue.ts`). `fake-indexeddb` is a devDependency (tests only).
- `next.config.ts` already wraps its config with `withSentryConfig(config, {...})` at export time. `withSerwist` wraps that: `export default withSerwist(withSentryConfig(config, {...}))`.
- The three target server endpoints (verified by reading each route, not assumed) are upsert-by-natural-key — replaying a queued request twice is a no-op, never a duplicate:
  - `PATCH /api/school/attendance` — body `{ studentId, date, status }`.
  - `PUT /api/school/evaluations/[id]/grades` — body `{ grades: [...] }`.
  - `PUT /api/school/students/[id]/appreciations` — body `{ termId, subjectId, ... }`.
- `frontend/src/lib/api.ts` (protected — read only, never modified by this plan) already: (a) throws `ApiError` with `status === 0` for a genuine network/offline failure (`frontend/src/lib/api.ts:203-215`); (b) caches the CSRF token in `localStorage`, readable offline; (c) auto-refreshes an expired access token on a 401 before retrying once. The offline queue relies on all three behaviors as-is.
- UI copy in French, informal "tu" form, matching existing conventions. New copy lives in `frontend/src/lib/constants.ts` under a new `OFFLINE_SYNC` block.
- The toast system (`useToast()`, standardized earlier this session) is reused for the one-shot "queued"/"synced"/"failed" notices. The persistent "N en attente" pill is a separate, non-auto-dismissing component (`OfflineIndicator.tsx`) — it must NOT use the toast system, which always auto-dismisses.
- Before each task's commit: `pnpm format && pnpm --filter frontend run lint && pnpm typecheck` must pass (repo root). The final task additionally runs the full `pnpm test` suite and a live browser verification.
- Concurrent-session git safety (established convention this session): before every commit, `git fetch origin develop` + `git rev-list --left-right --count origin/develop...HEAD` to confirm no divergence; `git add` only the exact paths listed in each task's commit step, never `-A`/`.`; `git commit --only -m "..." -- <paths>`; push only after a second fetch/divergence check.

---

## File Structure

| Path | Responsibility |
|---|---|
| `frontend/package.json` (modify) | Add `@serwist/next`, `idb` deps; `serwist`, `fake-indexeddb` devDeps |
| `frontend/tsconfig.json` (modify) | `types: ["@serwist/next/typings"]`, `lib: [..., "webworker"]`, `exclude: ["public/sw.js"]` |
| `frontend/next.config.ts` (modify) | Wrap config with `withSerwist` (outermost, around `withSentryConfig`) |
| `frontend/src/app/manifest.ts` (create) | PWA manifest (name, icons, theme/background color, `display: standalone`) |
| `frontend/src/app/icon.tsx` (create) | 192×192 app icon via `next/og`'s `ImageResponse` (also wires the `<link rel="icon">`) |
| `frontend/src/app/apple-icon.tsx` (create) | 180×180 iOS home-screen icon |
| `frontend/src/app/icon-512/route.ts` (create) | 512×512 manifest icon (plain Route Handler, `ImageResponse`) |
| `frontend/src/app/sw.ts` (create) | Serwist service worker source — precache + runtime caching for the 3 target screens' GETs |
| `frontend/src/app/(offline)/~offline/page.tsx` (create) | Offline-fallback page shown when a navigation isn't cached and the network is down |
| `frontend/src/components/ServiceWorkerRegister.tsx` (create) | Client component, registers `/sw.js` on mount |
| `frontend/src/app/layout.tsx` (modify) | Mount `<ServiceWorkerRegister />` |
| `frontend/src/lib/offline-queue.ts` (create) | IndexedDB mutation queue: `enqueue`, `listPending`, `submitOrQueue`, `drain`, `subscribe` |
| `frontend/src/lib/offline-queue.test.ts` (create) | Vitest, `fake-indexeddb`, mocked `@/lib/api` |
| `frontend/src/components/layout/topbar/OfflineIndicator.tsx` (create) | Persistent "N en attente" pill; drives drain triggers (online/visibility/interval) |
| `frontend/src/components/layout/SchoolTopbar.tsx` (modify) | Mount `<OfflineIndicator />` |
| `frontend/src/lib/constants.ts` (modify) | New `OFFLINE_SYNC` copy block |
| `frontend/src/app/(school)/pedagogie/presences/page.tsx` (modify) | `markDay` uses `submitOrQueue` |
| `frontend/src/app/(school)/pedagogie/carnet-de-notes/[evaluationId]/saisie/page.tsx` (modify) | `save()` uses `submitOrQueue` for the grades PUT + optional publish PATCH |
| `frontend/src/app/(school)/pedagogie/appreciations/[studentId]/saisie/page.tsx` (modify) | `save()` uses `submitOrQueue` for the générale + per-subject PUTs |

---

### Task 1: PWA shell scaffolding — deps, config, manifest, icons

**Files:**
- Modify: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/next.config.ts`
- Create: `frontend/src/app/manifest.ts`, `frontend/src/app/icon.tsx`, `frontend/src/app/apple-icon.tsx`, `frontend/src/app/icon-512/route.ts`

**Interfaces:**
- Produces: `public/sw.js` generated at build time (empty/no-op until Task 2 fills in `app/sw.ts`); `/manifest.webmanifest` route (Next's native `manifest.ts` convention); `/icon`, `/apple-icon`, `/icon-512` image routes.

- [ ] **Step 1: Install dependencies**

Run (from repo root):
```bash
pnpm --filter frontend add @serwist/next idb
pnpm --filter frontend add -D serwist fake-indexeddb
```
Expected: `frontend/package.json` gains `@serwist/next` and `idb` under `dependencies`, `serwist` and `fake-indexeddb` under `devDependencies`.

- [ ] **Step 2: Update `tsconfig.json`**

In `frontend/tsconfig.json`, inside `compilerOptions`, add `"@serwist/next/typings"` to the existing `types` array (create the array with just this entry if none exists) and `"webworker"` to the existing `lib` array. At the top level (sibling to `compilerOptions`), add or extend `"exclude"` to include `"public/sw.js"` (this file doesn't exist yet — it's generated by Task 2's build — excluding it now means `tsc` never trips over the generated JS output once it appears).

- [ ] **Step 3: Wrap `next.config.ts` with `withSerwist`**

In `frontend/next.config.ts`, add near the top (after the existing `withSentryConfig` import):

```ts
import withSerwistInit from '@serwist/next';
```

Add right before the final `export default withSentryConfig(config, {...})` block a new constant:

```ts
// Serwist (successor to the unmaintained next-pwa) generates public/sw.js at
// build time from app/sw.ts. Confirmed via a live run of `pnpm build` in
// this repo that production builds use Turbopack (`▲ Next.js 16.3.0
// (Turbopack)`) — Serwist supports Turbopack builds, unlike next-pwa, so no
// --webpack flag is needed here. The SW is disabled entirely in dev
// (Serwist's own documented recommendation — offline behavior is verified
// against `pnpm build && pnpm start`, see docs/superpowers/specs/
// 2026-08-19-pwa-offline-sync-design.md).
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});
```

Change the file's final export from:
```ts
export default withSentryConfig(config, {
```
to wrap that whole call:
```ts
export default withSerwist(
  withSentryConfig(config, {
```
...closing the extra paren at the very end of the file (after the existing closing `});` of `withSentryConfig`, add a matching `)`).

- [ ] **Step 4: Create the manifest**

Create `frontend/src/app/manifest.ts`:

```ts
// PWA manifest — Next's native app/manifest.ts convention (no separate
// static manifest.json needed). Colors match the app's real design tokens
// (globals.css --color-primary / --color-background), not the unused
// teal/orange monogram gradient under public/logos/ (that artwork isn't
// wired into any shipped CSS token — the app's actual live palette is
// purple, see globals.css's "Lavender SaaS" theme comment).
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Schoolgesti',
    short_name: 'Schoolgesti',
    description: 'La plateforme tout-en-un de gestion scolaire.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f3f3f7',
    theme_color: '#6c2bd9',
    icons: [
      { src: '/icon', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

- [ ] **Step 5: Create the icons**

Create `frontend/src/app/icon.tsx`:

```tsx
// Next's native app/icon.tsx convention — auto-wraps this in ImageResponse
// (next/og, bundled with Next.js, zero extra dependency) and wires the
// <link rel="icon"> tag for free. 192×192 for the PWA manifest's smaller
// icon slot.
import { ImageResponse } from 'next/og';

export const size = { width: 192, height: 192 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#6c2bd9',
          borderRadius: 40,
          color: '#ffffff',
          fontSize: 96,
          fontWeight: 700,
          fontFamily: 'sans-serif',
        }}
      >
        SG
      </div>
    ),
    { ...size },
  );
}
```

Create `frontend/src/app/apple-icon.tsx` (same shape, iOS's recommended 180×180, no rounded corners — iOS applies its own mask):

```tsx
// iOS home-screen icon (Next's native app/apple-icon.tsx convention) — iOS
// applies its own rounded-square mask, so this stays a plain filled square.
import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#6c2bd9',
          color: '#ffffff',
          fontSize: 90,
          fontWeight: 700,
          fontFamily: 'sans-serif',
        }}
      >
        SG
      </div>
    ),
    { ...size },
  );
}
```

Create `frontend/src/app/icon-512/route.ts` (the manifest's larger icon slot — a plain Route Handler using `ImageResponse` directly, since Next's special-filename convention only produces one size per filename):

```ts
// 512×512 manifest icon. Not using the app/icon.tsx special-filename
// convention (that only yields one size) — a plain Route Handler calling
// ImageResponse directly works identically and lets both sizes coexist.
export const runtime = 'nodejs';

import { ImageResponse } from 'next/og';

export async function GET(): Promise<Response> {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#6c2bd9',
          borderRadius: 104,
          color: '#ffffff',
          fontSize: 256,
          fontWeight: 700,
          fontFamily: 'sans-serif',
        }}
      >
        SG
      </div>
    ),
    { width: 512, height: 512 },
  );
}
```

- [ ] **Step 6: Build and verify**

Run: `pnpm build` (from `frontend/`)
Expected: build succeeds; `public/sw.js` now exists (`ls frontend/public/sw.js`); the build output includes `○ /manifest.webmanifest`, `○ /icon`, `○ /apple-icon`, `○ /icon-512` among the generated routes.

Run: `pnpm typecheck && pnpm --filter frontend run lint` (repo root)
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/tsconfig.json frontend/next.config.ts frontend/src/app/manifest.ts frontend/src/app/icon.tsx frontend/src/app/apple-icon.tsx "frontend/src/app/icon-512/route.ts"
git commit -m "feat(pwa): installable shell — manifest, icons, Serwist scaffolding

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Service worker — precache + runtime caching for the 3 offline screens

**Files:**
- Create: `frontend/src/app/sw.ts`, `frontend/src/app/(offline)/~offline/page.tsx`, `frontend/src/components/ServiceWorkerRegister.tsx`
- Modify: `frontend/src/app/layout.tsx`, `frontend/next.config.ts` (add `additionalPrecacheEntries` for the offline fallback)

**Interfaces:**
- Consumes: `withSerwist` from Task 1.
- Produces: a real, non-empty `public/sw.js`; `/~offline` route; `ServiceWorkerRegister` (no props, no exports besides the default component).

- [ ] **Step 1: Add the offline fallback page**

Create `frontend/src/app/(offline)/~offline/page.tsx`:

```tsx
// Shown by the service worker (see sw.ts's `fallbacks`) when a navigation
// isn't in the precache/runtime cache AND the network is unreachable — the
// last-resort screen instead of the browser's own "no internet" page.
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <h1 className="text-xl font-bold text-foreground">Pas de connexion</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Cette page n&apos;a pas encore été chargée hors-ligne. Reconnecte-toi puis réessaie — les
        écrans déjà consultés (présences, notes, appréciations) restent disponibles hors-ligne.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Wire the offline fallback into the Serwist config**

In `frontend/next.config.ts`, inside the `withSerwistInit({...})` call from Task 1, add `additionalPrecacheEntries` so the fallback page itself is always in the precache (it must be available BEFORE the SW would ever need to show it):

```ts
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  additionalPrecacheEntries: [{ url: '/~offline', revision: null }],
});
```

- [ ] **Step 3: Create the service worker source**

Create `frontend/src/app/sw.ts`:

```ts
// Serwist service worker source, compiled to public/sw.js at build time
// (frontend/next.config.ts's withSerwist). Two jobs: (1) precache the app
// shell via defaultCache so the UI loads with zero network, (2) network-
// first cache the GET endpoints behind the three offline-writable screens
// (Présences, Carnet de notes, Appréciations — see docs/superpowers/specs/
// 2026-08-19-pwa-offline-sync-design.md) so data already fetched once
// stays readable offline. Everything else (payments, billing, admin) is
// deliberately NOT added here — those screens keep today's plain "erreur
// réseau" behavior offline, unchanged.
import { defaultCache } from '@serwist/next/worker';
import { ExpirationPlugin, NetworkFirst, Serwist } from 'serwist';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

function isOfflineScreenApi({ url }: { url: URL }): boolean {
  const p = url.pathname;
  return (
    p.startsWith('/api/school/attendance') ||
    p.startsWith('/api/school/evaluations/') ||
    p.startsWith('/api/school/class-subjects/') ||
    p.includes('/appreciations')
  );
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ request, url }) => request.method === 'GET' && isOfflineScreenApi({ url }),
      handler: new NetworkFirst({
        cacheName: 'offline-screens-api',
        networkTimeoutSeconds: 4,
        plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 6 * 60 * 60 })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/~offline',
        matcher({ request }) {
          return request.destination === 'document';
        },
      },
    ],
  },
});

serwist.addEventListeners();
```

- [ ] **Step 4: Register the service worker in the browser**

Create `frontend/src/components/ServiceWorkerRegister.tsx`:

```tsx
'use client';

// Serwist compiles app/sw.ts to public/sw.js but does NOT auto-register it
// in the browser — that's this component's one job. Mounted once in the
// root layout so it covers the whole app, not just the school shell (the
// app-shell precache benefits every route).
import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Unsupported browser or blocked by the user — the app works exactly
      // as it does today, just without the offline layer. Nothing to
      // surface to the user; this is a silent capability check, same
      // posture as the app's other conditionally-inert providers.
    });
  }, []);

  return null;
}
```

- [ ] **Step 5: Mount it in the root layout**

In `frontend/src/app/layout.tsx`, add the import:

```ts
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
```

Add `<ServiceWorkerRegister />` as the first child inside `<body>`, before `<ToastProvider>`:

```tsx
<body className={inter.className}>
  <ServiceWorkerRegister />
  <ToastProvider>
    <ConfirmProvider>
      <AuthProvider>{children}</AuthProvider>
    </ConfirmProvider>
  </ToastProvider>
</body>
```

- [ ] **Step 6: Build, start, and verify the service worker actually registers**

Run: `pnpm build && pnpm start &` (from `frontend/`, background it or use a separate terminal) then, once "Ready" is logged, run this against `http://localhost:3000`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/sw.js
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/manifest.webmanifest
```
Expected: both `200`.

Then verify the browser actually registers it — this needs no login, since `ServiceWorkerRegister` mounts in the root layout for every route including the public `/login` page. Write and run this standalone script (adjust `EXEC` if the headless Chromium binary lives elsewhere in this environment):

```js
// verify-sw.mjs
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/tmp/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1000)); // let the register() effect run
const registrations = await page.evaluate(() =>
  navigator.serviceWorker.getRegistrations().then((rs) => rs.length),
);
console.log('SW registrations:', registrations);
await browser.close();
```

Run it from `frontend/` (so `puppeteer-core` resolves): `node verify-sw.mjs`
Expected: `SW registrations: 1`. Delete `verify-sw.mjs` afterward — it's a throwaway check, not part of the shipped codebase. Stop the `pnpm start` server afterward.

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm typecheck && pnpm --filter frontend run lint` (repo root)
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/next.config.ts frontend/src/app/sw.ts "frontend/src/app/(offline)/~offline/page.tsx" frontend/src/components/ServiceWorkerRegister.tsx frontend/src/app/layout.tsx
git commit -m "feat(pwa): service worker — app-shell precache + offline-screen API caching

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Offline mutation queue (`lib/offline-queue.ts`)

**Files:**
- Create: `frontend/src/lib/offline-queue.ts`, `frontend/src/lib/offline-queue.test.ts`

**Interfaces:**
- Consumes: `api`, `ApiError` from `@/lib/api` (existing, protected — read-only).
- Produces (consumed by Tasks 4-7):
  - `export type QueuedMethod = 'PATCH' | 'PUT' | 'DELETE'`
  - `export interface QueuedMutation { id: string; path: string; method: QueuedMethod; body?: unknown; label: string; userId: string; createdAt: string }`
  - `export interface DrainResult { synced: number; failed: number; stillPending: number; stoppedReason: 'offline' | 'auth' | null }`
  - `export function enqueue(entry: Omit<QueuedMutation, 'id' | 'createdAt'>): Promise<void>`
  - `export function listPending(userId: string): Promise<QueuedMutation[]>`
  - `export function submitOrQueue<T>(entry: { path: string; method: QueuedMethod; body?: unknown; label: string }, userId: string): Promise<{ queued: boolean; result?: T }>`
  - `export function drain(userId: string): Promise<DrainResult>`
  - `export function subscribe(listener: () => void): () => void`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/offline-queue.test.ts`:

```ts
// lib/offline-queue.ts — IndexedDB-backed mutation queue for the 3
// offline-writable screens (spec: docs/superpowers/specs/
// 2026-08-19-pwa-offline-sync-design.md). fake-indexeddb gives real
// IndexedDB semantics (not a hand-mocked stub) — important since ordering
// and async timing are exactly what this module needs to get right.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import { api, ApiError } from '@/lib/api';
import { drain, enqueue, listPending, submitOrQueue } from './offline-queue';

const mockApi = vi.mocked(api);

beforeEach(() => {
  vi.clearAllMocks();
  indexedDB.deleteDatabase('schoolgesti-offline-queue');
});

afterEach(() => {
  indexedDB.deleteDatabase('schoolgesti-offline-queue');
});

describe('enqueue / listPending', () => {
  it('lists only the given user\'s entries, oldest first', async () => {
    await enqueue({ path: '/a', method: 'PATCH', label: 'A', userId: 'u1' });
    await new Promise((r) => setTimeout(r, 2));
    await enqueue({ path: '/b', method: 'PATCH', label: 'B', userId: 'u1' });
    await enqueue({ path: '/c', method: 'PATCH', label: 'C', userId: 'u2' });

    const pendingU1 = await listPending('u1');
    expect(pendingU1.map((m) => m.path)).toEqual(['/a', '/b']);
    const pendingU2 = await listPending('u2');
    expect(pendingU2.map((m) => m.path)).toEqual(['/c']);
  });
});

describe('submitOrQueue', () => {
  it('returns the result and does not queue when the call succeeds', async () => {
    mockApi.mockResolvedValueOnce({ ok: true });
    const r = await submitOrQueue<{ ok: boolean }>(
      { path: '/api/school/attendance', method: 'PATCH', label: 'Présence' },
      'u1',
    );
    expect(r).toEqual({ queued: false, result: { ok: true } });
    expect(await listPending('u1')).toHaveLength(0);
  });

  it('queues instead of throwing when api() reports status 0 (offline)', async () => {
    mockApi.mockRejectedValueOnce(new ApiError(0, 'No internet connection.'));
    const r = await submitOrQueue(
      { path: '/api/school/attendance', method: 'PATCH', body: { a: 1 }, label: 'Présence' },
      'u1',
    );
    expect(r).toEqual({ queued: true });
    const pending = await listPending('u1');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      path: '/api/school/attendance',
      method: 'PATCH',
      body: { a: 1 },
      label: 'Présence',
      userId: 'u1',
    });
  });

  it('rethrows a real error (e.g. validation) without queuing', async () => {
    mockApi.mockRejectedValueOnce(new ApiError(400, 'VALIDATION_FAILED'));
    await expect(
      submitOrQueue({ path: '/x', method: 'PUT', label: 'X' }, 'u1'),
    ).rejects.toThrow('VALIDATION_FAILED');
    expect(await listPending('u1')).toHaveLength(0);
  });
});

describe('drain', () => {
  it('replays entries in order, removing each on success', async () => {
    await enqueue({ path: '/a', method: 'PATCH', label: 'A', userId: 'u1' });
    await enqueue({ path: '/b', method: 'PATCH', label: 'B', userId: 'u1' });
    mockApi.mockResolvedValue({});

    const result = await drain('u1');

    expect(result).toEqual({ synced: 2, failed: 0, stillPending: 0, stoppedReason: null });
    expect(mockApi).toHaveBeenNthCalledWith(1, '/a', { method: 'PATCH', body: undefined });
    expect(mockApi).toHaveBeenNthCalledWith(2, '/b', { method: 'PATCH', body: undefined });
  });

  it('stops draining (offline) on a status-0 failure, leaving the rest queued', async () => {
    await enqueue({ path: '/a', method: 'PATCH', label: 'A', userId: 'u1' });
    await enqueue({ path: '/b', method: 'PATCH', label: 'B', userId: 'u1' });
    mockApi.mockRejectedValueOnce(new ApiError(0, 'offline'));

    const result = await drain('u1');

    expect(result).toEqual({ synced: 0, failed: 0, stillPending: 2, stoppedReason: 'offline' });
    expect(mockApi).toHaveBeenCalledTimes(1);
  });

  it('stops draining (auth) on a 401 — refresh already failed inside api()', async () => {
    await enqueue({ path: '/a', method: 'PATCH', label: 'A', userId: 'u1' });
    mockApi.mockRejectedValueOnce(new ApiError(401, 'unauthorized'));

    const result = await drain('u1');

    expect(result).toEqual({ synced: 0, failed: 0, stillPending: 1, stoppedReason: 'auth' });
  });

  it('drops a permanently-failing entry (real 4xx) and keeps draining the rest', async () => {
    await enqueue({ path: '/bad', method: 'PUT', label: 'Bad', userId: 'u1' });
    await enqueue({ path: '/good', method: 'PATCH', label: 'Good', userId: 'u1' });
    mockApi.mockRejectedValueOnce(new ApiError(404, 'not found')).mockResolvedValueOnce({});

    const result = await drain('u1');

    expect(result).toEqual({ synced: 1, failed: 1, stillPending: 0, stoppedReason: null });
    expect(await listPending('u1')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/lib/offline-queue.test.ts`
Expected: FAIL — `Failed to resolve import "./offline-queue"` (file doesn't exist yet).

- [ ] **Step 3: Implement the queue**

Create `frontend/src/lib/offline-queue.ts`:

```ts
// IndexedDB-backed queue of mutations that couldn't reach the server
// because of a connectivity failure. Not a general offline-first sync
// engine — deliberately scoped to the 3 write flows named in the spec
// (Présences / Carnet de notes / Appréciations). Replays go through the
// exact same lib/api.ts `api()` function real-time actions use, so token
// refresh + CSRF "just work" with zero new plumbing. Spec: docs/
// superpowers/specs/2026-08-19-pwa-offline-sync-design.md
import 'client-only';
import { openDB, type IDBPDatabase } from 'idb';
import { api, ApiError } from '@/lib/api';

const DB_NAME = 'schoolgesti-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'mutations';

export type QueuedMethod = 'PATCH' | 'PUT' | 'DELETE';

export interface QueuedMutation {
  id: string;
  path: string;
  method: QueuedMethod;
  body?: unknown;
  /** Short human-readable label for the offline indicator, e.g. "Présence — Awa K." */
  label: string;
  /** Stamped at enqueue time so a device shared by two accounts never
   * replays one user's queued writes under another user's session. */
  userId: string;
  createdAt: string;
}

export interface DrainResult {
  synced: number;
  failed: number;
  stillPending: number;
  stoppedReason: 'offline' | 'auth' | null;
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** Notified after every enqueue/drain — the offline indicator subscribes
 * to know when to re-read `listPending()`. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function notify(): void {
  for (const l of listeners) l();
}

let dbPromise: Promise<IDBPDatabase> | null = null;
function getDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    },
  });
  return dbPromise;
}

export async function enqueue(entry: Omit<QueuedMutation, 'id' | 'createdAt'>): Promise<void> {
  const db = await getDb();
  const mutation: QueuedMutation = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await db.add(STORE_NAME, mutation);
  notify();
}

export async function listPending(userId: string): Promise<QueuedMutation[]> {
  const db = await getDb();
  const all = (await db.getAll(STORE_NAME)) as QueuedMutation[];
  return all
    .filter((m) => m.userId === userId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function remove(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

/**
 * Try a mutation now; if it fails purely because of connectivity (ApiError
 * status 0 — lib/api.ts's own signal for "fetch itself threw", see
 * lib/api.ts:203-215), queue it instead of throwing. Any other error
 * (validation, 404, ...) still throws normally — existing catch/toast
 * handling at call sites is unchanged for real errors.
 */
export async function submitOrQueue<T>(
  entry: { path: string; method: QueuedMethod; body?: unknown; label: string },
  userId: string,
): Promise<{ queued: boolean; result?: T }> {
  try {
    const result = await api<T>(entry.path, { method: entry.method, body: entry.body });
    return { queued: false, result };
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) {
      await enqueue({ ...entry, userId });
      return { queued: true };
    }
    throw err;
  }
}

/**
 * Replay queued mutations for `userId`, oldest first, one at a time.
 * - status 0 (still offline) or any non-ApiError/>=500 failure: transient —
 *   stop draining, leave this entry and the rest queued for next time.
 * - status 401: api()'s own refresh-on-401 already tried and failed (if it
 *   had succeeded, api() would have returned successfully, not thrown) —
 *   stop draining, same as transient, but callers show a reconnect-
 *   specific message instead of a generic "hors ligne" one.
 * - any other 4xx: the request itself is rejected, not a connectivity
 *   problem (e.g. the record was deleted server-side while offline) —
 *   permanent, drop this one entry, keep draining the rest.
 */
export async function drain(userId: string): Promise<DrainResult> {
  const pending = await listPending(userId);
  let synced = 0;
  let failed = 0;
  let stoppedReason: DrainResult['stoppedReason'] = null;

  for (const mutation of pending) {
    try {
      await api(mutation.path, { method: mutation.method, body: mutation.body });
      await remove(mutation.id);
      synced++;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        stoppedReason = 'auth';
        break;
      }
      if (err instanceof ApiError && err.status !== 0 && err.status < 500) {
        await remove(mutation.id);
        failed++;
        continue;
      }
      stoppedReason = 'offline';
      break;
    }
  }

  notify();
  const stillPending = (await listPending(userId)).length;
  return { synced, failed, stillPending, stoppedReason };
}
```

Note: `import 'client-only'` guards against this module accidentally being imported from server code (it uses `indexedDB`/`crypto.randomUUID()` browser globals). `client-only` ships with Next.js — no new dependency. If the package isn't resolvable in this Next version, delete that one import line; it's a defensive guard, not load-bearing.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/lib/offline-queue.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm --filter frontend run lint` (repo root)
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/offline-queue.ts frontend/src/lib/offline-queue.test.ts
git commit -m "feat(pwa): IndexedDB offline mutation queue (enqueue/drain/submitOrQueue)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Offline indicator + topbar wiring

**Files:**
- Create: `frontend/src/components/layout/topbar/OfflineIndicator.tsx`
- Modify: `frontend/src/components/layout/SchoolTopbar.tsx`, `frontend/src/lib/constants.ts`

**Interfaces:**
- Consumes: `listPending`, `subscribe`, `drain`, `type QueuedMutation` from `@/lib/offline-queue` (Task 3); `useUser` from `@/contexts/AuthContext`; `useToast` from `@/contexts/ToastContext`.
- Produces: `OfflineIndicator` (no props) mounted in the topbar.

- [ ] **Step 1: Add copy to `constants.ts`**

In `frontend/src/lib/constants.ts`, add near the end of the file:

```ts
export const OFFLINE_SYNC = {
  offline: (count: number) => `Hors ligne — ${count} en attente`,
  reconnect: (count: number) => `Reconnecte-toi pour synchroniser ${count} modification(s)`,
  queuedToast: 'Hors ligne — sera synchronisé automatiquement.',
  syncedToast: 'Synchronisé.',
  failedToast: (count: number) =>
    `${count} modification${count > 1 ? 's' : ''} n'ont pas pu être synchronisée${count > 1 ? 's' : ''}.`,
};
```

- [ ] **Step 2: Create the indicator**

Create `frontend/src/components/layout/topbar/OfflineIndicator.tsx`:

```tsx
'use client';

// Persistent "N en attente" pill — NOT a toast (toasts auto-dismiss after
// 4s; this must stay visible for as long as entries are queued). Drives
// the queue's drain triggers: the browser's online event, the tab
// regaining foreground focus, and a 30s interval fallback (the online
// event alone is known to be unreliable on Android Chrome — this
// redundancy is deliberate, see the design spec).
import { useCallback, useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { drain, listPending, subscribe, type QueuedMutation } from '@/lib/offline-queue';
import { OFFLINE_SYNC } from '@/lib/constants';

export function OfflineIndicator() {
  const user = useUser();
  const { toast } = useToast();
  const [pending, setPending] = useState<QueuedMutation[]>([]);
  const [reconnectNeeded, setReconnectNeeded] = useState(false);
  const drainingRef = useRef(false);
  const wasPendingRef = useRef(false);

  const refresh = useCallback(() => {
    if (!user) {
      setPending([]);
      return;
    }
    listPending(user.id)
      .then(setPending)
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    refresh();
    return subscribe(refresh);
  }, [refresh]);

  const runDrain = useCallback(() => {
    if (!user || drainingRef.current) return;
    drainingRef.current = true;
    drain(user.id)
      .then((result) => {
        setReconnectNeeded(result.stoppedReason === 'auth');
        if (result.failed > 0) {
          toast(OFFLINE_SYNC.failedToast(result.failed), 'error');
        }
      })
      .finally(() => {
        drainingRef.current = false;
      });
  }, [user, toast]);

  useEffect(() => {
    if (!user) return;
    runDrain();
    function onVisible() {
      if (document.visibilityState === 'visible') runDrain();
    }
    window.addEventListener('online', runDrain);
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(runDrain, 30_000);
    return () => {
      window.removeEventListener('online', runDrain);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, [user, runDrain]);

  useEffect(() => {
    if (wasPendingRef.current && pending.length === 0) {
      toast(OFFLINE_SYNC.syncedToast, 'success');
    }
    wasPendingRef.current = pending.length > 0;
  }, [pending.length, toast]);

  if (pending.length === 0) return null;

  return (
    <div className="hidden h-10 items-center gap-1.5 rounded-full border border-warning-foreground/20 bg-warning px-3.5 text-xs font-medium text-warning-foreground sm:flex">
      <WifiOff size={13} />
      {reconnectNeeded ? OFFLINE_SYNC.reconnect(pending.length) : OFFLINE_SYNC.offline(pending.length)}
    </div>
  );
}
```

- [ ] **Step 3: Mount it in the topbar**

In `frontend/src/components/layout/SchoolTopbar.tsx`, add the import:

```ts
import { OfflineIndicator } from './topbar/OfflineIndicator';
```

In the right-side `<div className="flex items-center gap-2">` group, add `<OfflineIndicator />` as the first child (most urgent item), before `<CommandPalette .../>`:

```tsx
<div className="flex items-center gap-2">
  <OfflineIndicator />
  <CommandPalette sections={SCHOOL_SECTIONS} />
  <AcademicYearBadge />
  <NotificationsMenu />
  <HelpMenu />
</div>
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && pnpm --filter frontend run lint` (repo root)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/constants.ts frontend/src/components/layout/topbar/OfflineIndicator.tsx frontend/src/components/layout/SchoolTopbar.tsx
git commit -m "feat(pwa): offline indicator pill in the school topbar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire Présences to the offline queue

**Files:**
- Modify: `frontend/src/app/(school)/pedagogie/presences/page.tsx`

**Interfaces:**
- Consumes: `submitOrQueue` from `@/lib/offline-queue` (Task 3).

- [ ] **Step 1: Import `submitOrQueue`**

In `frontend/src/app/(school)/pedagogie/presences/page.tsx`, add:

```ts
import { submitOrQueue } from '@/lib/offline-queue';
```

- [ ] **Step 2: Update `markDay`**

Replace the existing `markDay` function (currently at line 214) with:

```ts
  async function markDay(studentId: string, date: string, status: AttendanceStatus | null) {
    if (!user) return;
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        students: prev.students.map((s) =>
          s.id === studentId
            ? { ...s, days: { ...s.days, [date]: status ? { status, justification: null } : null } }
            : s,
        ),
      };
    });
    const entry =
      status === null
        ? {
            path: `/api/school/attendance?studentId=${studentId}&date=${date}`,
            method: 'DELETE' as const,
            label: 'Présence',
          }
        : {
            path: '/api/school/attendance',
            method: 'PATCH' as const,
            body: { studentId, date, status },
            label: 'Présence',
          };
    try {
      const r = await submitOrQueue(entry, user.id);
      if (r.queued) {
        toast(OFFLINE_SYNC.queuedToast, 'info');
      } else {
        refresh();
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
      refresh();
    }
  }
```

Add the `OFFLINE_SYNC` import alongside the existing constants import (or add a new import line if none exists yet):

```ts
import { OFFLINE_SYNC } from '@/lib/constants';
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm --filter frontend run lint` (repo root)
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(school)/pedagogie/presences/page.tsx"
git commit -m "feat(pwa): présences — mark-day falls back to the offline queue

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Wire Carnet de notes (grade entry) to the offline queue

**Files:**
- Modify: `frontend/src/app/(school)/pedagogie/carnet-de-notes/[evaluationId]/saisie/page.tsx`

**Interfaces:**
- Consumes: `submitOrQueue` from `@/lib/offline-queue` (Task 3).

- [ ] **Step 1: Import `submitOrQueue` and `OFFLINE_SYNC`**

```ts
import { submitOrQueue } from '@/lib/offline-queue';
import { OFFLINE_SYNC } from '@/lib/constants';
```

- [ ] **Step 2: Update `save()`**

Replace the existing `save` function (currently at line 205) with:

```ts
  async function save(publish: boolean) {
    if (!evaluation || !notebook || !user) return;
    setSaving(true);
    setError(null);
    try {
      const grades = notebook.students.map((s) => {
        const r = rows[s.studentId]!;
        return {
          studentId: s.studentId,
          score: r.absent || r.score.trim() === '' ? null : Number(r.score),
          absent: r.absent,
          comment: r.comment.trim() || null,
        };
      });
      const gradesResult = await submitOrQueue(
        {
          path: `/api/school/evaluations/${evaluation.id}/grades`,
          method: 'PUT',
          body: { grades },
          label: `Notes — ${evaluation.classSubject.subject.name}`,
        },
        user.id,
      );
      let queued = gradesResult.queued;
      if (publish) {
        const publishResult = await submitOrQueue(
          {
            path: `/api/school/evaluations/${evaluation.id}`,
            method: 'PATCH' as const,
            body: { status: 'PUBLISHED' },
            label: `Validation — ${evaluation.classSubject.subject.name}`,
          },
          user.id,
        );
        queued = queued || publishResult.queued;
      }
      if (queued) {
        toast(OFFLINE_SYNC.queuedToast, 'info');
      } else if (publish) {
        toast('Notes validées.', 'success');
      } else {
        toast('Brouillon enregistré.', 'success');
      }
      if (publish) {
        router.push('/pedagogie/carnet-de-notes');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    } finally {
      setSaving(false);
    }
  }
```

Note: the original code called this endpoint with `method: 'PATCH'` (`await api(..., { method: 'PATCH', body: { status: 'PUBLISHED' } })`) — preserved above unchanged, just routed through `submitOrQueue`.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm --filter frontend run lint` (repo root)
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(school)/pedagogie/carnet-de-notes/[evaluationId]/saisie/page.tsx"
git commit -m "feat(pwa): carnet de notes — grade save falls back to the offline queue

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Wire Appréciations to the offline queue

**Files:**
- Modify: `frontend/src/app/(school)/pedagogie/appreciations/[studentId]/saisie/page.tsx`

**Interfaces:**
- Consumes: `submitOrQueue` from `@/lib/offline-queue` (Task 3).

- [ ] **Step 1: Import `submitOrQueue` and `OFFLINE_SYNC`**

```ts
import { submitOrQueue } from '@/lib/offline-queue';
import { OFFLINE_SYNC } from '@/lib/constants';
```

- [ ] **Step 2: Update `save()`**

Replace the existing `save` function (currently at line 133) with:

```ts
  async function save(publish: boolean) {
    if (!data || !user) return;
    setSaving(true);
    setError(null);
    const status = publish ? 'PUBLISHED' : 'DRAFT';
    try {
      const generalResult = await submitOrQueue(
        {
          path: `/api/school/students/${data.studentId}/appreciations`,
          method: 'PUT',
          body: {
            termId: data.resolvedTermId,
            subjectId: null,
            mention,
            text,
            comportement,
            investissement,
            assiduite,
            status,
          },
          label: `Appréciation générale — ${data.firstName} ${data.lastName}`,
        },
        user.id,
      );
      const subjectResults = await Promise.all(
        data.subjects
          .filter((s) => (subjectRows[s.subjectId]?.text ?? '').trim() !== '')
          .map((s) =>
            submitOrQueue(
              {
                path: `/api/school/students/${data.studentId}/appreciations`,
                method: 'PUT' as const,
                body: {
                  termId: data.resolvedTermId,
                  subjectId: s.subjectId,
                  text: subjectRows[s.subjectId]!.text,
                  mention: suggestMention(s.average),
                  status,
                },
                label: `Appréciation — ${data.firstName} ${data.lastName}`,
              },
              user.id,
            ),
          ),
      );
      const anyQueued = generalResult.queued || subjectResults.some((r) => r.queued);
      if (anyQueued) {
        toast(OFFLINE_SYNC.queuedToast, 'info');
      } else if (publish) {
        toast('Appréciation validée.', 'success');
      } else {
        toast('Brouillon enregistré.', 'success');
      }
      if (publish) {
        if (data.nextStudentId) {
          router.push(
            `/pedagogie/appreciations/${data.nextStudentId}/saisie?termId=${data.resolvedTermId}`,
          );
        } else {
          router.push('/pedagogie/appreciations');
        }
      }
    } catch (err) {
```

(Keep the existing `catch`/`finally` block below this point exactly as-is — only the `try` body above changes.)

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm --filter frontend run lint` (repo root)
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(school)/pedagogie/appreciations/[studentId]/saisie/page.tsx"
git commit -m "feat(pwa): appréciations — save falls back to the offline queue

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Live E2E verification + Lighthouse + final gate

**Files:** none created/modified — verification only.

**Interfaces:** none (this task exercises Tasks 1-7 end-to-end).

- [ ] **Step 1: Full production build + start**

Run (from `frontend/`): `pnpm build && pnpm start &`
Expected: build succeeds, server logs "Ready" on port 3000. Keep it running for the steps below.

- [ ] **Step 2: Puppeteer E2E — all 3 flows survive an offline→online cycle**

This is a live verification checklist, not a pre-written script — the exact
selectors on each page (button labels, input names) should be discovered by
inspecting the live DOM at run time (`page.$$eval`, text-content matching),
the same way every other live-verification pass in this codebase works.
Write one script per the shape below; the one non-obvious, load-bearing
piece is the CDP network-emulation calls, given here in full since that API
isn't used anywhere else in this codebase yet:

```js
// verify-offline-sync.mjs
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/tmp/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();

// 1. Log in (standard flow — same test account used throughout this
//    project's manual verification passes: amosdorceus2023@gmail.com /
//    TestEcole2026!).
await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
await page.type('input[type="email"], input[name="email"]', 'amosdorceus2023@gmail.com');
await page.type('input[type="password"], input[name="password"]', 'TestEcole2026!');
const submitBtn = await page.$('button[type="submit"]');
await Promise.all([
  page.waitForResponse((r) => r.url().includes('/api/auth') && r.request().method() === 'POST'),
  submitBtn.click(),
]);
await new Promise((r) => setTimeout(r, 1200));

// 2. Visit each of the 3 offline screens ONCE while online, so their GET
//    responses populate the service worker's runtime cache (the whole
//    point of Task 2's NetworkFirst caching — a screen never visited
//    online has nothing to fall back to offline).
await page.goto('http://localhost:3000/pedagogie/presences', { waitUntil: 'networkidle0' });
await page.goto('http://localhost:3000/pedagogie/carnet-de-notes', { waitUntil: 'networkidle0' });
await page.goto('http://localhost:3000/pedagogie/appreciations', { waitUntil: 'networkidle0' });

// 3. Go offline via CDP (not navigator.onLine — this actually blocks the
//    network at the protocol level, which is what both the service worker
//    and lib/api.ts's fetch() calls see).
const client = await page.createCDPSession();
await client.send('Network.emulateNetworkConditions', {
  offline: true,
  latency: 0,
  downloadThroughput: 0,
  uploadThroughput: 0,
});

// 4. On the présences screen, click a present/absent toggle for the first
//    student and confirm: (a) the cell updates optimistically, (b) the
//    OfflineIndicator pill in the topbar now reads "1 en attente" (find it
//    by its text content, e.g. via page.$$eval('div', ...) filtering for
//    "en attente"). Repeat the same shape for one grade edit on Carnet de
//    notes and one appreciation save.

// 5. Go back online.
await client.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
});
await new Promise((r) => setTimeout(r, 35_000)); // cover the 30s interval-drain fallback

// 6. Confirm the pill is gone and re-fetch each of the 3 records via
//    page.evaluate(() => fetch(...).then(r => r.json())) using the app's
//    own authenticated cookies — assert the values match what was entered
//    while offline. This is the step that actually proves the queued
//    mutations reached the server, not just that the UI looked right.

await browser.close();
```

Expected: pill shows "1 en attente" (or the right count) while offline for
each of the 3 flows, disappears within ~35s of going back online, and the
re-fetched server records match what was entered offline. Delete the
script afterward (`rm verify-offline-sync.mjs`) — throwaway verification,
not part of the shipped codebase.

- [ ] **Step 3: Lighthouse PWA audit**

Run: `pnpm lighthouse` (existing project tooling, per prior sessions)
Expected: installability checks pass (manifest present + valid, service worker registered, icons present).

- [ ] **Step 4: Stop the server, clean up**

```bash
kill %1  # or: pkill -f "next start"
rm -f frontend/verify-sw.mjs frontend/verify-offline-sync.mjs
```

- [ ] **Step 5: Full test suite + gate**

Run (from repo root): `pnpm format && pnpm --filter frontend run lint && pnpm typecheck && pnpm test`
Expected: all four PASS, full suite green (no regressions in the pre-existing ~1200 tests).

- [ ] **Step 6: Final verification commit (if `pnpm format` touched anything)**

```bash
git status --short
```
If clean, no commit needed — Tasks 1-7 already committed everything. If `pnpm format` reformatted anything left uncommitted, stage exactly those paths and commit:
```bash
git add <paths printed by git status>
git commit -m "chore(pwa): formatting pass

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
