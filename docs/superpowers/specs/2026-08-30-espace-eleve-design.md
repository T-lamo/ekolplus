# Espace Élève (Student Portal) — Design

**Date:** 2026-08-30
**Status:** Design walked through section-by-section with the user during brainstorming (all sections acknowledged). Shares its foundational account-linking mechanism with the concurrent "Espace Enseignant" design (`2026-08-30-espace-enseignant-design.md`) — see "Relationship to the Espace Enseignant spec" below. **Sequencing confirmed with the user**: the teacher-portal work lands the generic foundation first; this design's implementation starts once that Phase 1 ships, building on top of it rather than touching the shared files in parallel.

## Problem

SchoolGesti currently has exactly one class of authenticated end-user per school: the owner/staff account(s) reachable through `OrganizationMember` (`OWNER`/`ADMIN`/`MEMBER`), all of whom see the entire school. `Student` is a pure data record (like `Teacher`) with no login capability and no relation to `User` at all. There is no way for a student to log in and see only what concerns them — their grades (carnet de notes / résultats), attendance, timetable, bulletins (report cards), and appréciations. School-wide admin surfaces (scolarité/finances, configuration, dashboard, back-office) are explicitly out of scope for this account type, per the user's direction.

This spec adds that capability: a student-linked account type, an authorization layer that restricts reads to a student's own records, and a dedicated read-only UI area for students to consult from.

## Relationship to the Espace Enseignant spec

A parallel, same-day design (`2026-08-30-espace-enseignant-design.md`, approved, implementation plan in progress in a concurrent session as of this writing) solves the structurally identical problem for teachers. Both specs converge on the same underlying mechanism:

- An invite is a `VerificationCode` row against an **eagerly created** `User` (`passwordHash: null`) — not a separate invite table, and not deferred until acceptance.
- A single shared accept-and-set-password page, `frontend/src/app/(auth)/definir-mot-de-passe/page.tsx`, handles any invite type generically.
- No new `OrgRole` value is introduced; subject-specific narrowing (teacher vs. student) is an orthogonal check layered on top of the existing role system, not a new rank.

This design deliberately reuses that mechanism rather than inventing a second one. Concretely, the teacher-portal work (session `ekolplus2-e4`, confirmed with the user 2026-08-30) is building these **generic, portal-type-agnostic pieces** first, which this design consumes rather than duplicates:

- A generic outbox event kind, `email.portal_invite` (payload includes a `portalLabel` string), with its `case` already added to `outbox/dispatcher.ts` — the student side reuses this case as-is; **no new dispatcher edit needed**.
- A generic template factory, `portalInviteEmail({ code, email, expiresAt, portalLabel })`, in `auth/email-templates.ts`.
- A reusable `createPortalInvite()` helper (create-pending-`User` + `OrganizationMember` + `VerificationCode` + enqueue-invite-email) that takes a caller-supplied linking callback — the student invite route calls it with a callback that sets `Student.userId` instead of `Teacher.userId`. **Open question**: `createPortalInvite()`'s description as written always creates an `OrganizationMember` row, which per this spec's "Key difference" section below is specifically what we do NOT want for students (see below) — this needs to be confirmed/adjusted with whoever lands Phase 1: either the helper takes membership-creation as optional/parameterized, or the student invite route does its own thin wrapper around the `VerificationCode` + outbox pieces without the `OrganizationMember` part.
- `resolveMySchool()` gains a `isPortalOnlyAccount(userId, schoolId)` deny-by-default check (currently querying only `Teacher`) — once `Student.userId` exists, this design extends that same function to also query `Student`. This is the one shared-file edit this design still performs, but it lands as an **additive extension to an already-established extension point**, sequenced after Phase 1 ships, not a parallel edit.

**Key difference from the teacher case**: a student-linked account is intended to get **no `OrganizationMember` row at all** (a teacher-linked account gets one with role `MEMBER`, because teachers legitimately need some shared-route access) — see the open question above about reconciling this with `createPortalInvite()`'s current shape. If a student account ends up with no org membership, it fails every existing `/api/school/*` staff route "for free" via `resolveMySchool()` returning `null` for non-members, exactly like today — no defense-in-depth lockdown sweep needed for students, unlike the teacher case. Every route the student portal needs is a brand-new `/api/student/*` endpoint; nothing pre-existing needs to change behavior.

