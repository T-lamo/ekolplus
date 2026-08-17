// Draft CRUD for the "nouvelle année" rollover wizard.
//
// Pattern: prismaMock first (auto-hoists vi.mock for '@/lib/server/prisma'),
// then mock requireAuth + verifyCsrf + resolveMySchool/resolveActiveAcademicYear
// + getPromotionData so we never hit real JWT/cookie/DB paths. Modeled on
// src/app/api/admin/users/route.test.ts.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return {
    ...actual,
    verifyCsrf: vi.fn(),
  };
});
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return {
    ...actual,
    resolveMySchool: vi.fn(),
    resolveActiveAcademicYear: vi.fn(),
  };
});
// `validateMappingOwnership` is left as the REAL implementation (via
// importActual) so the cross-tenant ownership tests below exercise the
// actual logic against `prismaMock.class.count` / `prismaMock.teacher.count`
// — only `getPromotionData` (a DB read unrelated to what PATCH validates)
// is stubbed.
vi.mock('@/lib/server/academic-year-rollover', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/academic-year-rollover')>(
    '@/lib/server/academic-year-rollover',
  );
  return {
    ...actual,
    getPromotionData: vi.fn(),
  };
});

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool, resolveActiveAcademicYear } from '@/lib/server/school';
import { getPromotionData } from '@/lib/server/academic-year-rollover';
import { GET, POST, PATCH, DELETE } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);
const mockResolveActiveAcademicYear = vi.mocked(resolveActiveAcademicYear);
const mockGetPromotionData = vi.mocked(getPromotionData);

const authUser = { user: { sub: 'user_1', email: 'owner@test.local' } };
const ownerSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'OWNER' as const };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };

const draftRow = {
  id: 'draft_1',
  schoolId: 'school_1',
  newYearLabel: '2026-2027',
  newYearStartDate: new Date('2026-09-01T00:00:00Z'),
  newYearEndDate: new Date('2027-06-30T00:00:00Z'),
  classMapping: {},
  studentExceptions: {},
  createdAt: new Date('2026-08-01T00:00:00Z'),
  updatedAt: new Date('2026-08-01T00:00:00Z'),
  createdBy: 'user_1',
};

