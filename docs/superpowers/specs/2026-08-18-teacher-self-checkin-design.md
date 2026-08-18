# Teacher Self Check-In — Design Spec

Date: 2026-08-18
Status: Approved by user 2026-08-18 — pending plan + implementation.

## Problem

The Teachers list's row menu (`Enseignants` page) has two actions that are
still stub toasts: "Voir les présences" ("Disponible avec Epic 8
(Présences)") and, until this session, "Envoyer un message" (now wired to
WhatsApp — out of scope here). Unlike the "bulletin"/"présences élève"
stubs fixed earlier today, there is no already-built teacher attendance
feature hiding behind this one — `Teacher` has zero attendance concept and
zero relation to `User`, so there is no login for a teacher to sign in
with in the first place.

The user wants teachers to be able to sign their own presence, per course
(not once a day) — confirmed via three clarifying questions:
1. Account creation: invitation by e-mail/link (not an admin-typed PIN).
2. Granularity: one check-in per timetable session (not once per day).
3. Teacher-facing surface: a dedicated, minimal portal — not the existing
   admin shell with role-gated navigation.

## Scope

In scope:
- `Teacher` gains an optional login: an ADMIN-role staff member invites a
  teacher (requires the teacher to already have an `email` on file); the
  teacher sets a password via a one-time link and becomes an ordinary
  `User` + `OrganizationMember(role: MEMBER)` on the school's
  organization, linked back via `Teacher.userId`.
- A new minimal teacher portal (`/enseignant`, own route group/layout, no
  sidebar) showing only "Mes cours aujourd'hui" with a per-session
  "Je suis présent" check-in button.
- Login redirect: a teacher-linked account lands on `/enseignant` instead
  of `/dashboard` after login.
- Admin side: "Voir les présences" on the Teachers list row menu now
  opens a new "Présences" tab on the teacher profile page
  (`/enseignants/[id]?tab=attendance`, mirroring the `?tab=` convention
  just added to the student profile page), read-only history of that
  teacher's check-ins with a computed status per session.

Out of scope this pass (confirmed with the user):
- **Manual admin override/backfill** of a teacher's check-in (unlike the
  student attendance grid's `AttendanceEditModal`). Admin can only view.
  Add later as a v2 if the "I forgot to check in" case turns out to be
  common — no data-model change needed to add it (an override would just
  be another writer of the same `TeacherCheckIn` row).
- **Anti-fraud measures** (geolocation, school-network restriction,
  photo/selfie check-in). Nothing in the current stack supports this and
  it wasn't requested — a plain tap-to-check-in is the v1 bar.
- **Multi-school teachers.** `Teacher` is already single-`schoolId`; a
  `Teacher.userId` account is scoped to that one school's
  `OrganizationMember` row, same as every other org-role account in this
  app.
- **Any change to `TimetableSession`** (schema or CRUD). Sessions are
  read-only from the teacher portal's point of view — it just lists
  today's sessions for `teacherId = me`.

## Current state (as found)

- `Teacher` (`prisma/schema.prisma:381`): plain contact record — `name`,
  `email`, `phone`, no relation to `User`, no login of any kind.
- `User` + `OrganizationMember` (`role: OWNER | ADMIN | MEMBER`,
  `ORG_ROLE_RANK` in `middleware/require-org-role.ts`) is the starter's
  existing multi-tenancy primitive. `resolveMySchool(userId)`
  (`lib/server/school.ts`) resolves `{ organizationId, schoolId, role }`
  from the first `OrganizationMember` row for a user — this is exactly
  the shape a teacher account needs, just with `role: MEMBER` and nothing
  school-admin-specific attached to it.
- `TimetableSession` (`schema.prisma:1257`): `schoolId`, `classId`,
  `subjectId`, `teacherId` (nullable), `room`/`roomId`, `type`, `date`
  (`@db.Date`), `startMinutes`, `endMinutes`. Already indexed on
  `[schoolId, teacherId, date]` — the exact lookup the portal's "today's
  sessions" query needs.
- `VerificationCode` (`schema.prisma:1064`) is the existing short-lived
  token pattern (email verification / password reset) — but it's keyed
  by an existing `userId`, which a not-yet-created teacher account
  doesn't have. The invite token needs its own small table keyed by
  `teacherId` instead (see Data model).
- `EmailJob` (`schema.prisma:1099`) + `EmailQueue`
  (`lib/server/queues/email-queue.ts`) is the existing fire-and-enqueue
  email pattern (drained by the `email-queue-drain` cron) — the invite
  email reuses this, no new send path.
