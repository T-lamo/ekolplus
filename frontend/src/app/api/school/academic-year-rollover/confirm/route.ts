// Academic Year Rollover — atomic confirm.
//
// Finalizes the "nouvelle année" draft (sibling route, Task 4) into a real
// rollover: creates the new AcademicYear, archives the currently-active one,
// and promotes/maps students+classes per the draft's saved mapping — all
// inside a single `prisma.$transaction`, via `executeRollover`
// (`@/lib/server/academic-year-rollover`, Task 3) — plus the draft deletion
// and the AdminAction audit row, so a partial rollover never lands and every
// commit stays auditable (no side effects outside the transaction).
//
// OWNER-only, type-to-confirm gated (the school's exact current name,
// server-side re-checked), and rate-limited — same Zone dangereuse pattern
// as reset-year (frontend/src/app/api/school/reset-year/route.ts), including
// auditing via the shared AdminAction table from inside the transaction.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole, resolveActiveAcademicYear } from '@/lib/server/school';
import { confirmNameMatches, enforceDangerZoneRateLimit } from '@/lib/server/school-danger-zone';
import {
  executeRollover,
  getPromotionData,
  computeStats,
} from '@/lib/server/academic-year-rollover';
import { logAdminAction } from '@/lib/server/admin/audit';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import type {
  ClassMappingEntry,
  StudentExceptionEntry,
} from '@/app/(school)/settings/nouvelle-annee/types';

const Body = z.object({ confirmName: z.string().trim().min(1) });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceDangerZoneRateLimit(auth.user.sub, 'rollover-year');
    if (limited) return limited;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'OWNER')) {
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

    const draft = await prisma.academicYearRolloverDraft.findUnique({
      where: { schoolId: mySchool.schoolId },
    });
    if (!draft) {
      return NextResponse.json(
        { error: 'NO_DRAFT', message: 'Aucun brouillon de rentrée trouvé.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const activeYear = await resolveActiveAcademicYear(mySchool.schoolId);
    if (!activeYear) {
      return NextResponse.json(
        { error: 'NO_ACTIVE_YEAR', message: 'Aucune année scolaire active.' },
        { status: 424, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const classMapping = draft.classMapping as unknown as Record<string, ClassMappingEntry>;
    const studentExceptions = draft.studentExceptions as unknown as Record<
      string,
      StudentExceptionEntry
    >;

    // Real promoted/exceptions/unenrolled counts for the audit trail —
    // read-side, computed against the same pre-rollover enrollment snapshot
    // executeRollover itself will act on (see computeStats's own comment:
    // this must mirror executeRollover's class-creation guard exactly).
    const { students } = await getPromotionData(mySchool.schoolId, activeYear.id);
    const stats = computeStats(classMapping, studentExceptions, students);

    const result = await prisma.$transaction(async (tx) => {
      const rollover = await executeRollover(tx, mySchool.schoolId, activeYear.id, {
        newYearLabel: draft.newYearLabel,
        newYearStartDate: draft.newYearStartDate,
        newYearEndDate: draft.newYearEndDate,
        classMapping,
        studentExceptions,
      });

      // Draft deletion lives inside this same transaction — no side effects
      // outside the tx, so a failed rollover never orphans (or a succeeded
      // one never leaves behind) a stale draft.
      await tx.academicYearRolloverDraft.delete({ where: { schoolId: mySchool.schoolId } });

      await logAdminAction(tx, {
        actorId: auth.user.sub,
        action: 'school.rollover_year',
        targetType: 'School',
        targetId: mySchool.schoolId,
        metadata: {
          oldAcademicYearId: activeYear.id,
          newAcademicYearId: rollover.newAcademicYearId,
          newYearLabel: draft.newYearLabel,
          promotedCount: stats.promoted,
          exceptionsCount: stats.exceptions,
          unenrolledCount: stats.unenrolled,
        },
      });

      return rollover;
    });

    return NextResponse.json(
      { newAcademicYearId: result.newAcademicYearId },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