## Open questions for user sign-off

1. ~~Sequencing with the concurrent teacher-portal work~~ — **Resolved 2026-08-30**: teacher-portal session lands the generic foundation (`createPortalInvite()`, `email.portal_invite` outbox case, `portalInviteEmail()`, `isPortalOnlyAccount()`) first; this design's implementation starts once that Phase 1 ships and builds on top, per "Relationship to the Espace Enseignant spec" above.
2. **`createPortalInvite()` and `OrganizationMember`.** As currently described, the shared helper always creates an `OrganizationMember` row — needs reconciling with this spec's assumption that student accounts get none (see "Key difference" above). To confirm once Phase 1's actual code lands.
3. **Sibling-guardian-email limitation.** Since `User.email` must stay unique, if a student has no email of their own and the invite falls back to a `Guardian`'s email, a second child of the same guardian sharing that same email as their only contact will collide (`EMAIL_ALREADY_IN_USE`) when invited. That second sibling needs a distinct contact email before being invited. Mirrors the trade-off the teacher spec already accepts for `EMAIL_ALREADY_IN_USE` generally — not a new one invented here — but worth an explicit "yes, acceptable for v1" before building on it.
4. **Shared shell component.** Should the student portal and teacher portal literally share one `PortalShell` component (mobile-first bottom tab bar, parameterized by tab set), or stay separately implemented even though they'll look alike? Recommend sharing — whichever portal lands second refactors to share what the first one built.

## Decisions confirmed with user during brainstorming

1. Generalize the underlying account-linking mechanism (shared with the teacher-portal design), students first.
2. **Invitation target**: the student's own email if `Student.email` is set, otherwise the primary (`isPrimary`) `Guardian`'s email. The resulting account is always a **student** account (`role: 'STUDENT'`, `Student.userId` set) regardless of which address received the invite — the guardian's email is a delivery channel only, never account ownership.
3. **Rollout**: staff invites one student at a time, on demand, from the student's fiche — no bulk/auto-invite action, no backfill migration for already-enrolled students.
4. **Scope**: notes/carnet de notes, présences, emploi du temps, bulletins, appréciations. Explicitly excluded: scolarité (finances), configuration, and anything admin/back-office.
5. **No automatic access revocation** tied to `Student.status` (e.g. `SUSPENDED`) in v1 — staff can manually unlink the account (mirrors the "Inviter" action) if they need to cut access.

## Current state (audit findings)

- `Student` (`schema.prisma`) has zero relation to `User` — referenced by `Guardian.studentId`, `Enrollment.studentId`, `Grade.studentId`, `Attendance.studentId`, `Appreciation.studentId`, etc.
- `User.role` is a free-text string (`"USER" | "ADMIN" | "SUPERADMIN"` by convention, no DB enum) — a new `"STUDENT"` value needs no migration.
- `VerificationCode.type` is likewise free-text (`EMAIL_VERIFY | PASSWORD_RESET` by convention) — a new `STUDENT_INVITE` value needs no migration either.
- `Guardian.isPrimary: Boolean` already exists — the invite-target fallback needs no new field.
- `Enrollment` (year-scoped `studentId` + `classId` + `academicYearId`) is how a student's current class/timetable is resolved — `Student` itself carries no `classId`.
- The existing `/eleves/[id]` admin detail view's tab components — `NotesResultatsTab`, `PresencesTab`, `AppreciationsTab`, `BulletinsTab` — already fetch data scoped to exactly one student (they render the per-student admin detail view, not a class-wide view), and were migrated to the shared `useApi` cache hook earlier this session. They're directly reusable in the student portal once pointed at session-scoped endpoints instead of URL-param-scoped ones.
- `login/page.tsx`'s `admin`/`teacher`/`studentParent` role tabs are purely decorative today — selecting one changes no submit behavior or redirect target.
- No invite/account-creation mechanism exists yet for any non-owner account (confirmed separately: even inviting a fellow school `ADMIN` is deferred/unbuilt).

## Data model changes

