# Espace Enseignant (Teacher Portal) — Design

**Date:** 2026-08-30
**Status:** Approved by user, pending spec review before implementation plan

## Problem

SchoolGesti currently has exactly one class of authenticated end-user per
school: the owner/staff account(s) reachable through `OrganizationMember`
(`OWNER`/`ADMIN`/`MEMBER`), all of whom see the entire school. `Teacher` is a
pure data record (like `Student`) with no login capability and no relation to
`User` at all. There is no way for a teacher to log in and see only what
concerns them — their timetable, the classes/subjects they teach, and the
grades/appreciations/attendance they're responsible for — and no mechanism
anywhere in the codebase that restricts data access to "my own classes."

This spec adds that capability: a teacher-linked account type, a scoping
layer that restricts reads and writes to a teacher's own `ClassSubject`s and
homeroom classes, and a dedicated mobile-first UI area for teachers to work
from.

## Current state (audit findings)

- `Teacher` (schema.prisma) has zero relation to `User`. It's referenced by
  `ClassSubject.teacherId`, `Class.homeroomTeacherId`, `TimetableSession`.
- Multi-tenancy already exists structurally: `OrganizationMember` with
  `OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER'` (rank `MEMBER:1 < ADMIN:2 <
  OWNER:3`, `frontend/src/lib/server/middleware/require-org-role.ts`). In
  practice only one `OrganizationMember` row exists per school today — the
  Paramètres › Administrateurs tab that would let a school add more staff is
  **read-only, no invite flow built** (`AdministrateursTab.tsx` comment:
  "Read-only for V1 — add/remove is an invite flow, deferred").
  `require-org-role.ts` is on CLAUDE.md's protected-files list; this design
  does not modify it or add a new rank — see "Authorization model" below.
- `resolveMySchool(userId)` (`frontend/src/lib/server/school.ts`, not
  protected) is the resolution every `/api/school/*` route already calls.
  Today any `MEMBER`+ can read most school-wide data; only mutations
  generally gate on `hasMinRole(mySchool.role, 'ADMIN')`.
- Pédagogie routes already pivot on `ClassSubject` (which carries
  `teacherId`) as the authorization checkpoint —
  `/api/school/evaluations`, `/api/school/evaluations/[id]/grades`,
  `/api/school/students/[id]/appreciations`,
  `/api/school/classes/[id]/appreciations`, `/api/school/timetable` all take
  a `classSubjectId`/`classId`/`teacherId` and already look up the parent
  `ClassSubject`/`Class` to verify `schoolId` match. Adding a `teacherId`
  comparison at the same call site is a natural, low-risk addition, not a
  rewrite.
- `Appreciation.subjectId` is nullable ("générale": comportement /
  investissement / assiduité). `Attendance` has no subject dimension at all
  (one row per student per day) — both are inherently homeroom-teacher
  concepts, not subject-teacher concepts.
- `VerificationCode` (`userId` required, `type: String` — currently
  `EMAIL_VERIFY | PASSWORD_RESET` by convention, not a DB enum) is reusable
  for a new `TEACHER_INVITE` type without a schema change.

## Decisions (confirmed with user during brainstorming)

1. **Account creation: admin-initiated invite.** From the existing Teacher
   fiche, an "Inviter" action creates the account and emails a set-password
   link. No self-service signup/code flow.
2. **V1 scope includes Présences**, restricted to homeroom teachers, in
   addition to emploi du temps / mes classes / notes / appréciations.
3. **Appréciation générale is homeroom-teacher-only.** A subject teacher who
   isn't the homeroom teacher never sees or edits it, only their own
   subject's appréciation.
4. **Dedicated mobile-first route group**, not a role-filtered reuse of the
   existing admin pages.
5. Teachers get **read-only** access to their own timetable (no self-editing
   of sessions) — stated as a working assumption, not separately confirmed;
   flag if wrong before/while implementing Phase 2.
6. **Defense-in-depth lockdown is in scope**: teacher-linked accounts must be
   rejected at the API layer (not just hidden in the UI) from school-wide
   admin data (élèves list, enseignants list, scolarité/finances,
   configuration, dashboard, `/admin/*`). Confirmed with the user as
   in-scope. Mapping the actual route count during plan-writing found 65
   files under `/api/school/*` alone — see "Authorization model" below for
   why this ends up being a small, centralized change rather than a
   file-by-file sweep.

## Data model changes

```prisma
model Teacher {
  // ...existing fields unchanged...
  userId String? @unique
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
}

model User {
  // ...existing fields unchanged...
  teacherProfile Teacher?
}
```

No new models. `VerificationCode.type` gains a new conventional value
`TEACHER_INVITE` (string, not a schema enum — no migration needed beyond the
`Teacher.userId` column and its unique index).

`onDelete: SetNull` on `Teacher.user`: deleting a `User` (e.g. admin removes
an account) must not cascade-delete the `Teacher` record — the school's
history (grades authored, appreciations authored) and the teacher's HR
profile must survive account removal. Re-inviting later re-links a
(possibly new) `User` to the same `Teacher` row.

