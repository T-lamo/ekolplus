// GET /api/school/attendance?classId=&view=week|month&weekStart=&month= —
// Attendance Tracking's grid read model: the school's classes (for the
// Classe filter), the requested class's roster (via Enrollment, active
// AcademicYear), the Mon–Fri days of the requested week (default) or whole
// calendar month left-joined against Attendance rows, and per-student/
// aggregate rate+absence numbers over the current Term (independent of
// which range is being viewed — always term-wide).
//
// PATCH — upserts one student's one-day record (dot-click cycling, the
// edit modal, and the justify modal all call this same endpoint). Rejects
// future dates. DELETE — clears one record back to "not recorded".
// See .planning/banani/attendance-tracking.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveActiveAcademicYear } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { resolveCurrentTerm } from '@/lib/server/grades';
import {
  SCHOOL_WEEK_DAYS,
  absenceCount,
  addDays,
  attendanceRate,
  dateOnlyUTC,
  isFutureDate,
  isoDate,
  mondayOf,
  weekdaysInMonth,
} from '@/lib/server/attendance';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const EMPTY_SUMMARY = {
  totalStudents: 0,
  className: null as string | null,
  yearLabel: null as string | null,
  presentToday: 0,
  absentToday: 0,
  absentTodayUnjustified: 0,
  lateThisMonth: 0,
  lateThisMonthDelta: 0,
  attendanceRatePercent: null as number | null,
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'presences', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const year = await resolveActiveAcademicYear(mySchool.schoolId);
    const classes = year
      ? await prisma.class.findMany({
          where: { schoolId: mySchool.schoolId, academicYearId: year.id },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        })
      : [];

    const view = req.nextUrl.searchParams.get('view') === 'month' ? 'month' : 'week';
    const today = dateOnlyUTC(new Date());

    let rangeStart: Date;
    let rangeDays: Date[];
    if (view === 'month') {
      const monthParam = req.nextUrl.searchParams.get('month'); // "YYYY-MM"
      const [y, m] = monthParam?.match(/^\d{4}-\d{2}$/)
        ? monthParam.split('-').map(Number)
        : [today.getUTCFullYear(), today.getUTCMonth() + 1];
      rangeStart = new Date(Date.UTC(y!, m! - 1, 1));
      rangeDays = weekdaysInMonth(rangeStart);
    } else {
      const weekStartParam = req.nextUrl.searchParams.get('weekStart');
      rangeStart = mondayOf(weekStartParam ? new Date(weekStartParam) : new Date());
      rangeDays = Array.from({ length: SCHOOL_WEEK_DAYS }, (_, i) => addDays(rangeStart, i));
    }

    if (!year || classes.length === 0) {
      return NextResponse.json(
        {
          classes: [],
          resolvedClassId: null,
          view,
          rangeStart: isoDate(rangeStart),
          days: rangeDays.map((d) => ({
            date: isoDate(d),
            isToday: d.getTime() === today.getTime(),
            isFuture: isFutureDate(d),
          })),
          students: [],
          summary: EMPTY_SUMMARY,
        },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const classIdParam = req.nextUrl.searchParams.get('classId');
    const targetClass = classes.find((c) => c.id === classIdParam) ?? classes[0]!;

    const enrollments = await prisma.enrollment.findMany({
      where: { classId: targetClass.id, academicYearId: year.id },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, studentNumber: true },
        },
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });
    const students = enrollments.map((e) => e.student);
    const studentIds = students.map((s) => s.id);

    const terms = await prisma.term.findMany({ where: { academicYearId: year.id } });
    const term = resolveCurrentTerm(terms);

    const [rangeRows, termRows] = await Promise.all([
      studentIds.length === 0
        ? []
        : prisma.attendance.findMany({
            where: {
              studentId: { in: studentIds },
              date: { gte: rangeDays[0]!, lte: rangeDays[rangeDays.length - 1]! },
            },
          }),
      studentIds.length === 0 || !term
        ? []
        : prisma.attendance.findMany({
            where: {
              studentId: { in: studentIds },
              date: { gte: term.startDate, lte: term.endDate },
            },
          }),
    ]);

    const rangeByStudent = new Map<string, typeof rangeRows>();
    for (const row of rangeRows) {
      const list = rangeByStudent.get(row.studentId) ?? [];
      list.push(row);
      rangeByStudent.set(row.studentId, list);
    }
    const termByStudent = new Map<string, typeof termRows>();
    for (const row of termRows) {
      const list = termByStudent.get(row.studentId) ?? [];
      list.push(row);
      termByStudent.set(row.studentId, list);
    }

    const studentRows = students.map((s) => {
      const rangeForStudent = rangeByStudent.get(s.id) ?? [];
      const days: Record<string, { status: string; justification: string | null } | null> = {};
      for (const d of rangeDays) {
        const iso = isoDate(d);
        const row = rangeForStudent.find((r) => isoDate(r.date) === iso);
        days[iso] = row ? { status: row.status, justification: row.justification } : null;
      }
      const termForStudent = termByStudent.get(s.id) ?? [];
      return {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        studentNumber: s.studentNumber,
        days,
        rate: attendanceRate(termForStudent),
        absences: absenceCount(termForStudent),
      };
    });

    const todayIso = isoDate(today);
    const todayRows = rangeRows.filter((r) => isoDate(r.date) === todayIso);
    const presentToday = todayRows.filter((r) => r.status === 'PRESENT').length;
    const absentToday = todayRows.filter(
      (r) => r.status === 'ABSENT' || r.status === 'EXCUSED',
    ).length;
    const absentTodayUnjustified = todayRows.filter((r) => r.status === 'ABSENT').length;

    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
    const prevMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const prevMonthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
    const [lateThisMonth, lateLastMonth] =
      studentIds.length === 0
        ? [0, 0]
        : await Promise.all([
            prisma.attendance.count({
              where: {
                studentId: { in: studentIds },
                status: 'LATE',
                date: { gte: monthStart, lte: monthEnd },
              },
            }),
            prisma.attendance.count({
              where: {
                studentId: { in: studentIds },
                status: 'LATE',
                date: { gte: prevMonthStart, lte: prevMonthEnd },
              },
            }),
          ]);

    return NextResponse.json(
      {
        classes,
        resolvedClassId: targetClass.id,
        view,
        rangeStart: isoDate(rangeStart),
        days: rangeDays.map((d) => ({
          date: isoDate(d),
          isToday: d.getTime() === today.getTime(),
          isFuture: isFutureDate(d),
        })),
        students: studentRows,
        summary: {
          totalStudents: students.length,
          className: targetClass.name,
          yearLabel: year.label,
          presentToday,
          absentToday,
          absentTodayUnjustified,
          lateThisMonth,
          lateThisMonthDelta: lateThisMonth - lateLastMonth,
          attendanceRatePercent: attendanceRate(termRows),
        },
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const MarkAttendanceBody = z.object({
  studentId: z.string().min(1),
  date: z.coerce.date(),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
  justification: z.string().trim().max(500).nullable().optional(),
});

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'presences', 'edit', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const parsed = MarkAttendanceBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const date = dateOnlyUTC(parsed.data.date);
    if (isFutureDate(date)) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Cannot mark attendance for a future date' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const student = await prisma.student.findUnique({ where: { id: parsed.data.studentId } });
    if (!student || student.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const attendance = await prisma.attendance.upsert({
      where: { studentId_date: { studentId: parsed.data.studentId, date } },
      create: {
        studentId: parsed.data.studentId,
        date,
        status: parsed.data.status,
        justification: parsed.data.justification ?? null,
        markedById: auth.user.sub,
      },
      update: {
        status: parsed.data.status,
        justification: parsed.data.justification ?? null,
        markedById: auth.user.sub,
      },
    });

    return NextResponse.json({ attendance }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'presences', 'delete', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const studentId = req.nextUrl.searchParams.get('studentId');
    const dateParam = req.nextUrl.searchParams.get('date');
    if (!studentId || !dateParam) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'studentId and date are required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student || student.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const date = dateOnlyUTC(new Date(dateParam));
    await prisma.attendance
      .delete({ where: { studentId_date: { studentId, date } } })
      .catch(() => null); // already absent (no row) — deleting is idempotent

    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
