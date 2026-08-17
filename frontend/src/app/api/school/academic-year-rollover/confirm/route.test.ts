// Atomic confirm for the "nouvelle année" rollover wizard.
//
// Pattern: prismaMock first (auto-hoists vi.mock for '@/lib/server/prisma'),
// then mock requireAuth + verifyCsrf + resolveMySchool/resolveActiveAcademicYear
// + school-danger-zone (confirmNameMatches/enforceDangerZoneRateLimit) +
// executeRollover/getPromotionData/computeStats + logAdminAction so we never
// hit real JWT/cookie/DB/Redis paths. Modeled on the sibling draft-CRUD
// route's test (../route.test.ts) and on admin/users/route.test.ts's
// $transaction passthrough mock.
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
vi.mock('@/lib/server/school-danger-zone', () => ({
  confirmNameMatches: vi.fn(),
  enforceDangerZoneRateLimit: vi.fn(),
}));
// `validateMappingOwnership` is left as the REAL implementation (via
// importActual) so the cross-tenant ownership tests below (Fix 1, layer 2 —
// defense in depth right before the irreversible commit) exercise the
// actual logic against `prismaMock.class.count` / `prismaMock.teacher.count`.
vi.mock('@/lib/server/academic-year-rollover', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/academic-year-rollover')>(
    '@/lib/server/academic-year-rollover',
  );
  return {
    ...actual,
    executeRollover: vi.fn(),
    getPromotionData: vi.fn(),
    computeStats: vi.fn(),
  };
});
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool, resolveActiveAcademicYear } from '@/lib/server/school';
import { confirmNameMatches, enforceDangerZoneRateLimit } from '@/lib/server/school-danger-zone';
import {
  executeRollover,
  getPromotionData,
  computeStats,
} from '@/lib/server/academic-year-rollover';
import { logAdminAction } from '@/lib/server/admin/audit';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);
const mockResolveActiveAcademicYear = vi.mocked(resolveActiveAcademicYear);
const mockConfirmNameMatches = vi.mocked(confirmNameMatches);
const mockEnforceDangerZoneRateLimit = vi.mocked(enforceDangerZoneRateLimit);
const mockExecuteRollover = vi.mocked(executeRollover);
const mockGetPromotionData = vi.mocked(getPromotionData);
const mockComputeStats = vi.mocked(computeStats);
const mockLogAdminAction = vi.mocked(logAdminAction);

const authUser = { user: { sub: 'user_1', email: 'owner@test.local' } };
const ownerSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'OWNER' as const };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };

const schoolRow = { id: 'school_1', name: 'École Awa Diop' };

const draftRow = {
  id: 'draft_1',
  schoolId: 'school_1',
  newYearLabel: '2026-2027',
  newYearStartDate: new Date('2026-09-01T00:00:00Z'),
  newYearEndDate: new Date('2027-06-30T00:00:00Z'),
  classMapping: { old_class_1: { destClassId: 'new_class_1' } },
  studentExceptions: {},
  createdAt: new Date('2026-08-01T00:00:00Z'),
  updatedAt: new Date('2026-08-01T00:00:00Z'),
  createdBy: 'user_1',
};

const activeYearRow = {
  id: 'ay_old',
  label: '2025-2026',
  startDate: new Date('2025-09-01T00:00:00Z'),
};

