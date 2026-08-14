// ADMIN-01 — GET /api/admin/users (list with q + status + role filters,
// cursor pagination).
//
// Sequence (Phase 3 RESEARCH.md Pattern 1, "admin-read"):
//   makeRequestContext → withRequestContext →
//     requireAdmin('ADMIN') (D-ADMIN-03 — ADMIN suffices for PII reads) →
//     enforceAdminRateLimit(auth.admin.id) (D-ADMIN-05 — 100/min/userId) →
//     parse ?q ?status ?role ?cursor ?limit →
//     prisma.user.findMany(take=limit+1, orderBy createdAt DESC, id DESC) →
//     buildPage → return { items, nextCursor }
//
// PII whitelist: USER_SELECT excludes passwordHash / withdrawalPinHash /
// tokenVersion (T-03-02-02 — info-disclosure mitigation). The admin UI
// only needs identity + role + status + createdAt.
//
// Empty result → 200 { items: [], nextCursor: null } per D-LIST-05 — never 404.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  // Epic 2 (admin-users screen): "Dernière connexion" column + the user's
  // school (first membership) for the École column/filter. Still no
  // passwordHash / withdrawalPinHash / tokenVersion — whitelist unchanged.
  lastLoginAt: true,
  memberships: {
    take: 1,
    select: {
      role: true,
      organization: { select: { id: true, school: { select: { id: true, name: true } } } },
    },
  },
} as const satisfies Prisma.UserSelect;

const Q_MAX = 200;
const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const q = (url.searchParams.get('q') ?? '').slice(0, Q_MAX).trim();
    const status = url.searchParams.get('status');
    const role = url.searchParams.get('role');
    // Epic 2 filters: ?org=<organizationId> (École select) and
    // ?orgRole=<OWNER|ADMIN|MEMBER> (Rôle select — org role, the app-wide
    // ?role filter stays for back-office use).
    const org = url.searchParams.get('org');
    const orgRole = url.searchParams.get('orgRole');
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const membershipFilter =
      org || orgRole
        ? {
            memberships: {
              some: {
                ...(org ? { organizationId: org } : {}),
                ...(orgRole ? { role: orgRole } : {}),
              },
            },
          }
        : {};

    const filterWhere: Prisma.UserWhereInput = {
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
      ...(role ? { role } : {}),
      ...membershipFilter,
    };
    const where: Prisma.UserWhereInput = { ...filterWhere, ...cursorWhere(cursor) };

    const now = Date.now();
    const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1);

    const [rows, total, totalUsers, usersThisMonth, activeUsers, suspendedUsers, schoolRows] =
      await Promise.all([
        prisma.user.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          select: USER_SELECT,
        }),
        prisma.user.count({ where: filterWhere }),
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
        prisma.user.count({ where: { lastLoginAt: { gte: new Date(now - ACTIVE_WINDOW_MS) } } }),
        prisma.user.count({ where: { status: 'SUSPENDED' } }),
        prisma.school.findMany({
          select: { name: true, organizationId: true },
          orderBy: { name: 'asc' },
        }),
      ]);

    // "Admins d'école" KPI: distinct users holding OWNER/ADMIN in any org.
    const schoolAdminRows =
      (await prisma.organizationMember.findMany({
        where: { role: { in: ['OWNER', 'ADMIN'] } },
        select: { userId: true },
        distinct: ['userId'],
      })) ?? [];

    const page = buildPage(rows, limit);
    const items = page.items.map(({ memberships, ...rest }) => ({
      ...rest,
      orgRole: memberships?.[0]?.role ?? null,
      school: memberships?.[0]?.organization.school ?? null,
    }));

    return NextResponse.json(
      {
        items,
        nextCursor: page.nextCursor,
        total: total ?? 0,
        stats: {
          totalUsers: totalUsers ?? 0,
          usersDeltaMonth: usersThisMonth ?? 0,
          activeUsers: activeUsers ?? 0,
          activeUsersPct:
            totalUsers && totalUsers > 0
              ? Math.round(((activeUsers ?? 0) / totalUsers) * 1000) / 10
              : 0,
          schoolAdmins: schoolAdminRows.length,
          suspendedUsers: suspendedUsers ?? 0,
        },
        schools: (schoolRows ?? []).map((s) => ({ orgId: s.organizationId, name: s.name })),
      },
      {
        headers: { 'x-request-id': ctx.requestId },
      },
    );
  });
}
