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

  // 4. Resolve destination classes in the NEW year (oldClassId -> newClassId).
  //
  // A `destClassId` is a class of the OLD (current) year chosen as a
  // TEMPLATE — "6ème A → 5ème A" means "create 5ème A in the new year,
  // cloned from this year's 5ème A (name/level/room/capacity/homeroom
  // teacher), and enroll 6ème A's students there". Classes are per-year
  // rows, so the new year's classes don't exist before this commit; the
  // clone is what makes the destination real. Mapping a class onto itself is
  // a collective repeat year. A `destClassId` that isn't one of the old
  // year's classes (cross-year/stale) resolves to nothing → not enrolled.
  //
  // Clones are deduped by name (`createdClassIdByName`): two old classes
  // pointing at the same template share one clone, and a template clone and
  // a legacy `isNew` entry with the same name land on the same class — the
  // second `tx.class.create` would otherwise hit
  // `@@unique([academicYearId, name])` and roll back the transaction.
  const oldClassById = new Map(oldClasses.map((c) => [c.id, c]));
  const createdClassIdByName = new Map<string, string>();

  async function ensureNewClass(spec: {
    name: string;
    level: string;
    room: string | null;
    capacity: number | null;
    homeroomTeacherId: string | null;
  }): Promise<string> {
    const existing = createdClassIdByName.get(spec.name);
    if (existing) return existing;
    const created = await tx.class.create({
      data: {
        schoolId,
        academicYearId: newYear.id,
        name: spec.name,
        level: spec.level,
        room: spec.room,
        capacity: spec.capacity,
        homeroomTeacherId: spec.homeroomTeacherId,
      },
    });
    createdClassIdByName.set(spec.name, created.id);
    return created.id;
  }

  /** Template (old-year class id) → its new-year clone id, or null when the
   * id isn't an old-year class. Memoised through `createdClassIdByName`. */
  async function resolveTemplate(templateId: string): Promise<string | null> {
    const template = oldClassById.get(templateId);
    if (!template) return null;
    return ensureNewClass(template);
  }

  const newClassMap = new Map<string, string>();
  for (const oldClass of oldClasses) {
    const mapping = rolloverData.classMapping[oldClass.id];
    if (!mapping) continue;

    if (mapping.destClassId) {
      const cloneId = await resolveTemplate(mapping.destClassId);
      if (cloneId) newClassMap.set(oldClass.id, cloneId);
    } else if (mapping.isNew && mapping.newClass) {
      // Legacy "Créer nouvelle" entry (drafts saved before the destination
      // picker) — still honoured server-side.
      const cloneId = await ensureNewClass({
        name: mapping.newClass.name,
        level: mapping.newClass.level,
        room: mapping.newClass.room ?? null,
        capacity: mapping.newClass.capacity ?? null,
        homeroomTeacherId: mapping.newClass.homeroomTeacherId ?? null,
      });
      newClassMap.set(oldClass.id, cloneId);
    }
  }

  // 5. Create new-year enrollments (student exception > class mapping > unenrolled).
  for (const oldEnroll of oldEnrollments) {
    const exception = rolloverData.studentExceptions[oldEnroll.studentId];
    if (exception?.skip) {
      // Student is deliberately not carried into the new year.
      continue;
    }

    // An exception's destClassId is a template too (same picker semantics).
    const destClassId = exception?.destClassId
      ? await resolveTemplate(exception.destClassId)
      : newClassMap.get(oldEnroll.classId);

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
