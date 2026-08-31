// Tests for GET + PATCH /api/auth/me (AUTH-06 + self-service profile/theme).
// Pattern 14. requireAuth-gated. Note: requireAuth uses cookies() from
// next/headers internally, so tests must use mockNextCookies + prismaMock.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';

mockNextCookies();

vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return {
    ...actual,
    verifyToken: vi.fn(),
  };
});
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return {
    ...actual,
    resolveMySchoolIncludingTeacher: vi.fn(),
    resolveMyTeacherProfile: vi.fn(),
    resolveMyStudentProfile: vi.fn(),
  };
});

import { verifyToken } from '@/lib/server/auth';
import {
  resolveMySchoolIncludingTeacher,
  resolveMyTeacherProfile,
  resolveMyStudentProfile,
} from '@/lib/server/school';
import { GET, PATCH } from './route';
import { NextRequest } from 'next/server';

const mockResolveMySchoolIncludingTeacher = vi.mocked(resolveMySchoolIncludingTeacher);
const mockResolveMyTeacherProfile = vi.mocked(resolveMyTeacherProfile);
const mockResolveMyStudentProfile = vi.mocked(resolveMyStudentProfile);

function makeReq(opts: { tokenCookie?: string; bearer?: string } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  return new NextRequest('https://test/api/auth/me', {
    method: 'GET',
    headers,
  });
}

// Bearer-header pattern already used by the other GET tests in this file.
function reqWithAuthHeader(): NextRequest {
  return makeReq({ bearer: 'valid-access-token' });
}

beforeEach(() => {
  __cookieStore.clear();
  vi.mocked(verifyToken).mockReset();
});

describe('GET /api/auth/me', () => {
  it('Test 1: authed — returns user identity', async () => {
    // Place token cookie via mock store; requireAuth reads it via cookies().
    __cookieStore.clear();
    // Fake cookies.set: use mockStore via the mock-cookies internal store.
    // Simpler: test injects directly through Bearer header path which
    // requireAuth supports as a fallback when no cookie is present.
    vi.mocked(verifyToken).mockResolvedValue({
      sub: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
    } as never);

    const res = await GET(makeReq({ bearer: 'valid-access-token' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      user: { sub: 'u1', email: 'a@b.com' },
    });
  });

  it('Test 2: no cookie + no bearer — 401 missing token', async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Missing token|token/i);
  });

  it('Test 3: stale tokenVersion — 401', async () => {
    vi.mocked(verifyToken).mockResolvedValue({
      sub: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 1, // bumped via change-password
    } as never);

    const res = await GET(makeReq({ bearer: 'stale-jwt' }));
    expect(res.status).toBe(401);
  });

  it('Test 4: deleted user — 401', async () => {
    vi.mocked(verifyToken).mockResolvedValue({
      sub: 'u-deleted',
      email: 'gone@b.com',
      tokenVersion: 0,
    });
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await GET(makeReq({ bearer: 'orphan-jwt' }));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me — isTeacherOnly (Espace Enseignant Phase 1)', () => {
  beforeEach(() => {
    // These two mocks are module-scoped (created once by vi.mock() above)
    // and are never reset by the file-level beforeEach, so a prior test's
    // call history would otherwise leak into this describe's
    // not.toHaveBeenCalled() assertion — clear call history only (each
    // test below sets its own .mockResolvedValue after this runs).
    mockResolveMySchoolIncludingTeacher.mockClear();
    mockResolveMyTeacherProfile.mockClear();
    vi.mocked(verifyToken).mockResolvedValue({
      sub: 'user_1',
      email: 'teach@school.test',
      tokenVersion: 0,
    });
    // requireAuth() re-reads the user via prisma.user.findUnique to check
    // tokenVersion — this "once" satisfies THAT call. The route handler's
    // own richer `dbUser` query is the *second* call to the same mock and
    // falls through to whatever `.mockResolvedValue` a given test below
    // configures (or stays unconfigured — isTeacherOnly never reads dbUser).
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user_1',
      email: 'teach@school.test',
      tokenVersion: 0,
    } as never);
  });

  it('reports isTeacherOnly=true for a MEMBER-role teacher-linked account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'teach@school.test',
      role: 'USER',
    } as never);
    mockResolveMySchoolIncludingTeacher.mockResolvedValue({
      organizationId: 'org_1',
      schoolId: 'school_1',
      role: 'MEMBER',
    });
    mockResolveMyTeacherProfile.mockResolvedValue({
      teacherId: 't1',
      classSubjectIds: [],
      homeroomClassIds: [],
    });
    const res = await GET(reqWithAuthHeader());
    expect((await res.json()).user.isTeacherOnly).toBe(true);
  });

  it('reports isTeacherOnly=false for an admin who is also teacher-linked', async () => {
    mockResolveMySchoolIncludingTeacher.mockResolvedValue({
      organizationId: 'org_1',
      schoolId: 'school_1',
      role: 'ADMIN',
    });
    mockResolveMyTeacherProfile.mockResolvedValue({
      teacherId: 't1',
      classSubjectIds: [],
      homeroomClassIds: [],
    });
    const res = await GET(reqWithAuthHeader());
    expect((await res.json()).user.isTeacherOnly).toBe(false);
    // Perf short-circuit: the `mySchool?.role === 'MEMBER' ? ... : null`
    // guard in route.ts must skip the Teacher lookup entirely for a
    // non-MEMBER role — regression-guards against it being reverted to an
    // unconditional call.
    expect(mockResolveMyTeacherProfile).not.toHaveBeenCalled();
  });

  it('reports isTeacherOnly=false for a plain staff account', async () => {
    mockResolveMySchoolIncludingTeacher.mockResolvedValue({
      organizationId: 'org_1',
      schoolId: 'school_1',
      role: 'MEMBER',
    });
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    const res = await GET(reqWithAuthHeader());
    expect((await res.json()).user.isTeacherOnly).toBe(false);
  });
});

