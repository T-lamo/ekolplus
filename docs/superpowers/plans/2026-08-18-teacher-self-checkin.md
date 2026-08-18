# Teacher Self Check-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Post-implementation amendment (2026-08-18):** the final whole-branch
> review found that granting invited teachers an `OrganizationMember` row
> (as this plan describes, including Task 4's code below) hands every
> teacher account read access to the whole school back-office. The shipped
> code does **not** create an `OrganizationMember` row for teachers — every
> `OrganizationMember`/`organizationMember`/`organization.findFirst`
> reference below is historical intent, not shipped behavior. See
> `frontend/src/app/api/auth/teacher-invite/[token]/accept/route.ts` at
> HEAD for the real implementation, and the SDD ledger
> (`.superpowers/sdd/2026-08-18-teacher-self-checkin/progress.md`, Final
> review section) for full rationale.

**Goal:** Let a teacher sign into a minimal portal and check in to their own timetable sessions, with a read-only admin history view.

**Architecture:** A teacher account is an ordinary `User` + `OrganizationMember(role: MEMBER)`, created via an admin-issued, e-mail-delivered, one-time invite link — reusing every existing auth primitive untouched. A new minimal route group (`/enseignant`) is the teacher-facing portal (today's sessions + a check-in button per session); the existing Teachers list/profile pages gain the admin-facing wiring (an "Inviter" action and a read-only "Présences" tab).

**Tech Stack:** Next.js 16 App Router (Route Handlers + client components), Prisma 5, existing `EmailQueue`/Resend pipeline, existing JWT/cookie session model — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-18-teacher-self-checkin-design.md`

## Global Constraints

- Every new Route Handler: `export const runtime = 'nodejs'` + wrapped in `withRequestContext(makeRequestContext(req.headers), ...)`.
- Every mutating route: `requireAuth(req.headers.get('authorization'))` first (bail if it returns a `NextResponse`), then `verifyCsrf(req)` where the route is session-authenticated (pre-session routes — the invite-accept endpoint — are CSRF-exempt, same carve-out as signup/reset-password, since no CSRF cookie exists yet).
- Admin-facing mutations additionally require `hasMinRole(mySchool.role, 'ADMIN')` from `resolveMySchool(auth.user.sub)`.
- Do not modify `lib/server/auth.ts`, `lib/server/middleware/index.ts`, or any other file on CLAUDE.md's protected list — only ever import their existing exports.
- Money/None here — no payment amounts involved, this constraint doesn't apply.
- French UI copy throughout, matching the rest of the app.
- `pnpm format && pnpm lint && pnpm typecheck && pnpm test` must stay green after every task.

---

### Task 1: Data model — `Teacher.userId`, `TeacherInvite`, `TeacherCheckIn`

**Files:**
- Modify: `frontend/prisma/schema.prisma`

**Interfaces:**
- Produces: `Teacher.userId String? @unique`, `Teacher.user`, `Teacher.invites TeacherInvite[]`, `Teacher.checkIns TeacherCheckIn[]`; `TeacherInvite { id, schoolId, teacherId, token, expiresAt, usedAt, createdAt }`; `TeacherCheckIn { id, schoolId, timetableSessionId, teacherId, checkedInAt }` — every later task's Prisma calls (`prisma.teacher.findFirst({ where: { userId } })`, `prisma.teacherInvite.create/findUnique`, `prisma.teacherCheckIn.create/findMany`) rely on these exact field names.

- [ ] **Step 1: Add the `Teacher.userId` link and its `User` back-relation**

In `frontend/prisma/schema.prisma`, find `model Teacher {` (currently starts at line 381) and add right after the `weeklyHoursTarget Int?` field, before `createdAt`:

```prisma
  // Links this contact record to a login account, created via the invite
  // flow (see TeacherInvite). Nullable — most teachers have no account.
  userId String? @unique
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
```

Then find `model User {` and add to its relation block (next to `memberships OrganizationMember[] @relation("OrgMembership")`):

```prisma
  teacherProfile Teacher?
```

- [ ] **Step 2: Add `TeacherInvite` and `TeacherCheckIn` models**

Add these two new models directly after the closing `}` of `model Teacher { ... }`:

```prisma
model TeacherInvite {
  id        String    @id @default(cuid())
  schoolId  String
  school    School    @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  teacherId String
  teacher   Teacher   @relation(fields: [teacherId], references: [id], onDelete: Cascade)
  token     String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([teacherId])
}

model TeacherCheckIn {
  id                 String           @id @default(cuid())
  schoolId           String
  school             School           @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  timetableSessionId String
  timetableSession   TimetableSession @relation(fields: [timetableSessionId], references: [id], onDelete: Cascade)
  teacherId          String
  teacher            Teacher          @relation(fields: [teacherId], references: [id], onDelete: Cascade)
  checkedInAt         DateTime        @default(now())

  @@unique([timetableSessionId, teacherId])
  @@index([schoolId, teacherId])
}
```

- [ ] **Step 3: Wire the reverse relations on `Teacher`, `School`, and `TimetableSession`**

In `model Teacher { ... }`, add next to the other relation fields (`classSubjects`, `homeroomClasses`, etc.):

```prisma
  invites  TeacherInvite[]
  checkIns TeacherCheckIn[]
```

In `model School { ... }`, add next to `rooms Room[]`:

```prisma
  teacherInvites   TeacherInvite[]
  teacherCheckIns  TeacherCheckIn[]
```

In `model TimetableSession { ... }`, add next to the existing scalar/relation fields, before the `@@index` lines:

```prisma
  checkIns TeacherCheckIn[]
```

- [ ] **Step 4: Generate and apply the migration**

Run from the repo root:

```bash
pnpm db:migrate:dev --name teacher_self_checkin
```

Expected: a new `frontend/prisma/migrations/27_teacher_self_checkin/migration.sql` is created and applied; Prisma Client regenerates with no errors.

- [ ] **Step 5: Verify the schema compiles**

Run: `pnpm --filter frontend exec prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 6: Restart the dev server if one is running**

The Prisma client was just regenerated — an already-running `pnpm dev` process is holding a stale client in memory (this has bitten this exact project before — see the `dev-server-restart-after-prisma-generate` note in prior work). Restart it before any live verification in later tasks.

- [ ] **Step 7: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/
git commit -m "feat(teachers): add Teacher.userId, TeacherInvite, TeacherCheckIn models"
```

---

### Task 2: Status computation helper (pure, TDD)

**Files:**
- Create: `frontend/src/lib/server/teacher-attendance/status.ts`
- Test: `frontend/src/lib/server/teacher-attendance/status.test.ts`

**Interfaces:**
- Produces: `type CheckInStatus = 'UPCOMING' | 'PRESENT' | 'LATE' | 'ABSENT'` and `computeCheckInStatus(session: { date: string; startMinutes: number; endMinutes: number }, checkedInAt: Date | null, now: Date): CheckInStatus` — consumed by Task 6 (`/api/teacher/sessions/today`) and Task 7 (`/api/school/teachers/[id]/checkins`), both of which import this exact function name and signature.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/server/teacher-attendance/status.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeCheckInStatus } from './status';

const session = { date: '2026-08-18', startMinutes: 8 * 60, endMinutes: 9 * 60 }; // 08:00–09:00

function at(hh: number, mm: number): Date {
  return new Date(`2026-08-18T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`);
}

describe('computeCheckInStatus', () => {
  it('is UPCOMING before the session ends with no check-in', () => {
    expect(computeCheckInStatus(session, null, at(7, 55))).toBe('UPCOMING');
    expect(computeCheckInStatus(session, null, at(8, 30))).toBe('UPCOMING');
  });

  it('is ABSENT once the session has ended with no check-in', () => {
    expect(computeCheckInStatus(session, null, at(9, 0))).toBe('ABSENT');
    expect(computeCheckInStatus(session, null, at(9, 30))).toBe('ABSENT');
  });

  it('is PRESENT when checked in within 10 minutes of the start', () => {
    expect(computeCheckInStatus(session, at(8, 0), at(8, 0))).toBe('PRESENT');
    expect(computeCheckInStatus(session, at(8, 10), at(8, 10))).toBe('PRESENT');
    // even checked in a bit early
    expect(computeCheckInStatus(session, at(7, 58), at(7, 58))).toBe('PRESENT');
  });

  it('is LATE when checked in more than 10 minutes after the start', () => {
    expect(computeCheckInStatus(session, at(8, 11), at(8, 11))).toBe('LATE');
    expect(computeCheckInStatus(session, at(8, 45), at(8, 45))).toBe('LATE');
  });

  it('a past check-in stays PRESENT/LATE regardless of "now"', () => {
    expect(computeCheckInStatus(session, at(8, 5), at(23, 0))).toBe('PRESENT');
    expect(computeCheckInStatus(session, at(8, 20), at(23, 0))).toBe('LATE');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/lib/server/teacher-attendance/status.test.ts`
Expected: FAIL — `Cannot find module './status'`

- [ ] **Step 3: Implement**

Create `frontend/src/lib/server/teacher-attendance/status.ts`:

```ts
// Shared status computation for a teacher's per-session check-in — used by
// both the teacher portal's "today" view and the admin history view so the
// two never drift (see docs/superpowers/specs/2026-08-18-teacher-self-checkin-design.md).
import 'server-only';

export type CheckInStatus = 'UPCOMING' | 'PRESENT' | 'LATE' | 'ABSENT';

const LATE_THRESHOLD_MINUTES = 10;

export function computeCheckInStatus(
  session: { date: string; startMinutes: number; endMinutes: number },
  checkedInAt: Date | null,
  now: Date,
): CheckInStatus {
  const dayStart = new Date(`${session.date}T00:00:00`);
  const sessionStart = new Date(dayStart.getTime() + session.startMinutes * 60_000);
  const sessionEnd = new Date(dayStart.getTime() + session.endMinutes * 60_000);

  if (checkedInAt) {
    const lateByMinutes = (checkedInAt.getTime() - sessionStart.getTime()) / 60_000;
    return lateByMinutes > LATE_THRESHOLD_MINUTES ? 'LATE' : 'PRESENT';
  }

  return now.getTime() >= sessionEnd.getTime() ? 'ABSENT' : 'UPCOMING';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/lib/server/teacher-attendance/status.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/teacher-attendance/
git commit -m "feat(teacher-attendance): add computeCheckInStatus helper"
```

---

### Task 3: Invite-issuing route + "Inviter à se connecter" button

**Files:**
- Create: `frontend/src/app/api/school/teachers/[id]/invite/route.ts`
- Modify: `frontend/src/app/(school)/enseignants/[id]/page.tsx` (Informations tab, first `Card` in the `tab === 'info'` block, around line 292)
- Modify: `frontend/src/app/(school)/enseignants/types.ts` (`TeacherDetail` gains `userId`)
- Modify: `frontend/src/app/api/school/teachers/[id]/route.ts` (GET select gains `userId`)

**Interfaces:**
- Consumes: `resolveMySchool`, `hasMinRole` (`@/lib/server/school`), `requireAuth`, `verifyCsrf` (`@/lib/server/middleware`, `@/lib/server/auth`), `getEmailQueue` (`@/lib/server/queues/email-queue-singleton`).
- Produces: `POST /api/school/teachers/[id]/invite` → `{ ok: true }` (201) or `{ error: 'ALREADY_LINKED' | 'NO_EMAIL' }` (422) — consumed by the new button's `onClick` handler in this task.

- [ ] **Step 1: Add `userId` to `TeacherDetail` and the GET select**

In `frontend/src/app/(school)/enseignants/types.ts`, add to `TeacherDetail`:

```ts
export interface TeacherDetail extends TeacherListItem {
  civility: string | null;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
  idNumber: string | null;
  secondaryPhone: string | null;
  address: string | null;
  contractType: string | null;
  hiredAt: string | null;
  weeklyHoursTarget: number | null;
  userId: string | null;
  assignments: TeacherAssignment[];
}
```

In `frontend/src/app/api/school/teachers/[id]/route.ts`'s `GET` handler, add `userId: true` to the Prisma `select` and `userId: t.userId` to the JSON-shaping object (find the existing `select`/response-shaping block for the single-teacher GET and add the field next to `weeklyHoursTarget`).

- [ ] **Step 2: Create the invite route**

Create `frontend/src/app/api/school/teachers/[id]/invite/route.ts`:

```ts
// POST /api/school/teachers/[id]/invite — admin-triggered "Inviter à se
// connecter" action on the teacher profile page. Creates a one-time
// TeacherInvite token and e-mails a link to /invitation-enseignant?token=...
// via the existing EmailQueue/Resend pipeline. Does not create the User row
// — that happens when the teacher accepts the invite (see
// /api/auth/teacher-invite/[token]/accept).
export const runtime = 'nodejs';

import 'server-only';
import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool, hasMinRole } from '@/lib/server/school';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
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

    const { id } = await params;
    const teacher = await prisma.teacher.findFirst({
      where: { id, schoolId: mySchool.schoolId },
      select: { name: true, email: true, userId: true },
    });
    if (!teacher) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Teacher not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (teacher.userId) {
      return NextResponse.json(
        { error: 'ALREADY_LINKED', message: 'Cet enseignant a déjà un compte.' },
        { status: 422, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!teacher.email) {
      return NextResponse.json(
        { error: 'NO_EMAIL', message: 'Aucune adresse e-mail renseignée pour cet enseignant.' },
        { status: 422, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const school = await prisma.school.findUnique({
      where: { id: mySchool.schoolId },
      select: { name: true },
    });

    const token = randomBytes(32).toString('base64url');
    await prisma.teacherInvite.create({
      data: {
        schoolId: mySchool.schoolId,
        teacherId: id,
        token,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });

    const queue = getEmailQueue();
    if (queue) {
      const base = process.env.APP_URL ?? 'http://localhost:3000';
      const url = `${base}/invitation-enseignant?token=${token}`;
      await queue.enqueue({
        to: teacher.email,
        subject: `Invitation à rejoindre ${school?.name ?? 'ton établissement'} sur Schoolgesti`,
        html: `<p>Bonjour ${teacher.name},</p><p>${school?.name ?? 'Ton établissement'} t'invite à créer ton compte enseignant sur Schoolgesti pour signer ta présence à chaque cours.</p><p><a href="${url}">Clique ici pour créer ton compte</a> — ce lien expire dans 7 jours.</p>`,
        text: `Bonjour ${teacher.name}, ${school?.name ?? 'ton établissement'} t'invite à créer ton compte enseignant sur Schoolgesti. Ouvre ce lien pour créer ton compte (expire dans 7 jours) : ${url}`,
      });
    } else {
      log.warn('teacher-invite: email queue not configured — invite created but not emailed');
    }

    return NextResponse.json({ ok: true }, { status: 201, headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 3: Wire the "Inviter à se connecter" button**

In `frontend/src/app/(school)/enseignants/[id]/page.tsx`, add `Send` (or reuse `Mail`) to the lucide-react import list, add a handler next to `load`:

```ts
  const [inviting, setInviting] = useState(false);

  async function onInvite() {
    if (!teacher) return;
    setInviting(true);
    try {
      await api(`/api/school/teachers/${teacher.id}/invite`, { method: 'POST' });
      toast('Invitation envoyée par e-mail.', 'success');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NO_EMAIL') {
        toast('Ajoute une adresse e-mail avant d’inviter cet enseignant.', 'error');
      } else {
        toast('Impossible d’envoyer l’invitation. Réessaie.', 'error');
      }
    } finally {
      setInviting(false);
    }
  }
```

(this needs `useToast` — add `import { useToast } from '@/contexts/ToastContext';` and `const { toast } = useToast();` next to the other hooks, mirroring `/eleves/page.tsx`.)

In the "Informations personnelles" `Card` (the first one in the `tab === 'info'` block), add a button under the existing `InfoRow` list, before the closing `</Card>`:

```tsx
            {!teacher.userId && (
              <div className="mt-3.5 border-t border-border pt-3.5">
                <Button
                  variant="outline"
                  className="w-fit"
                  loading={inviting}
                  onClick={onInvite}
                >
                  <Mail size={14} />
                  Inviter à se connecter
                </Button>
              </div>
            )}
```

- [ ] **Step 4: Verify — typecheck, lint, unit tests**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 5: Verify live**

Start `pnpm dev` (if not already running from Task 1 Step 6). Log in as an ADMIN/OWNER, open a teacher profile with an e-mail on file, click "Inviter à se connecter", confirm the success toast and (if `RESEND_API_KEY`/`EMAIL_FROM`/Upstash env vars are configured, as this repo's `.env.local` already has for the WhatsApp/email pipeline) that an `EmailJob` row was created (`pnpm db:studio`, `EmailJob` table, most recent row, `to` = the teacher's email).

- [ ] **Step 6: Commit**

```bash
git add "frontend/src/app/api/school/teachers/[id]/invite/route.ts" "frontend/src/app/(school)/enseignants/[id]/page.tsx" "frontend/src/app/(school)/enseignants/types.ts" "frontend/src/app/api/school/teachers/[id]/route.ts"
git commit -m "feat(teachers): invite-to-login action on the teacher profile"
```

---

### Task 4: Invite acceptance — public page + two routes

**Files:**
- Create: `frontend/src/app/api/auth/teacher-invite/[token]/route.ts` (GET — resolve)
- Create: `frontend/src/app/api/auth/teacher-invite/[token]/accept/route.ts` (POST — accept)
- Create: `frontend/src/app/invitation-enseignant/page.tsx`
- Modify: `frontend/src/lib/constants.ts` (new `AUTH_TEACHER_INVITE` export, alongside `AUTH_RESET_PASSWORD`)

**Interfaces:**
- Consumes: `hashPassword`, `isBanned` (`@/lib/server/auth/banned-passwords`), `isPwned` (`@/lib/server/auth/hibp`) — same password-policy gates as `/api/auth/signup` and `/api/auth/reset-password`.
- Produces: `GET /api/auth/teacher-invite/[token]` → `{ teacherName: string; schoolName: string }` (200) or `{ error: 'INVALID_OR_EXPIRED' }` (404); `POST .../accept` → `{ ok: true }` (200) or `{ error: 'INVALID_OR_EXPIRED' | 'PASSWORD_TOO_SHORT' | 'PASSWORD_BANNED' | 'PASSWORD_PWNED' }` — both consumed by `invitation-enseignant/page.tsx`.

- [ ] **Step 1: Add the invite-page copy to `lib/constants.ts`**

Add, next to `AUTH_RESET_PASSWORD`:

```ts
export const AUTH_TEACHER_INVITE = {
  title: 'Crée ton compte enseignant',
  subtitle: (teacherName: string, schoolName: string) =>
    `${schoolName} t'invite, ${teacherName}, à créer ton compte pour signer ta présence à chaque cours.`,
  passwordLabel: 'Choisis un mot de passe',
  submit: 'Créer mon compte',
  submitting: 'Création…',
  invalid: {
    title: 'Ce lien n’est plus valide',
    subtitle: 'Il a peut-être déjà été utilisé ou a expiré. Demande une nouvelle invitation au secrétariat.',
  },
  done: {
    title: 'Compte créé 🎉',
    subtitle: 'Tu peux maintenant te connecter avec ton adresse e-mail et ton nouveau mot de passe.',
    cta: 'Se connecter',
  },
  errors: {
    INVALID_OR_EXPIRED: 'Ce lien n’est plus valide.',
    PASSWORD_TOO_SHORT: 'Mot de passe trop court.',
    PASSWORD_BANNED: 'Ce mot de passe est trop courant.',
    PASSWORD_PWNED: 'Ce mot de passe est apparu dans une fuite de données connue.',
    default: 'Une erreur est survenue. Réessaie.',
    network: 'Erreur réseau. Réessaie.',
  },
};
```

- [ ] **Step 2: Create the resolve route**

Create `frontend/src/app/api/auth/teacher-invite/[token]/route.ts`:

```ts
// GET /api/auth/teacher-invite/[token] — resolves an invite token for the
// public /invitation-enseignant page (name/school for the confirmation
// copy). No CSRF: pre-session, safe GET.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const { token } = await params;
    const invite = await prisma.teacherInvite.findUnique({
      where: { token },
      select: {
        expiresAt: true,
        usedAt: true,
        teacher: { select: { name: true, school: { select: { name: true } } } },
      },
    });
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'INVALID_OR_EXPIRED', message: 'Invite invalid or expired' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json(
      { teacherName: invite.teacher.name, schoolName: invite.teacher.school.name },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 3: Create the accept route**

Create `frontend/src/app/api/auth/teacher-invite/[token]/accept/route.ts`:

```ts
// POST /api/auth/teacher-invite/[token]/accept — consumes a TeacherInvite
// token and creates the teacher's login: a User row + an
// OrganizationMember(role: MEMBER) on the school's organization + links
// Teacher.userId. Same password-policy gates as /api/auth/signup. Issues no
// session cookies — the teacher logs in afterward through the unmodified
// standard /api/auth/login flow (same posture as /api/auth/reset-password).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { hashPassword } from '@/lib/server/auth';
import { isBanned } from '@/lib/server/auth/banned-passwords';
import { isPwned } from '@/lib/server/auth/hibp';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PASSWORD_MIN = Number(process.env.AUTH_PASSWORD_MIN_LENGTH ?? 10);

const Body = z.object({ password: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const { token } = await params;
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { password } = parsed.data;

    if (isBanned(password)) {
      return NextResponse.json(
        { error: 'PASSWORD_BANNED', message: 'This password is too common.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (password.length < PASSWORD_MIN) {
      return NextResponse.json(
        { error: 'PASSWORD_TOO_SHORT', message: `Password must be at least ${PASSWORD_MIN} characters` },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (process.env.PASSWORD_HIBP_CHECK === '1' && (await isPwned(password))) {
      return NextResponse.json(
        { error: 'PASSWORD_PWNED', message: 'This password appeared in a known data breach.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const invite = await prisma.teacherInvite.findUnique({
      where: { token },
      select: {
        id: true,
        expiresAt: true,
        usedAt: true,
        schoolId: true,
        teacherId: true,
        teacher: { select: { email: true, userId: true } },
      },
    });
    if (!invite || invite.usedAt || invite.expiresAt < new Date() || invite.teacher.userId) {
      return NextResponse.json(
        { error: 'INVALID_OR_EXPIRED', message: 'Invite invalid or expired' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!invite.teacher.email) {
      return NextResponse.json(
        { error: 'INVALID_OR_EXPIRED', message: 'Invite invalid or expired' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const passwordHash = await hashPassword(password);

    await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { email: invite.teacher.email! },
        select: { id: true },
      });
      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: { passwordHash, emailVerifiedAt: new Date() },
            select: { id: true },
          })
        : await tx.user.create({
            data: { email: invite.teacher.email!, passwordHash, emailVerifiedAt: new Date() },
            select: { id: true },
          });

      const org = await tx.organization.findFirst({
        where: { school: { id: invite.schoolId } },
        select: { id: true },
      });
      if (org) {
        await tx.organizationMember.upsert({
          where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
          create: { organizationId: org.id, userId: user.id, role: 'MEMBER' },
          update: {},
        });
      }

      await tx.teacher.update({ where: { id: invite.teacherId }, data: { userId: user.id } });
      await tx.teacherInvite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
    });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

`OrganizationMember`'s `@@unique([organizationId, userId])` (confirmed in `prisma/schema.prisma`) generates the Prisma-Client key name `organizationId_userId` used in the `upsert` above — no adjustment needed.

- [ ] **Step 4: Create the public invite-accept page**

Create `frontend/src/app/invitation-enseignant/page.tsx`, modeled directly on `frontend/src/app/reset-password/page.tsx`'s structure (same two-column layout, same `Suspense` wrapper):

```tsx
'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { GraduationCap, KeyRound, Lock, PartyPopper } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AUTH_TEACHER_INVITE } from '@/lib/constants';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

export default function TeacherInvitePage() {
  return (
    <Suspense fallback={null}>
      <TeacherInviteForm />
    </Suspense>
  );
}

function TeacherInviteForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [resolved, setResolved] = useState<{ teacherName: string; schoolName: string } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setInvalid(true);
      return;
    }
    api<{ teacherName: string; schoolName: string }>(`/api/auth/teacher-invite/${token}`)
      .then(setResolved)
      .catch(() => setInvalid(true));
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api(`/api/auth/teacher-invite/${token}/accept`, { method: 'POST', body: { password } });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code in AUTH_TEACHER_INVITE.errors) {
        setError(AUTH_TEACHER_INVITE.errors[err.code as keyof typeof AUTH_TEACHER_INVITE.errors]);
      } else if (err instanceof ApiError) {
        setError(AUTH_TEACHER_INVITE.errors.default);
      } else {
        setError(AUTH_TEACHER_INVITE.errors.network);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md gap-5 p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
            <GraduationCap size={22} />
          </div>
          <div className="text-lg font-bold text-foreground">Schoolgesti</div>
        </div>

        {invalid ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <KeyRound size={28} className="text-muted-foreground" />
            <p className="font-semibold text-foreground">{AUTH_TEACHER_INVITE.invalid.title}</p>
            <p className="text-sm text-muted-foreground">{AUTH_TEACHER_INVITE.invalid.subtitle}</p>
          </div>
        ) : done ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <PartyPopper size={28} className="text-primary" />
            <p className="font-semibold text-foreground">{AUTH_TEACHER_INVITE.done.title}</p>
            <p className="text-sm text-muted-foreground">{AUTH_TEACHER_INVITE.done.subtitle}</p>
            <Link href="/login" className="mt-2">
              <Button>{AUTH_TEACHER_INVITE.done.cta}</Button>
            </Link>
          </div>
        ) : resolved ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div>
              <p className="text-lg font-bold text-foreground">{AUTH_TEACHER_INVITE.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {AUTH_TEACHER_INVITE.subtitle(resolved.teacherName, resolved.schoolName)}
              </p>
            </div>
            <Field
              label={AUTH_TEACHER_INVITE.passwordLabel}
              icon={<Lock size={15} />}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && (
              <p role="alert" className="text-sm text-destructive-foreground">
                {error}
              </p>
            )}
            <Button type="submit" loading={submitting}>
              {submitting ? AUTH_TEACHER_INVITE.submitting : AUTH_TEACHER_INVITE.submit}
            </Button>
          </form>
        ) : null}
      </Card>
    </main>
  );
}
```

`Field`'s props (`frontend/src/components/ui/Field.tsx`) are `label: string`, `icon?: ReactNode`, `trailing?: ReactNode`, plus every standard `<input>` prop via `InputHTMLAttributes` — `type`, `value`, `onChange`, `required` all pass straight through, matching the call above exactly.

- [ ] **Step 5: Verify — typecheck, lint, unit tests**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [ ] **Step 6: Verify live end-to-end**

Using the invite created in Task 3's live verification: open the `/invitation-enseignant?token=...` link from the `EmailJob.html` (via `pnpm db:studio`), confirm the teacher/school name renders, set a password, confirm the success screen, then log in at `/login` with the teacher's e-mail + new password and confirm it succeeds (still lands on `/dashboard` at this point — Task 5 adds the portal redirect).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/constants.ts "frontend/src/app/api/auth/teacher-invite" frontend/src/app/invitation-enseignant
git commit -m "feat(auth): teacher invite acceptance — public page + accept route"
```

