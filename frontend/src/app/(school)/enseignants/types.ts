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

/** One ClassSubject row as returned by GET /api/school/teachers/[id] —
 * feeds the teacher profile's Matières & Classes tab. */
export interface TeacherAssignment {
  id: string;
  subject: { id: string; name: string };
  class: { id: string; name: string };
  weeklyHours: number | null;
  coefficient: number | null;
}

/** Full profile served by GET /api/school/teachers/[id] — consumed by the
 * teacher wizard modal and the profile page. */
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
  assignments: TeacherAssignment[];
}