describe('GET /api/auth/me — isStudentOnly (Espace Élève Phase 1)', () => {
  beforeEach(() => {
    // Same rationale as the isTeacherOnly describe above: this mock is
    // module-scoped and never reset by the file-level beforeEach, so clear
    // call history only (each test below sets its own .mockResolvedValue).
    mockResolveMyStudentProfile.mockClear();
    // A genuine student account holds no OrganizationMember row by design, so
    // the org lookup resolves null. Set it explicitly: this mock is
    // module-scoped and would otherwise carry over whatever the isTeacherOnly
    // describe above left configured.
    mockResolveMySchoolIncludingTeacher.mockClear();
    mockResolveMySchoolIncludingTeacher.mockResolvedValue(null);
    vi.mocked(verifyToken).mockResolvedValue({
      sub: 'user_1',
      email: 'student@school.test',
      tokenVersion: 0,
    });
    // requireAuth()'s internal tokenVersion re-check — the route handler's
    // own richer `dbUser` query is the *second* call to the same mock and
    // falls through to whatever a given test below configures.
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user_1',
      email: 'student@school.test',
      tokenVersion: 0,
    } as never);
  });

  it('reports isStudentOnly=true for a student-linked account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'student@school.test',
      role: 'USER',
    } as never);
    mockResolveMyStudentProfile.mockResolvedValue({
      studentId: 's1',
      schoolId: 'school_1',
      classId: 'class_1',
      academicYearId: 'year_1',
    });
    const res = await GET(reqWithAuthHeader());
    expect((await res.json()).user.isStudentOnly).toBe(true);
  });

  it('reports isStudentOnly=false for a plain staff account', async () => {
    mockResolveMyStudentProfile.mockResolvedValue(null);
    const res = await GET(reqWithAuthHeader());
    expect((await res.json()).user.isStudentOnly).toBe(false);
  });

  it('reports isStudentOnly=false for an ADMIN account even with a linked student profile', async () => {
    // Not reachable today via createPortalInvite (it refuses to link a
    // Student to an account that already has a passwordHash, which every
    // admin/staff account has), but this documents and enforces the
    // platform-role gate as defense in depth for Task 10's redirect logic.
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'admin@school.test',
      role: 'ADMIN',
    } as never);
    mockResolveMyStudentProfile.mockResolvedValue({
      studentId: 's1',
      schoolId: 'school_1',
      classId: 'class_1',
      academicYearId: 'year_1',
    });
    const res = await GET(reqWithAuthHeader());
    expect((await res.json()).user.isStudentOnly).toBe(false);
  });

  it('reports isStudentOnly=false when the account holds an org membership', async () => {
    // The OAuth edge the User.role check alone misses: a Google account has
    // no passwordHash, so createPortalInvite's passwordHash guard would not
    // stop a school director who is also a guardian from being linked to a
    // Student row, and their platform role can still be a plain USER. Holding
    // an OrganizationMember row (which a real student never does) is the
    // second gate.
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'director@school.test',
      role: 'USER',
    } as never);
    mockResolveMySchoolIncludingTeacher.mockResolvedValue({
      organizationId: 'org_1',
      schoolId: 'school_1',
      role: 'ADMIN',
    });
    mockResolveMyStudentProfile.mockResolvedValue({
      studentId: 's1',
      schoolId: 'school_1',
      classId: 'class_1',
      academicYearId: 'year_1',
    });
    const res = await GET(reqWithAuthHeader());
    expect((await res.json()).user.isStudentOnly).toBe(false);
  });
});

