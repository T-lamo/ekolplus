// POST /api/admin/schools — creates a School tenant (Organization + School +
// owner OrganizationMember) from the SaaS admin's "Créer une école" screen.
//
// V1 scope only — see .planning/banani/create-school.md. Plan selection /
// Stripe billing / subdomain provisioning / forced-password-change /
// send-credentials-by-email are all deliberately NOT implemented here.
//
// Owner resolution: if a User with the submitted email already exists, they
// are just added as OWNER of the new org (no new credentials). Otherwise a
// new User is created with a generated temp password, returned once in the
// response body (never logged, never stored in plaintext).
export const runtime = 'nodejs';

import 'server-only';
import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf, hashPassword } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { slugify, ensureUniqueSlug } from '@/lib/server/slug';
import { zEmail, zPhone } from '@/lib/server/zod-helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  schoolName: z.string().trim().min(2).max(120),
  shortName: z.string().trim().max(10).optional(),
  country: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80),
  schoolType: z.string().trim().min(1).max(80),
  primaryLanguage: z.string().trim().max(40).optional(),
  address: z.string().trim().max(200).optional(),
  phone: zPhone.optional(),
  estimatedStudents: z.number().int().positive().max(1_000_000).optional(),
  ownerFirstName: z.string().trim().min(1).max(60),
  ownerLastName: z.string().trim().min(1).max(60),
  ownerEmail: zEmail,
  ownerRole: z.string().trim().max(60).optional(),
  ownerPhone: zPhone.optional(),
});

const TEMP_PASSWORD_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function generateTempPassword(): string {
  const bytes = randomBytes(14);
  let out = '';
  for (const b of bytes) {
    out += TEMP_PASSWORD_CHARS[b % TEMP_PASSWORD_CHARS.length];
  }
  return out;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    const existingOwner = await prisma.user.findUnique({
      where: { email: data.ownerEmail },
      select: { id: true, email: true, name: true },
    });

    const tempPassword = existingOwner ? null : generateTempPassword();
    const passwordHash = tempPassword ? await hashPassword(tempPassword) : null;

    const result = await prisma.$transaction(async (tx) => {
      const owner =
        existingOwner ??
        (await tx.user.create({
          data: {
            email: data.ownerEmail,
            name: `${data.ownerFirstName} ${data.ownerLastName}`,
            passwordHash,
            emailVerifiedAt: new Date(),
          },
          select: { id: true, email: true, name: true },
        }));

      let organization: { id: string; slug: string; name: string } | undefined;
      await ensureUniqueSlug(
        slugify(data.schoolName),
        async (slug) => {
          organization = await tx.organization.create({
            data: { slug, name: data.schoolName, ownerId: owner.id },
            select: { id: true, slug: true, name: true },
          });
        },
        { reserved: ['schools'] },
      );
      if (!organization) throw new Error('organization creation failed');

      const school = await tx.school.create({
        data: {
          organizationId: organization.id,
          name: data.schoolName,
          shortName: data.shortName ?? null,
          country: data.country,
          city: data.city,
          schoolType: data.schoolType,
          primaryLanguage: data.primaryLanguage ?? null,
          address: data.address ?? null,
          phone: data.phone ?? null,
          estimatedStudents: data.estimatedStudents ?? null,
        },
      });

      await tx.organizationMember.create({
        data: { organizationId: organization.id, userId: owner.id, role: 'OWNER' },
      });

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'school.create',
        targetType: 'Organization',
        targetId: organization.id,
        metadata: {
          schoolName: data.schoolName,
          ownerEmail: owner.email,
          ownerAccountCreated: !existingOwner,
        },
      });

      return { organization, school, owner };
    });

    return NextResponse.json(
      {
        organization: result.organization,
        school: result.school,
        owner: { id: result.owner.id, email: result.owner.email, name: result.owner.name },
        // Only present when a new account was created — surfaced once, the
        // admin is responsible for communicating it (no email-send in v1).
        tempPassword,
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
