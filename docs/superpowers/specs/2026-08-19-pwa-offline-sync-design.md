# PWA + Offline Sync (Présences / Notes / Appréciations) — Design Spec

Date: 2026-08-19
Status: Approved by user 2026-08-19 — pending plan + implementation.

## Problem

The app must stay usable in areas with unreliable or absent connectivity
(Haïti, parts of Africa) — the user's own framing. Today there is **zero**
PWA infrastructure: no manifest, no service worker, no offline handling of
any kind. Confirmed via a repo-wide search (`find` for manifest/sw files,
`grep` for `workbox|next-pwa|dexie|idb|serwist` in `package.json`) — all
empty.

Clarified with the user across four questions before this design:
1. Ambition: **read-cached data + a handful of key write actions
   offline**, not full offline CRUD across all 48 Prisma models (ruled out
   — conflicts with the app's existing financial-safety invariants around
   payments/withdrawals, which stay online-only).
2. The offline-writable actions: **Présences, Saisie des notes,
   Appréciations** — all pedagogical, none touch money.
3. Target platform: **Android/Chrome first** (the realistic majority in
   the target regions); iOS Safari gets the same code path but no special
   background-sync engineering.
4. Conflict policy: **last write wins**, no conflict-resolution UI.

## Scope

In scope:
- Installable PWA shell (`app/manifest.ts`, icons) — the app loads
  instantly even fully offline, once installed/visited once.
- Read caching (network-first, cache fallback) for the GET endpoints
  behind the three offline-writable screens, so data already fetched once
  stays visible offline.
- An offline mutation queue (IndexedDB) for exactly three write flows:
  attendance marking, grade entry, appreciation entry — auto-replayed
  through the app's existing `api()` wrapper when connectivity returns.
- A small persistent "en attente de synchro" indicator, built on the
  toast system just standardized (`useToast()`).

Out of scope this pass (confirmed with the user):
- Any write flow outside the three named above — in particular payments,
  withdrawals, billing, and all admin/back-office mutations stay
  online-only, unchanged.
- Conflict-resolution UI. Per the user's choice, a queued write simply
  overwrites whatever is on the server when it lands — no merge, no
  "which version do you want to keep" prompt.
- True background sync while the app/tab is fully closed. Neither Android
  Chrome nor iOS Safari reliably guarantee the Background Sync API across
  this app's target devices; the queue drains when the app is
  foregrounded/reopened or the browser fires an `online` event, not while
  backgrounded. Acceptable given the ambition level chosen in Q1.
- A generic offline-first data-replication engine (e.g. RxDB/PouchDB-style
  sync). Considered and rejected — it doesn't map cleanly onto a
  relational Prisma/Postgres backend with role-scoped access, and is far
  more machinery than three write-flows need (YAGNI).
- A native app wrapper (Capacitor/etc.). The user asked for PWA
  specifically; noted only to record it was considered and ruled out.

## Current state (as found)

- **Build tooling**: `pnpm dev` runs `next dev --turbopack` (`package.json`
  line 12); `pnpm build` runs plain `next build` — **no** `--turbopack`
  flag, so production builds still go through webpack. This matters
  because Serwist's Next.js integration (`@serwist/next`) hooks the
  webpack build to generate the precache manifest + `public/sw.js`; it
  will run correctly for `pnpm build`/`pnpm start`, but the service worker
  will simply not exist under `pnpm dev` (expected/standard — Serwist and
  Workbox both document that offline behavior should be verified against
  a production build, not dev).
- **`next.config.ts`**: already wraps the config object with
  `withSentryConfig(config, {...})` at export time (`next.config.ts:149`).
  `@serwist/next`'s `withSerwist(...)` wrapper composes the same way
  (`withSerwist(withSentryConfig(config, {...}))` or the reverse — order
  matters only in that Sentry's source-map upload step should see the
  final webpack config, so `withSerwist` wraps outermost).
