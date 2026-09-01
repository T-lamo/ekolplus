// PATCH /api/school/terms/[id] — edit an existing term's label/dates from
// the Année scolaire tab's per-term pencil-edit. Sibling of POST
// /api/school/terms (creation). See .planning/banani/school-settings-v2.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { hasMinRole } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z
  .object({
    label: z.string().trim().min(1).max(60).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    type: z.enum(['TRIMESTRE', 'SEMESTRE', 'LIBRE']).optional(),
    gradeEntryEnabled: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Empty update' });

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

    const perm = await requireSchoolPermission(auth.user.sub, 'parametres', 'edit', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;
    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const term = await prisma.term.findUnique({
      where: { id },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        academicYear: { select: { schoolId: true } },
      },
    });
    if (!term || term.academicYear.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const nextStart = parsed.data.startDate ?? term.startDate;
    const nextEnd = parsed.data.endDate ?? term.endDate;
    if (nextEnd <= nextStart) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'endDate must be after startDate' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const data = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
    const updated = await prisma.term.update({ where: { id }, data });

    return NextResponse.json({ term: updated }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
