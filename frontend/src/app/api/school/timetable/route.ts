// GET /api/school/timetable?from&to[&classId&teacherId&room&subjectId] —
// sessions of the school's ACTIVE academic year in a date range (≤ 62 days)
// + the known rooms (class rooms ∪ session rooms) for the filter/modal.
// POST — create one session or a weekly series (recurrence expanded into one
// row per occurrence sharing a seriesId); 409 TIMETABLE_CONFLICT when the
// class, teacher or room is already busy on any occurrence. Read = any
// member, write = ADMIN+. See .planning/banani/emploi-du-temps.md.
export const runtime = 'nodejs';

import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, resolveActiveAcademicYear, hasMinRole } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { DAY_MS, MAX_OCCURRENCES, expandRecurrence, parseDay } from '@/lib/server/timetable';
import {
  DAY_RE,
  SESSION_INCLUDE,
  SessionFieldsSchema,
  findConflicts,
  serializeSession,
  seriesCounts,
} from '@/lib/server/timetable-route-helpers';
import { findSchoolRoom } from '@/lib/server/rooms';

const MAX_RANGE_DAYS = 62;

const Query = z.object({
  from: z.string().regex(DAY_RE),
  to: z.string().regex(DAY_RE),
  classId: z.string().min(1).optional(),
  teacherId: z.string().min(1).optional(),
  room: z.string().trim().min(1).optional(),
  subjectId: z.string().min(1).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const sp = req.nextUrl.searchParams;
    const parsed = Query.safeParse({
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
      classId: sp.get('classId') ?? undefined,
      teacherId: sp.get('teacherId') ?? undefined,
      room: sp.get('room') ?? undefined,
      subjectId: sp.get('subjectId') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'from and to (YYYY-MM-DD) are required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const from = parseDay(parsed.data.from);
    const to = parseDay(parsed.data.to);
    if (to < from || (to.getTime() - from.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: `Range must be 0–${MAX_RANGE_DAYS} days` },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const activeYear = await resolveActiveAcademicYear(mySchool.schoolId);
    if (!activeYear) {
      return NextResponse.json(
        { academicYear: null, sessions: [], rooms: [] },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [rows, classRooms, sessionRooms] = await Promise.all([
      prisma.timetableSession.findMany({
        where: {
          schoolId: mySchool.schoolId,
          academicYearId: activeYear.id,
          date: { gte: from, lte: to },
          ...(parsed.data.classId ? { classId: parsed.data.classId } : {}),
          ...(parsed.data.teacherId ? { teacherId: parsed.data.teacherId } : {}),
          ...(parsed.data.subjectId ? { subjectId: parsed.data.subjectId } : {}),
          ...(parsed.data.room
            ? { room: { equals: parsed.data.room, mode: 'insensitive' as const } }
            : {}),
        },
        orderBy: [{ date: 'asc' }, { startMinutes: 'asc' }, { class: { name: 'asc' } }],
        include: SESSION_INCLUDE,
      }),
      prisma.class.findMany({
        where: { schoolId: mySchool.schoolId, academicYearId: activeYear.id, room: { not: null } },
        select: { room: true },
        distinct: ['room'],
      }),
      prisma.timetableSession.findMany({
        where: { schoolId: mySchool.schoolId, room: { not: null } },
        select: { room: true },
        distinct: ['room'],
      }),
    ]);
    const counts = await seriesCounts(prisma, rows);
    const rooms = [
      ...new Set(
        [...classRooms, ...sessionRooms]
          .map((r) => r.room?.trim() ?? '')
          .filter((r) => r.length > 0),
      ),
    ].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));

    return NextResponse.json(
      {
        academicYear: { id: activeYear.id, label: activeYear.label },
        sessions: rows.map((s) => serializeSession(s, s.seriesId ? counts.get(s.seriesId) : 1)),
        rooms,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const CreateBody = z
  .object({
    ...SessionFieldsSchema,
    recurrence: z
      .object({
        days: z.array(z.number().int().min(1).max(6)).max(6),
        until: z.string().regex(DAY_RE),
      })
      .nullable()
      .optional(),
  })
  .refine((b) => b.endMinutes > b.startMinutes, {
    message: 'endMinutes must be after startMinutes',
  })
  .refine((b) => !b.recurrence || b.recurrence.until >= b.date, {
    message: 'recurrence.until must be on or after date',
  });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const activeYear = await resolveActiveAcademicYear(mySchool.schoolId);
    if (!activeYear) {
      return NextResponse.json(
        {
          error: 'NO_ACADEMIC_YEAR',
          message: "Configure d'abord une année scolaire dans Paramètres.",
        },
        { status: 424, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const body = parsed.data;

    const [cls, subject, teacher] = await Promise.all([
      prisma.class.findUnique({
        where: { id: body.classId },
        select: { id: true, schoolId: true, academicYearId: true },
      }),
      prisma.subject.findUnique({
        where: { id: body.subjectId },
        select: { id: true, schoolId: true },
      }),
      body.teacherId
        ? prisma.teacher.findUnique({
            where: { id: body.teacherId },
            select: { id: true, schoolId: true },
          })
        : Promise.resolve(null),
    ]);
    if (!cls || cls.schoolId !== mySchool.schoolId || cls.academicYearId !== activeYear.id) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid classId' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!subject || subject.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid subjectId' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (body.teacherId && (!teacher || teacher.schoolId !== mySchool.schoolId)) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid teacherId' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const dates = expandRecurrence(body.date, body.recurrence ?? null);
    if (dates.length >= MAX_OCCURRENCES) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: `Too many occurrences (max ${MAX_OCCURRENCES})` },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    let room = body.room?.trim() ? body.room.trim() : null;
    const roomId = body.roomId ?? null;
    if (roomId) {
      const catalogRoom = await findSchoolRoom(prisma, roomId, mySchool.schoolId);
      if (!catalogRoom) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Invalid roomId' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      room = catalogRoom.name;
    }
    const teacherId = body.teacherId ?? null;

    const result = await prisma.$transaction(async (tx) => {
      const conflicts = await findConflicts(tx, mySchool.schoolId, [
        {
          dates,
          startMinutes: body.startMinutes,
          endMinutes: body.endMinutes,
          classId: body.classId,
          teacherId,
          room,
        },
      ]);
      if (conflicts.length > 0) return { conflicts };
      const seriesId = dates.length > 1 ? randomUUID() : null;
      const created = await tx.timetableSession.createManyAndReturn({
        data: dates.map((date) => ({
          schoolId: mySchool.schoolId,
          academicYearId: activeYear.id,
          classId: body.classId,
          subjectId: body.subjectId,
          teacherId,
          room,
          roomId,
          type: body.type,
          color: body.color ?? null,
          date,
          startMinutes: body.startMinutes,
          endMinutes: body.endMinutes,
          description: body.description?.trim() ? body.description.trim() : null,
          meetingUrl: body.meetingUrl ?? null,
          seriesId,
        })),
        include: SESSION_INCLUDE,
      });
      return { created };
    });

    if ('conflicts' in result) {
      return NextResponse.json(
        {
          error: 'TIMETABLE_CONFLICT',
          message: result.conflicts[0]?.message ?? 'Créneau déjà occupé.',
          conflicts: result.conflicts,
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const n = result.created.length;
    return NextResponse.json(
      { sessions: result.created.map((s) => serializeSession(s, n)), count: n },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
