export type TeacherStatus = 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';

export interface TeacherListItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
  status: TeacherStatus;
  isActive: boolean;
  subjects: { id: string; name: string }[];
  classes: { id: string; name: string }[];
  weeklyHours: number;
}

/** Full profile served by GET /api/school/teachers/[id] — the Add/Edit
 * Teacher page's shape (add-teacher.md). */
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
}
