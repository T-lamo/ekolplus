// POST /api/school/terms — "Nouvelle période" on the Année scolaire tab.
// Auto-creates the school's active AcademicYear on the very first call (a
// brand-new school like the one Create School produces has none yet) —
// see .planning/banani/school-settings.md. The AcademicYear's date span
// widens to cover every term added to it.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z
  .object({
    label: z.string().trim().min(1).max(60),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    type: z.enum(['TRIMESTRE', 'SEMESTRE', 'LIBRE']).optional(),
    gradeEntryEnabled: z.boolean().optional(),
  })
  .refine((d) => d.endDate > d.startDate, {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  });

function academicYearLabel(startDate: Date): string {
  const year = startDate.getUTCFullYear();
  // French school year convention: starts in Aug/Sep, spans into the next
  // calendar year.
  return startDate.getUTCMonth() >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
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
      'parametres',
      'create',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { label, startDate, endDate, type, gradeEntryEnabled } = parsed.data;

    const term = await prisma.$transaction(async (tx) => {
      let year = await tx.academicYear.findFirst({
        where: { schoolId: mySchool.schoolId, isActive: true },
      });

      if (!year) {
        year = await tx.academicYear.create({
          data: {
            schoolId: mySchool.schoolId,
            label: academicYearLabel(startDate),
            startDate,
            endDate,
            isActive: true,
          },
        });
      } else if (startDate < year.startDate || endDate > year.endDate) {
        year = await tx.academicYear.update({
          where: { id: year.id },
          data: {
            startDate: startDate < year.startDate ? startDate : year.startDate,
            endDate: endDate > year.endDate ? endDate : year.endDate,
          },
        });
      }

      const termCount = await tx.term.count({ where: { academicYearId: year.id } });

      return tx.term.create({
        data: {
          academicYearId: year.id,
          label,
          order: termCount + 1,
          startDate,
          endDate,
          ...(type !== undefined ? { type } : {}),
          ...(gradeEntryEnabled !== undefined ? { gradeEntryEnabled } : {}),
        },
      });
    });

    return NextResponse.json({ term }, { status: 201, headers: { 'x-request-id': ctx.requestId } });
  });
}
