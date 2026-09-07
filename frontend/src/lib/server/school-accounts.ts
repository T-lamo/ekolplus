// Resolves who a `userId` is within the caller's school, for the
// `accounts/*` routes (Personnel module, spec
// 2026-09-04-personnel-module-design.md §7): "membre staff → ADMIN+ (OWNER
// si la cible est ADMIN/OWNER) ; enseignant seul → enseignants.edit ;
// élève → eleves.edit". `accounts/*` is on the RBAC-01 whitelist — it is
// role-rank + this resolution, not a single grant check, the same
// exemption as `members/`.
//
// "Staff" here means genuine access (ADMIN, or MEMBER with at least one
// StaffRole) — a teacher's connective membership row (role MEMBER, no
// StaffRole, created automatically by the email-invite flow so
// resolveMySchool() can find an organizationId for the account) is NOT
// "staff" for this purpose; such an account resolves as TEACHER_ONLY, same
// convention as personnel/view.ts's badge logic.
import 'server-only';
import { NextResponse } from 'next/server';
import { prisma } from './prisma';
import { hasMinRole, type MySchool } from './school';
import { resolveGrantsFor } from './school-permissions';
import { hasGrant } from '@/lib/permissions';

export type SchoolAccountKind =
  | { kind: 'STAFF'; targetRole: 'OWNER' | 'ADMIN' | 'MEMBER' }
  | { kind: 'TEACHER_ONLY'; teacherId: string }
  | { kind: 'STUDENT'; studentId: string };

export async function resolveSchoolAccount(
  userId: string,
  mySchool: MySchool,
): Promise<SchoolAccountKind | null> {
  const member = await prisma.organizationMember.findFirst({
    where: { userId, organizationId: mySchool.organizationId },
    select: { role: true, staffRoles: { select: { id: true } } },
  });
  if (member && (member.role !== 'MEMBER' || member.staffRoles.length > 0)) {
    return { kind: 'STAFF', targetRole: member.role as 'OWNER' | 'ADMIN' | 'MEMBER' };
  }

  const teacher = await prisma.teacher.findFirst({
    where: { userId, schoolId: mySchool.schoolId },
    select: { id: true },
  });
  if (teacher) return { kind: 'TEACHER_ONLY', teacherId: teacher.id };

  const student = await prisma.student.findFirst({
    where: { userId, schoolId: mySchool.schoolId },
    select: { id: true },
  });
  if (student) return { kind: 'STUDENT', studentId: student.id };

  return null;
}

/** "OWNER si la cible est ADMIN/OWNER ; un ADMIN ne touche jamais au
 * compte du OWNER" — a MEMBER target needs ADMIN+, an ADMIN or OWNER
 * target needs the OWNER themselves (mirrors DELETE members/[userId]'s
 * "an ADMIN cannot remove another ADMIN" rule). */
export function staffAccountAccessAllowed(
  mySchool: MySchool,
  targetRole: 'OWNER' | 'ADMIN' | 'MEMBER',
): boolean {
  if (targetRole === 'MEMBER') return hasMinRole(mySchool.role, 'ADMIN');
  return mySchool.role === 'OWNER';
}

export type AccountAccessResult =
  | { ok: true; account: SchoolAccountKind }
  | { ok: false; response: NextResponse };

/** Shared entry point for the `accounts/*` routes: resolves who
 * `targetUserId` is in this school (404 anti-fuite if no one), then
 * applies the strictest applicable rule (spec §7). Used by both PATCH
 * accounts/[userId] and POST accounts/[userId]/reset-password so the two
 * routes can never drift on authorization. */
export async function requireAccountAccess(
  callerId: string,
  targetUserId: string,
  mySchool: MySchool,
  requestId: string,
): Promise<AccountAccessResult> {
  const account = await resolveSchoolAccount(targetUserId, mySchool);
  if (!account) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': requestId } },
      ),
    };
  }

  let allowed: boolean;
  if (account.kind === 'STAFF') {
    allowed = staffAccountAccessAllowed(mySchool, account.targetRole);
  } else {
    const grants = await resolveGrantsFor(mySchool, callerId);
    const module = account.kind === 'TEACHER_ONLY' ? 'enseignants' : 'eleves';
    allowed = hasGrant(grants, module, 'edit');
  }
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'PERMISSION_DENIED',
          message: 'You do not have permission to perform this action.',
        },
        { status: 403, headers: { 'x-request-id': requestId } },
      ),
    };
  }

  return { ok: true, account };
}