```prisma
model Student {
  // ...existing fields unchanged...
  userId String? @unique
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
}

model User {
  // ...existing fields unchanged...
  studentProfile Student?
}
```

No new models. `VerificationCode.type` gains the conventional value `STUDENT_INVITE` (string, no schema enum — no migration beyond the `Student.userId` column and its unique index).

`onDelete: SetNull` on `Student.user`: removing/unlinking the `User` account must not cascade-delete the `Student` record — the student's full academic history (grades, attendance, appreciations, enrollments) must survive account removal. Re-inviting later re-links a (possibly new) `User` to the same `Student` row.

## Invite / account-setup flow

1. **`POST /api/school/students/[id]/invite`** — `requireAuth` + `verifyCsrf` + `hasMinRole(mySchool.role, 'ADMIN')`. Preconditions: a target email is resolvable (`Student.email` or a primary `Guardian.email`) — else `NO_INVITE_TARGET`; `Student.schoolId === mySchool.schoolId`. `Student.userId` null → first invite; already set → resend path (invalidate the previous unused `VerificationCode`, issue a new one), not an error.
2. Calls the shared `createPortalInvite()` helper (landed by the teacher-portal Phase 1 — see "Relationship to the Espace Enseignant spec" above) with a human-readable `portalLabel` (e.g. `"Espace Élève"`, used only in the email copy), `codeType: "STUDENT_INVITE"` (the `VerificationCode.type` value — distinct from `portalLabel`, this is the DB discriminator), and a linking callback that sets `Student.userId` instead of `Teacher.userId`. This helper handles: creating the pending `User` (`passwordHash: null`, `role: "STUDENT"`, `email:` the resolved target — an existing `User` with that email and no password/no membership yet is reused/linked instead, mirroring the teacher-spec precedent; otherwise `EMAIL_ALREADY_IN_USE`, see "Open questions" above), generating the `VerificationCode` with its longer onboarding TTL, and enqueuing the invite email via the existing generic `email.portal_invite` outbox case + `portalInviteEmail()` template — **no new outbox/dispatcher/email-template code needed on the student side** as long as "Open questions" #2 (the `OrganizationMember` mismatch) is resolved before this route is written.
3. Shared page `frontend/src/app/(auth)/definir-mot-de-passe/page.tsx` (built by whichever portal lands first — the teacher-portal work, per its own spec): takes the code, sets `User.passwordHash`, stamps `emailVerifiedAt`, marks the code used, issues standard auth cookies (`setAuthCookies`) immediately, then redirects based on the account's actual linkage (`Student.userId` set → `/eleve`).
4. Fiche UI (`eleves/[id]/page.tsx`) mirrors the teacher fiche's invite-state convention: no resolvable email → disabled "Inviter" button with a tooltip explaining why; resolvable email + no `userId` → "Inviter"; `userId` set + no `emailVerifiedAt` → "Invitation envoyée le {date}" + "Renvoyer"; both set → "Compte actif depuis {date}" + a "Délier le compte" action.

## Authorization model

New helper in `school.ts` (not a protected file):

```ts
export interface MyStudentProfile {
  studentId: string;
  schoolId: string;
  classId: string | null; // via current-year Enrollment
  academicYearId: string | null;
}

export async function resolveMyStudentProfile(userId: string): Promise<MyStudentProfile | null>;
```

Returns `null` for any account not linked via `Student.userId`. **No existing `/api/school/*` route needs to change** — a student account has no `OrganizationMember` row, so `resolveMySchool()` already returns `null` for it, exactly like a non-member does today (see "Relationship to the Espace Enseignant spec" above for why this differs from the teacher case).

New `requireStudent(req)` in a new file `middleware/require-student.ts` (not one of the 3 protected middleware files) — calls the existing exported `requireAuth(req)` internally (no edit to `middleware/index.ts`), then `resolveMyStudentProfile`. Returns `Context | NextResponse`, same shape as the existing HOFs.

**`/api/student/*` routes** — the `studentId` is never a URL or body parameter; it is exclusively the session's resolved `studentId`. Business-logic queries are extracted into functions shared with the existing staff routes (`/api/school/students/[id]/results` etc.), so query logic isn't duplicated — only the authorization layer differs between the staff route (URL `studentId`, org-role-checked) and the student route (session `studentId`, no parameter to tamper with). `/api/student/me` explicitly excludes staff-only fields (e.g. `Student.notes`).

