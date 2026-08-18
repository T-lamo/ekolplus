// POST /api/teacher/checkins — "Je suis présent". Covers the ownership
// scoping (a session that isn't the caller's own 404s), the accept window
// including the shared GRACE_MINUTES boundary (regression test for the
// status.ts/route drift the final review found), the P2002 → 409 mapping and
// the CSRF short-circuit. prismaMock first (auto-hoists vi.mock).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMyTeacherProfile: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMyTeacherProfile } from '@/lib/server/school';
import { GRACE_MINUTES } from '@/lib/server/teacher-attendance/status';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMyTeacherProfile = vi.mocked(resolveMyTeacherProfile);

const authUser = { user: { sub: 'user_1', email: 'prof@test.local' } };
const myProfile = { teacherId: 'teacher_1', schoolId: 'school_1' };

// 2026-08-18, 08:00 → 09:00 UTC. Accept window: [08:00, 09:00 + GRACE].
const sessionRow = {
  id: 'sess_1',
  date: new Date('2026-08-18T00:00:00.000Z'),
  startMinutes: 8 * 60,
  endMinutes: 9 * 60,
};

function req(body: unknown = { timetableSessionId: 'sess_1' }) {
  return new NextRequest('http://localhost/api/teacher/checkins', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Freeze "now" at hh:mm UTC on the session's day. */
function freezeAt(hh: number, mm: number) {
  vi.setSystemTime(
    new Date(`2026-08-18T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00.000Z`),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMyTeacherProfile.mockResolvedValue(myProfile);
  prismaMock.timetableSession.findFirst.mockResolvedValue(sessionRow as never);
  prismaMock.teacherCheckIn.create.mockResolvedValue({} as never);
  freezeAt(8, 30);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/teacher/checkins', () => {
  it('404s NOT_A_TEACHER when the account has no linked Teacher record', async () => {
    mockResolveMyTeacherProfile.mockResolvedValue(null);
    const res = await POST(req());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NOT_A_TEACHER');
    expect(prismaMock.timetableSession.findFirst).not.toHaveBeenCalled();
  });

  it("404s NOT_YOUR_SESSION and scopes the lookup by the caller's own teacherId", async () => {
    prismaMock.timetableSession.findFirst.mockResolvedValue(null);
    const res = await POST(req({ timetableSessionId: 'someone_elses_session' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NOT_YOUR_SESSION');
    expect(prismaMock.timetableSession.findFirst.mock.calls[0]?.[0]?.where).toEqual({
      id: 'someone_elses_session',
      teacherId: 'teacher_1',
    });
    expect(prismaMock.teacherCheckIn.create).not.toHaveBeenCalled();
  });

  it('422s OUTSIDE_WINDOW before the session starts', async () => {
    freezeAt(7, 59);
    const res = await POST(req());
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('OUTSIDE_WINDOW');
    expect(prismaMock.teacherCheckIn.create).not.toHaveBeenCalled();
  });

  it('accepts a check-in exactly GRACE_MINUTES after the end, and rejects one minute later', async () => {
    // Regression for the grace-window drift: status.ts and this route must
    // agree on GRACE_MINUTES, so the portal never shows "Absent" while the
    // server would still have accepted the check-in.
    expect(GRACE_MINUTES).toBe(15); // the boundary literals below assume this
    freezeAt(9, 15); // sessionEnd + GRACE_MINUTES — still inside the window
    expect((await POST(req())).status).toBe(200);
    expect(prismaMock.teacherCheckIn.create).toHaveBeenCalledTimes(1);

    freezeAt(9, 16); // one minute past the boundary
    const late = await POST(req());
    expect(late.status).toBe(422);
    expect((await late.json()).error).toBe('OUTSIDE_WINDOW');
    expect(prismaMock.teacherCheckIn.create).toHaveBeenCalledTimes(1); // no second write
  });

  it('409s ALREADY_CHECKED_IN on the unique-constraint violation', async () => {
    prismaMock.teacherCheckIn.create.mockRejectedValue({ code: 'P2002' } as never);
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ALREADY_CHECKED_IN');
  });

  it('happy path: writes the check-in scoped to the caller and answers { ok: true }', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(prismaMock.teacherCheckIn.create).toHaveBeenCalledWith({
      data: { schoolId: 'school_1', timetableSessionId: 'sess_1', teacherId: 'teacher_1' },
    });
  });

  it('a CSRF failure short-circuits before any DB access', async () => {
    mockVerifyCsrf.mockReturnValue(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(mockVerifyCsrf).toHaveBeenCalledTimes(1);
    expect(prismaMock.timetableSession.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.teacherCheckIn.create).not.toHaveBeenCalled();
  });
});