function makeReq(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(method !== 'GET' ? { 'x-csrf-token': 'csrf-token' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const URL = 'http://test/api/school/academic-year-rollover';

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(ownerSchool);
  // Default: any destClassId/homeroomTeacherId referenced in a PATCH body
  // belongs to the caller's school (real `validateMappingOwnership` calls
  // through to these). Individual tests override with `.mockResolvedValueOnce(0)`
  // to simulate a cross-tenant reference.
  prismaMock.class.count.mockResolvedValue(1);
  prismaMock.teacher.count.mockResolvedValue(1);
  // GET also returns the school's grade-level catalog; default to none.
  prismaMock.gradeLevel.findMany.mockResolvedValue([]);
  // PATCH's no-demotion rule loads the active year + its classes + the
  // catalog; default to "no active year" so existing PATCH tests are
  // unaffected (the rule is skipped without one).
  mockResolveActiveAcademicYear.mockResolvedValue(null);
  prismaMock.class.findMany.mockResolvedValue([]);
  prismaMock.enrollment.findMany.mockResolvedValue([]);
});

describe('GET /api/school/academic-year-rollover', () => {
  it('non-owner (MEMBER) gets 404', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    const res = await GET(makeReq('GET', URL));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('NOT_FOUND');
    expect(prismaMock.academicYearRolloverDraft.findUnique).not.toHaveBeenCalled();
  });

  it('no school membership gets 404', async () => {
    mockResolveMySchool.mockResolvedValueOnce(null);
    const res = await GET(makeReq('GET', URL));
    expect(res.status).toBe(404);
  });

  it('propagates 401 from requireAuth', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeReq('GET', URL));
    expect(res.status).toBe(401);
    expect(mockResolveMySchool).not.toHaveBeenCalled();
  });

  it('sets x-request-id header on every response', async () => {
    prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(draftRow as never);
    const res = await GET(makeReq('GET', URL));
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('no draft + no active year → 424 NO_ACTIVE_YEAR', async () => {
    prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(null);
    mockResolveActiveAcademicYear.mockResolvedValueOnce(null);
    const res = await GET(makeReq('GET', URL));
    expect(res.status).toBe(424);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('NO_ACTIVE_YEAR');
    expect(mockGetPromotionData).not.toHaveBeenCalled();
  });

  it('no draft + active year → fresh-start payload via getPromotionData', async () => {
    prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(null);
    mockResolveActiveAcademicYear.mockResolvedValueOnce({
      id: 'ay_1',
      label: '2025-2026',
      startDate: new Date('2025-09-01T00:00:00Z'),
    });
    const classes = [{ id: 'c1', name: '6ème A', level: '6ème', studentCount: 2 }];
    const students = [
      {
        id: 's1',
        firstName: 'Awa',
        lastName: 'Diop',
        classId: 'c1',
        enrolledAt: new Date('2025-09-05T00:00:00Z'),
      },
    ];
    mockGetPromotionData.mockResolvedValueOnce({ classes, students });

    const res = await GET(makeReq('GET', URL));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      draft: null;
      activeYear: { id: string; label: string };
      classes: unknown[];
      students: unknown[];
    };
    expect(body.draft).toBeNull();
    expect(body.activeYear).toEqual({ id: 'ay_1', label: '2025-2026' });
    expect(body.classes).toHaveLength(1);
    expect(body.students).toHaveLength(1);
    expect(mockGetPromotionData).toHaveBeenCalledWith('school_1', 'ay_1');
  });

  it('existing draft → returns draft fields alongside activeYear/classes/students', async () => {
    prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(draftRow as never);
    mockResolveActiveAcademicYear.mockResolvedValueOnce({
      id: 'ay_1',
      label: '2025-2026',
      startDate: new Date('2025-09-01T00:00:00Z'),
    });
    const classes = [{ id: 'c1', name: '6ème A', level: '6ème', studentCount: 2 }];
    const students = [
      {
        id: 's1',
        firstName: 'Awa',
        lastName: 'Diop',
        classId: 'c1',
        enrolledAt: new Date('2025-09-05T00:00:00Z'),
      },
    ];
    mockGetPromotionData.mockResolvedValueOnce({ classes, students });

    const res = await GET(makeReq('GET', URL));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      draft: { id: string; newYearLabel: string };
      activeYear: { id: string; label: string };
      classes: unknown[];
      students: unknown[];
    };
    expect(body.draft.id).toBe('draft_1');
    expect(body.draft.newYearLabel).toBe('2026-2027');
    expect(body.activeYear).toEqual({ id: 'ay_1', label: '2025-2026' });
    expect(body.classes).toHaveLength(1);
    expect(body.students).toHaveLength(1);
    expect(mockGetPromotionData).toHaveBeenCalledWith('school_1', 'ay_1');
    expect(mockResolveActiveAcademicYear).toHaveBeenCalledWith('school_1');
  });

  it("includes the school's gradeLevels ordered by `order asc` (id/name/order only)", async () => {
    prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(null);
    mockResolveActiveAcademicYear.mockResolvedValueOnce({
      id: 'ay_1',
      label: '2025-2026',
      startDate: new Date('2025-09-01T00:00:00Z'),
    });
    mockGetPromotionData.mockResolvedValueOnce({ classes: [], students: [] });
    prismaMock.gradeLevel.findMany.mockResolvedValueOnce([
      { id: 'l1', name: '6ème', order: 0 },
      { id: 'l2', name: '5ème', order: 1 },
    ] as never);

    const res = await GET(makeReq('GET', URL));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { gradeLevels: unknown[] };
    expect(body.gradeLevels).toEqual([
      { id: 'l1', name: '6ème', order: 0 },
      { id: 'l2', name: '5ème', order: 1 },
    ]);
    expect(prismaMock.gradeLevel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: 'school_1' },
        orderBy: { order: 'asc' },
        select: { id: true, name: true, order: true },
      }),
    );
  });

  it('existing draft + no active year → 424 NO_ACTIVE_YEAR (activeYear check still applies)', async () => {
    prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(draftRow as never);
    mockResolveActiveAcademicYear.mockResolvedValueOnce(null);
    const res = await GET(makeReq('GET', URL));
    expect(res.status).toBe(424);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('NO_ACTIVE_YEAR');
    expect(mockGetPromotionData).not.toHaveBeenCalled();
  });
});

