// /api/school/billing/* — guard order (CSRF → auth → NO_SCHOOL → OWNER),
// 503 STRIPE_NOT_CONFIGURED when keys are absent, 409 when a live Stripe
// subscription already exists (checkout) / when nothing to manage (portal,
// PATCH), happy paths returning Stripe URLs. Stripe helpers are mocked —
// their behaviour is covered by lib/server/billing/stripe.test.ts.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchool: vi.fn() };
});
const {
  createCheckoutSession,
  createPortalSession,
  setCancelAtPeriodEnd,
  changeInterval,
  getBillingSummary,
  getPlanSnapshot,
} = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  setCancelAtPeriodEnd: vi.fn(),
  changeInterval: vi.fn(),
  getBillingSummary: vi.fn(),
  getPlanSnapshot: vi.fn(),
}));
vi.mock('@/lib/server/billing/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/billing/stripe')>(
    '@/lib/server/billing/stripe',
  );
  return {
    ...actual,
    createCheckoutSession,
    createPortalSession,
    setCancelAtPeriodEnd,
    changeInterval,
  };
});
vi.mock('@/lib/server/billing/summary', () => ({ getBillingSummary, getPlanSnapshot }));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';
import { StripeUnconfiguredError } from '@/lib/server/billing/stripe-client';
import { GET } from './route';
import { GET as PLAN } from './plan/route';
import { POST as CHECKOUT } from './checkout/route';
import { POST as PORTAL } from './portal/route';
import { PATCH } from './subscription/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);

const authUser = { user: { sub: 'user_1', email: 'owner@test.local' } };
const owner = { organizationId: 'org_1', schoolId: 'school_1', role: 'OWNER' as const };
const admin = { ...owner, role: 'ADMIN' as const };

