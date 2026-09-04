// Local types for the Personnel fiche (/personnel/[id]) — kept in this
// folder rather than added to the sibling `../types.ts` (Task 4's list
// read-model mirror) since this route consumes a different endpoint
// (GET /api/school/personnel/[id], detail — not the list).
import type { TeacherDetail } from '../../enseignants/types';
import type { PersonnelAccountStatus, PersonnelLoginMode, PersonnelProfile } from '../types';

// GET /api/school/teachers/[id] returns these fields alongside everything
// TeacherDetail already declares (Espace Enseignant invite state) — same
// page-local extension the old /enseignants/[id] fiche used, copied as-is
// since the endpoint and its response shape are unchanged (spec §7).
export interface TeacherWithAccess extends TeacherDetail {
  userId: string | null;
  emailVerifiedAt: string | null;
  userCreatedAt: string | null;
  updatedAt: string;
}

// Client-safe mirror of PersonnelDetail
// (frontend/src/lib/server/personnel/view.ts, server-only). Keep in sync by
// hand if that shape changes.
export interface PersonnelDetail {
  id: string;
  userId: string | null;
  name: string;
  avatarUrl: string | null;
  profiles: PersonnelProfile[];
  staffRoleNames: string[];
  accountStatus: PersonnelAccountStatus;
  loginMode: PersonnelLoginMode;
  email: string | null;
  username: string | null;
  phone: string | null;
  teacher: TeacherDetail | null;
  organizationMember: { role: 'ADMIN' | 'MEMBER'; staffRoleIds: string[] } | null;
}

// GET /api/school/personnel/[id]'s full response — `canManageAccount`
// mirrors the route's own (server-side) authorization decision for the
// Compte tab. It must be read from here rather than re-derived from
// `personnel.organizationMember`: a non-ADMIN+ caller never sees the real
// `organizationMember` for a genuine staff person (nulled server-side), so
// inferring "no staff profile" from "organizationMember is null" would
// wrongly re-grant Compte access for exactly the double-profile case the
// masking exists to protect.
export interface PersonnelDetailResponse {
  personnel: PersonnelDetail;
  canManageAccount: boolean;
}
