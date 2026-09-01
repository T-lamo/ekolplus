// PATCH /api/school/timetable/[id] — edit a session; `scope: 'series'`
// applies the non-date fields (subject, teacher, room, type, colour, hours,
// description, link) to every occurrence sharing the seriesId, each kept on
// its own date. DELETE ?scope=one|series. Both re-run the conflict check and
// answer 409 TIMETABLE_CONFLICT. ADMIN+ only; sessions of another school
// are 404 (existence not leaked). See .planning/banani/emploi-du-temps.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import type { PermissionAction } from '@/lib/permissions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { parseDay } from '@/lib/server/timetable';
import { findSchoolRoom } from '@/lib/server/rooms';
import {
  SESSION_INCLUDE,
  SessionFieldsSchema,
  findConflicts,
  serializeSession,
  type CandidateSlot,
} from '@/lib/server/timetable-route-helpers';

type Params = { params: Promise<{ id: string }> };

const PatchBody = z
  .object({
    classId: SessionFieldsSchema.classId.optional(),
    subjectId: SessionFieldsSchema.subjectId.optional(),
    teacherId: SessionFieldsSchema.teacherId,
    room: SessionFieldsSchema.room,
    roomId: SessionFieldsSchema.roomId,
    type: SessionFieldsSchema.type.optional(),
    color: SessionFieldsSchema.color,
    date: SessionFieldsSchema.date.optional(),
    startMinutes: SessionFieldsSchema.startMinutes.optional(),
    endMinutes: SessionFieldsSchema.endMinutes.optional(),
    description: SessionFieldsSchema.description,
    meetingUrl: SessionFieldsSchema.meetingUrl,
    scope: z.enum(['one', 'series']).default('one'),
  })
  .refine((b) => !(b.scope === 'series' && b.date !== undefined), {
    message: 'date cannot be changed for a whole series',
  });

async function guard(req: NextRequest, requestId: string, id: string, action: PermissionAction) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const perm = await requireSchoolPermission(auth.user.sub, 'emploiDuTemps', action, requestId);
  if (!perm.ok) return perm.response;
  const mySchool = perm.mySchool;
  const session = await prisma.timetableSession.findUnique({
    where: { id },
    include: SESSION_INCLUDE,
  });
  if (!session || session.schoolId !== mySchool.schoolId) {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: 'Session not found' },
      { status: 404, headers: { 'x-request-id': requestId } },
    );
  }
  return { mySchool, session };
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;
    const { id } = await params;
    const g = await guard(req, ctx.requestId, id, 'edit');
    if (g instanceof NextResponse) return g;
    const { mySchool, session } = g;

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const body = parsed.data;

    // Foreign keys must stay inside the school (and the class inside the
    // session's academic year).
    if (body.classId !== undefined && body.classId !== session.classId) {
      const cls = await prisma.class.findUnique({
        where: { id: body.classId },
        select: { schoolId: true, academicYearId: true },
      });
      if (
        !cls ||
        cls.schoolId !== mySchool.schoolId ||
        cls.academicYearId !== session.academicYearId
      ) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Invalid classId' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }
    if (body.subjectId !== undefined && body.subjectId !== session.subjectId) {
      const subject = await prisma.subject.findUnique({
        where: { id: body.subjectId },
        select: { schoolId: true },
      });
      if (!subject || subject.schoolId !== mySchool.schoolId) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Invalid subjectId' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }
    if (body.teacherId) {
      const teacher = await prisma.teacher.findUnique({
        where: { id: body.teacherId },
        select: { schoolId: true },
      });
      if (!teacher || teacher.schoolId !== mySchool.schoolId) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Invalid teacherId' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const targets =
      body.scope === 'series' && session.seriesId
        ? await prisma.timetableSession.findMany({
            where: { seriesId: session.seriesId, schoolId: mySchool.schoolId },
            select: { id: true, date: true, startMinutes: true, endMinutes: true },
          })
        : [
            {
              id: session.id,
              date: session.date,
              startMinutes: session.startMinutes,
              endMinutes: session.endMinutes,
            },
          ];

    let catalogRoomName: string | null = null;
    if (body.roomId) {
      const catalogRoom = await findSchoolRoom(prisma, body.roomId, mySchool.schoolId);
      if (!catalogRoom) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Invalid roomId' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      catalogRoomName = catalogRoom.name;
    }
    const next = {
      classId: body.classId ?? session.classId,
      subjectId: body.subjectId ?? session.subjectId,
      teacherId: body.teacherId === undefined ? session.teacherId : body.teacherId,
      roomId: body.roomId === undefined ? session.roomId : body.roomId,
      room:
        catalogRoomName ??
        (body.room === undefined ? session.room : body.room?.trim() ? body.room.trim() : null),
      type: body.type ?? session.type,
      color: body.color === undefined ? session.color : body.color,
      startMinutes: body.startMinutes ?? session.startMinutes,
      endMinutes: body.endMinutes ?? session.endMinutes,
      description:
        body.description === undefined
          ? session.description
          : body.description?.trim()
            ? body.description.trim()
            : null,
      meetingUrl: body.meetingUrl === undefined ? session.meetingUrl : body.meetingUrl,
    };
    if (next.endMinutes <= next.startMinutes) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'endMinutes must be after startMinutes' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const newDate = body.date !== undefined ? parseDay(body.date) : null;

    const result = await prisma.$transaction(async (tx) => {
      const candidates: CandidateSlot[] = targets.map((t) => ({
        dates: [newDate ?? t.date],
        startMinutes: next.startMinutes,
        endMinutes: next.endMinutes,
        classId: next.classId,
        teacherId: next.teacherId,
        room: next.room,
      }));
      const conflicts = await findConflicts(
        tx,
        mySchool.schoolId,
        candidates,
        new Set(targets.map((t) => t.id)),
      );
      if (conflicts.length > 0) return { conflicts };
      await tx.timetableSession.updateMany({
        where: { id: { in: targets.map((t) => t.id) } },
        data: { ...next, ...(newDate ? { date: newDate } : {}) },
      });
      const rows = await tx.timetableSession.findMany({
        where: { id: { in: targets.map((t) => t.id) } },
        orderBy: [{ date: 'asc' }, { startMinutes: 'asc' }],
        include: SESSION_INCLUDE,
      });
      return { rows };
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
    const n = result.rows.length;
    return NextResponse.json(
      { sessions: result.rows.map((s) => serializeSession(s, n)), count: n },
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
    const g = await guard(req, ctx.requestId, id, 'delete');
    if (g instanceof NextResponse) return g;
    const { mySchool, session } = g;

    const scope = req.nextUrl.searchParams.get('scope') === 'series' ? 'series' : 'one';
    if (scope === 'series' && session.seriesId) {
      await prisma.timetableSession.deleteMany({
        where: { seriesId: session.seriesId, schoolId: mySchool.schoolId },
      });
    } else {
      await prisma.timetableSession.delete({ where: { id: session.id } });
    }
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
