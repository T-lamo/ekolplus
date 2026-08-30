// Covers the plain cache primitives (getCache/setCache/invalidateCache/
// invalidateCachePrefix) that back the useApi hook. The hook itself renders
// React state across effects (initial cache hit, background revalidation,
// onError suppression) — this project has no jsdom/@testing-library/react
// setup (vitest.config.ts runs `environment: 'node'` and only discovers
// `.test.ts`), so that behavior is exercised live via the pages that use
// the hook rather than a renderHook-style unit test.
import { describe, expect, it } from 'vitest';
import { getCache, invalidateCache, invalidateCachePrefix, setCache } from './useApi';

describe('useApi cache primitives', () => {
  it('getCache returns null for a key that was never set', () => {
    expect(getCache('/api/never-set')).toBeNull();
  });

  it('setCache then getCache round-trips the value', () => {
    setCache('/api/school/dashboard', { kpis: { studentsCount: 42 } });
    expect(getCache('/api/school/dashboard')).toEqual({ kpis: { studentsCount: 42 } });
  });

  it('invalidateCache removes only the given key', () => {
    setCache('/api/school/students', { students: [] });
    setCache('/api/school/classes', { classes: [] });
    invalidateCache('/api/school/students');
    expect(getCache('/api/school/students')).toBeNull();
    expect(getCache('/api/school/classes')).toEqual({ classes: [] });
  });

  it('invalidateCachePrefix removes every key sharing the prefix, leaving others untouched', () => {
    setCache('/api/school/students', { students: [1] });
    setCache('/api/school/students/s1', { id: 's1' });
    setCache('/api/school/classes', { classes: [] });
    invalidateCachePrefix('/api/school/students');
    expect(getCache('/api/school/students')).toBeNull();
    expect(getCache('/api/school/students/s1')).toBeNull();
    expect(getCache('/api/school/classes')).toEqual({ classes: [] });
  });
});
