export interface SchoolData {
  id: string;
  name: string;
  shortName: string | null;
  country: string;
  city: string;
  schoolType: string;
  statute: string | null;
  primaryLanguage: string | null;
  address: string | null;
  phone: string | null;
  estimatedStudents: number | null;
  officialCode: string | null;
  officialEmail: string | null;
  website: string | null;
  logoUrl: string | null;
}

export interface TermData {
  id: string;
  label: string;
  order: number;
  startDate: string;
  endDate: string;
  status: 'DONE' | 'CURRENT' | 'UPCOMING';
  type: 'TRIMESTRE' | 'SEMESTRE' | 'LIBRE';
  gradeEntryEnabled: boolean;
}

export interface AcademicYearData {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  gradingScale: string | null;
  terms: TermData[];
}

export interface MemberData {
  userId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  /** INVITED = invitation sent, account never activated (no password, no verified email). */
  status: 'ACTIVE' | 'INVITED';
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  staffRoleIds: string[];
  isTeacher: boolean;
  joinedAt: string;
}

export interface SchoolResponse {
  school: SchoolData;
  academicYear: AcademicYearData | null;
  members: MemberData[];
}
