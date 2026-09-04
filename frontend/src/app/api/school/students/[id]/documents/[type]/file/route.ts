// GET /api/school/students/[id]/documents/[type]/file — the ONLY way to
// read a student's administrative document. Never returns a stored/public
// URL: generates a fresh short-lived Cloudinary signed URL and redirects.
// See docs/superpowers/specs/2026-09-02-dossiers-enrichis-design.md §4.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import {
  getSignedDocumentUrl,
  StorageNotConfiguredError,
} from '@/lib/server/upload/cloudinary-client';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const DOCUMENT_TYPES = [
  'BIRTH_CERTIFICATE',
  'VACCINATION_RECORD',
  'PREVIOUS_SCHOOL_RECORD',
] as const;
type DocumentType = (typeof DOCUMENT_TYPES)[number];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'eleves', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;

    const { id, type: typeParam } = await params;
    if (!DOCUMENT_TYPES.includes(typeParam as DocumentType)) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid document type' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const student = await prisma.student.findUnique({ where: { id } });
    if (!student || student.schoolId !== perm.mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const doc = await prisma.studentDocument.findUnique({
      where: { studentId_type: { studentId: id, type: typeParam as DocumentType } },
      select: { fileKey: true, resourceType: true },
    });
    if (!doc) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Document not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    let url: string;
    try {
      url = getSignedDocumentUrl(doc.fileKey, doc.resourceType, 300);
    } catch (e) {
      if (e instanceof StorageNotConfiguredError) {
        return NextResponse.json(
          { error: 'STORAGE_NOT_CONFIGURED', message: 'Storage not configured' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      return NextResponse.json(
        { error: 'DOWNLOAD_FAILED', message: 'Could not generate a signed URL' },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Explicit 302: NextResponse.redirect() defaults to 307 when the status
    // is omitted, which is fine for a browser GET but not what the spec
    // documents — pin it so behavior doesn't depend on a framework default.
    return NextResponse.redirect(url, { status: 302, headers: { 'x-request-id': ctx.requestId } });
  });
}
