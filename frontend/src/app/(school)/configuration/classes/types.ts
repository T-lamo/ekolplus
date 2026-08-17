export interface ClassData {
  id: string;
  name: string;
  level: string;
  room: string | null;
  capacity: number | null;
  homeroomTeacher: { id: string; name: string } | null;
  subjectCount: number;
  /** Inscriptions de l'année active (`_count.enrollments` côté API). */
  studentCount: number;
}