// PATCH — theme preference (Paramètres › Apparence). Only known keys are
// stored; null resets to the default; anything else is a 400 so a garbage
// value can never reach the DB (the client would not know how to render it).
function makePatch(body: unknown): NextRequest {
  return new NextRequest('https://test/api/auth/me', {
    method: 'PATCH',
    headers: {
      authorization: 'Bearer valid-access-token',
      'content-type': 'application/json',
      // verifyCsrf: header present, no csrf cookie in the test store → passes.
      'x-csrf-token': 'test-csrf',
    },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/auth/me — theme', () => {
  beforeEach(() => {
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'u1', email: 'a@b.com', tokenVersion: 0 });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
    } as never);
    prismaMock.user.update.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: null,
      avatarUrl: null,
      phone: null,
      theme: 'ocean',
    } as never);
  });

  it('stores a known theme key', async () => {
    const res = await PATCH(makePatch({ theme: 'ocean' }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: { theme: 'ocean' } }),
    );
    expect(await res.json()).toMatchObject({ user: { theme: 'ocean' } });
  });

  it('null resets to the default theme', async () => {
    const res = await PATCH(makePatch({ theme: null }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { theme: null } }),
    );
  });

  it('rejects an unknown theme key (400) without touching the DB', async () => {
    const res = await PATCH(makePatch({ theme: 'dark' }));
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe('GET /api/auth/me — theme', () => {
  it('exposes the stored theme, normalising unknown legacy values to null', async () => {
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'u1', email: 'a@b.com', tokenVersion: 0 });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
      theme: 'foret',
    } as never);
    let res = await GET(makeReq({ bearer: 'valid-access-token' }));
    expect(await res.json()).toMatchObject({ user: { theme: 'foret' } });

    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
      theme: 'legacy-value',
    } as never);
    res = await GET(makeReq({ bearer: 'valid-access-token' }));
    expect(await res.json()).toMatchObject({ user: { theme: null } });
  });
});

// PATCH — UI language (Paramètres › Langue). Same contract as `theme`:
// only a known key is stored, null resets to French, anything else 400s.
describe('PATCH /api/auth/me — locale', () => {
  beforeEach(() => {
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'u1', email: 'a@b.com', tokenVersion: 0 });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
    } as never);
    prismaMock.user.update.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: null,
      avatarUrl: null,
      phone: null,
      theme: null,
      locale: 'ht',
    } as never);
  });

  it('stores a known locale key', async () => {
    const res = await PATCH(makePatch({ locale: 'ht' }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: { locale: 'ht' } }),
    );
    expect(await res.json()).toMatchObject({ user: { locale: 'ht' } });
  });

  it('null resets to the default (French)', async () => {
    const res = await PATCH(makePatch({ locale: null }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { locale: null } }),
    );
  });

  it('rejects an unknown locale key (400) without touching the DB', async () => {
    const res = await PATCH(makePatch({ locale: 'es' }));
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe('GET /api/auth/me — locale', () => {
  it('exposes the stored locale, normalising unknown legacy values to null', async () => {
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'u1', email: 'a@b.com', tokenVersion: 0 });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
      locale: 'en',
    } as never);
    let res = await GET(makeReq({ bearer: 'valid-access-token' }));
    expect(await res.json()).toMatchObject({ user: { locale: 'en' } });

    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
      locale: 'legacy-value',
    } as never);
    res = await GET(makeReq({ bearer: 'valid-access-token' }));
    expect(await res.json()).toMatchObject({ user: { locale: null } });
  });
});
