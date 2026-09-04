import { prismaMock } from '@/test-utils/prisma-mock';
import { mockCloudinaryClient } from '@/test-utils/cloudinary-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const cl = mockCloudinaryClient();

vi.mock('@/lib/server/upload/cloudinary-client', () => ({
  uploadBuffer: vi.fn((id: string, body: Buffer, opts?: { deliveryType?: 'authenticated' }) =>
    cl.uploadBuffer(id, body, opts),
  ),
  deleteAsset: vi.fn((id: string, rt: string, opts?: { deliveryType?: 'authenticated' }) =>
    cl.deleteAsset(id, rt, opts),
  ),
  StorageNotConfiguredError: class StorageNotConfiguredError extends Error {},
}));
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchool: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';
import { GET, POST } from './route';

const authUser = { user: { sub: 'user_1', email: 'staff@test.local' } };
const ownerSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'OWNER' as const };
const params = { params: Promise.resolve({ id: 'student_1' }) };

function uploadReq(fields: { type: string; file?: File }) {
  const form = new FormData();
  form.set('type', fields.type);
  if (fields.file) form.set('file', fields.file);
  return new NextRequest('http://localhost/api/school/students/student_1/documents', {
    method: 'POST',
    body: form,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test-cloud');
  vi.stubEnv('CLOUDINARY_API_KEY', 'key');
  vi.stubEnv('CLOUDINARY_API_SECRET', 'secret');
  vi.mocked(requireAuth).mockResolvedValue(authUser as never);
  vi.mocked(verifyCsrf).mockReturnValue(null);
  vi.mocked(resolveMySchool).mockResolvedValue(ownerSchool);
  prismaMock.student.findUnique.mockResolvedValue({
    id: 'student_1',
    schoolId: 'school_1',
  } as never);
});

describe('GET /api/school/students/[id]/documents', () => {
  it('returns 404 when the student does not belong to the caller school', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 'student_1',
      schoolId: 'other_school',
    } as never);

    const res = await GET(
      new NextRequest('http://localhost/api/school/students/student_1/documents'),
      params,
    );

    expect(res.status).toBe(404);
  });

  it('lists only the document types actually present, without fileKey', async () => {
    prismaMock.studentDocument.findMany.mockResolvedValue([
      {
        type: 'BIRTH_CERTIFICATE',
        fileName: 'acte.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1234,
        uploadedAt: new Date('2026-01-01'),
        fileKey: 'students/student_1/abc',
      },
    ] as never);

    const res = await GET(
      new NextRequest('http://localhost/api/school/students/student_1/documents'),
      params,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.documents).toEqual([
      {
        type: 'BIRTH_CERTIFICATE',
        fileName: 'acte.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1234,
        uploadedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(body)).not.toContain('students/student_1/abc');
  });
});

describe('POST /api/school/students/[id]/documents', () => {
  it('rejects a MIME type outside the local allowlist', async () => {
    const file = new File(['x'], 'evil.exe', { type: 'application/x-msdownload' });

    const res = await POST(uploadReq({ type: 'BIRTH_CERTIFICATE', file }), params);

    expect(res.status).toBe(415);
    expect(cl.uploadBuffer).not.toHaveBeenCalled();
  });

  it('rejects an invalid document type', async () => {
    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });

    const res = await POST(uploadReq({ type: 'NOT_A_TYPE', file }), params);

    expect(res.status).toBe(400);
  });

  it('uploads with authenticated delivery, stores only fileKey, and never returns a secureUrl', async () => {
    const file = new File(['%PDF-1.4 fake'], 'acte.pdf', { type: 'application/pdf' });
    prismaMock.studentDocument.upsert.mockResolvedValue({
      type: 'BIRTH_CERTIFICATE',
      fileName: 'acte.pdf',
      mimeType: 'application/pdf',
      sizeBytes: file.size,
      uploadedAt: new Date('2026-01-01'),
    } as never);

    const res = await POST(uploadReq({ type: 'BIRTH_CERTIFICATE', file }), params);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(cl.uploadBuffer).toHaveBeenCalledWith(
      expect.stringContaining('students/student_1/'),
      expect.any(Buffer),
      { deliveryType: 'authenticated' },
    );
    expect(JSON.stringify(body)).not.toMatch(/secure_url|secureUrl|res\.cloudinary\.com/);
  });

  it('deletes the previous asset when replacing an existing document of the same type', async () => {
    const file = new File(['%PDF-1.4 v2'], 'acte-v2.pdf', { type: 'application/pdf' });
    prismaMock.studentDocument.findUnique.mockResolvedValue({
      fileKey: 'students/student_1/old-key',
      resourceType: 'raw',
    } as never);
    prismaMock.studentDocument.upsert.mockResolvedValue({
      type: 'BIRTH_CERTIFICATE',
      fileName: 'acte-v2.pdf',
      mimeType: 'application/pdf',
      sizeBytes: file.size,
      uploadedAt: new Date('2026-01-02'),
    } as never);

    await POST(uploadReq({ type: 'BIRTH_CERTIFICATE', file }), params);

    expect(cl.deleteAsset).toHaveBeenCalledWith('students/student_1/old-key', 'raw', {
      deliveryType: 'authenticated',
    });
  });
});
