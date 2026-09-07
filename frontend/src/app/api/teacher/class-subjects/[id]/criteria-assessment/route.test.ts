// GET/PUT /api/teacher/class-subjects/[id]/criteria-assessment: ownership
// and HTTP mapping only; the sheet logic is tested in
// lib/server/criteria-assessment.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return {
    ...actual,
    resolveMySchoolIncludingTeacher: vi.fn(),
    resolveMyTeacherProfile: vi.fn(),
  };
});
vi.mock('@/lib/server/criteria-assessment', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/criteria-assessment')>(
    '@/lib/server/criteria-assessment',
  );
  return { ...actual, loadSheetContext: vi.fn(), loadSheet: vi.fn(), saveSheet: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';
import { loadSheet, loadSheetContext, saveSheet } from '@/lib/server/criteria-assessment';
import { GET, PUT } from './route';

const authUser = { user: { sub: 'user_1', email: 'teacher@test.local' } };
const memberSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'MEMBER' as const };
const sheetCtx = {
  id: 'cs_1',
  classId: 'cls_1',
  class: { name: 'Kindergarten A', academicYearId: 'year_1' },
  subject: { id: 'subj_1', name: 'Comportement', ratingScale: ['Oui', 'Non'], criteria: [] },
};
const sheet = {
  id: null,
  status: 'DRAFT',
  term: { id: 'term_1', label: 'T1', gradeEntryEnabled: true },
  terms: [{ id: 'term_1', label: 'T1' }],
  classSubject: { id: 'cs_1', className: 'Kindergarten A' },
  subject: sheetCtx.subject,
  students: [],
};
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const body = { termId: 'term_1', status: 'DRAFT', ratings: [] };

function get(id = 'cs_1', query = '?termId=term_1') {
  return GET(
    new NextRequest(
      `http://localhost/api/teacher/class-subjects/${id}/criteria-assessment${query}`,
    ),
    params(id),
  );
}
function put(payload: unknown, id = 'cs_1') {
  return PUT(
    new NextRequest(`http://localhost/api/teacher/class-subjects/${id}/criteria-assessment`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
    params(id),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(authUser as never);
  vi.mocked(resolveMySchoolIncludingTeacher).mockResolvedValue(memberSchool);
  vi.mocked(resolveMyTeacherProfile).mockResolvedValue({
    teacherId: 'tea_1',
    classSubjectIds: ['cs_1'],
    homeroomClassIds: [],
  });
  vi.mocked(loadSheetContext).mockResolvedValue(sheetCtx);
  vi.mocked(loadSheet).mockResolvedValue(sheet as never);
  vi.mocked(saveSheet).mockResolvedValue({ ok: true, sheet: sheet as never });
});

describe('GET /api/teacher/class-subjects/[id]/criteria-assessment', () => {
  it('401s an unauthenticated caller', async () => {
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    expect((await get()).status).toBe(401);
  });

  it('404s a non-teacher account and a class-subject I do not teach, before any lookup', async () => {
    vi.mocked(resolveMyTeacherProfile).mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    vi.mocked(resolveMyTeacherProfile).mockResolvedValue({
      teacherId: 'tea_1',
      classSubjectIds: ['cs_OTHER'],
      homeroomClassIds: [],
    });
    expect((await get()).status).toBe(404);
    expect(loadSheetContext).not.toHaveBeenCalled();
  });

  it('404s a numeric or foreign class-subject (loadSheetContext null)', async () => {
    vi.mocked(loadSheetContext).mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    expect(loadSheetContext).toHaveBeenCalledWith('cs_1', 'school_1');
  });

  it('defaults to the current term without termId, 400s an unknown term, returns the sheet', async () => {
    await get('cs_1', '');
    expect(loadSheet).toHaveBeenLastCalledWith(sheetCtx, null);
    vi.mocked(loadSheet).mockResolvedValueOnce(null);
    expect((await get('cs_1', '?termId=term_ghost')).status).toBe(400);
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sheet });
    expect(loadSheet).toHaveBeenCalledWith(sheetCtx, 'term_1');
  });
});

describe('PUT /api/teacher/class-subjects/[id]/criteria-assessment', () => {
  it('400s an invalid body', async () => {
    expect((await put({ termId: 'term_1' })).status).toBe(400);
    expect(saveSheet).not.toHaveBeenCalled();
  });

  it('maps GRADE_ENTRY_DISABLED to 403 with the grades route message', async () => {
    vi.mocked(saveSheet).mockResolvedValue({ ok: false, error: 'GRADE_ENTRY_DISABLED' });
    const res = await put(body);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'GRADE_ENTRY_DISABLED',
      message: 'La saisie des notes est désactivée pour cette période.',
    });
  });

  it('maps validation errors to 400 and returns the saved sheet on success', async () => {
    vi.mocked(saveSheet).mockResolvedValue({ ok: false, error: 'LEVEL_OUT_OF_RANGE' });
    expect((await put(body)).status).toBe(400);
    vi.mocked(saveSheet).mockResolvedValue({ ok: true, sheet: sheet as never });
    const res = await put(body);
    expect(res.status).toBe(200);
    expect(saveSheet).toHaveBeenCalledWith(sheetCtx, body);
    expect(await res.json()).toEqual({ sheet });
  });
});
