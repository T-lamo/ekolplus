// Shared merge of the school's grade/absence/payment/enrollment events into
// one feed, newest first — backs both the dashboard's RecentActivityCard
// preview (school-dashboard.ts, 5 per source, top 8 overall) and the full
// "Tout voir" activity log (/api/school/activity, paginated). There is no
// single AuditLog table for this — these are read straight from their
// source tables, so `limitPerType` bounds how deep each query looks before
// the merge+sort, not how many rows are returned overall.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { DASHBOARD } from '@/lib/constants';

export type ActivityType = 'grade' | 'absence' | 'payment' | 'enrollment';

export interface ActivityItem {
  type: ActivityType;
  text: string;
  at: string;
}

export async function queryActivityEvents(
  schoolId: string,
  academicYearId: string,
  { type, limitPerType }: { type?: ActivityType | undefined; limitPerType: number },
): Promise<ActivityItem[]> {
  const wants = (t: ActivityType) => !type || type === t;

  const [gradeEvents, absenceEvents, paymentEvents, enrollmentEvents] = await Promise.all([
    wants('grade')
      ? prisma.grade.findMany({
          where: {
            score: { not: null },
            evaluation: {
              status: 'PUBLISHED',
              classSubject: { class: { schoolId, academicYearId } },
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: limitPerType,
          select: {
            updatedAt: true,
            evaluation: {
              select: {
                classSubject: {
                  select: {
                    subject: { select: { name: true } },
                    class: { select: { name: true } },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    wants('absence')
      ? prisma.attendance.findMany({
          where: { status: 'ABSENT', student: { schoolId } },
          orderBy: { createdAt: 'desc' },
          take: limitPerType,
          select: {
            createdAt: true,
            student: {
              select: {
                firstName: true,
                lastName: true,
                enrollments: {
                  where: { academicYearId },
                  select: { class: { select: { name: true } } },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    wants('payment')
      ? prisma.feePayment.findMany({
          where: { schoolId },
          orderBy: { createdAt: 'desc' },
          take: limitPerType,
          select: {
            createdAt: true,
            student: {
              select: {
                firstName: true,
                lastName: true,
                enrollments: {
                  where: { academicYearId },
                  select: { class: { select: { name: true } } },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    wants('enrollment')
      ? prisma.enrollment.findMany({
          where: { academicYearId },
          orderBy: { enrolledAt: 'desc' },
          take: limitPerType,
          select: {
            enrolledAt: true,
            student: { select: { firstName: true, lastName: true } },
            class: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const events: { type: ActivityType; text: string; at: Date }[] = [
    ...gradeEvents.map((g) => ({
      type: 'grade' as const,
      text: DASHBOARD.activity.gradeUpdated(
        g.evaluation.classSubject.subject.name,
        g.evaluation.classSubject.class.name,
      ),
      at: g.updatedAt,
    })),
    ...absenceEvents.map((a) => ({
      type: 'absence' as const,
      text: DASHBOARD.activity.absenceMarked(
        `${a.student.firstName} ${a.student.lastName}`,
        a.student.enrollments[0]?.class.name ?? '—',
      ),
      at: a.createdAt,
    })),
    ...paymentEvents.map((p) => ({
      type: 'payment' as const,
      text: DASHBOARD.activity.paymentRecorded(
        `${p.student.firstName} ${p.student.lastName}`,
        p.student.enrollments[0]?.class.name ?? '—',
      ),
      at: p.createdAt,
    })),
    ...enrollmentEvents.map((e) => ({
      type: 'enrollment' as const,
      text: DASHBOARD.activity.studentEnrolled(
        `${e.student.firstName} ${e.student.lastName}`,
        e.class.name,
      ),
      at: e.enrolledAt,
    })),
  ];

  return events
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map((e) => ({ type: e.type, text: e.text, at: e.at.toISOString() }));
}
