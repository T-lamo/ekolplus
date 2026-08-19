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