- `hashPassword` is exported from `lib/server/auth.ts` (protected file,
  but its exports are fair game to *call*, just not to edit) — the
  invite-accept route reuses it exactly like `/api/auth/signup` does, so
  the resulting `User.passwordHash` is created the same way every other
  password is.
- `login/page.tsx`'s `onSubmit` currently branches
  `isPlatformStaff ? '/admin' : '/dashboard'` after
  `refresh()`. This is a normal (unprotected) page component — adding a
  third branch here is a small, local edit, not a change to `auth.ts`.
- Today's `/eleves/[id]` fix (this session) already established the
  `?tab=` URL convention for a profile page's tabs (`useSearchParams` +
  `Suspense` wrapper, same shape as `/settings`). The teacher profile
  page's new "Présences" tab reuses this exact pattern.

## Data model

```prisma
model Teacher {
  // ...existing fields unchanged...
  userId String? @unique
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)

  invites  TeacherInvite[]
  checkIns TeacherCheckIn[]
}

model TeacherInvite {
  id        String    @id @default(cuid())
  schoolId  String
  school    School    @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  teacherId String
  teacher   Teacher   @relation(fields: [teacherId], references: [id], onDelete: Cascade)
  token     String    @unique // opaque random token, sent in the e-mail link
  expiresAt DateTime  // now + 7 days
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
  checkedInAt        DateTime         @default(now())

  @@unique([timetableSessionId, teacherId])
  @@index([schoolId, teacherId])
}
```

`User.role` stays `"USER"` for a teacher account — platform-wide role is
unrelated to school org role. `OrganizationMember.role` is `"MEMBER"`.
Nothing about the existing `OrganizationMember`/`requireOrgRole` code
changes; a teacher account is just a new, unprivileged member.

## Invitation flow

1. Teacher profile page (`/enseignants/[id]`), "Informations" tab: a new
   "Inviter à se connecter" button, shown only when `teacher.email` is set
   and `teacher.userId` is null. Disabled + tooltip explaining why
   otherwise (no email on file / already has an account).
2. `POST /api/school/teachers/[id]/invite` — `requireAuth` +
   `hasMinRole(mySchool.role, 'ADMIN')` (same guard shape as every other
   Teachers-list mutation) + CSRF. Generates a random token (same
   primitive `generateVerificationCode`-style randomness already used at
   signup, just longer/URL-safe since this travels in a link, not typed
   by hand), creates a `TeacherInvite` row (`expiresAt = now + 7d`),
   enqueues one `EmailJob` via the existing `EmailQueue` with a link to
   `/invitation-enseignant?token=...`.
3. `/invitation-enseignant` (new **public** page, no auth) — reads
   `token` from the URL, `GET
   /api/auth/teacher-invite/[token]` resolves it (404 if
   missing/expired/used) and shows the teacher's name + school for
   confirmation, plus a password field.
4. `POST /api/auth/teacher-invite/[token]/accept` — re-validates the
   token, and in one transaction: creates the `User` row
   (`hashPassword(password)`, `emailVerifiedAt: now()` — the invite link
   itself is the verification, matching how OAuth sign-in already treats
   a verified provider email), creates the `OrganizationMember(role:
   MEMBER)` row, sets `Teacher.userId`, and marks the invite `usedAt`.
   Returns `{ ok: true }` — **no session cookies are issued here**, same
   "don't log in the caller from an unusual entry point" posture as
   signup; the teacher is redirected to `/login` to sign in through the
   completely unmodified standard flow.

## Teacher portal (`/enseignant`)

