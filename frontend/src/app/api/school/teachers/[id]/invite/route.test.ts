import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchool: vi.fn() };
});
vi.mock('@/lib/server/portal-invite', () => ({ createPortalInvite: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';
import { createPortalInvite } from '@/lib/server/portal-invite';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);
const mockCreatePortalInvite = vi.mocked(createPortalInvite);

const authUser = { user: { sub: 'admin_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };
const memberSchool = { ...adminSchool, role: 'MEMBER' as const };

function req() {
  return new NextRequest('http://localhost/api/school/teachers/t1/invite', { method: 'POST' });
}
const params = { params: Promise.resolve({ id: 't1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(adminSchool);
});

describe('POST /api/school/teachers/[id]/invite', () => {
  it('404s when the teacher does not belong to this school', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'other_school',
      email: 'x@test.local',
      userId: null,
    } as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(404);
  });

  it('rejects a staff member whose role does not carry enseignants.edit', async () => {
    mockResolveMySchool.mockResolvedValue(memberSchool);
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'school_1',
      email: 'x@test.local',
      userId: null,
    } as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('PERMISSION_DENIED');
  });

  it('rejects a teacher with no email on file', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'school_1',
      email: null,
      userId: null,
    } as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('invites a fresh teacher and links Teacher.userId', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'school_1',
      email: 'teach@school.test',
      userId: null,
    } as never);
    mockCreatePortalInvite.mockResolvedValue({ ok: true, userId: 'user_new' });
    const res = await POST(req(), params);
    expect(res.status).toBe(201);
    expect(mockCreatePortalInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'teach@school.test',
        inviteType: 'TEACHER_INVITE',
        createOrgMembership: true,
      }),
    );
    // Fresh invite (no Teacher.userId yet): must NOT pass existingUserId —
    // the email-based lookup is correct here since there's no user yet.
    expect(mockCreatePortalInvite.mock.calls[0]![0]).not.toHaveProperty('existingUserId');
    // The linkExisting callback passed to createPortalInvite must set Teacher.userId.
    const callback = mockCreatePortalInvite.mock.calls[0]![0].linkExisting;
    await callback(prismaMock as never, 'user_new');
    expect(prismaMock.teacher.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { userId: 'user_new' },
    });
  });

  it('treats an already-linked teacher as a resend, not an error', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'school_1',
      email: 'teach@school.test',
      userId: 'user_existing',
    } as never);
    prismaMock.verificationCode.updateMany.mockResolvedValue({ count: 1 } as never);
    mockCreatePortalInvite.mockResolvedValue({ ok: true, userId: 'user_existing' });
    const res = await POST(req(), params);
    expect(res.status).toBe(201);
    expect((await res.json()).resent).toBe(true);
    // The previous unused code for this user/type must be invalidated first.
    expect(prismaMock.verificationCode.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_existing', type: 'TEACHER_INVITE', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    // Must resolve the target User by id (Teacher.userId), not by email —
    // an admin may have edited the teacher's email since the first invite,
    // and that PATCH does not keep the linked User.email in sync.
    expect(mockCreatePortalInvite).toHaveBeenCalledWith(
      expect.objectContaining({ existingUserId: 'user_existing' }),
    );
  });

  it('surfaces EMAIL_ALREADY_IN_USE from createPortalInvite', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'school_1',
      email: 'teach@school.test',
      userId: null,
    } as never);
    mockCreatePortalInvite.mockResolvedValue({ ok: false, error: 'EMAIL_ALREADY_IN_USE' });
    const res = await POST(req(), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('EMAIL_ALREADY_IN_USE');
  });
});
