// Annual programme chapters (programme-annuel.md) — helpers shared by the
// /api/school/subjects/[id]/chapters routes.
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const ChapterFields = z.object({
  title: z.string().trim().min(1).max(200),
  objectives: optionalText(2000),
  hours: z.number().min(0).max(500).nullable().optional(),
  reference: optionalText(120),
  competence: optionalText(80),
});

export const CHAPTER_SELECT = {
  id: true,
  subjectId: true,
  termId: true,
  order: true,
  title: true,
  objectives: true,
  hours: true,
  reference: true,
  competence: true,
  updatedAt: true,
} as const;

/** The subject must belong to the school — returns null otherwise. */
export async function findOwnedSubject(schoolId: string, subjectId: string) {
  return prisma.subject.findFirst({
    where: { id: subjectId, schoolId },
    select: { id: true, name: true },
  });
}

/**
 * Chapters live under the *active* academic year's terms; a term id sent by
 * the client must be one of them (cross-tenant + stale-year guard).
 */
export async function findActiveTerms(schoolId: string) {
  const year = await prisma.academicYear.findFirst({
    where: { schoolId, isActive: true },
    orderBy: { startDate: 'desc' },
    select: {
      id: true,
      label: true,
      terms: {
        orderBy: { order: 'asc' },
        select: { id: true, label: true, order: true, startDate: true, endDate: true, type: true },
      },
    },
  });
  return year;
}
