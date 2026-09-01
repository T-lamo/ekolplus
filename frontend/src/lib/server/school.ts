// "My school" resolution — used by /api/school/* routes, which act on the
// caller's own school rather than an :id in the URL (unlike requireOrgRole,
// which needs an explicit organizationId). V1 picks the first
// OrganizationMember row by createdAt — a person staffing more than one
// school has no switcher yet (documented limitation, school-settings.md).
//
// Deny-by-default lockdown (2026-08-30, Espace Enseignant Phase 1; extended
// 2026-08-30, Espace Élève Phase 1): resolveMySchool() rejects MEMBER-role
// accounts linked to a portal-only entity (Teacher or Student) so every
// existing /api/school/* route is locked down for free, with zero edits to
// those ~65 files. Routes that must stay reachable by teachers call
// resolveMySchoolIncludingTeacher() instead, and layer their own
// per-classSubject/per-class check via resolveMyTeacherProfile() — see
// docs/superpowers/specs/2026-08-30-espace-enseignant-design.md. Depuis
// multi-espaces (2026-09-01), un MEMBER lié enseignant dont l'union des
// grants de rôles staff est non vide est débloqué (double profil) ; un lien
// élève reste toujours verrouillé.
import 'server-only';
import { prisma } from './prisma';
import { ORG_ROLE_RANK, type OrgRole } from './middleware/require-org-role';
import { sanitizeGrants } from '@/lib/permissions';

export interface MySchool {
  organizationId: string;
  schoolId: string;
  role: OrgRole;
}

async function findMembership(userId: string) {
  return prisma.organizationMember.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      organizationId: true,
      role: true,
      staffRoles: { select: { grants: true } },
      organization: { select: { school: { select: { id: true } } } },
    },
  });
}

// Verrou portail (multi-espaces 2026-09-01), pur et testable :
// - lien Student → toujours verrouillé (aucun rôle staff ne débloque un élève)
// - lien Teacher seul → verrouillé sauf si l'union des grants des rôles
//   staff du membre est non vide (« double profil » : le RBAC route par
//   route fait ensuite toute l'autorisation, rien de plus n'est ouvert ici)
// - pas de lien portail → jamais verrouillé (comportement historique)
export function isPortalLocked(input: {
  teacherLinked: boolean;
  studentLinked: boolean;
  staffGrantUnion: readonly string[];
}): boolean {
  if (input.studentLinked) return true;
  if (input.teacherLinked) return input.staffGrantUnion.length === 0;
  return false;
}

export async function resolveMySchool(userId: string): Promise<MySchool | null> {
  const membership = await findMembership(userId);
  if (!membership || !membership.organization.school) return null;
  const schoolId = membership.organization.school.id;
  if (membership.role === 'MEMBER') {
    const [teacher, student] = await Promise.all([
      prisma.teacher.findFirst({ where: { userId, schoolId }, select: { id: true } }),
      prisma.student.findFirst({ where: { userId, schoolId }, select: { id: true } }),
    ]);
    const locked = isPortalLocked({
      teacherLinked: teacher !== null,
      studentLinked: student !== null,
      staffGrantUnion: sanitizeGrants(membership.staffRoles.flatMap((r) => r.grants)),
    });
    if (locked) return null;
  }
  return { organizationId: membership.organizationId, schoolId, role: membership.role as OrgRole };
}

/** Same as resolveMySchool, but never rejects a teacher-linked account. */
export async function resolveMySchoolIncludingTeacher(userId: string): Promise<MySchool | null> {
  const membership = await findMembership(userId);
  if (!membership || !membership.organization.school) return null;
  return {
    organizationId: membership.organizationId,
    schoolId: membership.organization.school.id,
    role: membership.role as OrgRole,
  };
}

export interface MyTeacherProfile {
  teacherId: string;
  classSubjectIds: string[];
  homeroomClassIds: string[];
}

