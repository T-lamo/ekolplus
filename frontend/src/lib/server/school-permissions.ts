// Application serveur du RBAC école (spec 2026-09-01-permission-manager) :
// remplace resolveMySchool() dans les routes /api/school/* pour porter la
// vérification module.action. OWNER/ADMIN passent toujours ; MEMBER passe
// par les grants de son StaffRole ; sans rôle = refus (deny by default).
import 'server-only';
import { NextResponse } from 'next/server';
import { prisma } from './prisma';
import { resolveMySchool, type MySchool } from './school';
import {
  hasGrant,
  sanitizeGrants,
  type PermissionAction,
  type PermissionGrant,
  type PermissionModuleKey,
} from '@/lib/permissions';

export type MyGrants = 'ALL' | ReadonlySet<PermissionGrant>;

export async function resolveGrantsFor(mySchool: MySchool, userId: string): Promise<MyGrants> {
  if (mySchool.role !== 'MEMBER') return 'ALL';
  const member = await prisma.organizationMember.findFirst({
    where: { userId, organizationId: mySchool.organizationId },
    select: { staffRole: { select: { grants: true } } },
  });
  return new Set(sanitizeGrants(member?.staffRole?.grants ?? []));
}

export async function resolveMyGrants(
  userId: string,
): Promise<{ mySchool: MySchool; grants: MyGrants } | null> {
  const mySchool = await resolveMySchool(userId);
  if (!mySchool) return null;
  return { mySchool, grants: await resolveGrantsFor(mySchool, userId) };
}

export type SchoolPermissionResult =
  | { ok: true; mySchool: MySchool }
  | { ok: false; response: NextResponse };

export async function requireSchoolPermission(
  userId: string,
  module: PermissionModuleKey,
  action: PermissionAction,
  requestId: string,
): Promise<SchoolPermissionResult> {
  const resolved = await resolveMyGrants(userId);
  if (!resolved) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': requestId } },
      ),
    };
  }
  if (!hasGrant(resolved.grants, module, action)) {
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
  return { ok: true, mySchool: resolved.mySchool };
}
