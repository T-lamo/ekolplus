# Multi-espaces (multi-casquettes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One account, several spaces: a teacher (or director-teacher) holding one or more staff roles gets combined access to the school app and the teacher portal, with an `/espaces` chooser page for multi-hat accounts and a "Mes espaces" switcher in every shell.

**Architecture:** Three moves. (1) `OrganizationMember⇄StaffRole` becomes a Prisma implicit many-to-many (`staffRoles`), grants resolve as the union of all roles, and the Administrateurs tab assigns roles through a checkbox popover. (2) `resolveMySchool()`'s teacher lock lifts when the member's grant union is non-empty; a new `resolveMySpaces(userId)` computes `{ school, teacher, student }` and flows through `/api/auth/me`. (3) Login routes on spaces (1 space → direct, ≥2 → `/espaces?pref=`), and a shared `SpaceSwitcher` lands in the school/teacher sidebar user menu and the student header.

**Tech Stack:** Next.js 16 App Router, Prisma 5 (Neon Postgres), Zod, next-intl (fr/ht/en), Tailwind v4 tokens, Radix (DropdownMenu, Popover via existing `MultiSelect`), Vitest + `prisma-mock`.

**Spec:** `docs/superpowers/specs/2026-09-01-multi-espaces-design.md` (read it first; §2 locked decisions, §10 test list).

## Global Constraints

- Every task's commits: `git add` **explicit paths only** and `git commit --only <paths>` — the tree is shared with concurrent sessions.
- Do NOT touch CLAUDE.md-protected files (`lib/server/auth.ts`, `middleware/index.ts`, `lib/api.ts`, `oauth/google.ts`, `webhook/handler.ts`, …). `lib/server/school.ts` is NOT protected but is the portal lock — modify it exactly as specified, nothing more.
- No em dashes (—) in any user-facing string (UI copy, `src/messages/*/*.json`). Use a period, comma, colon, or `·`. French/Creole keep a space before `:` and `?`; English does not.
- Haitian Creole message files carry the `_review` first key (copy it verbatim from `src/messages/ht/permissions.json`).
- All 3 locales must stay key-identical (`locales.test.ts` enforces it).
- New UI: mobile-first (unprefixed classes = 375px), theme tokens only (`text-primary`, `bg-secondary`, …), touch targets ≥ 48px (`min-h-12`).
- NEVER run `prisma migrate dev` / `migrate reset` against the dev DB (pre-existing drift: `27_teacher_self_checkin`, `33_teacher_user_link` — not ours). NEVER pass the real `DATABASE_URL` as a shadow DB. Migration 36 is authored offline (Task 1) and applied at merge time only (Task 8).
- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` — no `any` casts.
- Run all commands from `frontend/` unless a step says otherwise.
- Before each commit: the task's targeted `vitest run` must pass; the final task runs the full `pnpm format && pnpm lint && pnpm typecheck && pnpm test` gate.

## File Structure

| File | Responsibility |
|---|---|
| `frontend/prisma/schema.prisma` (modify) | m2m `OrganizationMember.staffRoles` ⇄ `StaffRole.members`, drop `staffRoleId` |
| `frontend/prisma/migrations/36_staff_role_members/migration.sql` (create) | join table + `INSERT…SELECT` carry-over + column drop |
| `frontend/src/lib/server/school-permissions.ts` (modify) | `resolveGrantsFor` unions all roles' grants |
| `frontend/src/app/api/school/route.ts` (modify) | members payload: `staffRoleIds: string[]` + `isTeacher: boolean` |
| `frontend/src/app/api/school/members/[userId]/route.ts` (modify) | PATCH body `{ staffRoleIds: string[] }` full-replace |
| `frontend/src/app/(school)/settings/types.ts` + `AdministrateursTab.tsx` (modify) | « Rôles » checkbox popover (reuse `MultiSelect`) + « Enseignant » badge |
| `frontend/src/lib/server/school.ts` (modify) | pure `isPortalLocked()`, unlocked `resolveMySchool()`, new `resolveMySpaces()` |
| `frontend/src/app/api/auth/me/route.ts` (modify) | `spaces` field, `isTeacherOnly = spaces.teacher && !spaces.school` |
| `frontend/src/contexts/AuthContext.tsx` (modify) | `User.spaces` type |
| `frontend/src/app/api/school/timetable/route.ts` (modify) | GET: `emploiDuTemps.view` grant → full-school view for teacher-linked MEMBERs |
| `frontend/src/messages/{fr,en,ht}/spaces.json` (create) + `src/lib/locales.ts`, `src/i18n/request.ts`, `src/types/next-intl.d.ts` (modify) | `Spaces` namespace (37th) |
| `frontend/src/app/espaces/page.tsx` (create) | chooser page (outside `(school)`/`(teacher)` groups) |
| `frontend/src/app/login/page.tsx` (modify) | space-based routing + `?pref=` |
| `frontend/src/components/layout/SpaceSwitcher.tsx` (create) | `useMySpaces()`, `SpaceSwitcherMenuItems`, `SpaceSwitcherInline` |
| `frontend/src/components/layout/sidebar/{Sidebar,SidebarUserProfile}.tsx`, `SchoolSidebar.tsx`, `teacher/TeacherSidebar.tsx`, `src/app/(eleve)/eleve/layout.tsx` (modify) | switcher integration in the 3 shells |
| `CLAUDE.md` (modify, Task 8) | doc updates (teacher lock, RBAC paragraph, multi-espaces) |

**One documented deviation from the spec:** §9 places the « Enseignant » badge string in the `spaces` namespace. It lives in `Permissions.adminsTab.teacherBadge` instead — the badge renders inside the Administrateurs tab, and the app's one-namespace-per-screen convention (CLAUDE.md, i18n section) outranks the spec's grouping. Everything else in §9 is followed as written.

---

### Task 1: m2m StaffRole ⇄ OrganizationMember (schema, migration 36, grant union, API, Administrateurs popover)

This is one atomic rename wave: every reader/writer of `staffRoleId` flips to `staffRoles`/`staffRoleIds` in the same commit so no intermediate state is broken. The migration SQL is **authored and committed here but NOT applied to the dev DB** (that happens in Task 8 at merge time — the user's running dev server and testing.schoolgesti.com share this DB and still run old code).

**Files:**
- Modify: `frontend/prisma/schema.prisma:303-334` (OrganizationMember + StaffRole)
- Create: `frontend/prisma/migrations/36_staff_role_members/migration.sql`
- Modify: `frontend/src/lib/server/school-permissions.ts:19-26`
- Modify: `frontend/src/app/api/school/route.ts:65-105`
- Modify: `frontend/src/app/api/school/members/[userId]/route.ts`
- Modify: `frontend/src/app/(school)/settings/types.ts:39-46`
- Modify: `frontend/src/app/(school)/settings/AdministrateursTab.tsx`
- Modify: `frontend/src/messages/{fr,en,ht}/permissions.json` (adminsTab keys + deleteConfirm copy)
- Test: `frontend/src/lib/server/school-permissions.test.ts`, `frontend/src/app/api/school/members/route.test.ts`, `frontend/src/app/api/school/students/route.test.ts` (mock shapes), `frontend/src/app/api/school/timetable/route.test.ts` (mock shapes)

**Interfaces:**
- Consumes: existing `sanitizeGrants(input: readonly string[]): PermissionGrant[]` from `@/lib/permissions` (dedupes + orders by registry — union is just `sanitizeGrants(roles.flatMap(r => r.grants))`).
- Produces (later tasks rely on these):
  - Prisma: `organizationMember.staffRoles: StaffRole[]` relation (select shape `staffRoles: { select: { grants: true } }`).
  - `resolveGrantsFor(mySchool: MySchool, userId: string): Promise<MyGrants>` — same signature, now unions all roles.
  - `GET /api/school` members items: `{ userId, email, name, role, staffRoleIds: string[], isTeacher: boolean, joinedAt }`.
  - `PATCH /api/school/members/[userId]` body `{ staffRoleIds: string[] }` (full replace, `[]` clears, unknown/foreign id → 404).
  - `MemberData` (settings/types.ts): `staffRoleIds: string[]; isTeacher: boolean;` (replaces `staffRoleId`).

- [ ] **Step 1: Update the schema**

In `frontend/prisma/schema.prisma`, replace the two `staffRoleId`/`staffRole` lines of `OrganizationMember` (lines 310-311) with a single list field, and leave `StaffRole.members` as is (it is already `members OrganizationMember[]`; with the FK column gone Prisma now treats the pair as an implicit m2m):

```prisma
model OrganizationMember {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  userId         String
  user           User         @relation("OrgMembership", fields: [userId], references: [id], onDelete: Cascade)
  role           String       @default("MEMBER") // OWNER | ADMIN | MEMBER
  // Rôles staff cumulables (multi-espaces 2026-09-01) : droits effectifs =
  // union des grants de tous les rôles. Supprimer un rôle ne retire que ses
  // lignes de jointure ; les autres rôles du membre restent.
  staffRoles     StaffRole[]
  createdAt      DateTime     @default(now())

  @@unique([organizationId, userId])
  @@index([userId])
}
```

Update `StaffRole`'s comment block too (it says "OWNER/ADMIN n'utilisent pas de StaffRole" — keep that, add one line: `// m2m implicite avec OrganizationMember (table _OrganizationMemberToStaffRole).`).

