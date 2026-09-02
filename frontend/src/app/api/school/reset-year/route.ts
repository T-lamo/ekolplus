// POST /api/school/reset-year — Zone dangereuse: wipe all grades,
// evaluations, goals, appreciations and attendance for the school's ACTIVE
// AcademicYear. Students/teachers/classes/subjects/the AcademicYear+Terms
// themselves are kept — matches the Banani copy verbatim ("Les élèves et
// enseignants seront conservés"). See .planning/banani/school-settings-v2.md
// "Zone dangereuse — safety design".
//
// OWNER-only (not just ADMIN — this is the most destructive scoped action
// short of deleting the school outright), server-side re-checked
// type-to-confirm (client Modal is UX, not the security boundary), strict
// per-user rate limit, single transaction, audited via the shared
// AdminAction table (not platform-staff-only despite the name — it's the
// only audit mechanism in this codebase).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { hasMinRole } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { confirmNameMatches, enforceDangerZoneRateLimit } from '@/lib/server/school-danger-zone';
import { logAdminAction } from '@/lib/server/admin/audit';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ confirmName: z.string().trim().min(1) });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceDangerZoneRateLimit(auth.user.sub, 'reset-year');
    if (limited) return limited;

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'parametres',
      'delete',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;
    if (!hasMinRole(mySchool.role, 'OWNER')) {
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

    const school = await prisma.school.findUniqueOrThrow({ where: { id: mySchool.schoolId } });
    if (!confirmNameMatches(school.name, parsed.data.confirmName)) {
      return NextResponse.json(
        { error: 'CONFIRM_NAME_MISMATCH', message: "Le nom saisi ne correspond pas à l'école." },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const activeYear = await prisma.academicYear.findFirst({
      where: { schoolId: mySchool.schoolId, isActive: true },
      include: { terms: { select: { id: true } } },
    });
    if (!activeYear) {
      return NextResponse.json(
        { error: 'NO_ACTIVE_YEAR', message: 'Aucune année scolaire active à réinitialiser.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const termIds = activeYear.terms.map((t) => t.id);

    const result = await prisma.$transaction(async (tx) => {
      const [evaluations, goals, appreciations, attendance] = await Promise.all([
        tx.evaluation.deleteMany({ where: { termId: { in: termIds } } }),
        tx.goal.deleteMany({ where: { termId: { in: termIds } } }),
        tx.appreciation.deleteMany({ where: { termId: { in: termIds } } }),
        tx.attendance.deleteMany({
          where: {
            student: { schoolId: mySchool.schoolId },
            date: { gte: activeYear.startDate, lte: activeYear.endDate },
          },
        }),
      ]);

      await logAdminAction(tx, {
        actorId: auth.user.sub,
        action: 'school.reset_year',
        targetType: 'School',
        targetId: mySchool.schoolId,
        metadata: {
          academicYearId: activeYear.id,
          academicYearLabel: activeYear.label,
          evaluationsDeleted: evaluations.count,
          goalsDeleted: goals.count,
          appreciationsDeleted: appreciations.count,
          attendanceDeleted: attendance.count,
        },
      });

      return { evaluations, goals, appreciations, attendance };
    });

    return NextResponse.json(
      {
        ok: true,
        deleted: {
          evaluations: result.evaluations.count,
          goals: result.goals.count,
          appreciations: result.appreciations.count,
          attendance: result.attendance.count,
        },
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
