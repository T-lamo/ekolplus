// Generic "invite someone to a portal account" helper — shared by the
// Teacher invite route today and the (future) Student Portal invite route.
// Creates a pending User (no password yet) + optionally an
// OrganizationMember + a VerificationCode + an outbox invite email, all in
// one transaction. The caller supplies `linkExisting` to set its own
// entity's userId field (Teacher.userId, Student.userId, ...) — this
// module has no knowledge of which entity type is inviting.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { generateVerificationCode } from './auth';
import { enqueueOutbox } from './outbox';

export interface CreatePortalInviteParams {
  schoolId: string;
  organizationId: string;
  email: string;
  /** VerificationCode.type value, e.g. 'TEACHER_INVITE'. */
  inviteType: string;
  /** Human-readable destination for the email copy, e.g. "espace enseignant". */
  portalLabel: string;
  expiresInMs: number;
  /** Student accounts get no OrganizationMember row by design — see the
   * Student Portal spec. Teacher accounts need one (role MEMBER). */
  createOrgMembership: boolean;
  linkExisting: (tx: Prisma.TransactionClient, userId: string) => Promise<void>;
}

export type CreatePortalInviteResult =
  | { ok: true; userId: string }
  | { ok: false; error: 'EMAIL_ALREADY_IN_USE' };

export async function createPortalInvite(
  params: CreatePortalInviteParams,
): Promise<CreatePortalInviteResult> {
  const existing = await prisma.user.findUnique({
    where: { email: params.email },
    select: { id: true, passwordHash: true },
  });
  if (existing) {
    const hasMembership = await prisma.organizationMember.findFirst({
      where: { userId: existing.id },
      select: { id: true },
    });
    if (existing.passwordHash || hasMembership) {
      return { ok: false, error: 'EMAIL_ALREADY_IN_USE' };
    }
  }

  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + params.expiresInMs);

  const userId = await prisma.$transaction(async (tx) => {
    const user =
      existing ??
      (await tx.user.create({
        data: { email: params.email, passwordHash: null },
        select: { id: true },
      }));

    if (params.createOrgMembership) {
      await tx.organizationMember.create({
        data: { userId: user.id, organizationId: params.organizationId, role: 'MEMBER' },
      });
    }

    await params.linkExisting(tx, user.id);

    await tx.verificationCode.create({
      data: { userId: user.id, code, type: params.inviteType, expiresAt },
    });

    await enqueueOutbox(tx, {
      kind: 'email.portal_invite',
      payload: {
        to: params.email,
        code,
        expiresAt: expiresAt.toISOString(),
        portalLabel: params.portalLabel,
      },
    });

    return user.id;
  });

  return { ok: true, userId };
}