- **`frontend/src/lib/api.ts`** (protected file — read, not modified):
  the `api()` wrapper already classifies a network failure (fetch throws,
  not an HTTP error response) into `ApiError` with `status === 0` and a
  message distinguishing offline (`!navigator.onLine`) from a generic
  network error (lines 203-215). This is the exact, already-existing
  signal the offline queue keys off — no change to this protected file is
  needed; the queue module wraps calls to `api()` from the *call sites*
  and inspects `err.status === 0`.
- **`frontend/src/lib/api.ts`**'s CSRF handling: the CSRF token is cached
  in `localStorage` (not just a cookie) by `storeCsrfToken()` — readable
  synchronously offline, no network needed to attach `x-csrf-token` to a
  queued replay.
- **Auth**: access JWT is httpOnly (15 min), refresh JWT httpOnly (7
  days). `api()` already auto-refreshes on a 401 with a single-flight lock
  before retrying the original call once
  (`frontend/src/lib/api.ts:167-173`). Because queued mutations replay
  **through this same `api()` function**, an access token that expired
  while the device was offline is transparently refreshed on replay — no
  new auth plumbing needed, as long as the 7-day refresh cookie hasn't
  also expired (if it has, replay fails with 401 and the entry surfaces to
  the user to re-enter after logging back in — see Edge cases).
- **The three write endpoints are already upsert-by-natural-key** (verified
  by reading each route, not assumed):
  - `PATCH /api/school/attendance` (`frontend/src/app/api/school/attendance/route.ts`)
    — body `{ studentId, date, status }`, keyed by `(studentId, date)`.
    `DELETE .../attendance?studentId=&date=` for clearing a mark.
  - `PUT /api/school/evaluations/[id]/grades`
    (`.../evaluations/[id]/grades/route.ts`) — bulk `prisma.grade.upsert`
    keyed by `(evaluationId, studentId)`.
  - `PUT /api/school/students/[id]/appreciations`
    (`.../students/[id]/appreciations/route.ts`) — upserts one row keyed
    by `(studentId, termId, subjectId | null)`, with an explicit
    find-then-branch (not a naive Prisma `upsert()`) because Postgres
    doesn't dedupe `NULL` in a unique index — already handled correctly.

  **Consequence for the design**: replaying any of these three requests
  twice (e.g. the queue retries after a partial failure) is a no-op, not
  a duplicate row. No new idempotency-key infrastructure is needed on the
  server.
- **Call sites already do optimistic local state updates** before
  awaiting the network call — e.g. `markDay()` in
  `frontend/src/app/(school)/pedagogie/presences/page.tsx:214-234` updates
  `setData(...)` first, then calls `api(...)`. The queue integration wraps
  the existing `try { await api(...) } catch` block at each of the three
  call sites; it does not need to change how the optimistic UI update
  itself works.
