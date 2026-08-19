// IndexedDB-backed queue of mutations that couldn't reach the server
// because of a connectivity failure. Not a general offline-first sync
// engine — deliberately scoped to the 3 write flows named in the spec
// (Présences / Carnet de notes / Appréciations). Replays go through the
// exact same lib/api.ts `api()` function real-time actions use, so token
// refresh + CSRF "just work" with zero new plumbing. Spec: docs/
// superpowers/specs/2026-08-19-pwa-offline-sync-design.md
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
  /** Short human-readable label shown in the failure toast when this entry
   * is permanently rejected, e.g. "Présence — Awa K. (18/08)". */
  label: string;
  /** Stamped at enqueue time so a device shared by two accounts never
   * replays one user's queued writes under another user's session. */
  userId: string;
  createdAt: string;
}

export interface DrainResult {
  synced: number;
  failed: number;
  failedEntries: Array<{ label: string; message: string }>;
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
  }).catch((e: unknown) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

/**
 * Test-only: closes the cached IndexedDB connection (if any) and clears the
 * cache, so the next getDb() call opens a fresh one. Needed because getDb()
 * caches its connection at module scope for production performance — without
 * an explicit close, indexedDB.deleteDatabase() blocks against that open
 * connection (per the IndexedDB spec) and silently no-ops, so stale data
 * leaks across test cases that share this module instance. Not used by app
 * code — only by this module's own test file.
 */
export async function __resetOfflineQueueForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
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
  const failedEntries: DrainResult['failedEntries'] = [];
  let stoppedReason: DrainResult['stoppedReason'] = null;

  for (const mutation of pending) {
    try {
      await api(mutation.path, { method: mutation.method, body: mutation.body });
      await remove(mutation.id);
      synced++;
      notify();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        stoppedReason = 'auth';
        break;
      }
      if (err instanceof ApiError && err.status !== 0 && err.status < 500) {
        await remove(mutation.id);
        failed++;
        failedEntries.push({ label: mutation.label, message: err.message });
        notify();
        continue;
      }
      stoppedReason = 'offline';
      break;
    }
  }

  notify();
  const stillPending = (await listPending(userId)).length;
  return { synced, failed, failedEntries, stillPending, stoppedReason };
}
