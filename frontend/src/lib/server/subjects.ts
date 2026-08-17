// Subject profile — shared by the subjects routes (add-matiere.md /
// programme-annuel.md / affectations-classes.md).
//
// `status` is the single source of truth ("Statut de publication" on the
// form); `isActive` is derived from it on every write so the dashboard count
// and the older list filters keep working without a second concept.
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';

export const SUBJECT_STATUSES = ['ACTIVE', 'DRAFT', 'ARCHIVED'] as const;
export type SubjectStatus = (typeof SUBJECT_STATUSES)[number];
export const SUBJECT_KINDS = ['REQUIRED', 'ELECTIVE', 'OPTIONAL'] as const;

export function isActiveFromStatus(status: SubjectStatus): boolean {
  return status !== 'ARCHIVED';
}

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalInt = (min: number, max: number) =>
  z.number().int().min(min).max(max).nullable().optional();

// Every profile field is optional so the same schema serves POST (name
// required on top) and PATCH (partial). Cross-field rules (passing ≤ max,
// eliminatory ≤ max) are checked in `validateScoreBounds` against the merged
// row, since a PATCH may send only one side.
export const SubjectProfileBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  code: optionalText(30),
  domain: optionalText(60),
  abbreviation: optionalText(12),
  level: optionalText(60),
  kind: z.enum(SUBJECT_KINDS).optional(),
  description: optionalText(2000),
  defaultCoefficient: optionalInt(1, 10),
  maxScore: z.number().int().min(1).max(100).optional(),
  passingScore: z.number().int().min(0).max(100).optional(),
  totalHours: optionalInt(0, 2000),
  hoursCM: optionalInt(0, 2000),
  hoursTD: optionalInt(0, 2000),
  hoursTP: optionalInt(0, 2000),
  evaluationType: optionalText(60),
  maxCapacity: optionalInt(1, 500),
  includeInAverage: z.boolean().optional(),
  showOnBulletin: z.boolean().optional(),
  room: optionalText(80),
  eliminatoryScore: optionalInt(0, 100),
  icon: optionalText(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  responsibleTeacherId: z.string().min(1).nullable().optional(),
  status: z.enum(SUBJECT_STATUSES).optional(),
  prerequisiteIds: z.array(z.string().min(1)).max(20).optional(),
});
export type SubjectProfileInput = z.infer<typeof SubjectProfileBody>;

export function validateScoreBounds(row: {
  maxScore: number;
  passingScore: number;
  eliminatoryScore: number | null;
}): string | null {
  if (row.passingScore > row.maxScore) return 'passingScore must be ≤ maxScore';
  if (row.eliminatoryScore !== null && row.eliminatoryScore > row.maxScore) {
    return 'eliminatoryScore must be ≤ maxScore';
  }
  return null;
}

/** Splits the validated body into scalar Prisma data + relation ids. */
export function splitSubjectInput(input: SubjectProfileInput) {
  const { prerequisiteIds, status, ...scalars } = input;
  const data: Record<string, unknown> = Object.fromEntries(
    Object.entries(scalars).filter(([, v]) => v !== undefined),
  );
  if (status !== undefined) {
    data.status = status;
    data.isActive = isActiveFromStatus(status);
  }
  return { data, prerequisiteIds };
}

/**
 * Cross-tenant guard for the relation ids a subject body may carry — the
 * responsible teacher and the prerequisite subjects must belong to the same
 * school (and a subject can't require itself).
 */
export async function assertSubjectRelationsOwned(
  schoolId: string,
  input: Pick<SubjectProfileInput, 'responsibleTeacherId' | 'prerequisiteIds'>,
  selfId: string | null,
): Promise<string | null> {
  if (input.responsibleTeacherId) {
    const teacher = await prisma.teacher.findUnique({
      where: { id: input.responsibleTeacherId },
      select: { schoolId: true },
    });
    if (!teacher || teacher.schoolId !== schoolId) return 'Invalid responsibleTeacherId';
  }
  if (input.prerequisiteIds && input.prerequisiteIds.length > 0) {
    if (selfId && input.prerequisiteIds.includes(selfId)) {
      return 'A subject cannot be its own prerequisite';
    }
    const owned = await prisma.subject.count({
      where: { id: { in: input.prerequisiteIds }, schoolId },
    });
    if (owned !== new Set(input.prerequisiteIds).size) return 'Invalid prerequisiteIds';
  }
  return null;
}

