import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchool: vi.fn() };
});
import { resolveMySchool } from '@/lib/server/school';
import { requireSchoolPermission, resolveMyGrants } from './school-permissions';

const mockResolve = vi.mocked(resolveMySchool);
const school = { organizationId: 'org1', schoolId: 'sch1', role: 'MEMBER' as const };

beforeEach(() => vi.clearAllMocks());

describe('resolveMyGrants', () => {
  it('returns null when the caller has no school', async () => {
    mockResolve.mockResolvedValueOnce(null);
    expect(await resolveMyGrants('u1')).toBeNull();
  });
  it('OWNER and ADMIN get ALL without a member query', async () => {
    mockResolve.mockResolvedValueOnce({ ...school, role: 'ADMIN' });
    const r = await resolveMyGrants('u1');
    expect(r?.grants).toBe('ALL');
    expect(prismaMock.organizationMember.findFirst).not.toHaveBeenCalled();
  });
  it('MEMBER with a staff role gets its sanitized grants', async () => {
    mockResolve.mockResolvedValueOnce(school);
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      staffRole: { grants: ['eleves.view', 'not-a-grant'] },
    } as never);
    const r = await resolveMyGrants('u1');
    expect(r?.grants).toEqual(new Set(['eleves.view']));
  });
  it('MEMBER without a staff role gets an empty set (deny by default)', async () => {
    mockResolve.mockResolvedValueOnce(school);
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({ staffRole: null } as never);
    const r = await resolveMyGrants('u1');
    expect(r?.grants).toEqual(new Set());
  });
});

describe('requireSchoolPermission', () => {
  it('404 NO_SCHOOL when resolveMySchool is null', async () => {
    mockResolve.mockResolvedValueOnce(null);
    const r = await requireSchoolPermission('u1', 'eleves', 'view', 'req1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response).toBeInstanceOf(NextResponse);
      expect(r.response.status).toBe(404);
      expect((await r.response.json()).error).toBe('NO_SCHOOL');
    }
  });
  it('403 PERMISSION_DENIED for a MEMBER without the grant', async () => {
    mockResolve.mockResolvedValueOnce(school);
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      staffRole: { grants: ['notes.view'] },
    } as never);
    const r = await requireSchoolPermission('u1', 'eleves', 'view', 'req1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      expect((await r.response.json()).error).toBe('PERMISSION_DENIED');
    }
  });
  it('passes through for a MEMBER holding the grant', async () => {
    mockResolve.mockResolvedValueOnce(school);
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      staffRole: { grants: ['eleves.view'] },
    } as never);
    const r = await requireSchoolPermission('u1', 'eleves', 'view', 'req1');
    expect(r).toEqual({ ok: true, mySchool: school });
  });
  it('passes through for OWNER regardless of grants', async () => {
    mockResolve.mockResolvedValueOnce({ ...school, role: 'OWNER' });
    const r = await requireSchoolPermission('u1', 'paiements', 'delete', 'req1');
    expect(r.ok).toBe(true);
  });
});
