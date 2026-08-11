// PATCH /api/school/subjects/[id] — update a subject.
// DELETE /api/school/subjects/[id] — delete, blocked (409) if still
// referenced by a ClassSubject row. See .planning/banani/matieres-list.md.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const UpdateSubjectBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  code: z.string().trim().max(30).nullable().optional(),
  domain: z.string().trim().max(60).nullable().optional(),
  isActive: z.boolean().optional(),
});

async function assertOwnedSubject(id: string, schoolId: string) {
  const subject = await prisma.subject.findUnique({ where: { id } });
  if (!subject || subject.schoolId !== schoolId) return null;
  return subject;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const existing = await assertOwnedSubject(id, mySchool.schoolId);
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Subject not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = UpdateSubjectBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));

    const subject = await prisma.subject.update({ where: { id }, data });
    return NextResponse.json({ subject }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool || !hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const existing = await assertOwnedSubject(id, mySchool.schoolId);
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Subject not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const inUse = await prisma.classSubject.count({ where: { subjectId: id } });
    if (inUse > 0) {
      return NextResponse.json(
        {
          error: 'SUBJECT_IN_USE',
          message:
            'Cette matière est encore affectée à des classes — retire les affectations avant de la supprimer.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.subject.delete({ where: { id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
