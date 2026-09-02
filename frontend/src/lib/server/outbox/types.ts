/**
 * Outbox event types. Add new variants here, then handle them in
 * backend/src/lib/outbox/dispatcher.ts.
 *
 * `kind` is a dotted "domain.event" string. The dispatcher looks up the
 * handler by exact match — no inheritance, no fallback dispatching.
 *
 * Each variant carries its own `payload` shape; runtime validation
 * happens in the dispatcher (the JSON column is opaque to Prisma).
 */

export type OutboxEvent =
  | NotificationPaymentReceivedEvent
  | EmailPaymentConfirmationEvent
  | EmailVerificationCodeEvent
  | EmailPasswordResetEvent
  | EmailPortalInviteEvent;

export interface NotificationPaymentReceivedEvent {
  kind: 'notification.payment_received';
  payload: {
    userId: string;
    orderId: string;
    amount: number;
    currency: string;
  };
}

export interface EmailPaymentConfirmationEvent {
  kind: 'email.payment_confirmation';
  payload: {
    to: string;
    orderId: string;
    amount: number;
    currency: string;
  };
}

/**
 * Phase 1 — emitted by signup + resend-verification routes; consumed by the
 * email-queue cron in Phase 5 (which calls verificationEmail() to render).
 */
export interface EmailVerificationCodeEvent {
  kind: 'email.verification_code';
  payload: {
    to: string;
    code: string;
    expiresAt: string;
  };
}

/**
 * Phase 1 — emitted by forgot-password route; consumed by the email-queue cron
 * in Phase 5 (which calls resetPasswordEmail() to render).
 */
export interface EmailPasswordResetEvent {
  kind: 'email.password_reset';
  payload: {
    to: string;
    code: string;
    expiresAt: string;
  };
}

/**
 * Generic invite email for any portal-account type (teacher today, student
 * later) — `portalLabel` carries the human-readable destination ("espace
 * enseignant") so one template/dispatcher case serves every portal type.
 * Emitted by createPortalInvite() (lib/server/portal-invite.ts).
 */
export interface EmailPortalInviteEvent {
  kind: 'email.portal_invite';
  payload: {
    to: string;
    code: string;
    expiresAt: string;
    portalLabel: string;
    /** Path the invite link points to (e.g. '/definir-mot-de-passe' for
     * teachers, '/definir-mot-de-passe-eleve' for students). Always filled
     * concretely by createPortalInvite() before the event is enqueued —
     * the default lives upstream there, not here. */
    acceptPath: string;
  };
}

export type OutboxEventKind = OutboxEvent['kind'];
