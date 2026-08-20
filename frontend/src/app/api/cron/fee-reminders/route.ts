// Daily cron — checks every school with automated fee reminders enabled and
// sends reminders to who's due one (Relances Impayés' "Automatisation"
// toggles + Payment Configuration's master "Rappels automatiques" switch).
// Delivery is WhatsApp only (see lib/server/fees/reminders.ts) — falls back
// to a stub automatically if Twilio env vars are absent.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { redis } from '@/lib/server/redis';
import { runFeeReminderCron } from '@/lib/server/fees/reminders';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const LEASE_TTL_MS = 60_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let result = { schoolsProcessed: 0, remindersLogged: 0 };

    await withLease(redis ?? undefined, 'fee-reminders', LEASE_TTL_MS, async () => {
      result = await runFeeReminderCron();
      log.info('fee-reminders tick', { ...result, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

// Vercel's native Cron Jobs scheduler invokes the configured path via GET,
// not POST (confirmed live: every scheduled invocation was returning 405
// before this alias existed, so the cron never actually ran in production —
// only a manual POST, e.g. via curl, ever reached the handler).
export const GET = POST;
