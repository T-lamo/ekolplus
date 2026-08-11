export interface SchoolData {
  id: string;
  name: string;
  shortName: string | null;
  country: string;
  city: string;
  schoolType: string;
  primaryLanguage: string | null;
  address: string | null;
  phone: string | null;
  estimatedStudents: number | null;
  officialCode: string | null;
  officialEmail: string | null;
  website: string | null;
}

export interface TermData {
  id: string;
  label: string;
  order: number;
  startDate: string;
  endDate: string;
  status: 'DONE' | 'CURRENT' | 'UPCOMING';
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
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  joinedAt: string;
}

export interface SchoolResponse {
  school: SchoolData;
  academicYear: AcademicYearData | null;
  members: MemberData[];
}