- [ ] **Step 2: Generate the migration SQL offline (no DB touched)**

Datamodel-to-datamodel diff needs no database and no shadow DB:

```bash
cd frontend
mkdir -p prisma/migrations/36_staff_role_members
git show HEAD:frontend/prisma/schema.prisma > "$SCRATCHPAD/schema.old.prisma"
pnpm exec prisma migrate diff \
  --from-schema-datamodel "$SCRATCHPAD/schema.old.prisma" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/36_staff_role_members/migration.sql
```

(`$SCRATCHPAD` = the session scratchpad directory. `git show HEAD:` reads the committed blob, so Step 1's uncommitted working-tree edit does not affect it — HEAD still holds the pre-edit schema since nothing is committed yet.)

- [ ] **Step 3: Hand-edit the migration — insert the data carry-over BEFORE the column drop**

Open the generated `migration.sql`. It creates `_OrganizationMemberToStaffRole` ("A"/"B" columns + indexes + FKs) and drops `OrganizationMember.staffRoleId`. **Verify in the generated FK constraints which model "A" references** (expected: `"A"` → `OrganizationMember`, `"B"` → `StaffRole`, alphabetical). Then insert, after the join-table creation/indexes/FKs and immediately before the `DROP` statements:

```sql
-- Data migration: carry over existing single-role assignments (spec §8)
INSERT INTO "_OrganizationMemberToStaffRole" ("A", "B")
SELECT "id", "staffRoleId" FROM "OrganizationMember" WHERE "staffRoleId" IS NOT NULL;
```

(Swap `"A"`/`"B"` if the FKs say the reverse.) Do NOT run this SQL now — Task 8 applies it at merge time.

- [ ] **Step 4: Regenerate the Prisma client (local types only)**

```bash
pnpm exec prisma generate
```

Expected: succeeds; `organizationMember` gains `staffRoles`, loses `staffRoleId`. (This only rewrites `node_modules` types in this checkout/worktree — the user's running dev server is untouched.)

- [ ] **Step 5: Union in `resolveGrantsFor`**

In `frontend/src/lib/server/school-permissions.ts`, replace the body of `resolveGrantsFor` and update the file's header comment (« MEMBER passe par les grants de son StaffRole » → « MEMBER passe par l'union des grants de ses rôles staff ») :

```ts
export async function resolveGrantsFor(mySchool: MySchool, userId: string): Promise<MyGrants> {
  if (mySchool.role !== 'MEMBER') return 'ALL';
  const member = await prisma.organizationMember.findFirst({
    where: { userId, organizationId: mySchool.organizationId },
    select: { staffRoles: { select: { grants: true } } },
  });
  // Union de tous les rôles du membre — sanitizeGrants déduplique et
  // réordonne selon le registre (multi-espaces 2026-09-01, décision 7).
  return new Set(sanitizeGrants((member?.staffRoles ?? []).flatMap((r) => r.grants)));
}
```

- [ ] **Step 6: `GET /api/school` — `staffRoleIds` + `isTeacher`**

In `frontend/src/app/api/school/route.ts`, the members query (line 65) and payload (line 98):

```ts
const members = await prisma.organizationMember.findMany({
  where: { organizationId: mySchool.organizationId },
  orderBy: { createdAt: 'asc' },
  select: {
    role: true,
    createdAt: true,
    staffRoles: { select: { id: true } },
    user: {
      select: {
        id: true,
        email: true,
        name: true,
        // Badge « Enseignant » de l'onglet Administrateurs : signale à
        // l'admin qu'assigner un rôle ici crée un double profil.
        teacherProfile: { select: { schoolId: true } },
      },
    },
  },
});
```

```ts
members: members.map((m) => ({
  userId: m.user.id,
  email: m.user.email,
  name: m.user.name,
  role: m.role,
  staffRoleIds: m.staffRoles.map((r) => r.id),
  isTeacher: m.user.teacherProfile?.schoolId === mySchool.schoolId,
  joinedAt: m.createdAt,
})),
```

- [ ] **Step 7: `PATCH /api/school/members/[userId]` — full-replace list**

In `frontend/src/app/api/school/members/[userId]/route.ts`, update the header comment (multiple roles, full replace, `[]` clears) and replace the body schema + role-validation + update block:

```ts
const bodySchema = z.object({ staffRoleIds: z.array(z.string().min(1)).max(50) });
```

```ts
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationFailed(ctx.requestId);
    const staffRoleIds = Array.from(new Set(parsed.data.staffRoleIds));
    if (staffRoleIds.length > 0) {
      // 404 anti-fuite : un id inconnu ou d'une autre école est indistinguable
      const count = await prisma.staffRole.count({
        where: { id: { in: staffRoleIds }, schoolId: mySchool.schoolId },
      });
      if (count !== staffRoleIds.length) return notFound(ctx.requestId);
    }
    await prisma.organizationMember.update({
      where: { id: target.id },
      data: { staffRoles: { set: staffRoleIds.map((id) => ({ id })) } },
    });
    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
```

Everything above (CSRF, `requireAuth`, `hasMinRole('ADMIN')` 404, target lookup, `NOT_A_MEMBER` 400) stays byte-identical.

- [ ] **Step 8: Update the failing tests + add union tests**

`frontend/src/lib/server/school-permissions.test.ts` — change every `{ staffRole: { grants: [...] } }` mock to `{ staffRoles: [{ grants: [...] }] }` and `{ staffRole: null }` to `{ staffRoles: [] }`, then add the union cases (spec §10):

```ts
  it('MEMBER with two roles gets the deduplicated union of their grants, registry-ordered', async () => {
    mockResolve.mockResolvedValueOnce(school);
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      staffRoles: [
        { grants: ['notes.view', 'eleves.view'] },
        { grants: ['eleves.view', 'paiements.view'] },
      ],
    } as never);
    const r = await resolveMyGrants('u1');
    expect(r?.grants).toEqual(new Set(['eleves.view', 'notes.view', 'paiements.view']));
  });
  it('a member whose only remaining role has grants keeps exactly those (deleted role leaves no trace)', async () => {
    mockResolve.mockResolvedValueOnce(school);
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      staffRoles: [{ grants: ['presences.view'] }],
    } as never);
    const r = await resolveMyGrants('u1');
    expect(r?.grants).toEqual(new Set(['presences.view']));
  });
```

`frontend/src/app/api/school/students/route.test.ts` (4 sites) and `frontend/src/app/api/school/timetable/route.test.ts` (2 sites, lines ~197 and ~210) — same mechanical mock-shape change. In the timetable test at line ~174 ("forces a teacher-linked caller…"), also add `prismaMock.organizationMember.findFirst.mockResolvedValue({ staffRoles: [] } as never);` so the mock shape is explicit (Task 4 makes that route call `resolveGrantsFor` for every MEMBER).

`frontend/src/app/api/school/members/route.test.ts` — update the header comment and every PATCH body/assertion:
- happy path: body `{ staffRoleIds: ['role_1', 'role_2'] }`, mock `prismaMock.staffRole.count.mockResolvedValue(2)`, assert `prismaMock.organizationMember.update` called with `data: { staffRoles: { set: [{ id: 'role_1' }, { id: 'role_2' }] } }`.
- clear: body `{ staffRoleIds: [] }` → no `staffRole.count` call, update with `set: []`.
- foreign/unknown id: body `{ staffRoleIds: ['role_other'] }`, `count` resolves `0` → 404, update not called.
- duplicates deduped: body `{ staffRoleIds: ['role_1', 'role_1'] }`, `count` resolves `1` → 200, `set: [{ id: 'role_1' }]`.
- keep the existing caller-permission and `NOT_A_MEMBER` tests, adapting bodies to `{ staffRoleIds: [] }`.

- [ ] **Step 9: Run the touched test files**

```bash
pnpm --filter frontend exec vitest run \
  src/lib/server/school-permissions.test.ts \
  src/app/api/school/members/route.test.ts \
  src/app/api/school/students/route.test.ts \
  src/app/api/school/timetable/route.test.ts
```

Expected: PASS.

- [ ] **Step 10: `MemberData` type + Administrateurs « Rôles » popover**

`frontend/src/app/(school)/settings/types.ts`:

```ts
export interface MemberData {
  userId: string;
  email: string;
  name: string | null;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  staffRoleIds: string[];
  isTeacher: boolean;
  joinedAt: string;
}
```

`frontend/src/app/(school)/settings/AdministrateursTab.tsx` — replace the single-role `FilterSelect` with the existing `MultiSelect` primitive (`@/components/ui/MultiSelect`, Radix Popover + checkbox list — exactly the spec's « popover à cases à cocher »). Remove the now-unused `FilterSelect`/`SelectItem` imports and the `NO_ROLE_VALUE` constant; add `import { MultiSelect } from '@/components/ui/MultiSelect';`.

Replace `handleRoleChange` with:

```ts
  async function handleRolesChange(userId: string, staffRoleIds: string[]) {
    setSavingIds((prev) => new Set(prev).add(userId));
    try {
      await api(`/api/school/members/${userId}`, {
        method: 'PATCH',
        body: { staffRoleIds },
      });
      setRows((prev) => prev.map((m) => (m.userId === userId ? { ...m, staffRoleIds } : m)));
      toast(tAdmins('roleUpdated'), 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }
```

Replace the role-column cell (the `isFullAccess ? … : isAdminPlus ? <FilterSelect…> : …` block):

```tsx
              <div className="flex w-full shrink-0 flex-col gap-1 sm:w-56">
                <span className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {tAdmins('roleColumn')}
                </span>
                {isFullAccess ? (
                  <span className="text-xs font-medium text-foreground">
                    {tAdmins('fullAccess')}
                  </span>
                ) : isAdminPlus ? (
                  <MultiSelect
                    options={roles.map((r) => ({ id: r.id, label: r.name }))}
                    value={m.staffRoleIds}
                    onChange={(ids) => void handleRolesChange(m.userId, ids)}
                    disabled={saving}
                    placeholder={tAdmins('noRolePlaceholder')}
                    searchPlaceholder={tAdmins('searchRoles')}
                    emptyLabel={tAdmins('noRoleResults')}
                    className="w-full"
                  />
                ) : (
                  <span className="text-xs font-medium text-foreground">
                    {m.staffRoleIds.length > 0 ? tAdmins('roleAssigned') : tAdmins('noRole')}
                  </span>
                )}
                {m.isTeacher && !isFullAccess && (
                  <span className="w-fit rounded-full bg-info px-2 py-0.5 text-2xs font-semibold text-info-foreground">
                    {tAdmins('teacherBadge')}
                  </span>
                )}
              </div>
```

Also update the file's top comment (multi-roles, popover). The `rows` state already re-seeds from `members` — no other change.

- [ ] **Step 11: permissions.json — new adminsTab keys + honest deletion copy (3 locales)**

In `src/messages/fr/permissions.json`, `adminsTab` becomes:

```json
  "adminsTab": {
    "roleColumn": "Rôles",
    "fullAccess": "Accès complet",
    "noRole": "Aucun rôle (aucun accès)",
    "noRolePlaceholder": "Aucun rôle",
    "searchRoles": "Rechercher un rôle",
    "noRoleResults": "Aucun rôle trouvé",
    "roleAssigned": "Rôle attribué",
    "roleUpdated": "Rôles mis à jour.",
    "teacherBadge": "Enseignant",
    "manageLink": "Gérer les rôles et permissions"
  }
```

And `deleteConfirm` (a deleted role no longer strips everything when the member holds other roles):

```json
  "deleteConfirm": {
    "one": "Supprimer le rôle « {name} » ? {count} utilisateur perdra les accès donnés par ce rôle. Ses autres rôles, s'il en a, restent actifs.",
    "other": "Supprimer le rôle « {name} » ? {count} utilisateurs perdront les accès donnés par ce rôle. Leurs autres rôles, s'ils en ont, restent actifs.",
    "zero": "Supprimer le rôle « {name} » ? Aucun utilisateur ne l'utilise actuellement."
  }
```

`src/messages/en/permissions.json`:

```json
  "adminsTab": {
    "roleColumn": "Roles",
    "fullAccess": "Full access",
    "noRole": "No role (no access)",
    "noRolePlaceholder": "No role",
    "searchRoles": "Search roles",
    "noRoleResults": "No matching role",
    "roleAssigned": "Role assigned",
    "roleUpdated": "Roles updated.",
    "teacherBadge": "Teacher",
    "manageLink": "Manage roles and permissions"
  }
```

```json
  "deleteConfirm": {
    "one": "Delete the role “{name}”? {count} user will lose the access this role grants. Any other roles they hold stay active.",
    "other": "Delete the role “{name}”? {count} users will lose the access this role grants. Any other roles they hold stay active.",
    "zero": "Delete the role “{name}”? No user currently holds it."
  }
```

(Keep the exact quote style the en file already uses for `deleteConfirm` — check the current value and mirror it.)

`src/messages/ht/permissions.json`:

```json
  "adminsTab": {
    "roleColumn": "Wòl yo",
    "fullAccess": "Aksè konplè",
    "noRole": "Okenn wòl (okenn aksè)",
    "noRolePlaceholder": "Okenn wòl",
    "searchRoles": "Chèche yon wòl",
    "noRoleResults": "Pa gen wòl ki koresponn",
    "roleAssigned": "Wòl atribye",
    "roleUpdated": "Wòl yo mete ajou.",
    "teacherBadge": "Pwofesè",
    "manageLink": "Jere wòl ak pèmisyon yo"
  }
```

```json
  "deleteConfirm": {
    "one": "Efase wòl « {name} » la ? {count} itilizatè pral pèdi aksè wòl sa a bay yo. Lòt wòl li genyen yo rete aktif.",
    "other": "Efase wòl « {name} » la ? {count} itilizatè pral pèdi aksè wòl sa a bay yo. Lòt wòl yo genyen yo rete aktif.",
    "zero": "Efase wòl « {name} » la ? Pa gen okenn itilizatè k ap sèvi avè l kounye a."
  }
```

- [ ] **Step 12: Locales parity + typecheck**

```bash
pnpm --filter frontend exec vitest run src/lib/locales.test.ts
pnpm typecheck
```

Expected: both PASS (typecheck across the repo confirms no `staffRoleId` reader was missed).

- [ ] **Step 13: Commit**

```bash
git add frontend/prisma/schema.prisma \
  frontend/prisma/migrations/36_staff_role_members/migration.sql \
  frontend/src/lib/server/school-permissions.ts \
  frontend/src/lib/server/school-permissions.test.ts \
  frontend/src/app/api/school/route.ts \
  "frontend/src/app/api/school/members/[userId]/route.ts" \
  frontend/src/app/api/school/members/route.test.ts \
  frontend/src/app/api/school/students/route.test.ts \
  frontend/src/app/api/school/timetable/route.test.ts \
  "frontend/src/app/(school)/settings/types.ts" \
  "frontend/src/app/(school)/settings/AdministrateursTab.tsx" \
  frontend/src/messages/fr/permissions.json \
  frontend/src/messages/en/permissions.json \
  frontend/src/messages/ht/permissions.json
git commit --only <same paths> -m "feat(rbac): multiple staff roles per member, grant union (m2m StaffRole)"
```

---

### Task 2: school.ts — pure lock function, resolveMySchool unlock, resolveMySpaces

**Files:**
- Modify: `frontend/src/lib/server/school.ts` (lines 25-56: `findMembership`, `isPortalOnlyAccount`, `resolveMySchool`; append `resolveMySpaces` after `resolveMyStudentProfile`)
- Test: `frontend/src/lib/server/school.test.ts`

**Interfaces:**
- Consumes: `sanitizeGrants` from `@/lib/permissions` (Task 1's m2m relation `staffRoles: { select: { grants: true } }`).
- Produces (Tasks 3/6/7 rely on these):
  - `export function isPortalLocked(input: { teacherLinked: boolean; studentLinked: boolean; staffGrantUnion: readonly string[] }): boolean`
  - `export interface MySpaces { school: boolean; teacher: boolean; student: boolean }`
  - `export async function resolveMySpaces(userId: string): Promise<MySpaces>`
  - `resolveMySchool` / `resolveMySchoolIncludingTeacher` signatures unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/lib/server/school.test.ts` (the file's `beforeEach` already defaults `student.findFirst` to null; `membershipRow` helper exists — extend it to carry `staffRoles`):

```ts
describe('resolveMySchool — déblocage double profil (multi-espaces)', () => {
  it('still denies a teacher-linked MEMBER with no staff role', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ staffRoles: [] }) as never,
    );
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teacher_1' } as never);
    expect(await resolveMySchool('user_1')).toBeNull();
  });

  it('still denies a teacher-linked MEMBER whose roles have zero grants', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ staffRoles: [{ grants: [] }, { grants: ['bogus.grant'] }] }) as never,
    );
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teacher_1' } as never);
    expect(await resolveMySchool('user_1')).toBeNull();
  });

  it('unlocks a teacher-linked MEMBER whose grant union is non-empty', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ staffRoles: [{ grants: ['paiements.view'] }] }) as never,
    );
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teacher_1' } as never);
    expect(await resolveMySchool('user_1')).toEqual({
      organizationId: 'org_1',
      schoolId: 'school_1',
      role: 'MEMBER',
    });
  });

  it('a student-linked MEMBER stays denied even with staff-role grants', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ staffRoles: [{ grants: ['paiements.view'] }] }) as never,
    );
    prismaMock.teacher.findFirst.mockResolvedValue(null as never);
    prismaMock.student.findFirst.mockResolvedValue({ id: 'student_1' } as never);
    expect(await resolveMySchool('user_1')).toBeNull();
  });
});

