// POST /api/school/bulletin-templates/[id]/fork — duplicate any template
// visible to this school (global, or one of the school's own — the mock
// only shows "Dupliquer" on global cards, but forking your own template is
// a harmless superset) into a new, independent row this school owns.
// forkedFromId traces lineage; the fork never re-syncs with its source.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { hasMinRole } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'notes', 'create', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;
    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const source = await prisma.bulletinTemplate.findUnique({ where: { id } });
    if (!source || (source.schoolId !== null && source.schoolId !== mySchool.schoolId)) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Template not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const fork = await prisma.bulletinTemplate.create({
      data: {
        schoolId: mySchool.schoolId,
        name: `${source.name} (copie)`,
        description: source.description,
        config: source.config as object,
        forkedFromId: source.id,
      },
    });

    return NextResponse.json(
      { template: fork },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
