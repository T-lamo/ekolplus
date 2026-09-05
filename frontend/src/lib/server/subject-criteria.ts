// Criteria of a qualitative subject: the bits the three criteria route files
// share (route modules may only export handlers). Spec 2026-09-05 §4.
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { CRITERION_LABEL_MAX } from '@/lib/qualitative';

export const CriterionBody = z.object({
  label: z.string().trim().min(1).max(CRITERION_LABEL_MAX),
});

export const ReorderBody = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export const CRITERION_SELECT = { id: true, label: true, order: true } as const;

/** The subject id when it belongs to `schoolId`, null otherwise (404 upstream). */
export async function findOwnedSubjectId(
  subjectId: string,
  schoolId: string,
): Promise<string | null> {
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, schoolId },
    select: { id: true },
  });
  return subject?.id ?? null;
}

export function listCriteria(subjectId: string) {
  return prisma.subjectCriterion.findMany({
    where: { subjectId },
    orderBy: { order: 'asc' },
    select: CRITERION_SELECT,
  });
}
