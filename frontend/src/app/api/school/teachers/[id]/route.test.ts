// DELETE /api/school/teachers/[id] — blocked (409) if still referenced by a
// ClassSubject row or as a Class homeroom teacher; when allowed, also
// removes the linked OrganizationMember row for a teacher-linked account.
// This matters because Teacher.userId is one of the signals
// isPortalLocked() (lib/server/school.ts) checks to decide whether
// resolveMySchool() should deny an account (unless the member already
// holds a staff role with a non-empty grant union, a "double profile"
// unlocked regardless) — deleting the Teacher row alone (FK is ON DELETE
// SET NULL, so the User survives) would leave that membership behind and
// silently upgrade the ex-teacher's still-working account to full
// admin-shell access on their next login.
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

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';
import { DELETE } from './route';

const authUser = { user: { sub: 'user_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };
const params = { params: Promise.resolve({ id: 't1' }) };
const req = () => new NextRequest('http://localhost/api/school/teachers/t1', { method: 'DELETE' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(authUser as never);
  vi.mocked(verifyCsrf).mockReturnValue(null);
  vi.mocked(resolveMySchool).mockResolvedValue(adminSchool);
  prismaMock.classSubject.count.mockResolvedValue(0);
  prismaMock.class.count.mockResolvedValue(0);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('DELETE /api/school/teachers/[id]', () => {
  it('returns 409 TEACHER_IN_USE and deletes nothing when still assigned to a class/subject', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'school_1',
      userId: 'user_linked',
    } as never);
    prismaMock.classSubject.count.mockResolvedValue(1);

    const res = await DELETE(req(), params);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('TEACHER_IN_USE');
    expect(prismaMock.teacher.delete).not.toHaveBeenCalled();
    expect(prismaMock.organizationMember.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes a teacher with userId: null WITHOUT touching OrganizationMember (no-op path)', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'school_1',
      userId: null,
    } as never);
    prismaMock.teacher.delete.mockResolvedValue({} as never);

    const res = await DELETE(req(), params);

    expect(res.status).toBe(204);
    expect(prismaMock.teacher.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    expect(prismaMock.organizationMember.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes a teacher with a linked userId AND removes its OrganizationMember row', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'school_1',
      userId: 'user_linked',
    } as never);
    prismaMock.teacher.delete.mockResolvedValue({} as never);

    const res = await DELETE(req(), params);

    expect(res.status).toBe(204);
    expect(prismaMock.organizationMember.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user_linked', organizationId: 'org_1' },
    });
    expect(prismaMock.teacher.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
  });
});
