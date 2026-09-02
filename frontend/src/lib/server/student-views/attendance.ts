// One student's full attendance picture — extracted from GET
// /api/school/students/[id]/attendance so the Espace Élève's GET
// /api/student/attendance serves the very same numbers: term summary
// (rate/absences/lates via the helpers the Présences roster uses, so the
// two never drift) plus the full chronological day log for that term.
// Same terms+resolvedTermId shell convention as the appreciations view.
//
// No audience switch here: nothing in this model is staff-only (a
// justification is the student's own), so the Espace Élève gets the fiche's
// exact payload. Returns null when the student has no enrollment at all;
// both routes map that to their existing 404.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { resolveCurrentTerm } from '@/lib/server/grades';
import { absenceCount, attendanceRate, isoDate } from '@/lib/server/attendance';

export interface StudentAttendanceInput {
  studentId: string;
  termId: string | null;
}

export interface StudentAttendanceView {
  studentId: string;
  firstName: string;
  lastName: string;
  terms: { id: string; label: string; order: number }[];
  resolvedTermId: string | null;
  summary: { present: number; absent: number; late: number; excused: number; recorded: number };
  ratePercent: number | null;
  absences: number;
  days: { date: string; status: string; justification: string | null }[];
}

export async function getStudentAttendance(
  input: StudentAttendanceInput,
): Promise<StudentAttendanceView | null> {
  const { studentId } = input;

  const [student, enrollment] = await Promise.all([
    prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      select: { firstName: true, lastName: true },
    }),
    prisma.enrollment.findFirst({
      where: { studentId },
      orderBy: { enrolledAt: 'desc' },
      select: { class: { select: { academicYearId: true } } },
    }),
  ]);
  if (!enrollment) return null;

  const terms = await prisma.term.findMany({
    where: { academicYearId: enrollment.class.academicYearId },
    orderBy: { order: 'asc' },
  });
  const term = input.termId
    ? (terms.find((t) => t.id === input.termId) ?? null)
    : resolveCurrentTerm(terms);

  const shell = {
    studentId,
    firstName: student.firstName,
    lastName: student.lastName,
    terms: terms.map((t) => ({ id: t.id, label: t.label, order: t.order })),
    resolvedTermId: term?.id ?? null,
  };

  if (!term) {
    return {
      ...shell,
      summary: { present: 0, absent: 0, late: 0, excused: 0, recorded: 0 },
      ratePercent: null,
      absences: 0,
      days: [],
    };
  }

  const rows = await prisma.attendance.findMany({
    where: { studentId, date: { gte: term.startDate, lte: term.endDate } },
    orderBy: { date: 'asc' },
  });

  return {
    ...shell,
    summary: {
      present: rows.filter((r) => r.status === 'PRESENT').length,
      absent: rows.filter((r) => r.status === 'ABSENT').length,
      late: rows.filter((r) => r.status === 'LATE').length,
      excused: rows.filter((r) => r.status === 'EXCUSED').length,
      recorded: rows.length,
    },
    ratePercent: attendanceRate(rows),
    absences: absenceCount(rows),
    days: rows.map((r) => ({
      date: isoDate(r.date),
      status: r.status,
      justification: r.justification,
    })),
  };
}
