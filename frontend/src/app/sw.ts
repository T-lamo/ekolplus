// Placeholder — Task 2 replaces this with the real Serwist service worker
// source (precache + runtime caching). Minimal service worker structure.
/* eslint-disable @typescript-eslint/no-explicit-any */

// Service worker lifecycle events
const swSelf = self as any;

swSelf.addEventListener('install', () => {
  swSelf.skipWaiting();
});

swSelf.addEventListener('activate', () => {
  swSelf.clients.claim();
});
