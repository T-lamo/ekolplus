// GET/PUT /api/school/class-subjects/[id]/criteria-assessment: permission
// gating and HTTP mapping only; the sheet logic is tested in
// lib/server/criteria-assessment.test.ts. School route preamble:
// requireAuth → requireSchoolPermission.
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

vi.mock('@/lib/server/criteria-assessment', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/criteria-assessment')>(
    '@/lib/server/criteria-assessment',
  );
  return { ...actual, loadSheetContext: vi.fn(), loadSheet: vi.fn(), saveSheet: vi.fn() };
});

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { loadSheet, loadSheetContext, saveSheet } from '@/lib/server/criteria-assessment';
import { GET, PUT } from './route';

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

const sheetCtx = {
  id: 'cs_1',
  classId: 'cls_1',
  class: { name: 'Kindergarten A', academicYearId: 'year_1' },
  subject: { id: 'subj_1', name: 'Comportement', ratingScale: ['Oui', 'Non'], criteria: [] },
};
const sheet = {
  id: 'ca_1',
  status: 'PUBLISHED',
  term: { id: 'term_1', label: 'T1', gradeEntryEnabled: true },
  terms: [{ id: 'term_1', label: 'T1' }],
  classSubject: { id: 'cs_1', className: 'Kindergarten A' },
  subject: sheetCtx.subject,
  students: [],
};
const params = { params: Promise.resolve({ id: 'cs_1' }) };
const body = { termId: 'term_1', status: 'PUBLISHED', ratings: [] };

beforeEach(() => {
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue({ user: { sub: 'user_1' } } as never);
  mockRequireSchoolPermission.mockResolvedValue({
    ok: true,
    mySchool: { schoolId: 'school_1' },
    response: null,
  } as never);
  vi.mocked(loadSheetContext).mockResolvedValue(sheetCtx);
  vi.mocked(loadSheet).mockResolvedValue(sheet as never);
  vi.mocked(saveSheet).mockResolvedValue({ ok: true, sheet: sheet as never });
});

describe('GET /api/school/class-subjects/[id]/criteria-assessment', () => {
  it('404s when the class-subject is not a qualitative one of my school', async () => {
    vi.mocked(loadSheetContext).mockResolvedValue(null);
    const res = await GET(
      req('GET', '/api/school/class-subjects/cs_1/criteria-assessment?termId=term_1'),
      params,
    );
    expect(res.status).toBe(404);
    expect(loadSheetContext).toHaveBeenCalledWith('cs_1', 'school_1');
  });

  it('returns the sheet', async () => {
    const res = await GET(
      req('GET', '/api/school/class-subjects/cs_1/criteria-assessment?termId=term_1'),
      params,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sheet });
  });
});

describe('PUT /api/school/class-subjects/[id]/criteria-assessment', () => {
  it('saves and returns the sheet', async () => {
    const res = await PUT(
      req('PUT', '/api/school/class-subjects/cs_1/criteria-assessment', body),
      params,
    );
    expect(res.status).toBe(200);
    expect(saveSheet).toHaveBeenCalledWith(sheetCtx, body);
  });

  it('maps GRADE_ENTRY_DISABLED to 403', async () => {
    vi.mocked(saveSheet).mockResolvedValue({ ok: false, error: 'GRADE_ENTRY_DISABLED' });
    const res = await PUT(
      req('PUT', '/api/school/class-subjects/cs_1/criteria-assessment', body),
      params,
    );
    expect(res.status).toBe(403);
  });
});
