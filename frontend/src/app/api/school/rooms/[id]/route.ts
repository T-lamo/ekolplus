// PATCH /api/school/rooms/[id] — edit a room (ADMIN); renaming also rewrites
// the label copied into Class.room / TimetableSession.room (same tx) so the
// catalogue and the displayed text never drift. DELETE — remove the room
// (ADMIN): links are set to null (Prisma SetNull) but the text label stays on
// classes / sessions, so nothing else breaks. Other schools' rooms are 404.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import type { PermissionAction } from '@/lib/permissions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { ROOM_INCLUDE, RoomBody, serializeRoom } from '@/lib/server/rooms';

type Params = { params: Promise<{ id: string }> };

const PatchBody = RoomBody.partial();

async function guard(requestId: string, id: string, action: PermissionAction) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const perm = await requireSchoolPermission(auth.user.sub, 'configuration', action, requestId);
  if (!perm.ok) return perm.response;
  const mySchool = perm.mySchool;
  const room = await prisma.room.findUnique({ where: { id }, include: ROOM_INCLUDE });
  if (!room || room.schoolId !== mySchool.schoolId) {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: 'Room not found' },
      { status: 404, headers: { 'x-request-id': requestId } },
    );
  }
  return { mySchool, room };
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;
    const { id } = await params;
    const g = await guard(ctx.requestId, id, 'edit');
    if (g instanceof NextResponse) return g;
    const { mySchool, room } = g;

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const body = parsed.data;
    if (body.name !== undefined && body.name.toLowerCase() !== room.name.toLowerCase()) {
      const taken = await prisma.room.findFirst({
        where: {
          schoolId: mySchool.schoolId,
          id: { not: room.id },
          name: { equals: body.name, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json(
          { error: 'ROOM_NAME_TAKEN', message: 'Une salle porte déjà ce nom.' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }
    const data = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
      ...(body.building !== undefined
        ? { building: body.building?.trim() ? body.building.trim() : null }
        : {}),
      ...(body.floor !== undefined ? { floor: body.floor?.trim() ? body.floor.trim() : null } : {}),
      ...(body.equipment !== undefined
        ? { equipment: body.equipment?.trim() ? body.equipment.trim() : null }
        : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    };
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.room.update({ where: { id: room.id }, data, include: ROOM_INCLUDE });
      if (body.name !== undefined && body.name !== room.name) {
        await tx.class.updateMany({ where: { roomId: room.id }, data: { room: body.name } });
        await tx.timetableSession.updateMany({
          where: { roomId: room.id },
          data: { room: body.name },
        });
      }
      return next;
    });
    return NextResponse.json(
      { room: serializeRoom(updated) },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;
    const { id } = await params;
    const g = await guard(ctx.requestId, id, 'delete');
    if (g instanceof NextResponse) return g;
    await prisma.room.delete({ where: { id: g.room.id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
