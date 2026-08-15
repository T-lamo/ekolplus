// Origin that headless Chromium (lib/server/bulletin-pdf/generate.ts) uses to
// load the standalone print pages — a self-fetch of this very deployment.
//
// Precedence:
//   1. APP_URL, when it is a real absolute http(s) URL — the operator's
//      explicit choice (custom domain).
//   2. On Vercel, the platform-injected URLs: VERCEL_PROJECT_PRODUCTION_URL
//      (stable production domain of the project) then VERCEL_URL (this
//      deployment's own URL). This is what makes PDF export work out of the
//      box on Vercel even when APP_URL was left at its .env placeholder or
//      copied verbatim from a local .env (localhost) — the two failure modes
//      that broke "Imprimer / Télécharger PDF" on the first deployments.
//   3. http://localhost:3000 for local `pnpm dev`.
//
// A localhost APP_URL is honored locally but ignored on Vercel: a serverless
// function can never reach its own localhost:3000.
export function resolvePrintBaseUrl(): string {
  const onVercel = !!process.env.VERCEL || !!process.env.VERCEL_URL;
  const explicit = normalizeHttpOrigin(process.env.APP_URL);
  if (explicit && !(onVercel && isLocalhost(explicit))) return explicit;

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;

  return explicit ?? 'http://localhost:3000';
}

/** Returns "scheme://host[:port]" for a valid absolute http(s) URL, else null. */
function normalizeHttpOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null; // e.g. "REPLACE_ME_PROD_DOMAIN"
  }
}

function isLocalhost(origin: string): boolean {
  const host = new URL(origin).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}
