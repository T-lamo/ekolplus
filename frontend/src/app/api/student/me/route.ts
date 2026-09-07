// GET /api/student/me — the Espace Élève's one aggregate read: this
// student's identity (minus staff-only fields), current class + homeroom
// teacher, active academic year + terms, the current-term summary behind
// the dashboard KPIs, this week's class sessions, and the 5 most recent
// published grades. One round trip avoids a phone-network waterfall of
// separate reads. Student-linked accounts only — anything else gets the
// 404 requireStudent returns (not-found-for-you, matching every other
// ownership-scoped route). The studentId is never a parameter: it is the
// session's own resolved id. See
// docs/superpowers/specs/2026-09-02-espace-eleve-phase2-design.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireStudent } from '@/lib/server/middleware/require-student';
import { prisma } from '@/lib/server/prisma';
import { resolveActiveAcademicYear } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { absenceCount, addDays, attendanceRate, mondayOf } from '@/lib/server/attendance';
import { classGeneralAverages, competitionRank, resolveCurrentTerm } from '@/lib/server/grades';
import { NUMERIC_SUBJECT_FILTER } from '@/lib/server/qualitative';
import {
  SESSION_INCLUDE,
  serializeSession,
  seriesCounts,
  type SerializedSession,
} from '@/lib/server/timetable-route-helpers';

// Monday → Saturday: some schools run Saturday classes; the dashboard's
// week preview only widens to 6 columns when a Saturday session exists.
const WEEK_SPAN_DAYS = 6;
const RECENT_GRADES = 5;

interface Summary {
  overallAverage: number | null;
  rank: number | null;
  rankedCount: number;
  attendanceRatePercent: number | null;
  absences: number;
}