describe('POST /api/school/academic-year-rollover', () => {
  const validBody = {
    newYearLabel: '2026-2027',
    newYearStartDate: '2026-09-01T00:00:00.000Z',
    newYearEndDate: '2027-06-30T00:00:00.000Z',
  };

  it('missing CSRF header → 403, short-circuits before auth', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    );
    const res = await POST(makeReq('POST', URL, validBody));
    expect(res.status).toBe(403);
    expect(mockRequireAuth).not.toHaveBeenCalled();
    expect(prismaMock.academicYearRolloverDraft.create).not.toHaveBeenCalled();
  });

  it('non-owner gets 404', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    const res = await POST(makeReq('POST', URL, validBody));
    expect(res.status).toBe(404);
  });

  it('invalid body → 400 VALIDATION_FAILED', async () => {
    const res = await POST(makeReq('POST', URL, { newYearLabel: '' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.academicYearRolloverDraft.create).not.toHaveBeenCalled();
  });

  it('creates a draft → 201', async () => {
    prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(null);
    prismaMock.academicYearRolloverDraft.create.mockResolvedValueOnce(draftRow as never);

    const res = await POST(makeReq('POST', URL, validBody));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { draft: { id: string } };
    expect(body.draft.id).toBe('draft_1');
    expect(prismaMock.academicYearRolloverDraft.create).toHaveBeenCalledWith({
      data: {
        schoolId: 'school_1',
        createdBy: 'user_1',
        newYearLabel: validBody.newYearLabel,
        newYearStartDate: new Date(validBody.newYearStartDate),
        newYearEndDate: new Date(validBody.newYearEndDate),
        classMapping: {},
        studentExceptions: {},
      },
    });
  });

  it('draft already exists → 409 DRAFT_EXISTS', async () => {
    prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(draftRow as never);
    const res = await POST(makeReq('POST', URL, validBody));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('DRAFT_EXISTS');
    expect(prismaMock.academicYearRolloverDraft.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/school/academic-year-rollover', () => {
  it('missing CSRF header → 403', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    );
    const res = await PATCH(makeReq('PATCH', URL, { newYearLabel: 'x' }));
    expect(res.status).toBe(403);
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });

  it('non-owner gets 404', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    const res = await PATCH(makeReq('PATCH', URL, { newYearLabel: 'x' }));
    expect(res.status).toBe(404);
  });

  it('no existing draft → 404 DRAFT_NOT_FOUND', async () => {
    prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(null);
    const res = await PATCH(makeReq('PATCH', URL, { newYearLabel: 'x' }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('DRAFT_NOT_FOUND');
    expect(prismaMock.academicYearRolloverDraft.update).not.toHaveBeenCalled();
  });

  it('updates fields → 200 with updated draft', async () => {
    prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(draftRow as never);
    const updated = { ...draftRow, newYearLabel: '2027-2028' };
    prismaMock.academicYearRolloverDraft.update.mockResolvedValueOnce(updated as never);

    const res = await PATCH(makeReq('PATCH', URL, { newYearLabel: '2027-2028' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { draft: { newYearLabel: string } };
    expect(body.draft.newYearLabel).toBe('2027-2028');
    expect(prismaMock.academicYearRolloverDraft.update).toHaveBeenCalledWith({
      where: { schoolId: 'school_1' },
      data: {
        newYearLabel: '2027-2028',
        newYearStartDate: undefined,
        newYearEndDate: undefined,
        classMapping: undefined,
        studentExceptions: undefined,
      },
    });
  });

  it('accepts a well-formed classMapping (existing destClassId)', async () => {
    prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(draftRow as never);
    prismaMock.academicYearRolloverDraft.update.mockResolvedValueOnce(draftRow as never);

    const res = await PATCH(
      makeReq('PATCH', URL, { classMapping: { old_class_1: { destClassId: 'new_class_1' } } }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.academicYearRolloverDraft.update).toHaveBeenCalled();
  });

  it('accepts a classMapping entry marked "Fin de cursus" (unenroll: true)', async () => {
    prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(draftRow as never);
    prismaMock.academicYearRolloverDraft.update.mockResolvedValueOnce(draftRow as never);

    const res = await PATCH(
      makeReq('PATCH', URL, { classMapping: { old_class_1: { unenroll: true } } }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.academicYearRolloverDraft.update).toHaveBeenCalled();
  });

  it('accepts a well-formed classMapping (isNew=true WITH newClass)', async () => {
    prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(draftRow as never);
    prismaMock.academicYearRolloverDraft.update.mockResolvedValueOnce(draftRow as never);

    const res = await PATCH(
      makeReq('PATCH', URL, {
        classMapping: {
          old_class_1: { isNew: true, newClass: { name: '5ème A', level: '5ème' } },
        },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('rejects a malformed classMapping entry (isNew=true, no newClass) → 400 VALIDATION_FAILED', async () => {
    const res = await PATCH(
      makeReq('PATCH', URL, { classMapping: { old_class_1: { isNew: true } } }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.academicYearRolloverDraft.update).not.toHaveBeenCalled();
  });

  it('invalid body (bad datetime) → 400 VALIDATION_FAILED', async () => {
    const res = await PATCH(makeReq('PATCH', URL, { newYearStartDate: 'not-a-date' }));
    expect(res.status).toBe(400);
  });

  // Fix 1 (CRITICAL) — cross-tenant ownership validation. A malicious OWNER
  // of school A must not be able to point a destClassId/homeroomTeacherId
  // at school B's rows via this autosave endpoint.
  describe('no-demotion rule (DEMOTION_NOT_ALLOWED)', () => {
    const activeYear = { id: 'ay_1', label: '2025-2026', startDate: new Date('2025-09-01') };
    const catalog = [
      { name: '6ème', order: 0 },
      { name: '5ème', order: 1 },
      { name: '4ème', order: 2 },
      { name: '3ème', order: 3 },
    ];
    const yearClasses = [
      { id: 'c6', name: '6ème A', level: '6ème' },
      { id: 'c5', name: '5ème A', level: '5ème' },
      { id: 'c3', name: '3ème A', level: '3ème' },
    ];

    beforeEach(() => {
      mockResolveActiveAcademicYear.mockResolvedValue(activeYear);
      prismaMock.gradeLevel.findMany.mockResolvedValue(catalog as never);
      prismaMock.class.findMany.mockResolvedValue(yearClasses as never);
      prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValue(draftRow as never);
      prismaMock.academicYearRolloverDraft.update.mockResolvedValue(draftRow as never);
    });

    it('a class mapped to a LOWER level → 400 DEMOTION_NOT_ALLOWED, draft untouched', async () => {
      const res = await PATCH(
        makeReq('PATCH', URL, { classMapping: { c3: { destClassId: 'c5' } } }),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe('DEMOTION_NOT_ALLOWED');
      expect(body.message).toContain('3ème A');
      expect(body.message).toContain('5ème A');
      expect(prismaMock.academicYearRolloverDraft.update).not.toHaveBeenCalled();
    });

    it('promotion, repeat year and Fin de cursus are accepted', async () => {
      const res = await PATCH(
        makeReq('PATCH', URL, {
          classMapping: {
            c6: { destClassId: 'c5' }, // promotion
            c5: { destClassId: 'c5' }, // repeat
            c3: { unenroll: true }, // fin de cursus
          },
        }),
      );
      expect(res.status).toBe(200);
    });

    it('a student exception sent below their current level → 400 DEMOTION_NOT_ALLOWED', async () => {
      prismaMock.enrollment.findMany.mockResolvedValue([
        { studentId: 's1', classId: 'c3' },
      ] as never);
      const res = await PATCH(
        makeReq('PATCH', URL, { studentExceptions: { s1: { destClassId: 'c5' } } }),
      );
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('DEMOTION_NOT_ALLOWED');
    });

    it('rule is skipped when levels are not in the catalog', async () => {
      prismaMock.gradeLevel.findMany.mockResolvedValue([] as never);
      const res = await PATCH(
        makeReq('PATCH', URL, { classMapping: { c3: { destClassId: 'c5' } } }),
      );
      expect(res.status).toBe(200);
    });
  });

  describe('cross-tenant ownership validation', () => {
    it('destClassId belonging to another school is rejected → 400 VALIDATION_FAILED', async () => {
      prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(draftRow as never);
      prismaMock.class.count.mockResolvedValueOnce(0); // not found under this school

      const res = await PATCH(
        makeReq('PATCH', URL, {
          classMapping: { old_class_1: { destClassId: 'other_school_class' } },
        }),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(prismaMock.class.count).toHaveBeenCalledWith({
        where: { id: { in: ['other_school_class'] }, schoolId: 'school_1' },
      });
      expect(prismaMock.academicYearRolloverDraft.update).not.toHaveBeenCalled();
    });

    it('destClassId in a studentExceptions entry belonging to another school is rejected', async () => {
      prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(draftRow as never);
      prismaMock.class.count.mockResolvedValueOnce(0);

      const res = await PATCH(
        makeReq('PATCH', URL, {
          studentExceptions: { student_1: { destClassId: 'other_school_class' } },
        }),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(prismaMock.academicYearRolloverDraft.update).not.toHaveBeenCalled();
    });

    it('homeroomTeacherId belonging to another school is rejected → 400 VALIDATION_FAILED', async () => {
      prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(draftRow as never);
      prismaMock.teacher.count.mockResolvedValueOnce(0);

      const res = await PATCH(
        makeReq('PATCH', URL, {
          classMapping: {
            old_class_1: {
              isNew: true,
              newClass: {
                name: '5ème A',
                level: '5ème',
                homeroomTeacherId: 'other_school_teacher',
              },
            },
          },
        }),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(prismaMock.teacher.count).toHaveBeenCalledWith({
        where: { id: { in: ['other_school_teacher'] }, schoolId: 'school_1' },
      });
      expect(prismaMock.academicYearRolloverDraft.update).not.toHaveBeenCalled();
    });

    it('valid same-school destClassId and homeroomTeacherId still pass → 200', async () => {
      prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(draftRow as never);
      prismaMock.academicYearRolloverDraft.update.mockResolvedValueOnce(draftRow as never);

      const res = await PATCH(
        makeReq('PATCH', URL, {
          classMapping: {
            old_class_1: { destClassId: 'same_school_class' },
            old_class_2: {
              isNew: true,
              newClass: {
                name: '5ème B',
                level: '5ème',
                homeroomTeacherId: 'same_school_teacher',
              },
            },
          },
        }),
      );
      expect(res.status).toBe(200);
      expect(prismaMock.class.count).toHaveBeenCalledWith({
        where: { id: { in: ['same_school_class'] }, schoolId: 'school_1' },
      });
      expect(prismaMock.teacher.count).toHaveBeenCalledWith({
        where: { id: { in: ['same_school_teacher'] }, schoolId: 'school_1' },
      });
      expect(prismaMock.academicYearRolloverDraft.update).toHaveBeenCalled();
    });

    it('no destClassId/homeroomTeacherId referenced → skips both count queries entirely', async () => {
      prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(draftRow as never);
      prismaMock.academicYearRolloverDraft.update.mockResolvedValueOnce(draftRow as never);

      const res = await PATCH(makeReq('PATCH', URL, { newYearLabel: '2027-2028' }));
      expect(res.status).toBe(200);
      expect(prismaMock.class.count).not.toHaveBeenCalled();
      expect(prismaMock.teacher.count).not.toHaveBeenCalled();
    });
  });
});

describe('DELETE /api/school/academic-year-rollover', () => {
  it('missing CSRF header → 403', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    );
    const res = await DELETE(makeReq('DELETE', URL));
    expect(res.status).toBe(403);
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });

  it('non-owner gets 404', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    const res = await DELETE(makeReq('DELETE', URL));
    expect(res.status).toBe(404);
  });

  it('no existing draft → 404 DRAFT_NOT_FOUND', async () => {
    prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(null);
    const res = await DELETE(makeReq('DELETE', URL));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('DRAFT_NOT_FOUND');
    expect(prismaMock.academicYearRolloverDraft.delete).not.toHaveBeenCalled();
  });

  it('deletes the draft → 200 ok:true', async () => {
    prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(draftRow as never);
    prismaMock.academicYearRolloverDraft.delete.mockResolvedValueOnce(draftRow as never);

    const res = await DELETE(makeReq('DELETE', URL));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(prismaMock.academicYearRolloverDraft.delete).toHaveBeenCalledWith({
      where: { schoolId: 'school_1' },
    });
  });
});
