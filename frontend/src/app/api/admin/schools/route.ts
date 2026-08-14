// POST /api/admin/schools — creates a School tenant (Organization + School +
// owner OrganizationMember) from the SaaS admin's "Créer une école" screen.
//
// V1 scope only — see .planning/banani/create-school.md. Plan selection /
// Stripe billing / subdomain provisioning are deliberately NOT implemented
// here.
//
// Owner resolution: if a User with the submitted email already exists, they
// are just added as OWNER of the new org (no new credentials, already
// verified — no email sent). Otherwise a new User is created UNVERIFIED with
// no password (passwordHash: null) and an EMAIL_VERIFY code is emailed via
// the same outbox pipeline signup uses (email.verification_code /
// verificationEmail()) — the owner proves they control the address by
// entering the code on /verify-email, which logs them in and lets them set
// their own password via the existing /api/auth/set-password (same route
// OAuth-only users use for a first-time password). No temp password is ever
// generated or shown to the admin — only the owner ever knows their password.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf, generateVerificationCode } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { slugify, ensureUniqueSlug } from '@/lib/server/slug';
import { zEmail, zPhone } from '@/lib/server/zod-helpers';
import { enqueueOutbox } from '@/lib/server/outbox';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { SCHOOL_INCLUDE, loadSchoolRows, schoolWhere } from '@/lib/server/admin/school-overview';
import { pctDelta } from '@/lib/server/admin/saas-metrics';

const VERIFICATION_TTL_MS = Number(process.env.AUTH_VERIFICATION_TTL_MIN ?? 15) * 60 * 1000;

const Body = z.object({
  schoolName: z.string().trim().min(2).max(120),
  shortName: z.string().trim().max(10).optional(),
  country: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80),
  schoolType: z.string().trim().min(1).max(80),
  primaryLanguage: z.string().trim().max(40).optional(),
  address: z.string().trim().max(200).optional(),
  phone: zPhone.optional(),
  estimatedStudents: z.number().int().positive().max(1_000_000).optional(),
  ownerFirstName: z.string().trim().min(1).max(60),
  ownerLastName: z.string().trim().min(1).max(60),
  ownerEmail: zEmail,
  ownerRole: z.string().trim().max(60).optional(),
  ownerPhone: zPhone.optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    const existingOwner = await prisma.user.findUnique({
      where: { email: data.ownerEmail },
      select: { id: true, email: true, name: true },
    });

    const verificationCode = existingOwner ? null : generateVerificationCode();
    const verificationExpiresAt = verificationCode
      ? new Date(Date.now() + VERIFICATION_TTL_MS)
      : null;

    const result = await prisma.$transaction(async (tx) => {
      const owner =
        existingOwner ??
        (await tx.user.create({
          data: {
            email: data.ownerEmail,
            name: `${data.ownerFirstName} ${data.ownerLastName}`,
            passwordHash: null,
            emailVerifiedAt: null,
          },
          select: { id: true, email: true, name: true },
        }));

      if (verificationCode && verificationExpiresAt) {
        await tx.verificationCode.create({
          data: {
            userId: owner.id,
            code: verificationCode,
            type: 'EMAIL_VERIFY',
            expiresAt: verificationExpiresAt,
          },
        });
        await enqueueOutbox(tx, {
          kind: 'email.verification_code',
          payload: {
            to: owner.email,
            code: verificationCode,
            expiresAt: verificationExpiresAt.toISOString(),
          },
        });
      }

      let organization: { id: string; slug: string; name: string } | undefined;
      await ensureUniqueSlug(
        slugify(data.schoolName),
        async (slug) => {
          organization = await tx.organization.create({
            data: { slug, name: data.schoolName, ownerId: owner.id },
            select: { id: true, slug: true, name: true },
          });
        },
        { reserved: ['schools'] },
      );
      if (!organization) throw new Error('organization creation failed');

      const school = await tx.school.create({
        data: {
          organizationId: organization.id,
          name: data.schoolName,
          shortName: data.shortName ?? null,
          country: data.country,
          city: data.city,
          schoolType: data.schoolType,
          primaryLanguage: data.primaryLanguage ?? null,
          address: data.address ?? null,
          phone: data.phone ?? null,
          estimatedStudents: data.estimatedStudents ?? null,
        },
      });

      await tx.organizationMember.create({
        data: { organizationId: organization.id, userId: owner.id, role: 'OWNER' },
      });

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'school.create',
        targetType: 'Organization',
        targetId: organization.id,
        metadata: {
          schoolName: data.schoolName,
          ownerEmail: owner.email,
          ownerAccountCreated: !existingOwner,
        },
      });

      return { organization, school, owner };
    });

    return NextResponse.json(
      {
        organization: result.organization,
        school: result.school,
        owner: { id: result.owner.id, email: result.owner.email, name: result.owner.name },
        // true only when a new account was created — the owner gets an
        // EMAIL_VERIFY code by email and sets their own password, so there is
        // nothing left for the admin to communicate.
        verificationEmailSent: !existingOwner,
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

// GET /api/admin/schools — Écoles clientes list (Banani 72UpLW9LHCiI).
// Page-based pagination (the fees-module precedent — the Pager needs a
// total, which cursor pagination can't give) + server-side q/plan/status/
// country filters + the screen's 4 KPI aggregates in the same response so
// one call hydrates the page. Empty list → 200 { items: [] }, never 404.
const PAGE_SIZE = 20;
const REVENUE_STATUSES = ['SUCCEEDED', 'REFUNDED'] as const;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    const q = (url.searchParams.get('q') ?? '').slice(0, 200).trim();
    const filters = {
      q: q || undefined,
      plan: url.searchParams.get('plan') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      country: url.searchParams.get('country') ?? undefined,
    };
    const where = schoolWhere(filters);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      total,
      schools,
      totalSchools,
      schoolsThisMonth,
      activeSubscriptions,
      pendingOrSuspended,
      totalStudents,
      studentsThisMonth,
      curRevenue,
      prevRevenue,
      countryRows,
    ] = await Promise.all([
      prisma.school.count({ where }),
      prisma.school.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: SCHOOL_INCLUDE,
      }),
      prisma.school.count(),
      prisma.school.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.subscription.count({ where: { status: { in: ['TRIAL', 'SUSPENDED'] } } }),
      prisma.student.count(),
      prisma.student.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.billingTransaction.aggregate({
        _sum: { amountCents: true },
        where: { status: { in: [...REVENUE_STATUSES] }, paidAt: { gte: monthStart } },
      }),
      prisma.billingTransaction.aggregate({
        _sum: { amountCents: true },
        where: {
          status: { in: [...REVENUE_STATUSES] },
          paidAt: { gte: prevMonthStart, lt: monthStart },
        },
      }),
      prisma.school.findMany({
        distinct: ['country'],
        select: { country: true },
        orderBy: { country: 'asc' },
      }),
    ]);

    const monthRevenueCents = curRevenue._sum.amountCents ?? 0;

    return NextResponse.json(
      {
        items: await loadSchoolRows(prisma, schools, now),
        total,
        page,
        pageSize: PAGE_SIZE,
        stats: {
          totalSchools,
          schoolsDeltaMonth: schoolsThisMonth,
          activeSubscriptions,
          pendingOrSuspended,
          totalStudents,
          studentsDeltaMonth: studentsThisMonth,
          monthRevenueCents,
          revenueDeltaPct: pctDelta(monthRevenueCents, prevRevenue._sum.amountCents ?? 0),
        },
        countries: countryRows.map((c) => c.country),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
