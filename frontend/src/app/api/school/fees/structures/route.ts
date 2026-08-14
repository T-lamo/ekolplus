// GET /api/school/fees/structures — Payment Configuration's left panel: every
// class in the school's active AcademicYear, its enrollment count, whether
// it already has a FeeStructure ("Configuré"/"En attente"), and its tranche
// count.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, resolveActiveAcademicYear } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

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

    const year = await resolveActiveAcademicYear(mySchool.schoolId);
    if (!year) {
      return NextResponse.json(
        { classes: [], configuredCount: 0, totalCount: 0, academicYearLabel: null },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const classes = await prisma.class.findMany({
      where: { schoolId: mySchool.schoolId, academicYearId: year.id },
      include: {
        _count: { select: { enrollments: true } },
        feeStructure: { include: { _count: { select: { tranches: true } } } },
      },
      orderBy: { name: 'asc' },
    });

    const rows = classes.map((c) => ({
      id: c.id,
      name: c.name,
      level: c.level,
      studentCount: c._count.enrollments,
      configured: c.feeStructure != null,
      trancheCount: c.feeStructure?._count.tranches ?? 0,
    }));

    return NextResponse.json(
      {
        classes: rows,
        configuredCount: rows.filter((r) => r.configured).length,
        totalCount: rows.length,
        academicYearLabel: year.label,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
