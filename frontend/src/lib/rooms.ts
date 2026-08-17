// Catalogue des salles (configuration/salles) — types partagés client /
// serveur, sans dépendance React ni Prisma.
export const ROOM_TYPES = ['CLASSROOM', 'LAB', 'COMPUTER', 'SPORTS', 'ARTS', 'OTHER'] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  CLASSROOM: 'Salle de classe',
  LAB: 'Laboratoire',
  COMPUTER: 'Salle informatique',
  SPORTS: 'Sport / gymnase',
  ARTS: 'Arts / musique',
  OTHER: 'Autre lieu',
};

export function roomTypeLabel(type: string): string {
  return (ROOM_TYPE_LABELS as Record<string, string>)[type] ?? ROOM_TYPE_LABELS.OTHER;
}

export interface RoomRow {
  id: string;
  name: string;
  type: string;
  capacity: number | null;
  building: string | null;
  floor: string | null;
  equipment: string | null;
  isActive: boolean;
  classCount: number;
  sessionCount: number;
}

/** « Bât. A · 1er étage » — location line of a room. */
export function roomLocation(room: { building: string | null; floor: string | null }): string {
  return [room.building, room.floor].filter((v): v is string => !!v && v.trim() !== '').join(' · ');
}
