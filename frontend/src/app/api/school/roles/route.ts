// frontend/src/app/api/school/roles/route.ts
// GET (liste) + POST (création) des rôles staff — OWNER/ADMIN uniquement.
// Spec 2026-09-01-permission-manager §8.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { sanitizeGrants } from '@/lib/permissions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).optional(),
  grants: z.array(z.string()).optional(),
});

function forbidden(requestId: string) {
  return NextResponse.json(
    { error: 'FORBIDDEN', message: 'Admin role required.' },
    { status: 403, headers: { 'x-request-id': requestId } },
  );
}
function noSchool(requestId: string) {
  return NextResponse.json(
    { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
    { status: 404, headers: { 'x-request-id': requestId } },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) return noSchool(ctx.requestId);
    if (!hasMinRole(mySchool.role, 'ADMIN')) return forbidden(ctx.requestId);

    const [roles, owners, admins] = await Promise.all([
      prisma.staffRole.findMany({
        where: { schoolId: mySchool.schoolId },
        orderBy: { name: 'asc' },
        include: { _count: { select: { members: true } } },
      }),
      prisma.organizationMember.count({
        where: { organizationId: mySchool.organizationId, role: 'OWNER' },
      }),
      prisma.organizationMember.count({
        where: { organizationId: mySchool.organizationId, role: 'ADMIN' },
      }),
    ]);
    return NextResponse.json(
      {
        roles: roles.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          grants: r.grants,
          memberCount: r._count.members,
          updatedAt: r.updatedAt.toISOString(),
        })),
        systemCounts: { owners, admins },
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrf = verifyCsrf(req);
    if (csrf) return csrf;
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) return noSchool(ctx.requestId);
    if (!hasMinRole(mySchool.role, 'ADMIN')) return forbidden(ctx.requestId);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid role payload.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    try {
      const role = await prisma.staffRole.create({
        data: {
          schoolId: mySchool.schoolId,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          grants: sanitizeGrants(parsed.data.grants ?? []),
        },
      });
      return NextResponse.json(
        {
          role: {
            ...role,
            updatedAt: role.updatedAt.toISOString(),
            createdAt: role.createdAt.toISOString(),
          },
        },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
        return NextResponse.json(
          { error: 'ROLE_NAME_TAKEN', message: 'A role with this name already exists.' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}
