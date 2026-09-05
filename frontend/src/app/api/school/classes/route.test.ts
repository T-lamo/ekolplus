// Fiche classe (add-class.md): POST with subjectIds creates the pivots in the
// same transaction, GET [id] returns subjectIds/lockedSubjectIds, PATCH accepts
// color/track. prismaMock first (auto-hoists vi.mock for '@/lib/server/prisma').
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
vi.mock('@/lib/server/school-permissions', () => ({ requireSchoolPermission: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool, resolveActiveAcademicYear } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { passThroughSchoolPermission } from '@/test-utils/school-permission-mock';
import { GET, POST } from './route';
import { GET as GET_ONE, PATCH } from './[id]/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);
const mockResolveYear = vi.mocked(resolveActiveAcademicYear);

const authUser = { user: { sub: 'user_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };
const memberSchool = { ...adminSchool, role: 'MEMBER' as const };

function req(method: string, url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const createdClass = {
  id: 'cls_new',
  schoolId: 'school_1',
  academicYearId: 'year_1',
  name: '3ème A',
  level: '3ème',
  room: 'Salle 12',
  capacity: 32,
  homeroomTeacherId: null,
  homeroomTeacher: null,
  color: '#2563eb',
  track: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSchoolPermission).mockImplementation(
    passThroughSchoolPermission(mockResolveMySchool),
  );
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(adminSchool);
  mockResolveYear.mockResolvedValue({ id: 'year_1', label: '2024-2025' } as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('GET /api/school/classes (active-year scope)', () => {
  it("lists only the ACTIVE year's classes — old-year classes never leak into pickers", async () => {
    prismaMock.class.findMany.mockResolvedValue([
      {
        ...createdClass,
        _count: { classSubjects: 2, enrollments: 25 },
      },
    ] as never);

    const res = await GET(req('GET', '/api/school/classes'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { activeYearLabel: string | null; classes: unknown[] };
    expect(body.activeYearLabel).toBe('2024-2025');
    expect(body.classes).toHaveLength(1);
    expect(prismaMock.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: 'school_1', academicYearId: 'year_1' },
      }),
    );
  });

  it('no active year → empty list (classes always belong to a year), label null', async () => {
    mockResolveYear.mockResolvedValue(null);

    const res = await GET(req('GET', '/api/school/classes'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { activeYearLabel: string | null; classes: unknown[] };
    expect(body.activeYearLabel).toBeNull();
    expect(body.classes).toEqual([]);
    expect(prismaMock.class.findMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/school/classes (fiche classe)', () => {
  it('creates the class + ClassSubject pivots (coefficient = subject default) in one tx', async () => {
    prismaMock.subject.findMany.mockResolvedValue([
      { id: 's1', defaultCoefficient: 4 },
      { id: 's2', defaultCoefficient: null },
    ] as never);
    prismaMock.class.create.mockResolvedValue(createdClass as never);
    prismaMock.classSubject.createMany.mockResolvedValue({ count: 2 });

    const res = await POST(
      req('POST', '/api/school/classes', {
        name: '3ème A',
        level: '3ème',
        capacity: 32,
        color: '#2563eb',
        subjectIds: ['s1', 's2', 's1'],
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.class.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ color: '#2563eb', track: null, academicYearId: 'year_1' }),
      }),
    );
    expect(prismaMock.classSubject.createMany).toHaveBeenCalledWith({
      data: [
        { classId: 'cls_new', subjectId: 's1', coefficient: 4 },
        { classId: 'cls_new', subjectId: 's2', coefficient: null },
      ],
      skipDuplicates: true,
    });
    const body = await res.json();
    expect(body.class.subjectCount).toBe(2);
  });

  it('rejects a subject that belongs to another school (400)', async () => {
    prismaMock.subject.findMany.mockResolvedValue([{ id: 's1', defaultCoefficient: 1 }] as never);
    const res = await POST(
      req('POST', '/api/school/classes', {
        name: '3ème A',
        level: '3ème',
        subjectIds: ['s1', 's_foreign'],
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.class.create).not.toHaveBeenCalled();
  });

  it('rejects a malformed color (400)', async () => {
    const res = await POST(
      req('POST', '/api/school/classes', { name: '3ème A', level: '3ème', color: 'blue' }),
    );
    expect(res.status).toBe(400);
  });

  it('bails on CSRF failure before touching the DB', async () => {
    mockVerifyCsrf.mockReturnValue(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const res = await POST(req('POST', '/api/school/classes', { name: 'x', level: 'y' }));
    expect(res.status).toBe(403);
    expect(prismaMock.class.create).not.toHaveBeenCalled();
  });

  it("unknown or another school's gradeLevelId → 400 VALIDATION_FAILED", async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValueOnce(null);
    let res = await POST(
      req('POST', '/api/school/classes', { name: '6ème A', level: '6ème', gradeLevelId: 'nope' }),
    );
    expect(res.status).toBe(400);

    prismaMock.gradeLevel.findUnique.mockResolvedValueOnce({
      id: 'gl1',
      schoolId: 'school_OTHER',
    } as never);
    res = await POST(
      req('POST', '/api/school/classes', { name: '6ème A', level: '6ème', gradeLevelId: 'gl1' }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('valid gradeLevelId is persisted on create', async () => {
    prismaMock.gradeLevel.findUnique.mockResolvedValue({
      id: 'gl1',
      schoolId: 'school_1',
    } as never);
    prismaMock.class.create.mockResolvedValue(createdClass as never);
    const res = await POST(
      req('POST', '/api/school/classes', { name: '6ème A', level: '6ème', gradeLevelId: 'gl1' }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.class.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ gradeLevelId: 'gl1' }) }),
    );
  });
});

describe('GET /api/school/classes/[id]', () => {
  it('returns subjectIds + lockedSubjectIds (pivots with evaluations) + studentCount', async () => {
    prismaMock.class.findUnique.mockResolvedValue({
      ...createdClass,
      academicYear: { id: 'year_1', label: '2024-2025' },
      classSubjects: [
        {
          id: 'cs1',
          subjectId: 's1',
          teacherId: 'tea_1',
          coefficient: 4,
          weeklyHours: 5,
          _count: { evaluations: 3 },
        },
        {
          id: 'cs2',
          subjectId: 's2',
          teacherId: null,
          coefficient: null,
          weeklyHours: null,
          _count: { evaluations: 0 },
        },
      ],
      _count: { enrollments: 24 },
    } as never);
    mockResolveMySchool.mockResolvedValue(memberSchool);
    const res = await GET_ONE(req('GET', '/api/school/classes/cls_new'), params('cls_new'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.class.subjectIds).toEqual(['s1', 's2']);
    expect(body.class.lockedSubjectIds).toEqual(['s1']);
    expect(body.class.classSubjectIdBySubject).toEqual({ s1: 'cs1', s2: 'cs2' });
    // Pivot detail for the « Détail des matières » table.
    expect(body.class.classSubjects).toEqual([
      {
        id: 'cs1',
        subjectId: 's1',
        teacherId: 'tea_1',
        coefficient: 4,
        weeklyHours: 5,
        locked: true,
      },
      {
        id: 'cs2',
        subjectId: 's2',
        teacherId: null,
        coefficient: null,
        weeklyHours: null,
        locked: false,
      },
    ]);
    expect(body.class.studentCount).toBe(24);
    expect(body.class.color).toBe('#2563eb');
  });

  it("returns 404 for another school's class", async () => {
    prismaMock.class.findUnique.mockResolvedValue({
      ...createdClass,
      schoolId: 'school_other',
      academicYear: null,
      classSubjects: [],
      _count: { enrollments: 0 },
    } as never);
    const res = await GET_ONE(req('GET', '/api/school/classes/cls_new'), params('cls_new'));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/school/classes/[id]', () => {
  it('updates color + track', async () => {
    prismaMock.class.findUnique.mockResolvedValue(createdClass as never);
    prismaMock.class.update.mockResolvedValue({
      ...createdClass,
      color: '#388e3c',
      track: 'Sciences',
    } as never);
    const res = await PATCH(
      req('PATCH', '/api/school/classes/cls_new', { color: '#388e3c', track: 'Sciences' }),
      params('cls_new'),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.class.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { color: '#388e3c', track: 'Sciences' } }),
    );
  });
});