// Selection shared by every subject read so list/detail/PATCH responses
// carry the same profile shape.
export const SUBJECT_PROFILE_SELECT = {
  id: true,
  name: true,
  code: true,
  domain: true,
  isActive: true,
  status: true,
  abbreviation: true,
  level: true,
  kind: true,
  description: true,
  defaultCoefficient: true,
  maxScore: true,
  passingScore: true,
  totalHours: true,
  hoursCM: true,
  hoursTD: true,
  hoursTP: true,
  evaluationType: true,
  maxCapacity: true,
  includeInAverage: true,
  showOnBulletin: true,
  room: true,
  eliminatoryScore: true,
  icon: true,
  color: true,
  responsibleTeacherId: true,
  createdAt: true,
  updatedAt: true,
} as const;

// A teacher is "Chargé" once their real weekly load reaches their contractual
// target — or the conventional 18 h full-time load when no target is set.
export const DEFAULT_TEACHER_WEEKLY_HOURS = 18;

/**
 * Full "fiche matière" payload — one round trip hydrates the header, the
 * Informations form, the Affectations tab and the right-column summaries.
 * Returns null when the subject isn't in the caller's school.
 */
export async function getSubjectDetail(schoolId: string, subjectId: string) {
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, schoolId },
    select: {
      ...SUBJECT_PROFILE_SELECT,
      responsibleTeacher: { select: { id: true, name: true, photoUrl: true } },
      prerequisites: { select: { id: true, name: true, code: true } },
      _count: { select: { chapters: true } },
    },
  });
  if (!subject) return null;

  const activeYear = await prisma.academicYear.findFirst({
    where: { schoolId, isActive: true },
    orderBy: { startDate: 'desc' },
    select: { id: true, label: true },
  });

  const [classes, classSubjects] = await Promise.all([
    prisma.class.findMany({
      where: activeYear ? { schoolId, academicYearId: activeYear.id } : { schoolId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        level: true,
        homeroomTeacherId: true,
        _count: { select: { enrollments: true } },
      },
    }),
    prisma.classSubject.findMany({
      where: { subjectId, class: { schoolId } },
      orderBy: { class: { name: 'asc' } },
      select: {
        id: true,
        classId: true,
        teacherId: true,
        coefficient: true,
        weeklyHours: true,
        class: {
          select: {
            id: true,
            name: true,
            level: true,
            homeroomTeacherId: true,
            _count: { select: { enrollments: true } },
          },
        },
        teacher: {
          select: {
            id: true,
            name: true,
            photoUrl: true,
            weeklyHoursTarget: true,
            classSubjects: { select: { weeklyHours: true } },
          },
        },
      },
    }),
  ]);

  const assignedClassIds = new Set(classSubjects.map((cs) => cs.classId));
  const teachers = new Map<
    string,
    {
      id: string;
      name: string;
      photoUrl: string | null;
      classCount: number;
      weeklyHoursTotal: number;
      weeklyHoursTarget: number | null;
      status: 'AVAILABLE' | 'BUSY';
    }
  >();
  for (const cs of classSubjects) {
    if (!cs.teacher) continue;
    const existing = teachers.get(cs.teacher.id);
    if (existing) {
      existing.classCount += 1;
      continue;
    }
    const weeklyHoursTotal = cs.teacher.classSubjects.reduce(
      (sum, row) => sum + (row.weeklyHours ?? 0),
      0,
    );
    const target = cs.teacher.weeklyHoursTarget ?? DEFAULT_TEACHER_WEEKLY_HOURS;
    teachers.set(cs.teacher.id, {
      id: cs.teacher.id,
      name: cs.teacher.name,
      photoUrl: cs.teacher.photoUrl,
      classCount: 1,
      weeklyHoursTotal,
      weeklyHoursTarget: cs.teacher.weeklyHoursTarget,
      status: weeklyHoursTotal >= target ? 'BUSY' : 'AVAILABLE',
    });
  }

  const { _count, responsibleTeacher, prerequisites, ...profile } = subject;
  return {
    ...profile,
    responsibleTeacher,
    prerequisites,
    prerequisiteIds: prerequisites.map((p) => p.id),
    chapterCount: _count.chapters,
    activeYear,
    classSubjects: classSubjects.map((cs) => ({
      id: cs.id,
      classId: cs.classId,
      teacherId: cs.teacherId,
      coefficient: cs.coefficient,
      weeklyHours: cs.weeklyHours,
      class: {
        id: cs.class.id,
        name: cs.class.name,
        level: cs.class.level,
        studentCount: cs.class._count.enrollments,
        isHomeroomTeacher: !!cs.teacherId && cs.class.homeroomTeacherId === cs.teacherId,
      },
      teacher: cs.teacher
        ? { id: cs.teacher.id, name: cs.teacher.name, photoUrl: cs.teacher.photoUrl }
        : null,
    })),
    unassignedClasses: classes
      .filter((c) => !assignedClassIds.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, level: c.level, studentCount: c._count.enrollments })),
    teachers: [...teachers.values()],
  };
}

export type SubjectDetail = NonNullable<Awaited<ReturnType<typeof getSubjectDetail>>>;
