// Merged read model for the Personnel module (spec
// 2026-09-04-personnel-module-design.md §6.2/§6.3). `Teacher` and
// `OrganizationMember` stay two separate Prisma models (decision 7 of the
// design) — this module joins them by `userId` for the list/fiche only,
// nothing is written back here.
//
// Connective-membership nuance (not spelled out verbatim in the plan, but
// required by the existing multi-espaces plumbing — see CLAUDE.md's
// "Espace Enseignant" section): every teacher invited by email
// automatically gets an `OrganizationMember` row (role MEMBER, no
// StaffRole) purely so `resolveMySchool()`/`findMembership()` can resolve
// an organizationId for that account (see
// frontend/src/app/api/school/teachers/[id]/invite/route.ts,
// `createOrgMembership: true`). That connective row is NOT a second
// "profile" — spec §6.2 is explicit that the double badge only appears
// "avec un rôle staff" (with a staff role). A teacher only shows a second
// profile badge (ADMIN, or MEMBER with a real StaffRole) when the
// membership carries genuine access, matching the "double profil" already
// defined in CLAUDE.md's multi-espaces section (teacher-linked MEMBER
// unlocked only once the staff grant union is non-empty).
import 'server-only';
import { prisma } from '../prisma';
import type { TeacherDetail } from '@/app/(school)/enseignants/types';

export type PersonnelProfile = 'TEACHER' | 'ADMIN' | 'MEMBER';
export type PersonnelAccountStatus = 'NONE' | 'PENDING' | 'ACTIVE';
export type PersonnelLoginMode = 'EMAIL' | 'USERNAME' | 'BOTH' | null;

export interface PersonnelRow {
  id: string; // teacher.id if a Teacher profile exists, else user.id
  userId: string | null; // null when the teacher has no linked account yet
  name: string;
  avatarUrl: string | null;
  profiles: PersonnelProfile[]; // ADMIN/MEMBER = OrganizationMember.role (genuine access only)
  staffRoleNames: string[];
  accountStatus: PersonnelAccountStatus;
  loginMode: PersonnelLoginMode;
}

export interface PersonnelDetail extends PersonnelRow {
  email: string | null;
  username: string | null;
  phone: string | null;
  teacher: TeacherDetail | null;
  organizationMember: { role: 'ADMIN' | 'MEMBER'; staffRoleIds: string[] } | null;
}

export interface GetPersonnelListOpts {
  profile?: 'all' | 'teacher' | 'staff';
  q?: string;
}

interface BareUser {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  phone: string | null;
  avatarUrl: string | null;
  passwordHash: string | null;
}

interface MemberInfo {
  role: string;
  staffRoles: { id: string; name: string }[];
}

function accountStatusFor(
  user: Pick<BareUser, 'passwordHash' | 'username'>,
): PersonnelAccountStatus {
  // A pending email invite has neither a password (never set) nor a
  // username (email invites never assign one). Any account that has
  // either — an accepted invite's password, or a username-mode account
  // created active immediately — is ACTIVE.
  return !user.passwordHash && !user.username ? 'PENDING' : 'ACTIVE';
}

function loginModeFor(user: Pick<BareUser, 'email' | 'username'>): PersonnelLoginMode {
  if (user.email && user.username) return 'BOTH';
  if (user.email) return 'EMAIL';
  if (user.username) return 'USERNAME';
  return null;
}

/** Genuine profile badge for an OrganizationMember row — a connective
 * teacher-invite row (role MEMBER, no StaffRole) yields `null`. */
function genuineMemberProfile(member: MemberInfo): 'ADMIN' | 'MEMBER' | null {
  if (member.role === 'ADMIN') return 'ADMIN';
  if (member.staffRoles.length > 0) return 'MEMBER';
  return null;
}

interface InternalRow extends PersonnelRow {
  _searchText: string;
}

function toSearchText(name: string, user: BareUser | null): string {
  return [name, user?.email, user?.username].filter(Boolean).join(' ').toLowerCase();
}

async function loadRows(schoolId: string, organizationId: string): Promise<InternalRow[]> {
  const [teachers, members] = await Promise.all([
    prisma.teacher.findMany({
      where: { schoolId },
      select: { id: true, name: true, photoUrl: true, userId: true },
      orderBy: { name: 'asc' },
    }),
    prisma.organizationMember.findMany({
      where: { organizationId },
      select: {
        userId: true,
        role: true,
        staffRoles: { select: { id: true, name: true } },
      },
    }),
  ]);

  const teacherUserIds = teachers.map((t) => t.userId).filter((id): id is string => id != null);
  const memberUserIds = members.map((m) => m.userId);
  const userIds = Array.from(new Set([...teacherUserIds, ...memberUserIds]));

  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          phone: true,
          avatarUrl: true,
          passwordHash: true,
        },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const memberByUserId = new Map(members.map((m) => [m.userId, m]));

  const rows: InternalRow[] = [];
  const consumedUserIds = new Set<string>();

  for (const t of teachers) {
    if (!t.userId) {
      rows.push({
        id: t.id,
        userId: null,
        name: t.name,
        avatarUrl: t.photoUrl,
        profiles: ['TEACHER'],
        staffRoleNames: [],
        accountStatus: 'NONE',
        loginMode: null,
        _searchText: toSearchText(t.name, null),
      });
      continue;
    }
    consumedUserIds.add(t.userId);
    const user = userById.get(t.userId) ?? null;
    const member = memberByUserId.get(t.userId) ?? null;
    const profiles: PersonnelProfile[] = ['TEACHER'];
    let staffRoleNames: string[] = [];
    if (member) {
      const genuine = genuineMemberProfile(member);
      if (genuine) {
        profiles.push(genuine);
        if (genuine === 'MEMBER') staffRoleNames = member.staffRoles.map((r) => r.name);
      }
    }
    rows.push({
      id: t.id,
      userId: t.userId,
      name: t.name,
      avatarUrl: t.photoUrl ?? user?.avatarUrl ?? null,
      profiles,
      staffRoleNames,
      accountStatus: user ? accountStatusFor(user) : 'NONE',
      loginMode: user ? loginModeFor(user) : null,
      _searchText: toSearchText(t.name, user),
    });
  }

  for (const m of members) {
    if (consumedUserIds.has(m.userId)) continue; // already emitted as part of a teacher row
    const user = userById.get(m.userId) ?? null;
    const genuine = genuineMemberProfile(m);
    if (!genuine) continue; // an empty-grant MEMBER row with no Teacher is not a real person yet
    const name = user?.name ?? user?.email ?? user?.username ?? '';
    rows.push({
      id: user?.id ?? m.userId,
      userId: m.userId,
      name,
      avatarUrl: user?.avatarUrl ?? null,
      profiles: [genuine],
      staffRoleNames: genuine === 'MEMBER' ? m.staffRoles.map((r) => r.name) : [],
      accountStatus: user ? accountStatusFor(user) : 'NONE',
      loginMode: user ? loginModeFor(user) : null,
      _searchText: toSearchText(name, user),
    });
  }

  return rows;
}

