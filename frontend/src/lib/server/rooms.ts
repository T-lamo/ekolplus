// Server helpers of the room catalogue (configuration/salles): body schema,
// include + serializer shared by /api/school/rooms{,/[id]}, and the lookup
// the classes / timetable routes use to accept a `roomId` (must belong to
// the caller's school; the room's name is copied into the free-text `room`
// column so lists and cards keep displaying a label without a join).
import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { ROOM_TYPES } from '@/lib/rooms';

export const RoomBody = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(ROOM_TYPES).default('CLASSROOM'),
  capacity: z.number().int().min(1).max(5000).nullable().optional(),
  building: z.string().trim().max(60).nullable().optional(),
  floor: z.string().trim().max(60).nullable().optional(),
  equipment: z.string().trim().max(300).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const ROOM_INCLUDE = { _count: { select: { classes: true, sessions: true } } } as const;

export type RoomRowDb = Prisma.RoomGetPayload<{ include: typeof ROOM_INCLUDE }>;

export function serializeRoom(r: RoomRowDb) {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    capacity: r.capacity,
    building: r.building,
    floor: r.floor,
    equipment: r.equipment,
    isActive: r.isActive,
    classCount: r._count.classes,
    sessionCount: r._count.sessions,
  };
}

/** Room of the school (any status) or null — for `roomId` validation. */
export async function findSchoolRoom(
  db: Prisma.TransactionClient | typeof prisma,
  roomId: string,
  schoolId: string,
): Promise<{ id: string; name: string } | null> {
  const room = await db.room.findUnique({
    where: { id: roomId },
    select: { id: true, name: true, schoolId: true },
  });
  if (!room || room.schoolId !== schoolId) return null;
  return { id: room.id, name: room.name };
}
