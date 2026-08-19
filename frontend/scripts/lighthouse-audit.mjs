// Multi-page Lighthouse audit runner — authenticates through the real login
// form (not a Cookie header, which leaves document.cookie empty and makes
// every useUser() page bounce to /login — see the project memory on this)
// so AuthProvider actually sees the session and each page renders for real.
//
// Run against a PRODUCTION build for meaningful performance numbers:
//   pnpm build && PORT=3002 pnpm start &
//   node scripts/lighthouse-audit.mjs
//
// Env vars:
//   LIGHTHOUSE_BASE_URL      — default http://localhost:3002
//   LIGHTHOUSE_AUTH_EMAIL    — default amosdorceus2023@gmail.com
//   LIGHTHOUSE_AUTH_PASSWORD — default TestEcole2026!
//
// Reports: frontend/.lighthouse/*.json (gitignored).
import { launch } from 'chrome-launcher';
import puppeteer from 'puppeteer-core';
import lighthouse from 'lighthouse';
import { mkdirSync, writeFileSync } from 'fs';

const BASE = process.env.LIGHTHOUSE_BASE_URL || 'http://localhost:3002';
const EMAIL = process.env.LIGHTHOUSE_AUTH_EMAIL || 'amosdorceus2023@gmail.com';
const PASSWORD = process.env.LIGHTHOUSE_AUTH_PASSWORD || 'TestEcole2026!';
const OUT_DIR = new URL('../.lighthouse/', import.meta.url).pathname;
mkdirSync(OUT_DIR, { recursive: true });

const PAGES = [
  { name: 'landing', path: '/', auth: false },
  { name: 'login', path: '/login', auth: false },
  { name: 'dashboard', path: '/dashboard', auth: true },
  { name: 'presences', path: '/pedagogie/presences', auth: true },
  { name: 'carnet-de-notes', path: '/pedagogie/carnet-de-notes', auth: true },
  { name: 'appreciations', path: '/pedagogie/appreciations', auth: true },
  { name: 'eleves', path: '/eleves', auth: true },
  { name: 'enseignants', path: '/enseignants', auth: true },
  { name: 'configuration-classes', path: '/configuration/classes', auth: true },
  { name: 'bulletins', path: '/bulletins', auth: true },
  { name: 'scolarite-paiements', path: '/scolarite/paiements', auth: true },
];

async function runAudit(port, url, name) {
  const result = await lighthouse(url, {
    port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    formFactor: 'desktop',
    screenEmulation: { disabled: true },
    throttlingMethod: 'simulate',
    disableStorageReset: true,
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
  console.log('finalDisplayedUrl:', lhr.finalDisplayedUrl);
  console.log('Scores:', JSON.stringify(scores));
  if (failedAudits.length) {
    console.log('Failing audits (<0.9):');
    for (const a of failedAudits) {
      console.log(
        `  [${a.score}] ${a.id}: ${a.title}${a.displayValue ? ' — ' + a.displayValue : ''}`,
      );
    }
  }
  return { name, url, scores, finalDisplayedUrl: lhr.finalDisplayedUrl, failedAudits };
}

const chrome = await launch({
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
});

const summary = [];
try {
  const browser = await puppeteer.connect({ browserURL: `http://localhost:${chrome.port}` });
  const page = await browser.newPage();

  // Real login through the form so cookies + localStorage land in the
  // profile that Lighthouse's own navigation (same Chrome, same port) reuses.
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.type('input[type="email"], input[name="email"]', EMAIL);
  await page.type('input[type="password"], input[name="password"]', PASSWORD);
  const submitBtn = await page.$('button[type="submit"]');
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth') && r.request().method() === 'POST'),
    submitBtn.click(),
  ]);
  await new Promise((r) => setTimeout(r, 1500));
  console.log('Logged in, landed on:', page.url());
  await page.close();

  for (const p of PAGES) {
    const url = `${BASE}${p.path}`;
    const result = await runAudit(chrome.port, url, p.name);
    summary.push(result);
  }
} finally {
  await chrome.kill();
}

console.log('\n\n=== SUMMARY ===');
const CATS = ['performance', 'accessibility', 'best-practices', 'seo'];
console.log(['page', ...CATS].join('\t'));
for (const r of summary) {
  const mismatched =
    r.finalDisplayedUrl &&
    !r.finalDisplayedUrl.includes(r.url.split('/').slice(3).join('/')) &&
    !r.url.endsWith(new URL(r.finalDisplayedUrl).pathname);
  const flag = mismatched ? ' ⚠ REDIRECTED' : '';
  console.log([r.name + flag, ...CATS.map((c) => r.scores[c])].join('\t'));
}
const allPassing = summary.every((r) => CATS.every((c) => r.scores[c] >= 90));
console.log(`\nAll pages ≥90 on all 4 categories: ${allPassing}`);
