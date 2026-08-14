// Academic Year Rollover — pure backend helper functions.
//
// Backs the 3-step "nouvelle année" wizard: create the new AcademicYear, map
// old classes to destination classes (existing or newly-created), promote
// enrolled students (or mark them exceptions/unenrolled), archive the old
// year — all atomically via `executeRollover`'s caller-supplied transaction.
//
// `getPromotionData` / `computeStats` are read-side helpers consumed by the
// wizard's step-2/step-3 preview; `executeRollover` performs the actual
// commit and MUST run inside a `prisma.$transaction(async (tx) => ...)`
// block (see frontend/src/app/api/school/reset-year/route.ts for this
// codebase's reference OWNER-only atomic-transaction pattern) so a partial
// rollover never lands.
import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import type {
  ClassMappingEntry,
  StudentExceptionEntry,
  ClassForPromotion,
  StudentForPromotion,
} from '@/app/(school)/settings/nouvelle-annee/types';

export async function getPromotionData(
  schoolId: string,
  academicYearId: string,
  // Defaults to the top-level singleton so existing read-side callers (the
  // draft GET route) are unaffected; the confirm route passes its `tx` so
  // the audit-log stats it feeds are computed from the same transactional
  // snapshot that actually commits (see confirm/route.ts's implementer note).
  client: Prisma.TransactionClient | PrismaClient = prisma,
): Promise<{ classes: ClassForPromotion[]; students: StudentForPromotion[] }> {
  const classes = await client.class.findMany({
    where: { schoolId, academicYearId },
    select: {
      id: true,
      name: true,
      level: true,
      enrollments: { select: { id: true } },
    },
    orderBy: { name: 'asc' },
  });

  const enrollments = await client.enrollment.findMany({
    where: { academicYearId },
    select: {
      id: true,
      studentId: true,
      classId: true,
      enrolledAt: true,
      student: { select: { firstName: true, lastName: true } },
    },
  });

  return {
    classes: classes.map((c) => ({
      id: c.id,
      name: c.name,
      level: c.level,
      studentCount: c.enrollments.length,
    })),
    students: enrollments.map((e) => ({
      id: e.studentId,
      firstName: e.student.firstName,
      lastName: e.student.lastName,
      classId: e.classId,
      enrolledAt: e.enrolledAt,
    })),
  };
}

export function computeStats(
  classMapping: Record<string, ClassMappingEntry>,
  studentExceptions: Record<string, StudentExceptionEntry>,
  allStudents: StudentForPromotion[],
): { promoted: number; exceptions: number; unenrolled: number } {
  let promoted = 0;
  let exceptions = 0;
  let unenrolled = 0;

  for (const student of allStudents) {
    const exception = studentExceptions[student.id];
    if (exception?.skip) {
      unenrolled++;
    } else if (exception?.destClassId) {
      exceptions++;
    } else {
      // Fall back to the class-level mapping for the student's current class.
      // Mirrors executeRollover's actual class-creation guard below: an
      // `isNew: true` mapping only produces a real destination class (and
      // therefore a real enrollment) when `newClass` is also present — so
      // the promoted/unenrolled split here MUST match that condition
      // exactly, or the preview stats lie about what executeRollover does.
      const mapping = classMapping[student.classId];
      if (mapping?.destClassId || (mapping?.isNew && mapping?.newClass)) {
        promoted++;
      } else {
        unenrolled++;
      }
    }
  }

  return { promoted, exceptions, unenrolled };
}

/**
 * Cross-tenant ownership guard for the rollover mapping's foreign
 * references (`destClassId` on a classMapping/studentExceptions entry,
 * `newClass.homeroomTeacherId` on a classMapping entry). Both the draft
 * PATCH route (reject at autosave time, before persisting) and the confirm
 * route (defense in depth, right before the irreversible commit) call this
 * with the same two args so an id belonging to another school can never be
 * dereferenced into a real Enrollment/Class row. Mirrors the classId /
 * homeroomTeacherId ownership checks in
 * frontend/src/app/api/school/students/route.ts and
 * frontend/src/app/api/school/classes/route.ts.
 */
