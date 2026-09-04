// POST /api/school/students/[id]/documents — upload (or replace) one of the
// student's 3 fixed administrative documents. GET — list which of the 3
// types are present, without ever exposing the Cloudinary fileKey.
// See docs/superpowers/specs/2026-09-02-dossiers-enrichis-design.md §4.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { requireSchoolPermission } from '@/lib/server/school-permissions';
import {
  deleteAsset,
  uploadBuffer,
  StorageNotConfiguredError,
} from '@/lib/server/upload/cloudinary-client';
import { verifyMagicBytes } from '@/lib/server/upload/sniff';
import { sanitizeFilename } from '@/lib/server/upload/sanitize-filename';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const DOCUMENT_TYPES = [
  'BIRTH_CERTIFICATE',
  'VACCINATION_RECORD',
  'PREVIOUS_SCHOOL_RECORD',
] as const;
type DocumentType = (typeof DOCUMENT_TYPES)[number];
const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_BYTES = 10 * 1024 * 1024;

async function assertOwnedStudent(id: string, schoolId: string) {
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student || student.schoolId !== schoolId) return null;
  return student;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'eleves', 'view', ctx.requestId);
    if (!perm.ok) return perm.response;

    const { id } = await params;
    const student = await assertOwnedStudent(id, perm.mySchool.schoolId);
    if (!student) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const rows = await prisma.studentDocument.findMany({
      where: { studentId: id },
      select: { type: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true },
    });

    // Map explicitly rather than trusting `select` alone to keep `fileKey`
    // (the internal Cloudinary public_id) out of the response — the one
    // invariant this whole feature exists to protect.
    const documents = rows.map((row) => ({
      type: row.type,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      uploadedAt: row.uploadedAt,
    }));

    return NextResponse.json({ documents }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const perm = await requireSchoolPermission(auth.user.sub, 'eleves', 'edit', ctx.requestId);
    if (!perm.ok) return perm.response;

    const { id } = await params;
    const student = await assertOwnedStudent(id, perm.mySchool.schoolId);
    if (!student) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Student not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const form = await req.formData();
    const typeRaw = form.get('type');
    const file = form.get('file');

    if (typeof typeRaw !== 'string' || !DOCUMENT_TYPES.includes(typeRaw as DocumentType)) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid document type' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const type = typeRaw as DocumentType;

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'UPLOAD_MISSING_FILE', message: 'file field is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'FILE_TOO_LARGE', message: `Max ${MAX_BYTES} bytes` },
        { status: 413, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: 'INVALID_MIME', message: `MIME ${file.type} not allowed` },
        { status: 415, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const { match, sniffed } = verifyMagicBytes(buf, file.type);
    if (sniffed && !match) {
      return NextResponse.json(
        { error: 'MAGIC_BYTE_MISMATCH', message: 'File bytes do not match declared MIME' },
        { status: 415, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existing = await prisma.studentDocument.findUnique({
      where: { studentId_type: { studentId: id, type } },
      select: { fileKey: true, resourceType: true },
    });

    const publicId = `students/${id}/${type.toLowerCase()}-${Date.now()}`;

    let uploaded;
    try {
      uploaded = await uploadBuffer(publicId, buf, { deliveryType: 'authenticated' });
    } catch (e) {
      if (e instanceof StorageNotConfiguredError) {
        return NextResponse.json(
          { error: 'STORAGE_NOT_CONFIGURED', message: 'Storage not configured' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      return NextResponse.json(
        { error: 'UPLOAD_FAILED', message: 'Storage write failed' },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Point the DB row at the new asset BEFORE deleting the old one. If the
    // upsert throws (e.g. a transient DB error), the previous document row
    // still points at the previous, still-existing Cloudinary asset — it
    // stays servable. Deleting the old asset only after the upsert succeeds
    // means the worst case on a later failure is a harmless orphaned
    // Cloudinary asset, never a StudentDocument row pointing at a deleted
    // fileKey (which would 404 a subsequent download).
    const row = await prisma.studentDocument.upsert({
      where: { studentId_type: { studentId: id, type } },
      create: {
        studentId: id,
        type,
        fileKey: uploaded.publicId,
        fileName: sanitizeFilename(file.name),
        mimeType: file.type,
        resourceType: uploaded.resourceType,
        sizeBytes: uploaded.bytes,
        uploadedById: auth.user.sub,
      },
      update: {
        fileKey: uploaded.publicId,
        fileName: sanitizeFilename(file.name),
        mimeType: file.type,
        resourceType: uploaded.resourceType,
        sizeBytes: uploaded.bytes,
        uploadedById: auth.user.sub,
        uploadedAt: new Date(),
      },
      select: { type: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true },
    });

    if (existing) {
      // Best-effort cleanup — the new document is already stored and
      // servable at this point, so a failure here only leaves a harmless
      // orphaned Cloudinary asset behind rather than breaking anything for
      // the caller.
      try {
        await deleteAsset(existing.fileKey, existing.resourceType, {
          deliveryType: 'authenticated',
        });
      } catch (e) {
        log.warn('failed to delete replaced student document asset', {
          fileKey: existing.fileKey,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json(
      { document: row },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
