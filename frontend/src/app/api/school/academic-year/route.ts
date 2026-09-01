// PATCH /api/school/academic-year — edit the active AcademicYear's grading
// scale ("Système de notation") from the Année scolaire tab. Free text
// (School.gradingScale has no catalog yet, per schema.prisma). See
// .planning/banani/school-settings-v2.md.
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

const Body = z.object({
  gradingScale: z.string().trim().min(1).max(60).nullable(),
});

export async function PATCH(req: NextRequest): Promise<NextResponse> {
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

    const activeYear = await prisma.academicYear.findFirst({
      where: { schoolId: mySchool.schoolId, isActive: true },
    });
    if (!activeYear) {
      return NextResponse.json(
        { error: 'NO_ACTIVE_YEAR', message: 'Aucune année scolaire active.' },
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

    const academicYear = await prisma.academicYear.update({
      where: { id: activeYear.id },
      data: { gradingScale: parsed.data.gradingScale },
    });

    return NextResponse.json({ academicYear }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
