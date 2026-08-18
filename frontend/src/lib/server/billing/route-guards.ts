// Shared guard chain of the /api/school/billing/* routes — the same
// requireAuth → resolveMySchool (404 NO_SCHOOL) → hasMinRole sequence every
// /api/school/* route inlines, plus the Stripe-specific error translation
// (StripeUnconfiguredError → 503 STRIPE_NOT_CONFIGURED, Stripe API errors →
// 502 STRIPE_ERROR with the message logged, never leaked).
import 'server-only';
import { NextResponse } from 'next/server';
import { requireAuth, type AuthContext } from '@/lib/server/middleware';
import { resolveMySchool, hasMinRole, type MySchool } from '@/lib/server/school';
import type { OrgRole } from '@/lib/server/middleware/require-org-role';
import { createLogger } from '@/lib/server/logger';
import { StripeUnconfiguredError } from './stripe-client';
import { AlreadySubscribedError } from './stripe';

const log = createLogger();

export interface BillingRouteContext {
  auth: AuthContext;
  mySchool: MySchool;
}

/**
 * Resolves the caller's school and checks the minimum org role. Billing
 * reads (summary, invoices) are for OWNER/ADMIN; mutations (checkout,
 * portal, cancel, interval) are OWNER-only — money leaves the school's
 * account. Plain MEMBERs (teachers) never see amounts or invoices.
 */
export async function requireSchoolBilling(
  requestId: string,
  minRole: OrgRole,
): Promise<BillingRouteContext | NextResponse> {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const mySchool = await resolveMySchool(auth.user.sub);
  if (!mySchool) {
    return NextResponse.json(
      { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
      { status: 404, headers: { 'x-request-id': requestId } },
    );
  }
  if (!hasMinRole(mySchool.role, minRole)) {
    return NextResponse.json(
      { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
      { status: 403, headers: { 'x-request-id': requestId } },
    );
  }
  return { auth, mySchool };
}

/** Map a thrown Stripe-side error to a stable JSON error response. */
export function stripeErrorResponse(err: unknown, requestId: string): NextResponse {
  if (err instanceof AlreadySubscribedError) {
    return NextResponse.json(
      {
        error: 'ALREADY_SUBSCRIBED',
        message: 'Cette école a déjà un abonnement en cours — gérez-le depuis la page Abonnement.',
      },
      { status: 409, headers: { 'x-request-id': requestId } },
    );
  }
  if (err instanceof StripeUnconfiguredError) {
    return NextResponse.json(
      {
        error: 'STRIPE_NOT_CONFIGURED',
        message: 'La facturation en ligne n’est pas encore activée sur cette plateforme.',
      },
      { status: 503, headers: { 'x-request-id': requestId } },
    );
  }
  log.error('stripe call failed', { err: err instanceof Error ? err.message : String(err) });
  return NextResponse.json(
    { error: 'STRIPE_ERROR', message: 'Stripe n’a pas pu traiter la demande. Réessayez.' },
    { status: 502, headers: { 'x-request-id': requestId } },
  );
}
