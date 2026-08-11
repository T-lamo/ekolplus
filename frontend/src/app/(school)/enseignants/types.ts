export type TeacherStatus = 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';

export interface TeacherListItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: TeacherStatus;
  isActive: boolean;
  subjects: { id: string; name: string }[];
  classes: { id: string; name: string }[];
  weeklyHours: number;
}
