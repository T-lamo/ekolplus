// PATCH /api/school/evaluations/[id] — qualitative-subject guard on a
// classSubjectId retarget. prismaMock first (auto-hoists vi.mock for
// '@/lib/server/prisma'). School route preamble: requireAuth →
// requireSchoolPermission.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, beforeEach, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));

vi.mock('@/lib/server/school-permissions', () => ({ requireSchoolPermission: vi.fn() }));

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { PATCH } from './route';

const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireSchoolPermission = vi.mocked(requireSchoolPermission);

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL('/api/school/evaluations/eva_1', 'http://localhost:3000'), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: 'eva_1' }) };

const existingEvaluation = {
  id: 'eva_1',
  classSubjectId: 'cs_1',
  classSubject: { class: { schoolId: 'school_1' } },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue({ user: { sub: 'user_1' } } as never);
  mockRequireSchoolPermission.mockResolvedValue({
    ok: true,
    mySchool: { schoolId: 'school_1' },
    response: null,
  } as never);
  prismaMock.evaluation.findUnique.mockResolvedValue(existingEvaluation as never);
  prismaMock.evaluation.update.mockResolvedValue({ id: 'eva_1' } as never);
});

describe('PATCH /api/school/evaluations/[id]', () => {
  it('409 SUBJECT_NOT_NUMERIC when retargeting onto a qualitative classSubject', async () => {
    prismaMock.classSubject.findUnique.mockResolvedValue({
      id: 'cs_2',
      class: { schoolId: 'school_1' },
      subject: { evaluationMode: 'QUALITATIVE' },
    } as never);
    const res = await PATCH(req({ classSubjectId: 'cs_2' }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: 'SUBJECT_NOT_NUMERIC',
      message: 'Cette matière est évaluée par critères, pas par notes.',
    });
    expect(prismaMock.evaluation.update).not.toHaveBeenCalled();
  });

  it('allows retargeting onto a numeric classSubject', async () => {
    prismaMock.classSubject.findUnique.mockResolvedValue({
      id: 'cs_2',
      class: { schoolId: 'school_1' },
      subject: { evaluationMode: 'NUMERIC' },
    } as never);
    const res = await PATCH(req({ classSubjectId: 'cs_2' }), params);
    expect(res.status).toBe(200);
    expect(prismaMock.evaluation.update).toHaveBeenCalled();
  });
});
