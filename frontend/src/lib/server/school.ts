// "My school" resolution — used by /api/school/* routes, which act on the
// caller's own school rather than an :id in the URL (unlike requireOrgRole,
// which needs an explicit organizationId). V1 picks the first
// OrganizationMember row by createdAt — a person staffing more than one
// school has no switcher yet (documented limitation, school-settings.md).
//
// Deny-by-default lockdown (2026-08-30, Espace Enseignant Phase 1):
// resolveMySchool() rejects MEMBER-role accounts linked to a portal-only
// entity (a Teacher today; the Student Portal adds its own check here
// later) so every existing /api/school/* route is locked down for free,
// with zero edits to those ~65 files. Routes that must stay reachable by
// teachers call resolveMySchoolIncludingTeacher() instead, and layer their
// own per-classSubject/per-class check via resolveMyTeacherProfile() — see
// docs/superpowers/specs/2026-08-30-espace-enseignant-design.md.
import 'server-only';
import { prisma } from './prisma';
import { ORG_ROLE_RANK, type OrgRole } from './middleware/require-org-role';

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
      organization: { select: { school: { select: { id: true } } } },
    },
  });
}

// Currently only checks Teacher. The Student Portal adds its own Student
// check into this same function once Student.userId exists.
async function isPortalOnlyAccount(userId: string, schoolId: string): Promise<boolean> {
  const teacher = await prisma.teacher.findFirst({
    where: { userId, schoolId },
    select: { id: true },
  });
  return teacher !== null;
}

export async function resolveMySchool(userId: string): Promise<MySchool | null> {
  const membership = await findMembership(userId);
  if (!membership || !membership.organization.school) return null;
  const schoolId = membership.organization.school.id;
  if (membership.role === 'MEMBER' && (await isPortalOnlyAccount(userId, schoolId))) {
    return null;
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
