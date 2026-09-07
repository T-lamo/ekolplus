// Shared "school row with aggregates" loader for the SaaS admin screens —
// the /admin dashboard's Écoles clientes table and /admin/schools both
// render the same shape, so it is computed in exactly one place.
// See .planning/banani/epic-2-admin-foundation.md.
import 'server-only';

import type { $Enums, Prisma, PrismaClient } from '@prisma/client';
import { monthsSince, subscriptionMonthlyCents } from './saas-metrics';

// Prisma transaction clients share this surface with the root client.
type Db = PrismaClient | Prisma.TransactionClient;

const EXPIRING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const SCHOOL_INCLUDE = {
  organization: {
    select: {
      id: true,
      owner: { select: { id: true, name: true, email: true } },
    },
  },
  subscription: {
    include: {
      plan: { select: { key: true, name: true, pricePerStudentCents: true } },
      coupon: { select: { type: true, value: true, durationMonths: true } },
    },
  },
} satisfies Prisma.SchoolInclude;

type SchoolWithBilling = Prisma.SchoolGetPayload<{ include: typeof SCHOOL_INCLUDE }>;

export interface SchoolRow {
  id: string;
  organizationId: string;
  name: string;
  officialCode: string | null;
  country: string;
  city: string;
  ownerName: string;
  plan: { key: string; name: string } | null;
  /** Subscription status, or 'NONE' when the school has no subscription. */
  status: 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELED' | 'NONE';
  /** ACTIVE but renewing within 30 days — the "Expire bientôt" badge. */
  expiringSoon: boolean;
  students: number;
  users: number;
  monthlyCents: number | null;
  renewsAt: string | null;
  createdAt: string;
  lastAccessAt: string | null;
}

export interface SchoolFilters {
  q?: string | undefined;
  plan?: string | undefined;
  status?: string | undefined;
  country?: string | undefined;
}

export function schoolWhere(filters: SchoolFilters): Prisma.SchoolWhereInput {
  const where: Prisma.SchoolWhereInput = {};
  if (filters.q) where.name = { contains: filters.q, mode: 'insensitive' };
  if (filters.country) where.country = filters.country;
  // 'NONE' = schools without any subscription — the plan filter can't apply.
  if (filters.status === 'NONE') {
    where.subscription = { is: null };
    return where;
  }
  const sub: Prisma.SubscriptionWhereInput = {};
  if (filters.plan) sub.plan = { key: filters.plan };
  if (filters.status) sub.status = filters.status as $Enums.SubscriptionStatus;
  if (Object.keys(sub).length > 0) where.subscription = sub;
  return where;
}

export async function loadSchoolRows(
  db: Db,
  schools: SchoolWithBilling[],
  now: Date,
): Promise<SchoolRow[]> {
  const schoolIds = schools.map((s) => s.id);
  const orgIds = schools.map((s) => s.organization.id);
  if (schoolIds.length === 0) return [];

  const [studentCounts, members] = await Promise.all([
    db.student.groupBy({
      by: ['schoolId'],
      where: { schoolId: { in: schoolIds } },
      _count: { _all: true },
    }),
    db.organizationMember.findMany({
      where: { organizationId: { in: orgIds } },
      select: { organizationId: true, user: { select: { lastLoginAt: true } } },
    }),
  ]);

  const studentsBySchool = new Map(studentCounts.map((c) => [c.schoolId, c._count._all]));
  const usersByOrg = new Map<string, number>();
  const lastAccessByOrg = new Map<string, Date>();
  for (const m of members) {
    usersByOrg.set(m.organizationId, (usersByOrg.get(m.organizationId) ?? 0) + 1);
    const at = m.user.lastLoginAt;
    if (at && (lastAccessByOrg.get(m.organizationId) ?? new Date(0)) < at) {
      lastAccessByOrg.set(m.organizationId, at);
    }
  }

  return schools.map((s) => {
    const sub = s.subscription;
    const students = studentsBySchool.get(s.id) ?? 0;
    const monthlyCents =
      sub && sub.status !== 'CANCELED'
        ? subscriptionMonthlyCents({
            students,
            priceCents: sub.plan.pricePerStudentCents,
            coupon: sub.coupon,
            monthsSinceStart: monthsSince(sub.startedAt, now),
          })
        : null;
    return {
      id: s.id,
      organizationId: s.organization.id,
      name: s.name,
      officialCode: s.officialCode,
      country: s.country,
      city: s.city,
      // Final fallback ('Propriétaire sans nom') covers a username-only
      // owner account, which the school-creation flow never actually
      // produces (always email-based) — defensive only, name/email are
      // both nullable at the type level.
      ownerName: s.organization.owner.name ?? s.organization.owner.email ?? 'Propriétaire sans nom',
      plan: sub ? { key: sub.plan.key, name: sub.plan.name } : null,
      status: sub?.status ?? 'NONE',
      expiringSoon:
        sub?.status === 'ACTIVE' && sub.renewsAt.getTime() - now.getTime() < EXPIRING_WINDOW_MS,
      students,
      users: usersByOrg.get(s.organization.id) ?? 0,
      monthlyCents,
      renewsAt: sub?.renewsAt.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      lastAccessAt: lastAccessByOrg.get(s.organization.id)?.toISOString() ?? null,
    };
  });
}

export { SCHOOL_INCLUDE };