describe('isPortalLocked', () => {
  it.each([
    [{ teacherLinked: false, studentLinked: false, staffGrantUnion: [] }, false],
    [{ teacherLinked: true, studentLinked: false, staffGrantUnion: [] }, true],
    [{ teacherLinked: true, studentLinked: false, staffGrantUnion: ['eleves.view'] }, false],
    [{ teacherLinked: false, studentLinked: true, staffGrantUnion: ['eleves.view'] }, true],
    [{ teacherLinked: true, studentLinked: true, staffGrantUnion: ['eleves.view'] }, true],
  ])('%o → %s', (input, locked) => {
    expect(isPortalLocked(input)).toBe(locked);
  });
});

describe('resolveMySpaces', () => {
  function mockUserRole(role: string) {
    prismaMock.user.findUnique.mockResolvedValue({ role } as never);
  }

  it('pure school admin → school only', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ role: 'OWNER', staffRoles: [] }) as never,
    );
    prismaMock.teacher.findFirst.mockResolvedValue(null as never);
    mockUserRole('USER');
    expect(await resolveMySpaces('user_1')).toEqual({
      school: true,
      teacher: false,
      student: false,
    });
  });

  it('pure teacher (MEMBER, no grants) → teacher only', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ staffRoles: [] }) as never,
    );
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teacher_1' } as never);
    mockUserRole('USER');
    expect(await resolveMySpaces('user_1')).toEqual({
      school: false,
      teacher: true,
      student: false,
    });
  });

  it('pure student (no membership, USER role) → student only', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never);
    prismaMock.student.findFirst.mockResolvedValue({ id: 'student_1' } as never);
    mockUserRole('USER');
    expect(await resolveMySpaces('user_1')).toEqual({
      school: false,
      teacher: false,
      student: true,
    });
  });

  it('teacher with a granted staff role (double profil) → school + teacher', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ staffRoles: [{ grants: ['paiements.view'] }] }) as never,
    );
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teacher_1' } as never);
    mockUserRole('USER');
    expect(await resolveMySpaces('user_1')).toEqual({
      school: true,
      teacher: true,
      student: false,
    });
  });

  it('director who also teaches (ADMIN + teacher link) → school + teacher', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ role: 'ADMIN', staffRoles: [] }) as never,
    );
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 'teacher_1' } as never);
    mockUserRole('USER');
    expect(await resolveMySpaces('user_1')).toEqual({
      school: true,
      teacher: true,
      student: false,
    });
  });

  it('MEMBER staff without any grant → no space at all (login falls back to /dashboard)', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(
      membershipRow({ staffRoles: [] }) as never,
    );
    prismaMock.teacher.findFirst.mockResolvedValue(null as never);
    mockUserRole('USER');
    expect(await resolveMySpaces('user_1')).toEqual({
      school: false,
      teacher: false,
      student: false,
    });
  });

  it('account with nothing → all false', async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never);
    mockUserRole('USER');
    expect(await resolveMySpaces('user_1')).toEqual({
      school: false,
      teacher: false,
      student: false,
    });
  });
});
```

Update the import at the top of the test file to add `isPortalLocked, resolveMySpaces`. Also update `membershipRow` so existing tests keep passing: give it a default `staffRoles: []` field (the new `resolveMySchool` reads it).

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter frontend exec vitest run src/lib/server/school.test.ts
```

