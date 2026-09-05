// Qualitative sheets: one CriteriaAssessment per class-subject and term,
// the mirror of Evaluation + Grade for qualitative subjects. Shared by the
// teacher route and the school route, which expose identical contracts.
// A GET never writes: an unsaved sheet is returned as a virtual empty sheet
// (id null, status DRAFT). Spec 2026-09-05 §5.1.
import 'server-only';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { resolveCurrentTerm } from '@/lib/server/grades';

export const SaveSheetBody = z.object({
  termId: z.string().min(1),
  status: z.enum(['DRAFT', 'PUBLISHED']),
  ratings: z
    .array(
      z.object({
        studentId: z.string().min(1),
        criterionId: z.string().min(1),
        // null erases the tick; otherwise an index into Subject.ratingScale.
        level: z.number().int().min(0).nullable(),
      }),
    )
    .max(5000),
});
export type SaveSheetInput = z.infer<typeof SaveSheetBody>;

export type SheetStatus = 'DRAFT' | 'PUBLISHED';

export interface SheetStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  /** criterionId → level (index into ratingScale); absent = not rated yet. */
  ratings: Record<string, number>;
}

export interface CriteriaSheet {
  /** null while the sheet has never been saved (virtual empty sheet). */
  id: string | null;
  status: SheetStatus;
  term: { id: string; label: string; gradeEntryEnabled: boolean };
  /** Every term of the class year, for the picker. */
  terms: { id: string; label: string }[];
  classSubject: { id: string; className: string };
  subject: {
    id: string;
    name: string;
    ratingScale: string[];
    criteria: { id: string; label: string }[];
  };
  students: SheetStudent[];
}

export interface SheetContext {
  id: string;
  classId: string;
  class: { name: string; academicYearId: string };
  subject: CriteriaSheet['subject'];
}

/**
 * The class-subject when it belongs to `schoolId` AND its subject is
 * QUALITATIVE; null otherwise (a numeric subject has no sheet: 404 upstream).
 */
export async function loadSheetContext(
  classSubjectId: string,
  schoolId: string,
): Promise<SheetContext | null> {
  const cs = await prisma.classSubject.findFirst({
    where: { id: classSubjectId, class: { schoolId } },
    select: {
      id: true,
      classId: true,
      class: { select: { name: true, academicYearId: true } },
      subject: {
        select: {
          id: true,
          name: true,
          evaluationMode: true,
          ratingScale: true,
          criteria: { orderBy: { order: 'asc' }, select: { id: true, label: true } },
        },
      },
    },
  });
  if (!cs || cs.subject.evaluationMode !== 'QUALITATIVE') return null;
  return {
    id: cs.id,
    classId: cs.classId,
    class: { name: cs.class.name, academicYearId: cs.class.academicYearId },
    subject: {
      id: cs.subject.id,
      name: cs.subject.name,
      ratingScale: cs.subject.ratingScale,
      criteria: cs.subject.criteria,
    },
  };
}

function roster(classId: string, academicYearId: string) {
  return prisma.enrollment.findMany({
    where: { classId, academicYearId },
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    select: { studentId: true, student: { select: { firstName: true, lastName: true } } },
  });
}

function findTerm(ctx: SheetContext, termId: string) {
  return prisma.term.findFirst({
    where: { id: termId, academicYearId: ctx.class.academicYearId },
    select: { id: true, label: true, gradeEntryEnabled: true },
  });
}

/**
 * The sheet for `termId` (null = the current term by date, the notebooks'
 * rule), or the virtual empty one; null when the term is not in the class's
 * year.
 */
export async function loadSheet(
  ctx: SheetContext,
  termId: string | null,
): Promise<CriteriaSheet | null> {
  const terms = await prisma.term.findMany({
    where: { academicYearId: ctx.class.academicYearId },
    orderBy: { order: 'asc' },
  });
  const term = termId ? (terms.find((t) => t.id === termId) ?? null) : resolveCurrentTerm(terms);
  if (!term) return null;
  const [enrollments, stored] = await Promise.all([
    roster(ctx.classId, ctx.class.academicYearId),
    prisma.criteriaAssessment.findUnique({
      where: { classSubjectId_termId: { classSubjectId: ctx.id, termId: term.id } },
      select: {
        id: true,
        status: true,
        ratings: { select: { studentId: true, criterionId: true, level: true } },
      },
    }),
  ]);
  const byStudent = new Map<string, Record<string, number>>();
  for (const r of stored?.ratings ?? []) {
    const bucket = byStudent.get(r.studentId) ?? {};
    bucket[r.criterionId] = r.level;
    byStudent.set(r.studentId, bucket);
  }
  return {
    id: stored?.id ?? null,
    status: stored?.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
    term: { id: term.id, label: term.label, gradeEntryEnabled: term.gradeEntryEnabled },
    terms: terms.map((t) => ({ id: t.id, label: t.label })),
    classSubject: { id: ctx.id, className: ctx.class.name },
    subject: ctx.subject,
    students: enrollments.map((e) => ({
      studentId: e.studentId,
      firstName: e.student.firstName,
      lastName: e.student.lastName,
      ratings: byStudent.get(e.studentId) ?? {},
    })),
  };
}

