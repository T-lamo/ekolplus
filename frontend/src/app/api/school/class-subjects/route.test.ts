// GET /api/school/class-subjects — the school-wide list feeds every
// class/subject picker (carnet de notes, appréciations, bulletins,
// affectations, coefficients). It must be scoped to the ACTIVE academic year:
// after a rollover the archived year's pivots would otherwise resurface old
// classes (same names) in those pickers.
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
  return { ...actual, resolveMySchool: vi.fn(), resolveActiveAcademicYear: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchool, resolveActiveAcademicYear } from '@/lib/server/school';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveMySchool = vi.mocked(resolveMySchool);
const mockResolveYear = vi.mocked(resolveActiveAcademicYear);

const authUser = { user: { sub: 'user_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };

const req = (url: string) => new NextRequest(`http://localhost${url}`, { method: 'GET' });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveMySchool.mockResolvedValue(adminSchool);
  mockResolveYear.mockResolvedValue({ id: 'year_1', label: '2024-2025' } as never);
  prismaMock.classSubject.findMany.mockResolvedValue([]);
});

describe('GET /api/school/class-subjects', () => {
  it('unauthenticated → passes the middleware response through', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }) as never,
    );
    const res = await GET(req('/api/school/class-subjects'));
    expect(res.status).toBe(401);
  });

  it("school-wide list is scoped to the ACTIVE year's classes", async () => {
    const res = await GET(req('/api/school/class-subjects'));
    expect(res.status).toBe(200);
    expect(prismaMock.classSubject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { class: { schoolId: 'school_1', academicYearId: 'year_1' } },
      }),
    );
  });

  it('no active year → empty list without querying', async () => {
    mockResolveYear.mockResolvedValue(null);
    const res = await GET(req('/api/school/class-subjects'));
    expect(res.status).toBe(200);
    expect((await res.json()) as { classSubjects: unknown[] }).toEqual({ classSubjects: [] });
    expect(prismaMock.classSubject.findMany).not.toHaveBeenCalled();
  });

  it('?classId= still works for a class of this school (any year — explicit id)', async () => {
    prismaMock.class.findUnique.mockResolvedValue({ id: 'cls_1', schoolId: 'school_1' } as never);
    const res = await GET(req('/api/school/class-subjects?classId=cls_1'));
    expect(res.status).toBe(200);
    expect(prismaMock.classSubject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { classId: 'cls_1' } }),
    );
  });

  it('?classId= of another school → 404', async () => {
    prismaMock.class.findUnique.mockResolvedValue({ id: 'cls_x', schoolId: 'school_2' } as never);
    const res = await GET(req('/api/school/class-subjects?classId=cls_x'));
    expect(res.status).toBe(404);
  });
});
