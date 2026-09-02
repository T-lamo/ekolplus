// PATCH /api/school/grade-levels/[id] — rename a level (409 LEVEL_NAME_TAKEN
// on collision with another level of the same school).
// DELETE — hard delete. There is no FK from Class to GradeLevel (by design),
// so this can never orphan a class row; classes at that free-text level just
// stop getting an auto-suggestion in the rollover wizard.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import type { PermissionAction } from '@/lib/permissions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { LevelNameBody } from '../route';

type Ctx = { params: Promise<{ id: string }> };

/** Shared guard chain for both mutating verbs: CSRF → auth → configuration
 * grant → owned level. Returns either the level row + school, or the
 * NextResponse to bail with. */
async function guard(
  req: NextRequest,
  params: Ctx['params'],
  requestId: string,
  action: PermissionAction,
) {
  const csrfFail = verifyCsrf(req);
  if (csrfFail) return csrfFail;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const perm = await requireSchoolPermission(auth.user.sub, 'configuration', action, requestId);
  if (!perm.ok) return perm.response;
  const mySchool = perm.mySchool;

  const { id } = await params;
  const level = await prisma.gradeLevel.findUnique({ where: { id } });
  if (!level || level.schoolId !== mySchool.schoolId) {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: 'Grade level not found' },
      { status: 404, headers: { 'x-request-id': requestId } },
    );
  }
  return { level, schoolId: mySchool.schoolId };
}

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const g = await guard(req, params, ctx.requestId, 'edit');
    if (g instanceof NextResponse) return g;

    const parsed = LevelNameBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const name = parsed.data.name;

    const clash = await prisma.gradeLevel.findFirst({
      where: { schoolId: g.schoolId, name, NOT: { id: g.level.id } },
      select: { id: true },
    });
    if (clash) {
      return NextResponse.json(
        { error: 'LEVEL_NAME_TAKEN', message: `Le niveau « ${name} » existe déjà.` },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const updated = await prisma.gradeLevel.update({
      where: { id: g.level.id },
      data: { name },
    });
    return NextResponse.json(
      { level: { id: updated.id, name: updated.name, order: updated.order } },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const g = await guard(req, params, ctx.requestId, 'delete');
    if (g instanceof NextResponse) return g;

    await prisma.gradeLevel.delete({ where: { id: g.level.id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
