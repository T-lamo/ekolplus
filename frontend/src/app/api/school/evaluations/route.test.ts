// POST /api/school/evaluations — qualitative-subject guard. prismaMock
// first (auto-hoists vi.mock for '@/lib/server/prisma'). School route
// preamble: requireAuth → requireSchoolPermission.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, beforeEach, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/server/school-permissions', () => ({
  requireSchoolPermission: vi.fn(),
}));

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { POST } from './route';

const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireSchoolPermission = vi.mocked(requireSchoolPermission);

function req(method: string, url: string, body?: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const body = { classSubjectId: 'cs_1', termId: 'term_1', label: 'Devoir 1' };

beforeEach(() => {
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue({ user: { sub: 'user_1' } } as never);
  mockRequireSchoolPermission.mockResolvedValue({
    ok: true,
    mySchool: { schoolId: 'school_1' },
    response: null,
  } as never);
  prismaMock.term.findUnique.mockResolvedValue({
    id: 'term_1',
    academicYear: { schoolId: 'school_1' },
  } as never);
  prismaMock.evaluation.create.mockResolvedValue({ id: 'eva_new', ...body } as never);
});

describe('POST /api/school/evaluations', () => {
  it('409 SUBJECT_NOT_NUMERIC for a qualitative subject', async () => {
    prismaMock.classSubject.findUnique.mockResolvedValue({
      id: 'cs_1',
      class: { schoolId: 'school_1' },
      subject: { evaluationMode: 'QUALITATIVE' },
    } as never);
    const res = await POST(req('POST', '/api/school/evaluations', body));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: 'SUBJECT_NOT_NUMERIC',
      message: 'Cette matière est évaluée par critères, pas par notes.',
    });
    expect(prismaMock.evaluation.create).not.toHaveBeenCalled();
  });

  it('creates the evaluation for a numeric subject', async () => {
    prismaMock.classSubject.findUnique.mockResolvedValue({
      id: 'cs_1',
      class: { schoolId: 'school_1' },
      subject: { evaluationMode: 'NUMERIC' },
    } as never);
    const res = await POST(req('POST', '/api/school/evaluations', body));
    expect(res.status).toBe(201);
    expect(prismaMock.evaluation.create).toHaveBeenCalled();
  });
});
