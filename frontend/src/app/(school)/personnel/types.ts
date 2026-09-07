// Client-safe mirror of the merged read model served by
// GET /api/school/personnel (frontend/src/lib/server/personnel/view.ts).
// That server module is guarded by `import 'server-only'`, so its types
// can't be imported directly from a client component — every other screen
// in this app follows the same split (see enseignants/types.ts, which the
// server module itself imports FROM rather than the other way around).
// Keep this in sync by hand with `PersonnelRow` if the API response shape
// changes.
export type PersonnelProfile = 'TEACHER' | 'ADMIN' | 'MEMBER';
export type PersonnelAccountStatus = 'NONE' | 'PENDING' | 'ACTIVE';
export type PersonnelLoginMode = 'EMAIL' | 'USERNAME' | 'BOTH' | null;

export interface PersonnelRow {
  id: string; // teacher.id if this person has a Teacher profile, else user.id
  userId: string | null;
  name: string;
  avatarUrl: string | null;
  profiles: PersonnelProfile[];
  staffRoleNames: string[];
  accountStatus: PersonnelAccountStatus;
  loginMode: PersonnelLoginMode;
}

export interface PersonnelListResponse {
  items: PersonnelRow[];
  total: number;
  page: number;
  pageSize: number;
}

export type PersonnelProfileFilter = 'all' | 'teacher' | 'staff';