Expected: FAIL — `isPortalLocked`/`resolveMySpaces` not exported.

- [ ] **Step 3: Implement in `school.ts`**

Add `import { sanitizeGrants } from '@/lib/permissions';` (pure module, safe in server code). Update `findMembership` to also select the grants:

```ts
async function findMembership(userId: string) {
  return prisma.organizationMember.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      organizationId: true,
      role: true,
      staffRoles: { select: { grants: true } },
      organization: { select: { school: { select: { id: true } } } },
    },
  });
}
```

Delete `isPortalOnlyAccount` and add the pure lock + the new `resolveMySchool`:

```ts
// Verrou portail (multi-espaces 2026-09-01), pur et testable :
// - lien Student → toujours verrouillé (aucun rôle staff ne débloque un élève)
// - lien Teacher seul → verrouillé sauf si l'union des grants des rôles
//   staff du membre est non vide (« double profil » : le RBAC route par
//   route fait ensuite toute l'autorisation, rien de plus n'est ouvert ici)
// - pas de lien portail → jamais verrouillé (comportement historique)
export function isPortalLocked(input: {
  teacherLinked: boolean;
  studentLinked: boolean;
  staffGrantUnion: readonly string[];
}): boolean {
  if (input.studentLinked) return true;
  if (input.teacherLinked) return input.staffGrantUnion.length === 0;
  return false;
}

export async function resolveMySchool(userId: string): Promise<MySchool | null> {
  const membership = await findMembership(userId);
  if (!membership || !membership.organization.school) return null;
  const schoolId = membership.organization.school.id;
  if (membership.role === 'MEMBER') {
    const [teacher, student] = await Promise.all([
      prisma.teacher.findFirst({ where: { userId, schoolId }, select: { id: true } }),
      prisma.student.findFirst({ where: { userId, schoolId }, select: { id: true } }),
    ]);
    const locked = isPortalLocked({
      teacherLinked: teacher !== null,
      studentLinked: student !== null,
      staffGrantUnion: sanitizeGrants(membership.staffRoles.flatMap((r) => r.grants)),
    });
    if (locked) return null;
  }
  return { organizationId: membership.organizationId, schoolId, role: membership.role as OrgRole };
}
```

Append after `resolveMyStudentProfile`:

```ts
export interface MySpaces {
  school: boolean;
  teacher: boolean;
  student: boolean;
}

// Un « espace » = une interface complète (app école / portail enseignant /
// portail élève). Source de vérité unique du login, de la page /espaces et
// du sélecteur « Mes espaces » — spec 2026-09-01-multi-espaces §3.
// school : OWNER/ADMIN, ou MEMBER dont l'union des grants est non vide
// (et jamais un compte lié élève). teacher : lien Teacher dans l'école du
// membership. student : mêmes gardes qu'isStudentOnly (User.role USER,
// aucun membership d'org, lien Student).
export async function resolveMySpaces(userId: string): Promise<MySpaces> {
  const membership = await findMembership(userId);
  const schoolId = membership?.organization.school?.id ?? null;
  const [user, teacher, student] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    schoolId
      ? prisma.teacher.findFirst({ where: { userId, schoolId }, select: { id: true } })
      : Promise.resolve(null),
    prisma.student.findFirst({
      where: schoolId ? { userId, schoolId } : { userId },
      select: { id: true },
    }),
  ]);
  const grantUnion = membership
    ? sanitizeGrants(membership.staffRoles.flatMap((r) => r.grants))
    : [];
  const school =
    membership !== null &&
    schoolId !== null &&
    !isPortalLocked({
      teacherLinked: teacher !== null,
      studentLinked: student !== null,
      staffGrantUnion: grantUnion,
    }) &&
    (membership.role !== 'MEMBER' || grantUnion.length > 0);
  return {
    school,
    teacher: schoolId !== null && teacher !== null,
    student: (user?.role ?? 'USER') === 'USER' && schoolId === null && student !== null,
  };
}
```

Also refresh the file's header comment block (lines 1-14): the deny-by-default paragraph gains one sentence, e.g. « Depuis multi-espaces (2026-09-01), un MEMBER lié enseignant dont l'union des grants de rôles staff est non vide est débloqué (double profil) ; un lien élève reste toujours verrouillé. »

- [ ] **Step 4: Run tests**

```bash
pnpm --filter frontend exec vitest run src/lib/server/school.test.ts src/lib/server/school-permissions.test.ts
```

