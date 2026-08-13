// Short-lived, self-contained authorization for the server-side PDF
// pipeline's print page (Puppeteer navigates there with no session
// cookie). Modeled on lib/server/cron/auth.ts's HMAC pattern — does NOT
// import auth.ts/crypto.ts (both CLAUDE.md-protected). Reuses JWT_SECRET
// (already required at boot, >=32 chars) rather than adding a new env var.
//
// The payload IS the authorization envelope: schoolId/studentId/termId are
// bound together and signed, so a token can never be replayed to render a
// different student's bulletin, and it self-expires after 60s.
import 'server-only';
import crypto from 'node:crypto';

export interface PrintTokenPayload {
  schoolId: string;
  studentId: string;
  termId: string;
  exp: number;
}

const TTL_MS = 60_000;

function secret(): string {
  return process.env.JWT_SECRET ?? '';
}

export function signPrintToken(payload: Omit<PrintTokenPayload, 'exp'>): string {
  const full: PrintTokenPayload = { ...payload, exp: Date.now() + TTL_MS };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyPrintToken(token: string): PrintTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload: PrintTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  return payload;
}