## Invite / account-setup flow

1. **`POST /api/school/teachers/[id]/invite`** — `requireAuth` +
   `verifyCsrf` + `hasMinRole(mySchool.role, 'ADMIN')`. Preconditions:
   `Teacher.email` is set, `Teacher.schoolId === mySchool.schoolId`,
   `Teacher.userId` is null (first invite) — a second call on an
   already-linked teacher is the **resend** path (invalidate the previous
   unused `VerificationCode`, issue a new one) rather than an error.
2. Inside one transaction: create `User` (`passwordHash: null`,
   `emailVerifiedAt: null`, `role: "USER"`, `email: teacher.email`),
   `OrganizationMember` (role `MEMBER`, that school's `organizationId`),
   set `Teacher.userId`. Existing `User` with that email → reuse it (link
   instead of creating a duplicate) if it has no password set yet and no
   existing school membership; otherwise reject with a clear error
   (`EMAIL_ALREADY_IN_USE`) rather than silently taking over an unrelated
   account.
3. Generate `VerificationCode` (`type: "TEACHER_INVITE"`, expiry: 7 days).
   Every existing `VerificationCode` use (`signup`, `forgot-password`,
   `resend-verification`) defaults to a short 15-minute TTL
   (`AUTH_VERIFICATION_TTL_MIN` env var) — that window is sized for an
   account-takeover-risk security code, not an onboarding link. A teacher
   invite is a different use case (a teacher may not open the email for
   days) so this introduces its own longer, hardcoded constant rather than
   reusing `VERIFICATION_TTL_MIN`. Send via
   Resend using a new template in
   `frontend/src/lib/server/notifications/templates.ts` (must set a
   `dedupeKey` per the outbox convention).
4. New public page `frontend/src/app/(auth)/definir-mot-de-passe/page.tsx`
   (modeled on the existing `/reset-password` page/route pair): takes the
   code, sets `User.passwordHash`, stamps `emailVerifiedAt`, marks the
   `VerificationCode` used, issues the standard auth cookies (access +
   refresh + CSRF) — this is the invite-flow's equivalent of the signup
   flow's `/verify-email` step, so cookies are issued here, not before.
5. Teacher fiche UI (`enseignants/[id]/page.tsx`) shows invite state:
   no email → invite action disabled with a tooltip explaining why; email +
   no `userId` → "Inviter" button; `userId` set + `emailVerifiedAt` null →
   "Invitation envoyée le {date}" + "Renvoyer" action; `userId` set +
   `emailVerifiedAt` set → "Compte actif depuis {date}".

## Authorization model

New helper in `frontend/src/lib/server/school.ts` (not a protected file):

```ts
export interface MyTeacherProfile {
  teacherId: string;
  classSubjectIds: string[]; // ClassSubject rows this teacher is assigned to
  homeroomClassIds: string[]; // Class rows where this teacher is titulaire
}

export async function resolveMyTeacherProfile(
  userId: string,
  schoolId: string,
): Promise<MyTeacherProfile | null>;
```

Returns `null` for any account not linked via `Teacher.userId` (i.e. every
existing admin/staff account today, unchanged behavior). Deliberately does
**not** introduce a new `OrgRole` value — a teacher-linked account keeps
`OrgRole = 'MEMBER'` for `require-org-role.ts` purposes; the teacher
restriction is an orthogonal, additional narrowing checked by callers, the
same way `hasMinRole` is checked today. This keeps the protected
`require-org-role.ts` file untouched.

**Lockdown is centralized, not a per-file sweep.** `resolveMySchool()`
itself changes to reject teacher-only accounts by default — every one of
the 65 `/api/school/*` routes (plus `/api/admin/*`, which already requires
`ADMIN`+ separately) calls this function today with an unchanged call
signature and return shape, so **none of them need to be touched**. A
`MEMBER`-role account that is also `Teacher.userId`-linked now gets the
same `null` (→ 404, matching the existing "non-members get 404, not 403"
convention) that a non-member gets today. An `ADMIN`/`OWNER` account that
happens to also be teacher-linked (a director who teaches) is never
affected — the new check only applies to plain `MEMBER` accounts.

```ts
export async function resolveMySchool(userId: string): Promise<MySchool | null> {
  const membership = await /* existing query, unchanged */;
  if (!membership || !membership.organization.school) return null;
  const schoolId = membership.organization.school.id;
  if (membership.role === 'MEMBER') {
    const teacher = await prisma.teacher.findFirst({ where: { userId, schoolId }, select: { id: true } });
    if (teacher) return null; // teacher-linked accounts get nothing by default
  }
  return { organizationId: membership.organizationId, schoolId, role: membership.role as OrgRole };
}
```

A new sibling, `resolveMySchoolIncludingTeacher(userId)`, runs the same
query **without** the teacher-rejection branch. Only routes that must
stay reachable by teachers import this instead — and only when that
route's own phase actually builds teacher support for it. Per this design,
zero pédagogie routes are switched over during Phase 1: Evaluations,
Grades, Appréciations, Attendance and Timetable all keep calling the
strict `resolveMySchool()` for now, so a fresh teacher account is locked
out of literally everything except the one new home page until Phases 2-4
each deliberately open their own route. This makes Phase 1 secure by
construction (deny-by-default) rather than needing the lockdown and the
feature work to land in lockstep.

**Per-screen pattern for Phases 2-4** (mirrors the existing
`hasMinRole(mySchool.role, 'ADMIN')` check already present in these
files): the route switches its import to `resolveMySchoolIncludingTeacher`,
then applies the relevant rule:

| Area | Rule |
|---|---|
| Evaluations / Grades | allow if admin, else `classSubject.teacherId === myTeacher.teacherId` |
| Appréciation (subjectId set) | same, via the subject's `ClassSubject` for that student's class |
| Appréciation générale (subjectId null) | allow if admin, else `classId ∈ myTeacher.homeroomClassIds` |
| Attendance | write allowed if admin or homeroom; read-only otherwise for that class |
| Timetable | read-only, results forced to `teacherId === myTeacher.teacherId` when the caller is teacher-linked (ignoring any `?teacherId=` query override) |

**Aggregate endpoint for the teacher home screen**: `GET /api/teacher/me` —
one round trip returning the teacher's identity, homeroom classes, taught
`ClassSubject`s (with class/subject names), and this week's timetable
sessions. Avoids a phone-network waterfall of 4 separate admin-shaped list
endpoints just to render the home screen.

## UI / navigation

New route group, `frontend/src/app/(teacher)/espace-enseignant/`:

- `/espace-enseignant` — Accueil: today's/this-week's sessions, quick links.
- `/espace-enseignant/classes` — Mes classes: taught `ClassSubject`s +
  homeroom classes, each linking to its roster.
- `/espace-enseignant/classes/[classSubjectId]` — roster + entry points into
  notes/appréciations for that class-subject.
- `/espace-enseignant/notes` — scoped carnet de notes.
- `/espace-enseignant/appreciations` — scoped appréciations (+ générale for
  homeroom classes).
- `/espace-enseignant/presences` — homeroom classes only; hidden from the
  nav entirely for a teacher with no homeroom class.
- `/espace-enseignant/emploi-du-temps` — read-only weekly view.

**Shell**: fixed bottom tab bar (Accueil / Classes / Notes / Appréciations /
Plus — Plus holds Présences, Emploi du temps, Profil), no admin sidebar.
Mobile is the primary target (375px baseline); desktop centers the same
content in a max-width column with the same bottom bar or a slim rail at a
`md:`/`lg:` breakpoint — never the existing heavy admin `Sidebar`. Reuses
existing UI primitives (`Card`, `Table`, `Modal`, `HelpTooltip`, etc.).

**Routing after login**: a purely teacher-linked account (no `ADMIN`+ org
role) is redirected to `/espace-enseignant` and is blocked from navigating
into the `(school)` admin route group (same enforcement point as the API
lockdown above — client-side redirect for UX, server-side 404 for the real
boundary). An admin who is also teacher-linked keeps the normal admin
dashboard as their landing page, with an added "Voir mon espace enseignant"
link.

## i18n

New message namespaces (one per screen, per the established convention):
`TeacherHome`, `TeacherClasses`, `TeacherNotes`, `TeacherAppreciations`,
`TeacherPresences`, `TeacherTimetable`, plus the invite-related strings
folded into the existing `Enseignants` namespace (fiche invite states) and
a new `SetPassword` namespace for the invite-acceptance page. All three
locales (fr/en/ht), matching `locales.test.ts`'s key-parity enforcement.

## Testing

- Unit tests for `resolveMyTeacherProfile()` (teacher with/without homeroom,
  non-teacher account returns null, cross-school isolation).
- Per modified route: a teacher-allowed case, a teacher-denied
  (wrong class/subject) case, and (for the lockdown routes) a
  teacher-rejected-outright case — alongside the existing admin-path tests,
  not replacing them.
- Invite flow: code generation, resend invalidates the prior code, expired
  code rejected, already-linked-email conflict rejected, successful
  set-password issues cookies and stamps `emailVerifiedAt`.
- No new integration harness — unit tests via Vitest + existing
  `test-utils/prisma-mock.ts`, consistent with the rest of the codebase.

## Rollout phases

Ordered so the security boundary lands **before** any teacher accounts can
exist unprotected, not as a final cleanup step:

1. **Foundation + lockdown**: schema change, `resolveMyTeacherProfile()` +
   the `resolveMySchool()` deny-by-default change (this alone locks every
   existing route, per "Authorization model" above), invite/accept flow,
   and a bare `/espace-enseignant` home page (enough for the post-login
   redirect to land somewhere real).
2. **Read-only views**: Mes classes (roster), Emploi du temps.
3. **Notes**: scoped grade entry.
4. **Appréciations + Présences**: subject appréciations, appréciation
   générale (homeroom), attendance (homeroom).

Each phase is independently shippable and testable — a teacher account
that only has Phase 1 already can't see anything it shouldn't, it just
can't do anything useful yet beyond logging in.
