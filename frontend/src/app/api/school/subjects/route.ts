// GET /api/school/subjects — subject catalog for the caller's school, with
// per-subject aggregates (class count, distinct teacher names) computed from
// ClassSubject so the Matières table doesn't need a second round trip.
// DRAFT subjects are excluded unless `?includeDrafts=1` (only the Matières
// list asks for them — pickers must never offer a draft, add-matiere.md).
//
// POST /api/school/subjects — create a subject with its full profile
// (add-matiere.md); `classIds` attaches the "Classes concernées" quick
// selection as ClassSubject rows in the same transaction.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import {
  SUBJECT_PROFILE_SELECT,
  SubjectProfileBody,
  assertSubjectRelationsOwned,
  splitSubjectInput,
  validateScoreBounds,
} from '@/lib/server/subjects';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { z } from 'zod';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'configuration',
      'view',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const includeDrafts = req.nextUrl.searchParams.get('includeDrafts') === '1';
    const subjects = await prisma.subject.findMany({
      where: {
        schoolId: mySchool.schoolId,
        ...(includeDrafts ? {} : { status: { not: 'DRAFT' } }),
      },
      orderBy: { name: 'asc' },
      select: {
        ...SUBJECT_PROFILE_SELECT,
        classSubjects: {
          select: {
            coefficient: true,
            class: { select: { id: true, name: true } },
            teacher: { select: { name: true } },
          },
        },
      },
    });

    return NextResponse.json(
      {
        subjects: subjects.map(({ classSubjects, ...s }) => ({
          ...s,
          classes: classSubjects.map((cs) => ({ id: cs.class.id, name: cs.class.name })),
          teacherNames: [...new Set(classSubjects.map((cs) => cs.teacher?.name).filter(Boolean))],
          coefficients: classSubjects
            .map((cs) => cs.coefficient)
            .filter((c): c is number => c !== null),
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const CreateSubjectBody = SubjectProfileBody.extend({
  name: z.string().trim().min(2).max(120),
  classIds: z.array(z.string().min(1)).max(100).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(
      auth.user.sub,
      'configuration',
      'create',
      ctx.requestId,
    );
    if (!perm.ok) return perm.response;
    const mySchool = perm.mySchool;

    const parsed = CreateSubjectBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { classIds, ...input } = parsed.data;
    const boundsError = validateScoreBounds({
      maxScore: input.maxScore ?? 20,
      passingScore: input.passingScore ?? 10,
      eliminatoryScore: input.eliminatoryScore ?? null,
    });
    if (boundsError) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: boundsError },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const relationError = await assertSubjectRelationsOwned(mySchool.schoolId, input, null);
    if (relationError) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: relationError },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (classIds && classIds.length > 0) {
      const owned = await prisma.class.count({
        where: { id: { in: classIds }, schoolId: mySchool.schoolId },
      });
      if (owned !== new Set(classIds).size) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Invalid classIds' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }
    if (input.code) {
      const taken = await prisma.subject.count({
        where: { schoolId: mySchool.schoolId, code: input.code },
      });
      if (taken > 0) {
        return NextResponse.json(
          {
            error: 'SUBJECT_CODE_TAKEN',
            message: 'Ce code est déjà utilisé par une autre matière.',
          },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const { data, prerequisiteIds } = splitSubjectInput(input);
    const subject = await prisma.$transaction(async (tx) => {
      const created = await tx.subject.create({
        data: {
          ...data,
          name: input.name,
          schoolId: mySchool.schoolId,
          ...(prerequisiteIds && prerequisiteIds.length > 0
            ? { prerequisites: { connect: prerequisiteIds.map((id) => ({ id })) } }
            : {}),
        },
        select: SUBJECT_PROFILE_SELECT,
      });
      if (classIds && classIds.length > 0) {
        await tx.classSubject.createMany({
          data: [...new Set(classIds)].map((classId) => ({
            classId,
            subjectId: created.id,
            coefficient: input.defaultCoefficient ?? null,
          })),
          skipDuplicates: true,
        });
      }
      return created;
    });

    return NextResponse.json(
      { subject },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
