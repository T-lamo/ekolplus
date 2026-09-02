// Academic Year Rollover — draft CRUD.
//
// Backs the "nouvelle année" wizard's autosave: GET loads the in-progress
// draft (or, when none exists yet, a fresh-start payload built from the
// currently active AcademicYear via `getPromotionData`) — plus the school's
// ordered `gradeLevels` for Step 2's auto-suggest; POST creates the
// one-per-school draft; PATCH autosaves wizard steps into it; DELETE clears
// it (e.g. "recommencer" / abandon). The atomic commit that actually creates
// the new AcademicYear lives in a sibling confirm route (Task 5) and calls
// `executeRollover` from `@/lib/server/academic-year-rollover` inside a
// transaction — this route only ever reads/writes the draft row.
//
// OWNER-only (same rationale as reset-year: this gates the single most
// consequential scoped action short of deleting the school), gated the same
// way as reset-year — a single 404 for "no school" or "role below OWNER" so
// non-owners can't distinguish "you're not in this school" from "you're not
// the owner."
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { AcademicYearRolloverDraft } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { hasMinRole, resolveActiveAcademicYear } from '@/lib/server/school';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import { getPromotionData, validateMappingOwnership } from '@/lib/server/academic-year-rollover';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import type {
  ClassMappingEntry,
  StudentExceptionEntry,
} from '@/app/(school)/settings/nouvelle-annee/types';
import {
  findDemotions,
  findExceptionDemotions,
  formatDemotions,
} from '@/app/(school)/settings/nouvelle-annee/promotion-rules';

const NewClassSchema = z.object({
  name: z.string().trim().min(1),
  level: z.string().trim().min(1),
  room: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  homeroomTeacherId: z.string().optional(),
});

const ClassMappingEntrySchema = z
  .object({
    destClassId: z.string().optional(),
    unenroll: z.boolean().optional(),
    isNew: z.boolean().optional(),
    newClass: NewClassSchema.optional(),
  })
  // A malformed entry (`isNew: true` with no `newClass` payload) is
  // logically incomplete — reject it here rather than persist a draft that
  // `executeRollover` can't act on (see Task 3's implementer note).
  .refine((v) => !v.isNew || v.newClass, { message: 'newClass is required when isNew is true' });

const StudentExceptionEntrySchema = z.object({
  destClassId: z.string().optional(),
  skip: z.boolean().optional(),
});

const CreateDraftBody = z.object({
  newYearLabel: z.string().min(1),
  newYearStartDate: z.string().datetime(),
  newYearEndDate: z.string().datetime(),
});

const UpdateDraftBody = z.object({
  newYearLabel: z.string().min(1).optional(),
  newYearStartDate: z.string().datetime().optional(),
  newYearEndDate: z.string().datetime().optional(),
  classMapping: z.record(z.string(), ClassMappingEntrySchema).optional(),
  studentExceptions: z.record(z.string(), StudentExceptionEntrySchema).optional(),
});

/** Loads the active year's classes (+ enrollments when exceptions are
 * present) and the grade-level catalog, and returns a 400
 * `DEMOTION_NOT_ALLOWED` response when any mapping/exception sends students
 * to a level below their current one — or null when everything is fine. */
async function rejectDemotions(
  schoolId: string,
  classMapping: Record<string, ClassMappingEntry> | undefined,
  studentExceptions: Record<string, StudentExceptionEntry> | undefined,
  requestId: string,
): Promise<NextResponse | null> {
  const hasMapping = classMapping && Object.keys(classMapping).length > 0;
  const hasExceptions = studentExceptions && Object.keys(studentExceptions).length > 0;
  if (!hasMapping && !hasExceptions) return null;

  const activeYear = await resolveActiveAcademicYear(schoolId);
  if (!activeYear) return null;

  const [classes, gradeLevels] = await Promise.all([
    prisma.class.findMany({
      where: { schoolId, academicYearId: activeYear.id },
      select: { id: true, name: true, level: true },
    }),
    prisma.gradeLevel.findMany({
      where: { schoolId },
      orderBy: { order: 'asc' },
      select: { name: true, order: true },
    }),
  ]);
  if (gradeLevels.length === 0) return null;

  const demotions = hasMapping ? findDemotions(classMapping, classes, gradeLevels) : [];
  if (demotions.length > 0) {
    return NextResponse.json(
      { error: 'DEMOTION_NOT_ALLOWED', message: formatDemotions(demotions), demotions },
      { status: 400, headers: { 'x-request-id': requestId } },
    );
  }

  if (hasExceptions) {
    const enrollments = await prisma.enrollment.findMany({
      where: { academicYearId: activeYear.id, studentId: { in: Object.keys(studentExceptions) } },
      select: { studentId: true, classId: true },
    });
    const bad = findExceptionDemotions(
      studentExceptions,
      enrollments.map((e) => ({ id: e.studentId, classId: e.classId })),
      classes,
      gradeLevels,
    );
    if (bad.length > 0) {
      return NextResponse.json(
        {
          error: 'DEMOTION_NOT_ALLOWED',
          message: `Rétrogradation impossible pour ${bad.length} élève(s) : la classe de destination doit être d'un niveau égal ou supérieur.`,
          exceptions: bad,
        },
        { status: 400, headers: { 'x-request-id': requestId } },
      );
    }
  }
  return null;
}

