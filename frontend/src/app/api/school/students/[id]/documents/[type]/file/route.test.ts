import { prismaMock } from '@/test-utils/prisma-mock';
import { mockCloudinaryClient } from '@/test-utils/cloudinary-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const cl = mockCloudinaryClient();

vi.mock('@/lib/server/upload/cloudinary-client', () => ({
  getSignedDocumentUrl: vi.fn((id: string, rt: string, exp?: number) =>
    cl.getSignedDocumentUrl(id, rt, exp),
  ),
}));
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/school', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/school')>('@/lib/server/school');
  return { ...actual, resolveMySchool: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { resolveMySchool } from '@/lib/server/school';
import { GET } from './route';

const authUser = { user: { sub: 'user_1', email: 'staff@test.local' } };
const ownerSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'OWNER' as const };
const params = (type: string) => ({ params: Promise.resolve({ id: 'student_1', type }) });
const req = () =>
  new NextRequest(
    'http://localhost/api/school/students/student_1/documents/BIRTH_CERTIFICATE/file',
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(authUser as never);
  vi.mocked(resolveMySchool).mockResolvedValue(ownerSchool);
  prismaMock.student.findUnique.mockResolvedValue({
    id: 'student_1',
    schoolId: 'school_1',
  } as never);
});

describe('GET /api/school/students/[id]/documents/[type]/file', () => {
  it('returns 400 for a type outside the fixed enum', async () => {
    const res = await GET(req(), params('NOT_A_TYPE'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the student does not belong to the caller school', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 'student_1',
      schoolId: 'other',
    } as never);
    const res = await GET(req(), params('BIRTH_CERTIFICATE'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when no document of that type has been uploaded', async () => {
    prismaMock.studentDocument.findUnique.mockResolvedValue(null);
    const res = await GET(req(), params('BIRTH_CERTIFICATE'));
    expect(res.status).toBe(404);
  });

  it('redirects to a freshly signed URL when the document exists', async () => {
    prismaMock.studentDocument.findUnique.mockResolvedValue({
      fileKey: 'students/student_1/birth_certificate-1',
      resourceType: 'raw',
    } as never);

    const res = await GET(req(), params('BIRTH_CERTIFICATE'));

    expect(res.status).toBe(302);
    // Matches the mock's own formula in cloudinary-mock.ts (`.../authenticated/${publicId}?signed=1`)
    // for the exact fileKey this test's mocked document row carries — not a
    // fresh call to the mock, which would need the real args to line up.
    expect(res.headers.get('location')).toBe(
      'https://res.cloudinary.com/test-cloud/authenticated/students/student_1/birth_certificate-1?signed=1',
    );
    expect(cl.getSignedDocumentUrl).toHaveBeenCalledWith(
      'students/student_1/birth_certificate-1',
      'raw',
      300,
    );
  });
});
