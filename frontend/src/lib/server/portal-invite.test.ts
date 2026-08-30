import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { createPortalInvite } from './portal-invite';

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

const baseParams = {
  schoolId: 'school_1',
  organizationId: 'org_1',
  email: 'teacher@school.test',
  inviteType: 'TEACHER_INVITE',
  portalLabel: 'espace enseignant',
  expiresInMs: 7 * 24 * 60 * 60 * 1000,
  createOrgMembership: true,
};

describe('createPortalInvite', () => {
  it('creates a pending User + OrganizationMember, links, and enqueues the invite', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null as never);
    prismaMock.user.create.mockResolvedValue({ id: 'user_new' } as never);
    const linkExisting = vi.fn().mockResolvedValue(undefined);

    const result = await createPortalInvite({ ...baseParams, linkExisting });

    expect(result).toEqual({ ok: true, userId: 'user_new' });
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'teacher@school.test', passwordHash: null }),
      }),
    );
    expect(prismaMock.organizationMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_userId: { organizationId: 'org_1', userId: 'user_new' } },
        create: expect.objectContaining({ organizationId: 'org_1', role: 'MEMBER' }),
      }),
    );
    expect(linkExisting).toHaveBeenCalledWith(expect.anything(), 'user_new');
    expect(prismaMock.verificationCode.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'TEACHER_INVITE' }) }),
    );
    expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'email.portal_invite' }) }),
    );
  });

  it('skips OrganizationMember creation when createOrgMembership is false', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null as never);
    prismaMock.user.create.mockResolvedValue({ id: 'user_new' } as never);

    await createPortalInvite({
      ...baseParams,
      createOrgMembership: false,
      linkExisting: vi.fn().mockResolvedValue(undefined),
    });

    expect(prismaMock.organizationMember.upsert).not.toHaveBeenCalled();
  });

  it('reuses an existing passwordless, membership-less User instead of creating a duplicate', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_existing',
      passwordHash: null,
    } as never);
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never);
    const linkExisting = vi.fn().mockResolvedValue(undefined);

    const result = await createPortalInvite({ ...baseParams, linkExisting });

    expect(result).toEqual({ ok: true, userId: 'user_existing' });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(linkExisting).toHaveBeenCalledWith(expect.anything(), 'user_existing');
  });

  it('rejects when the email belongs to an account that already has a password or membership', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_existing',
      passwordHash: 'hash',
    } as never);

    const result = await createPortalInvite({
      ...baseParams,
      linkExisting: vi.fn(),
    });

    expect(result).toEqual({ ok: false, error: 'EMAIL_ALREADY_IN_USE' });
  });

  it('rejects when an existing passwordless user already has an OrganizationMember row in a DIFFERENT org', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_existing',
      passwordHash: null,
    } as never);
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      id: 'member_1',
      organizationId: 'org_other',
    } as never);

    const result = await createPortalInvite({
      ...baseParams,
      linkExisting: vi.fn(),
    });

    expect(result).toEqual({ ok: false, error: 'EMAIL_ALREADY_IN_USE' });
  });

  it('allows a resend/re-invite: an existing passwordless user with an OrganizationMember in the SAME org succeeds', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_existing',
      passwordHash: null,
    } as never);
    // The query excludes organizationId: params.organizationId ('org_1'), so
    // a membership only in that same org resolves to no match here.
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never);
    const linkExisting = vi.fn().mockResolvedValue(undefined);

    const result = await createPortalInvite({ ...baseParams, linkExisting });

    expect(result).toEqual({ ok: true, userId: 'user_existing' });
    expect(prismaMock.organizationMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_existing', organizationId: { not: 'org_1' } },
      }),
    );
    expect(linkExisting).toHaveBeenCalledWith(expect.anything(), 'user_existing');
  });

  it('existingUserId provided: looks up the User by id, not by email', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_existing',
      passwordHash: null,
    } as never);
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never);
    const linkExisting = vi.fn().mockResolvedValue(undefined);

    const result = await createPortalInvite({
      ...baseParams,
      existingUserId: 'user_existing',
      linkExisting,
    });

    expect(result).toEqual({ ok: true, userId: 'user_existing' });
    // Resolved by id — the email-based lookup path must not run at all.
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user_existing' },
      select: { id: true, passwordHash: true },
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: baseParams.email } }),
    );
    expect(linkExisting).toHaveBeenCalledWith(expect.anything(), 'user_existing');
  });

  it('remaps a P2002 unique-constraint race on the transaction to EMAIL_ALREADY_IN_USE', async () => {
    // Two concurrent invites for the same brand-new email: both pass the
    // pre-check (findUnique resolves null for both), but the @@unique on
    // User.email means the second tx.user.create loses the race.
    prismaMock.user.findUnique.mockResolvedValue(null as never);
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    prismaMock.$transaction.mockImplementationOnce(() => Promise.reject(p2002));

    const result = await createPortalInvite({
      ...baseParams,
      linkExisting: vi.fn(),
    });

    expect(result).toEqual({ ok: false, error: 'EMAIL_ALREADY_IN_USE' });
  });
});
