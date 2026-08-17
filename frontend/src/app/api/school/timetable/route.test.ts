// Emploi du temps routes (emploi-du-temps.md): GET range + rooms, POST
// recurrence expansion into one row per occurrence sharing a seriesId, 409
// on conflict, PATCH scope=series, DELETE scope=series. prismaMock first
// (auto-hoists vi.mock for '@/lib/server/prisma').
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchool: vi.fn(), resolveActiveAcademicYear: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool, resolveActiveAcademicYear } from '@/lib/server/school';
import { GET, POST } from './route';
import { PATCH, DELETE } from './[id]/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);
const mockResolveYear = vi.mocked(resolveActiveAcademicYear);

const authUser = { user: { sub: 'user_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };
const memberSchool = { ...adminSchool, role: 'MEMBER' as const };

function req(method: string, url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
// `groupBy` is an overloaded generic Prisma delegate method — vitest-mock-extended
// can't type its mock surface, so reach the vi.fn through a cast.
const groupByMock = prismaMock.timetableSession.groupBy as unknown as ReturnType<typeof vi.fn>;

const subject = { id: 'sub_1', name: 'Mathématiques', abbreviation: 'MATH', color: '#2563eb' };
const teacher = { id: 'tea_1', name: 'Jacques Pierre-Louis', photoUrl: null };
const cls = { id: 'cls_1', name: '3ème A', color: '#e65100' };

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ses_1',
    schoolId: 'school_1',
    academicYearId: 'year_1',
    classId: 'cls_1',
    subjectId: 'sub_1',
    teacherId: 'tea_1',
    room: 'Salle 104',
    type: 'CM',
    color: null,
    date: new Date('2026-08-17T00:00:00.000Z'),
    startMinutes: 480,
    endMinutes: 540,
    description: null,
    meetingUrl: null,
    seriesId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    subject,
    teacher,
    class: cls,
    ...overrides,
  };
}

const validBody = {
  classId: 'cls_1',
  subjectId: 'sub_1',
  teacherId: 'tea_1',
  room: 'Salle 104',
  type: 'CM',
  date: '2026-08-17',
  startMinutes: 480,
  endMinutes: 540,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(adminSchool);
  mockResolveYear.mockResolvedValue({
    id: 'year_1',
    label: '2025-2026',
    startDate: new Date('2025-09-01T00:00:00.000Z'),
  });
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
  prismaMock.class.findUnique.mockResolvedValue({
    id: 'cls_1',
    schoolId: 'school_1',
    academicYearId: 'year_1',
  } as never);
  prismaMock.subject.findUnique.mockResolvedValue({ id: 'sub_1', schoolId: 'school_1' } as never);
  prismaMock.teacher.findUnique.mockResolvedValue({ id: 'tea_1', schoolId: 'school_1' } as never);
  groupByMock.mockResolvedValue([]);
});

describe('GET /api/school/timetable', () => {
  it('requires from/to and refuses ranges above 62 days', async () => {
    expect((await GET(req('GET', '/api/school/timetable'))).status).toBe(400);
    expect(
      (await GET(req('GET', '/api/school/timetable?from=2026-01-01&to=2026-06-01'))).status,
    ).toBe(400);
  });

  it('returns the active year sessions of the range + known rooms, colour falls back to the subject', async () => {
    prismaMock.timetableSession.findMany
      .mockResolvedValueOnce([sessionRow({ seriesId: 'ser_1' })] as never)
      .mockResolvedValueOnce([{ room: 'Labo SVT' }] as never);
    prismaMock.class.findMany.mockResolvedValue([{ room: 'Salle 104' }, { room: null }] as never);
    groupByMock.mockResolvedValue([{ seriesId: 'ser_1', _count: { _all: 12 } }]);

    const res = await GET(req('GET', '/api/school/timetable?from=2026-08-17&to=2026-08-21'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.academicYear).toEqual({ id: 'year_1', label: '2025-2026' });
    expect(json.rooms).toEqual(['Labo SVT', 'Salle 104']);
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0]).toMatchObject({
      id: 'ses_1',
      date: '2026-08-17',
      color: '#2563eb',
      seriesId: 'ser_1',
      seriesCount: 12,
      subject: { name: 'Mathématiques' },
      class: { name: '3ème A' },
    });
    const where = prismaMock.timetableSession.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ schoolId: 'school_1', academicYearId: 'year_1' });
  });

  it('answers an empty payload (not an error) when no academic year is active', async () => {
    mockResolveYear.mockResolvedValue(null);
    const res = await GET(req('GET', '/api/school/timetable?from=2026-08-17&to=2026-08-21'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ academicYear: null, sessions: [], rooms: [] });
  });
});

