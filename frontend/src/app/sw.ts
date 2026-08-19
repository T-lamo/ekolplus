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
  // `?? []` (not just `self.__SW_MANIFEST`): this repo's tsconfig sets
  // exactOptionalPropertyTypes, and Serwist's own `precacheEntries?: (...)[]`
  // type doesn't accept an explicit `undefined` even though the property is
  // optional. `__SW_MANIFEST` is only actually `undefined` outside of the
  // real `serwist build` step (e.g. a stray import in a non-SW context) —
  // in the shipped worker it's always injected.
  precacheEntries: self.__SW_MANIFEST ?? [],
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
