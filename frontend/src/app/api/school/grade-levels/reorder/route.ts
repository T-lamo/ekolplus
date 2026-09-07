// POST /api/school/grade-levels/reorder — body { orderedIds: string[] } must
// be exactly the set of the school's level ids (400 INVALID_LEVEL_SET
// otherwise — catches a stale client racing another admin's add/delete).
// Rewrites every row's `order` to its array index in one $transaction.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { LEVEL_SELECT } from '../route';

const ReorderBody = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

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
      'edit',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const parsed = ReorderBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { orderedIds } = parsed.data;

    const existing = await prisma.gradeLevel.findMany({
      where: { schoolId: mySchool.schoolId },
      select: LEVEL_SELECT,
    });
    const byId = new Map(existing.map((l) => [l.id, l]));
    const sameSet =
      orderedIds.length === existing.length &&
      new Set(orderedIds).size === orderedIds.length &&
      orderedIds.every((id) => byId.has(id));
    if (!sameSet) {
      return NextResponse.json(
        {
          error: 'INVALID_LEVEL_SET',
          message: 'La liste des niveaux a changé — recharge la page et réessaie.',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.$transaction(
      orderedIds.map((id, order) => prisma.gradeLevel.update({ where: { id }, data: { order } })),
    );

    return NextResponse.json(
      {
        levels: orderedIds.map((id, order) => ({
          id,
          // `sameSet` above guarantees every id is in the map.
          name: byId.get(id)?.name ?? '',
          order,
          bulletinTemplateId: byId.get(id)?.bulletinTemplateId ?? null,
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