describe('POST /api/school/timetable', () => {
  it('rejects members (403), CSRF failures and invalid bodies (400)', async () => {
    mockResolveMySchool.mockResolvedValue(memberSchool);
    expect((await POST(req('POST', '/api/school/timetable', validBody))).status).toBe(403);
    mockResolveMySchool.mockResolvedValue(adminSchool);
    mockVerifyCsrf.mockReturnValue(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    expect((await POST(req('POST', '/api/school/timetable', validBody))).status).toBe(403);
    mockVerifyCsrf.mockReturnValue(null);
    // end before start
    expect(
      (await POST(req('POST', '/api/school/timetable', { ...validBody, endMinutes: 480 }))).status,
    ).toBe(400);
    // until before date
    expect(
      (
        await POST(
          req('POST', '/api/school/timetable', {
            ...validBody,
            recurrence: { days: [1], until: '2026-08-10' },
          }),
        )
      ).status,
    ).toBe(400);
    expect(prismaMock.timetableSession.createManyAndReturn).not.toHaveBeenCalled();
  });

  it('refuses a class outside the active year (400)', async () => {
    prismaMock.class.findUnique.mockResolvedValue({
      id: 'cls_1',
      schoolId: 'school_1',
      academicYearId: 'year_old',
    } as never);
    const res = await POST(req('POST', '/api/school/timetable', validBody));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/classId/);
  });

  it('expands a weekly recurrence into one row per occurrence sharing a seriesId (201)', async () => {
    prismaMock.timetableSession.findMany.mockResolvedValue([] as never); // no conflicts
    prismaMock.timetableSession.createManyAndReturn.mockImplementation(((args: {
      data: Record<string, unknown>[];
    }) => Promise.resolve(args.data.map((d, i) => sessionRow({ ...d, id: `ses_${i}` })))) as never);

    // Mon 17 Aug + every Mon/Wed until Sun 30 Aug → 17, 19, 24, 26 (4 rows).
    const res = await POST(
      req('POST', '/api/school/timetable', {
        ...validBody,
        recurrence: { days: [1, 3], until: '2026-08-30' },
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.count).toBe(4);
    const data = prismaMock.timetableSession.createManyAndReturn.mock.calls[0]?.[0]?.data as {
      date: Date;
      seriesId: string | null;
    }[];
    expect(data.map((d) => d.date.toISOString().slice(0, 10))).toEqual([
      '2026-08-17',
      '2026-08-19',
      '2026-08-24',
      '2026-08-26',
    ]);
    const seriesIds = new Set(data.map((d) => d.seriesId));
    expect(seriesIds.size).toBe(1);
    expect([...seriesIds][0]).toBeTruthy();
    expect(json.sessions[0].seriesCount).toBe(4);
  });

  it('creates a single row with seriesId null when there is no recurrence', async () => {
    prismaMock.timetableSession.findMany.mockResolvedValue([] as never);
    prismaMock.timetableSession.createManyAndReturn.mockResolvedValue([sessionRow()] as never);
    const res = await POST(req('POST', '/api/school/timetable', validBody));
    expect(res.status).toBe(201);
    const data = prismaMock.timetableSession.createManyAndReturn.mock.calls[0]?.[0]?.data as {
      seriesId: string | null;
    }[];
    expect(data).toHaveLength(1);
    expect(data[0]?.seriesId).toBeNull();
  });

  it('answers 409 TIMETABLE_CONFLICT when the teacher is already busy on one occurrence', async () => {
    // Existing session: other class, same teacher, Wed 19 Aug 08:30–09:30.
    prismaMock.timetableSession.findMany.mockResolvedValue([
      sessionRow({
        id: 'busy',
        classId: 'cls_2',
        class: { id: 'cls_2', name: '4ème A', color: null },
        date: new Date('2026-08-19T00:00:00.000Z'),
        startMinutes: 510,
        endMinutes: 570,
      }),
    ] as never);
    const res = await POST(
      req('POST', '/api/school/timetable', {
        ...validBody,
        recurrence: { days: [1, 3], until: '2026-08-30' },
      }),
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('TIMETABLE_CONFLICT');
    expect(json.conflicts[0]).toMatchObject({ kind: 'teacher', date: '2026-08-19' });
    expect(json.message).toMatch(/Jacques Pierre-Louis/);
    expect(prismaMock.timetableSession.createManyAndReturn).not.toHaveBeenCalled();
  });
});

describe('PATCH / DELETE /api/school/timetable/[id]', () => {
  it('404s a session of another school without leaking it', async () => {
    prismaMock.timetableSession.findUnique.mockResolvedValue(
      sessionRow({ schoolId: 'school_other' }) as never,
    );
    const res = await PATCH(
      req('PATCH', '/api/school/timetable/ses_1', { room: 'X' }),
      params('ses_1'),
    );
    expect(res.status).toBe(404);
  });

  it('scope=series applies the change to every occurrence and refuses a date change', async () => {
    prismaMock.timetableSession.findUnique.mockResolvedValue(
      sessionRow({ seriesId: 'ser_1' }) as never,
    );
    const occurrences = [
      {
        id: 'ses_1',
        date: new Date('2026-08-17T00:00:00.000Z'),
        startMinutes: 480,
        endMinutes: 540,
      },
      {
        id: 'ses_2',
        date: new Date('2026-08-24T00:00:00.000Z'),
        startMinutes: 480,
        endMinutes: 540,
      },
    ];
    prismaMock.timetableSession.findMany
      .mockResolvedValueOnce(occurrences as never) // targets
      .mockResolvedValueOnce([] as never) // conflict lookup
      .mockResolvedValueOnce(
        occurrences.map((o) => sessionRow({ ...o, seriesId: 'ser_1', room: 'Salle 201' })) as never,
      );
    prismaMock.timetableSession.updateMany.mockResolvedValue({ count: 2 } as never);

    const res = await PATCH(
      req('PATCH', '/api/school/timetable/ses_1', { room: 'Salle 201', scope: 'series' }),
      params('ses_1'),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.count).toBe(2);
    expect(prismaMock.timetableSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['ses_1', 'ses_2'] } },
        data: expect.objectContaining({ room: 'Salle 201' }),
      }),
    );

    const bad = await PATCH(
      req('PATCH', '/api/school/timetable/ses_1', { date: '2026-09-01', scope: 'series' }),
      params('ses_1'),
    );
    expect(bad.status).toBe(400);
  });

  it('DELETE ?scope=series removes every occurrence, default removes one (204)', async () => {
    prismaMock.timetableSession.findUnique.mockResolvedValue(
      sessionRow({ seriesId: 'ser_1' }) as never,
    );
    prismaMock.timetableSession.deleteMany.mockResolvedValue({ count: 12 } as never);
    const res = await DELETE(
      req('DELETE', '/api/school/timetable/ses_1?scope=series'),
      params('ses_1'),
    );
    expect(res.status).toBe(204);
    expect(prismaMock.timetableSession.deleteMany).toHaveBeenCalledWith({
      where: { seriesId: 'ser_1', schoolId: 'school_1' },
    });

    prismaMock.timetableSession.delete.mockResolvedValue(sessionRow() as never);
    const one = await DELETE(req('DELETE', '/api/school/timetable/ses_1'), params('ses_1'));
    expect(one.status).toBe(204);
    expect(prismaMock.timetableSession.delete).toHaveBeenCalledWith({ where: { id: 'ses_1' } });
  });
});
