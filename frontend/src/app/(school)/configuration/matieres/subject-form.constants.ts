// Catalogs + copy for the subject form (add-matiere.md). Values are stored
// as free text on Subject (same convention as Class.level / Term.type), so
// a school's existing values outside these lists still round-trip.

export type SubjectStatus = 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
export type SubjectKind = 'REQUIRED' | 'ELECTIVE' | 'OPTIONAL';

export const SUBJECT_STATUS_OPTIONS: { value: SubjectStatus }[] = [
  { value: 'ACTIVE' },
  { value: 'DRAFT' },
  { value: 'ARCHIVED' },
];

export const SUBJECT_KIND_OPTIONS: { value: SubjectKind }[] = [
  { value: 'REQUIRED' },
  { value: 'ELECTIVE' },
  { value: 'OPTIONAL' },
];

// Base catalog for "Département / Filière" — merged at runtime with the
// domains already used by the school, plus an "Autre…" free-text escape.
export const SUBJECT_DOMAINS = [
  'Sciences',
  'Lettres & Langues',
  'Sciences humaines',
  'Arts',
  'Sport',
  'Technologie',
] as const;
export const OTHER_DOMAIN = '__other__';

export const EVALUATION_TYPES = [
  'Contrôle continu',
  'Examen final',
  'Contrôle continu + Examen final',
  'Projet',
  'Hybride',
] as const;

export const ROOM_TYPES = [
  'Salle de cours standard',
  'Amphithéâtre',
  'Laboratoire',
  'Salle informatique',
  'Gymnase',
  'Atelier',
  'Autre',
] as const;

export const ALL_LEVELS = 'Tous niveaux';

/**
 * "Code court unique (généré automatiquement)": first 3 letters of the name,
 * upper-cased and de-accented, then the next free 3-digit sequence among the
 * school's existing codes sharing that prefix (MAT-001, MAT-002, …).
 */
export function suggestSubjectCode(name: string, existingCodes: (string | null)[]): string {
  const prefix =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 3)
      .toUpperCase() || 'MAT';
  const taken = new Set(existingCodes.filter((c): c is string => !!c));
  for (let n = 1; n < 1000; n++) {
    const candidate = `${prefix}-${String(n).padStart(3, '0')}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${prefix}-${Date.now() % 1000}`;
}
