// GET /api/teacher/sessions/today — the teacher portal's own list. There is
// no id param on this route by design; the test locks in that the query is
// scoped by the teacherId resolved from the caller's session, so no
// client-supplied teacherId can ever be injected.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMyTeacherProfile: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { resolveMyTeacherProfile } from '@/lib/server/school';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolveMyTeacherProfile = vi.mocked(resolveMyTeacherProfile);

const authUser = { user: { sub: 'user_1', email: 'prof@test.local' } };
const myProfile = { teacherId: 'teacher_1', schoolId: 'school_1' };

function req() {
  return new NextRequest('http://localhost/api/teacher/sessions/today', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // 2026-08-18 07:00 UTC — before the 08:00 fixture session starts.
  vi.setSystemTime(new Date('2026-08-18T07:00:00.000Z'));
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockResolveMyTeacherProfile.mockResolvedValue(myProfile);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/teacher/sessions/today', () => {
  it('404s NOT_A_TEACHER when the account has no linked Teacher record', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NOT_A_TEACHER');
    expect(prismaMock.timetableSession.findMany).not.toHaveBeenCalled();
  });

  it("lists today's sessions with a computed status, scoped to the caller's own teacherId", async () => {
    prismaMock.timetableSession.findMany.mockResolvedValue([
      {
        id: 'sess_1',
        startMinutes: 8 * 60,
        endMinutes: 9 * 60,
        room: 'Salle 101',
        subject: { name: 'Mathématiques' },
        class: { name: '6e A' },
        checkIns: [],
      },
    ] as never);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0]).toMatchObject({
      id: 'sess_1',
      subjectName: 'Mathématiques',
      className: '6e A',
      room: 'Salle 101',
      status: 'UPCOMING', // now is 07:00, the session runs 08:00–09:00
      checkedInAt: null,
    });

    // The scoping contract: teacherId comes from the session, never the client.
    expect(prismaMock.timetableSession.findMany.mock.calls[0]?.[0]?.where).toEqual({
      teacherId: 'teacher_1',
      date: new Date('2026-08-18T00:00:00.000Z'),
    });
  });
});
