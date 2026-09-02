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
import { hasMinRole, resolveActiveAcademicYear } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { confirmNameMatches, enforceDangerZoneRateLimit } from '@/lib/server/school-danger-zone';
import {
  executeRollover,
  getPromotionData,
  computeStats,
  validateMappingOwnership,
} from '@/lib/server/academic-year-rollover';
import { logAdminAction } from '@/lib/server/admin/audit';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  findDemotions,
  findExceptionDemotions,
  formatDemotions,
  isDecided,
} from '@/app/(school)/settings/nouvelle-annee/promotion-rules';
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

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'parametres',
      'create',
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

    // Defense in depth: the draft PATCH route already rejects cross-tenant
    // destClassId/homeroomTeacherId references at autosave time, but a
    // draft could theoretically have been written before that validation
    // existed (or the check could have a gap) — re-check here, before any
    // writes, since this is the last gate before an irreversible commit.
    const mappingOwnershipOk = await validateMappingOwnership(
      prisma,
      mySchool.schoolId,
      classMapping,
      studentExceptions,
    );
    if (!mappingOwnershipOk) {
      return NextResponse.json(
        {
          error: 'INVALID_MAPPING',
          message: 'Le brouillon contient une référence de classe ou de professeur invalide.',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Stale-mapping guard (TOCTOU): Step 2's client-side validation only
    // sees the classes that existed when the draft was loaded/saved. If a
    // class was created in the active year afterwards (another admin, or
    // the same user in another tab), it has no mapping entry — without this
    // check its students would be silently dropped with no error, while the
    // UI showed a promoted count that never accounted for them.
    const currentClasses = await prisma.class.findMany({
      where: { schoolId: mySchool.schoolId, academicYearId: activeYear.id },
      select: { id: true, name: true, level: true },
    });
    // "Decided" = destination OR explicit « Fin de cursus » (unenroll) —
    // shared rule with Step 2 (promotion-rules.ts).
    if (currentClasses.some((c) => !isDecided(classMapping[c.id]))) {
      return NextResponse.json(
        {
          error: 'MAPPING_STALE',
          message:
            "Une classe a été ajoutée depuis la dernière sauvegarde du brouillon. Merci de revenir à l'étape 2 pour la mapper.",
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Stale-destination guard: every destClassId (class mapping or
    // per-student decision) is a TEMPLATE that must be one of the active
    // year's classes — `executeRollover` resolves an unknown template to
    // "no destination" and would silently NOT re-enroll those students.
    // Refuse instead and point at the step where it can be fixed.
    const currentClassIds = new Set(currentClasses.map((c) => c.id));
    const staleMapping = Object.values(classMapping).some(
      (m) => m?.destClassId && !currentClassIds.has(m.destClassId),
    );
    if (staleMapping) {
      return NextResponse.json(
        {
          error: 'MAPPING_STALE',
          message:
            "Une classe de destination n'existe plus dans l'année en cours. Merci de revenir à l'étape 2 pour la remplacer.",
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const staleDecisions = Object.values(studentExceptions).some(
      (e) => e?.destClassId && !e.skip && !currentClassIds.has(e.destClassId),
    );
    if (staleDecisions) {
      return NextResponse.json(
        {
          error: 'MAPPING_STALE',
          message:
            "La classe de destination d'un élève n'existe plus dans l'année en cours. Merci de revenir à l'étape 3 pour revoir sa décision.",
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // No-demotion rule (defense in depth — PATCH already enforces it, but
    // the catalog or the classes may have changed since the draft was saved).
    const gradeLevels = await prisma.gradeLevel.findMany({
      where: { schoolId: mySchool.schoolId },
      orderBy: { order: 'asc' },
      select: { name: true, order: true },
    });
    if (gradeLevels.length > 0) {
      const demotions = findDemotions(classMapping, currentClasses, gradeLevels);
      if (demotions.length > 0) {
        return NextResponse.json(
          { error: 'DEMOTION_NOT_ALLOWED', message: formatDemotions(demotions), demotions },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      const exceptionIds = Object.keys(studentExceptions);
      if (exceptionIds.length > 0) {
        const enrollments = await prisma.enrollment.findMany({
          where: { academicYearId: activeYear.id, studentId: { in: exceptionIds } },
          select: { studentId: true, classId: true },
        });
        const bad = findExceptionDemotions(
          studentExceptions,
          enrollments.map((e) => ({ id: e.studentId, classId: e.classId })),
          currentClasses,
          gradeLevels,
        );
        if (bad.length > 0) {
          return NextResponse.json(
            {
              error: 'DEMOTION_NOT_ALLOWED',
              message: `Rétrogradation impossible pour ${bad.length} élève(s) : la classe de destination doit être d'un niveau égal ou supérieur.`,
              exceptions: bad,
            },
            { status: 400, headers: { 'x-request-id': ctx.requestId } },
          );
        }
      }
    }

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

      // Real promoted/exceptions/unenrolled counts for the audit trail —
      // computed INSIDE this same transaction (via `tx`, not the top-level
      // `prisma`) so the audited numbers reflect the exact snapshot that
      // commits, not a pre-tx read that could theoretically disagree with
      // it. See computeStats's own comment: this must mirror
      // executeRollover's class-creation guard exactly.
      const { students } = await getPromotionData(mySchool.schoolId, activeYear.id, tx);
      const stats = computeStats(classMapping, studentExceptions, students);

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
