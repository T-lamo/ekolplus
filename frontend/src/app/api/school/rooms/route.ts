// GET /api/school/rooms — the school's room catalogue (configuration/salles)
// with usage counts (classes using it, timetable sessions). POST — create a
// room (ADMIN); the name is unique per school, case-insensitively (409
// ROOM_NAME_TAKEN). Class.room / TimetableSession.room keep the label as
// text — the catalogue only adds identity, capacity and type.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { ROOM_INCLUDE, RoomBody, serializeRoom } from '@/lib/server/rooms';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const perm = await requireSchoolPermission(
      auth.user.sub,
      'configuration',
      'view',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;
    const rows = await prisma.room.findMany({
      where: { schoolId: mySchool.schoolId },
      include: ROOM_INCLUDE,
    });
    rows.sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
    return NextResponse.json(
      { rooms: rows.map(serializeRoom) },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const perm = await requireSchoolPermission(
      auth.user.sub,
      'configuration',
      'create',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;
    const parsed = RoomBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const body = parsed.data;
    const taken = await prisma.room.findFirst({
      where: { schoolId: mySchool.schoolId, name: { equals: body.name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json(
        { error: 'ROOM_NAME_TAKEN', message: 'Une salle porte déjà ce nom.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const room = await prisma.room.create({
      data: {
        schoolId: mySchool.schoolId,
        name: body.name,
        type: body.type,
        capacity: body.capacity ?? null,
        building: body.building?.trim() ? body.building.trim() : null,
        floor: body.floor?.trim() ? body.floor.trim() : null,
        equipment: body.equipment?.trim() ? body.equipment.trim() : null,
        isActive: body.isActive ?? true,
      },
      include: ROOM_INCLUDE,
    });
    return NextResponse.json(
      { room: serializeRoom(room) },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
