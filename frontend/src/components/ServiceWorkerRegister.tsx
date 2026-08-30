'use client';

// Serwist compiles app/sw.ts to public/sw.js but does NOT auto-register it
// in the browser — that's this component's one job. Mounted once in the
// root layout so it covers the whole app, not just the school shell (the
// app-shell precache benefits every route).
import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    // sw.ts sets skipWaiting+clientsClaim, so a new deploy's worker installs
    // and takes control of already-open tabs on its own — but the tab that
    // was mid-load when control changed hands keeps whatever it already
    // fetched under the OLD worker (stale precached images/chunks from the
    // previous deploy). Without this listener, that only clears up on
    // whichever future reload happens to land after the handoff finished —
    // in practice, a manual Ctrl+F5. Reloading once on `controllerchange`
    // makes every open tab pick up the new deploy immediately, automatically.
    //
    // clientsClaim() also fires `controllerchange` the very first time a
    // brand-new visitor's tab gets claimed (no previous controller at all),
    // not just on a version handoff — without the `hadController` guard
    // below, every first-ever visit force-reloads mid-load.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Unsupported browser or blocked by the user — the app works exactly
      // as it does today, just without the offline layer. Nothing to
      // surface to the user; this is a silent capability check, same
      // posture as the app's other conditionally-inert providers.
    });
  }, []);

  return null;
}
