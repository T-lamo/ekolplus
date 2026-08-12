// GET /api/school/bulletin-templates/[id] — full row (incl. config) + isOwn.
// PATCH — own templates only (404 on a global/other-school one, same
// "don't leak existence" convention as requireOrgRole). Setting
// `isActive: true` flips any other active row for the school back to false
// in the same transaction — "at most one active per school" is an
// app-level invariant, same pattern as AcademicYear.isActive.
// DELETE — own templates only; refuses deleting the active template.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { bulletinTemplateConfigSchema } from '@/lib/server/bulletin-templates';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PatchBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  config: bulletinTemplateConfigSchema.optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

    const { id } = await params;
    const tpl = await prisma.bulletinTemplate.findUnique({ where: { id } });
    if (!tpl || (tpl.schoolId !== null && tpl.schoolId !== mySchool.schoolId)) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Template not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      { ...tpl, isOwn: tpl.schoolId === mySchool.schoolId },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const tpl = await prisma.bulletinTemplate.findUnique({ where: { id } });
    if (!tpl || tpl.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Template not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { isActive, ...rest } = parsed.data;
    const data = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));

    const updated = await prisma.$transaction(async (tx) => {
      if (isActive === true) {
        await tx.bulletinTemplate.updateMany({
          where: { schoolId: mySchool.schoolId, isActive: true },
          data: { isActive: false },
        });
      }
      return tx.bulletinTemplate.update({
        where: { id },
        data: { ...data, ...(isActive !== undefined ? { isActive } : {}) },
      });
    });

    return NextResponse.json({ template: updated }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const tpl = await prisma.bulletinTemplate.findUnique({ where: { id } });
    if (!tpl || tpl.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Template not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (tpl.isActive) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Cannot delete the active template — activate another one first',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.bulletinTemplate.delete({ where: { id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
