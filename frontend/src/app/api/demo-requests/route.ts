// POST /api/demo-requests — public landing-page lead capture (Demander une
// démo). No session exists yet, so — same CSRF carve-out as /api/auth/signup
// — verifyCsrf is not called here.
//
// Anti-spam: a hidden `company` honeypot (bots fill it, humans never see it —
// silently accepted so the bot doesn't learn its submission was dropped) plus
// a per-email rate limit on top of the shared limiter store. The lead is
// emailed to DEMO_REQUEST_EMAIL via the existing EmailQueue/Resend pipeline
// (drained by the email-queue-drain cron) — if that's not configured, the
// visitor still gets a success response (never a broken public form) and a
// warning is logged so the gap is observable in ops.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { zEmail, zPhone } from '@/lib/server/zod-helpers';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const SIZE_LABEL: Record<string, string> = {
  small: 'Moins de 200',
  medium: '200 - 500',
  large: '500 - 1000',
  xlarge: 'Plus de 1000',
};
const PLAN_LABEL: Record<string, string> = {
  starter: 'Starter (gratuit)',
  pro: 'Établissement Pro',
  enterprise: 'Enterprise (sur mesure)',
};

const Body = z.object({
  fullName: z.string().trim().min(1).max(200),
  phone: z.union([zPhone, z.literal('')]).optional(),
  email: zEmail,
  school: z.string().trim().min(1).max(200),
  size: z.enum(['small', 'medium', 'large', 'xlarge']),
  plan: z.enum(['starter', 'pro', 'enterprise']),
  company: z.string().optional(), // honeypot — must stay empty
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'demo-request',
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Number(process.env.DEMO_REQUEST_RATE_LIMIT_MAX ?? 3),
  code: 'TOO_MANY_DEMO_REQUESTS',
  message: 'Too many demo requests. Try again later.',
});

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { fullName, phone, email, school, size, plan, company } = parsed.data;

    // Honeypot tripped — pretend success, do nothing further.
    if (company && company.trim() !== '') {
      log.info('demo-request honeypot tripped');
      return NextResponse.json(
        { ok: true },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const rateFail = await limiter.check(req, email);
    if (rateFail) return rateFail;

    const queue = getEmailQueue();
    const to = process.env.DEMO_REQUEST_EMAIL || process.env.EMAIL_FROM;
    if (queue && to) {
      const html = `
        <h2>Nouvelle demande de démo — Schoolgesti</h2>
        <ul>
          <li><strong>Nom :</strong> ${escapeHtml(fullName)}</li>
          <li><strong>Téléphone :</strong> ${escapeHtml(phone || '—')}</li>
          <li><strong>Email :</strong> ${escapeHtml(email)}</li>
          <li><strong>Établissement :</strong> ${escapeHtml(school)}</li>
          <li><strong>Effectif :</strong> ${escapeHtml(SIZE_LABEL[size] ?? size)}</li>
          <li><strong>Plan souhaité :</strong> ${escapeHtml(PLAN_LABEL[plan] ?? plan)}</li>
        </ul>
      `.trim();
      await queue.enqueue({
        to,
        subject: `Nouvelle demande de démo — ${school}`,
        html,
        text: `${fullName} (${email}, ${phone || 'sans téléphone'}) — ${school}, ${SIZE_LABEL[size] ?? size}, plan ${PLAN_LABEL[plan] ?? plan}`,
      });
    } else {
      log.warn(
        'demo-request: email queue not configured (RESEND_API_KEY / EMAIL_FROM / Redis) — lead not emailed',
      );
    }

    log.info('demo-request received');
    return NextResponse.json(
      { ok: true },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
