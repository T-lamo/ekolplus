// "My school" resolution — used by /api/school/* routes, which act on the
// caller's own school rather than an :id in the URL (unlike requireOrgRole,
// which needs an explicit organizationId). V1 picks the first
// OrganizationMember row by createdAt — a person staffing more than one
// school has no switcher yet (documented limitation, school-settings.md).
import 'server-only';
import { prisma } from './prisma';
import { ORG_ROLE_RANK, type OrgRole } from './middleware/require-org-role';

export interface MySchool {
  organizationId: string;
  schoolId: string;
  role: OrgRole;
}

export async function resolveMySchool(userId: string): Promise<MySchool | null> {
  const membership = await prisma.organizationMember.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      organizationId: true,
      role: true,
      organization: { select: { school: { select: { id: true } } } },
    },
  });
  if (!membership || !membership.organization.school) return null;
  return {
    organizationId: membership.organizationId,
    schoolId: membership.organization.school.id,
    role: membership.role as OrgRole,
  };
}

export function hasMinRole(role: OrgRole, min: OrgRole): boolean {
  return ORG_ROLE_RANK[role] >= ORG_ROLE_RANK[min];
}
