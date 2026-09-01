// GET /api/auth/me — AUTH-06.
//
// Source: RESEARCH.md Pattern 14.
//
// requireAuth handles the cookie/Bearer lookup, JWT verification, and the
// DB-side tokenVersion re-check (T-1-02 mitigation against stale-JWT bypass
// after change-password bumps tokenVersion). Returns AuthContext on success
// or a 401 NextResponse on failure.
//
// Extra fields beyond { sub, email } (id, emailVerifiedAt, createdAt,
// updatedAt, hasPassword, linkedProviders) are fetched via a second DB hit
// so the AuthContext / settings page can branch on them without an extra
// round-trip. `hasPassword` distinguishes OAuth-only accounts (passwordHash
// is null) — used by /settings to switch between "Set password" and
// "Change password". `linkedProviders` is a string[] of provider names
// already wired (e.g. ['google']).
//
// PATCH /api/auth/me — self-service profile edit (name/phone/avatarUrl/theme/locale).
// Email is not editable here (it's the login identifier — changing it belongs
// to a dedicated, verification-gated flow that doesn't exist yet).
//
// No CSRF: GET is a safe method; verifyCsrf is a no-op for GET anyway.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import {
  resolveMySchoolIncludingTeacher,
  resolveMyStudentProfile,
  resolveMySpaces,
} from '@/lib/server/school';
import { zPhone } from '@/lib/server/zod-helpers';
import { THEME_KEYS, isThemeKey } from '@/lib/themes';
import { LOCALE_KEYS, isLocaleKey } from '@/lib/locales';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function resolveStoredTheme(value: string | null | undefined): string | null {
  return isThemeKey(value) ? value : null;
}

function resolveStoredLocale(value: string | null | undefined): string | null {
  return isLocaleKey(value) ? value : null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    // Defensive shape: tests sometimes stub findUnique with a minimal
    // `{ id, email, tokenVersion }` payload (the requireAuth contract).
    // We only read fields we know are present, and default the rest.
    const dbUser = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        avatarUrl: true,
        phone: true,
        theme: true,
        locale: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        passwordHash: true,
        passwordChangedAt: true,
        oauthAccounts: { select: { provider: true } },
      },
    });

    const mySchool = await resolveMySchoolIncludingTeacher(auth.user.sub);
    // Multi-espaces (spec 2026-09-01 §5) : « purement enseignant » = lié
    // enseignant sans aucun espace école. Un double profil (rôle staff avec
    // au moins un droit) garde les deux espaces et n'est plus rebondi hors
    // de l'app école par (school)/layout.tsx ni par le login.
    const spaces = await resolveMySpaces(auth.user.sub);
    const isTeacherOnly = spaces.teacher && !spaces.school;
    const studentProfile = await resolveMyStudentProfile(auth.user.sub);
    // Defense in depth: an ADMIN/SUPERADMIN account with an incidentally-linked
    // Student.userId must not be flagged isStudentOnly. Not exploitable via
    // the current invite flow (createPortalInvite refuses to link a Student to
    // an account that already has a passwordHash), but Task 10 builds real
    // redirect/bounce logic on top of this field, so gate it here too. Can't
    // mirror isTeacherOnly's `mySchool?.role === 'MEMBER'` gate literally —
    // students never get an OrganizationMember row, so that would always be
    // false for genuine students. Gate on the platform-wide User.role instead.
    // Second gate, same spirit: a non-null `mySchool` means this account
    // really does hold an org role (director, secretary, teacher...), which a
    // genuine student account never has by design. That covers the case the
    // User.role check alone misses — a Google-OAuth account has no
    // passwordHash, so createPortalInvite's passwordHash guard would not stop
    // a school director who is also a guardian from being linked to a Student
    // row, yet their `role` may still be plain USER.
    const isStudentOnly =
      (dbUser?.role ?? 'USER') === 'USER' && mySchool === null && studentProfile !== null;

    const user = {
      // Keep `sub` for back-compat with the AuthContext payload contract
      // (older callers may still read it). New code should use `id`.
      sub: auth.user.sub,
      id: dbUser?.id ?? auth.user.sub,
      email: dbUser?.email ?? auth.user.email,
      role: dbUser?.role ?? 'USER',
      name: dbUser?.name ?? null,
      avatarUrl: dbUser?.avatarUrl ?? null,
      phone: dbUser?.phone ?? null,
      // Unknown/legacy values are normalised to null so the client never
      // receives a key it cannot render.
      theme: resolveStoredTheme(dbUser?.theme),
      locale: resolveStoredLocale(dbUser?.locale),
      emailVerifiedAt: dbUser?.emailVerifiedAt
        ? dbUser.emailVerifiedAt instanceof Date
          ? dbUser.emailVerifiedAt.toISOString()
          : dbUser.emailVerifiedAt
        : null,
      createdAt: dbUser?.createdAt
        ? dbUser.createdAt instanceof Date
          ? dbUser.createdAt.toISOString()
          : dbUser.createdAt
        : null,
      updatedAt: dbUser?.updatedAt
        ? dbUser.updatedAt instanceof Date
          ? dbUser.updatedAt.toISOString()
          : dbUser.updatedAt
        : null,
      hasPassword: !!dbUser?.passwordHash,
      isTeacherOnly,
      isStudentOnly,
      spaces,
      passwordChangedAt: dbUser?.passwordChangedAt
        ? dbUser.passwordChangedAt instanceof Date
          ? dbUser.passwordChangedAt.toISOString()
          : dbUser.passwordChangedAt
        : null,
      linkedProviders: (dbUser?.oauthAccounts ?? []).map((a) => a.provider),
    };

    return NextResponse.json({ user }, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}

const UpdateMeBody = z.object({
  name: z.string().trim().min(1).max(120).nullable().optional(),
  phone: zPhone.nullable().optional(),
  avatarUrl: z.string().trim().url().max(500).nullable().optional(),
  // Colour theme (Paramètres › Apparence) — only a known key is stored;
  // null resets to the default theme.
  theme: z.enum(THEME_KEYS).nullable().optional(),
  // UI language (Paramètres › Langue) — only a known key is stored; null
  // resets to the default (French).
  locale: z.enum(LOCALE_KEYS).nullable().optional(),
});

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const parsed = UpdateMeBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const data = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));

    const updated = await prisma.user.update({
      where: { id: auth.user.sub },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        phone: true,
        theme: true,
        locale: true,
      },
    });

    return NextResponse.json(
      { user: updated },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
