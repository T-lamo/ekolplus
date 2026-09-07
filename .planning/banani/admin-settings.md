# Admin Settings (onglet Administrateurs) — Banani → Next.js 16 / Tailwind v4

## Source
- Banani screen ID: `rvtF-BUdU2om` ("Admin Settings", flow `2oB_n5kLBeuy`)
- Fetched: 2026-09-04
- Theme returned: "SchoolGesti Calm" (#2563EB) — the HTML itself carries a violet mock palette (#6C63FF); both are ignored, the app's `@theme` tokens win.

## System answers (Step 0)
1. **Route**: `/settings?tab=admins` → `app/(school)/settings/AdministrateursTab.tsx` (school shell, `Tabs`). Page container is `max-w-4xl`.
2. **Auth**: any school member sees the tab (page-level `useSchoolUser`). Mutations are org-role gated (`hasMinRole('ADMIN')`, NOT grants — spec multi-espaces §8, RBAC tripwire whitelists `members/`). Role promotion/demotion = OWNER only.
3. **Reads**: `GET /api/school` → `members: MemberData[]` (`userId, email, name, role, staffRoleIds, isTeacher, joinedAt`). Extended here with `avatarUrl` (`User.avatarUrl`) and `status: 'ACTIVE' | 'INVITED'` (`passwordHash == null && emailVerifiedAt == null` = invitation never accepted; OAuth users have no password but a verified email, so they stay ACTIVE). `GET /api/school/roles` (ADMIN+ only) for the staff-role picker.
4. **Writes**:
   - `PATCH /api/school/members/[userId]` — existing `{ staffRoleIds }` full-replace; extended with optional `{ role: 'ADMIN' | 'MEMBER' }` (OWNER only, target never the OWNER; promoting to ADMIN clears staff roles since ADMIN = full access).
   - `POST /api/school/members` — **new**, invite by email `{ email, role, staffRoleIds? }` → `createPortalInvite` (`inviteType: 'STAFF_INVITE'`, membership created in the same tx, role + staff roles applied through `linkExisting`), 7-day code, outbox email `email.portal_invite` (`acceptPath: '/definir-mot-de-passe?portal=staff'`). 409 `EMAIL_ALREADY_IN_USE` / `ALREADY_MEMBER`.
   - `POST /api/school/members/[userId]/invite` — **new**, resend (pending members only; invalidates the previous STAFF_INVITE code, same resend path as teachers).
   - `DELETE /api/school/members/[userId]` — **new**, remove access: never the OWNER (400 `CANNOT_REMOVE_OWNER`), never yourself (400 `CANNOT_REMOVE_SELF`), an ADMIN cannot remove another ADMIN (403), a teacher-linked member cannot be removed here (409 `MEMBER_IS_TEACHER` — the teacher portal needs the membership, see `resolveMySpaces`; the fiche enseignant owns that lifecycle). Deletes the membership and marks pending STAFF_INVITE codes used.
   - Accept: `POST /api/auth/teacher-invite/accept` now consumes `TEACHER_INVITE` **or** `STAFF_INVITE` codes (one filter change; route name kept, documented). `/definir-mot-de-passe?portal=staff` shows the staff subtitle and routes by `spaces` after acceptance (same rule as login).
5. **Navigation**: header button « Inviter un membre » and the bottom invite card both open `InviteMemberModal`; footer link « Gérer les rôles et permissions » → `/settings/permissions` (exists). After invite/remove/role change → `refresh()` of `/api/school` (page passes `onChanged`).
6. **Reuse**: `Card`, `Avatar` (initials fallback, real `avatarUrl` when set), `Badge`, `Button`, `Modal`, `Field`, `Select`, `MultiSelect`, `ActionMenu` (kebab), `useConfirm`, `useToast`, `roleLabel`.
7. **States**: loading handled by the page (skeleton); empty list impossible (the OWNER is always there); pending invite row = warning badge « Invitation en attente » + « Renvoyer »; errors → toast with `ApiError.message` / stable codes mapped to translated messages.
8. **Side effects**: invite email through the outbox (drained by cron in prod, `pnpm dev:drain-emails` locally); toasts; no admin audit (school-level action, not back-office).

## Structure map
- **Section card** (`.section-card`): header (title 15/700 + desc 13 muted, primary button « Inviter un membre » with `user-plus`) → `Card` + header row; button ADMIN+ only.
- **Rows** (`.admin-row`, grid `1fr 180px 280px 100px`, 16/24 padding, divider): identity (avatar 38 + name 14/600 + email 12 muted, truncated) · type column (pill « Directeur / Directrice » secondary or « Membre » muted + « Depuis le … » 11 muted) · roles column (label RÔLES 10/700 uppercase + « Accès complet » or role multi-select with tags + chevron) · actions (trash ghost destructive + ⋯ ghost).
- **Footer link row** (`.permissions-link-row`): shield-check + « Gérer les rôles et permissions » + arrow-right, primary 13.5/600, border-top.
- **Invite card** (`.invite-card`): dashed border, muted background, title 14/600 + desc 13 muted, primary button « Envoyer une invitation » with `send`.

## Component breakdown
- **REWRITE** `AdministrateursTab.tsx` — the four blocks above; props `members`, `myRole`, `myUserId`, `onChanged`.
- **NEW** `InviteMemberModal.tsx` (settings folder) — email + org role (Administrateur | Membre) + staff roles picker (MEMBER only), POST, toast, close → `onChanged`.
- **REUSE** `ActionMenu` for the ⋯ menu: « Renvoyer l'invitation » (INVITED), « Promouvoir administrateur » / « Rétrograder en membre » (OWNER only, target ≠ OWNER), « Retirer l'accès » (danger, same rule as the trash).
- **REUSE** `Badge` tones: OWNER → `primary`, ADMIN → `primary`, MEMBER → `muted`, INVITED → `warning`; teacher badge stays `bg-info` (existing).

## Token mapping (Banani → project)
| Banani | Project |
|---|---|
| `--primary #6C63FF` / theme `#2563EB` | `text-primary` / `bg-primary` (`@theme`, themed per user) |
| `--secondary #EEF0FF` | `bg-secondary` / `text-secondary-foreground` |
| `--muted #F1F3F8`, `--muted-foreground #8A8FA8` | `bg-muted`, `text-muted-foreground` |
| `--destructive-foreground #DC2626` | `text-destructive-foreground` |
| `--border #E8EAF0` | `border-border` |
| `--radius-lg 12px` (card) | `Card` (`rounded-2xl`, app convention) |
| `--radius-md 8px` (buttons) | `rounded-md` |
| avatar photo 38px | `Avatar size={38}` (`src` = `avatarUrl`) |

## Tailwind translation notes
- `.admin-row` grid → mobile stacked (`grid gap-3`), `lg:grid-cols-[minmax(0,1fr)_150px_230px_84px] lg:items-center lg:gap-4` (mock 180/280/100 scaled to the 896px container).
- `padding: 16px 24px` → `px-5 py-4` (app rows use 20px horizontal, kept consistent with the other tabs).
- `.badge-type` → `Badge` (`rounded-full px-2.5 py-0.5 text-2xs font-semibold`).
- `.roles-label` → `text-2xs font-semibold tracking-wide text-muted-foreground uppercase` (existing).
- `.invite-card` → `rounded-2xl border border-dashed border-border bg-muted px-5 py-4`.
- No inline styles; icons from `lucide-react` (`UserPlus`, `Send`, `ShieldCheck`, `ArrowRight`, `Trash2`, `MoreHorizontal` via `ActionMenu`).

## Responsive plan
- **Base (375px)**: every row stacks: identity line, then type badge + since, then the roles block full width, then the actions right-aligned; header stacks title/desc above a full-width « Inviter un membre »; invite card stacks text above a full-width button.
- **sm (640px+)**: header becomes a row (button `w-fit`), invite card becomes a row.
- **lg (1024px+)**: the 4-column grid of the mock; actions right-aligned in their column.
- Touch targets: trash/kebab 28px visual inside a 44px hit area on mobile (`h-9 w-9` on base, `lg:h-7 lg:w-7`).

## Interactions / state
- Role picker: optimistic update + rollback on error (existing behaviour kept).
- Remove: `useConfirm` danger dialog (name/email in the body) → DELETE → toast → `onChanged`.
- Promote/demote: confirm → PATCH `{ role }` → toast → `onChanged`.
- Resend: POST → toast « Invitation renvoyée ».
- Invite modal: email required (type=email), role select, staff roles multi-select shown only for Membre; submit disabled while sending; server codes mapped: `EMAIL_ALREADY_IN_USE`, `ALREADY_MEMBER`, `VALIDATION_FAILED`.
- Keyboard: Radix menu/modal handle focus; buttons have `aria-label`s.

## Copy / i18n
`Settings.administrateurs.*` (fr/ht/en, ht `_review`): `inviteButton`, `inviteCard.title/description/cta`, `status.invited`, `you`, `actions.{resend, promote, demote, remove, resent, promoted, demoted, removed, cannotRemoveTeacher, removeTitle, removeBody, promoteTitle, promoteBody, demoteTitle, demoteBody}`, `modal.{title, subtitle, emailLabel, emailPlaceholder, roleLabel, roleAdmin, roleAdminHint, roleMember, roleMemberHint, staffRolesLabel, staffRolesHint, submit, submitting, sent, errors.EMAIL_ALREADY_IN_USE, errors.ALREADY_MEMBER}`; `SetPassword.subtitleStaff`. Existing `Permissions.adminsTab.*` keys kept for the roles column.

## Implementation checklist
- [x] API: members payload (`avatarUrl`, `status`), POST invite, POST resend, PATCH role, DELETE, accept-route type, `portalInviteUrl` query support, set-password page portal param — with tests
- [x] `InviteMemberModal` + `AdministrateursTab` rewrite (mobile-first)
- [x] i18n fr/ht/en
- [x] 375 / 768 / 1280 checks in the browser (Puppeteer, port 3001 worktree or 3000)
- [x] Real invite sent (E2E on a twin worktree server, port 3001; accept page checked for copy, not submitted) from the UI (outbox row + drained email in dev), accept flow on `/definir-mot-de-passe?portal=staff`
- [x] `pnpm format && lint && typecheck && test`

## Open questions for user (decided by default, veto welcome)
- Only the OWNER can promote to / demote from Administrateur; an ADMIN invites Membres only (an ADMIN inviting another ADMIN is refused with 403). — assumption
- A teacher-linked member is never removable from this tab (their membership is what opens the teacher portal); the fiche enseignant remains the place to revoke a teacher. — assumption
- No « transférer la direction » action (not in the mock, not requested). — assumption
