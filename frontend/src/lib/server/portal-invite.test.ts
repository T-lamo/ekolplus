import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    expect(prismaMock.organizationMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: 'org_1', role: 'MEMBER' }),
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

    expect(prismaMock.organizationMember.create).not.toHaveBeenCalled();
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
});
