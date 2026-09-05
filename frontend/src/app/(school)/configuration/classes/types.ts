export interface ClassData {
  id: string;
  name: string;
  level: string;
  room: string | null;
  /** Salle du catalogue (configuration/salles) — null = lieu libre / aucune. */
  roomId: string | null;
  capacity: number | null;
  /** Couleur d'identification (#rrggbb) — fiche classe (add-class.md). */
  color: string | null;
  /** Filière / Série (texte libre, optionnel). */
  track: string | null;
  homeroomTeacher: { id: string; name: string } | null;
  subjectCount: number;
  /** Inscriptions de l'année active (`_count.enrollments` côté API). */
  studentCount: number;
}

/** GET /api/school/classes/[id] — one payload for the fiche classe. */
export interface ClassDetail extends Omit<ClassData, 'homeroomTeacher'> {
  homeroomTeacher: { id: string; name: string; photoUrl: string | null } | null;
  academicYear: { id: string; label: string } | null;
  subjectIds: string[];
  /** Pivots that already carry evaluations — the checkbox is locked. */
  lockedSubjectIds: string[];
  classSubjectIdBySubject: Record<string, string>;
  /** Pivot detail — « Détail des matières » table of the fiche classe. */
  classSubjects: ClassSubjectDetail[];
}

export interface ClassSubjectDetail {
  id: string;
  subjectId: string;
  teacherId: string | null;
  coefficient: number | null;
  weeklyHours: number | null;
  locked: boolean;
}

/** Row of GET /api/school/grade-levels — the school's ordered catalog. */
export interface GradeLevelRow {
  id: string;
  name: string;
  order: number;
  /** Assigned bulletin template (school's own or global) — null = the
   * school's default template applies (spec 2026-09-05 §8). */
  bulletinTemplateId: string | null;
}
