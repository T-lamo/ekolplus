import type { SubjectKind, SubjectStatus } from './subject-form.constants';

/** Profile fields shared by the list rows, the detail payload and the form. */
export interface SubjectProfile {
  id: string;
  name: string;
  code: string | null;
  domain: string | null;
  isActive: boolean;
  status: SubjectStatus;
  abbreviation: string | null;
  level: string | null;
  kind: SubjectKind;
  description: string | null;
  defaultCoefficient: number | null;
  maxScore: number;
  passingScore: number;
  totalHours: number | null;
  hoursCM: number | null;
  hoursTD: number | null;
  hoursTP: number | null;
  evaluationType: string | null;
  maxCapacity: number | null;
  includeInAverage: boolean;
  showOnBulletin: boolean;
  room: string | null;
  eliminatoryScore: number | null;
  icon: string | null;
  color: string | null;
  responsibleTeacherId: string | null;
}

/** Row shape of GET /api/school/subjects (list + pickers). */
export interface SubjectData extends SubjectProfile {
  classes: { id: string; name: string }[];
  teacherNames: string[];
  coefficients: number[];
}

export interface SubjectClassAssignment {
  id: string;
  classId: string;
  teacherId: string | null;
  coefficient: number | null;
  weeklyHours: number | null;
  class: {
    id: string;
    name: string;
    level: string;
    studentCount: number;
    isHomeroomTeacher: boolean;
  };
  teacher: { id: string; name: string; photoUrl: string | null } | null;
}

export interface SubjectTeacherAvailability {
  id: string;
  name: string;
  photoUrl: string | null;
  classCount: number;
  weeklyHoursTotal: number;
  weeklyHoursTarget: number | null;
  status: 'AVAILABLE' | 'BUSY';
}

/** GET /api/school/subjects/[id] — one payload for every tab. */
export interface SubjectDetail extends SubjectProfile {
  responsibleTeacher: { id: string; name: string; photoUrl: string | null } | null;
  prerequisites: { id: string; name: string; code: string | null }[];
  prerequisiteIds: string[];
  chapterCount: number;
  activeYear: { id: string; label: string } | null;
  classSubjects: SubjectClassAssignment[];
  unassignedClasses: { id: string; name: string; level: string; studentCount: number }[];
  teachers: SubjectTeacherAvailability[];
}

export interface TermData {
  id: string;
  label: string;
  order: number;
  startDate: string;
  endDate: string;
  type: string;
}

export interface ChapterData {
  id: string;
  subjectId: string;
  termId: string;
  order: number;
  title: string;
  objectives: string | null;
  hours: number | null;
  reference: string | null;
  competence: string | null;
}