- **Toast system**: `useToast()` (`frontend/src/contexts/ToastContext.tsx`,
  just standardized this session) supports `success | error | warning |
  info`, tokenized colors, auto-dismiss + manual close. The offline
  indicator is a **separate, persistent** UI element (it must stay visible
  the whole time entries are queued, unlike a toast's 4s auto-dismiss) but
  reuses `useToast()` for the one-shot "Synchronisé." confirmation once
  the queue empties.
- **No existing service-worker-adjacent code** to conflict with: `public/`
  only contains `images/` and `logos/` (static brand assets).

## Architecture

**Tooling**: `@serwist/next` + `serwist` (the actively maintained
Next.js-App-Router-compatible successor to the unmaintained `next-pwa` —
confirmed current as of writing via a live search, not assumed from
training data). `idb` (~1 KB wrapper over IndexedDB) for the mutation
queue's storage.

**Two independent layers**, deliberately kept separate:

1. **App-shell + read caching** (Serwist service worker, `app/sw.ts`):
   - Precaches the built JS/CSS/font bundles at install — the app's UI
     renders even with zero connectivity, once it's been loaded/installed
     once.
   - `NetworkFirst` runtime caching strategy (Serwist ships Workbox's
     strategies) scoped to the GET routes behind the three offline
     screens: `/api/school/attendance*`, `/api/school/evaluations/*`,
     `/api/school/students/*/appreciations`, plus the roster/class-list
     GETs those screens depend on. A short cache TTL (e.g. a few hours) —
     this is a "last known good" fallback, not a long-lived offline
     database.
   - Everything else (payments, admin, billing GETs) is explicitly
     **not** added to the runtime cache list — those screens simply show
     the existing "Erreur réseau" state offline, unchanged from today.
2. **Write queue** (`frontend/src/lib/offline-queue.ts`, IndexedDB via
   `idb`): a flat list of pending mutations, independent of the service
   worker. This is plain application code (not a service worker), which
   keeps it simple to unit-test and reason about — the service worker
   only ever handles caching, never mutations.

## Offline queue mechanics

```ts
interface QueuedMutation {
  id: string;           // crypto.randomUUID()
  path: string;          // e.g. '/api/school/attendance'
  method: 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  createdAt: string;
  label: string;         // short human string for the indicator, e.g. "Présence — Awa K."
}

enqueue(entry: Omit<QueuedMutation, 'id' | 'createdAt'>): Promise<void>
listPending(): Promise<QueuedMutation[]>
drain(): Promise<{ synced: number; failed: number; stillPending: number }>
```

- **Call-site integration** (the only change to the three existing pages):
  wrap the existing `await api(path, { method, body })` in each of
  `markDay` (présences), the grade-save handler (carnet de notes), and the
  appreciation-save handler with a catch that checks
  `err instanceof ApiError && err.status === 0`. On that specific
  signal, call `enqueue(...)` instead of surfacing the error toast — the
  optimistic UI update the page already made stays as-is, and a small
  "en attente" badge appears on that row/field.
- **Drain triggers** (any of): the browser's `online` event, the page's
  `visibilitychange` → `visible` (covers the common case of a teacher
  walking back into wifi range and reopening the app), and a 30s interval
  fallback while the app is open (the `online` event is known to be
  unreliable on Android Chrome — this is a deliberate redundancy, not an
  oversight).
- **Drain order**: FIFO, replayed **one at a time** through the exact same
  `api()` function real-time actions use (so refresh-on-401 "just works").
  Each replay's failure is classified, since "retry later" and "this will
  never succeed" need different handling:
  - `ApiError.status === 0` (still offline) or `>= 500` (server hiccup):
    **transient** — stop draining, leave this entry and everything after
    it queued for the next trigger (preserves order; avoids hammering a
    connection that dropped again mid-sync).
  - `ApiError.status === 401` where the wrapper's own refresh-on-401 also
    failed (refresh token expired/invalid): **stop draining**, same as
    transient, but the indicator switches to the reconnect-specific
    message (see Edge cases) instead of the generic "hors ligne" one.
  - Any other 4xx (400/404/409/422 — the request itself is rejected, not
    a connectivity problem: e.g. the evaluation or student was deleted
    server-side while the device was offline): **permanent** — remove
    this one entry from the queue (retrying it forever would never
    succeed) and surface it distinctly (`toast(`"${entry.label}" n'a pas
    pu être synchronisé — ${err.message}`, 'error')`, no auto-dismiss
    exemption needed, this is a one-time notice). Draining **continues**
    to the remaining entries — one bad entry must not block unrelated
    later ones indefinitely.
- **UI indicator**: a small pill in the topbar (new component,
  `OfflineIndicator.tsx`, mounted in the school shell next to the existing
  `AcademicYearBadge`) — `useQueueStatus()` hook subscribes to the queue's
  IndexedDB via a simple polling read on mount + after every enqueue/drain
  call (no need for a `BroadcastChannel`; a single-tab teacher workflow is
  the realistic target per the platform decision). Shows "Hors ligne — N
  en attente" while `stillPending > 0`, disappears when empty, and fires
  one `toast('Synchronisé.', 'success')` the moment a non-empty queue
  reaches zero.

## Conflict handling

Per the user's explicit choice: none. A queued PATCH/PUT simply carries
whatever values were on the device when the action was taken; whichever
request reaches the server last wins — functionally identical to two
browser tabs racing today, which the app already tolerates (these are all
single-row upserts, not increments).

## Edge cases

- **Refresh token also expired while offline** (device offline for over 7
  days — unlikely but possible). Replay gets a 401, refresh also fails;
  the queue entry is kept (not silently dropped) and the indicator
  switches to "Reconnecte-toi pour synchroniser N modification(s)" — the
  entry replays automatically on the next successful login, not lost.
- **App/browser closed with entries still queued.** IndexedDB persists
  across sessions; the queue is drained on next app open, same as a normal
  reload — no data loss from closing the tab.
- **User logs out with entries still queued.** The queue is **not** tied
  to a session and is **not** cleared on logout (a teacher might close the
  app before reconnecting) — but replay after a *different* user logs in
  on the same device must not send another teacher's queued rows under
  the new session. Mitigation: `enqueue()` stamps the queued entry with
  the `userId` active at enqueue time (read from the existing auth
  context); `drain()` skips (does not delete) entries whose stamped
  `userId` doesn't match the currently logged-in user, and the indicator
  reflects only the current user's pending count.
- **Storage eviction** (rare, but IndexedDB can be evicted under severe
  device storage pressure, more so on iOS). Not mitigated in v1 — flagged
  as a known, low-probability gap; the queue is a convenience layer for
  brief connectivity gaps, not a guaranteed-durable outbox.
- **Same record edited offline AND changed server-side by someone else.**
  Explicitly resolved by the conflict policy above (offline write wins on
  replay) — no special handling needed.

## Manifest & installability

`frontend/src/app/manifest.ts` (Next's native App Router metadata route,
no separate static JSON file needed): `name`/`short_name`
("Schoolgesti"), `theme_color` (`#6c2bd9`, matching `--color-primary`),
`background_color` (`#f3f3f7`, matching `--color-background`),
`display: 'standalone'`, `start_url: '/dashboard'`, icon set generated
once (192/512 px + maskable variant) from the existing logo under
`public/logos/`.

## API surface

**No new routes.** This design is entirely client-side (service worker +
IndexedDB queue) sitting on top of the three existing endpoints listed
above — the server-side contract does not change.

## Testing plan

- **`offline-queue.ts` unit tests** (Vitest, `fake-indexeddb` for a
  jsdom-compatible IndexedDB — same pattern the project already uses for
  other browser-storage code, e.g. `mock-cookies.ts` in
  `frontend/src/test-utils/`): enqueue/list/drain ordering, drain stops on
  first failure, `userId`-scoped skip-on-mismatch, drain-empties-to-zero
  triggers the success callback exactly once.
- **Live E2E** (Puppeteer, mirroring this session's established login +
  authenticated-fetch pattern): run against `pnpm build && pnpm start`
  (service worker only exists in a production build, not `next dev`).
  Use Chrome DevTools Protocol network emulation
  (`page.setOfflineMode(true)` / CDP `Network.emulateNetworkConditions`)
  to go offline mid-session, perform one action from each of the three
  flows, confirm the optimistic UI + "en attente" indicator, go back
  online, confirm auto-drain + "Synchronisé." toast + the server actually
  has the value (re-fetch and assert).
- **Lighthouse PWA audit** (`pnpm lighthouse`, already an established tool
  in this project per prior sessions) — confirms installability
  (manifest + service worker registered + icons) scores green.

## Rollout notes

- Ship behind no feature flag — this is additive (nothing existing
  changes if the service worker fails to register, e.g. an unsupported
  browser; the app works exactly as it does today, just without the
  offline layer).
- `pnpm dev` will not exercise the service worker — this is expected, not
  a bug to chase; verification happens against `pnpm build && pnpm start`
  per the testing plan above.