export async function validateMappingOwnership(
  client: Pick<PrismaClient, 'class' | 'teacher'>,
  schoolId: string,
  classMapping: Record<string, ClassMappingEntry> | undefined,
  studentExceptions: Record<string, StudentExceptionEntry> | undefined,
): Promise<boolean> {
  const destClassIds = new Set<string>();
  const homeroomTeacherIds = new Set<string>();

  for (const entry of Object.values(classMapping ?? {})) {
    if (entry.destClassId) destClassIds.add(entry.destClassId);
    if (entry.newClass?.homeroomTeacherId) {
      homeroomTeacherIds.add(entry.newClass.homeroomTeacherId);
    }
  }
  for (const entry of Object.values(studentExceptions ?? {})) {
    if (entry.destClassId) destClassIds.add(entry.destClassId);
  }

  // Skip the query entirely when there's nothing to check — the common case.
  if (destClassIds.size > 0) {
    const count = await client.class.count({
      where: { id: { in: [...destClassIds] }, schoolId },
    });
    if (count !== destClassIds.size) return false;
  }

  if (homeroomTeacherIds.size > 0) {
    const count = await client.teacher.count({
      where: { id: { in: [...homeroomTeacherIds] }, schoolId },
    });
    if (count !== homeroomTeacherIds.size) return false;
  }

  return true;
}

export async function executeRollover(
  tx: Prisma.TransactionClient,
  schoolId: string,
  oldAcademicYearId: string,
  rolloverData: {
    newYearLabel: string;
    newYearStartDate: Date;
    newYearEndDate: Date;
    classMapping: Record<string, ClassMappingEntry>;
    studentExceptions: Record<string, StudentExceptionEntry>;
  },
): Promise<{ newAcademicYearId: string }> {
  // 1. Create the new AcademicYear (active).
  const newYear = await tx.academicYear.create({
    data: {
      schoolId,
      label: rolloverData.newYearLabel,
      startDate: rolloverData.newYearStartDate,
      endDate: rolloverData.newYearEndDate,
      isActive: true,
    },
  });

  // 2. Archive the old year.
  await tx.academicYear.update({
    where: { id: oldAcademicYearId },
    data: { isActive: false },
  });

  // 3. Fetch all old classes + enrollments.
  const oldClasses = await tx.class.findMany({
    where: { academicYearId: oldAcademicYearId },
    select: {
      id: true,
      name: true,
      level: true,
      room: true,
      capacity: true,
      homeroomTeacherId: true,
    },
  });

  const oldEnrollments = await tx.enrollment.findMany({
    where: { academicYearId: oldAcademicYearId },
    select: { studentId: true, classId: true },
  });

  // 4. Create/reuse destination classes per the mapping (oldClassId -> newClassId).
  const newClassMap = new Map<string, string>();
  // Dedup "Créer nouvelle" classes by name within this execution. Two old
  // classes can legitimately map to the same new-class name (merging two
  // classes into one — the only way to express a merge in v1, since
  // `allClasses=[]` means there's no existing-class picker yet). Without
  // this, the second `tx.class.create` would hit the
  // `@@unique([academicYearId, name])` constraint and roll back the whole
  // transaction with an unhandled 500.
  const createdClassIdByName = new Map<string, string>();

  for (const oldClass of oldClasses) {
    const mapping = rolloverData.classMapping[oldClass.id];
    if (!mapping) continue;

    if (mapping.destClassId) {
      // Reuse an existing class.
      newClassMap.set(oldClass.id, mapping.destClassId);
    } else if (mapping.isNew && mapping.newClass) {
      const alreadyCreatedId = createdClassIdByName.get(mapping.newClass.name);
      if (alreadyCreatedId) {
        // Same name already created earlier in this loop — reuse it instead
        // of creating a duplicate.
        newClassMap.set(oldClass.id, alreadyCreatedId);
      } else {
        // Create a brand-new class in the new year.
        const newClass = await tx.class.create({
          data: {
            schoolId,
            academicYearId: newYear.id,
            name: mapping.newClass.name,
            level: mapping.newClass.level,
            room: mapping.newClass.room ?? null,
            capacity: mapping.newClass.capacity ?? null,
            homeroomTeacherId: mapping.newClass.homeroomTeacherId ?? null,
          },
        });
        createdClassIdByName.set(mapping.newClass.name, newClass.id);
        newClassMap.set(oldClass.id, newClass.id);
      }
    }
  }

  // 5. Create new-year enrollments (student exception > class mapping > unenrolled).
  for (const oldEnroll of oldEnrollments) {
    const exception = rolloverData.studentExceptions[oldEnroll.studentId];
    if (exception?.skip) {
      // Student is deliberately not carried into the new year.
      continue;
    }

    const destClassId = exception?.destClassId ?? newClassMap.get(oldEnroll.classId);

    if (destClassId) {
      await tx.enrollment.create({
        data: {
          studentId: oldEnroll.studentId,
          classId: destClassId,
          academicYearId: newYear.id,
          enrolledAt: new Date(),
        },
      });
    }
    // No destClassId resolved (no exception override, no/incomplete class
    // mapping) => student is simply not re-enrolled (unenrolled outcome).
  }

  return { newAcademicYearId: newYear.id };
}