export async function getPersonnelList(
  schoolId: string,
  organizationId: string,
  opts: GetPersonnelListOpts = {},
): Promise<PersonnelRow[]> {
  let rows = await loadRows(schoolId, organizationId);

  if (opts.profile === 'teacher') {
    rows = rows.filter((r) => r.profiles.includes('TEACHER'));
  } else if (opts.profile === 'staff') {
    rows = rows.filter((r) => r.profiles.includes('ADMIN') || r.profiles.includes('MEMBER'));
  }

  const q = opts.q?.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) => r._searchText.includes(q));
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));

  return rows.map(({ _searchText: _unused, ...row }) => row);
}

async function buildTeacherDetail(teacherId: string): Promise<TeacherDetail | null> {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: {
      classSubjects: {
        include: {
          subject: { select: { id: true, name: true } },
          class: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!teacher) return null;
  const { classSubjects, ...fields } = teacher;
  return {
    ...fields,
    subjects: [...new Map(classSubjects.map((cs) => [cs.subject.id, cs.subject])).values()],
    classes: [...new Map(classSubjects.map((cs) => [cs.class.id, cs.class])).values()],
    weeklyHours: classSubjects.reduce((sum, cs) => sum + (cs.weeklyHours ?? 0), 0),
    assignments: classSubjects.map((cs) => ({
      id: cs.id,
      subject: cs.subject,
      class: cs.class,
      weeklyHours: cs.weeklyHours,
      coefficient: cs.coefficient,
    })),
  } as unknown as TeacherDetail;
}

export async function getPersonnelDetail(
  schoolId: string,
  organizationId: string,
  id: string,
): Promise<PersonnelDetail | null> {
  // Row identifier resolution (spec §6.2): `id` is a Teacher.id if this
  // person has a teaching profile, else a User.id. Cuids are globally
  // unique so trying Teacher first is unambiguous.
  const teacher = await prisma.teacher.findUnique({ where: { id } });
  let userId: string | null;
  let teacherId: string | null;

  if (teacher && teacher.schoolId === schoolId) {
    userId = teacher.userId;
    teacherId = teacher.id;
  } else {
    if (teacher) return null; // teacher exists but belongs to another school
    // Fall back to a bare User.id — must be a genuine member of this org.
    const member = await prisma.organizationMember.findFirst({
      where: { userId: id, organizationId },
      select: { userId: true },
    });
    if (!member) return null;
    userId = member.userId;
    teacherId = null;
  }

  const [user, member] = await Promise.all([
    userId
      ? prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
            phone: true,
            avatarUrl: true,
            passwordHash: true,
          },
        })
      : Promise.resolve(null),
    userId
      ? prisma.organizationMember.findFirst({
          where: { userId, organizationId },
          select: { role: true, staffRoles: { select: { id: true, name: true } } },
        })
      : Promise.resolve(null),
  ]);

  const teacherDetail = teacherId ? await buildTeacherDetail(teacherId) : null;
  if (teacherId && !teacherDetail) return null;

  const profiles: PersonnelProfile[] = [];
  let staffRoleNames: string[] = [];
  let organizationMember: PersonnelDetail['organizationMember'] = null;
  if (teacherDetail) profiles.push('TEACHER');
  if (member) {
    const genuine = genuineMemberProfile(member);
    if (genuine) {
      profiles.push(genuine);
      const staffRoleIds = member.staffRoles.map((r) => r.id);
      organizationMember = { role: genuine, staffRoleIds };
      if (genuine === 'MEMBER') staffRoleNames = member.staffRoles.map((r) => r.name);
    }
  }

  const name = teacherDetail?.name ?? user?.name ?? user?.email ?? user?.username ?? '';

  return {
    id: teacherId ?? userId ?? id,
    userId,
    name,
    avatarUrl: teacherDetail?.photoUrl ?? user?.avatarUrl ?? null,
    profiles,
    staffRoleNames,
    accountStatus: user ? accountStatusFor(user) : 'NONE',
    loginMode: user ? loginModeFor(user) : null,
    email: user?.email ?? null,
    username: user?.username ?? null,
    phone: teacherDetail?.phone ?? user?.phone ?? null,
    teacher: teacherDetail,
    organizationMember,
  };
}
