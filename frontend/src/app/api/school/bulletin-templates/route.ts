// GET /api/school/bulletin-templates — gallery read model: every global
// (schoolId: null) template plus this school's own (including forks),
// split into the two tabs the list screen shows. See
// .planning/banani/bulletin-templates.md for the fork-on-write model.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import type { BulletinTemplateConfig } from '@/lib/server/bulletin-templates';

function toRow(t: {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  forkedFromId: string | null;
  config: unknown;
  updatedAt: Date;
}) {
  const config = t.config as BulletinTemplateConfig;
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    isActive: t.isActive,
    forkedFromId: t.forkedFromId,
    primaryColor: config.primaryColor,
    updatedAt: t.updatedAt,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [personal, global] = await Promise.all([
      prisma.bulletinTemplate.findMany({
        where: { schoolId: mySchool.schoolId },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.bulletinTemplate.findMany({
        where: { schoolId: null },
        orderBy: { name: 'asc' },
      }),
    ]);

    return NextResponse.json(
      { personal: personal.map(toRow), global: global.map(toRow) },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
