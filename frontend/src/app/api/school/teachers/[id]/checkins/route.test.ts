// GET /api/school/teachers/[id]/checkins — the admin "Présences" tab.
// Read-only, but tenant-scoped twice: the teacher lookup AND the sessions
// query must both carry the caller's own schoolId, so a teacher id borrowed
// from another school can never be read.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchool: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchool } from '@/lib/server/school';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveMySchool = vi.mocked(resolveMySchool);

const authUser = { user: { sub: 'user_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };

function req() {
  return new NextRequest('http://localhost/api/school/teachers/teacher_1/checkins', {
    method: 'GET',
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // 2026-08-19 — the day after the fixture session, so "no check-in" is ABSENT.
  vi.setSystemTime(new Date('2026-08-19T10:00:00.000Z'));
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveMySchool.mockResolvedValue(adminSchool);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/school/teachers/[id]/checkins', () => {
  it('404s NO_SCHOOL when the account has no school membership', async () => {
    mockResolveMySchool.mockResolvedValue(null);
    const res = await GET(req(), params('teacher_1'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NO_SCHOOL');
    expect(prismaMock.teacher.findFirst).not.toHaveBeenCalled();
  });

  it("404s NOT_FOUND for a teacher outside the caller's school (lookup is schoolId-scoped)", async () => {
    prismaMock.teacher.findFirst.mockResolvedValue(null);
    const res = await GET(req(), params('teacher_other_school'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NOT_FOUND');
    expect(prismaMock.teacher.findFirst.mock.calls[0]?.[0]?.where).toEqual({
      id: 'teacher_other_school',
      schoolId: 'school_1',
    });
    expect(prismaMock.timetableSession.findMany).not.toHaveBeenCalled();
  });

  it('maps the history rows and scopes the sessions query by schoolId too', async () => {
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teacher_1' } as never);
    prismaMock.timetableSession.findMany.mockResolvedValue([
      {
        id: 'sess_1',
        date: new Date('2026-08-18T00:00:00.000Z'),
        startMinutes: 8 * 60,
        endMinutes: 9 * 60,
        subject: { name: 'Mathématiques' },
        class: { name: '6e A' },
        checkIns: [{ checkedInAt: new Date('2026-08-18T08:03:00.000Z') }],
      },
      {
        id: 'sess_2',
        date: new Date('2026-08-18T00:00:00.000Z'),
        startMinutes: 10 * 60,
        endMinutes: 11 * 60,
        subject: { name: 'Physique' },
        class: { name: '5e B' },
        checkIns: [],
      },
    ] as never);

    const res = await GET(req(), params('teacher_1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rows).toHaveLength(2);
    expect(json.rows[0]).toEqual({
      id: 'sess_1',
      date: '2026-08-18',
      subjectName: 'Mathématiques',
      className: '6e A',
      startMinutes: 480,
      endMinutes: 540,
      status: 'PRESENT', // checked in 3 min after the start
      checkedInAt: '2026-08-18T08:03:00.000Z',
    });
    expect(json.rows[1]).toMatchObject({ id: 'sess_2', status: 'ABSENT', checkedInAt: null });

    // Dual tenant-scoping: the sessions query carries the resolved schoolId.
    expect(prismaMock.timetableSession.findMany.mock.calls[0]?.[0]?.where).toEqual({
      teacherId: 'teacher_1',
      schoolId: 'school_1',
    });
  });
});
