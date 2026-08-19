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

import { verifyToken } from '@/lib/server/auth';
import { GET, PATCH } from './route';
import { NextRequest } from 'next/server';

function makeReq(opts: { tokenCookie?: string; bearer?: string } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  return new NextRequest('https://test/api/auth/me', {
    method: 'GET',
    headers,
  });
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