export type SaveSheetError =
  | 'TERM_NOT_FOUND'
  | 'GRADE_ENTRY_DISABLED'
  | 'UNKNOWN_STUDENT'
  | 'UNKNOWN_CRITERION'
  | 'LEVEL_OUT_OF_RANGE';

/**
 * One transaction: upsert the sheet, then replace every tick the payload
 * mentions with two bulk statements instead of one round-trip per rating
 * (the payload holds up to 5000). Duplicate targets in the same payload are
 * de-duplicated last-one-wins, matching the sequential upserts this replaced.
 */
async function runSaveTransaction(
  ctx: SheetContext,
  termId: string,
  input: SaveSheetInput,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const sheet = await tx.criteriaAssessment.upsert({
      where: { classSubjectId_termId: { classSubjectId: ctx.id, termId } },
      create: { classSubjectId: ctx.id, termId, status: input.status },
      update: { status: input.status },
      select: { id: true },
    });

    if (input.ratings.length === 0) return;

    await tx.criteriaRating.deleteMany({
      where: {
        assessmentId: sheet.id,
        OR: input.ratings.map((r) => ({ studentId: r.studentId, criterionId: r.criterionId })),
      },
    });

    const toCreate = new Map<string, { studentId: string; criterionId: string; level: number }>();
    for (const r of input.ratings) {
      if (r.level !== null) {
        toCreate.set(`${r.studentId}:${r.criterionId}`, {
          studentId: r.studentId,
          criterionId: r.criterionId,
          level: r.level,
        });
      }
    }
    if (toCreate.size > 0) {
      await tx.criteriaRating.createMany({
        data: [...toCreate.values()].map((r) => ({ assessmentId: sheet.id, ...r })),
      });
    }
  });
}

/**
 * Upserts the sheet (status) and replaces the ticks it receives: `level`
 * null erases, otherwise the tick is written. Ticks not mentioned are
 * left as they are, so a per-student screen can save one student at a time.
 */
export async function saveSheet(
  ctx: SheetContext,
  input: SaveSheetInput,
): Promise<{ ok: true; sheet: CriteriaSheet } | { ok: false; error: SaveSheetError }> {
  const term = await findTerm(ctx, input.termId);
  if (!term) return { ok: false, error: 'TERM_NOT_FOUND' };
  if (!term.gradeEntryEnabled) return { ok: false, error: 'GRADE_ENTRY_DISABLED' };

  const criterionIds = new Set(ctx.subject.criteria.map((c) => c.id));
  const scaleSize = ctx.subject.ratingScale.length;
  const enrolled = new Set(
    (await roster(ctx.classId, ctx.class.academicYearId)).map((e) => e.studentId),
  );
  for (const r of input.ratings) {
    if (!enrolled.has(r.studentId)) return { ok: false, error: 'UNKNOWN_STUDENT' };
    if (!criterionIds.has(r.criterionId)) return { ok: false, error: 'UNKNOWN_CRITERION' };
    if (r.level !== null && r.level >= scaleSize) {
      return { ok: false, error: 'LEVEL_OUT_OF_RANGE' };
    }
  }

  try {
    await runSaveTransaction(ctx, term.id, input);
  } catch (err) {
    // Two concurrent saves of the same sheet race the upsert's unique
    // constraint; the losing transaction rolls back cleanly, so a single
    // retry sees the now-committed row and proceeds normally.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      await runSaveTransaction(ctx, term.id, input);
    } else {
      throw err;
    }
  }

  const sheet = await loadSheet(ctx, term.id);
  return sheet ? { ok: true, sheet } : { ok: false, error: 'TERM_NOT_FOUND' };
}

const SAVE_ERROR_MESSAGE: Record<Exclude<SaveSheetError, 'GRADE_ENTRY_DISABLED'>, string> = {
  TERM_NOT_FOUND: 'Invalid termId',
  UNKNOWN_STUDENT: 'A rating targets a student who is not enrolled in this class',
  UNKNOWN_CRITERION: 'A rating targets a criterion of another subject',
  LEVEL_OUT_OF_RANGE: 'A rating level is outside the subject scale',
};

/** HTTP mapping shared by the teacher and school routes. */
export function saveSheetErrorResponse(error: SaveSheetError, requestId: string): NextResponse {
  if (error === 'GRADE_ENTRY_DISABLED') {
    return NextResponse.json(
      {
        error: 'GRADE_ENTRY_DISABLED',
        message: 'La saisie des notes est désactivée pour cette période.',
      },
      { status: 403, headers: { 'x-request-id': requestId } },
    );
  }
  return NextResponse.json(
    { error: 'VALIDATION_FAILED', message: SAVE_ERROR_MESSAGE[error] },
    { status: 400, headers: { 'x-request-id': requestId } },
  );
}