export async function resolveMyTeacherProfile(
  userId: string,
  schoolId: string,
): Promise<MyTeacherProfile | null> {
  const teacher = await prisma.teacher.findFirst({
    where: { userId, schoolId },
    select: {
      id: true,
      classSubjects: { select: { id: true } },
      homeroomClasses: { select: { id: true } },
    },
  });
  if (!teacher) return null;
  return {
    teacherId: teacher.id,
    classSubjectIds: teacher.classSubjects.map((cs) => cs.id),
    homeroomClassIds: teacher.homeroomClasses.map((c) => c.id),
  };
}

export interface MyStudentProfile {
  studentId: string;
  schoolId: string;
  classId: string | null;
  academicYearId: string | null;
}

// A Student has no classId of its own — it's derived from the current-year
// Enrollment (year-scoped studentId+classId+academicYearId). A student with
// no Enrollment yet for the active year (e.g. mid-rollover) gets nulls
// rather than an error — portal pages that need a class show an empty
// state instead of crashing (see design spec's "no automatic access
// revocation" decision — the account still logs in either way).
export async function resolveMyStudentProfile(userId: string): Promise<MyStudentProfile | null> {
  const student = await prisma.student.findFirst({
    where: { userId },
    select: {
      id: true,
      schoolId: true,
      enrollments: {
        where: { academicYear: { isActive: true } },
        select: { classId: true, academicYearId: true },
        take: 1,
      },
    },
  });
  if (!student) return null;
  const enrollment = student.enrollments[0];
  return {
    studentId: student.id,
    schoolId: student.schoolId,
    classId: enrollment?.classId ?? null,
    academicYearId: enrollment?.academicYearId ?? null,
  };
}

export interface MySpaces {
  school: boolean;
  teacher: boolean;
  student: boolean;
}

// Un « espace » = une interface complète (app école / portail enseignant /
// portail élève). Source de vérité unique du login, de la page /espaces et
// du sélecteur « Mes espaces » — spec 2026-09-01-multi-espaces §3.
// school : OWNER/ADMIN, ou MEMBER dont l'union des grants est non vide
// (et jamais un compte lié élève). teacher : lien Teacher dans l'école du
// membership. student : mêmes gardes qu'isStudentOnly (User.role USER,
// aucun membership d'org, lien Student).
export async function resolveMySpaces(userId: string): Promise<MySpaces> {
  const membership = await findMembership(userId);
  const schoolId = membership?.organization.school?.id ?? null;
  const [user, teacher, student] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    schoolId
      ? prisma.teacher.findFirst({ where: { userId, schoolId }, select: { id: true } })
      : Promise.resolve(null),
    prisma.student.findFirst({
      where: schoolId ? { userId, schoolId } : { userId },
      select: { id: true },
    }),
  ]);
  const grantUnion = membership
    ? sanitizeGrants(membership.staffRoles.flatMap((r) => r.grants))
    : [];
  const school =
    membership !== null &&
    schoolId !== null &&
    student === null &&
    (membership.role !== 'MEMBER' || grantUnion.length > 0);
  return {
    school,
    teacher: schoolId !== null && teacher !== null,
    student: (user?.role ?? 'USER') === 'USER' && schoolId === null && student !== null,
  };
}

export function hasMinRole(role: OrgRole, min: OrgRole): boolean {
  return ORG_ROLE_RANK[role] >= ORG_ROLE_RANK[min];
}

// Used by Epic 4 (Classes) — a Class is year-scoped, so creating one needs
// the school's active AcademicYear. Mirrors the query in /api/school GET.
export async function resolveActiveAcademicYear(
  schoolId: string,
): Promise<{ id: string; label: string; startDate: Date } | null> {
  return prisma.academicYear.findFirst({
    where: { schoolId, isActive: true },
    orderBy: { startDate: 'desc' },
    select: { id: true, label: true, startDate: true },
  });
}
