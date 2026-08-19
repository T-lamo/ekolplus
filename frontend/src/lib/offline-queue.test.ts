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
import {
  __resetOfflineQueueForTests,
  drain,
  enqueue,
  listPending,
  submitOrQueue,
} from './offline-queue';

const mockApi = vi.mocked(api);

beforeEach(async () => {
  vi.clearAllMocks();
  await __resetOfflineQueueForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('schoolgesti-offline-queue');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(); // shouldn't fire once the connection is closed above, but don't hang if it does
  });
});

afterEach(async () => {
  await __resetOfflineQueueForTests();
});

describe('enqueue / listPending', () => {
  it("lists only the given user's entries, oldest first", async () => {
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
    await expect(submitOrQueue({ path: '/x', method: 'PUT', label: 'X' }, 'u1')).rejects.toThrow(
      'VALIDATION_FAILED',
    );
    expect(await listPending('u1')).toHaveLength(0);
  });
});

describe('drain', () => {
  it('replays entries in order, removing each on success', async () => {
    await enqueue({ path: '/a', method: 'PATCH', label: 'A', userId: 'u1' });
    await new Promise((r) => setTimeout(r, 2));
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