---

### Task 5: Login redirect to the teacher portal

**Files:**
- Modify: `frontend/src/app/api/auth/me/route.ts`
- Modify: `frontend/src/contexts/AuthContext.tsx` (`User` interface)
- Modify: `frontend/src/app/login/page.tsx`

**Interfaces:**
- Produces: `User.teacherId: string | null` on the client `User` type and the `/api/auth/me` JSON response — consumed by `login/page.tsx` (this task), and by Task 6's `/enseignant/layout.tsx` + Task 7's `(school)/layout.tsx` redirect guard.

- [ ] **Step 1: Add `teacherId` to `/api/auth/me`'s response**

In `frontend/src/app/api/auth/me/route.ts`'s `GET` handler, after the existing `dbUser` lookup, add a second lookup and include it in the response object:

```ts
    const teacher = await prisma.teacher.findFirst({
      where: { userId: auth.user.sub },
      select: { id: true },
    });
```

Add `teacherId: teacher?.id ?? null` to the JSON object the route already returns (find the `NextResponse.json({ ... })` call that shapes `dbUser` into the response and add this field alongside the others).

- [ ] **Step 2: Add `teacherId` to the client `User` type**

In `frontend/src/contexts/AuthContext.tsx`, add to the `User` interface:

```ts
  /** Non-null when this account is linked to a Teacher profile (see the
   * teacher self-check-in feature) — used to route login to /enseignant. */
  teacherId: string | null;
```

