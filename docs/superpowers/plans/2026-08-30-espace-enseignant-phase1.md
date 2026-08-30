# Espace Enseignant — Phase 1 (Foundation + Lockdown) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a `Teacher` an optional login (admin-invited), lock every existing `/api/school/*` route down for teacher-linked accounts by default (via one centralized change), and land a bare `/espace-enseignant` home page so a teacher account has somewhere real to go after logging in.

**Architecture:** `Teacher.userId` links a teacher to a `User`. `resolveMySchool()` is flipped to deny-by-default for `MEMBER`-role accounts linked to a portal-only entity (checked via a new `isPortalOnlyAccount()` helper) — this alone locks all ~65 existing `/api/school/*` routes with zero edits to those files. A new `resolveMySchoolIncludingTeacher()` sibling and `resolveMyTeacherProfile()` helper exist for later phases to opt specific routes back in; Phase 1 does not use them for any pédagogie route. Invitations reuse a new generic `createPortalInvite()` helper (built for reuse by the parallel Student Portal effort) and the existing outbox pattern.

**Tech Stack:** Next.js 16 App Router Route Handlers, Prisma 5 / Postgres, Zod, Vitest + `vitest-mock-extended` (`prismaMock`), Resend (via the existing outbox → `EmailQueue` → `email-queue-drain` cron), next-intl (fr/en/ht).

**Spec:** `docs/superpowers/specs/2026-08-30-espace-enseignant-design.md`

## Global Constraints

- Every Route Handler `export const runtime = 'nodejs'`.
- Every mutating route calls `verifyCsrf(req)` and `requireAuth()`/school-scoped equivalent, wrapped in `withRequestContext`.
- `frontend/src/lib/server/outbox/dispatcher.ts` is a protected file — Task 3 below adds one new `case` to its switch, pre-approved by the user (2026-08-30) as a narrow, same-shape addition. No other protected file is touched in this plan.
- `frontend/src/lib/server/school.ts`, `frontend/src/lib/server/auth/email-templates.ts`, `frontend/prisma/schema.prisma` are **not** protected — free to modify.
- Money/PII/security conventions from CLAUDE.md apply throughout (enumeration resistance on the invite/accept routes where relevant, cookies `httpOnly` + `Secure` + `SameSite=Lax`, stable error codes the frontend switches on).
- All new user-facing strings go through next-intl message files (`fr`/`en`/`ht`), one namespace per screen, matching `locales.test.ts`'s key-parity enforcement.
- `pnpm format && pnpm lint && pnpm typecheck && pnpm test` must pass before any commit that isn't explicitly a WIP step.

---

## File Structure

New files this plan creates:
- `frontend/src/lib/server/portal-invite.ts` — generic `createPortalInvite()` helper (shared with the future Student Portal).
- `frontend/src/lib/server/portal-invite.test.ts`
- `frontend/src/app/api/school/teachers/[id]/invite/route.ts` — admin-invite + resend.
- `frontend/src/app/api/school/teachers/[id]/invite/route.test.ts`
- `frontend/src/app/api/auth/teacher-invite/accept/route.ts` — public accept + set-password.
- `frontend/src/app/api/auth/teacher-invite/accept/route.test.ts`
- `frontend/src/app/(auth)/definir-mot-de-passe/page.tsx` — public accept page.
- `frontend/src/app/(teacher)/espace-enseignant/layout.tsx` — mobile-first shell (bare for Phase 1).
- `frontend/src/app/(teacher)/espace-enseignant/page.tsx` — bare home page.
- `frontend/src/messages/{fr,en,ht}/setPassword.json`
- `frontend/src/messages/{fr,en,ht}/teacherPortal.json`

Modified files:
- `frontend/prisma/schema.prisma` (+ new migration under `frontend/prisma/migrations/`)
- `frontend/src/lib/server/school.ts`
- `frontend/src/lib/server/school.test.ts` (create if it doesn't exist yet — check first)
- `frontend/src/lib/server/outbox/types.ts`
- `frontend/src/lib/server/outbox/dispatcher.ts`
- `frontend/src/lib/server/outbox/dispatcher.test.ts`
- `frontend/src/lib/server/auth/email-templates.ts`
- `frontend/src/lib/server/auth/email-templates.test.ts`
- `frontend/src/app/(school)/enseignants/[id]/page.tsx` (invite/resend UI)
- `frontend/src/messages/{fr,en,ht}/enseignants.json` (new `invite` key group)
- `frontend/src/app/api/auth/me/route.ts` (+ its route.test.ts)
- `frontend/src/app/login/page.tsx`
- `frontend/src/lib/locales.ts` (register the 2 new namespaces — `MESSAGE_NAMESPACES` per CLAUDE.md's i18n section)

---

### Task 1: Schema — `Teacher.userId`

**Files:**
- Modify: `frontend/prisma/schema.prisma` (the `Teacher` model, ~line 398; the `User` model, ~line 61-73 relations block)
- Create: migration via `pnpm db:migrate:dev` (do not hand-write the SQL)

**Interfaces:**
- Produces: `Teacher.userId: string | null`, `Teacher.user?: User | null` relation, `User.teacherProfile?: Teacher | null` relation — consumed by Task 2's `isPortalOnlyAccount()` and Task 6's invite route.

- [ ] **Step 1: Add the fields to schema.prisma**

In the `Teacher` model, add after the existing `timetableSessions` relation line:

```prisma
  userId String? @unique
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
```

In the `User` model, add to the relations block (near `appreciations`/`attendanceMarks`):

```prisma
  teacherProfile Teacher?
```

- [ ] **Step 2: Generate and apply the migration**

Run: `pnpm db:migrate:dev` (name it `teacher_user_link` when prompted)
Expected: a new folder under `frontend/prisma/migrations/` containing an `ALTER TABLE "Teacher" ADD COLUMN "userId" TEXT; CREATE UNIQUE INDEX ...` migration, purely additive (no drops).

- [ ] **Step 3: Regenerate the Prisma client**

Run: `pnpm --filter frontend exec prisma generate`
Expected: no errors; `Teacher.userId` and `User.teacherProfile` are now valid in generated types (verify with `pnpm typecheck` — should still pass since nothing references the new fields yet).

- [ ] **Step 4: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations
git commit -m "feat(schema): add Teacher.userId login link"
```

---

### Task 2: `school.ts` — deny-by-default lockdown + teacher scoping helpers

**Files:**
- Modify: `frontend/src/lib/server/school.ts`
- Test: `frontend/src/lib/server/school.test.ts` (create — check with `find frontend/src/lib/server -maxdepth 1 -name "school.test.ts"` first; if it doesn't exist, create it fresh)

**Interfaces:**
- Consumes: `Teacher.userId` (Task 1), `prisma` (`@/lib/server/prisma`), `OrgRole`/`ORG_ROLE_RANK` (`@/lib/server/middleware/require-org-role`, read-only import, not modified).
- Produces:
  - `resolveMySchool(userId: string): Promise<MySchool | null>` — **same signature as today**, now returns `null` for a `MEMBER`-role teacher-linked account.
  - `resolveMySchoolIncludingTeacher(userId: string): Promise<MySchool | null>` — new, same shape, no teacher rejection.
  - `interface MyTeacherProfile { teacherId: string; classSubjectIds: string[]; homeroomClassIds: string[] }`
  - `resolveMyTeacherProfile(userId: string, schoolId: string): Promise<MyTeacherProfile | null>` — used by Phases 2-4, not called anywhere in Phase 1.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/server/school.test.ts`:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import {
  resolveMySchool,
  resolveMySchoolIncludingTeacher,
  resolveMyTeacherProfile,
} from './school';

function membershipRow(over: Record<string, unknown> = {}) {
  return {
    organizationId: 'org_1',
    role: 'MEMBER',
    organization: { school: { id: 'school_1' } },
    ...over,
  };
}

describe('resolveMySchool', () => {
  it('returns null when there is no membership', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never);
    expect(await resolveMySchool('user_1')).toBeNull();
  });

  it('returns the school for a non-teacher MEMBER', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(membershipRow() as never);
    prismaMock.teacher.findFirst.mockResolvedValue(null as never);
    expect(await resolveMySchool('user_1')).toEqual({
      organizationId: 'org_1',
      schoolId: 'school_1',
      role: 'MEMBER',
    });
  });

  it('returns null for a teacher-linked MEMBER (deny-by-default)', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(membershipRow() as never);
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teacher_1' } as never);
    expect(await resolveMySchool('user_1')).toBeNull();
  });

  it('never rejects an ADMIN account even if also teacher-linked', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ role: 'ADMIN' }) as never,
    );
    const result = await resolveMySchool('user_1');
    expect(result).toEqual({ organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' });
    expect(prismaMock.teacher.findFirst).not.toHaveBeenCalled();
  });
});

