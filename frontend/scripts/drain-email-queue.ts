// frontend/scripts/drain-email-queue.ts
//
// Dev convenience — Vercel Cron drains the outbox and email queue every
// minute in prod; nothing does that locally, so an outbox event from
// signup/forgot-password/admin-schools sits PENDING until something calls
// these two cron routes. This just makes that one command instead of two
// hand-typed curls.
//
// Usage: pnpm dev:drain-emails   (after `pnpm dev` in another terminal)

const BASE_URL = process.env.APP_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET;

async function drain(path: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`✗ ${path} — ${res.status} ${body}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${path} — ${body}`);
}

async function main(): Promise<void> {
  if (!CRON_SECRET) {
    console.error('CRON_SECRET is not set (check .env / .env.local)');
    process.exitCode = 1;
    return;
  }
  await drain('/api/cron/outbox-drain');
  await drain('/api/cron/email-queue-drain');
}

main();
