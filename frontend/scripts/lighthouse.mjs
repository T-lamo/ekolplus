// Lighthouse audit runner — checks performance/accessibility/best-practices/SEO
// against a running server (dev or prod build).
//
// IMPORTANT: run against a PRODUCTION build for meaningful performance
// numbers. `next dev` skips minification/code-splitting/caching, so its
// performance score is not representative — only accessibility/best-practices
// findings are trustworthy against dev.
//
//   pnpm build && PORT=3001 pnpm start &
//   pnpm lighthouse
//
// Env vars:
//   LIGHTHOUSE_BASE_URL      — default http://localhost:3001
//   LIGHTHOUSE_AUTH_EMAIL    — optional, logs in to audit an authenticated page
//   LIGHTHOUSE_AUTH_PASSWORD
//   LIGHTHOUSE_AUTH_PATH     — authenticated page to audit, default /configuration/classes
//
// Reports are written to frontend/.lighthouse/*.json (gitignored).
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { mkdirSync, writeFileSync } from 'fs';

const BASE = process.env.LIGHTHOUSE_BASE_URL || 'http://localhost:3001';
const OUT_DIR = new URL('../.lighthouse/', import.meta.url).pathname;
const DETAIL_AUDITS = [
  'errors-in-console',
  'inspector-issues',
  'bf-cache',
  'target-size',
  'color-contrast',
  'heading-order',
];

mkdirSync(OUT_DIR, { recursive: true });

async function getAuthCookie() {
  const email = process.env.LIGHTHOUSE_AUTH_EMAIL;
  const password = process.env.LIGHTHOUSE_AUTH_PASSWORD;
  if (!email || !password) return null;
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const setCookie = res.headers.getSetCookie();
  return setCookie.map((c) => c.split(';')[0]).join('; ');
}

async function runAudit(chrome, url, name, extraHeaders) {
  const result = await lighthouse(url, {
    port: chrome.port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    formFactor: 'desktop',
    screenEmulation: { disabled: true },
    throttlingMethod: 'simulate',
    extraHeaders,
  });
  const { lhr } = result;
  writeFileSync(`${OUT_DIR}${name}.json`, result.report);

  const scores = Object.fromEntries(
    Object.entries(lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)]),
  );

  const failedAudits = Object.values(lhr.audits)
    .filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'notApplicable')
    .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
    .map((a) => ({ id: a.id, title: a.title, score: a.score, displayValue: a.displayValue }));

  console.log(`\n=== ${name} (${url}) ===`);
  console.log('Scores:', JSON.stringify(scores));
  console.log('Top issues:');
  for (const a of failedAudits.slice(0, 15)) {
    console.log(
      `  [${a.score}] ${a.id}: ${a.title}${a.displayValue ? ' — ' + a.displayValue : ''}`,
    );
  }

  for (const id of DETAIL_AUDITS) {
    const audit = lhr.audits[id];
    if (!audit || audit.score === 1 || audit.scoreDisplayMode === 'notApplicable') continue;
    const items = audit.details?.items ?? [];
    if (items.length === 0) continue;
    console.log(`  -- detail: ${id} --`);
    for (const item of items.slice(0, 5)) {
      console.log('    ', JSON.stringify(item).slice(0, 300));
    }
  }
}

const chrome = await launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'] });

try {
  await runAudit(chrome, `${BASE}/`, 'landing');
  await runAudit(chrome, `${BASE}/login`, 'login');

  const cookie = await getAuthCookie();
  if (cookie) {
    const path = process.env.LIGHTHOUSE_AUTH_PATH || '/configuration/classes';
    await runAudit(chrome, `${BASE}${path}`, 'authenticated', { Cookie: cookie });
  } else {
    console.log(
      '\n(skipping authenticated-page audit — set LIGHTHOUSE_AUTH_EMAIL/PASSWORD to include one)',
    );
  }
} finally {
  await chrome.kill();
}
