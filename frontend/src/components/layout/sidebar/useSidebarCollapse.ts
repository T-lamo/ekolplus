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
