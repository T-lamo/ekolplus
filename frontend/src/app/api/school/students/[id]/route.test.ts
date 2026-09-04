// GET /api/school/students/[id] — full profile: identity, guardians,
// current-year enrollment (class + homeroom teacher), plus the linked
// portal-account status (Student.userId + the linked User's
// emailVerifiedAt) consumed by the fiche's invite/resend UI.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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
import { NextResponse } from 'next/server';
import { GET, PATCH } from './route';

const authUser = { user: { sub: 'user_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };
const params = { params: Promise.resolve({ id: 's1' }) };
const req = () => new NextRequest('http://localhost/api/school/students/s1', { method: 'GET' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(authUser as never);
  vi.mocked(verifyCsrf).mockReturnValue(null);
  vi.mocked(resolveMySchool).mockResolvedValue(adminSchool);
});

describe('GET /api/school/students/[id]', () => {
  it('unauthenticated → passes the middleware response through', async () => {
    const unauthorized = NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    vi.mocked(requireAuth).mockResolvedValue(unauthorized as never);

    const res = await GET(req(), params);

    expect(res.status).toBe(401);
    expect(prismaMock.student.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 NOT_FOUND when the student belongs to a different school', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 's1',
      schoolId: 'other_school',
      userId: null,
      user: null,
      guardians: [],
      enrollments: [],
    } as never);

    const res = await GET(req(), params);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('NOT_FOUND');
  });

  it('returns the full student profile, including userId: null and userEmailVerifiedAt: null when unlinked', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 's1',
      schoolId: 'school_1',
      userId: null,
      user: null,
      guardians: [],
      enrollments: [],
      studentNumber: 'EL-1',
      firstName: 'A',
      lastName: 'B',
      photoUrl: null,
      dateOfBirth: null,
      placeOfBirth: null,
      gender: null,
      nationality: null,
      address: null,
      motherTongue: null,
      phone: null,
      email: null,
      enrollmentType: null,
      previousSchool: null,
      transferNumber: null,
      nisu: 'NISU-2026-0099',
      notes: null,
      scholarship: false,
      enrolledAt: null,
      status: 'ENROLLED',
    } as never);

    const res = await GET(req(), params);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.student.id).toBe('s1');
    expect(json.student.studentNumber).toBe('EL-1');
    expect(json.student.userId).toBeNull();
    expect(json.student.userEmailVerifiedAt).toBeNull();
    expect(json.student.nisu).toBe('NISU-2026-0099');
  });

  it("includes userId and the linked user's emailVerifiedAt in the response", async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 's1',
      schoolId: 'school_1',
      userId: 'user_1',
      user: { emailVerifiedAt: new Date('2026-08-01') },
      guardians: [],
      enrollments: [],
      studentNumber: 'EL-1',
      firstName: 'A',
      lastName: 'B',
    } as never);

    const res = await GET(req(), params);
    const json = await res.json();

    expect(json.student.userId).toBe('user_1');
    expect(json.student.userEmailVerifiedAt).toBe('2026-08-01T00:00:00.000Z');
  });
});

describe('PATCH /api/school/students/[id]', () => {
  it('persists nisu and guardian nif/niu/vitalStatus', async () => {
    prismaMock.student.findUnique.mockResolvedValue({ id: 's1', schoolId: 'school_1' } as never);
    prismaMock.$transaction.mockImplementation((async (cb: (tx: typeof prismaMock) => unknown) =>
      cb(prismaMock)) as never);

    const res = await PATCH(
      new NextRequest('http://localhost/api/school/students/s1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nisu: 'NISU-2026-0002',
          guardians: [
            {
              name: 'Marie',
              relationship: 'Mère',
              nif: 'NIF-2',
              niu: 'NIU-2',
              vitalStatus: 'DECEDE',
            },
          ],
        }),
      }),
      params,
    );

    expect(res.status).toBe(200);
    const updateArgs = prismaMock.student.update.mock.calls[0]?.[0] as { data: { nisu?: string } };
    expect(updateArgs.data.nisu).toBe('NISU-2026-0002');
    const createManyArgs = prismaMock.guardian.createMany.mock.calls[0]?.[0] as {
      data: { nif?: string; niu?: string; vitalStatus?: string }[];
    };
    expect(createManyArgs.data[0]).toMatchObject({
      nif: 'NIF-2',
      niu: 'NIU-2',
      vitalStatus: 'DECEDE',
    });
  });
});
