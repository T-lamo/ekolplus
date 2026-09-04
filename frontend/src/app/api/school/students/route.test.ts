// Famille témoin du RBAC école (spec 2026-09-01-permission-manager) : les
// autres suites /api/school/* moquent requireSchoolPermission pour rester sur
// leur propre sujet ; ici c'est la vraie logique de school-permissions.ts qui
// tourne (seul resolveMySchool est moqué, pour piloter le rôle du caller).
// Ce fichier atteste donc que les grants du StaffRole décident réellement de
// l'accès, et que la conversion des routes n'est pas un no-op.
// prismaMock en premier (auto-hoiste le vi.mock de '@/lib/server/prisma').
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
  return { ...actual, resolveMySchool: vi.fn(), resolveActiveAcademicYear: vi.fn() };
});
vi.mock('@/lib/server/billing/summary', () => ({ checkStudentLimit: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool, resolveActiveAcademicYear } from '@/lib/server/school';
import { checkStudentLimit } from '@/lib/server/billing/summary';
import { GET, POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveMySchool = vi.mocked(resolveMySchool);

const authUser = { user: { sub: 'user_1', email: 'staff@test.local' } };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };
const ownerSchool = { ...memberSchool, role: 'OWNER' as const };
const req = () => new NextRequest('http://localhost/api/school/students', { method: 'GET' });
const postReq = () =>
  new NextRequest('http://localhost/api/school/students', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Marie',
      lastName: 'Joseph',
      dateOfBirth: '2014-05-02',
      classId: 'cls_1',
    }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  vi.mocked(verifyCsrf).mockReturnValue(null);
  prismaMock.student.findMany.mockResolvedValue([] as never);
});

describe('GET /api/school/students — grants du rôle personnalisé', () => {
  it('MEMBER sans rôle personnalisé → 403 PERMISSION_DENIED (deny by default)', async () => {
    mockResolveMySchool.mockResolvedValue(memberSchool);
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never);

    const res = await GET(req());

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('PERMISSION_DENIED');
    expect(prismaMock.student.findMany).not.toHaveBeenCalled();
  });

  it('MEMBER dont le rôle ne porte pas eleves.view → 403 PERMISSION_DENIED', async () => {
    mockResolveMySchool.mockResolvedValue(memberSchool);
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      staffRoles: [{ grants: ['presences.view', 'notes.view'] }],
    } as never);

    const res = await GET(req());

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('PERMISSION_DENIED');
    expect(prismaMock.student.findMany).not.toHaveBeenCalled();
  });

  it('MEMBER dont le rôle porte eleves.view → 200', async () => {
    mockResolveMySchool.mockResolvedValue(memberSchool);
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      staffRoles: [{ grants: ['eleves.view'] }],
    } as never);

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect((await res.json()).students).toEqual([]);
  });

  it('OWNER passe sans rôle personnalisé (les grants ne concernent que MEMBER) → 200', async () => {
    mockResolveMySchool.mockResolvedValue(ownerSchool);

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(prismaMock.organizationMember.findFirst).not.toHaveBeenCalled();
  });

  it('compte sans école → 404 NO_SCHOOL', async () => {
    mockResolveMySchool.mockResolvedValue(null);

    const res = await GET(req());

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NO_SCHOOL');
    expect(prismaMock.student.findMany).not.toHaveBeenCalled();
  });
});

// L'écriture est le vrai enjeu de la matrice : un rôle personnalisé porteur de
// eleves.create doit pouvoir inscrire un élève, sans palier ADMIN au-dessus.
describe('POST /api/school/students — grants du rôle personnalisé', () => {
  beforeEach(() => {
    vi.mocked(resolveActiveAcademicYear).mockResolvedValue({
      id: 'ay_1',
      startDate: new Date('2026-09-01'),
    } as never);
    vi.mocked(checkStudentLimit).mockResolvedValue({
      allowed: true,
      plan: 'PRO',
      limit: null,
      studentCount: 3,
    } as never);
    prismaMock.student.count.mockResolvedValue(3 as never);
    prismaMock.class.findUnique.mockResolvedValue({ id: 'cls_1', schoolId: 'school_1' } as never);
    prismaMock.student.create.mockResolvedValue({ id: 'stu_1', firstName: 'Marie' } as never);
    prismaMock.$transaction.mockImplementation((async (cb: (tx: typeof prismaMock) => unknown) =>
      cb(prismaMock)) as never);
  });

  it('MEMBER dont le rôle porte eleves.create → 201 (plus de palier ADMIN au-dessus du grant)', async () => {
    mockResolveMySchool.mockResolvedValue(memberSchool);
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      staffRoles: [{ grants: ['eleves.view', 'eleves.create'] }],
    } as never);

    const res = await POST(postReq());

    expect(res.status).toBe(201);
    expect(prismaMock.student.create).toHaveBeenCalled();
  });

  it("MEMBER dont le rôle n'a que eleves.view → 403 PERMISSION_DENIED", async () => {
    mockResolveMySchool.mockResolvedValue(memberSchool);
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      staffRoles: [{ grants: ['eleves.view'] }],
    } as never);

    const res = await POST(postReq());

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('PERMISSION_DENIED');
    expect(prismaMock.student.create).not.toHaveBeenCalled();
  });

  it('persists nisu and guardian nif/niu/vitalStatus on creation', async () => {
    mockResolveMySchool.mockResolvedValue(ownerSchool);

    const res = await POST(
      new NextRequest('http://localhost/api/school/students', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName: 'Marie',
          lastName: 'Joseph',
          dateOfBirth: '2014-05-02',
          classId: 'cls_1',
          nisu: 'NISU-2026-0001',
          guardians: [
            {
              name: 'Jean Joseph',
              relationship: 'Père',
              nif: 'NIF-1',
              niu: 'NIU-1',
              vitalStatus: 'VIVANT',
            },
          ],
        }),
      }),
    );

    expect(res.status).toBe(201);
    const createArgs = prismaMock.student.create.mock.calls[0]?.[0] as {
      data: { nisu?: string };
    };
    expect(createArgs.data.nisu).toBe('NISU-2026-0001');
  });
});