describe('resolveMySchoolIncludingTeacher', () => {
  it('returns the school for a teacher-linked MEMBER (no rejection)', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(membershipRow() as never);
    expect(await resolveMySchoolIncludingTeacher('user_1')).toEqual({
      organizationId: 'org_1',
      schoolId: 'school_1',
      role: 'MEMBER',
    });
    expect(prismaMock.teacher.findFirst).not.toHaveBeenCalled();
  });
});

describe('resolveMyTeacherProfile', () => {
  it('returns null when the user has no Teacher row in this school', async () => {
    prismaMock.teacher.findFirst.mockResolvedValue(null as never);
    expect(await resolveMyTeacherProfile('user_1', 'school_1')).toBeNull();
  });

  it('returns classSubjectIds and homeroomClassIds for a linked teacher', async () => {
    prismaMock.teacher.findFirst.mockResolvedValue({
      id: 'teacher_1',
      classSubjects: [{ id: 'cs_1' }, { id: 'cs_2' }],
      homeroomClasses: [{ id: 'class_1' }],
    } as never);
    expect(await resolveMyTeacherProfile('user_1', 'school_1')).toEqual({
      teacherId: 'teacher_1',
      classSubjectIds: ['cs_1', 'cs_2'],
      homeroomClassIds: ['class_1'],
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/lib/server/school.test.ts`
Expected: FAIL — `resolveMySchoolIncludingTeacher`/`resolveMyTeacherProfile` are not exported yet, and the existing `resolveMySchool` doesn't call `prisma.teacher.findFirst`.

- [ ] **Step 3: Implement**

Replace the body of `frontend/src/lib/server/school.ts` with:

```ts
// "My school" resolution — used by /api/school/* routes, which act on the
// caller's own school rather than an :id in the URL (unlike requireOrgRole,
// which needs an explicit organizationId). V1 picks the first
// OrganizationMember row by createdAt — a person staffing more than one
// school has no switcher yet (documented limitation, school-settings.md).
//
// Deny-by-default lockdown (2026-08-30, Espace Enseignant Phase 1):
// resolveMySchool() rejects MEMBER-role accounts linked to a portal-only
// entity (a Teacher today; the Student Portal adds its own check here
// later) so every existing /api/school/* route is locked down for free,
// with zero edits to those ~65 files. Routes that must stay reachable by
// teachers call resolveMySchoolIncludingTeacher() instead, and layer their
// own per-classSubject/per-class check via resolveMyTeacherProfile() — see
// docs/superpowers/specs/2026-08-30-espace-enseignant-design.md.
import 'server-only';
import { prisma } from './prisma';
import { ORG_ROLE_RANK, type OrgRole } from './middleware/require-org-role';

export interface MySchool {
  organizationId: string;
  schoolId: string;
  role: OrgRole;
}

async function findMembership(userId: string) {
  return prisma.organizationMember.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      organizationId: true,
      role: true,
      organization: { select: { school: { select: { id: true } } } },
    },
  });
}

// Currently only checks Teacher. The Student Portal adds its own Student
// check into this same function once Student.userId exists.
async function isPortalOnlyAccount(userId: string, schoolId: string): Promise<boolean> {
  const teacher = await prisma.teacher.findFirst({
    where: { userId, schoolId },
    select: { id: true },
  });
  return teacher !== null;
}

export async function resolveMySchool(userId: string): Promise<MySchool | null> {
  const membership = await findMembership(userId);
  if (!membership || !membership.organization.school) return null;
  const schoolId = membership.organization.school.id;
  if (membership.role === 'MEMBER' && (await isPortalOnlyAccount(userId, schoolId))) {
    return null;
  }
  return { organizationId: membership.organizationId, schoolId, role: membership.role as OrgRole };
}

/** Same as resolveMySchool, but never rejects a teacher-linked account. */
export async function resolveMySchoolIncludingTeacher(userId: string): Promise<MySchool | null> {
  const membership = await findMembership(userId);
  if (!membership || !membership.organization.school) return null;
  return {
    organizationId: membership.organizationId,
    schoolId: membership.organization.school.id,
    role: membership.role as OrgRole,
  };
}

export interface MyTeacherProfile {
  teacherId: string;
  classSubjectIds: string[];
  homeroomClassIds: string[];
}

export async function resolveMyTeacherProfile(
  userId: string,
  schoolId: string,
): Promise<MyTeacherProfile | null> {
  const teacher = await prisma.teacher.findFirst({
    where: { userId, schoolId },
    select: {
      id: true,
      classSubjects: { select: { id: true } },
      homeroomClasses: { select: { id: true } },
    },
  });
  if (!teacher) return null;
  return {
    teacherId: teacher.id,
    classSubjectIds: teacher.classSubjects.map((cs) => cs.id),
    homeroomClassIds: teacher.homeroomClasses.map((c) => c.id),
  };
}

export function hasMinRole(role: OrgRole, min: OrgRole): boolean {
  return ORG_ROLE_RANK[role] >= ORG_ROLE_RANK[min];
}

// Used by Epic 4 (Classes) — a Class is year-scoped, so creating one needs
// the school's active AcademicYear. Mirrors the query in /api/school GET.
export async function resolveActiveAcademicYear(
  schoolId: string,
): Promise<{ id: string; label: string; startDate: Date } | null> {
  return prisma.academicYear.findFirst({
    where: { schoolId, isActive: true },
    orderBy: { startDate: 'desc' },
    select: { id: true, label: true, startDate: true },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/lib/server/school.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Run the FULL test suite — this step changes shared behavior**

Run: `pnpm --filter frontend exec vitest run`
Expected: PASS. If any existing route test mocks `resolveMySchool` directly (most do, per the `vi.mock('@/lib/server/school', ...)` pattern seen in `rooms/route.test.ts`), it is unaffected — those tests mock the function's return value directly and never exercise the real implementation. If any test exercises the *real* `resolveMySchool` against `prismaMock` without stubbing `prismaMock.teacher.findFirst`, it will now hang/reject on an unmocked call — grep first: `grep -rL "vi.mock('@/lib/server/school'" frontend/src/app/api/school/**/*.test.ts` to check whether any test file calls the real implementation, and add `prismaMock.teacher.findFirst.mockResolvedValue(null as never)` to its `beforeEach` if so.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/school.ts frontend/src/lib/server/school.test.ts
git commit -m "feat(auth): deny-by-default lockdown for teacher-linked accounts"
```

---

### Task 3: Outbox — generic `email.portal_invite` event

**Files:**
- Modify: `frontend/src/lib/server/outbox/types.ts`
- Modify: `frontend/src/lib/server/outbox/dispatcher.ts` (protected file — user pre-approved this exact addition on 2026-08-30)
- Modify: `frontend/src/lib/server/outbox/dispatcher.test.ts`

**Interfaces:**
- Consumes: `portalInviteEmail()` from Task 4 (imported dynamically inside the new case, matching the existing `email.verification_code` case's `await import(...)` pattern).
- Produces: `OutboxEvent` variant `{ kind: 'email.portal_invite'; payload: { to: string; code: string; expiresAt: string; portalLabel: string } }` — consumed by Task 5's `createPortalInvite()`.

- [ ] **Step 1: Add the new variant to types.ts**

In `frontend/src/lib/server/outbox/types.ts`, add to the `OutboxEvent` union and define the new interface (mirror the existing `EmailVerificationCodeEvent` doc-comment style):

```ts
export type OutboxEvent =
  | NotificationPaymentReceivedEvent
  | EmailPaymentConfirmationEvent
  | EmailVerificationCodeEvent
  | EmailPasswordResetEvent
  | EmailPortalInviteEvent;

/**
 * Generic invite email for any portal-account type (teacher today, student
 * later) — `portalLabel` carries the human-readable destination ("espace
 * enseignant") so one template/dispatcher case serves every portal type.
 * Emitted by createPortalInvite() (lib/server/portal-invite.ts).
 */
export interface EmailPortalInviteEvent {
  kind: 'email.portal_invite';
  payload: {
    to: string;
    code: string;
    expiresAt: string;
    portalLabel: string;
  };
}
```

- [ ] **Step 2: Run typecheck to verify the exhaustive switch now fails**

Run: `pnpm typecheck` (from repo root)
Expected: FAIL — `dispatcher.ts`'s `const _exhaustive: never = event;` no longer compiles because `EmailPortalInviteEvent` isn't handled.

- [ ] **Step 3: Add the dispatcher case**

In `frontend/src/lib/server/outbox/dispatcher.ts`, add a new case right after the existing `case 'email.password_reset':` block (before `default:`):

```ts
    case 'email.portal_invite': {
      // 2026-08-30 — generic invite email shared by the Teacher and
      // (future) Student portals. See email.verification_code above for
      // the same import-on-dispatch shape.
      if (!deps.emailQueue) throw new Error('email queue not configured');
      const { portalInviteEmail } = await import('../auth/email-templates');
      const { to, code, expiresAt, portalLabel } = event.payload;
      const tpl = portalInviteEmail({ code, email: to, expiresAt, portalLabel });
      await deps.emailQueue.enqueue({ to, subject: tpl.subject, html: tpl.html });
      return;
    }
```

- [ ] **Step 4: Run typecheck to verify it passes**

Run: `pnpm typecheck`
Expected: PASS (this also depends on Task 4's `portalInviteEmail` existing — do Task 4's Step 3 first if doing these out of order; as written, Task 4 comes right after this one).

- [ ] **Step 5: Write the dispatcher test**

Add to `frontend/src/lib/server/outbox/dispatcher.test.ts` (find its existing `describe('drainOutbox'` block and add a sibling `it`, matching its existing mock setup for `deps.prisma`/`deps.emailQueue`):

```ts
  it('dispatches email.portal_invite through the email queue', async () => {
    const enqueue = vi.fn().mockResolvedValue('job_1');
    prismaMock.outboxEvent.findMany.mockResolvedValue([{ id: 'oe_1' }] as never);
    prismaMock.outboxEvent.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.outboxEvent.findUnique.mockResolvedValue({
      id: 'oe_1',
      kind: 'email.portal_invite',
      payload: {
        to: 'teacher@school.test',
        code: 'ABCD2345',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        portalLabel: 'espace enseignant',
      },
      attempts: 1,
      status: 'PROCESSING',
    } as never);

    const result = await drainOutbox({ prisma: prismaMock, emailQueue: { enqueue } });

    expect(result.succeeded).toBe(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'teacher@school.test' }),
    );
  });
```

- [ ] **Step 6: Run the test suite**

Run: `pnpm --filter frontend exec vitest run src/lib/server/outbox/dispatcher.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/server/outbox/types.ts frontend/src/lib/server/outbox/dispatcher.ts frontend/src/lib/server/outbox/dispatcher.test.ts
git commit -m "feat(outbox): add generic email.portal_invite event"
```

---

### Task 4: `portalInviteEmail()` template

**Files:**
- Modify: `frontend/src/lib/server/auth/email-templates.ts`
- Modify: `frontend/src/lib/server/auth/email-templates.test.ts`

**Interfaces:**
- Produces: `portalInviteEmail(args: PortalInviteEmailArgs): EmailTemplate` where `PortalInviteEmailArgs = { code: string; email: string; expiresAt?: string; portalLabel: string }` — consumed by Task 3's dispatcher case.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/lib/server/auth/email-templates.test.ts` (mirror the existing `describe('verificationEmail'` block's structure):

```ts
describe('portalInviteEmail', () => {
  it('renders subject/html/text with the portal label and a working link', () => {
    const tpl = portalInviteEmail({
      code: 'ABCD2345',
      email: 'teacher@school.test',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      portalLabel: 'espace enseignant',
    });
    expect(tpl.subject).toContain('espace enseignant');
    expect(tpl.html).toContain('ABCD2345');
    expect(tpl.html).toContain('/definir-mot-de-passe');
    expect(tpl.text).toContain('ABCD2345');
  });

  it('escapes the portalLabel in html output', () => {
    const tpl = portalInviteEmail({
      code: 'ABCD2345',
      email: 'x@test.local',
      portalLabel: '<script>alert(1)</script>',
    });
    expect(tpl.html).not.toContain('<script>');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/auth/email-templates.test.ts`
Expected: FAIL — `portalInviteEmail` is not exported.

- [ ] **Step 3: Implement**

Add to `frontend/src/lib/server/auth/email-templates.ts`, after `resetPasswordUrl`:

```ts
export interface PortalInviteEmailArgs {
  code: string;
  email: string;
  /** Optional ISO-8601 expiry; falls back to "soon" wording when omitted. */
  expiresAt?: string;
  /** Human-readable destination, e.g. "espace enseignant". */
  portalLabel: string;
}

function portalInviteUrl(email: string, code: string): string {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  const qs = new URLSearchParams({ email, code }).toString();
  return `${base}/definir-mot-de-passe?${qs}`;
}

export function portalInviteEmail(args: PortalInviteEmailArgs): EmailTemplate {
  const code = htmlEscape(args.code);
  const portalLabel = htmlEscape(args.portalLabel);
  const ttl = ttlWording(args.expiresAt);
  const url = portalInviteUrl(args.email, args.code);
  const urlEscaped = htmlEscape(url);
  return {
    subject: `You've been invited to your ${portalLabel}`,
    html: `<p>Hi,</p><p>You've been invited to sign in to your <strong>${portalLabel}</strong>.</p><p>Your setup code is <strong>${code}</strong>.</p><p><a href="${urlEscaped}">Click here to set your password</a> — this takes you to the setup page with your code already filled in.</p><p>It expires ${ttl}. If you did not expect this invitation, ignore this email.</p>`,
    text: `You've been invited to your ${args.portalLabel}. Your setup code is ${args.code}. Go to ${url} to set your password (already pre-filled — just confirm), or open the app and enter the code manually. It expires ${ttl}. If you did not expect this invitation, ignore this email.`,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/auth/email-templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/auth/email-templates.ts frontend/src/lib/server/auth/email-templates.test.ts
git commit -m "feat(email): add generic portalInviteEmail template"
```

---

### Task 5: `createPortalInvite()` shared helper

**Files:**
- Create: `frontend/src/lib/server/portal-invite.ts`
- Create: `frontend/src/lib/server/portal-invite.test.ts`

**Interfaces:**
- Consumes: `prisma`, `generateVerificationCode` (`@/lib/server/auth`), `enqueueOutbox` (`@/lib/server/outbox`).
- Produces:
  ```ts
  export interface CreatePortalInviteParams {
    schoolId: string;
    organizationId: string;
    email: string;
    inviteType: string; // VerificationCode.type, e.g. 'TEACHER_INVITE'
    portalLabel: string; // e.g. "espace enseignant"
    expiresInMs: number;
    createOrgMembership: boolean;
    linkExisting: (tx: Prisma.TransactionClient, userId: string) => Promise<void>;
  }
  export type CreatePortalInviteResult =
    | { ok: true; userId: string }
    | { ok: false; error: 'EMAIL_ALREADY_IN_USE' };
  export async function createPortalInvite(params: CreatePortalInviteParams): Promise<CreatePortalInviteResult>;
  ```
  Consumed by Task 6's invite route (with `createOrgMembership: true`, `inviteType: 'TEACHER_INVITE'`, a `linkExisting` that sets `Teacher.userId`).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/server/portal-invite.test.ts`:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPortalInvite } from './portal-invite';

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

const baseParams = {
  schoolId: 'school_1',
  organizationId: 'org_1',
  email: 'teacher@school.test',
  inviteType: 'TEACHER_INVITE',
  portalLabel: 'espace enseignant',
  expiresInMs: 7 * 24 * 60 * 60 * 1000,
  createOrgMembership: true,
};

describe('createPortalInvite', () => {
  it('creates a pending User + OrganizationMember, links, and enqueues the invite', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null as never);
    prismaMock.user.create.mockResolvedValue({ id: 'user_new' } as never);
    const linkExisting = vi.fn().mockResolvedValue(undefined);

    const result = await createPortalInvite({ ...baseParams, linkExisting });

    expect(result).toEqual({ ok: true, userId: 'user_new' });
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'teacher@school.test', passwordHash: null }),
      }),
    );
    expect(prismaMock.organizationMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: 'org_1', role: 'MEMBER' }),
      }),
    );
    expect(linkExisting).toHaveBeenCalledWith(expect.anything(), 'user_new');
    expect(prismaMock.verificationCode.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'TEACHER_INVITE' }) }),
    );
    expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'email.portal_invite' }) }),
    );
  });

  it('skips OrganizationMember creation when createOrgMembership is false', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null as never);
    prismaMock.user.create.mockResolvedValue({ id: 'user_new' } as never);

    await createPortalInvite({
      ...baseParams,
      createOrgMembership: false,
      linkExisting: vi.fn().mockResolvedValue(undefined),
    });

    expect(prismaMock.organizationMember.create).not.toHaveBeenCalled();
  });

  it('reuses an existing passwordless, membership-less User instead of creating a duplicate', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_existing',
      passwordHash: null,
    } as never);
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never);
    const linkExisting = vi.fn().mockResolvedValue(undefined);

    const result = await createPortalInvite({ ...baseParams, linkExisting });

    expect(result).toEqual({ ok: true, userId: 'user_existing' });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(linkExisting).toHaveBeenCalledWith(expect.anything(), 'user_existing');
  });

  it('rejects when the email belongs to an account that already has a password or membership', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_existing',
      passwordHash: 'hash',
    } as never);

    const result = await createPortalInvite({
      ...baseParams,
      linkExisting: vi.fn(),
    });

    expect(result).toEqual({ ok: false, error: 'EMAIL_ALREADY_IN_USE' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/portal-invite.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/server/portal-invite.ts`:

```ts
// Generic "invite someone to a portal account" helper — shared by the
// Teacher invite route today and the (future) Student Portal invite route.
// Creates a pending User (no password yet) + optionally an
// OrganizationMember + a VerificationCode + an outbox invite email, all in
// one transaction. The caller supplies `linkExisting` to set its own
// entity's userId field (Teacher.userId, Student.userId, ...) — this
// module has no knowledge of which entity type is inviting.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { generateVerificationCode } from './auth';
import { enqueueOutbox } from './outbox';

export interface CreatePortalInviteParams {
  schoolId: string;
  organizationId: string;
  email: string;
  /** VerificationCode.type value, e.g. 'TEACHER_INVITE'. */
  inviteType: string;
  /** Human-readable destination for the email copy, e.g. "espace enseignant". */
  portalLabel: string;
  expiresInMs: number;
  /** Student accounts get no OrganizationMember row by design — see the
   * Student Portal spec. Teacher accounts need one (role MEMBER). */
  createOrgMembership: boolean;
  linkExisting: (tx: Prisma.TransactionClient, userId: string) => Promise<void>;
}

export type CreatePortalInviteResult =
  | { ok: true; userId: string }
  | { ok: false; error: 'EMAIL_ALREADY_IN_USE' };

export async function createPortalInvite(
  params: CreatePortalInviteParams,
): Promise<CreatePortalInviteResult> {
  const existing = await prisma.user.findUnique({
    where: { email: params.email },
    select: { id: true, passwordHash: true },
  });
  if (existing) {
    const hasMembership = await prisma.organizationMember.findFirst({
      where: { userId: existing.id },
      select: { id: true },
    });
    if (existing.passwordHash || hasMembership) {
      return { ok: false, error: 'EMAIL_ALREADY_IN_USE' };
    }
  }

  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + params.expiresInMs);

  const userId = await prisma.$transaction(async (tx) => {
    const user =
      existing ??
      (await tx.user.create({
        data: { email: params.email, passwordHash: null },
        select: { id: true },
      }));

    if (params.createOrgMembership) {
      await tx.organizationMember.create({
        data: { userId: user.id, organizationId: params.organizationId, role: 'MEMBER' },
      });
    }

    await params.linkExisting(tx, user.id);

    await tx.verificationCode.create({
      data: { userId: user.id, code, type: params.inviteType, expiresAt },
    });

    await enqueueOutbox(tx, {
      kind: 'email.portal_invite',
      payload: {
        to: params.email,
        code,
        expiresAt: expiresAt.toISOString(),
        portalLabel: params.portalLabel,
      },
    });

    return user.id;
  });

  return { ok: true, userId };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/portal-invite.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/portal-invite.ts frontend/src/lib/server/portal-invite.test.ts
git commit -m "feat(auth): add generic createPortalInvite helper"
```

---

### Task 6: `POST /api/school/teachers/[id]/invite`

**Files:**
- Create: `frontend/src/app/api/school/teachers/[id]/invite/route.ts`
- Create: `frontend/src/app/api/school/teachers/[id]/invite/route.test.ts`

**Interfaces:**
- Consumes: `createPortalInvite` (Task 5), `resolveMySchool`/`hasMinRole` (Task 2 — unchanged signatures), the `assertOwnedTeacher`-style pattern already used in `frontend/src/app/api/school/teachers/[id]/route.ts`.
- Produces: `POST` handler returning `{ ok: true, resent: boolean }` (201) or one of `NOT_FOUND` / `VALIDATION_FAILED` (email or already-linked) / `EMAIL_ALREADY_IN_USE` (400/409) — consumed by Task 7's UI.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/school/teachers/[id]/invite/route.test.ts`:

```ts
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
vi.mock('@/lib/server/portal-invite', () => ({ createPortalInvite: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { resolveMySchool } from '@/lib/server/school';
import { createPortalInvite } from '@/lib/server/portal-invite';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockResolveMySchool = vi.mocked(resolveMySchool);
const mockCreatePortalInvite = vi.mocked(createPortalInvite);

const authUser = { user: { sub: 'admin_1', email: 'admin@test.local' } };
const adminSchool = { organizationId: 'org_1', schoolId: 'school_1', role: 'ADMIN' as const };
const memberSchool = { ...adminSchool, role: 'MEMBER' as const };

function req() {
  return new NextRequest('http://localhost/api/school/teachers/t1/invite', { method: 'POST' });
}
const params = { params: Promise.resolve({ id: 't1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authUser as never);
  mockVerifyCsrf.mockReturnValue(null);
  mockResolveMySchool.mockResolvedValue(adminSchool);
});

describe('POST /api/school/teachers/[id]/invite', () => {
  it('404s when the teacher does not belong to this school', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'other_school',
      email: 'x@test.local',
      userId: null,
    } as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(404);
  });

  it('rejects a non-admin caller', async () => {
    mockResolveMySchool.mockResolvedValue(memberSchool);
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'school_1',
      email: 'x@test.local',
      userId: null,
    } as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(403);
  });

  it('rejects a teacher with no email on file', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'school_1',
      email: null,
      userId: null,
    } as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('invites a fresh teacher and links Teacher.userId', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'school_1',
      email: 'teach@school.test',
      userId: null,
    } as never);
    mockCreatePortalInvite.mockResolvedValue({ ok: true, userId: 'user_new' });
    const res = await POST(req(), params);
    expect(res.status).toBe(201);
    expect(mockCreatePortalInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'teach@school.test',
        inviteType: 'TEACHER_INVITE',
        createOrgMembership: true,
      }),
    );
    // The linkExisting callback passed to createPortalInvite must set Teacher.userId.
    const callback = mockCreatePortalInvite.mock.calls[0]![0].linkExisting;
    await callback(prismaMock as never, 'user_new');
    expect(prismaMock.teacher.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { userId: 'user_new' },
    });
  });

  it('treats an already-linked teacher as a resend, not an error', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'school_1',
      email: 'teach@school.test',
      userId: 'user_existing',
    } as never);
    prismaMock.verificationCode.updateMany.mockResolvedValue({ count: 1 } as never);
    mockCreatePortalInvite.mockResolvedValue({ ok: true, userId: 'user_existing' });
    const res = await POST(req(), params);
    expect(res.status).toBe(201);
    expect((await res.json()).resent).toBe(true);
    // The previous unused code for this user/type must be invalidated first.
    expect(prismaMock.verificationCode.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_existing', type: 'TEACHER_INVITE', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('surfaces EMAIL_ALREADY_IN_USE from createPortalInvite', async () => {
    prismaMock.teacher.findUnique.mockResolvedValue({
      id: 't1',
      schoolId: 'school_1',
      email: 'teach@school.test',
      userId: null,
    } as never);
    mockCreatePortalInvite.mockResolvedValue({ ok: false, error: 'EMAIL_ALREADY_IN_USE' });
    const res = await POST(req(), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('EMAIL_ALREADY_IN_USE');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/teachers/[id]/invite/route.test.ts`
Expected: FAIL — route module doesn't exist.

- [ ] **Step 3: Implement**

Create `frontend/src/app/api/school/teachers/[id]/invite/route.ts`:

```ts
// POST /api/school/teachers/[id]/invite — admin invites a teacher to log
// in. Idempotent-ish: calling it again on an already-linked teacher
// invalidates the previous unused invite code and issues a fresh one
// (resend), rather than erroring.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { createPortalInvite } from '@/lib/server/portal-invite';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — see design spec for why this differs from AUTH_VERIFICATION_TTL_MIN

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const csrfError = verifyCsrf(req);
    if (csrfError) return csrfError;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (!hasMinRole(mySchool.role, 'ADMIN')) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Admin role required' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const teacher = await prisma.teacher.findUnique({ where: { id } });
    if (!teacher || teacher.schoolId !== mySchool.schoolId) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Teacher not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (!teacher.email) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Teacher has no email on file' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Resend path: already linked to a User — invalidate the previous
    // unused invite code and re-send, don't create a second User/link.
    if (teacher.userId) {
      await prisma.verificationCode.updateMany({
        where: { userId: teacher.userId, type: 'TEACHER_INVITE', usedAt: null },
        data: { usedAt: new Date() },
      });
      const result = await createPortalInvite({
        schoolId: mySchool.schoolId,
        organizationId: mySchool.organizationId,
        email: teacher.email,
        inviteType: 'TEACHER_INVITE',
        portalLabel: 'espace enseignant',
        expiresInMs: INVITE_TTL_MS,
        createOrgMembership: false, // already has one from the first invite
        linkExisting: async () => {}, // already linked
      });
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error, message: 'This email is already in use.' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      return NextResponse.json(
        { ok: true, resent: true },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const result = await createPortalInvite({
      schoolId: mySchool.schoolId,
      organizationId: mySchool.organizationId,
      email: teacher.email,
      inviteType: 'TEACHER_INVITE',
      portalLabel: 'espace enseignant',
      expiresInMs: INVITE_TTL_MS,
      createOrgMembership: true,
      linkExisting: async (tx, userId) => {
        await tx.teacher.update({ where: { id: teacher.id }, data: { userId } });
      },
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, message: 'This email is already in use.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      { ok: true, resent: false },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/school/teachers/[id]/invite/route.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/school/teachers/[id]/invite
git commit -m "feat(teachers): add POST /api/school/teachers/[id]/invite"
```

---

### Task 7: Teacher fiche UI — invite / resend

**Files:**
- Modify: `frontend/src/app/(school)/enseignants/[id]/page.tsx` (find the "Informations" tab section — read the file first to locate exact insertion point, it was recently touched by an unrelated `useApi` migration so line numbers in this plan would be stale)
- Modify: `frontend/src/messages/{fr,en,ht}/enseignants.json`

**Interfaces:**
- Consumes: `POST /api/school/teachers/[id]/invite` (Task 6) via the existing `api()` wrapper (`@/lib/api`).
- Produces: nothing consumed by later tasks — this is a leaf UI task.

- [ ] **Step 1: Add the `invite` message group**

To each of `frontend/src/messages/fr/enseignants.json`, `en/enseignants.json`, `ht/enseignants.json`, add a top-level `invite` object (read each file first to match its exact indentation/quoting style):

fr:
```json
"invite": {
  "button": "Inviter à se connecter",
  "buttonDisabledNoEmail": "Ajoutez un email pour pouvoir inviter cet enseignant",
  "resendButton": "Renvoyer l'invitation",
  "pendingSince": "Invitation envoyée le {date}",
  "activeSince": "Compte actif depuis le {date}",
  "sentToast": "Invitation envoyée.",
  "resentToast": "Invitation renvoyée.",
  "errorEmailInUse": "Cette adresse email est déjà utilisée par un autre compte."
}
```

en:
```json
"invite": {
  "button": "Invite to log in",
  "buttonDisabledNoEmail": "Add an email to invite this teacher",
  "resendButton": "Resend invitation",
  "pendingSince": "Invitation sent on {date}",
  "activeSince": "Account active since {date}",
  "sentToast": "Invitation sent.",
  "resentToast": "Invitation resent.",
  "errorEmailInUse": "This email is already used by another account."
}
```

ht:
```json
"invite": {
  "button": "Envite pou konekte",
  "buttonDisabledNoEmail": "Ajoute yon imèl pou envite pwofesè sa a",
  "resendButton": "Voye envitasyon an ankò",
  "pendingSince": "Envitasyon voye {date}",
  "activeSince": "Kont aktif depi {date}",
  "sentToast": "Envitasyon voye.",
  "resentToast": "Envitasyon voye ankò.",
  "errorEmailInUse": "Imèl sa a deja itilize pa yon lòt kont."
}
```

- [ ] **Step 2: Read the teacher fiche page to find the insertion point**

Run: `grep -n "Informations\|civility\|firstName" frontend/src/app/\(school\)/enseignants/\[id\]/page.tsx | head -20`
Locate the section rendering the teacher's contact fields (email/phone) — the invite control goes directly below it.

- [ ] **Step 3: Add the invite/resend UI**

Add `const t = useTranslations('Enseignants.invite');` alongside the page's existing `useTranslations` calls, and `const toast = useToast();` if not already present (check imports first — the page likely already has both from other actions on this screen). Add a card/row block:

```tsx
{teacher.userId === null ? (
  <Button
    disabled={!teacher.email}
    title={!teacher.email ? t('buttonDisabledNoEmail') : undefined}
    onClick={async () => {
      try {
        await api(`/api/school/teachers/${teacher.id}/invite`, { method: 'POST' });
        toast(t('sentToast'), 'success');
        router.refresh();
      } catch (err) {
        toast(
          err instanceof ApiError && err.code === 'EMAIL_ALREADY_IN_USE'
            ? t('errorEmailInUse')
            : tCommon('errors.network'),
          'error',
        );
      }
    }}
  >
    {t('button')}
  </Button>
) : teacher.emailVerifiedAt ? (
  <span className="text-xs text-muted-foreground">
    {t('activeSince', { date: fmt(teacher.emailVerifiedAt) })}
  </span>
) : (
  <div className="flex items-center gap-2">
    <span className="text-xs text-muted-foreground">{t('pendingSince', { date: fmt(teacher.updatedAt) })}</span>
    <Button
      variant="ghost"
      onClick={async () => {
        try {
          await api(`/api/school/teachers/${teacher.id}/invite`, { method: 'POST' });
          toast(t('resentToast'), 'success');
        } catch {
          toast(tCommon('errors.network'), 'error');
        }
      }}
    >
      {t('resendButton')}
    </Button>
  </div>
)}
```

Note: `teacher.userId`/`teacher.emailVerifiedAt` need to be included in whatever the page's `GET /api/school/teachers/[id]` response already selects — check `frontend/src/app/api/school/teachers/[id]/route.ts`'s `GET` handler's `select`/return shape and add `userId: true` plus (via the linked `user` relation) `emailVerifiedAt` if not already returned, mirroring how the route already returns other Teacher fields.

- [ ] **Step 4: Manual verification (no route.test.ts convention for this file — see CLAUDE.md, most UI-adjacent routes are verified live)**

Start the dev server (`pnpm dev`), open a teacher fiche with an email set, click "Inviter à se connecter", confirm the toast and that the button becomes "Renvoyer l'invitation" / shows the pending state after a refresh. Confirm the disabled state + tooltip when the teacher has no email.

- [ ] **Step 5: Run the full gate and commit**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: all clean.

```bash
git add frontend/src/app/\(school\)/enseignants/\[id\]/page.tsx frontend/src/messages/*/enseignants.json
git commit -m "feat(enseignants): add invite-to-login action on the teacher fiche"
```

---

### Task 8: `POST /api/auth/teacher-invite/accept`

**Files:**
- Create: `frontend/src/app/api/auth/teacher-invite/accept/route.ts`
- Create: `frontend/src/app/api/auth/teacher-invite/accept/route.test.ts`

**Interfaces:**
- Consumes: `VERIFICATION_CODE_REGEX`, `hashPassword`, `setAuthCookies`, `setCsrfCookie`, `createAccessToken`, `createRefreshToken`, `timingSafeCompare` (all from `@/lib/server/auth`, called not modified), `isBanned` (`@/lib/server/auth/banned-passwords`), `isPwned` (`@/lib/server/auth/hibp`).
- Produces: `POST` handler, `{ ok: true, user: { sub, email } }` on success, issuing the standard auth cookies — consumed by Task 9's page.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/auth/teacher-invite/accept/route.test.ts` (mirror `frontend/src/app/api/auth/verify-email/route.ts`'s test file if one exists — check with `find frontend/src/app/api/auth/verify-email -name "*.test.ts"` first and copy its mocking setup for `setAuthCookies`/`setCsrfCookie`/rate limiter; otherwise use this shape):

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/redis', () => ({ redis: null }));
vi.mock('@/lib/server/auth/banned-passwords', () => ({ isBanned: vi.fn().mockReturnValue(false) }));
vi.mock('@/lib/server/auth/hibp', () => ({ isPwned: vi.fn().mockResolvedValue(false) }));

import { POST } from './route';

function req(body: unknown) {
  return new NextRequest('http://localhost/api/auth/teacher-invite/accept', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  email: 'teacher@school.test',
  code: 'ABCD2345',
  newPassword: 'a-long-enough-password',
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('POST /api/auth/teacher-invite/accept', () => {
  it('returns VERIFICATION_CODE_INVALID for an unknown email', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null as never);
    const res = await POST(req(validBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VERIFICATION_CODE_INVALID');
  });

  it('returns VERIFICATION_CODE_INVALID for a wrong/used code', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'teacher@school.test',
      tokenVersion: 0,
    } as never);
    prismaMock.verificationCode.findFirst.mockResolvedValue(null as never);
    const res = await POST(req(validBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VERIFICATION_CODE_INVALID');
  });

  it('returns VERIFICATION_CODE_EXPIRED for an expired code', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'teacher@school.test',
      tokenVersion: 0,
    } as never);
    prismaMock.verificationCode.findFirst.mockResolvedValue({
      id: 'code_1',
      code: 'ABCD2345',
      expiresAt: new Date(Date.now() - 1000),
    } as never);
    const res = await POST(req(validBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VERIFICATION_CODE_EXPIRED');
  });

  it('sets the password, marks the code used, and issues cookies on success', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'teacher@school.test',
      tokenVersion: 0,
    } as never);
    prismaMock.verificationCode.findFirst.mockResolvedValue({
      id: 'code_1',
      code: 'ABCD2345',
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    prismaMock.verificationCode.updateMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_1' },
        data: expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/auth/teacher-invite/accept/route.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `frontend/src/app/api/auth/teacher-invite/accept/route.ts` (this is `verify-email/route.ts`'s exact shape, with `type: 'TEACHER_INVITE'`, a password to hash, and `passwordHash` set alongside `emailVerifiedAt`):

```ts
// POST /api/auth/teacher-invite/accept — AUTH-style code consumption.
//
// Consumes a TEACHER_INVITE code, hashes the submitted password into
// User.passwordHash, marks emailVerifiedAt (the invite link itself is the
// verification, matching how OAuth sign-in already treats a verified
// provider email), marks the code usedAt, and issues all three auth
// cookies — this is the invite flow's equivalent of /verify-email, so
// unlike /reset-password it DOES establish a session on success.
//
// CSRF carve-out: pre-session route — the CSRF cookie is set HERE on
// success, so calling verifyCsrf would 403 every legitimate request.
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { zEmail } from '@/lib/server/zod-helpers';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import {
  VERIFICATION_CODE_REGEX,
  hashPassword,
  setAuthCookies,
  setCsrfCookie,
  createAccessToken,
  createRefreshToken,
  timingSafeCompare,
} from '@/lib/server/auth';
import { isBanned } from '@/lib/server/auth/banned-passwords';
import { isPwned } from '@/lib/server/auth/hibp';

const PASSWORD_MIN = Number(process.env.AUTH_PASSWORD_MIN_LENGTH ?? 10);

const Body = z.object({
  email: zEmail,
  code: z.string().regex(VERIFICATION_CODE_REGEX, 'Invalid verification code format'),
  newPassword: z.string().min(1),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'auth:teacher-invite-accept',
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_VERIFY_RATE_LIMIT_MAX ?? 5),
  code: 'TOO_MANY_VERIFY_ATTEMPTS',
  message: 'Too many attempts. Try again later.',
});

function formatIssues(err: z.ZodError) {
  return err.issues.map((e) => ({ path: e.path.join('.'), message: e.message }));
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      const res = NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: formatIssues(parsed.error) },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    const { email, code, newPassword } = parsed.data;

    const rateFail = await limiter.check(req, email);
    if (rateFail) return rateFail;

    if (isBanned(newPassword)) {
      const res = NextResponse.json(
        { error: 'PASSWORD_BANNED', message: 'This password is too common.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (newPassword.length < PASSWORD_MIN) {
      const res = NextResponse.json(
        { error: 'PASSWORD_TOO_SHORT', message: `Password must be at least ${PASSWORD_MIN} characters` },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (process.env.PASSWORD_HIBP_CHECK === '1' && (await isPwned(newPassword))) {
      const res = NextResponse.json(
        { error: 'PASSWORD_PWNED', message: 'This password appeared in a known data breach.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, tokenVersion: true },
    });
    if (!user) {
      const res = NextResponse.json(
        { error: 'VERIFICATION_CODE_INVALID', message: 'Verification code is invalid.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    const codeRow = await prisma.verificationCode.findFirst({
      where: { userId: user.id, code, type: 'TEACHER_INVITE', usedAt: null },
      select: { id: true, code: true, expiresAt: true },
    });
    if (!codeRow) {
      const res = NextResponse.json(
        { error: 'VERIFICATION_CODE_INVALID', message: 'Verification code is invalid.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (codeRow.expiresAt.getTime() < Date.now()) {
      const res = NextResponse.json(
        { error: 'VERIFICATION_CODE_EXPIRED', message: 'Verification code has expired.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (!timingSafeCompare(code, codeRow.code)) {
      const res = NextResponse.json(
        { error: 'VERIFICATION_CODE_INVALID', message: 'Verification code is invalid.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    const passwordHash = await hashPassword(newPassword);

    try {
      await prisma.$transaction(async (tx) => {
        const consumed = await tx.verificationCode.updateMany({
          where: { id: codeRow.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (consumed.count === 0) {
          throw new Error('VERIFICATION_CODE_RACE');
        }
        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash, emailVerifiedAt: new Date() },
        });
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'VERIFICATION_CODE_RACE') {
        const res = NextResponse.json(
          { error: 'VERIFICATION_CODE_INVALID', message: 'Verification code is invalid.' },
          { status: 400 },
        );
        res.headers.set('x-request-id', ctx.requestId);
        return res;
      }
      throw err;
    }

    const access = await createAccessToken({ sub: user.id, email: user.email, tokenVersion: user.tokenVersion });
    const refresh = await createRefreshToken(user.id, user.tokenVersion);
    await setAuthCookies(access, refresh);
    await setCsrfCookie();

    log.info('teacher-invite accept success', { userId: user.id });
    const res = NextResponse.json({ ok: true, user: { sub: user.id, email: user.email } });
    res.headers.set('x-request-id', ctx.requestId);
    return res;
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/auth/teacher-invite/accept/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/auth/teacher-invite
git commit -m "feat(auth): add POST /api/auth/teacher-invite/accept"
```

---

### Task 9: `/definir-mot-de-passe` public page

**Files:**
- Create: `frontend/src/app/(auth)/definir-mot-de-passe/page.tsx` (check first whether a `(auth)` route group already exists alongside `/login`, `/reset-password`, etc. — if those pages live at the app root without a route group, create this one the same way, un-grouped)
- Create: `frontend/src/messages/{fr,en,ht}/setPassword.json`
- Modify: `frontend/src/lib/locales.ts` (register `setPassword` in `MESSAGE_NAMESPACES`)

**Interfaces:**
- Consumes: `POST /api/auth/teacher-invite/accept` (Task 8) via `@/lib/api`'s `api()` wrapper.

- [ ] **Step 1: Check the existing auth pages' location**

Run: `find frontend/src/app -maxdepth 1 -iname "reset-password" -o -maxdepth 1 -iname "verify-email"`
Use whatever structure that reveals (route group or flat) for the new page.

- [ ] **Step 2: Create the message files**

`frontend/src/messages/fr/setPassword.json`:
```json
{
  "title": "Définir votre mot de passe",
  "subtitle": "Vous avez été invité(e) à rejoindre votre espace enseignant.",
  "passwordLabel": "Nouveau mot de passe",
  "submit": "Créer mon compte",
  "submitting": "Création en cours…",
  "success": "Compte créé, vous êtes connecté(e).",
  "errors": {
    "VERIFICATION_CODE_INVALID": "Ce lien n'est plus valide.",
    "VERIFICATION_CODE_EXPIRED": "Ce lien a expiré — demandez une nouvelle invitation.",
    "PASSWORD_TOO_SHORT": "Mot de passe trop court.",
    "PASSWORD_BANNED": "Ce mot de passe est trop courant.",
    "PASSWORD_PWNED": "Ce mot de passe est apparu dans une fuite de données connue.",
    "generic": "Une erreur est survenue."
  }
}
```

`frontend/src/messages/en/setPassword.json`:
```json
{
  "title": "Set your password",
  "subtitle": "You've been invited to your teacher portal.",
  "passwordLabel": "New password",
  "submit": "Create my account",
  "submitting": "Creating…",
  "success": "Account created, you're signed in.",
  "errors": {
    "VERIFICATION_CODE_INVALID": "This link is no longer valid.",
    "VERIFICATION_CODE_EXPIRED": "This link has expired — ask for a new invitation.",
    "PASSWORD_TOO_SHORT": "Password too short.",
    "PASSWORD_BANNED": "This password is too common.",
    "PASSWORD_PWNED": "This password appeared in a known data breach.",
    "generic": "Something went wrong."
  }
}
```

`frontend/src/messages/ht/setPassword.json`:
```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman.",
  "title": "Chwazi modpas ou",
  "subtitle": "Yo envite w nan espas anseyan w.",
  "passwordLabel": "Nouvo modpas",
  "submit": "Kreye kont mwen",
  "submitting": "N ap kreye…",
  "success": "Kont kreye, ou konekte.",
  "errors": {
    "VERIFICATION_CODE_INVALID": "Lyen sa a pa valab ankò.",
    "VERIFICATION_CODE_EXPIRED": "Lyen sa a ekspire — mande yon nouvo envitasyon.",
    "PASSWORD_TOO_SHORT": "Modpas twò kout.",
    "PASSWORD_BANNED": "Modpas sa a twò komen.",
    "PASSWORD_PWNED": "Modpas sa a parèt nan yon fuit done li te ye.",
    "generic": "Yon bagay pa mache."
  }
}
```

- [ ] **Step 3: Register the namespace**

In `frontend/src/lib/locales.ts`, add `'setPassword'` to the `MESSAGE_NAMESPACES` array (find the existing array and add it in alphabetical position, matching the file's convention).

- [ ] **Step 4: Implement the page**

Create `frontend/src/app/(auth)/definir-mot-de-passe/page.tsx` (adjust the path per Step 1's finding), modeled on the existing `/reset-password` page's structure (read it first for the exact `Suspense`+`useSearchParams` wrapper shape, since the email/code come from the URL query string just like that page):

```tsx
'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

function SetPasswordForm() {
  const t = useTranslations('SetPassword');
  const router = useRouter();
  const { refresh } = useAuth();
  const params = useSearchParams();
  const email = params.get('email') ?? '';
  const code = params.get('code') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/teacher-invite/accept', {
        method: 'POST',
        body: { email, code, newPassword: password },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      router.push('/espace-enseignant');
    } catch (err) {
      const knownCode =
        err instanceof ApiError && err.code in t.raw('errors') ? err.code : 'generic';
      setError(t(`errors.${knownCode}` as never));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mx-auto mt-16 max-w-md p-6">
      <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
        <Field
          label={t('passwordLabel')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? t('submitting') : t('submit')}
        </Button>
      </form>
    </Card>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordForm />
    </Suspense>
  );
}
```

- [ ] **Step 5: Run the i18n consistency test**

Run: `pnpm --filter frontend exec vitest run src/lib/locales.test.ts`
Expected: PASS (fails loudly if the fr/en/ht key sets for `setPassword` don't match exactly).

- [ ] **Step 6: Commit**

```bash
git add "frontend/src/app/(auth)/definir-mot-de-passe" frontend/src/messages/*/setPassword.json frontend/src/lib/locales.ts
git commit -m "feat(auth): add /definir-mot-de-passe invite-acceptance page"
```

---

### Task 10: `/api/auth/me` — expose teacher-linked status for redirect

**Files:**
- Modify: `frontend/src/app/api/auth/me/route.ts` (GET handler only)
- Modify/create: `frontend/src/app/api/auth/me/route.test.ts` (check first if it exists)

**Interfaces:**
- Consumes: `resolveMySchoolIncludingTeacher`, `resolveMyTeacherProfile` (Task 2).
- Produces: adds `isTeacherOnly: boolean` to the existing `{ user }` response shape — consumed by Task 11's login redirect.

- [ ] **Step 1: Write the failing test**

Add to (or create) `frontend/src/app/api/auth/me/route.test.ts`:

```ts
it('reports isTeacherOnly=true for a MEMBER-role teacher-linked account', async () => {
  prismaMock.user.findUnique.mockResolvedValue({
    id: 'user_1',
    email: 'teach@school.test',
    role: 'USER',
  } as never);
  mockResolveMySchoolIncludingTeacher.mockResolvedValue({
    organizationId: 'org_1',
    schoolId: 'school_1',
    role: 'MEMBER',
  });
  mockResolveMyTeacherProfile.mockResolvedValue({
    teacherId: 't1',
    classSubjectIds: [],
    homeroomClassIds: [],
  });
  const res = await GET(reqWithAuthHeader());
  expect((await res.json()).user.isTeacherOnly).toBe(true);
});

it('reports isTeacherOnly=false for an admin who is also teacher-linked', async () => {
  mockResolveMySchoolIncludingTeacher.mockResolvedValue({
    organizationId: 'org_1',
    schoolId: 'school_1',
    role: 'ADMIN',
  });
  mockResolveMyTeacherProfile.mockResolvedValue({
    teacherId: 't1',
    classSubjectIds: [],
    homeroomClassIds: [],
  });
  const res = await GET(reqWithAuthHeader());
  expect((await res.json()).user.isTeacherOnly).toBe(false);
});

it('reports isTeacherOnly=false for a plain staff account', async () => {
  mockResolveMySchoolIncludingTeacher.mockResolvedValue({
    organizationId: 'org_1',
    schoolId: 'school_1',
    role: 'MEMBER',
  });
  mockResolveMyTeacherProfile.mockResolvedValue(null);
  const res = await GET(reqWithAuthHeader());
  expect((await res.json()).user.isTeacherOnly).toBe(false);
});
```

Add the necessary `vi.mock('@/lib/server/school', ...)` block (mocking both `resolveMySchoolIncludingTeacher` and `resolveMyTeacherProfile`) and a `reqWithAuthHeader()` helper matching whatever pattern the existing tests in this file already use for `requireAuth` — read the file's current top section first if it exists, otherwise follow the `rooms/route.test.ts` mocking convention shown above.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/auth/me/route.test.ts`
Expected: FAIL — `isTeacherOnly` not in the response yet.

- [ ] **Step 3: Implement**

In `frontend/src/app/api/auth/me/route.ts`'s `GET` handler, add after the `dbUser` query and before constructing the `user` object:

```ts
import { resolveMySchoolIncludingTeacher, resolveMyTeacherProfile } from '@/lib/server/school';

// ... inside GET, after `const dbUser = ...`:
const mySchool = await resolveMySchoolIncludingTeacher(auth.user.sub);
const teacherProfile = mySchool
  ? await resolveMyTeacherProfile(auth.user.sub, mySchool.schoolId)
  : null;
const isTeacherOnly = mySchool?.role === 'MEMBER' && teacherProfile !== null;
```

Add `isTeacherOnly` to the returned `user` object literal (right after `hasPassword`):

```ts
      hasPassword: !!dbUser?.passwordHash,
      isTeacherOnly,
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/auth/me/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite (this touches a widely-mocked route) and commit**

Run: `pnpm --filter frontend exec vitest run`
Expected: PASS — other tests that mock `/api/auth/me`'s response shape via a plain object literal are unaffected (an added field doesn't break `toMatchObject`/`toEqual` assertions unless one uses strict `toEqual` on the whole `user` object; grep for `toEqual({ user:` if any failures appear and add `isTeacherOnly: false` to those fixtures).

```bash
git add frontend/src/app/api/auth/me
git commit -m "feat(auth): expose isTeacherOnly on GET /api/auth/me"
```

---

### Task 11: `/espace-enseignant` bare home page + redirects

**Files:**
- Create: `frontend/src/app/(teacher)/espace-enseignant/layout.tsx`
- Create: `frontend/src/app/(teacher)/espace-enseignant/page.tsx`
- Create: `frontend/src/messages/{fr,en,ht}/teacherPortal.json`
- Modify: `frontend/src/lib/locales.ts` (register `teacherPortal`)
- Modify: `frontend/src/app/login/page.tsx`
- Modify: `frontend/src/app/(school)/layout.tsx` (the stale comment at the top — see below)

**Interfaces:**
- Consumes: `useAuth()`/`useUser()` (`@/contexts/AuthContext`) — specifically the `isTeacherOnly` field added in Task 10.

- [ ] **Step 1: Message files**

`frontend/src/messages/fr/teacherPortal.json`:
```json
{
  "title": "Espace enseignant",
  "welcome": "Bienvenue, {name}",
  "comingSoon": "Vos classes, notes et appréciations arrivent bientôt ici."
}
```
`frontend/src/messages/en/teacherPortal.json`:
```json
{
  "title": "Teacher space",
  "welcome": "Welcome, {name}",
  "comingSoon": "Your classes, grades and appreciations are coming here soon."
}
```
`frontend/src/messages/ht/teacherPortal.json`:
```json
{
  "_review": "Kreyòl ayisyen — tradiksyon inisyal, poko relwe pa yon moun ki pale lang lan natirèlman.",
  "title": "Espas anseyan",
  "welcome": "Byenveni, {name}",
  "comingSoon": "Klas, nòt ak apresyasyon w yo ap vini isit la byento."
}
```

Register `'teacherPortal'` in `MESSAGE_NAMESPACES` (`frontend/src/lib/locales.ts`).

- [ ] **Step 2: Bare layout + page**

Create `frontend/src/app/(teacher)/espace-enseignant/layout.tsx`:

```tsx
'use client';

import { type ReactNode } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/Skeleton';

// Mobile-first shell for the teacher-facing portal — deliberately NOT the
// admin (school)/layout.tsx (no SchoolSidebar/SchoolTopbar). Phase 1 ships
// this bare; the bottom tab bar + Mes classes/Notes/Appréciations nav is
// built in later phases per docs/superpowers/specs/2026-08-30-espace-enseignant-design.md.
export default function TeacherLayout({ children }: { children: ReactNode }) {
  const user = useUser();
  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }
  return <div className="mx-auto min-h-screen max-w-lg px-4 py-6">{children}</div>;
}
```

Create `frontend/src/app/(teacher)/espace-enseignant/page.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useUser } from '@/contexts/AuthContext';

export default function EspaceEnseignantHomePage() {
  const t = useTranslations('TeacherPortal');
  const user = useUser();
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
      <p className="text-sm text-foreground">{t('welcome', { name: user?.name ?? user?.email ?? '' })}</p>
      <p className="text-sm text-muted-foreground">{t('comingSoon')}</p>
    </div>
  );
}
```

- [ ] **Step 3: Wire the login redirect**

In `frontend/src/app/login/page.tsx`, change:

```tsx
      const isPlatformStaff = me?.role === 'SUPERADMIN' || me?.role === 'ADMIN';
      router.push(isPlatformStaff ? '/admin' : '/dashboard');
```

to:

```tsx
      const isPlatformStaff = me?.role === 'SUPERADMIN' || me?.role === 'ADMIN';
      const destination = isPlatformStaff
        ? '/admin'
        : me?.isTeacherOnly
          ? '/espace-enseignant'
          : '/dashboard';
      router.push(destination);
```

Add `isTeacherOnly?: boolean` to whatever local type `me`/the `AuthContext` user shape uses (check `frontend/src/contexts/AuthContext.tsx`'s user type and extend it — it should already be reading through the `/api/auth/me` response, so this is likely a one-line addition to an existing interface).

- [ ] **Step 4: Fix the stale comment and add the belt-and-suspenders redirect in `(school)/layout.tsx`**

The current comment block in `frontend/src/app/(school)/layout.tsx` (lines 15-24) describes a redirect to `/enseignant` that never existed in this codebase — replace it and add the real guard:

```tsx
// Basic auth gate here (any logged-in user) — school-membership itself is
// checked by individual pages that need it (e.g. /settings via GET
// /api/school's NO_SCHOOL response), not the shell.
//
// A purely teacher-linked account (isTeacherOnly) is bounced to
// /espace-enseignant — belt-and-suspenders on top of the login-time
// redirect (login/page.tsx), so a stale bookmark/tab can't land on the
// admin shell. An admin who is ALSO teacher-linked is never redirected
// here (isTeacherOnly is false for them) — see resolveMySchool()'s
// deny-by-default check in lib/server/school.ts, which the client mirrors
// via GET /api/auth/me's isTeacherOnly field.
export default function SchoolLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('Shell');
  const user = useUser();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useSidebarCollapse();

  useEffect(() => {
    if (user?.isTeacherOnly) {
      router.replace('/espace-enseignant');
    }
  }, [user, router]);

  if (!user || user.isTeacherOnly) {
```

(Add `useEffect` and `useRouter` to the existing import lines at the top of the file — `useRouter` from `next/navigation`, `useEffect` from `react`.) Keep the rest of the loading-skeleton branch as-is, just extend its condition as shown.

- [ ] **Step 5: Manual verification**

Run `pnpm dev`, invite a teacher (Task 7's UI), open the invite email link (check the local email log / EmailQueue sink per this project's dev setup — see README for how outbound email is inspected locally), set a password, confirm landing on `/espace-enseignant`, confirm navigating to `/dashboard` bounces back to `/espace-enseignant`, confirm a normal admin login still lands on `/dashboard` unaffected.

- [ ] **Step 6: Run the full gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm --filter frontend exec vitest run`
Expected: all clean, full suite green.

- [ ] **Step 7: Commit**

```bash
git add "frontend/src/app/(teacher)" "frontend/src/app/(school)/layout.tsx" frontend/src/app/login/page.tsx frontend/src/contexts/AuthContext.tsx frontend/src/messages/*/teacherPortal.json frontend/src/lib/locales.ts
git commit -m "feat(teacher-portal): bare /espace-enseignant home + role-aware redirect"
```

---

## Phase 1 exit criteria

- A teacher with an email on file can be invited from their fiche, receives an email, sets a password, and lands on `/espace-enseignant`.
- That account cannot read or write anything under any other `/api/school/*` route (verify with a manual `curl -H "Cookie: ..." /api/school/students` returning 404) or navigate to `/dashboard`/`/eleves`/etc. without being bounced back.
- An admin who is also teacher-linked is unaffected — normal admin experience, plus could reach `/espace-enseignant` if they typed the URL (not blocked, no separate task needed to make this explicitly easy — that's a Phase 2+ nicety, not a Phase 1 requirement).
- `pnpm format && pnpm lint && pnpm typecheck && pnpm test` all pass.
- Nothing in Phases 2-4 (scoped grades/appréciations/attendance/timetable reads) exists yet — expected, tracked in the spec's rollout section.

Once this ships and is pushed, ping `ekolplus2-93` (per the cross-session coordination log) so the Student Portal work can start on top of `createPortalInvite()`/`isPortalOnlyAccount()`/the `email.portal_invite` outbox kind.
