// DELETE /api/school/bulletin-templates/[id] — own templates only, refuses
// the active template (400) and, since spec 2026-09-05 §8, refuses a
// template a grade level of this school still references (409
// TEMPLATE_IN_USE). prismaMock first (auto-hoists vi.mock for
// '@/lib/server/prisma'), then mock requireAuth + verifyCsrf +
// resolveMySchool — modeled on src/app/api/school/grade-levels/route.test.ts.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchool: vi.fn() };
});
vi.mock('@/lib/server/school-permissions', () => ({ requireSchoolPermission: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import {
  deniedSchoolPermission,
  passThroughSchoolPermission,
} from '@/test-utils/school-permission-mock';
import { DELETE } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);

const authUser = { user: { sub: 'user_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };

function req(method: string, url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSchoolPermission).mockImplementation(
    passThroughSchoolPermission(mockResolveMySchool),
  );
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(adminSchool);
});

describe('DELETE /api/school/bulletin-templates/[id]', () => {
  it('missing CSRF → 403', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await DELETE(req('DELETE', '/api/school/bulletin-templates/tpl1'), params('tpl1'));
    expect(res.status).toBe(403);
  });

  it('rôle sans notes.delete → 403 PERMISSION_DENIED', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    vi.mocked(requireSchoolPermission).mockResolvedValueOnce(deniedSchoolPermission());
    const res = await DELETE(req('DELETE', '/api/school/bulletin-templates/tpl1'), params('tpl1'));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('PERMISSION_DENIED');
    expect(prismaMock.bulletinTemplate.delete).not.toHaveBeenCalled();
  });

  it("unknown id or another school's template → 404 NOT_FOUND", async () => {
    prismaMock.bulletinTemplate.findUnique.mockResolvedValueOnce(null);
    let res = await DELETE(req('DELETE', '/api/school/bulletin-templates/nope'), params('nope'));
    expect(res.status).toBe(404);

    prismaMock.bulletinTemplate.findUnique.mockResolvedValueOnce({
      id: 'tpl1',
      schoolId: 'school_OTHER',
      isActive: false,
    } as never);
    res = await DELETE(req('DELETE', '/api/school/bulletin-templates/tpl1'), params('tpl1'));
    expect(res.status).toBe(404);
    expect(prismaMock.bulletinTemplate.delete).not.toHaveBeenCalled();
  });

  it('the active template → 400 VALIDATION_FAILED, delete never called', async () => {
    prismaMock.bulletinTemplate.findUnique.mockResolvedValue({
      id: 'tpl1',
      schoolId: 'school_1',
      isActive: true,
    } as never);
    const res = await DELETE(req('DELETE', '/api/school/bulletin-templates/tpl1'), params('tpl1'));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('VALIDATION_FAILED');
    expect(prismaMock.gradeLevel.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.bulletinTemplate.delete).not.toHaveBeenCalled();
  });

  it('a level of this school still references it → 409 TEMPLATE_IN_USE', async () => {
    prismaMock.bulletinTemplate.findUnique.mockResolvedValue({
      id: 'tpl1',
      schoolId: 'school_1',
      isActive: false,
    } as never);
    prismaMock.gradeLevel.findFirst.mockResolvedValue({ name: 'Kindergarten' } as never);
    const res = await DELETE(req('DELETE', '/api/school/bulletin-templates/tpl1'), params('tpl1'));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('TEMPLATE_IN_USE');
    expect(prismaMock.gradeLevel.findFirst).toHaveBeenCalledWith({
      where: { schoolId: 'school_1', bulletinTemplateId: 'tpl1' },
      select: { name: true },
    });
    expect(prismaMock.bulletinTemplate.delete).not.toHaveBeenCalled();
  });

  it('own non-active template, no level references it → 204', async () => {
    prismaMock.bulletinTemplate.findUnique.mockResolvedValue({
      id: 'tpl1',
      schoolId: 'school_1',
      isActive: false,
    } as never);
    prismaMock.gradeLevel.findFirst.mockResolvedValue(null);
    prismaMock.bulletinTemplate.delete.mockResolvedValue({
      id: 'tpl1',
      schoolId: 'school_1',
      isActive: false,
    } as never);
    const res = await DELETE(req('DELETE', '/api/school/bulletin-templates/tpl1'), params('tpl1'));
    expect(res.status).toBe(204);
    expect(prismaMock.bulletinTemplate.delete).toHaveBeenCalledWith({ where: { id: 'tpl1' } });
  });
});
