// Prisma-facing half of the timetable routes (emploi-du-temps.md): shared
// include/serializer + the conflict lookup used by both POST (create) and
// PATCH (edit one / series). Separate from `timetable.ts` so the pure rules
// stay DB-free.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './prisma';
import {
  SESSION_TYPES,
  detectConflicts,
  formatDay,
  minutesToHHMM,
  normalizeRoom,
} from './timetable';

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const SESSION_INCLUDE = {
  subject: { select: { id: true, name: true, abbreviation: true, color: true, icon: true } },
  teacher: { select: { id: true, name: true, photoUrl: true } },
  class: { select: { id: true, name: true, color: true } },
} as const;

export type SessionRow = Prisma.TimetableSessionGetPayload<{ include: typeof SESSION_INCLUDE }>;

export function serializeSession(s: SessionRow, seriesCount = 1) {
  return {
    id: s.id,
    academicYearId: s.academicYearId,
    classId: s.classId,
    class: s.class,
    subjectId: s.subjectId,
    subject: s.subject,
    teacherId: s.teacherId,
    teacher: s.teacher,
    room: s.room,
    roomId: s.roomId,
    type: s.type,
    // Effective colour: explicit override, else the subject's identity colour.
    color: s.color ?? s.subject.color,
    // Raw override, kept apart so the edit form can tell "follows the
    // subject" (null) from "explicitly chosen" — re-saving a session must
    // not freeze the subject's current colour into the row.
    colorOverride: s.color,
    date: formatDay(s.date),
    startMinutes: s.startMinutes,
    endMinutes: s.endMinutes,
    description: s.description,
    meetingUrl: s.meetingUrl,
    seriesId: s.seriesId,
    seriesCount,
  };
}

export type SerializedSession = ReturnType<typeof serializeSession>;

/** Occurrences per seriesId for the given rows — "toute la série (N)". */
export async function seriesCounts(
  db: Prisma.TransactionClient | typeof prisma,
  rows: { seriesId: string | null }[],
): Promise<Map<string, number>> {
  const ids = [...new Set(rows.map((r) => r.seriesId).filter((v): v is string => v !== null))];
  if (ids.length === 0) return new Map();
  const grouped = await db.timetableSession.groupBy({
    by: ['seriesId'],
    where: { seriesId: { in: ids } },
    _count: { _all: true },
  });
  return new Map(
    grouped
      .filter((g): g is typeof g & { seriesId: string } => g.seriesId !== null)
      .map((g) => [g.seriesId, g._count._all]),
  );
}

export const SessionFieldsSchema = {
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  teacherId: z.string().min(1).nullable().optional(),
  room: z.string().trim().max(80).nullable().optional(),
  // Catalogue des salles : `roomId` impose le libellé `room` (nom de la salle).
  roomId: z.string().min(1).nullable().optional(),
  type: z.enum(SESSION_TYPES),
  color: z.string().regex(COLOR_RE).nullable().optional(),
  date: z.string().regex(DAY_RE),
  startMinutes: z.number().int().min(0).max(1439),
  endMinutes: z.number().int().min(1).max(1440),
  description: z.string().trim().max(1000).nullable().optional(),
  // Scheme-constrained (not just `.url()`) so a stored value can never
  // become a `javascript:`/`data:` link if it's ever rendered as an <a href>.
  meetingUrl: z
    .string()
    .trim()
    .regex(/^https?:\/\//)
    .max(500)
    .nullable()
    .optional(),
} as const;

export interface CandidateSlot {
  dates: Date[];
  startMinutes: number;
  endMinutes: number;
  classId: string;
  teacherId: string | null;
  room: string | null;
}

export interface ConflictDetail {
  kind: 'class' | 'teacher' | 'room';
  date: string;
  startMinutes: number;
  endMinutes: number;
  subject: string;
  class: string;
  teacher: string | null;
  room: string | null;
  message: string;
}

/**
 * One indexed query for every session of the school on the candidate dates
 * that shares the class, teacher or room, then the pure overlap rule. Returns
 * human-readable details for the 409 payload (first 5).
 */
export async function findConflicts(
  db: Prisma.TransactionClient | typeof prisma,
  schoolId: string,
  candidates: CandidateSlot[],
  excludeIds: ReadonlySet<string> = new Set(),
): Promise<ConflictDetail[]> {
  const allDates = [...new Set(candidates.flatMap((c) => c.dates.map((d) => d.getTime())))].map(
    (t) => new Date(t),
  );
  if (allDates.length === 0) return [];
  const or: Prisma.TimetableSessionWhereInput[] = [];
  for (const c of candidates) {
    or.push({ classId: c.classId });
    if (c.teacherId) or.push({ teacherId: c.teacherId });
    const room = normalizeRoom(c.room);
    if (room) or.push({ room: { equals: room, mode: 'insensitive' } });
  }
  const existing = await db.timetableSession.findMany({
    where: { schoolId, date: { in: allDates }, OR: or },
    include: SESSION_INCLUDE,
  });
  const byId = new Map(existing.map((e) => [e.id, e]));
  const details: ConflictDetail[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const hits = detectConflicts(c, existing, excludeIds);
    for (const h of hits) {
      const key = `${h.kind}|${h.sessionId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const s = byId.get(h.sessionId);
      if (!s) continue;
      const who =
        h.kind === 'class'
          ? `La classe ${s.class.name}`
          : h.kind === 'teacher'
            ? (s.teacher?.name ?? 'L’enseignant')
            : `La salle ${s.room ?? ''}`.trim();
      details.push({
        kind: h.kind,
        date: formatDay(s.date),
        startMinutes: s.startMinutes,
        endMinutes: s.endMinutes,
        subject: s.subject.name,
        class: s.class.name,
        teacher: s.teacher?.name ?? null,
        room: s.room,
        message: `${who} est déjà pris(e) le ${formatDay(s.date)} de ${minutesToHHMM(s.startMinutes)} à ${minutesToHHMM(s.endMinutes)} (${s.subject.name} — ${s.class.name}).`,
      });
      if (details.length >= 5) return details;
    }
  }
  return details;
}
