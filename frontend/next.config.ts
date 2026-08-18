import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Static security headers applied to every response.
// Set via next.config.ts (not src/proxy.ts) so Vercel's edge can serve them
// from the CDN cache without invoking a function — zero per-request latency.
//
// CSP used to live in src/proxy.ts as a per-request nonce + 'strict-dynamic'
// policy. Reverted (2026-08-14, caught via a production-build Lighthouse
// audit): nonce-based CSP only works on dynamically-rendered pages — Next.js
// injects the nonce into script tags during server-side rendering, but this
// app's pages are statically prerendered at build time (no request/response
// cycle exists then, so no nonce can be injected — see Next's own
// content-security-policy.md, "Dynamic Rendering Requirement"). In
// production this silently shipped zero `nonce="..."` attributes while the
// header still demanded one, so 'strict-dynamic' blocked every static chunk
// — the app never hydrated. Dev mode never caught it because dev always
// renders dynamically. A static script-src needs 'unsafe-inline' instead of
// a nonce, because the App Router's own RSC hydration payload
// (`self.__next_f.push(...)`) ships as inline <script> tags with no src.
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      // Radix UI (@radix-ui/react-*, dropdowns/popovers/selects/tooltips)
      // positions its portals via inline style="" attributes.
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

// Belt-and-suspenders on top of app/robots.ts: a raw HTTP header, so it also
// covers responses a <meta name="robots"> tag can never reach (/api/*'s
// JSON, /print/*'s renders meant only for the internal PDF pipeline) and
// isn't dependent on every page remembering to export the right metadata —
// (school)/admin layouts are 'use client' and structurally can't export it.
const NOINDEX_HEADER = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
const NOINDEX_SOURCES = [
  '/dashboard/:path*',
  '/configuration/:path*',
  '/pedagogie/:path*',
  '/eleves/:path*',
  '/enseignants/:path*',
  '/scolarite/:path*',
  '/settings/:path*',
  '/bulletins/:path*',
  '/admin/:path*',
  '/api/:path*',
  '/print/:path*',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/auth/:path*',
];

const config: NextConfig = {
  reactStrictMode: true,
  // Standalone output bundles a self-contained server.js + minimal node_modules
  // into .next/standalone — required by the Docker runtime image (frontend/Dockerfile).
  // Has no impact on `next dev` / `next start` workflows. Skipped on Vercel
  // (which always sets VERCEL=1 during build): Vercel's own builder expects
  // .next/*.nft.json tracing files in the standard location, and `standalone`
  // mode moves them, causing a build-time ENOENT on next-server.js.nft.json.
  ...(process.env.VERCEL ? {} : { output: 'standalone' as const }),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      ...NOINDEX_SOURCES.map((source) => ({ source, headers: NOINDEX_HEADER })),
    ];
  },
};

// Sentry build-time wrapper. Uploads source maps when SENTRY_AUTH_TOKEN +
// SENTRY_ORG + SENTRY_PROJECT are present (typically only in CI). Without
// those env vars the wrapper still works — it just skips the upload step.
// silent:true keeps the build log clean when nothing is configured.
export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Tunnel client requests through a Next.js route to bypass ad-blockers
  // that filter direct Sentry calls. Off by default — turn on if your
  // user base has heavy ad-blocker usage.
  // tunnelRoute: '/monitoring',
  hideSourceMaps: true,
  disableLogger: true,
});
