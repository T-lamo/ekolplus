// prismaMock first — auto-hoists the vi.mock('@/lib/server/prisma', ...) call.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchool: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchool } from '@/lib/server/school';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveMySchool = vi.mocked(resolveMySchool);

const authUser = { user: { sub: 'user_1', email: 'staff@test.local' } };
const ownerSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'OWNER' as const };
const memberSchool = { ...ownerSchool, role: 'MEMBER' as const };

function req(u: string) {
  return new NextRequest(`http://localhost/api/school/personnel/username-available?u=${u}`, {
    method: 'GET',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveMySchool.mockResolvedValue(ownerSchool);
});

describe('GET /api/school/personnel/username-available', () => {
  it('returns available: true for a free username', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null as never);
    const res = await GET(req('marie.k'));
    expect(res.status).toBe(200);
    expect((await res.json()).available).toBe(true);
  });

  it('returns available: false for a taken username, without revealing whose it is', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'someone' } as never);
    const res = await GET(req('marie.k'));
    const body = await res.json();
    expect(body).toEqual({ available: false });
  });

  it('returns available: false (not a validation error) for an invalid format', async () => {
    const res = await GET(req('a@b'));
    expect(res.status).toBe(200);
    expect((await res.json()).available).toBe(false);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('a MEMBER with neither enseignants.create nor .edit is denied', async () => {
    mockResolveMySchool.mockResolvedValue(memberSchool);
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      staffRoles: [{ grants: ['enseignants.view'] }],
    } as never);
    const res = await GET(req('marie.k'));
    expect(res.status).toBe(403);
  });

  it('a MEMBER with enseignants.create is allowed', async () => {
    mockResolveMySchool.mockResolvedValue(memberSchool);
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      staffRoles: [{ grants: ['enseignants.view', 'enseignants.create'] }],
    } as never);
    prismaMock.user.findUnique.mockResolvedValue(null as never);
    const res = await GET(req('marie.k'));
    expect(res.status).toBe(200);
  });
});