const EMPTY_SUMMARY: Summary = {
  overallAverage: null,
  rank: null,
  rankedCount: 0,
  attendanceRatePercent: null,
  absences: 0,
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStudent(req);
    if (auth instanceof NextResponse) return auth;
    const { studentId, schoolId, classId } = auth.student;

    const [student, school, cls, activeYear] = await Promise.all([
      prisma.student.findUniqueOrThrow({
        where: { id: studentId },
        // Deliberately no `notes` (staff-only observations) and no
        // `userId`/`user` (invite-state plumbing the fiche needs, not the
        // student). Spec decision 5.
        select: {
          id: true,
          studentNumber: true,
          firstName: true,
          lastName: true,
          photoUrl: true,
          dateOfBirth: true,
          placeOfBirth: true,
          gender: true,
          nationality: true,
          address: true,
          motherTongue: true,
          phone: true,
          email: true,
          status: true,
          enrolledAt: true,
          scholarship: true,
          guardians: {
            orderBy: { isPrimary: 'desc' },
            select: {
              id: true,
              name: true,
              relationship: true,
              phone: true,
              email: true,
              isPrimary: true,
            },
          },
        },
      }),
      prisma.school.findUniqueOrThrow({
        where: { id: schoolId },
        select: { id: true, name: true },
      }),
      classId
        ? prisma.class.findUnique({
            where: { id: classId },
            select: {
              id: true,
              name: true,
              level: true,
              homeroomTeacher: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve(null),
      resolveActiveAcademicYear(schoolId),
    ]);

    const terms = activeYear
      ? await prisma.term.findMany({
          where: { academicYearId: activeYear.id },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            label: true,
            order: true,
            type: true,
            startDate: true,
            endDate: true,
          },
        })
      : [];
    const currentTerm = resolveCurrentTerm(terms);

    let thisWeekSessions: SerializedSession[] = [];
    if (activeYear && classId) {
      const from = mondayOf(new Date());
      const to = addDays(from, WEEK_SPAN_DAYS - 1);
      const rows = await prisma.timetableSession.findMany({
        where: { schoolId, academicYearId: activeYear.id, classId, date: { gte: from, lte: to } },
        orderBy: [{ date: 'asc' }, { startMinutes: 'asc' }],
        include: SESSION_INCLUDE,
      });
      const counts = await seriesCounts(prisma, rows);
      thisWeekSessions = rows.map((s) =>
        serializeSession(s, s.seriesId ? counts.get(s.seriesId) : 1),
      );
    }

    // Same moyenne/rang math as /api/school/students/[id]/bulletins, for the
    // current term only; attendance via the same helpers the Présences
    // roster uses, so the dashboard never drifts from the Présences page.
    let summary: Summary = EMPTY_SUMMARY;
    if (activeYear && classId && currentTerm) {
      const [classSubjects, classmates, attendanceRows] = await Promise.all([
        prisma.classSubject.findMany({ where: { classId, ...NUMERIC_SUBJECT_FILTER } }),
        prisma.enrollment.findMany({
          where: { classId, academicYearId: activeYear.id },
          select: { studentId: true },
        }),
        prisma.attendance.findMany({
          where: { studentId, date: { gte: currentTerm.startDate, lte: currentTerm.endDate } },
          select: { status: true },
        }),
      ]);
      const classSubjectIds = classSubjects.map((cs) => cs.id);
      // subjectAverageFor already ignores drafts; the explicit status filter
      // keeps the published-only rule (spec decision 4) visible at the query.
      const evaluations =
        classSubjectIds.length === 0
          ? []
          : await prisma.evaluation.findMany({
              where: {
                classSubjectId: { in: classSubjectIds },
                termId: currentTerm.id,
                status: 'PUBLISHED',
              },
              include: { grades: true },
            });
      const evalsByClassSubject = new Map<string, typeof evaluations>();
      for (const ev of evaluations) {
        const list = evalsByClassSubject.get(ev.classSubjectId) ?? [];
        list.push(ev);
        evalsByClassSubject.set(ev.classSubjectId, list);
      }
      const classmateIds = classmates.map((cm) => cm.studentId);
      const averages = classGeneralAverages(classSubjects, evalsByClassSubject, classmateIds);
      const ranked = classmateIds
        .map((id) => ({ studentId: id, average: averages.get(id) ?? null }))
        .filter((r): r is { studentId: string; average: number } => r.average != null)
        .sort((a, b) => b.average - a.average);
      const ranks = competitionRank(ranked, (r) => r.average);
      const rankEntry = ranked.findIndex((r) => r.studentId === studentId);
      summary = {
        overallAverage: averages.get(studentId) ?? null,
        rank: rankEntry >= 0 ? ranks[rankEntry]! : null,
        rankedCount: ranked.length,
        attendanceRatePercent: attendanceRate(attendanceRows),
        absences: absenceCount(attendanceRows),
      };
    }

    // Recent grades: fetch a small window, then order in memory — dated
    // evaluations newest first, undated ones after them (Postgres would put
    // NULL dates FIRST in a DESC sort, which is the opposite of what a
    // student expects at the top of « Dernières notes »).
    const recentRows = activeYear
      ? await prisma.grade.findMany({
          where: {
            studentId,
            evaluation: { status: 'PUBLISHED', term: { academicYearId: activeYear.id } },
          },
          orderBy: { evaluation: { updatedAt: 'desc' } },
          take: RECENT_GRADES * 4,
          select: {
            score: true,
            absent: true,
            evaluation: {
              select: {
                id: true,
                label: true,
                date: true,
                updatedAt: true,
                maxScore: true,
                classSubject: {
                  select: { subject: { select: { name: true, icon: true, color: true } } },
                },
              },
            },
          },
        })
      : [];
    const recentGrades = [...recentRows]
      .sort((a, b) => {
        const da = a.evaluation.date?.getTime() ?? null;
        const db = b.evaluation.date?.getTime() ?? null;
        if (da != null && db != null) return db - da;
        if (da != null) return -1;
        if (db != null) return 1;
        return b.evaluation.updatedAt.getTime() - a.evaluation.updatedAt.getTime();
      })
      .slice(0, RECENT_GRADES)
      .map((g) => ({
        evaluationId: g.evaluation.id,
        label: g.evaluation.label,
        subjectName: g.evaluation.classSubject.subject.name,
        subjectIcon: g.evaluation.classSubject.subject.icon,
        subjectColor: g.evaluation.classSubject.subject.color,
        date: g.evaluation.date ? g.evaluation.date.toISOString() : null,
        score: g.score,
        maxScore: g.evaluation.maxScore,
        absent: g.absent,
      }));

    return NextResponse.json(
      {
        student: {
          ...student,
          dateOfBirth: student.dateOfBirth.toISOString(),
          enrolledAt: student.enrolledAt.toISOString(),
        },
        school,
        class: cls ? { id: cls.id, name: cls.name, level: cls.level } : null,
        homeroomTeacher: cls?.homeroomTeacher ?? null,
        academicYear: activeYear ? { id: activeYear.id, label: activeYear.label } : null,
        terms: terms.map((t) => ({
          id: t.id,
          label: t.label,
          order: t.order,
          type: t.type,
          startDate: t.startDate.toISOString(),
          endDate: t.endDate.toISOString(),
        })),
        currentTermId: currentTerm?.id ?? null,
        summary,
        thisWeekSessions,
        recentGrades,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