function makeReq(body?: unknown): NextRequest {
  return new NextRequest('http://test/api/school/academic-year-rollover/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-token' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const validBody = { confirmName: 'École Awa Diop' };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(ownerSchool);
  mockEnforceDangerZoneRateLimit.mockResolvedValue(null);
  mockConfirmNameMatches.mockImplementation(
    (schoolName: string, confirmName: unknown) =>
      typeof confirmName === 'string' && confirmName.trim() === schoolName,
  );
  prismaMock.school.findUniqueOrThrow.mockResolvedValue(schoolRow as never);
  prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValue(draftRow as never);
  mockResolveActiveAcademicYear.mockResolvedValue(activeYearRow);
  // Fix 1 (layer 2) — ownership check defaults: draftRow's classMapping
  // references belong to this school.
  prismaMock.class.count.mockResolvedValue(1);
  prismaMock.teacher.count.mockResolvedValue(1);
  // Fix 6 — stale-mapping check default: the active year's only current
  // class is the one draftRow.classMapping already maps (old_class_1).
  prismaMock.class.findMany.mockResolvedValue([{ id: 'old_class_1' }] as never);
  // No-demotion rule: no catalog by default → rule cannot apply.
  prismaMock.gradeLevel.findMany.mockResolvedValue([]);
  prismaMock.enrollment.findMany.mockResolvedValue([]);
  mockGetPromotionData.mockResolvedValue({ classes: [], students: [] });
  mockComputeStats.mockReturnValue({ promoted: 3, exceptions: 1, unenrolled: 0 });
  mockExecuteRollover.mockResolvedValue({ newAcademicYearId: 'ay_new' });
  prismaMock.academicYearRolloverDraft.delete.mockResolvedValue(draftRow as never);
  // Default $transaction passthrough — runs the callback against the prismaMock.
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('POST /api/school/academic-year-rollover/confirm', () => {
  it('missing CSRF header → 403, short-circuits before auth', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    );
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(403);
    expect(mockRequireAuth).not.toHaveBeenCalled();
    expect(mockExecuteRollover).not.toHaveBeenCalled();
  });

  it('non-owner (MEMBER) gets 404', async () => {
    mockResolveMySchool.mockResolvedValueOnce(memberSchool);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('NOT_FOUND');
    expect(mockExecuteRollover).not.toHaveBeenCalled();
  });

  it('no school membership gets 404', async () => {
    mockResolveMySchool.mockResolvedValueOnce(null);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(404);
  });

  it('rate limit exceeded → propagates the 429 from enforceDangerZoneRateLimit', async () => {
    mockEnforceDangerZoneRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(429);
    expect(mockResolveMySchool).not.toHaveBeenCalled();
    expect(mockExecuteRollover).not.toHaveBeenCalled();
  });

  it('invalid body → 400 VALIDATION_FAILED', async () => {
    const res = await POST(makeReq({ confirmName: '' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(mockExecuteRollover).not.toHaveBeenCalled();
  });

  it('wrong confirm name → 400 CONFIRM_NAME_MISMATCH', async () => {
    const res = await POST(makeReq({ confirmName: 'Wrong School Name' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('CONFIRM_NAME_MISMATCH');
    expect(mockExecuteRollover).not.toHaveBeenCalled();
  });

  it('no draft → 404 NO_DRAFT', async () => {
    prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('NO_DRAFT');
    expect(mockExecuteRollover).not.toHaveBeenCalled();
  });

  it('no active year → 424 NO_ACTIVE_YEAR', async () => {
    mockResolveActiveAcademicYear.mockResolvedValueOnce(null);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(424);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('NO_ACTIVE_YEAR');
    expect(mockExecuteRollover).not.toHaveBeenCalled();
  });

  it('sets x-request-id header on every response', async () => {
    const res = await POST(makeReq(validBody));
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('happy path → 201, executes rollover + deletes draft + logs audit action, all inside the transaction', async () => {
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { newAcademicYearId: string };
    expect(body.newAcademicYearId).toBe('ay_new');

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

    expect(mockExecuteRollover).toHaveBeenCalledWith(prismaMock, 'school_1', 'ay_old', {
      newYearLabel: draftRow.newYearLabel,
      newYearStartDate: draftRow.newYearStartDate,
      newYearEndDate: draftRow.newYearEndDate,
      classMapping: draftRow.classMapping,
      studentExceptions: draftRow.studentExceptions,
    });

    expect(prismaMock.academicYearRolloverDraft.delete).toHaveBeenCalledWith({
      where: { schoolId: 'school_1' },
    });

    // Fix 9 — audit-log stats are computed INSIDE the transaction, using
    // `tx` (== prismaMock here, per the $transaction passthrough mock
    // above), not the top-level `prisma` client.
    expect(mockGetPromotionData).toHaveBeenCalledWith('school_1', 'ay_old', prismaMock);

    expect(mockLogAdminAction).toHaveBeenCalledWith(prismaMock, {
      actorId: 'user_1',
      action: 'school.rollover_year',
      targetType: 'School',
      targetId: 'school_1',
      metadata: {
        oldAcademicYearId: 'ay_old',
        newAcademicYearId: 'ay_new',
        newYearLabel: draftRow.newYearLabel,
        promotedCount: 3,
        exceptionsCount: 1,
        unenrolledCount: 0,
      },
    });
  });

  // Fix 1 (CRITICAL, layer 2) — defense in depth: re-check ownership of the
  // draft's *stored* classMapping/studentExceptions right before the
  // irreversible commit, in case a draft was ever written before the PATCH
  // route's own validation existed (or that check had a gap).
  describe('cross-tenant ownership validation (defense in depth)', () => {
    it('destClassId belonging to another school is rejected → 400 INVALID_MAPPING', async () => {
      prismaMock.class.count.mockResolvedValueOnce(0); // not found under this school

      const res = await POST(makeReq(validBody));
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('INVALID_MAPPING');
      expect(prismaMock.class.count).toHaveBeenCalledWith({
        where: { id: { in: ['new_class_1'] }, schoolId: 'school_1' },
      });
      expect(mockExecuteRollover).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('homeroomTeacherId belonging to another school is rejected → 400 INVALID_MAPPING', async () => {
      const draftWithTeacher = {
        ...draftRow,
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
      };
      prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValueOnce(
        draftWithTeacher as never,
      );
      prismaMock.teacher.count.mockResolvedValueOnce(0);

      const res = await POST(makeReq(validBody));
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('INVALID_MAPPING');
      expect(prismaMock.teacher.count).toHaveBeenCalledWith({
        where: { id: { in: ['other_school_teacher'] }, schoolId: 'school_1' },
      });
      expect(mockExecuteRollover).not.toHaveBeenCalled();
    });

    it('valid same-school destClassId still passes the ownership check', async () => {
      const res = await POST(makeReq(validBody));
      expect(res.status).toBe(201);
      expect(prismaMock.class.count).toHaveBeenCalledWith({
        where: { id: { in: ['new_class_1'] }, schoolId: 'school_1' },
      });
      expect(mockExecuteRollover).toHaveBeenCalled();
    });
  });

  // Fix 6 (IMPORTANT) — TOCTOU guard: a class created in the active year
  // after the draft was last saved has no mapping entry. Without this
  // check, its students would be silently dropped with no error.
  describe('stale-mapping validation (Fix 6)', () => {
    it('a current class with no mapping entry → 400 MAPPING_STALE, no transaction entered', async () => {
      // old_class_2 exists in the active year but has no entry in
      // draftRow.classMapping (which only maps old_class_1).
      prismaMock.class.findMany.mockResolvedValueOnce([
        { id: 'old_class_1' },
        { id: 'old_class_2' },
      ] as never);

      const res = await POST(makeReq(validBody));
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('MAPPING_STALE');
      expect(mockExecuteRollover).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('every current class has a mapping entry → proceeds past the stale check', async () => {
      prismaMock.class.findMany.mockResolvedValueOnce([{ id: 'old_class_1' }] as never);

      const res = await POST(makeReq(validBody));
      expect(res.status).toBe(201);
      expect(mockExecuteRollover).toHaveBeenCalled();
    });

    it('a class marked « Fin de cursus » (unenroll: true) counts as decided — no MAPPING_STALE', async () => {
      prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValue({
        ...draftRow,
        classMapping: {
          old_class_1: { destClassId: 'new_class_1' },
          old_class_2: { unenroll: true },
        },
      } as never);
      prismaMock.class.findMany.mockResolvedValueOnce([
        { id: 'old_class_1' },
        { id: 'old_class_2' },
      ] as never);

      const res = await POST(makeReq(validBody));
      expect(res.status).toBe(201);
      expect(mockExecuteRollover).toHaveBeenCalled();
    });
  });

  describe('no-demotion rule (defense in depth)', () => {
    const catalog = [
      { name: '5ème', order: 0 },
      { name: '3ème', order: 1 },
    ];

    it('a draft mapping a class to a LOWER level → 400 DEMOTION_NOT_ALLOWED, no transaction', async () => {
      prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValue({
        ...draftRow,
        classMapping: { c3: { destClassId: 'c5' } },
      } as never);
      prismaMock.class.findMany.mockResolvedValueOnce([
        { id: 'c3', name: '3ème A', level: '3ème' },
        { id: 'c5', name: '5ème A', level: '5ème' },
      ] as never);
      prismaMock.gradeLevel.findMany.mockResolvedValue(catalog as never);
      // c5 has no mapping — give it one so the stale guard passes.
      prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValue({
        ...draftRow,
        classMapping: { c3: { destClassId: 'c5' }, c5: { unenroll: true } },
      } as never);

      const res = await POST(makeReq(validBody));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('DEMOTION_NOT_ALLOWED');
      expect(mockExecuteRollover).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('promotion + fin de cursus pass the rule', async () => {
      prismaMock.academicYearRolloverDraft.findUnique.mockResolvedValue({
        ...draftRow,
        classMapping: { c5: { destClassId: 'c3' }, c3: { unenroll: true } },
      } as never);
      prismaMock.class.findMany.mockResolvedValueOnce([
        { id: 'c3', name: '3ème A', level: '3ème' },
        { id: 'c5', name: '5ème A', level: '5ème' },
      ] as never);
      prismaMock.gradeLevel.findMany.mockResolvedValue(catalog as never);

      const res = await POST(makeReq(validBody));
      expect(res.status).toBe(201);
    });
  });
});
