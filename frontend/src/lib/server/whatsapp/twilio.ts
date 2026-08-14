// WhatsApp delivery via Twilio's REST API (plain fetch — the official SDK
// isn't worth the dependency for one endpoint). Lazy env check, mirrors the
// redis.ts / email-queue-singleton.ts pattern: returns null when
// TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM /
// TWILIO_CONTENT_SID are absent, callers decide the fallback (fee-reminders
// logs a stub warning and sends nothing).
//
// CONTENT TEMPLATE REQUIRED — empirically confirmed 2026-08-14: a plain
// `Body` send returned Twilio error 21654 "ContentSid Required" even inside
// the sandbox's post-"join" session window, and Twilio's own default sandbox
// template (fixed "Reminder: Appt ... Reply C to confirm or R to reschedule"
// text) can't be repurposed for our content. So this module always sends via
// `ContentSid` + `ContentVariables`, never free-form `Body`.
//
// TEMPLATE CONVENTION: TWILIO_CONTENT_SID must point to a template whose
// entire body is the single variable `{{1}}` — this lets every caller here
// build its own full message text (buildReminderMessage() etc.) and pass it
// through unchanged, without needing a separate approved template per
// message type. Create it via Twilio Console → Content Template Builder
// (Content API is blocked on trial accounts) — WhatsApp Business template
// review by Meta is required before this works outside the sandbox.
import 'server-only';
import { createLogger } from '@/lib/server/logger';

const log = createLogger();

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from: string;
  contentSid: string;
}

function getConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const contentSid = process.env.TWILIO_CONTENT_SID;
  if (!accountSid || !authToken || !from || !contentSid) return null;
  return { accountSid, authToken, from, contentSid };
}

export type SendWhatsAppResult = { ok: true; sid: string } | { ok: false; error: string };

/**
 * Sends a WhatsApp message via Twilio using the single-variable content
 * template (see module header). `to` must be E.164 (e.g. "+221771234567")
 * — this function adds the "whatsapp:" prefix Twilio's API requires.
 */
export async function sendWhatsAppMessage(to: string, body: string): Promise<SendWhatsAppResult> {
  const config = getConfig();
  if (!config) {
    log.warn(
      'whatsapp: not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM / TWILIO_CONTENT_SID required) — message not sent',
    );
    return { ok: false, error: 'NOT_CONFIGURED' };
  }

  const params = new URLSearchParams({
    To: `whatsapp:${to}`,
    From: config.from,
    ContentSid: config.contentSid,
    ContentVariables: JSON.stringify({ '1': body }),
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
      },
      body: params,
    },
  );

  const json = (await res.json().catch(() => null)) as { sid?: string; message?: string } | null;

  if (!res.ok) {
    const error = json?.message ?? `Twilio API error (HTTP ${res.status})`;
    log.warn('whatsapp: send failed', { error, status: res.status });
    return { ok: false, error };
  }

  if (!json?.sid) {
    log.warn('whatsapp: send returned no message SID');
    return { ok: false, error: 'NO_SID_RETURNED' };
  }

  return { ok: true, sid: json.sid };
}

/** Test-only — nothing to reset (stateless), kept for symmetry with other singletons. */
export function __isWhatsAppConfigured(): boolean {
  return getConfig() !== null;
}