- [ ] **Step 3: Branch the login redirect**

In `frontend/src/app/login/page.tsx`, change:

```ts
      const isPlatformStaff = me?.role === 'SUPERADMIN' || me?.role === 'ADMIN';
      router.push(isPlatformStaff ? '/admin' : '/dashboard');
```

to:

```ts
      const isPlatformStaff = me?.role === 'SUPERADMIN' || me?.role === 'ADMIN';
      const destination = isPlatformStaff ? '/admin' : me?.teacherId ? '/enseignant' : '/dashboard';
      router.push(destination);
```

- [ ] **Step 4: Verify — typecheck, lint, unit tests**

Run: `pnpm typecheck && pnpm lint && pnpm test`

Note: `frontend/src/app/api/auth/me/route.test.ts` already exists — run it specifically and check whether it asserts the exact response shape (a new field could break a strict equality assertion): `pnpm --filter frontend exec vitest run src/app/api/auth/me/route.test.ts`. If it fails on the new field, update its expected-response fixture to include `teacherId: null` (for the non-teacher test cases) rather than removing the assertion.

- [ ] **Step 5: Verify live**

Log in as the teacher account created in Task 4 — confirm it's redirected to `/enseignant` (a 404 is expected until Task 6 creates that route; confirming the redirect target itself, via the Network tab or by temporarily reading `window.location.pathname`, is enough for this task). Log in as the existing admin account — confirm it still lands on `/dashboard`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/auth/me/route.ts frontend/src/contexts/AuthContext.tsx frontend/src/app/login/page.tsx
git commit -m "feat(auth): redirect teacher-linked accounts to /enseignant after login"
```

---

### Task 6: Teacher portal — "Mes cours aujourd'hui"

**Files:**
- Modify: `frontend/src/lib/server/school.ts` (add `resolveMyTeacherProfile`)
- Create: `frontend/src/app/api/teacher/sessions/today/route.ts`
- Create: `frontend/src/app/api/teacher/checkins/route.ts`
- Create: `frontend/src/app/enseignant/layout.tsx`
- Create: `frontend/src/app/enseignant/page.tsx`

**Interfaces:**
- Consumes: `computeCheckInStatus` (Task 2), `User.teacherId` (Task 5).
- Produces: `resolveMyTeacherProfile(userId: string): Promise<{ teacherId: string; schoolId: string } | null>` — consumed by both new `/api/teacher/*` routes. `GET /api/teacher/sessions/today` → `{ sessions: Array<{ id, subjectName, className, room, startMinutes, endMinutes, status: CheckInStatus, checkedInAt: string | null }> }`. `POST /api/teacher/checkins` `{ timetableSessionId }` → `{ ok: true }` (200) or `{ error: 'NOT_TODAY' | 'OUTSIDE_WINDOW' | 'ALREADY_CHECKED_IN' | 'NOT_YOUR_SESSION' }`.

- [ ] **Step 1: Add `resolveMyTeacherProfile` next to `resolveMySchool`**

In `frontend/src/lib/server/school.ts`, add after `resolveMySchool`:

```ts
export async function resolveMyTeacherProfile(
  userId: string,
): Promise<{ teacherId: string; schoolId: string } | null> {
  const teacher = await prisma.teacher.findFirst({
    where: { userId },
    select: { id: true, schoolId: true },
  });
  if (!teacher) return null;
  return { teacherId: teacher.id, schoolId: teacher.schoolId };
}
```

- [ ] **Step 2: Create the "today's sessions" route**

Create `frontend/src/app/api/teacher/sessions/today/route.ts`:

```ts
// GET /api/teacher/sessions/today — teacher portal's "Mes cours
// aujourd'hui". Never trusts a client-supplied teacherId — always resolves
// it from the caller's own session via resolveMyTeacherProfile.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMyTeacherProfile } from '@/lib/server/school';
import { computeCheckInStatus } from '@/lib/server/teacher-attendance/status';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const me = await resolveMyTeacherProfile(auth.user.sub);
    if (!me) {
      return NextResponse.json(
        { error: 'NOT_A_TEACHER', message: 'This account has no teacher profile.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const date = todayIso();
    const sessions = await prisma.timetableSession.findMany({
      where: { teacherId: me.teacherId, date: new Date(date) },
      orderBy: { startMinutes: 'asc' },
      select: {
        id: true,
        startMinutes: true,
        endMinutes: true,
        room: true,
        subject: { select: { name: true } },
        class: { select: { name: true } },
        checkIns: { where: { teacherId: me.teacherId }, select: { checkedInAt: true }, take: 1 },
      },
    });

    const now = new Date();
    const payload = sessions.map((s) => {
      const checkedInAt = s.checkIns[0]?.checkedInAt ?? null;
      return {
        id: s.id,
        subjectName: s.subject.name,
        className: s.class.name,
        room: s.room,
        startMinutes: s.startMinutes,
        endMinutes: s.endMinutes,
        status: computeCheckInStatus({ date, startMinutes: s.startMinutes, endMinutes: s.endMinutes }, checkedInAt, now),
        checkedInAt: checkedInAt ? checkedInAt.toISOString() : null,
      };
    });

    return NextResponse.json({ sessions: payload }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 3: Create the check-in route**

Create `frontend/src/app/api/teacher/checkins/route.ts`:

```ts
// POST /api/teacher/checkins — "Je suis présent" button. Only allowed for
// the caller's own session, and only within [start, end + 15min grace].
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMyTeacherProfile } from '@/lib/server/school';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const GRACE_MINUTES = 15;

const Body = z.object({ timetableSessionId: z.string().min(1) });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const me = await resolveMyTeacherProfile(auth.user.sub);
    if (!me) {
      return NextResponse.json(
        { error: 'NOT_A_TEACHER', message: 'This account has no teacher profile.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const session = await prisma.timetableSession.findFirst({
      where: { id: parsed.data.timetableSessionId, teacherId: me.teacherId },
      select: { id: true, date: true, startMinutes: true, endMinutes: true },
    });
    if (!session) {
      return NextResponse.json(
        { error: 'NOT_YOUR_SESSION', message: 'Session not found for this teacher.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const now = new Date();
    const dayStart = new Date(session.date);
    const windowStart = new Date(dayStart.getTime() + session.startMinutes * 60_000);
    const windowEnd = new Date(dayStart.getTime() + (session.endMinutes + GRACE_MINUTES) * 60_000);
    if (now < windowStart || now > windowEnd) {
      return NextResponse.json(
        { error: 'OUTSIDE_WINDOW', message: 'Ce cours n’est pas en cours actuellement.' },
        { status: 422, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    try {
      await prisma.teacherCheckIn.create({
        data: { schoolId: me.schoolId, timetableSessionId: session.id, teacherId: me.teacherId },
      });
    } catch (err) {
      const isUniqueViolation =
        typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2002';
      if (isUniqueViolation) {
        return NextResponse.json(
          { error: 'ALREADY_CHECKED_IN', message: 'Déjà pointé pour ce cours.' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 4: Create the minimal portal layout**

Create `frontend/src/app/enseignant/layout.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/Skeleton';

export default function TeacherPortalLayout({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!user.teacherId) {
      router.replace('/dashboard');
    }
  }, [loading, user, router]);

  if (loading || !user || !user.teacherId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <div className="text-sm font-bold text-foreground">Schoolgesti</div>
        <button
          type="button"
          onClick={() => void logout()}
          className="text-sm font-medium text-muted-foreground"
        >
          Déconnexion
        </button>
      </header>
      <main className="mx-auto max-w-lg px-4 py-5">{children}</main>
    </div>
  );
}
```

`AuthContextValue` (`frontend/src/contexts/AuthContext.tsx`) exposes `logout: () => Promise<void>` exactly as destructured above.

- [ ] **Step 5: Create the portal page**

Create `frontend/src/app/enseignant/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

interface TodaySession {
  id: string;
  subjectName: string;
  className: string;
  room: string | null;
  startMinutes: number;
  endMinutes: number;
  status: 'UPCOMING' | 'PRESENT' | 'LATE' | 'ABSENT';
  checkedInAt: string | null;
}

const STATUS_TONE: Record<TodaySession['status'], BadgeTone> = {
  UPCOMING: 'muted',
  PRESENT: 'success',
  LATE: 'warning',
  ABSENT: 'destructive',
};
const STATUS_LABEL: Record<TodaySession['status'], string> = {
  UPCOMING: 'À venir',
  PRESENT: 'Présent',
  LATE: 'En retard',
  ABSENT: 'Absent',
};

function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isSessionLive(s: TodaySession): boolean {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= s.startMinutes && nowMinutes <= s.endMinutes + 15;
}

export default function TeacherPortalPage() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<TodaySession[] | null>(null);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);

  function load() {
    api<{ sessions: TodaySession[] }>('/api/teacher/sessions/today')
      .then((res) => setSessions(res.sessions))
      .catch(() => toast('Impossible de charger tes cours.', 'error'));
  }

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function onCheckIn(session: TodaySession) {
    setCheckingIn(session.id);
    try {
      await api('/api/teacher/checkins', {
        method: 'POST',
        body: { timetableSessionId: session.id },
      });
      toast('Présence enregistrée.', 'success');
      load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OUTSIDE_WINDOW') {
        toast('Ce cours n’est pas en cours actuellement.', 'error');
      } else if (err instanceof ApiError && err.code === 'ALREADY_CHECKED_IN') {
        toast('Déjà pointé pour ce cours.', 'info');
        load();
      } else {
        toast('Impossible d’enregistrer ta présence. Réessaie.', 'error');
      }
    } finally {
      setCheckingIn(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">Mes cours aujourd'hui</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Signe ta présence à chaque cours.</p>
      </div>

      {sessions === null && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {sessions?.length === 0 && (
        <Card className="items-center gap-2 p-8 text-center">
          <Clock size={22} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Aucun cours prévu aujourd'hui.</p>
        </Card>
      )}

      {sessions?.map((s) => (
        <Card key={s.id} className="gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-foreground">{s.subjectName}</div>
              <div className="text-xs text-muted-foreground">
                {s.className} · {fmtTime(s.startMinutes)}–{fmtTime(s.endMinutes)}
                {s.room ? ` · ${s.room}` : ''}
              </div>
            </div>
            <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
          </div>
          {s.status === 'PRESENT' || s.status === 'LATE' ? (
            <div className="flex items-center gap-1.5 text-xs text-success-foreground">
              <CheckCircle2 size={13} />
              Pointé à {s.checkedInAt ? new Date(s.checkedInAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
            </div>
          ) : s.status === 'ABSENT' ? (
            <div className="flex items-center gap-1.5 text-xs text-destructive-foreground">
              <XCircle size={13} />
              Cours terminé sans pointage
            </div>
          ) : (
            <Button
              className="w-fit"
              disabled={!isSessionLive(s)}
              loading={checkingIn === s.id}
              onClick={() => onCheckIn(s)}
            >
              Je suis présent
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Verify — typecheck, lint, unit tests**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [ ] **Step 7: Verify live**

As the teacher account, log in and confirm landing on `/enseignant` showing today's sessions (create/adjust a `TimetableSession` row for today via `pnpm db:studio` if the seed data has none for today, scoped to this teacher). Confirm: a session outside its time window shows no button; inside the window, "Je suis présent" works and flips the card to "Présent"/"En retard" immediately; clicking it a second time is blocked by the disabled state (button disappears once checked in) — additionally verify the 409 path by calling the route twice in direct succession via `curl` with the session's id, confirming the second call returns `ALREADY_CHECKED_IN`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/server/school.ts "frontend/src/app/api/teacher" frontend/src/app/enseignant
git commit -m "feat(teacher-portal): today's sessions + check-in"
```

---

### Task 7: Admin visibility — "Présences" tab on the teacher profile

**Files:**
- Create: `frontend/src/app/api/school/teachers/[id]/checkins/route.ts`
- Modify: `frontend/src/app/(school)/enseignants/[id]/page.tsx` (new tab)
- Modify: `frontend/src/app/(school)/enseignants/page.tsx` ("Voir les présences" row action)
- Modify: `frontend/src/app/(school)/layout.tsx` (defense-in-depth redirect for teacher-linked accounts)

**Interfaces:**
- Consumes: `computeCheckInStatus` (Task 2), the `?tab=` URL-driven tab pattern already established this session on `/eleves/[id]` and `/settings`.
- Produces: `GET /api/school/teachers/[id]/checkins` → `{ rows: Array<{ id, date, subjectName, className, startMinutes, endMinutes, status: CheckInStatus, checkedInAt: string | null }> }`.

- [ ] **Step 1: Create the admin-facing history route**

Create `frontend/src/app/api/school/teachers/[id]/checkins/route.ts`:

```ts
// GET /api/school/teachers/[id]/checkins — read-only history for the
// Teachers profile's "Présences" tab. Any school member can view (no
// hasMinRole gate — same as the rest of the teacher profile GET).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { resolveMySchool } from '@/lib/server/school';
import { computeCheckInStatus } from '@/lib/server/teacher-attendance/status';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const mySchool = await resolveMySchool(auth.user.sub);
    if (!mySchool) {
      return NextResponse.json(
        { error: 'NO_SCHOOL', message: 'No school membership found for this account.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const teacher = await prisma.teacher.findFirst({
      where: { id, schoolId: mySchool.schoolId },
      select: { id: true },
    });
    if (!teacher) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Teacher not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const sessions = await prisma.timetableSession.findMany({
      where: { teacherId: id, schoolId: mySchool.schoolId },
      orderBy: { date: 'desc' },
      take: 100,
      select: {
        id: true,
        date: true,
        startMinutes: true,
        endMinutes: true,
        subject: { select: { name: true } },
        class: { select: { name: true } },
        checkIns: { where: { teacherId: id }, select: { checkedInAt: true }, take: 1 },
      },
    });

    const now = new Date();
    const rows = sessions.map((s) => {
      const dateIso = s.date.toISOString().slice(0, 10);
      const checkedInAt = s.checkIns[0]?.checkedInAt ?? null;
      return {
        id: s.id,
        date: dateIso,
        subjectName: s.subject.name,
        className: s.class.name,
        startMinutes: s.startMinutes,
        endMinutes: s.endMinutes,
        status: computeCheckInStatus({ date: dateIso, startMinutes: s.startMinutes, endMinutes: s.endMinutes }, checkedInAt, now),
        checkedInAt: checkedInAt ? checkedInAt.toISOString() : null,
      };
    });

    return NextResponse.json({ rows }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 2: Add the "Présences" tab to the teacher profile page**

In `frontend/src/app/(school)/enseignants/[id]/page.tsx`:
- Add `CalendarCheck` to the lucide-react import list.
- Extend `TABS`:

```ts
const TABS = [
  { key: 'info', label: 'Informations', icon: UserCheck },
  { key: 'assignments', label: 'Matières & Classes', icon: BookOpen },
  { key: 'attendance', label: 'Présences', icon: CalendarCheck },
] as const;
```

- Add state and a loader, next to the existing `teacher`/`error` state:

```ts
  interface CheckInRow {
    id: string;
    date: string;
    subjectName: string;
    className: string;
    startMinutes: number;
    endMinutes: number;
    status: 'UPCOMING' | 'PRESENT' | 'LATE' | 'ABSENT';
    checkedInAt: string | null;
  }
  const [checkIns, setCheckIns] = useState<CheckInRow[] | null>(null);

  useEffect(() => {
    if (!user || tab !== 'attendance' || checkIns !== null) return;
    api<{ rows: CheckInRow[] }>(`/api/school/teachers/${params.id}/checkins`)
      .then((res) => setCheckIns(res.rows))
      .catch(() => setCheckIns([]));
  }, [user, tab, checkIns, params.id]);
```

- Add the tab's render block, after the existing `{tab === 'assignments' && ( ... )}` block:

```tsx
      {tab === 'attendance' && (
        <Card className="p-5">
          <div className="mb-3.5 flex items-center gap-2 text-caption font-semibold text-foreground">
            <CalendarCheck size={14} className="text-primary" />
            Historique des présences
          </div>
          {checkIns === null ? (
            <Skeleton className="h-32 w-full" />
          ) : checkIns.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune séance enregistrée pour cet enseignant.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Créneau</th>
                    <th className="py-2 pr-3">Matière</th>
                    <th className="py-2 pr-3">Classe</th>
                    <th className="py-2">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {checkIns.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="py-2.5 pr-3 text-caption text-foreground">{fmtDate(row.date)}</td>
                      <td className="py-2.5 pr-3 text-caption text-foreground">
                        {String(Math.floor(row.startMinutes / 60)).padStart(2, '0')}:
                        {String(row.startMinutes % 60).padStart(2, '0')}
                      </td>
                      <td className="py-2.5 pr-3 text-caption font-medium text-foreground">{row.subjectName}</td>
                      <td className="py-2.5 pr-3">
                        <span className="rounded-full bg-info px-2.5 py-1 text-xs font-semibold text-info-foreground">
                          {row.className}
                        </span>
                      </td>
                      <td className="py-2.5 text-caption">
                        {row.status === 'PRESENT' && <span className="text-success-foreground">Présent</span>}
                        {row.status === 'LATE' && <span className="text-warning-foreground">En retard</span>}
                        {row.status === 'ABSENT' && <span className="text-destructive-foreground">Absent</span>}
                        {row.status === 'UPCOMING' && <span className="text-muted-foreground">À venir</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
```

- [ ] **Step 3: Wire "Voir les présences" and add `?tab=` support**

In `frontend/src/app/(school)/enseignants/page.tsx`, change the existing stub:

```ts
      {
        label: 'Voir les présences',
        icon: <CalendarCheck size={14} />,
        onClick: () => toast('Disponible avec Epic 8 (Présences).', 'info'),
      },
```

to:

```ts
      {
        label: 'Voir les présences',
        icon: <CalendarCheck size={14} />,
        onClick: () => router.push(`/enseignants/${t.id}?tab=attendance`),
      },
```

Back in `frontend/src/app/(school)/enseignants/[id]/page.tsx`, add `?tab=` support — same pattern already applied to `/eleves/[id]/page.tsx` earlier this session (`Suspense` wrapper + `useSearchParams`, since Next requires that combination). Change:

```ts
import { useCallback, useEffect, useState } from 'react';
```

to:

```ts
import { Suspense, useCallback, useEffect, useState } from 'react';
```

Change:

```ts
import { useParams, useRouter } from 'next/navigation';
```

to:

```ts
import { useParams, useRouter, useSearchParams } from 'next/navigation';
```

Change:

```ts
export default function TeacherProfilePage() {
  const user = useUser();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [teacher, setTeacher] = useState<TeacherDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('info');
  const [editing, setEditing] = useState(false);
```

to:

```ts
export default function TeacherProfilePage() {
  return (
    <Suspense fallback={null}>
      <TeacherProfile />
    </Suspense>
  );
}

const TAB_KEYS = TABS.map((t) => t.key);

function TeacherProfile() {
  const user = useUser();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [teacher, setTeacher] = useState<TeacherDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>(
    initialTab && TAB_KEYS.some((k) => k === initialTab)
      ? (initialTab as (typeof TABS)[number]['key'])
      : 'info',
  );
  const [editing, setEditing] = useState(false);
```

- [ ] **Step 4: Defense-in-depth redirect in the school shell**

In `frontend/src/app/(school)/layout.tsx`, inside the existing `SchoolLayout` component, add right after the `useUser()` (or equivalent) call and before the `if (!user)` early return:

```ts
  const router = useRouter();
  useEffect(() => {
    if (user?.teacherId) router.replace('/enseignant');
  }, [user, router]);
```

Confirm `useRouter` is already imported in this file (it is not, per the file read earlier in this session — add `import { useRouter } from 'next/navigation';`) and that `useEffect` is imported from `'react'` (it already is, alongside `useState`).

- [ ] **Step 5: Verify — typecheck, lint, unit tests**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [ ] **Step 6: Verify live**

As an admin, open the Teachers list, click "Voir les présences" on the teacher used in Task 6 — confirm it lands on `/enseignants/{id}?tab=attendance` showing the check-in from Task 6's live verification with the correct status. As the teacher account, confirm visiting `/dashboard` directly redirects to `/enseignant`.

- [ ] **Step 7: Run the full gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: all green, no regressions in the pre-existing 1040 tests.

- [ ] **Step 8: Commit**

```bash
git add "frontend/src/app/api/school/teachers/[id]/checkins" "frontend/src/app/(school)/enseignants/[id]/page.tsx" "frontend/src/app/(school)/enseignants/page.tsx" "frontend/src/app/(school)/layout.tsx"
git commit -m "feat(teachers): admin-facing Présences tab + Voir les présences wiring"
```

---

## Self-review notes (spec coverage)

- Invitation flow (spec §2) → Tasks 3–4.
- Teacher portal (spec §3) → Task 6.
- Admin visibility (spec §4) → Task 7.
- Status computation (spec §Status computation) → Task 2, reused by Tasks 6–7 (single source of truth, no drift).
- Data model (spec §1) → Task 1.
- Login redirect (spec §3, "after login... redirect here instead of /dashboard") → Task 5.
- Out-of-scope items (manual override, anti-fraud, multi-school) → intentionally no task; confirmed absent from every task above.
