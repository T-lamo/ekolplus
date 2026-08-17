export interface ClassData {
  id: string;
  name: string;
  level: string;
  room: string | null;
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
}

/** Row of GET /api/school/grade-levels — the school's ordered catalog. */
export interface GradeLevelRow {
  id: string;
  name: string;
  order: number;
}