function serializeDraft(draft: AcademicYearRolloverDraft) {
  return {
    id: draft.id,
    newYearLabel: draft.newYearLabel,
    newYearStartDate: draft.newYearStartDate,
    newYearEndDate: draft.newYearEndDate,
    classMapping: draft.classMapping,
    studentExceptions: draft.studentExceptions,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'parametres', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;
    if (!hasMinRole(mySchool.role, 'OWNER')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const draft = await prisma.academicYearRolloverDraft.findUnique({
      where: { schoolId: mySchool.schoolId },
    });

    // Resolve the active year + fresh class/student promotion data
    // unconditionally, regardless of whether a draft already exists. A
    // resumed draft (Step 2/3 of the wizard) still needs `classes`/
    // `students` to render — without this, the existing-draft branch used
    // to omit them entirely, leaving Step 2/3 with empty lists.
    const activeYear = await resolveActiveAcademicYear(mySchool.schoolId);
    if (!activeYear) {
      return NextResponse.json(
        { error: 'NO_ACTIVE_YEAR', message: 'Aucune année scolaire active.' },
        { status: 424, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // `gradeLevels` feeds Step 2's "Suggérer toutes les promotions" — the
    // school's ordered level catalog (Configuration → Niveaux). One extra
    // query in the same request; empty array when the school hasn't
    // configured any (the button then no-ops with a hint).
    const [{ classes, students }, gradeLevels] = await Promise.all([
      getPromotionData(mySchool.schoolId, activeYear.id),
      prisma.gradeLevel.findMany({
        where: { schoolId: mySchool.schoolId },
        orderBy: { order: 'asc' },
        select: { id: true, name: true, order: true },
      }),
    ]);

    return NextResponse.json(
      {
        draft: draft ? serializeDraft(draft) : null,
        activeYear: { id: activeYear.id, label: activeYear.label },
        classes,
        students,
        gradeLevels,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'parametres',
      'create',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;
    if (!hasMinRole(mySchool.role, 'OWNER')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = CreateDraftBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existingDraft = await prisma.academicYearRolloverDraft.findUnique({
      where: { schoolId: mySchool.schoolId },
    });
    if (existingDraft) {
      return NextResponse.json(
        { error: 'DRAFT_EXISTS', message: 'A rollover draft already exists for this school.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const draft = await prisma.academicYearRolloverDraft.create({
      data: {
        schoolId: mySchool.schoolId,
        createdBy: auth.user.sub,
        newYearLabel: parsed.data.newYearLabel,
        newYearStartDate: new Date(parsed.data.newYearStartDate),
        newYearEndDate: new Date(parsed.data.newYearEndDate),
        classMapping: {},
        studentExceptions: {},
      },
    });

    return NextResponse.json(
      { draft: serializeDraft(draft) },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'parametres', 'edit', ctx.requestId);
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;
    if (!hasMinRole(mySchool.role, 'OWNER')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = UpdateDraftBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Cross-tenant guard: every destClassId (classMapping/studentExceptions)
    // and homeroomTeacherId (classMapping[*].newClass) must belong to this
    // school. Reject before persisting — a malicious OWNER of school A could
    // otherwise point a destClassId at school B's class and have it
    // dereferenced (Enrollment creation) at confirm time.
    const mappingOwnershipOk = await validateMappingOwnership(
      prisma,
      mySchool.schoolId,
      // Zod's inferred type structurally matches ClassMappingEntry/
      // StudentExceptionEntry but differs under `exactOptionalPropertyTypes`
      // (zod's `.optional()` types each field as `T | undefined`, not
      // "absent or T") — same cast confirm/route.ts already uses for the
      // draft's stored JSON fields.
      parsed.data.classMapping as unknown as Record<string, ClassMappingEntry> | undefined,
      parsed.data.studentExceptions as unknown as Record<string, StudentExceptionEntry> | undefined,
    );
    if (!mappingOwnershipOk) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid destClassId or homeroomTeacherId' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Business rule — NO DEMOTION (user decision 2026-08-17): a destination
    // whose level ranks below the source's level in the school's grade-level
    // catalog is refused, for class mappings and per-student exceptions
    // alike. Same rule the wizard enforces client-side (promotion-rules.ts);
    // re-checked here so a stale/hand-crafted draft can't bypass it. Skipped
    // when there is no active year (GET already 424s in that case).
    const demotionFail = await rejectDemotions(
      mySchool.schoolId,
      parsed.data.classMapping as unknown as Record<string, ClassMappingEntry> | undefined,
      parsed.data.studentExceptions as unknown as Record<string, StudentExceptionEntry> | undefined,
      ctx.requestId,
    );
    if (demotionFail) return demotionFail;

    const existingDraft = await prisma.academicYearRolloverDraft.findUnique({
      where: { schoolId: mySchool.schoolId },
    });
    if (!existingDraft) {
      return NextResponse.json(
        { error: 'DRAFT_NOT_FOUND', message: 'Aucun brouillon de rentrée trouvé.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const rawData = {
      newYearLabel: parsed.data.newYearLabel,
      newYearStartDate: parsed.data.newYearStartDate
        ? new Date(parsed.data.newYearStartDate)
        : undefined,
      newYearEndDate: parsed.data.newYearEndDate ? new Date(parsed.data.newYearEndDate) : undefined,
      classMapping: parsed.data.classMapping,
      studentExceptions: parsed.data.studentExceptions,
    };
    const data = Object.fromEntries(Object.entries(rawData).filter(([, v]) => v !== undefined));

    const draft = await prisma.academicYearRolloverDraft.update({
      where: { schoolId: mySchool.schoolId },
      data,
    });

    return NextResponse.json(
      { draft: serializeDraft(draft) },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'parametres',
      'delete',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;
    if (!hasMinRole(mySchool.role, 'OWNER')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existingDraft = await prisma.academicYearRolloverDraft.findUnique({
      where: { schoolId: mySchool.schoolId },
    });
    if (!existingDraft) {
      return NextResponse.json(
        { error: 'DRAFT_NOT_FOUND', message: 'Aucun brouillon de rentrée trouvé.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.academicYearRolloverDraft.delete({
      where: { schoolId: mySchool.schoolId },
    });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
