// GET /api/school/grade-levels — the school's ordered grade-level catalog.
// POST — append a level at the end (order = max+1). ADMIN+ for mutations,
// any school member may read. Names are unique per school (409
// LEVEL_NAME_TAKEN). Spec: docs/superpowers/specs/2026-08-17-grade-level-ordering-design.md
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { hasMinRole } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export const LEVEL_SELECT = { id: true, name: true, order: true } as const;

export const LevelNameBody = z.object({
  name: z.string().trim().min(1).max(40),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'configuration',
      'view',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const levels = await prisma.gradeLevel.findMany({
      where: { schoolId: mySchool.schoolId },
      orderBy: { order: 'asc' },
      select: LEVEL_SELECT,
    });

    return NextResponse.json({ levels }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'configuration',
      'create',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;
    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = LevelNameBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const name = parsed.data.name;

    const clash = await prisma.gradeLevel.findFirst({
      where: { schoolId: mySchool.schoolId, name },
      select: { id: true },
    });
    if (clash) {
      return NextResponse.json(
        { error: 'LEVEL_NAME_TAKEN', message: `Le niveau « ${name} » existe déjà.` },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { _max } = await prisma.gradeLevel.aggregate({
      where: { schoolId: mySchool.schoolId },
      _max: { order: true },
    });
    const order = (_max.order ?? -1) + 1;

    try {
      const level = await prisma.gradeLevel.create({
        data: { schoolId: mySchool.schoolId, name, order },
      });
      return NextResponse.json(
        { level: { id: level.id, name: level.name, order: level.order } },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      // Two admins adding the same name at once: the pre-check above races,
      // the @@unique([schoolId, name]) constraint doesn't.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return NextResponse.json(
          { error: 'LEVEL_NAME_TAKEN', message: `Le niveau « ${name} » existe déjà.` },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}
