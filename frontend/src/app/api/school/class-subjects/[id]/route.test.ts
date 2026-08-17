// DELETE /api/school/class-subjects/[id] refuses (409) when the pivot already
// carries evaluations — deleting it would cascade on the grades.
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
const params = { params: Promise.resolve({ id: 'cs1' }) };
const req = () =>
  new NextRequest('http://localhost/api/school/class-subjects/cs1', { method: 'DELETE' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(authUser as never);
  vi.mocked(verifyCsrf).mockReturnValue(null);
  vi.mocked(resolveMySchool).mockResolvedValue(adminSchool);
  prismaMock.classSubject.findUnique.mockResolvedValue({
    id: 'cs1',
    class: { schoolId: 'school_1' },
  } as never);
});

describe('DELETE /api/school/class-subjects/[id]', () => {
  it('returns 409 CLASS_SUBJECT_HAS_EVALUATIONS when grades exist', async () => {
    prismaMock.evaluation.count.mockResolvedValue(2);
    const res = await DELETE(req(), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('CLASS_SUBJECT_HAS_EVALUATIONS');
    expect(prismaMock.classSubject.delete).not.toHaveBeenCalled();
  });

  it('deletes (204) when the pivot has no evaluations', async () => {
    prismaMock.evaluation.count.mockResolvedValue(0);
    prismaMock.classSubject.delete.mockResolvedValue({} as never);
    const res = await DELETE(req(), params);
    expect(res.status).toBe(204);
    expect(prismaMock.classSubject.delete).toHaveBeenCalledWith({ where: { id: 'cs1' } });
  });
});
