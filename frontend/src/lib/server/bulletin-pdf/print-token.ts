// Short-lived, self-contained authorization for the server-side PDF
// pipeline's print pages (Puppeteer navigates there with no session
// cookie). Modeled on lib/server/cron/auth.ts's HMAC pattern — does NOT
// import auth.ts/crypto.ts (both CLAUDE.md-protected). Reuses JWT_SECRET
// (already required at boot, >=32 chars) rather than adding a new env var.
//
// Two payload shapes share the same sign/verify machinery:
//  - PrintTokenPayload: a real student's bulletin (schoolId/studentId/termId
//    bound together, read from the DB by the print page).
//  - TemplatePreviewTokenPayload: a template editor "Exporter PDF" preview —
//    the config travels IN the token itself (not re-read from the DB), so
//    the exported PDF reflects the editor's current in-memory state even
//    before the user hits "Enregistrer".
// Either way the token can never be replayed to render something else, and
// self-expires after 60s.
import 'server-only';
import crypto from 'node:crypto';
import type { BulletinTemplateConfig } from '@/app/(school)/configuration/modele-bulletin/types';

export interface PrintTokenPayload {
  schoolId: string;
  studentId: string;
  termId: string;
  exp: number;
}

export interface TemplatePreviewTokenPayload {
  schoolId: string;
  config: BulletinTemplateConfig;
  exp: number;
}

const TTL_MS = 60_000;

function secret(): string {
  return process.env.JWT_SECRET ?? '';
}

function sign<T extends { exp: number }>(payload: Omit<T, 'exp'>): string {
  const full = { ...payload, exp: Date.now() + TTL_MS } as T;
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify<T extends { exp: number }>(token: string): T | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload: T;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  return payload;
}

export function signPrintToken(payload: Omit<PrintTokenPayload, 'exp'>): string {
  return sign<PrintTokenPayload>(payload);
}

export function verifyPrintToken(token: string): PrintTokenPayload | null {
  return verify<PrintTokenPayload>(token);
}

export function signTemplatePreviewToken(
  payload: Omit<TemplatePreviewTokenPayload, 'exp'>,
): string {
  return sign<TemplatePreviewTokenPayload>(payload);
}

export function verifyTemplatePreviewToken(token: string): TemplatePreviewTokenPayload | null {
  return verify<TemplatePreviewTokenPayload>(token);
}
