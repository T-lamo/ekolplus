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
  return new NextRequest('http://localhost/api/school/students/s1/invite', { method: 'POST' });
}
const params = { params: Promise.resolve({ id: 's1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(adminSchool);
});

describe('POST /api/school/students/[id]/invite', () => {
  it('404s when the student does not belong to this school', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 's1',
      schoolId: 'other_school',
      email: null,
      userId: null,
      guardians: [],
    } as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(404);
  });

  it('rejects a non-admin caller', async () => {
    mockResolveMySchool.mockResolvedValue(memberSchool);
    prismaMock.student.findUnique.mockResolvedValue({
      id: 's1',
      schoolId: 'school_1',
      email: 'x@test.local',
      userId: null,
      guardians: [],
    } as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(403);
  });

  it('rejects a student with no resolvable email (no own email, no guardian email)', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 's1',
      schoolId: 'school_1',
      email: null,
      userId: null,
      guardians: [{ isPrimary: true, email: null }],
    } as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('NO_INVITE_TARGET');
  });

  it("invites using the student's own email when set", async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 's1',
      schoolId: 'school_1',
      email: 'student@test.local',
      userId: null,
      guardians: [{ isPrimary: true, email: 'parent@test.local' }],
    } as never);
    mockCreatePortalInvite.mockResolvedValue({ ok: true, userId: 'user_new' });
    const res = await POST(req(), params);
    expect(res.status).toBe(201);
    expect(mockCreatePortalInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'student@test.local',
        inviteType: 'STUDENT_INVITE',
        createOrgMembership: false,
      }),
    );
  });

  it("falls back to the primary guardian's email when the student has none", async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 's1',
      schoolId: 'school_1',
      email: null,
      userId: null,
      guardians: [
        { isPrimary: false, email: 'other@test.local' },
        { isPrimary: true, email: 'parent@test.local' },
      ],
    } as never);
    mockCreatePortalInvite.mockResolvedValue({ ok: true, userId: 'user_new' });
    const res = await POST(req(), params);
    expect(res.status).toBe(201);
    expect(mockCreatePortalInvite).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'parent@test.local' }),
    );
  });

  it('links Student.userId via the linkExisting callback', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 's1',
      schoolId: 'school_1',
      email: 'student@test.local',
      userId: null,
      guardians: [],
    } as never);
    mockCreatePortalInvite.mockResolvedValue({ ok: true, userId: 'user_new' });
    await POST(req(), params);
    const callback = mockCreatePortalInvite.mock.calls[0]![0].linkExisting;
    await callback(prismaMock as never, 'user_new');
    expect(prismaMock.student.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { userId: 'user_new' },
    });
  });

  it('treats an already-linked student as a resend, not an error', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 's1',
      schoolId: 'school_1',
      email: 'student@test.local',
      userId: 'user_existing',
      guardians: [],
    } as never);
    prismaMock.verificationCode.updateMany.mockResolvedValue({ count: 1 } as never);
    mockCreatePortalInvite.mockResolvedValue({ ok: true, userId: 'user_existing' });
    const res = await POST(req(), params);
    expect(res.status).toBe(201);
    expect((await res.json()).resent).toBe(true);
    expect(prismaMock.verificationCode.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_existing', type: 'STUDENT_INVITE', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('surfaces EMAIL_ALREADY_IN_USE from createPortalInvite', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 's1',
      schoolId: 'school_1',
      email: 'student@test.local',
      userId: null,
      guardians: [],
    } as never);
    mockCreatePortalInvite.mockResolvedValue({ ok: false, error: 'EMAIL_ALREADY_IN_USE' });
    const res = await POST(req(), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('EMAIL_ALREADY_IN_USE');
  });
});