| New endpoint | Shares query logic with |
|---|---|
| `GET /api/student/me` | `/api/school/students/[id]` (minus `notes`) |
| `GET /api/student/results` | `/api/school/students/[id]/results` |
| `GET /api/student/attendance` | `/api/school/students/[id]/attendance` |
| `GET /api/student/appreciations` | `/api/school/students/[id]/appreciations` |
| `GET /api/student/bulletins`, `GET /api/student/bulletin/pdf?termId=` | `/api/school/students/[id]/bulletins`, `.../bulletin/pdf` |
| `GET /api/student/timetable?from=&to=` | new read-only query, `classId` from the student's current `Enrollment` |

## UI / navigation

New route group `frontend/src/app/(eleve)/`:

- `/eleve` — Accueil: prochain cours, dernière note, présence récente
- `/eleve/notes` — reuses `NotesResultatsTab`
- `/eleve/presences` — reuses `PresencesTab`
- `/eleve/appreciations` — reuses `AppreciationsTab`
- `/eleve/bulletins` + `/eleve/bulletins/[termId]` — reuses `BulletinsTab` + the existing `BulletinCanvas` (pure rendering, not staff-specific)
- `/eleve/emploi-du-temps` — new, read-only week/agenda view. The admin timetable editor (drag-position, room/teacher assignment, session-creation wizard) is far heavier than what a student needs; this is a new, much simpler component.

**Shell**: for product consistency with the teacher portal's mobile-first bottom-tab shell (not the heavy admin `Sidebar`), the student portal adopts the same shell paradigm. See "Open questions" above re: whether to literally share one `PortalShell` component.

**Routing after login**: `login/page.tsx`'s redirect gains a `role === 'STUDENT' → '/eleve'` branch, alongside the teacher spec's own new branch — both are additive to the same file (see "Open questions" #1).

## i18n

New message namespaces for genuinely new screens only: `EleveHome`, `EleveTimetable`. Everything else keeps the namespaces already used by the reused tab components (no new keys needed there). Invite-state strings fold into the existing `Eleves` namespace (mirrors the teacher spec folding its own into `Enseignants`). The shared `/definir-mot-de-passe` page's copy lives in one shared `SetPassword` namespace, reused by both invite flows — not duplicated per portal. All three locales (fr/en/ht), matching `locales.test.ts`'s key-parity enforcement.

## Testing

- `resolveMyStudentProfile()`: linked / unlinked / cross-school isolation.
- `requireStudent`: unauthenticated, wrong role, no linked student.
- Invite flow: target resolution (student email present / guardian fallback / neither present → `NO_INVITE_TARGET`), resend invalidates the prior code, expired/used/nonexistent code all reject with the same generic message, successful set-password issues cookies and stamps `emailVerifiedAt`.
- Every `/api/student/*` route: session-only access proven (no parameter can name another student); the underlying shared query function's correctness is exercised once via the existing staff-route tests, not re-tested per portal.
- No new integration harness — unit tests via Vitest + existing `test-utils/prisma-mock.ts`, consistent with the rest of the codebase.
- The `runtime-enforcement.test.ts` tripwire covers new routes automatically — no new test needed for that specifically.

## Rollout phases

Phase 1 does not start until the teacher-portal work's own Phase 1 ships (`createPortalInvite()`, `email.portal_invite` outbox case, `portalInviteEmail()`, `/definir-mot-de-passe` page, `isPortalOnlyAccount()` extension point all landed and merged).

1. **Foundation**: schema change (`Student.userId`), `resolveMyStudentProfile`, the student invite route calling `createPortalInvite()`, extending `isPortalOnlyAccount()` to also check `Student`, a bare `/eleve` home page.
2. **Read-only views**: Notes, Présences, Appréciations, Bulletins — all near-direct reuse of existing tab components.
3. **Emploi du temps**: the one genuinely new read-only view.
4. **Polish**: i18n completeness pass, fiche UI states (invite/resend/unlink), tests.

Each phase is independently shippable — a student account with only Phase 1 can log in and see a home page, nothing more.
