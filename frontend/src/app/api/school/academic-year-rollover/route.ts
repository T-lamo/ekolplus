// Academic Year Rollover — draft CRUD.
//
// Backs the "nouvelle année" wizard's autosave: GET loads the in-progress
// draft (or, when none exists yet, a fresh-start payload built from the
// currently active AcademicYear via `getPromotionData`); POST creates the
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
import { resolveMySchool, hasMinRole, resolveActiveAcademicYear } from '@/lib/server/school';
import { getPromotionData } from '@/lib/server/academic-year-rollover';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const NewClassSchema = z.object({
  name: z.string(),
  level: z.string(),
  room: z.string().optional(),
  capacity: z.number().optional(),
  homeroomTeacherId: z.string().optional(),
});

const ClassMappingEntrySchema = z
  .object({
    destClassId: z.string().optional(),
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

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'OWNER')) {
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

    const { classes, students } = await getPromotionData(mySchool.schoolId, activeYear.id);

    return NextResponse.json(
      {
        draft: draft ? serializeDraft(draft) : null,
        activeYear: { id: activeYear.id, label: activeYear.label },
        classes,
        students,
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

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'OWNER')) {
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

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'OWNER')) {
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

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'OWNER')) {
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
