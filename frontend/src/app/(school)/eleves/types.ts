export type StudentStatus = 'ENROLLED' | 'REPEATED_ABSENCES' | 'SUSPENDED';

export interface StudentListItem {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  status: StudentStatus;
  class: { id: string; name: string } | null;
  guardianCount: number;
}

export interface GuardianData {
  id?: string;
  name: string;
  relationship: string;
  phone: string | null;
  email: string | null;
  profession: string | null;
  isPrimary: boolean;
}

export interface StudentDetail {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  placeOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
  address: string | null;
  enrolledAt: string;
  status: StudentStatus;
  guardians: GuardianData[];
  class: { id: string; name: string } | null;
  homeroomTeacher: { id: string; name: string } | null;
}

export interface ClassOption {
  id: string;
  name: string;
}
