// Catalogue des salles (configuration/salles): GET sorted list with usage
// counts, POST 201 / 409 ROOM_NAME_TAKEN (case-insensitive) / 403 member,
// PATCH renaming rewrites the labels copied on classes + sessions, DELETE 204,
// other school → 404. prismaMock first (auto-hoists vi.mock).
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
  return { ...actual, resolveMySchool: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';
import { GET, POST } from './route';
import { PATCH, DELETE } from './[id]/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);

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

function roomRow(over: Record<string, unknown> = {}) {
  return {
    id: 'room_1',
    schoolId: 'school_1',
    name: 'Salle 101',
    type: 'CLASSROOM',
    capacity: 35,
    building: null,
    floor: null,
    equipment: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { classes: 1, sessions: 30 },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(adminSchool);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('GET /api/school/rooms', () => {
  it('lists the school rooms sorted naturally with usage counts', async () => {
    prismaMock.room.findMany.mockResolvedValue([
      roomRow({ id: 'r10', name: 'Salle 10' }),
      roomRow({ id: 'r2', name: 'Salle 2', _count: { classes: 0, sessions: 0 } }),
      roomRow({ id: 'lab', name: 'Laboratoire de SVT', type: 'LAB', capacity: null }),
    ] as never);
    const res = await GET(req('GET', '/api/school/rooms'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rooms.map((r: { name: string }) => r.name)).toEqual([
      'Laboratoire de SVT',
      'Salle 2',
      'Salle 10',
    ]);
    expect(json.rooms[2]).toMatchObject({ classCount: 1, sessionCount: 30, capacity: 35 });
  });
});

describe('POST /api/school/rooms', () => {
  it('creates a room (201) and refuses members (403)', async () => {
    prismaMock.room.findFirst.mockResolvedValue(null);
    prismaMock.room.create.mockResolvedValue(roomRow({ name: 'Salle 105' }) as never);
    const res = await POST(
      req('POST', '/api/school/rooms', { name: '  Salle 105 ', type: 'CLASSROOM', capacity: 30 }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.room.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ schoolId: 'school_1', name: 'Salle 105', capacity: 30 }),
      }),
    );
    mockResolveMySchool.mockResolvedValue(memberSchool);
    expect((await POST(req('POST', '/api/school/rooms', { name: 'x' }))).status).toBe(403);
  });

  it('answers 409 ROOM_NAME_TAKEN when the name exists (case-insensitive)', async () => {
    prismaMock.room.findFirst.mockResolvedValue({ id: 'room_1' } as never);
    const res = await POST(req('POST', '/api/school/rooms', { name: 'salle 101' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ROOM_NAME_TAKEN');
    expect(prismaMock.room.create).not.toHaveBeenCalled();
    const where = prismaMock.room.findFirst.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ name: { equals: 'salle 101', mode: 'insensitive' } });
  });

  it('rejects invalid bodies (400) and CSRF failures (403)', async () => {
    expect((await POST(req('POST', '/api/school/rooms', { name: '' }))).status).toBe(400);
    expect((await POST(req('POST', '/api/school/rooms', { name: 'x', type: 'POOL' }))).status).toBe(
      400,
    );
    mockVerifyCsrf.mockReturnValue(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    expect((await POST(req('POST', '/api/school/rooms', { name: 'x' }))).status).toBe(403);
  });
});

describe('PATCH / DELETE /api/school/rooms/[id]', () => {
  it("404s another school's room", async () => {
    prismaMock.room.findUnique.mockResolvedValue(roomRow({ schoolId: 'school_other' }) as never);
    expect(
      (await PATCH(req('PATCH', '/api/school/rooms/room_1', { capacity: 40 }), params('room_1')))
        .status,
    ).toBe(404);
    expect((await DELETE(req('DELETE', '/api/school/rooms/room_1'), params('room_1'))).status).toBe(
      404,
    );
  });

  it('renaming rewrites the label on linked classes and sessions (same tx)', async () => {
    prismaMock.room.findUnique.mockResolvedValue(roomRow() as never);
    prismaMock.room.findFirst.mockResolvedValue(null);
    prismaMock.room.update.mockResolvedValue(roomRow({ name: 'Salle 101 bis' }) as never);
    prismaMock.class.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.timetableSession.updateMany.mockResolvedValue({ count: 30 } as never);
    const res = await PATCH(
      req('PATCH', '/api/school/rooms/room_1', { name: 'Salle 101 bis' }),
      params('room_1'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).room.name).toBe('Salle 101 bis');
    expect(prismaMock.class.updateMany).toHaveBeenCalledWith({
      where: { roomId: 'room_1' },
      data: { room: 'Salle 101 bis' },
    });
    expect(prismaMock.timetableSession.updateMany).toHaveBeenCalledWith({
      where: { roomId: 'room_1' },
      data: { room: 'Salle 101 bis' },
    });
  });

  it('a capacity-only patch does not touch classes / sessions; DELETE answers 204', async () => {
    prismaMock.room.findUnique.mockResolvedValue(roomRow() as never);
    prismaMock.room.update.mockResolvedValue(roomRow({ capacity: 40 }) as never);
    const res = await PATCH(
      req('PATCH', '/api/school/rooms/room_1', { capacity: 40 }),
      params('room_1'),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.class.updateMany).not.toHaveBeenCalled();
    prismaMock.room.delete.mockResolvedValue(roomRow() as never);
    const del = await DELETE(req('DELETE', '/api/school/rooms/room_1'), params('room_1'));
    expect(del.status).toBe(204);
    expect(prismaMock.room.delete).toHaveBeenCalledWith({ where: { id: 'room_1' } });
  });
});
