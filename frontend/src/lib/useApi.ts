'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from './api';

// In-memory stale-while-revalidate cache.
const cache = new Map<string, { data: unknown; ts: number }>();

const STALE_TIME = 2 * 60 * 1000;

if (typeof window !== 'undefined') {
  const EVICTION_THRESHOLD = 3 * STALE_TIME;
  window.setInterval(
    () => {
      const now = Date.now();
      for (const [key, entry] of cache) {
        if (now - entry.ts > EVICTION_THRESHOLD) cache.delete(key);
      }
    },
    5 * 60 * 1000,
  );
}

interface UseApiOptions {
  skip?: boolean;
  staleTime?: number;
  // Called with the raw thrown value (before it's flattened to the generic
  // `error` string) — lets a caller inspect e.g. `ApiError.code` and react
  // (redirect, etc.) the way callers did with their own try/catch before
  // switching to this hook. Return `true` to say "I've handled this" and
  // suppress the hook's own `error` state (matches the pre-migration
  // behavior of pages that redirect instead of showing an error message).
  onError?: (err: unknown) => boolean | void;
}

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  // Optimistic local update (e.g. splice a deleted row out of a list) —
  // writes through to the cache so a later remount doesn't flash the
  // pre-mutation value before the next background revalidation catches up.
  // No network call, unlike `refresh`.
  mutate: (updater: T | ((prev: T | null) => T)) => void;
}

export function useApi<T>(path: string, options: UseApiOptions = {}): UseApiResult<T> {
  const { skip = false, staleTime = STALE_TIME, onError } = options;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const cached = cache.get(path);
  const [data, setData] = useState<T | null>(cached ? (cached.data as T) : null);
  const [loading, setLoading] = useState(!cached && !skip);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const pathRef = useRef(path);
  pathRef.current = path;
  const fetchIdRef = useRef(0);

  const fetchData = useCallback(
    async (showLoading: boolean) => {
      if (skip) return;
      const currentFetchId = ++fetchIdRef.current;
      if (showLoading) setLoading(true);
      setError(null);
      try {
        const result = await api<T>(pathRef.current);
        if (mountedRef.current && fetchIdRef.current === currentFetchId) {
          setData(result);
          cache.set(pathRef.current, { data: result, ts: Date.now() });
        }
      } catch (err) {
        if (mountedRef.current && fetchIdRef.current === currentFetchId) {
          const handled = onErrorRef.current?.(err) === true;
          if (!handled) setError(err instanceof Error ? err.message : 'Network error');
        }
      } finally {
        if (mountedRef.current && fetchIdRef.current === currentFetchId) setLoading(false);
      }
    },
    [skip],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (skip) {
      setLoading(false);
      return;
    }
    const entry = cache.get(path);
    if (entry) {
      setData(entry.data as T);
      setLoading(false);
      if (Date.now() - entry.ts > staleTime) {
        void fetchData(false);
      }
    } else {
      void fetchData(true);
    }
    return () => {
      mountedRef.current = false;
    };
    // fetchData is intentionally excluded; it depends only on `skip` which is in deps.
  }, [path, skip]);

  const refresh = useCallback(async () => {
    cache.delete(pathRef.current);
    await fetchData(true);
  }, [fetchData]);

  const mutate = useCallback((updater: T | ((prev: T | null) => T)) => {
    setData((prev) => {
      const next =
        typeof updater === 'function' ? (updater as (prev: T | null) => T)(prev) : updater;
      cache.set(pathRef.current, { data: next, ts: Date.now() });
      return next;
    });
  }, []);

  return { data, loading, error, refresh, mutate };
}

export function getCache<T>(path: string): T | null {
  const entry = cache.get(path);
  return entry ? (entry.data as T) : null;
}

export function setCache(path: string, data: unknown): void {
  cache.set(path, { data, ts: Date.now() });
}

export function invalidateCache(path: string): void {
  cache.delete(path);
}

export function invalidateCachePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