function req(method: string, url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
  vi.stubEnv('APP_URL', 'https://app.test');
  mockRequireAuth.mockReset();
  mockVerifyCsrf.mockReset();
  mockResolveMySchool.mockReset();
  createCheckoutSession.mockReset();
  createPortalSession.mockReset();
  setCancelAtPeriodEnd.mockReset();
  changeInterval.mockReset();
  getBillingSummary.mockReset();
  getPlanSnapshot.mockReset();
  mockRequireAuth.mockResolvedValue(authUser);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(owner);
  getBillingSummary.mockResolvedValue({ plan: 'STARTER' });
  getPlanSnapshot.mockResolvedValue({ plan: 'STARTER', studentCount: 42, studentHardLimit: 50 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/school/billing', () => {
  it('returns the summary + role for OWNER and ADMIN', async () => {
    mockResolveMySchool.mockResolvedValueOnce(admin);
    const res = await GET(req('GET', '/api/school/billing'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ billing: { plan: 'STARTER' }, role: 'ADMIN' });
    expect(getBillingSummary).toHaveBeenCalledWith(expect.anything(), 'school_1');
  });

  it('403 ORG_ROLE_INSUFFICIENT for a plain MEMBER (amounts and invoices are admin matters)', async () => {
    mockResolveMySchool.mockResolvedValueOnce({ ...owner, role: 'MEMBER' });
    const res = await GET(req('GET', '/api/school/billing'));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('ORG_ROLE_INSUFFICIENT');
    expect(getBillingSummary).not.toHaveBeenCalled();
  });

  it('404 NO_SCHOOL without membership, 401 passthrough from requireAuth', async () => {
    mockResolveMySchool.mockResolvedValueOnce(null);
    const res = await GET(req('GET', '/api/school/billing'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NO_SCHOOL');

    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    expect((await GET(req('GET', '/api/school/billing'))).status).toBe(401);
  });
});

describe('GET /api/school/billing/plan', () => {
  it('returns the lightweight snapshot + role for OWNER/ADMIN (no full summary)', async () => {
    mockResolveMySchool.mockResolvedValueOnce(admin);
    const res = await PLAN(req('GET', '/api/school/billing/plan'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      plan: { plan: 'STARTER', studentCount: 42, studentHardLimit: 50 },
      role: 'ADMIN',
      permissions: 'ALL',
    });
    expect(getPlanSnapshot).toHaveBeenCalledWith(expect.anything(), 'school_1');
    expect(getBillingSummary).not.toHaveBeenCalled();
  });

  it('a plain MEMBER gets 200 with plan:null (sidebar shows nothing, no leak)', async () => {
    mockResolveMySchool.mockResolvedValueOnce({ ...owner, role: 'MEMBER' });
    const res = await PLAN(req('GET', '/api/school/billing/plan'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plan: null, role: 'MEMBER', permissions: [] });
    expect(getPlanSnapshot).not.toHaveBeenCalled();
  });

  it('404 NO_SCHOOL without membership, 401 passthrough from requireAuth', async () => {
    mockResolveMySchool.mockResolvedValueOnce(null);
    const res = await PLAN(req('GET', '/api/school/billing/plan'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NO_SCHOOL');

    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    expect((await PLAN(req('GET', '/api/school/billing/plan'))).status).toBe(401);
    expect(getPlanSnapshot).not.toHaveBeenCalled();
  });
});

describe('POST /api/school/billing/checkout', () => {
  it('CSRF failure short-circuits before auth', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await CHECKOUT(req('POST', '/api/school/billing/checkout', { interval: 'MONTH' }));
    expect(res.status).toBe(403);
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });

  it('403 ORG_ROLE_INSUFFICIENT for a non-owner', async () => {
    mockResolveMySchool.mockResolvedValueOnce(admin);
    const res = await CHECKOUT(req('POST', '/api/school/billing/checkout', {}));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('ORG_ROLE_INSUFFICIENT');
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('409 ALREADY_SUBSCRIBED when Stripe itself reports an open subscription (AlreadySubscribedError)', async () => {
    const { AlreadySubscribedError } = await import('@/lib/server/billing/stripe');
    createCheckoutSession.mockRejectedValueOnce(new AlreadySubscribedError('sub_open'));
    const res = await CHECKOUT(req('POST', '/api/school/billing/checkout', { interval: 'MONTH' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ALREADY_SUBSCRIBED');
  });

  it('400 on an invalid interval', async () => {
    const res = await CHECKOUT(req('POST', '/api/school/billing/checkout', { interval: 'WEEK' }));
    expect(res.status).toBe(400);
  });

  it('409 ALREADY_SUBSCRIBED when a live Stripe subscription exists', async () => {
    prismaMock.subscription.findUnique.mockResolvedValueOnce({
      stripeSubscriptionId: 'sub_1',
      stripeStatus: 'active',
    } as never);
    const res = await CHECKOUT(req('POST', '/api/school/billing/checkout', { interval: 'MONTH' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ALREADY_SUBSCRIBED');
  });

  it('a canceled Stripe subscription does NOT block a new checkout', async () => {
    prismaMock.subscription.findUnique.mockResolvedValueOnce({
      stripeSubscriptionId: 'sub_old',
      stripeStatus: 'canceled',
    } as never);
    createCheckoutSession.mockResolvedValueOnce('https://checkout.stripe.com/x');
    const res = await CHECKOUT(req('POST', '/api/school/billing/checkout', { interval: 'YEAR' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/x' });
    expect(createCheckoutSession).toHaveBeenCalledWith(expect.anything(), {
      schoolId: 'school_1',
      interval: 'YEAR',
      appUrl: 'https://app.test',
      requesterEmail: 'owner@test.local',
    });
  });

  it('503 STRIPE_NOT_CONFIGURED when the SDK is not configured', async () => {
    prismaMock.subscription.findUnique.mockResolvedValueOnce(null);
    createCheckoutSession.mockRejectedValueOnce(new StripeUnconfiguredError(['STRIPE_SECRET_KEY']));
    const res = await CHECKOUT(req('POST', '/api/school/billing/checkout', {}));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('STRIPE_NOT_CONFIGURED');
  });

  it('502 STRIPE_ERROR on any other Stripe failure (message not leaked)', async () => {
    prismaMock.subscription.findUnique.mockResolvedValueOnce(null);
    createCheckoutSession.mockRejectedValueOnce(new Error('No such price: price_x'));
    const res = await CHECKOUT(req('POST', '/api/school/billing/checkout', {}));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('STRIPE_ERROR');
    expect(JSON.stringify(body)).not.toContain('price_x');
  });
});

describe('POST /api/school/billing/portal', () => {
  it('409 NO_STRIPE_CUSTOMER when the school never checked out', async () => {
    prismaMock.school.findUnique.mockResolvedValueOnce({ stripeCustomerId: null } as never);
    const res = await PORTAL(req('POST', '/api/school/billing/portal'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('NO_STRIPE_CUSTOMER');
  });

  it('returns the portal URL for the owner', async () => {
    prismaMock.school.findUnique.mockResolvedValueOnce({ stripeCustomerId: 'cus_1' } as never);
    createPortalSession.mockResolvedValueOnce('https://billing.stripe.com/p/x');
    const res = await PORTAL(req('POST', '/api/school/billing/portal'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://billing.stripe.com/p/x' });
    expect(createPortalSession).toHaveBeenCalledWith('cus_1', 'https://app.test');
  });

  it('403 for a non-owner', async () => {
    mockResolveMySchool.mockResolvedValueOnce(admin);
    expect((await PORTAL(req('POST', '/api/school/billing/portal'))).status).toBe(403);
  });
});

describe('PATCH /api/school/billing/subscription', () => {
  const liveSub = {
    stripeSubscriptionId: 'sub_1',
    stripeStatus: 'active',
    billingInterval: 'MONTH',
  };

  it('400 when neither or both fields are given', async () => {
    expect((await PATCH(req('PATCH', '/api/school/billing/subscription', {}))).status).toBe(400);
    expect(
      (
        await PATCH(
          req('PATCH', '/api/school/billing/subscription', {
            cancelAtPeriodEnd: true,
            interval: 'YEAR',
          }),
        )
      ).status,
    ).toBe(400);
  });

  it('409 NO_STRIPE_SUBSCRIPTION for a manual or canceled subscription', async () => {
    prismaMock.subscription.findUnique.mockResolvedValueOnce({
      stripeSubscriptionId: null,
      stripeStatus: null,
      billingInterval: null,
    } as never);
    const res = await PATCH(
      req('PATCH', '/api/school/billing/subscription', { cancelAtPeriodEnd: true }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('NO_STRIPE_SUBSCRIPTION');
  });

  it('cancelAtPeriodEnd → setCancelAtPeriodEnd, then returns the fresh summary', async () => {
    prismaMock.subscription.findUnique.mockResolvedValueOnce(liveSub as never);
    setCancelAtPeriodEnd.mockResolvedValueOnce(undefined);
    getBillingSummary.mockResolvedValueOnce({ plan: 'PRO', cancelAtPeriodEnd: true });
    const res = await PATCH(
      req('PATCH', '/api/school/billing/subscription', { cancelAtPeriodEnd: true }),
    );
    expect(res.status).toBe(200);
    expect(setCancelAtPeriodEnd).toHaveBeenCalledWith(expect.anything(), 'sub_1', true);
    expect(await res.json()).toEqual({
      billing: { plan: 'PRO', cancelAtPeriodEnd: true },
      role: 'OWNER',
    });
  });

  it('interval → changeInterval only when it actually changes', async () => {
    prismaMock.subscription.findUnique.mockResolvedValueOnce(liveSub as never);
    await PATCH(req('PATCH', '/api/school/billing/subscription', { interval: 'MONTH' }));
    expect(changeInterval).not.toHaveBeenCalled();

    prismaMock.subscription.findUnique.mockResolvedValueOnce(liveSub as never);
    changeInterval.mockResolvedValueOnce(undefined);
    await PATCH(req('PATCH', '/api/school/billing/subscription', { interval: 'YEAR' }));
    expect(changeInterval).toHaveBeenCalledWith(expect.anything(), 'sub_1', 'YEAR');
  });
});
