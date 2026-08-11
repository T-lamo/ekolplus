// GET /api/school/subjects — subject catalog for the caller's school, with
// per-subject aggregates (class count, distinct teacher names) computed from
// ClassSubject so the Matières table doesn't need a second round trip.
//
// POST /api/school/subjects — create a subject. See .planning/banani/matieres-list.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const subjects = await prisma.subject.findMany({
      where: { schoolId: mySchool.schoolId },
      orderBy: { name: 'asc' },
      include: {
        classSubjects: {
          include: {
            class: { select: { id: true, name: true } },
            teacher: { select: { name: true } },
          },
        },
      },
    });

    return NextResponse.json(
      {
        subjects: subjects.map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
          domain: s.domain,
          isActive: s.isActive,
          classes: s.classSubjects.map((cs) => ({ id: cs.class.id, name: cs.class.name })),
          teacherNames: [...new Set(s.classSubjects.map((cs) => cs.teacher?.name).filter(Boolean))],
          coefficients: s.classSubjects
            .map((cs) => cs.coefficient)
            .filter((c): c is number => c !== null),
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const CreateSubjectBody = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().max(30).nullable().optional(),
  domain: z.string().trim().max(60).nullable().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'ORG_ROLE_INSUFFICIENT', message: 'Insufficient organization role' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = CreateSubjectBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const subject = await prisma.subject.create({
      data: {
        schoolId: mySchool.schoolId,
        name: parsed.data.name,
        code: parsed.data.code ?? null,
        domain: parsed.data.domain ?? null,
      },
    });

    return NextResponse.json(
      { subject },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
