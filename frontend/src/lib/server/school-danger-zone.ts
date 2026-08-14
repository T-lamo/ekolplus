// Shared guards for the Zone dangereuse actions (reset-year, delete-school).
// Both are OWNER-only, both require the caller to type the school's exact
// current name as a type-to-confirm gate (server-side re-checked — the
// client-side Modal enforcing this is UX, not the security boundary), and
// both are rate-limited far stricter than the generic admin-userid limiter
// (100/min is tuned for back-office scraping, not for "delete my school").
import 'server-only';
import { NextResponse } from 'next/server';
import { redis } from '@/lib/server/redis';
import { RedisRateLimitStore } from '@/lib/server/rate-limit-store';

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_HITS = 5;

export function confirmNameMatches(schoolName: string, confirmName: unknown): boolean {
  return typeof confirmName === 'string' && confirmName.trim() === schoolName;
}

/**
 * Strict per-userId limiter for irreversible school-level actions.
 * Fails OPEN in dev/CI (no Redis configured), fails CLOSED (503) in
 * production — same WR-03 reasoning as the admin-userid limiter, but this
 * one guards something with a much higher blast radius.
 */
export async function enforceDangerZoneRateLimit(
  userId: string,
  action: string,
): Promise<NextResponse | null> {
  if (!redis) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'RATE_LIMIT_BACKEND_UNAVAILABLE', message: 'Rate-limit backend unavailable.' },
        { status: 503 },
      );
    }
    return null;
  }
  const store = new RedisRateLimitStore({ redis, prefix: '', windowMs: WINDOW_MS });
  const { totalHits, resetTime } = await store.increment(`rl:danger-zone:${action}:${userId}`);
  if (totalHits > MAX_HITS) {
    const retryAfter = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
    return NextResponse.json(
      {
        error: 'TOO_MANY_REQUESTS',
        message: 'Trop de tentatives. Réessaie plus tard.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(MAX_HITS),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }
  return null;
}