Expected: PASS (including the pre-existing resolveMySchool tests, thanks to `membershipRow`'s `staffRoles: []` default).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/school.ts frontend/src/lib/server/school.test.ts
git commit --only frontend/src/lib/server/school.ts frontend/src/lib/server/school.test.ts \
  -m "feat(multi-espaces): unlock resolveMySchool for granted double profiles, add resolveMySpaces"
```

---

### Task 3: /api/auth/me — spaces field, isTeacherOnly narrowed, AuthContext type

**Files:**
- Modify: `frontend/src/app/api/auth/me/route.ts:31-105` (imports + GET derivation + payload)
- Modify: `frontend/src/contexts/AuthContext.tsx:38-46` (User interface)
- Test: `frontend/src/app/api/auth/me/route.test.ts`

**Interfaces:**
- Consumes: `resolveMySpaces(userId): Promise<MySpaces>` from Task 2.
- Produces: `GET /api/auth/me` user payload gains `spaces: { school: boolean; teacher: boolean; student: boolean }`; `isTeacherOnly === spaces.teacher && !spaces.school`; `isStudentOnly` unchanged. `User.spaces?: { school: boolean; teacher: boolean; student: boolean }` on the client (Tasks 6/7 read it via `useUser()`/`refresh()`).

- [ ] **Step 1: Update the route test**

In `frontend/src/app/api/auth/me/route.test.ts`: the `vi.mock('@/lib/server/school', …)` factory currently stubs `resolveMySchoolIncludingTeacher`, `resolveMyTeacherProfile`, `resolveMyStudentProfile`. Add `resolveMySpaces: vi.fn()`, import it, and create `const mockResolveMySpaces = vi.mocked(resolveMySpaces);`. In every existing test's setup (or a shared `beforeEach`), default it:

```ts
mockResolveMySpaces.mockResolvedValue({ school: true, teacher: false, student: false });
```

Rework the `isTeacherOnly` describe block: `isTeacherOnly` is now derived from spaces, so the two existing cases become:

```ts
  it('reports isTeacherOnly=true for a purely teacher-linked account', async () => {
    mockResolveMySpaces.mockResolvedValue({ school: false, teacher: true, student: false });
    // …existing auth/dbUser setup unchanged…
    const body = await (await GET(request)).json();
    expect(body.user.isTeacherOnly).toBe(true);
    expect(body.user.spaces).toEqual({ school: false, teacher: true, student: false });
  });

  it('reports isTeacherOnly=false for a double profile (teacher + granted staff role)', async () => {
    mockResolveMySpaces.mockResolvedValue({ school: true, teacher: true, student: false });
    const body = await (await GET(request)).json();
    expect(body.user.isTeacherOnly).toBe(false);
    expect(body.user.spaces).toEqual({ school: true, teacher: true, student: false });
  });
```

(Adapt to the file's existing request/auth helpers — read them before editing; drop any `mockResolveMyTeacherProfile` setup those tests no longer need, but keep the mock in the factory if other tests use it.)

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter frontend exec vitest run src/app/api/auth/me/route.test.ts
```

Expected: FAIL — `spaces` undefined in payload.

- [ ] **Step 3: Implement in `me/route.ts`**

Imports: add `resolveMySpaces`, remove `resolveMyTeacherProfile` (keep `resolveMySchoolIncludingTeacher` and `resolveMyStudentProfile` — `isStudentOnly` still uses them). Replace the derivation block (lines 81-86):

```ts
    const mySchool = await resolveMySchoolIncludingTeacher(auth.user.sub);
    // Multi-espaces (spec 2026-09-01 §5) : « purement enseignant » = lié
    // enseignant sans aucun espace école. Un double profil (rôle staff avec
    // au moins un droit) garde les deux espaces et n'est plus rebondi hors
    // de l'app école par (school)/layout.tsx ni par le login.
    const spaces = await resolveMySpaces(auth.user.sub);
    const isTeacherOnly = spaces.teacher && !spaces.school;
```

Keep the `isStudentOnly` block exactly as is. In the `user` payload object, after `isStudentOnly,` add:

```ts
      spaces,
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter frontend exec vitest run src/app/api/auth/me/route.test.ts
```

Expected: PASS.

- [ ] **Step 5: `User.spaces` on the client**

In `frontend/src/contexts/AuthContext.tsx`, after the `isStudentOnly?: boolean;` member add:

```ts
  /** Espaces accessibles par ce compte (multi-casquettes) : miroir du champ
   * `spaces` de GET /api/auth/me, calculé côté serveur par resolveMySpaces()
   * (lib/server/school.ts). Drive le routage du login, la page /espaces et
   * le sélecteur « Mes espaces » des trois shells. */
  spaces?: { school: boolean; teacher: boolean; student: boolean };
```

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm typecheck
git add frontend/src/app/api/auth/me/route.ts frontend/src/app/api/auth/me/route.test.ts frontend/src/contexts/AuthContext.tsx
git commit --only frontend/src/app/api/auth/me/route.ts frontend/src/app/api/auth/me/route.test.ts frontend/src/contexts/AuthContext.tsx \
  -m "feat(multi-espaces): expose spaces on /api/auth/me, narrow isTeacherOnly to teacher-without-school"
```

---

### Task 4: Timetable GET — full-school view when the caller holds emploiDuTemps.view

**Files:**
- Modify: `frontend/src/app/api/school/timetable/route.ts:61-130` (GET only — POST untouched)
- Test: `frontend/src/app/api/school/timetable/route.test.ts`

**Interfaces:**
- Consumes: `resolveGrantsFor` + `hasGrant` (already imported by this route).
- Produces: behavior only — a teacher-linked MEMBER with `emploiDuTemps.view` gets the unscoped query (and the optional `?teacherId` filter works for them like for an admin); without the grant, the teacher-scoped view is unchanged.

- [ ] **Step 1: Write the failing tests**

Append to the GET describe block of `route.test.ts` (reuse the file's `memberSchool`, `sessionRow()`, mock helpers):

```ts
  it('a teacher-linked MEMBER holding emploiDuTemps.view gets the full-school view (no forced teacherId)', async () => {
    mockResolveIncludingTeacher.mockResolvedValue(memberSchool);
    mockResolveMyTeacherProfile.mockResolvedValue({
      teacherId: 'tea_1',
      classSubjectIds: ['cs_1'],
      homeroomClassIds: [],
    });
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      staffRoles: [{ grants: ['emploiDuTemps.view'] }],
    } as never);
    prismaMock.timetableSession.findMany
      .mockResolvedValueOnce([sessionRow()] as never)
      .mockResolvedValueOnce([] as never);
    prismaMock.class.findMany.mockResolvedValue([] as never);

    const res = await GET(req('GET', '/api/school/timetable?from=2026-08-17&to=2026-08-21'));
    expect(res.status).toBe(200);
    const where = prismaMock.timetableSession.findMany.mock.calls[0]?.[0]?.where;
    expect(where).not.toHaveProperty('teacherId');
  });

  it('a teacher-linked MEMBER with the grant can use the optional ?teacherId filter', async () => {
    mockResolveIncludingTeacher.mockResolvedValue(memberSchool);
    mockResolveMyTeacherProfile.mockResolvedValue({
      teacherId: 'tea_1',
      classSubjectIds: ['cs_1'],
      homeroomClassIds: [],
    });
    prismaMock.organizationMember.findFirst.mockResolvedValue({
      staffRoles: [{ grants: ['emploiDuTemps.view'] }],
    } as never);
    prismaMock.timetableSession.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    prismaMock.class.findMany.mockResolvedValue([] as never);

    const res = await GET(
      req('GET', '/api/school/timetable?from=2026-08-17&to=2026-08-21&teacherId=tea_2'),
    );
    expect(res.status).toBe(200);
    const where = prismaMock.timetableSession.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ teacherId: 'tea_2' });
  });
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter frontend exec vitest run src/app/api/school/timetable/route.test.ts
```

Expected: the 2 new tests FAIL (forced `teacherId: 'tea_1'`); the rest PASS.

- [ ] **Step 3: Implement**

In the GET handler, replace the guard block (lines 61-80) with:

```ts
    const myTeacher =
      mySchool.role === 'MEMBER'
        ? await resolveMyTeacherProfile(auth.user.sub, mySchool.schoolId)
        : null;
    // Garde RBAC manuelle + raffinement multi-espaces (spec 2026-09-01 §4) :
    // un MEMBER non enseignant doit détenir emploiDuTemps.view ; un MEMBER
    // enseignant SANS ce grant garde la vue scopée à ses propres séances ;
    // AVEC ce grant, la vue pleine école prime (le rôle donne ce qu'il
    // accorde). Même refus que requireSchoolPermission.
    let forcedTeacherId: string | null = myTeacher?.teacherId ?? null;
    if (mySchool.role === 'MEMBER') {
      const grants = await resolveGrantsFor(mySchool, auth.user.sub);
      const hasTimetableView = hasGrant(grants, 'emploiDuTemps', 'view');
      if (!myTeacher && !hasTimetableView) {
        return NextResponse.json(
          {
            error: 'PERMISSION_DENIED',
            message: 'You do not have permission to perform this action.',
          },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (hasTimetableView) forcedTeacherId = null;
    }
```

And in the sessions `where` clause (line ~121), replace the `myTeacher` ternary with:

```ts
          ...(forcedTeacherId
            ? { teacherId: forcedTeacherId }
            : parsed.data.teacherId
              ? { teacherId: parsed.data.teacherId }
              : {}),
```

Also update the file's line-7 header comment to mention the grant-primes-over-scoping rule.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter frontend exec vitest run src/app/api/school/timetable/route.test.ts
```

Expected: PASS — including the pre-existing "forces a teacher-linked caller…" test (its member mock resolves `{ staffRoles: [] }` per Task 1 Step 8, so the grant check is false and scoping still applies).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/school/timetable/route.ts frontend/src/app/api/school/timetable/route.test.ts
git commit --only frontend/src/app/api/school/timetable/route.ts frontend/src/app/api/school/timetable/route.test.ts \
  -m "feat(multi-espaces): emploiDuTemps.view grant gives teacher-linked staff the full-school timetable"
```

---

### Task 5: i18n — `spaces` namespace (fr/en/ht) registered in all 4 places

**Files:**
- Create: `frontend/src/messages/fr/spaces.json`, `frontend/src/messages/en/spaces.json`, `frontend/src/messages/ht/spaces.json`
- Modify: `frontend/src/lib/locales.ts` (MESSAGE_NAMESPACES), `frontend/src/i18n/request.ts` (import + `Spaces:` entry), `frontend/src/types/next-intl.d.ts` (type import + `Spaces:` member)
- Test: `frontend/src/lib/locales.test.ts` (existing — must stay green)

**Interfaces:**
- Produces: namespace `Spaces` with keys `chooser.title`, `chooser.subtitle`, `chooser.enter`, `cards.{school,teacher,student}.{title,subtitle}`, `switcher.label` — consumed by Tasks 6 and 7 via `useTranslations('Spaces')`.

- [ ] **Step 1: Write the three message files**

`frontend/src/messages/fr/spaces.json`:

```json
{
  "chooser": {
    "title": "Choisissez votre espace",
    "subtitle": "Votre compte donne accès à plusieurs espaces. Vous pourrez en changer à tout moment depuis votre menu utilisateur.",
    "enter": "Entrer"
  },
  "cards": {
    "school": {
      "title": "Administration",
      "subtitle": "Gestion de l'établissement : élèves, notes, paiements et autres modules selon vos permissions."
    },
    "teacher": {
      "title": "Espace enseignant",
      "subtitle": "Vos classes, votre carnet de notes, vos appréciations et votre emploi du temps."
    },
    "student": {
      "title": "Espace élève",
      "subtitle": "Notes, présences, emploi du temps et bulletins."
    }
  },
  "switcher": {
    "label": "Mes espaces"
  }
}
```

`frontend/src/messages/en/spaces.json`:

```json
{
  "chooser": {
    "title": "Choose your space",
    "subtitle": "Your account gives access to several spaces. You can switch at any time from your user menu.",
    "enter": "Enter"
  },
  "cards": {
    "school": {
      "title": "Administration",
      "subtitle": "School management: students, grades, payments and other modules based on your permissions."
    },
    "teacher": {
      "title": "Teacher space",
      "subtitle": "Your classes, grade book, assessments and timetable."
    },
    "student": {
      "title": "Student space",
      "subtitle": "Grades, attendance, timetable and report cards."
    }
  },
  "switcher": {
    "label": "My spaces"
  }
}
```

`frontend/src/messages/ht/spaces.json` (the `_review` line must be copied verbatim from `src/messages/ht/permissions.json`'s first key):

```json
{
  "_review": "<copy the exact _review value from ht/permissions.json>",
  "chooser": {
    "title": "Chwazi espas ou",
    "subtitle": "Kont ou bay aksè a plizyè espas. Ou ka chanje nenpòt lè nan meni itilizatè ou a.",
    "enter": "Antre"
  },
  "cards": {
    "school": {
      "title": "Administrasyon",
      "subtitle": "Jesyon lekòl la : elèv, nòt, peman ak lòt modil selon pèmisyon ou yo."
    },
    "teacher": {
      "title": "Espas pwofesè",
      "subtitle": "Klas ou yo, kanè nòt ou, apresyasyon ou yo ak orè ou."
    },
    "student": {
      "title": "Espas elèv",
      "subtitle": "Nòt, prezans, orè ak bilten."
    }
  },
  "switcher": {
    "label": "Espas mwen yo"
  }
}
```

- [ ] **Step 2: Register in the 3 code files**

1. `src/lib/locales.ts`: append `'spaces',` after `'permissions',` in `MESSAGE_NAMESPACES`.
2. `src/i18n/request.ts`: add `spaces` to the destructured array (after `permissions`), add `import(\`../messages/${locale}/spaces.json\`),` at the matching position in the `Promise.all`, and `Spaces: spaces.default,` in the returned `messages`.
3. `src/types/next-intl.d.ts`: add `import type spaces from '@/messages/fr/spaces.json';` and `Spaces: typeof spaces;` in `Messages`.

(Position must match in the destructure and the `Promise.all` — they are parallel arrays.)

- [ ] **Step 3: Run the registry test**

```bash
pnpm --filter frontend exec vitest run src/lib/locales.test.ts
pnpm typecheck
```

Expected: PASS — 37 namespaces, key parity across the 3 locales, request.ts/d.ts cross-checks green.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/messages/fr/spaces.json frontend/src/messages/en/spaces.json frontend/src/messages/ht/spaces.json \
  frontend/src/lib/locales.ts frontend/src/i18n/request.ts frontend/src/types/next-intl.d.ts
git commit --only <same paths> -m "feat(i18n): spaces namespace (fr/en/ht) for the multi-espaces chooser and switcher"
```

---

### Task 6: `/espaces` chooser page + login routing

**Files:**
- Create: `frontend/src/app/espaces/page.tsx`
- Modify: `frontend/src/app/login/page.tsx:69-81` (redirect logic only — the tabs stay visually untouched)

**Interfaces:**
- Consumes: `User.spaces` (Task 3), `Spaces` namespace (Task 5), existing `useAuth()`/`refresh()`, `Card`, `Skeleton`.
- Produces: route `/espaces?pref=admin|teacher|student`. Login tab state (`'admin' | 'teacher' | 'studentParent'`) maps `studentParent → student`.

- [ ] **Step 1: Create the page**

`frontend/src/app/espaces/page.tsx` — a client page outside the `(school)`/`(teacher)` groups (minimal shell, like the auth pages). `useSearchParams` requires a `Suspense` boundary (same pattern as `src/app/auth/error/page.tsx`):

```tsx
'use client';

// Page « Choisissez votre espace » (multi-casquettes, spec 2026-09-01 §6).
// Rendue seulement aux comptes multi-espaces : un compte mono-espace (ou
// sans espace) est redirigé immédiatement, la page est donc sûre en favori.
// ?pref=admin|teacher|student (onglet choisi au login) met la carte
// correspondante en tête avec un accent, sans bloquer les autres.
import { Suspense, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, GraduationCap, School as SchoolIcon, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

type SpaceKey = 'school' | 'teacher' | 'student';

const SPACE_HREF: Record<SpaceKey, string> = {
  school: '/dashboard',
  teacher: '/espace-enseignant',
  student: '/eleve',
};
const SPACE_ICONS = { school: SchoolIcon, teacher: GraduationCap, student: Users } as const;
const PREF_TO_SPACE: Record<string, SpaceKey> = {
  admin: 'school',
  teacher: 'teacher',
  student: 'student',
};

function EspacesContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations('Spaces');

  const available = useMemo<SpaceKey[]>(() => {
    const s = user?.spaces;
    return [
      ...(s?.school ? (['school'] as const) : []),
      ...(s?.teacher ? (['teacher'] as const) : []),
      ...(s?.student ? (['student'] as const) : []),
    ];
  }, [user]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
    } else if (available.length === 1) {
      router.replace(SPACE_HREF[available[0]!]);
    } else if (available.length === 0) {
      router.replace('/dashboard');
    }
  }, [loading, user, available, router]);

  if (loading || !user || available.length < 2) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  const pref = PREF_TO_SPACE[params.get('pref') ?? ''] ?? null;
  const ordered =
    pref && available.includes(pref) ? [pref, ...available.filter((k) => k !== pref)] : available;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <Image
        src="/logos/schoolgesti-lockup.svg"
        alt="Schoolgesti"
        width={164}
        height={44}
        className="mb-8 h-11 w-auto"
        priority
      />
      <h1 className="mb-1.5 text-center text-[22px] font-extrabold tracking-tight text-foreground sm:text-[26px]">
        {t('chooser.title')}
      </h1>
      <p className="mb-8 max-w-md text-center text-[13px] leading-relaxed text-muted-foreground">
        {t('chooser.subtitle')}
      </p>
      <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((key) => {
          const Icon = SPACE_ICONS[key];
          const highlighted = key === pref;
          return (
            <Card
              key={key}
              className={`flex flex-col items-start gap-3 p-5 ${
                highlighted ? 'ring-2 ring-primary' : ''
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                <Icon size={18} className="text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-bold text-foreground">{t(`cards.${key}.title`)}</h2>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {t(`cards.${key}.subtitle`)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push(SPACE_HREF[key])}
                className="inline-flex min-h-12 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-[13px] font-semibold text-primary-foreground"
              >
                {t('chooser.enter')}
                <ArrowRight size={14} />
              </button>
            </Card>
          );
        })}
      </div>
    </main>
  );
}

export default function EspacesPage() {
  return (
    <Suspense fallback={null}>
      <EspacesContent />
    </Suspense>
  );
}
```

(Verified at plan time: `Card` has no default padding, so `p-5` is correct; `--color-primary-foreground` and `--color-info` exist in `globals.css`. If you prefer the app's `Button` component over the raw `<button>`, that is an acceptable equivalent — keep the `min-h-12` touch target either way.)

- [ ] **Step 2: Login routing**

In `frontend/src/app/login/page.tsx`, replace lines 70-81 (the comment + `isPlatformStaff` + `destination` + `router.push`) with:

```ts
      // Multi-espaces (spec 2026-09-01 §6) : plateforme (ADMIN/SUPERADMIN)
      // d'abord ; 1 seul espace → entrée directe (l'onglet est ignoré) ;
      // ≥ 2 espaces → page « Choisissez votre espace », l'onglet du login
      // pré-sélectionnant la carte ; 0 espace → /dashboard (écran « pas
      // d'école » existant). `/` reste la landing publique.
      const isPlatformStaff = me?.role === 'SUPERADMIN' || me?.role === 'ADMIN';
      const spaces = me?.spaces;
      const available = [
        ...(spaces?.school ? ['/dashboard'] : []),
        ...(spaces?.teacher ? ['/espace-enseignant'] : []),
        ...(spaces?.student ? ['/eleve'] : []),
      ];
      const pref = role === 'studentParent' ? 'student' : role;
      const destination = isPlatformStaff
        ? '/admin'
        : available.length >= 2
          ? `/espaces?pref=${pref}`
          : (available[0] ?? '/dashboard');
      router.push(destination);
```

(`role` is the existing tab state, typed `'admin' | 'teacher' | 'studentParent'` — the ternary maps it to the `pref` vocabulary. The tabs themselves and their `roleTabs.*` labels stay untouched.)

- [ ] **Step 3: Verify**

```bash
pnpm typecheck && pnpm lint
```

Expected: PASS. Then a quick behavioral sanity check of the two files by reading the diff — no change to error handling or the tabs' render.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/espaces/page.tsx frontend/src/app/login/page.tsx
git commit --only frontend/src/app/espaces/page.tsx frontend/src/app/login/page.tsx \
  -m "feat(multi-espaces): /espaces chooser page and space-aware login routing"
```

---

### Task 7: SpaceSwitcher in the three shells

**Files:**
- Create: `frontend/src/components/layout/SpaceSwitcher.tsx`
- Modify: `frontend/src/components/layout/sidebar/SidebarUserProfile.tsx` (new optional prop + render)
- Modify: `frontend/src/components/layout/sidebar/Sidebar.tsx` (pass-through prop)
- Modify: `frontend/src/components/layout/SchoolSidebar.tsx:~195` and `frontend/src/components/layout/teacher/TeacherSidebar.tsx:~99` (set `currentSpace`)
- Modify: `frontend/src/app/(eleve)/eleve/layout.tsx` (inline switcher in the header)

**Interfaces:**
- Consumes: `useUser().spaces` (Task 3), `Spaces.cards.*.title` + `Spaces.switcher.label` (Task 5).
- Produces:
  - `export type SpaceKey = 'school' | 'teacher' | 'student'`
  - `export function useMySpaces(): SpaceKey[]`
  - `export function SpaceSwitcherMenuItems({ current }: { current: SpaceKey })` — Radix `DropdownMenu` rows, renders `null` for mono-space accounts.
  - `export function SpaceSwitcherInline({ current }: { current: SpaceKey })` — link buttons for the student header, `null` for mono-space.

- [ ] **Step 1: Create `SpaceSwitcher.tsx`**

```tsx
'use client';

// Sélecteur « Mes espaces » (multi-casquettes, spec 2026-09-01 §7) : liste
// les espaces du compte, marque l'espace courant, navigue directement vers
// les URL d'entrée. Rendu nul pour un compte mono-espace. Deux formes : des
// items de menu Radix pour le menu utilisateur des sidebars (école,
// enseignant) et des liens inline pour le header du portail élève, qui n'a
// pas de menu utilisateur.
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, GraduationCap, School as SchoolIcon, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useUser } from '@/contexts/AuthContext';

export type SpaceKey = 'school' | 'teacher' | 'student';

const SPACE_HREF: Record<SpaceKey, string> = {
  school: '/dashboard',
  teacher: '/espace-enseignant',
  student: '/eleve',
};
const SPACE_ICONS = { school: SchoolIcon, teacher: GraduationCap, student: Users } as const;

export function useMySpaces(): SpaceKey[] {
  const user = useUser();
  const s = user?.spaces;
  return [
    ...(s?.school ? (['school'] as const) : []),
    ...(s?.teacher ? (['teacher'] as const) : []),
    ...(s?.student ? (['student'] as const) : []),
  ];
}

export function SpaceSwitcherMenuItems({ current }: { current: SpaceKey }) {
  const available = useMySpaces();
  const router = useRouter();
  const t = useTranslations('Spaces');
  if (available.length < 2) return null;
  return (
    <>
      <DropdownMenu.Separator className="my-1 h-px bg-border" />
      <DropdownMenu.Label className="px-2 pt-1 pb-0.5 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
        {t('switcher.label')}
      </DropdownMenu.Label>
      {available.map((key) => {
        const Icon = SPACE_ICONS[key];
        const isCurrent = key === current;
        return (
          <DropdownMenu.Item
            key={key}
            disabled={isCurrent}
            onSelect={() => router.push(SPACE_HREF[key])}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-none data-[disabled]:opacity-60 data-[highlighted]:bg-secondary data-[highlighted]:text-primary"
          >
            <Icon size={14} />
            <span className="flex-1">{t(`cards.${key}.title`)}</span>
            {isCurrent && <Check size={14} className="text-primary" />}
          </DropdownMenu.Item>
        );
      })}
    </>
  );
}

export function SpaceSwitcherInline({ current }: { current: SpaceKey }) {
  const available = useMySpaces();
  const t = useTranslations('Spaces');
  if (available.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {available
        .filter((key) => key !== current)
        .map((key) => {
          const Icon = SPACE_ICONS[key];
          return (
            <Link
              key={key}
              href={SPACE_HREF[key]}
              className="inline-flex min-h-12 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-primary"
            >
              <Icon size={14} />
              {t(`cards.${key}.title`)}
            </Link>
          );
        })}
    </div>
  );
}
```

- [ ] **Step 2: Thread it through SidebarUserProfile + Sidebar**

`SidebarUserProfile.tsx`: import `SpaceSwitcherMenuItems, type SpaceKey` from `../SpaceSwitcher`; add to the props interface:

```ts
  /** Espace courant du shell : active le bloc « Mes espaces » dans le menu.
   * Absent = pas de sélecteur (shell admin plateforme). */
  currentSpace?: SpaceKey;
```

Destructure `currentSpace`, and render it inside `DropdownMenu.Content` between the « Mon profil » item and the logout item:

```tsx
          {currentSpace && <SpaceSwitcherMenuItems current={currentSpace} />}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item onSelect={() => void logout()} …
```

(Insert the extra `Separator` before logout ONLY when it isn't doubled: `SpaceSwitcherMenuItems` starts with its own separator, so the final layout is: profile header · sep · Mon profil · [sep · Mes espaces items] · sep · Déconnexion. Add one separator line before the logout item — today there is none between « Mon profil » and logout, keep that when `currentSpace` is absent by rendering the new separator inside the `currentSpace && …` fragment instead: `{currentSpace && (<><SpaceSwitcherMenuItems current={currentSpace} /><DropdownMenu.Separator className="my-1 h-px bg-border" /></>)}`.)

`Sidebar.tsx`: add `currentSpace?: SpaceKey;` to `SidebarProps` (import the type), destructure it, and pass `currentSpace={currentSpace}` to `<SidebarUserProfile …>`. Note `exactOptionalPropertyTypes`: pass it as `currentSpace={currentSpace}` only if `SidebarUserProfile`'s prop is declared `currentSpace?: SpaceKey | undefined`, or spread conditionally — declare both props as `currentSpace?: SpaceKey | undefined` to keep it simple.

- [ ] **Step 3: Set the current space in each shell**

- `SchoolSidebar.tsx` (~line 195, the `<Sidebar … roleLabel={t('roleLabel')} …>` call): add `currentSpace="school"`.
- `teacher/TeacherSidebar.tsx` (~line 99): add `currentSpace="teacher"`.
- `AdminSidebar.tsx`: untouched (no space switcher in the platform back-office).

- [ ] **Step 4: Student header**

In `frontend/src/app/(eleve)/eleve/layout.tsx`, import `SpaceSwitcherInline` and change the header from `justify-end` to `justify-between`, with the switcher on the left:

```tsx
      <header className="mb-4 flex items-center justify-between gap-2">
        <SpaceSwitcherInline current="student" />
        <Button …logout button unchanged… >
```

(When the account is mono-space — every real student — `SpaceSwitcherInline` renders `null` and `justify-between` pushes the logout button right, same as today.)

- [ ] **Step 5: Verify + commit**

```bash
pnpm typecheck && pnpm lint
```

Expected: PASS.

```bash
git add frontend/src/components/layout/SpaceSwitcher.tsx \
  frontend/src/components/layout/sidebar/SidebarUserProfile.tsx \
  frontend/src/components/layout/sidebar/Sidebar.tsx \
  frontend/src/components/layout/SchoolSidebar.tsx \
  frontend/src/components/layout/teacher/TeacherSidebar.tsx \
  "frontend/src/app/(eleve)/eleve/layout.tsx"
git commit --only <same paths> -m "feat(multi-espaces): Mes espaces switcher in the school, teacher and student shells"
```

---

### Task 8: Documentation, full gate, merge-time migration protocol

**Files:**
- Modify: `CLAUDE.md` (3 spots)
- No code changes.

- [ ] **Step 1: Update CLAUDE.md**

1. **Espace Enseignant paragraph** — the sentence « `resolveMySchool()` is deny-by-default for this case: a MEMBER-role account linked to a portal-only `Teacher` (checked via its internal `isPortalOnlyAccount()`) gets `null` back » must be amended: `isPortalOnlyAccount` no longer exists; the lock is the pure `isPortalLocked()` and, since multi-espaces (2026-09-01), a teacher-linked MEMBER whose staff-role grant union is non-empty is unlocked (double profile) while a student link always stays locked. Also note the timetable-GET refinement (the `emploiDuTemps.view` grant now gives a teacher-linked MEMBER the full-school view).
2. **Permission manager paragraph** — « optionally assigned to an `OrganizationMember` via `staffRoleId` (`onDelete: SetNull` …) » becomes the m2m story: `OrganizationMember.staffRoles StaffRole[]` (implicit m2m, migration `36_staff_role_members`), effective rights = union of all roles' grants (`resolveGrantsFor`), deleting a role only removes its join rows (members keep their other roles), `PATCH /api/school/members/[userId]` takes `{ staffRoleIds: string[] }` full-replace, and the Administrateurs tab's « Rôles » column is a checkbox popover (reuses `MultiSelect`) with an « Enseignant » info badge.
3. **New short paragraph "Multi-espaces"** (place it right after the Espace Enseignant paragraph): one account can hold several spaces (`resolveMySpaces()` in `lib/server/school.ts` → `spaces` on `GET /api/auth/me`); `isTeacherOnly` now means teacher-without-school-space; login routes 1 space directly, ≥2 to `/espaces?pref=` (chooser page at `frontend/src/app/espaces/page.tsx`), 0 to `/dashboard`; the « Mes espaces » switcher (`components/layout/SpaceSwitcher.tsx`) lives in the school/teacher sidebar user menu and the student header; i18n namespace `spaces` (37 total); spec at `docs/superpowers/specs/2026-09-01-multi-espaces-design.md`. Keep it dense, one paragraph, matching the file's voice.

- [ ] **Step 2: Full gate**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
```

Expected: all PASS (the doc-shape tripwires only assert the cron inventory / runtime=nodejs / no-legacy-backend — the new paragraphs are free-form).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit --only CLAUDE.md -m "docs: multi-espaces (spaces, grant-union multi-roles, portal unlock) in CLAUDE.md"
```

- [ ] **Step 4: MERGE-TIME PROTOCOL (main session, not a subagent — read fully before acting)**

The dev/test Neon DB is shared by the user's local dev server AND testing.schoolgesti.com. Old code breaks once the migration runs (it selects the dropped `staffRoleId`), and new code breaks until it runs. So the sequence is strict:

1. Merge the worktree branch into local `develop` (after final review), resolving conflicts if a concurrent session touched shared files — check the MAIN checkout for uncommitted changes in conflicted files first (recorded lesson).
2. From the MAIN checkout's `frontend/`, capture the pre-count, apply, and verify (scratchpad scripts using `@prisma/client` + `$queryRaw`):
   - pre: `SELECT COUNT(*) FROM "OrganizationMember" WHERE "staffRoleId" IS NOT NULL;`
   - apply: `pnpm exec prisma db execute --file prisma/migrations/36_staff_role_members/migration.sql --schema prisma/schema.prisma`
   - mark: `pnpm exec prisma migrate resolve --applied 36_staff_role_members`
   - post: `SELECT COUNT(*) FROM "_OrganizationMemberToStaffRole";` — must equal the pre-count.
   - regenerate: `pnpm exec prisma generate`
   - NEVER `migrate dev`, NEVER `migrate reset`, NEVER a real URL as shadow DB.
3. Tell the user to restart their dev server (`:3000` belongs to them — do not kill it yourself), because the running process holds the old Prisma client.
4. testing.schoolgesti.com stays on old code until the user pushes `develop`; its `vercel-build` runs `prisma migrate deploy`, which will see 36 already applied and no-op. Flag the brief window where the deployed testing app errors on member-role reads (between this apply and the next push+deploy) so the user can push promptly if it matters.
5. Do NOT push unless the user asks; when they do, keep `origin/testing` synced to `origin/develop` (standing rule).

- [ ] **Step 5: Manual E2E walkthrough (give it to the user; it doubles as their original role-testing request)**

1. Owner (`amosdorceus2023@gmail.com` / `TestEcole2026!`) → Paramètres › Administrateurs: the row for `carline.michel@lesetoiles.edu.ht` shows the « Rôles » popover + « Enseignant » badge → check the Comptable role (create it in `/settings/permissions` with `paiements.*` if it no longer exists).
2. Login as `carline.michel@lesetoiles.edu.ht` / `TeacherTest2026!` → lands on `/espaces` with 2 cards (teacher tab pre-selects Espace enseignant) → « Administration » → sidebar shows only the finance modules → user menu → « Mes espaces » → Espace enseignant → back.
3. Login as `comptable.test@example.com` / `ComptableTest2026!` (mono-space staff) → straight to `/dashboard`, no chooser, no switcher in the menu.
4. Uncheck all of Carline's roles → her next login goes straight to `/espace-enseignant` (lock restored).
5. 375px check of `/espaces` and the popover (pending human step, same as prior phases).

---

## Self-Review (done at plan time)

- **Spec coverage:** §2.1-2.7 → Tasks 1/2/3/6/7; §3 `resolveMySpaces` → Task 2; §4 unlock + timetable → Tasks 2/4; §5 → Task 3; §6 → Task 6; §7 → Task 7; §8 → Task 1; §9 → Task 5 (+ the documented `teacherBadge` deviation, Task 1); §10 → test steps of Tasks 1-4; §11 out of scope respected (no merged sidebar, no last-space memory, no staff invites).
- **Type consistency:** `MySpaces`/`spaces` shape `{ school, teacher, student }` used identically in Tasks 2, 3, 6, 7; `staffRoleIds: string[]` in Tasks 1 (API+UI); `SpaceKey` defined in Task 7 and locally in Task 6's page (page keeps its own copy to avoid importing a layout component into a route — acceptable duplication of a 3-literal union).
- **Known risk:** the shared-DB migration window — mitigated by the Task 8 protocol (author early, apply at merge).