New top-level route group, sibling to `(school)`, with its own minimal
`layout.tsx` — no `SchoolSidebar`/`SchoolTopbar`, no `@container` grid
machinery, just a small header (school name, teacher name, logout) and
the page content. Guarded by `requireAuth` + "this `User.id` matches some
`Teacher.userId`" (a `resolveMyTeacherProfile(userId)` helper next to
`resolveMySchool`, same shape) — a staff-only account (no linked
`Teacher`) hitting `/enseignant` gets redirected to `/dashboard`, and vice
versa a teacher account hitting `/dashboard` gets redirected to
`/enseignant` (belt-and-suspenders on top of the login-time redirect, so
a stale bookmark/tab can't land on the wrong shell).

Single page, "Mes cours aujourd'hui":
- `GET /api/teacher/sessions/today` — today's `TimetableSession` rows for
  `teacherId = me`, ordered by `startMinutes`, each joined with the
  session's own `TeacherCheckIn` (if any).
- Each row: time range, subject, class, room, and a status-driven action:
  - Not yet started: time shown, button disabled ("Pas encore commencé").
  - In progress, not checked in: **"Je suis présent"** button, enabled.
  - In progress or ended, checked in: "Présent — pointé à HH:MM" (no
    button, just a confirmation chip).
  - Ended, never checked in: "Absent" chip, no button (v1 — no
    override, see Scope).
- `POST /api/teacher/checkins` `{ timetableSessionId }` — `requireAuth` +
  CSRF, resolves the caller's own `teacherId` (never trusts a
  client-supplied one), verifies the session belongs to that teacher and
  its time window includes `now` (start ≤ now ≤ end + a short grace
  period, e.g. 15 min, so a check-in right at the bell isn't rejected),
  then `create`s the `TeacherCheckIn` row — the `@@unique` constraint
  makes a double check-in a 409, not a duplicate row.

## Admin visibility

`/enseignants/[id]?tab=attendance` (new tab, alongside the existing
Informations/Matières tabs) — `GET
/api/school/teachers/[id]/checkins?range=...` returns the teacher's
sessions in the selected window with the same three-state status
(Présent / En retard / Absent) computed the same way the portal computes
it for "today", just server-side and over a date range instead of
"today" only. Read-only table: date, créneau, matière, classe, statut,
heure de pointage. "Voir les présences" in the Teachers list row menu
becomes `router.push('/enseignants/{id}?tab=attendance')`, replacing its
current stub toast — same fix shape as this session's `/eleves` change.

## Status computation (shared logic)

A pure helper, `lib/server/teacher-attendance/status.ts`, used by both
the portal's today view and the admin history view so the two never
drift:

```ts
type CheckInStatus = 'UPCOMING' | 'PRESENT' | 'LATE' | 'ABSENT';

function computeStatus(
  session: { startMinutes: number; endMinutes: number; date: string },
  checkedInAt: Date | null,
  now: Date,
): CheckInStatus
```

- No check-in, `now` before session end → `UPCOMING` (portal shows no
  chip; admin history never shows in-progress rows, only past ones).
- No check-in, `now` at/after session end → `ABSENT`.
- Checked in within 10 minutes of `startMinutes` → `PRESENT`.
- Checked in more than 10 minutes after `startMinutes` → `LATE`.

10 minutes is a constant, not configurable in v1 — flagged as an easy
follow-up if the user wants it school-configurable later.

## Edge cases

- **Teacher with no `teacherId` on a session** (`TimetableSession.teacherId`
  is nullable — a session can be unassigned). Such sessions never appear
  in any teacher's "today" list; nothing to check in to.
- **Invite link reused/expired.** `GET .../teacher-invite/[token]`
  returns 404 for `usedAt != null` or `expiresAt < now`; the accept page
  shows "Ce lien n'est plus valide" with no way to retry other than a
  fresh invite from admin.
- **Teacher deleted after inviting.** `TeacherInvite`/`TeacherCheckIn`
  both `onDelete: Cascade` from `Teacher` — matches how the rest of the
  schema treats teacher deletion elsewhere.
- **Admin deactivates/suspends a teacher** (`Teacher.status = INACTIVE`).
  Existing `Teacher` mutation routes don't touch `OrganizationMember` or
  the `User` today (out of scope to add that coupling now — flagged as a
  known gap: deactivating a teacher does not currently revoke their
  portal login). Worth a follow-up, not blocking v1.
- **Session moved/deleted after a check-in exists.** `TimetableSession`
  deletion already cascades in the schema elsewhere; `TeacherCheckIn`
  cascades with it, same treatment.

## API surface (new routes)

- `POST /api/school/teachers/[id]/invite`
- `GET /api/auth/teacher-invite/[token]`
- `POST /api/auth/teacher-invite/[token]/accept`
- `GET /api/teacher/sessions/today`
- `POST /api/teacher/checkins`
- `GET /api/school/teachers/[id]/checkins`

All `runtime = 'nodejs'`, all wrapped in `withRequestContext`, matching
every existing route in this codebase.

## Testing plan

- `status.ts`'s `computeStatus` — pure function, straightforward Vitest
  unit tests (before/at/after the 10-minute boundary, before/after
  session end, no check-in).
- Route-level: mirror the existing convention in this codebase — most
  routes have no dedicated `route.test.ts` (confirmed: neither
  `/api/school/fees/students/[id]/send-whatsapp` nor today's new teacher
  WhatsApp route has one); the pure logic gets unit tests, the routes get
  verified live via Playwright against the dev server, same as every UI
  change this session.
- Live verification checklist: invite → accept-invite page → login
  redirects to `/enseignant` (not `/dashboard`) → today's sessions show
  the right check-in states → checking in flips the row's state → admin's
  `?tab=attendance` shows the same check-in.
