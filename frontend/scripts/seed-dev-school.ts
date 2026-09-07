// Dev dataset seed — rebuilds a complete, realistic school (École Les Étoiles)
// so every screen of the app has data to show: users, school + owner,
// academic year + 3 terms, grade levels, 14 subjects, 11 teachers, 7 classes,
// class↔subject assignments, 42 students + guardians + enrollments,
// evaluations + grades, appreciations, attendance, fee structures + payments,
// an active bulletin template, a SaaS subscription with billing history,
// login events and a timetable for the current weeks. A second, empty school
// (Haitian education and leadership programe) is created for the second
// real account. Logins are the ones documented in `CREDENTIALS.local.md`.
//
// Usage: pnpm seed:dev-school            (skips the dataset if the school exists)
//        pnpm seed:dev-school -- --reset (deletes both seeded schools first)
//
// Written after the 2026-08-17 dev-DB wipe: the previous data was entered by
// hand and could not be restored, so this script is the new baseline —
// re-run it whenever the dev DB needs a fresh, known state.
//
// Deterministic: a seeded PRNG drives every random choice, so two runs on the
// same day produce the same rows. Dates are relative to "now" (school year =
// Sept → Aug containing today, 3rd term stretched to Aug 31 so a term is
// always in progress while testing) — the dataset stays fresh whenever it is
// re-seeded. Refuses to run with NODE_ENV=production.
//
// Same `main(args, deps)` shape as seed-dev.ts so tests can inject a mocked
// PrismaClient; the users / plans / global bulletin templates are delegated to
// the existing seed scripts (imported, not duplicated).

import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { main as seedDevUsers } from './seed-dev';
import { main as seedPlans } from './seed-subscription-plans';
import { main as seedBulletinTemplates } from './seed-bulletin-templates';

// ─── Accounts (mirrors CREDENTIALS.local.md — dev only, never prod) ────────
const OWNER_PASSWORD = 'TestEcole2026!';
// Teacher portal test account (Espace Enseignant) — Mme Michel (key: 'michel'
// in TEACHERS below) gets a real, already-active login so local testing
// doesn't require going through the invite/accept-code flow each time.
const TEACHER_PASSWORD = 'TeacherTest2026!';
const STUDENT_PASSWORD = 'StudentTest2026!';
// Personnel module test account (secrétariat) — a username-only staff
// login (no email), the account shape POST /api/school/personnel's
// username-mode branch produces: User.username/passwordHash set,
// User.email left null, an OrganizationMember role MEMBER holding a
// StaffRole. Manual QA account for the no-email login path (Task 9,
// 2026-09-04 Personnel module spec).
const SECRETARIAT_USERNAME = 'secretaire.demo';
const SECRETARIAT_PASSWORD = 'SecretaireTest2026!';
export const ETOILES = {
  // Same id as before the wipe so bookmarks / notes keep pointing at it.
  schoolId: 'cmsovzjgv00059xpfilkr2lyh',
  slug: 'ecole-les-etoiles',
  name: 'École Les Étoiles',
  shortName: 'Les Étoiles',
  ownerEmail: 'amosdorceus2023@gmail.com',
  ownerName: 'Amos Dorceus',
} as const;
export const HELP = {
  slug: 'haitian-education-and-leadership-programe',
  name: 'Haitian education and leadership programe',
  shortName: 'HELP',
  ownerEmail: 'amosdorceus2010@gmail.com',
  ownerName: 'Amos Dorceus',
} as const;

// ─── Deterministic PRNG (mulberry32) ───────────────────────────────────────
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260817);
const int = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));
const chance = (p: number): boolean => rand() < p;
function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`index ${i} out of range`);
  return v;
}
const pick = <T>(arr: readonly T[]): T => at(arr, Math.floor(rand() * arr.length));
// Box-Muller, mean 0.
function gauss(sd: number): number {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd;
}
const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

// ─── Dates (UTC-midnight everywhere, matching Attendance/TimetableSession) ──
const DAY_MS = 86_400_000;
const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY_MS);
const startOfUtcDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
// Monday of the ISO week containing `d`.
function mondayOf(d: Date): Date {
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return addDays(startOfUtcDay(d), 1 - day);
}
const isWeekday = (d: Date): boolean => d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
const yyyymmdd = (d: Date): string => d.toISOString().slice(0, 10).replace(/-/g, '');

// School year Sept → Aug containing `now`; 3rd term stretched to Aug 31 (see
// header). Exported for the companion test.
export function schoolCalendar(now: Date): {
  label: string;
  start: Date;
  end: Date;
  terms: { label: string; order: number; start: Date; end: Date }[];
} {
  const y = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return {
    label: `${y}-${y + 1}`,
    start: utc(y, 9, 1),
    end: utc(y + 1, 8, 31),
    terms: [
      { label: '1er Trimestre', order: 1, start: utc(y, 9, 1), end: utc(y, 12, 19) },
      { label: '2e Trimestre', order: 2, start: utc(y + 1, 1, 5), end: utc(y + 1, 4, 3) },
      { label: '3e Trimestre', order: 3, start: utc(y + 1, 4, 13), end: utc(y + 1, 8, 31) },
    ],
  };
}

// ─── Catalogs ──────────────────────────────────────────────────────────────
const LEVELS = ['6ème', '5ème', '4ème', '3ème', 'Seconde', 'Première', 'Terminale'] as const;
export type Level = (typeof LEVELS)[number];
const COLLEGE: readonly Level[] = ['6ème', '5ème', '4ème', '3ème'];

export interface SubjectSeed {
  key: string;
  name: string;
  code: string;
  abbreviation: string;
  domain: string;
  icon: string;
  color: string;
  coefficient: number;
  kind: 'REQUIRED' | 'ELECTIVE' | 'OPTIONAL';
  hours: number; // weekly hours in a class
  levels: readonly Level[]; // which classes take it
  teacher: string; // teacher key
  room?:
    | 'Laboratoire de physique-chimie'
    | 'Laboratoire de SVT'
    | 'Salle informatique'
    | 'Terrain de sport'
    | 'Salle des arts';
  type?: 'TD' | 'TP';
  description: string;
}
export const SUBJECTS: SubjectSeed[] = [
  {
    key: 'math',
    name: 'Mathématiques',
    code: 'MATH',
    abbreviation: 'MATH',
    domain: 'Sciences',
    icon: 'calculator',
    color: '#2563eb',
    coefficient: 4,
    kind: 'REQUIRED',
    hours: 5,
    levels: LEVELS,
    teacher: 'pierre-louis',
    description: 'Algèbre, géométrie, analyse et statistiques selon le programme national.',
  },
  {
    key: 'fr',
    name: 'Français',
    code: 'FR',
    abbreviation: 'FR',
    domain: 'Lettres & Langues',
    icon: 'book',
    color: '#c2185b',
    coefficient: 4,
    kind: 'REQUIRED',
    hours: 5,
    levels: LEVELS,
    teacher: 'dorcelus',
    description: 'Grammaire, expression écrite et orale, littérature francophone.',
  },
  {
    key: 'ang',
    name: 'Anglais',
    code: 'ANG',
    abbreviation: 'ANG',
    domain: 'Lettres & Langues',
    icon: 'globe',
    color: '#1976d2',
    coefficient: 2,
    kind: 'REQUIRED',
    hours: 3,
    levels: LEVELS,
    teacher: 'bellegarde',
    description: 'Compréhension, expression et communication en anglais.',
  },
  {
    key: 'esp',
    name: 'Espagnol',
    code: 'ESP',
    abbreviation: 'ESP',
    domain: 'Lettres & Langues',
    icon: 'languages',
    color: '#f59e0b',
    coefficient: 2,
    kind: 'ELECTIVE',
    hours: 2,
    levels: ['4ème', '3ème', 'Seconde', 'Première', 'Terminale'],
    teacher: 'saint-vil',
    description: 'Deuxième langue vivante — bases de communication et culture hispanophone.',
  },
  {
    key: 'creole',
    name: 'Créole',
    code: 'CRE',
    abbreviation: 'CRE',
    domain: 'Lettres & Langues',
    icon: 'languages',
    color: '#00897b',
    coefficient: 2,
    kind: 'REQUIRED',
    hours: 2,
    levels: COLLEGE,
    teacher: 'michel',
    description: 'Lecture, écriture et littérature en créole haïtien.',
  },
  {
    key: 'pc',
    name: 'Sciences physiques',
    code: 'PC',
    abbreviation: 'PC',
    domain: 'Sciences',
    icon: 'atom',
    color: '#7c3aed',
    coefficient: 3,
    kind: 'REQUIRED',
    hours: 3,
    levels: ['5ème', '4ème', '3ème', 'Seconde', 'Première', 'Terminale'],
    teacher: 'etienne',
    room: 'Laboratoire de physique-chimie',
    type: 'TP',
    description: 'Physique et chimie : mécanique, électricité, réactions chimiques.',
  },
  {
    key: 'svt',
    name: 'Sciences de la vie et de la terre',
    code: 'SVT',
    abbreviation: 'SVT',
    domain: 'Sciences',
    icon: 'flask-conical',
    color: '#388e3c',
    coefficient: 3,
    kind: 'REQUIRED',
    hours: 3,
    levels: LEVELS,
    teacher: 'joseph',
    room: 'Laboratoire de SVT',
    type: 'TP',
    description: 'Biologie, géologie et éducation à la santé et à l’environnement.',
  },
  {
    key: 'hg',
    name: 'Histoire-Géographie',
    code: 'HG',
    abbreviation: 'HG',
    domain: 'Sciences humaines',
    icon: 'landmark',
    color: '#e65100',
    coefficient: 3,
    kind: 'REQUIRED',
    hours: 3,
    levels: LEVELS,
    teacher: 'toussaint',
    description: 'Histoire d’Haïti et du monde, géographie physique et humaine.',
  },
  {
    key: 'info',
    name: 'Informatique',
    code: 'INFO',
    abbreviation: 'INFO',
    domain: 'Technologie',
    icon: 'monitor',
    color: '#455a64',
    coefficient: 1,
    kind: 'REQUIRED',
    hours: 1,
    levels: LEVELS,
    teacher: 'saint-vil',
    room: 'Salle informatique',
    type: 'TP',
    description: 'Bureautique, algorithmique et culture numérique.',
  },
  {
    key: 'eps',
    name: 'Éducation physique et sportive',
    code: 'EPS',
    abbreviation: 'EPS',
    domain: 'Sport',
    icon: 'dumbbell',
    color: '#00897b',
    coefficient: 1,
    kind: 'REQUIRED',
    hours: 2,
    levels: LEVELS,
    teacher: 'desir',
    room: 'Terrain de sport',
    description: 'Sports collectifs, athlétisme et développement moteur.',
  },
  {
    key: 'arts',
    name: 'Arts plastiques',
    code: 'ART',
    abbreviation: 'ART',
    domain: 'Arts',
    icon: 'brush',
    color: '#ad1457',
    coefficient: 1,
    kind: 'OPTIONAL',
    hours: 1,
    levels: COLLEGE,
    teacher: 'charles',
    room: 'Salle des arts',
    description: 'Dessin, peinture et histoire de l’art.',
  },
  {
    key: 'mus',
    name: 'Éducation musicale',
    code: 'MUS',
    abbreviation: 'MUS',
    domain: 'Arts',
    icon: 'music',
    color: '#ad1457',
    coefficient: 1,
    kind: 'OPTIONAL',
    hours: 1,
    levels: ['6ème', '5ème'],
    teacher: 'charles',
    room: 'Salle des arts',
    description: 'Chant, rythme et découverte des instruments.',
  },
  {
    key: 'philo',
    name: 'Philosophie',
    code: 'PHILO',
    abbreviation: 'PHILO',
    domain: 'Sciences humaines',
    icon: 'star',
    color: '#455a64',
    coefficient: 3,
    kind: 'REQUIRED',
    hours: 3,
    levels: ['Terminale'],
    teacher: 'toussaint',
    description: 'Initiation à la réflexion philosophique et à la dissertation.',
  },
  {
    key: 'eco',
    name: 'Économie',
    code: 'ECO',
    abbreviation: 'ECO',
    domain: 'Sciences humaines',
    icon: 'layout-dashboard',
    color: '#f59e0b',
    coefficient: 2,
    kind: 'ELECTIVE',
    hours: 2,
    levels: ['Première'],
    teacher: 'saint-vil',
    description: 'Notions d’économie générale et d’éducation financière.',
  },
];

interface TeacherSeed {
  key: string;
  civility: 'M.' | 'Mme';
  firstName: string;
  lastName: string;
  contractType: 'Temps plein' | 'Temps partiel' | 'Vacataire';
  hiredYearsAgo: number;
  weeklyHoursTarget: number;
  status?: 'ON_LEAVE';
}
const TEACHERS: TeacherSeed[] = [
  {
    key: 'pierre-louis',
    civility: 'M.',
    firstName: 'Jacques',
    lastName: 'Pierre-Louis',
    contractType: 'Temps plein',
    hiredYearsAgo: 9,
    weeklyHoursTarget: 24,
  },
  {
    key: 'dorcelus',
    civility: 'Mme',
    firstName: 'Marjorie',
    lastName: 'Dorcélus',
    contractType: 'Temps plein',
    hiredYearsAgo: 6,
    weeklyHoursTarget: 24,
  },
  {
    key: 'bellegarde',
    civility: 'M.',
    firstName: 'Frantz',
    lastName: 'Bellegarde',
    contractType: 'Temps plein',
    hiredYearsAgo: 4,
    weeklyHoursTarget: 22,
  },
  {
    key: 'joseph',
    civility: 'Mme',
    firstName: 'Nadine',
    lastName: 'Joseph',
    contractType: 'Temps plein',
    hiredYearsAgo: 7,
    weeklyHoursTarget: 20,
  },
  {
    key: 'etienne',
    civility: 'M.',
    firstName: 'Wilfrid',
    lastName: 'Étienne',
    contractType: 'Temps plein',
    hiredYearsAgo: 3,
    weeklyHoursTarget: 20,
  },
  {
    key: 'toussaint',
    civility: 'Mme',
    firstName: 'Régine',
    lastName: 'Toussaint',
    contractType: 'Temps plein',
    hiredYearsAgo: 11,
    weeklyHoursTarget: 26,
  },
  {
    key: 'saint-vil',
    civility: 'M.',
    firstName: 'Emmanuel',
    lastName: 'Saint-Vil',
    contractType: 'Temps plein',
    hiredYearsAgo: 2,
    weeklyHoursTarget: 22,
  },
  {
    key: 'desir',
    civility: 'M.',
    firstName: 'Kenson',
    lastName: 'Désir',
    contractType: 'Temps partiel',
    hiredYearsAgo: 5,
    weeklyHoursTarget: 14,
  },
  {
    key: 'charles',
    civility: 'Mme',
    firstName: 'Fabienne',
    lastName: 'Charles',
    contractType: 'Vacataire',
    hiredYearsAgo: 1,
    weeklyHoursTarget: 8,
    status: 'ON_LEAVE',
  },
  {
    key: 'augustin',
    civility: 'M.',
    firstName: 'Ronald',
    lastName: 'Augustin',
    contractType: 'Temps plein',
    hiredYearsAgo: 8,
    weeklyHoursTarget: 24,
  },
  {
    key: 'michel',
    civility: 'Mme',
    firstName: 'Carline',
    lastName: 'Michel',
    contractType: 'Temps plein',
    hiredYearsAgo: 3,
    weeklyHoursTarget: 24,
  },
  {
    key: 'silien',
    civility: 'Mme',
    firstName: 'Nadège',
    lastName: 'Silien',
    contractType: 'Temps plein',
    hiredYearsAgo: 3,
    weeklyHoursTarget: 30,
  },
];
// Per-level splits so no teacher exceeds the 30 weekly slots: maths collège →
// M. Augustin / lycée → M. Pierre-Louis; français collège → Mme Dorcélus /
// lycée → Mme Michel.
export function teacherKeyFor(subject: SubjectSeed, level: Level): string {
  if (subject.key === 'math' && COLLEGE.includes(level)) return 'augustin';
  if (subject.key === 'fr' && !COLLEGE.includes(level)) return 'michel';
  return subject.teacher;
}

export interface ClassSeed {
  level: Level;
  name: string;
  room: string;
  capacity: number;
  color: string;
  track: string | null;
  homeroom: string;
  students: number;
  annualFee: number; // HTG
}
// ─── Rooms catalogue (configuration/salles) ────────────────────────────────
// One row per distinct room name used below (7 homeroom classrooms + the
// 4 specialised rooms shared across subjects) — created before classes /
// timetable sessions so both can be linked by roomId, not just by label.
export interface RoomSeed {
  name: string;
  type: 'CLASSROOM' | 'LAB' | 'COMPUTER' | 'SPORTS' | 'ARTS' | 'OTHER';
  capacity: number | null;
  building: string | null;
  floor: string | null;
  equipment: string | null;
}
export const ROOMS: RoomSeed[] = [
  {
    name: 'Salle 101',
    type: 'CLASSROOM',
    capacity: 35,
    building: 'Bâtiment A',
    floor: 'Rez-de-chaussée',
    equipment: 'Tableau blanc',
  },
  {
    name: 'Salle 102',
    type: 'CLASSROOM',
    capacity: 35,
    building: 'Bâtiment A',
    floor: 'Rez-de-chaussée',
    equipment: 'Tableau blanc',
  },
  {
    name: 'Salle 103',
    type: 'CLASSROOM',
    capacity: 35,
    building: 'Bâtiment A',
    floor: '1er étage',
    equipment: 'Tableau blanc',
  },
  {
    name: 'Salle 104',
    type: 'CLASSROOM',
    capacity: 35,
    building: 'Bâtiment A',
    floor: '1er étage',
    equipment: 'Tableau blanc',
  },
  {
    name: 'Salle 201',
    type: 'CLASSROOM',
    capacity: 30,
    building: 'Bâtiment B',
    floor: 'Rez-de-chaussée',
    equipment: 'Tableau blanc, vidéoprojecteur',
  },
  {
    name: 'Salle 202',
    type: 'CLASSROOM',
    capacity: 30,
    building: 'Bâtiment B',
    floor: '1er étage',
    equipment: 'Tableau blanc, vidéoprojecteur',
  },
  {
    name: 'Salle 203',
    type: 'CLASSROOM',
    capacity: 30,
    building: 'Bâtiment B',
    floor: '1er étage',
    equipment: 'Tableau blanc, vidéoprojecteur',
  },
  {
    name: 'Laboratoire de physique-chimie',
    type: 'LAB',
    capacity: 32,
    building: 'Bâtiment B',
    floor: 'Rez-de-chaussée',
    equipment: 'Paillasses, hotte, matériel de manipulation',
  },
  {
    name: 'Laboratoire de SVT',
    type: 'LAB',
    capacity: 32,
    building: 'Bâtiment B',
    floor: 'Rez-de-chaussée',
    equipment: 'Paillasses, microscopes',
  },
  {
    name: 'Salle informatique',
    type: 'COMPUTER',
    capacity: 24,
    building: 'Bâtiment A',
    floor: '2e étage',
    equipment: '24 postes, vidéoprojecteur',
  },
  {
    name: 'Terrain de sport',
    type: 'SPORTS',
    capacity: null,
    building: null,
    floor: null,
    equipment: 'Terrain multisport, buts, filets',
  },
  {
    name: 'Salle des arts',
    type: 'ARTS',
    capacity: 30,
    building: 'Bâtiment A',
    floor: 'Rez-de-chaussée',
    equipment: 'Instruments, matériel de dessin',
  },
  {
    name: 'Salle Maternelle',
    type: 'CLASSROOM',
    capacity: 20,
    building: 'Bâtiment A',
    floor: 'Rez-de-chaussée',
    equipment: 'Tapis, coin lecture, tableau blanc',
  },
];

export const CLASSES: ClassSeed[] = [
  {
    level: '6ème',
    name: '6ème A',
    room: 'Salle 101',
    capacity: 35,
    color: '#2563eb',
    track: null,
    homeroom: 'augustin',
    students: 7,
    annualFee: 36_000,
  },
  {
    level: '5ème',
    name: '5ème A',
    room: 'Salle 102',
    capacity: 35,
    color: '#00897b',
    track: null,
    homeroom: 'michel',
    students: 6,
    annualFee: 36_000,
  },
  {
    level: '4ème',
    name: '4ème A',
    room: 'Salle 103',
    capacity: 35,
    color: '#f59e0b',
    track: null,
    homeroom: 'joseph',
    students: 6,
    annualFee: 38_000,
  },
  {
    level: '3ème',
    name: '3ème A',
    room: 'Salle 104',
    capacity: 35,
    color: '#e65100',
    track: null,
    homeroom: 'pierre-louis',
    students: 7,
    annualFee: 40_000,
  },
  {
    level: 'Seconde',
    name: 'Seconde A',
    room: 'Salle 201',
    capacity: 30,
    color: '#7c3aed',
    track: null,
    homeroom: 'dorcelus',
    students: 6,
    annualFee: 45_000,
  },
  {
    level: 'Première',
    name: 'Première S',
    room: 'Salle 202',
    capacity: 30,
    color: '#388e3c',
    track: 'Sciences',
    homeroom: 'etienne',
    students: 5,
    annualFee: 48_000,
  },
  {
    level: 'Terminale',
    name: 'Terminale S',
    room: 'Salle 203',
    capacity: 30,
    color: '#c2185b',
    track: 'Sciences',
    homeroom: 'toussaint',
    students: 5,
    annualFee: 50_000,
  },
];

// prettier-ignore
const FIRST_NAMES_F = [
  'Marie-Louise', 'Widelene', 'Rose-Mika', 'Daphné', 'Nadège', 'Fabiola', 'Mirlande', 'Roseline',
  'Guerline', 'Ketty', 'Sabine', 'Christella', 'Darline', 'Vanessa', 'Nathalie', 'Esther', 'Islande',
  'Judeline', 'Farah', 'Manoucheka', 'Yolande', 'Carline', 'Stéphanie', 'Lovely',
];
// prettier-ignore
const FIRST_NAMES_M = [
  'Jean-Baptiste', 'Stanley', 'Ricardo', 'Kervens', 'Junior', 'Steeve', 'Wilson', 'Frantz', 'Woodley',
  'Jeff', 'Emmanuel', 'Rodney', 'Peterson', 'Jimmy', 'Mackenson', 'Rico', 'Kenson', 'Dieuseul',
  'Bernard', 'Réginald', 'Jonathan', 'Samuel', 'Djimy', 'Wendy',
];
// prettier-ignore
const LAST_NAMES = [
  'Pierre', 'Jean', 'Joseph', 'Louis', 'Charles', 'François', 'Michel', 'Baptiste', 'Augustin',
  'Toussaint', 'Delva', 'Cadet', 'Étienne', 'Désir', 'Dorval', 'Alexis', 'Bélizaire', 'Célestin',
  'Dorcé', 'Fleurant', 'Gédéon', 'Hyppolite', 'Innocent', 'Jeune', 'Lafortune', 'Mompremier', 'Noël',
  'Occéan', 'Paul', 'Rémy', 'Saintil', 'Théodore', 'Ulysse', 'Valcin', 'Petit-Frère', 'Sanon',
];
// prettier-ignore
const GUARDIAN_FIRST_F = [
  'Marie', 'Roseline', 'Guerda', 'Yvrose', 'Nadia', 'Micheline', 'Elda', 'Ginette', 'Josette', 'Mireille',
];
// prettier-ignore
const GUARDIAN_FIRST_M = [
  'Jean', 'Pierre', 'Yves', 'Robert', 'Gérald', 'Fritz', 'Ernst', 'Réginald', 'Lesly', 'Patrick',
];
// prettier-ignore
const PROFESSIONS = [
  'Commerçant(e)', 'Infirmier(ère)', 'Enseignant(e)', 'Chauffeur', 'Comptable', 'Agronome',
  'Couturier(ère)', 'Ingénieur(e)', 'Fonctionnaire', 'Artisan', 'Médecin', 'Cuisinier(ère)',
];
// prettier-ignore
const NEIGHBOURHOODS = [
  'Delmas 33', 'Pétion-Ville', 'Carrefour-Feuilles', 'Tabarre', 'Croix-des-Bouquets', 'Turgeau',
  'Bourdon', 'Canapé-Vert', 'Delmas 75', 'Frères',
];
type Mention = 'TRES_BIEN' | 'BIEN' | 'ASSEZ_BIEN' | 'PASSABLE' | 'INSUFFISANT' | 'FAIBLE';
const APPRECIATION_TEXTS: Record<Mention, string[]> = {
  TRES_BIEN: [
    'Excellent trimestre, élève sérieux et très impliqué. Continue ainsi.',
    'Résultats remarquables et attitude exemplaire en classe.',
  ],
  BIEN: [
    'Bon trimestre dans l’ensemble, des efforts réguliers. Poursuis sur cette voie.',
    'Bons résultats, participation active. Peut encore progresser à l’écrit.',
  ],
  ASSEZ_BIEN: [
    'Trimestre satisfaisant mais irrégulier selon les matières. Plus de rigueur attendue.',
    'Ensemble assez bien ; le travail personnel doit gagner en constance.',
  ],
  PASSABLE: [
    'Résultats justes. Un travail plus soutenu est indispensable au prochain trimestre.',
    'Trimestre passable, l’élève doit s’investir davantage.',
  ],
  INSUFFISANT: [
    'Résultats insuffisants. Un accompagnement et des efforts sérieux sont nécessaires.',
    'Trimestre en dessous des attentes ; manque de travail personnel.',
  ],
  FAIBLE: ['Résultats très faibles. Une remise en question et un suivi rapproché s’imposent.'],
};
const PHONE = (): string => `+509 ${int(31, 49)}${int(10, 99)} ${int(1000, 9999)}`;
const slugName = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '.')
    .replace(/^\.|\.$/g, '');

// ─── Timetable slots ───────────────────────────────────────────────────────
// 08:00–12:00 then 13:00–15:00, 1h slots; slot index → start minutes.
const SLOT_STARTS = [8 * 60, 9 * 60, 10 * 60, 11 * 60, 13 * 60, 14 * 60] as const;
const MORNING: readonly number[] = [0, 1, 2, 3];
const AFTERNOON: readonly number[] = [4, 5];
const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5]; // Mon..Fri (ISO)

interface Slot {
  day: number; // 1..5
  slot: number; // index into SLOT_STARTS
  length: 1 | 2;
}

interface SeedDeps {
  prisma?: PrismaClient;
  now?: Date;
}

export async function main(args: string[] = [], deps: SeedDeps = {}): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run seed-dev-school in production.');
    process.exit(1);
  }
  const reset = args.includes('--reset');
  const now = deps.now ?? new Date();
  const today = startOfUtcDay(now);
  const prisma = deps.prisma ?? new PrismaClient();

  try {
    // 1. Generic accounts, plans, global bulletin templates, platform settings.
    console.log('— Comptes génériques (seed-dev)');
    await seedDevUsers([], { prisma });
    console.log('— Plans SaaS');
    await seedPlans([], { prisma });
    console.log('— Modèles de bulletin globaux');
    await seedBulletinTemplates([], { prisma });
    await prisma.platformSettings.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton', platformName: 'EkolPlus', supportEmail: 'support@ekolplus.test' },
    });

    // 2. Real accounts.
    console.log('— Comptes réels');
    const ownerHash = await bcrypt.hash(OWNER_PASSWORD, 12);
    const owner = await upsertOwner(prisma, ETOILES.ownerEmail, ETOILES.ownerName, ownerHash);
    const owner2 = await upsertOwner(prisma, HELP.ownerEmail, HELP.ownerName, ownerHash);

    // 3. Optional reset — cascades through Organization → School → everything.
    if (reset) {
      const removed = await prisma.organization.deleteMany({
        where: { slug: { in: [ETOILES.slug, HELP.slug] } },
      });
      // Login history hangs off the user, not the school — clear it too so a
      // re-seed doesn't accumulate events.
      await prisma.loginEvent.deleteMany({ where: { userId: { in: [owner.id, owner2.id] } } });
      console.log(`— Reset : ${removed.count} école(s) supprimée(s)`);
    }

    // 4. École Les Étoiles.
    const existing = await prisma.school.findUnique({
      where: { id: ETOILES.schoolId },
      select: { id: true },
    });
    if (existing) {
      console.log(`— ${ETOILES.name} existe déjà — dataset ignoré (relance avec --reset).`);
    } else {
      await seedEtoiles(prisma, owner.id, now, today);
    }

    // 4b. Espace Élève test account — idempotent, also on an existing dataset.
    const studentEmail = await ensureStudentPortalAccount(
      prisma,
      ETOILES.schoolId,
      await bcrypt.hash(STUDENT_PASSWORD, 12),
    );
    if (studentEmail) console.log(`— Compte espace élève : ${studentEmail}`);

    // 5. Second (empty) school.
    const existing2 = await prisma.organization.findUnique({
      where: { slug: HELP.slug },
      select: { id: true },
    });
    if (existing2) {
      console.log(`— ${HELP.name} existe déjà — ignorée.`);
    } else {
      await seedHelp(prisma, owner2.id, now);
    }

    console.log('\nConnexions (mots de passe : voir CREDENTIALS.local.md) :');
    console.log(`  ${ETOILES.ownerEmail}  → ${ETOILES.name}`);
    console.log(`  ${HELP.ownerEmail}  → ${HELP.name} (vide)`);
    console.log('  admin@example.com  → SUPERADMIN (/admin)');
    console.log(
      '  carline.michel@lesetoiles.edu.ht  → espace enseignant (Mme Michel, Les Étoiles)',
    );
    if (studentEmail) {
      console.log(`  ${studentEmail}  → espace élève (premier élève de Les Étoiles)`);
    }
  } finally {
    if (!deps.prisma) await prisma.$disconnect();
  }
}

async function upsertOwner(
  prisma: PrismaClient,
  email: string,
  name: string,
  passwordHash: string,
): Promise<{ id: string }> {
  return prisma.user.upsert({
    where: { email },
    update: { passwordHash, name, emailVerifiedAt: new Date(), status: 'ACTIVE' },
    create: {
      email,
      name,
      passwordHash,
      emailVerifiedAt: new Date(),
      phone: '+509 3712 4589',
      role: 'USER',
    },
    select: { id: true },
  });
}

// Espace Enseignant test account — mirrors upsertOwner's directness (a real,
// already-active password immediately) rather than the real invite/accept-code
// flow, since this is seed-time convenience, not a test of that flow itself.
// Idempotent across `--reset`: the Organization deletion cascades away the
// Teacher row and the OrganizationMember, but not this User row, so re-running
// re-links it by email.
async function upsertTeacherPortalAccount(
  prisma: PrismaClient,
  organizationId: string,
  teacherId: string,
  email: string,
  passwordHash: string,
): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, emailVerifiedAt: new Date(), status: 'ACTIVE' },
    create: { email, passwordHash, emailVerifiedAt: new Date(), role: 'USER' },
    select: { id: true },
  });
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId: user.id } },
    update: {},
    create: { organizationId, userId: user.id, role: 'MEMBER' },
  });
  await prisma.teacher.update({ where: { id: teacherId }, data: { userId: user.id } });
}

// Personnel module test account (secrétariat) — a username-only staff
// login: no email at all, modeled on how POST /api/school/personnel's
// username-mode branch creates one (see that route's header comment) —
// User.username/passwordHash set, User.email left null, an
// OrganizationMember role MEMBER holding a StaffRole with a couple of
// real grants (lib/permissions.ts). Only created when the school itself
// is (same as the teacher portal account above); upserts by username so
// a re-run without --reset still re-links it if the User row survived a
// previous reset.
async function ensureSecretariatStaffAccount(
  prisma: PrismaClient,
  organizationId: string,
  schoolId: string,
  passwordHash: string,
): Promise<string> {
  const user = await prisma.user.upsert({
    where: { username: SECRETARIAT_USERNAME },
    update: { passwordHash, name: 'Nadège Similien' },
    create: {
      username: SECRETARIAT_USERNAME,
      name: 'Nadège Similien',
      passwordHash,
      role: 'USER',
    },
    select: { id: true },
  });
  const role = await prisma.staffRole.create({
    data: {
      schoolId,
      name: 'Secrétariat',
      description: 'Suivi des dossiers élèves — compte de démonstration sans email.',
      grants: ['dashboard.view', 'eleves.view', 'eleves.edit'],
    },
    select: { id: true },
  });
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId: user.id } },
    update: { role: 'MEMBER', staffRoles: { set: [{ id: role.id }] } },
    create: {
      organizationId,
      userId: user.id,
      role: 'MEMBER',
      staffRoles: { connect: [{ id: role.id }] },
    },
  });
  return SECRETARIAT_USERNAME;
}

// Espace Élève test account — the first student (by matricule) of Les
// Étoiles gets a real, already-active login, the same seed-time shortcut
// as the teacher account above (no invite code). Runs on every invocation,
// with or without --reset, so an existing dev dataset gains the account
// without being rebuilt. A student account never gets an
// OrganizationMember row (Phase 1 design: that is exactly what keeps every
// /api/school/* route closed to it). Idempotent: upsert the User by email,
// then (re)link Student.userId. The PRNG is seeded, so the first student's
// name (hence the email) is stable across --reset runs.
async function ensureStudentPortalAccount(
  prisma: PrismaClient,
  schoolId: string,
  passwordHash: string,
): Promise<string | null> {
  const student = await prisma.student.findFirst({
    where: { schoolId },
    orderBy: { studentNumber: 'asc' },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!student) return null;
  const email = `${slugName(student.firstName)}.${slugName(student.lastName)}@eleves.lesetoiles.edu.ht`;
  const name = `${student.firstName} ${student.lastName}`;
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, emailVerifiedAt: new Date(), status: 'ACTIVE' },
    create: { name, email, passwordHash, emailVerifiedAt: new Date(), role: 'USER' },
    select: { id: true },
  });
  // Student.userId is @unique: a previous run may have linked this User to
  // a Student row that still exists (no --reset) — unlink it first so the
  // update below cannot collide.
  await prisma.student.updateMany({
    where: { userId: user.id, NOT: { id: student.id } },
    data: { userId: null },
  });
  await prisma.student.update({ where: { id: student.id }, data: { email, userId: user.id } });
  return email;
}

async function createTenant(
  prisma: PrismaClient,
  input: {
    schoolId?: string;
    slug: string;
    name: string;
    shortName: string;
    ownerId: string;
    city: string;
    estimatedStudents: number;
    statute: string;
    officialCode: string;
    officialEmail: string;
    website: string | null;
    address: string;
  },
): Promise<{ organizationId: string; schoolId: string }> {
  const org = await prisma.organization.create({
    data: { slug: input.slug, name: input.name, ownerId: input.ownerId },
    select: { id: true },
  });
  const school = await prisma.school.create({
    data: {
      ...(input.schoolId ? { id: input.schoolId } : {}),
      organizationId: org.id,
      name: input.name,
      shortName: input.shortName,
      country: 'Haïti',
      city: input.city,
      schoolType: 'École primaire & secondaire',
      primaryLanguage: 'Français',
      address: input.address,
      phone: '+509 2813 4567',
      estimatedStudents: input.estimatedStudents,
      officialCode: input.officialCode,
      officialEmail: input.officialEmail,
      website: input.website,
      statute: input.statute,
    },
    select: { id: true },
  });
  await prisma.organizationMember.create({
    data: { organizationId: org.id, userId: input.ownerId, role: 'OWNER' },
  });
  return { organizationId: org.id, schoolId: school.id };
}

async function createYearWithTerms(
  prisma: PrismaClient,
  schoolId: string,
  now: Date,
): Promise<{ yearId: string; terms: { id: string; order: number; start: Date; end: Date }[] }> {
  const cal = schoolCalendar(now);
  const year = await prisma.academicYear.create({
    data: {
      schoolId,
      label: cal.label,
      startDate: cal.start,
      endDate: cal.end,
      isActive: true,
      gradingScale: 'Sur 20',
      terms: {
        create: cal.terms.map((t) => ({
          label: t.label,
          order: t.order,
          startDate: t.start,
          endDate: t.end,
          type: 'TRIMESTRE',
          gradeEntryEnabled: true,
        })),
      },
    },
    select: {
      id: true,
      terms: { select: { id: true, order: true, startDate: true, endDate: true } },
    },
  });
  return {
    yearId: year.id,
    terms: year.terms
      .map((t) => ({ id: t.id, order: t.order, start: t.startDate, end: t.endDate }))
      .sort((a, b) => a.order - b.order),
  };
}

async function seedEtoiles(
  prisma: PrismaClient,
  ownerId: string,
  now: Date,
  today: Date,
): Promise<void> {
  console.log(`— ${ETOILES.name}`);
  const { organizationId, schoolId } = await createTenant(prisma, {
    schoolId: ETOILES.schoolId,
    slug: ETOILES.slug,
    name: ETOILES.name,
    shortName: ETOILES.shortName,
    ownerId,
    city: 'Port-au-Prince',
    estimatedStudents: 260,
    statute: 'École privée laïque',
    officialCode: 'MENFP-OUE-2018-0417',
    officialEmail: 'contact@lesetoiles.edu.ht',
    website: 'https://lesetoiles.edu.ht',
    address: '14, rue Chavannes, Pétion-Ville',
  });

  const { yearId, terms } = await createYearWithTerms(prisma, schoolId, now);
  const cal = schoolCalendar(now);
  console.log(`  année ${cal.label} + ${terms.length} trimestres`);

  await prisma.gradeLevel.createMany({
    data: LEVELS.map((name, i) => ({ schoolId, name, order: i + 1 })),
  });
  // Classes below are linked to their catalog level (Class.gradeLevelId), the
  // way the class form does it, so a bulletin template assigned to a level
  // from the Niveaux screen reaches the seeded classes.
  const levelIdByName = new Map(
    (
      await prisma.gradeLevel.findMany({ where: { schoolId }, select: { id: true, name: true } })
    ).map((l) => [l.name, l.id] as const),
  );

  // Rooms catalogue — created before classes / timetable sessions so both
  // link by roomId (the class-form / session-form catalogue selects).
  const roomId = new Map<string, string>();
  for (const r of ROOMS) {
    const row = await prisma.room.create({
      data: {
        schoolId,
        name: r.name,
        type: r.type,
        capacity: r.capacity,
        building: r.building,
        floor: r.floor,
        equipment: r.equipment,
      },
      select: { id: true },
    });
    roomId.set(r.name, row.id);
  }
  console.log(`  ${roomId.size} salles`);

  // Teachers.
  const teacherId = new Map<string, string>();
  for (const t of TEACHERS) {
    const row = await prisma.teacher.create({
      data: {
        schoolId,
        name: `${t.firstName} ${t.lastName}`,
        civility: t.civility,
        firstName: t.firstName,
        lastName: t.lastName,
        email: `${slugName(t.firstName)}.${slugName(t.lastName)}@lesetoiles.edu.ht`,
        phone: PHONE(),
        gender: t.civility === 'Mme' ? 'Féminin' : 'Masculin',
        nationality: 'Haïtienne',
        nif: `NIF-${int(2010, 2024)}-${String(int(1, 999)).padStart(4, '0')}`,
        address: `${pick(NEIGHBOURHOODS)}, Port-au-Prince`,
        contractType: t.contractType,
        hiredAt: utc(now.getUTCFullYear() - t.hiredYearsAgo, 9, 1),
        weeklyHoursTarget: t.weeklyHoursTarget,
        dateOfBirth: utc(int(1972, 1995), int(1, 12), int(1, 28)),
        status: t.status ?? 'ACTIVE',
        isActive: true,
      },
      select: { id: true },
    });
    teacherId.set(t.key, row.id);
  }
  const tid = (key: string): string => {
    const v = teacherId.get(key);
    if (!v) throw new Error(`unknown teacher ${key}`);
    return v;
  };
  console.log(`  ${teacherId.size} enseignants`);

  const michel = TEACHERS.find((t) => t.key === 'michel');
  if (!michel) throw new Error('unknown teacher michel');
  const michelEmail = `${slugName(michel.firstName)}.${slugName(michel.lastName)}@lesetoiles.edu.ht`;
  const teacherPasswordHash = await bcrypt.hash(TEACHER_PASSWORD, 12);
  await upsertTeacherPortalAccount(
    prisma,
    organizationId,
    tid('michel'),
    michelEmail,
    teacherPasswordHash,
  );
  console.log(`  compte espace enseignant : ${michelEmail}`);

  const secretariatPasswordHash = await bcrypt.hash(SECRETARIAT_PASSWORD, 12);
  const secretariatUsername = await ensureSecretariatStaffAccount(
    prisma,
    organizationId,
    schoolId,
    secretariatPasswordHash,
  );
  console.log(`  compte staff sans email (Personnel) : ${secretariatUsername}`);

  // Subjects.
  const subjectId = new Map<string, string>();
  for (const s of SUBJECTS) {
    const levelLabel = s.levels.length === LEVELS.length ? 'Tous niveaux' : s.levels.join(' / ');
    const row = await prisma.subject.create({
      data: {
        schoolId,
        name: s.name,
        code: s.code,
        abbreviation: s.abbreviation,
        domain: s.domain,
        status: 'ACTIVE',
        isActive: true,
        level: levelLabel,
        kind: s.kind,
        description: s.description,
        defaultCoefficient: s.coefficient,
        maxScore: 20,
        passingScore: 10,
        totalHours: s.hours * 32,
        hoursCM: s.type === 'TP' ? Math.ceil(s.hours * 32 * 0.6) : s.hours * 32,
        hoursTP: s.type === 'TP' ? Math.floor(s.hours * 32 * 0.4) : null,
        evaluationType:
          s.kind === 'OPTIONAL' ? 'Contrôle continu' : 'Contrôle continu + Examen final',
        includeInAverage: s.kind !== 'OPTIONAL',
        showOnBulletin: true,
        room: s.room ?? null,
        icon: s.icon,
        color: s.color,
        responsibleTeacherId: tid(s.teacher),
      },
      select: { id: true },
    });
    subjectId.set(s.key, row.id);
  }
  const sid = (key: string): string => {
    const v = subjectId.get(key);
    if (!v) throw new Error(`unknown subject ${key}`);
    return v;
  };
  // Prerequisites: PC ← Math, Philo ← Français (implicit m2m).
  await prisma.subject.update({
    where: { id: sid('pc') },
    data: { prerequisites: { connect: [{ id: sid('math') }] } },
  });
  await prisma.subject.update({
    where: { id: sid('philo') },
    data: { prerequisites: { connect: [{ id: sid('fr') }] } },
  });
  console.log(`  ${subjectId.size} matières`);

  // Programme annuel for Mathématiques / Français (chapters per term).
  const chapters: Prisma.SubjectChapterCreateManyInput[] = [];
  const PROGRAMME: Record<string, string[][]> = {
    math: [
      ['Nombres relatifs et opérations', 'Fractions et puissances', 'Initiation à l’algèbre'],
      [
        'Équations du premier degré',
        'Proportionnalité et pourcentages',
        'Géométrie plane : triangles',
      ],
      ['Théorème de Pythagore', 'Statistiques descriptives', 'Volumes et solides usuels'],
    ],
    fr: [
      [
        'Le récit : narration et description',
        'Grammaire : la phrase complexe',
        'Lecture suivie : conte haïtien',
      ],
      ['Le texte argumentatif', 'Conjugaison : temps du récit', 'Poésie : versification'],
      ['Le théâtre classique', 'Expression orale : l’exposé', 'Rédaction : la lettre formelle'],
    ],
  };
  for (const [key, perTerm] of Object.entries(PROGRAMME)) {
    perTerm.forEach((titles, ti) => {
      const term = at(terms, ti);
      titles.forEach((title, i) => {
        chapters.push({
          subjectId: sid(key),
          termId: term.id,
          order: i + 1,
          title,
          objectives: `Maîtriser les notions du chapitre « ${title} » et les réinvestir en exercices.`,
          hours: pick([6, 8, 10, 12]),
          reference: `Manuel ch. ${ti * 3 + i + 1}`,
          competence: pick(['Raisonner', 'Communiquer', 'Modéliser', 'Analyser', 'Rédiger']),
        });
      });
    });
  }
  await prisma.subjectChapter.createMany({ data: chapters });

  // Classes + class subjects.
  interface ClassRow {
    seed: ClassSeed;
    id: string;
    subjects: { key: string; classSubjectId: string; teacherKey: string }[];
  }
  const classes: ClassRow[] = [];
  for (const c of CLASSES) {
    const row = await prisma.class.create({
      data: {
        schoolId,
        academicYearId: yearId,
        name: c.name,
        level: c.level,
        gradeLevelId: levelIdByName.get(c.level) ?? null,
        room: c.room,
        roomId: roomId.get(c.room) ?? null,
        capacity: c.capacity,
        color: c.color,
        track: c.track,
        homeroomTeacherId: tid(c.homeroom),
      },
      select: { id: true },
    });
    const taken = SUBJECTS.filter((s) => s.levels.includes(c.level));
    await prisma.classSubject.createMany({
      data: taken.map((s) => ({
        classId: row.id,
        subjectId: sid(s.key),
        teacherId: tid(teacherKeyFor(s, c.level)),
        coefficient: s.coefficient,
        weeklyHours: s.hours,
      })),
    });
    const pivots = await prisma.classSubject.findMany({
      where: { classId: row.id },
      select: { id: true, subjectId: true },
    });
    const bySubject = new Map(pivots.map((p) => [p.subjectId, p.id]));
    classes.push({
      seed: c,
      id: row.id,
      subjects: taken.map((s) => {
        const pivotId = bySubject.get(sid(s.key));
        if (!pivotId) throw new Error(`pivot missing for ${c.name}/${s.key}`);
        return { key: s.key, classSubjectId: pivotId, teacherKey: teacherKeyFor(s, c.level) };
      }),
    });
  }
  console.log(
    `  ${classes.length} classes, ${classes.reduce((n, c) => n + c.subjects.length, 0)} affectations`,
  );

  // Students, guardians, enrollments.
  interface StudentRow {
    id: string;
    classIdx: number;
    ability: number;
    affinity: Map<string, number>;
    scholarship: boolean;
    payer: 'uptodate' | 'partial' | 'late';
    attendanceProfile: 'regular' | 'irregular';
  }
  const studentInputs: Prisma.StudentCreateManyInput[] = [];
  const studentMeta: Omit<StudentRow, 'id'>[] = [];
  const usedNames = new Set<string>();
  let counter = 0;
  const yearStart = cal.start.getUTCFullYear();
  classes.forEach((c, classIdx) => {
    // Age by level: 6ème ≈ 11-12 … Terminale ≈ 17-18.
    const birthYear = yearStart - (11 + LEVELS.indexOf(c.seed.level));
    for (let i = 0; i < c.seed.students; i++) {
      const female = chance(0.5);
      let firstName = '';
      let lastName = '';
      do {
        firstName = pick(female ? FIRST_NAMES_F : FIRST_NAMES_M);
        lastName = pick(LAST_NAMES);
      } while (usedNames.has(`${firstName} ${lastName}`));
      usedNames.add(`${firstName} ${lastName}`);
      counter += 1;
      const scholarship = chance(0.08);
      const enrollmentType = pick([
        'Nouvelle inscription',
        'Réinscription',
        'Réinscription',
        'Transfert',
      ]);
      studentInputs.push({
        schoolId,
        studentNumber: `EL-${yearStart}-${String(counter).padStart(3, '0')}`,
        firstName,
        lastName,
        gender: female ? 'Féminin' : 'Masculin',
        dateOfBirth: utc(birthYear - (chance(0.25) ? 1 : 0), int(1, 12), int(1, 28)),
        placeOfBirth: pick([
          'Port-au-Prince',
          'Pétion-Ville',
          'Cap-Haïtien',
          'Les Cayes',
          'Jacmel',
          'Gonaïves',
        ]),
        nationality: 'Haïtienne',
        address: `${pick(NEIGHBOURHOODS)}, Port-au-Prince`,
        motherTongue: pick(['Créole', 'Créole', 'Français']),
        enrollmentType,
        previousSchool:
          enrollmentType === 'Transfert'
            ? pick([
                'Collège Saint-Pierre',
                'Institution Saint-Louis de Gonzague',
                'Lycée Alexandre Pétion',
              ])
            : null,
        transferNumber: enrollmentType === 'Transfert' ? `TR-${yearStart}-${int(100, 999)}` : null,
        scholarship,
        enrolledAt: addDays(cal.start, int(-20, 10)),
        status: chance(0.06) ? 'REPEATED_ABSENCES' : 'ENROLLED',
        notes: chance(0.15) ? 'Suivi particulier demandé par la famille.' : null,
      });
      const affinity = new Map<string, number>();
      for (const s of SUBJECTS) affinity.set(s.key, gauss(0.08));
      studentMeta.push({
        classIdx,
        ability: 0.35 + rand() * 0.57,
        affinity,
        scholarship,
        payer: scholarship
          ? 'uptodate'
          : pick(['uptodate', 'uptodate', 'uptodate', 'partial', 'late']),
        attendanceProfile: chance(0.2) ? 'irregular' : 'regular',
      });
    }
  });
  await prisma.student.createMany({ data: studentInputs });
  const studentRows = await prisma.student.findMany({
    where: { schoolId },
    orderBy: { studentNumber: 'asc' },
    select: { id: true, studentNumber: true, lastName: true },
  });
  const students: StudentRow[] = studentRows.map((r, i) => ({ id: r.id, ...at(studentMeta, i) }));
  console.log(`  ${students.length} élèves`);

  const guardians: Prisma.GuardianCreateManyInput[] = [];
  studentRows.forEach((r) => {
    const motherFirst = pick(GUARDIAN_FIRST_F);
    guardians.push({
      studentId: r.id,
      name: `${motherFirst} ${r.lastName}`,
      relationship: 'Mère',
      phone: PHONE(),
      email: chance(0.6) ? `${slugName(motherFirst)}.${slugName(r.lastName)}@gmail.com` : null,
      profession: pick(PROFESSIONS),
      isPrimary: true,
    });
    if (chance(0.75)) {
      const fatherFirst = pick(GUARDIAN_FIRST_M);
      guardians.push({
        studentId: r.id,
        name: `${fatherFirst} ${r.lastName}`,
        relationship: 'Père',
        phone: PHONE(),
        email: chance(0.4) ? `${slugName(fatherFirst)}.${slugName(r.lastName)}@yahoo.fr` : null,
        profession: pick(PROFESSIONS),
        isPrimary: false,
      });
    } else if (chance(0.3)) {
      guardians.push({
        studentId: r.id,
        name: `${pick(GUARDIAN_FIRST_M)} ${pick(LAST_NAMES)}`,
        relationship: 'Tuteur',
        phone: PHONE(),
        profession: pick(PROFESSIONS),
        isPrimary: false,
      });
    }
  });
  await prisma.guardian.createMany({ data: guardians });
  await prisma.enrollment.createMany({
    data: students.map((s) => ({
      studentId: s.id,
      classId: at(classes, s.classIdx).id,
      academicYearId: yearId,
      enrolledAt: cal.start,
    })),
  });

  // Evaluations + grades. Ended terms: both evaluations PUBLISHED with every
  // grade; the term in progress: "Devoir 1" PUBLISHED once its date is past,
  // "Composition" left as DRAFT (partially entered); future terms: nothing.
  const evalInputs: Prisma.EvaluationCreateManyInput[] = [];
  for (const term of terms) {
    if (term.start > today) continue;
    const ended = term.end < today;
    const d1Date = addDays(term.start, 35);
    const compoDate = addDays(term.end, -10);
    for (const c of classes) {
      c.subjects.forEach((cs) => {
        const optional = SUBJECTS.find((s) => s.key === cs.key)?.kind === 'OPTIONAL';
        evalInputs.push({
          classSubjectId: cs.classSubjectId,
          termId: term.id,
          label: 'Devoir 1',
          type: 'INTERROGATION',
          maxScore: 20,
          coefficient: 1,
          countsTowardAverage: true,
          status: ended || d1Date <= today ? 'PUBLISHED' : 'DRAFT',
          order: 1,
          date: d1Date,
        });
        if (!optional) {
          evalInputs.push({
            classSubjectId: cs.classSubjectId,
            termId: term.id,
            label: 'Composition',
            type: 'EXAMEN',
            maxScore: 20,
            coefficient: 2,
            countsTowardAverage: true,
            status: ended ? 'PUBLISHED' : 'DRAFT',
            order: 2,
            date: compoDate,
            notes: ended ? null : 'Sujet en préparation — barème à valider.',
          });
        }
      });
    }
  }
  await prisma.evaluation.createMany({ data: evalInputs });
  const evalRows = await prisma.evaluation.findMany({
    where: { classSubject: { class: { schoolId } } },
    select: { id: true, classSubjectId: true, termId: true, status: true, label: true },
  });
  const csToClass = new Map<string, { classIdx: number; subjectKey: string }>();
  classes.forEach((c, classIdx) =>
    c.subjects.forEach((cs) => csToClass.set(cs.classSubjectId, { classIdx, subjectKey: cs.key })),
  );
  const termsById = new Map(terms.map((t) => [t.id, t]));
  const grades: Prisma.GradeCreateManyInput[] = [];
  const termAvg = new Map<string, { sum: number; n: number }>(); // `${studentId}|${termId}`
  for (const ev of evalRows) {
    const ref = csToClass.get(ev.classSubjectId);
    if (!ref) continue;
    // Drafts get a partial entry (≈40 % of the class) so the notebook shows
    // "en cours de saisie" states; published ones are complete.
    const draft = ev.status === 'DRAFT';
    if (draft && ev.label === 'Devoir 1') continue;
    // Mild school-wide progression across the year (T1 slightly below
    // baseline settling in, T3 slightly above as the cohort matures) — so
    // the dashboard's "Évolution des moyennes" (school-wide average pooled
    // by month) shows an actual trend instead of a flat line. "Devoir 1"
    // lands early in its term, "Composition" late, giving 6 points across
    // the year rather than one flat step per term.
    const term = termsById.get(ev.termId);
    const withinTerm = ev.label === 'Composition' ? 0.75 : 0.25;
    const yearFrac = term ? (term.order - 1 + withinTerm) / terms.length : 0.5;
    const trend = (yearFrac - 0.5) * 0.1;
    for (const st of students) {
      if (st.classIdx !== ref.classIdx) continue;
      if (draft && !chance(0.4)) continue;
      const absent = chance(0.03);
      const raw = (st.ability + (st.affinity.get(ref.subjectKey) ?? 0) + trend + gauss(0.07)) * 20;
      const score = absent ? null : clamp(Math.round(raw * 2) / 2, 1, 20);
      grades.push({
        evaluationId: ev.id,
        studentId: st.id,
        score,
        absent,
        comment:
          score !== null && score >= 17 && chance(0.3)
            ? 'Excellent travail.'
            : score !== null && score < 8 && chance(0.3)
              ? 'Notions non acquises — à revoir.'
              : null,
      });
      if (!draft && score !== null) {
        const k = `${st.id}|${ev.termId}`;
        const acc = termAvg.get(k) ?? { sum: 0, n: 0 };
        acc.sum += score;
        acc.n += 1;
        termAvg.set(k, acc);
      }
    }
  }
  for (let i = 0; i < grades.length; i += 500) {
    await prisma.grade.createMany({ data: grades.slice(i, i + 500) });
  }
  console.log(`  ${evalRows.length} évaluations, ${grades.length} notes`);

  // Appreciations (générale) for ended terms — PUBLISHED, mention derived
  // from the term average; the in-progress term gets a few DRAFT rows.
  const appreciations: Prisma.AppreciationCreateManyInput[] = [];
  for (const term of terms) {
    if (term.start > today) continue;
    const ended = term.end < today;
    for (const st of students) {
      if (!ended && !chance(0.25)) continue;
      const acc = termAvg.get(`${st.id}|${term.id}`);
      const avg = acc && acc.n > 0 ? acc.sum / acc.n : st.ability * 20;
      const mention =
        avg >= 16
          ? 'TRES_BIEN'
          : avg >= 14
            ? 'BIEN'
            : avg >= 12
              ? 'ASSEZ_BIEN'
              : avg >= 10
                ? 'PASSABLE'
                : avg >= 8
                  ? 'INSUFFISANT'
                  : 'FAIBLE';
      appreciations.push({
        studentId: st.id,
        termId: term.id,
        subjectId: null,
        mention,
        text: pick(APPRECIATION_TEXTS[mention]),
        comportement:
          avg >= 12 ? pick(['Excellent', 'Satisfaisant']) : pick(['Satisfaisant', 'À améliorer']),
        investissement:
          avg >= 14
            ? 'Excellent'
            : avg >= 10
              ? 'Satisfaisant'
              : pick(['À améliorer', 'Insuffisant']),
        assiduite:
          st.attendanceProfile === 'regular'
            ? 'Régulier'
            : pick(['Irrégulier', 'Absences répétées']),
        status: ended ? 'PUBLISHED' : 'DRAFT',
        authorId: ownerId,
      });
    }
  }
  await prisma.appreciation.createMany({ data: appreciations });

  // Attendance: the last 25 school days up to today (within the year).
  const attendance: Prisma.AttendanceCreateManyInput[] = [];
  const schoolDays: Date[] = [];
  for (
    let d = today, guard = 0;
    schoolDays.length < 25 && guard < 60 && d >= cal.start;
    d = addDays(d, -1), guard++
  ) {
    if (isWeekday(d)) schoolDays.push(d);
  }
  for (const st of students) {
    const pAbsent = st.attendanceProfile === 'regular' ? 0.03 : 0.14;
    for (const day of schoolDays) {
      const r = rand();
      let status = 'PRESENT';
      let justification: string | null = null;
      if (r < pAbsent) {
        status = chance(0.4) ? 'EXCUSED' : 'ABSENT';
        if (status === 'EXCUSED')
          justification = pick(['Certificat médical', 'Rendez-vous médical', 'Raison familiale']);
      } else if (r < pAbsent + 0.04) {
        status = 'LATE';
      }
      attendance.push({ studentId: st.id, date: day, status, justification, markedById: ownerId });
    }
  }
  for (let i = 0; i < attendance.length; i += 500) {
    await prisma.attendance.createMany({ data: attendance.slice(i, i + 500) });
  }
  console.log(`  ${attendance.length} présences sur ${schoolDays.length} jours`);

  // Fees: per-class structure, 3 tranches, ledger of payments + a few disputes.
  const trancheDefs = [
    { order: 1, label: '1ère Tranche - Octobre', share: 0.4, due: utc(yearStart, 10, 15) },
    { order: 2, label: '2ème Tranche - Janvier', share: 0.3, due: utc(yearStart + 1, 1, 15) },
    { order: 3, label: '3ème Tranche - Avril', share: 0.3, due: utc(yearStart + 1, 4, 15) },
  ];
  const payments: Prisma.FeePaymentCreateManyInput[] = [];
  const disputes: Prisma.FeeDisputeCreateManyInput[] = [];
  const METHODS = ['ESPECES', 'ESPECES', 'MONCASH', 'NATCASH', 'CHEQUE', 'VIREMENT'] as const;
  for (const c of classes) {
    const total = c.seed.annualFee;
    const structure = await prisma.feeStructure.create({
      data: {
        schoolId,
        classId: c.id,
        totalAmount: total,
        registrationFee: 3_500,
        tranches: {
          create: trancheDefs.map((t) => ({
            order: t.order,
            label: t.label,
            amount: Math.round((total * t.share) / 100) * 100,
            dueDate: t.due,
            latePenaltyPercent: 5,
            latePenaltyGraceDays: 15,
          })),
        },
      },
      select: { tranches: { select: { id: true, order: true, amount: true, dueDate: true } } },
    });
    const tranches = [...structure.tranches].sort((a, b) => a.order - b.order);
    for (const st of students) {
      if (st.classIdx !== classes.indexOf(c)) continue;
      tranches.forEach((tr, i) => {
        const due = tr.dueDate;
        const isDue = due <= today;
        const isLast = i === tranches.length - 1;
        // Scholarship holders: the school waives the fee — nothing in the ledger.
        if (st.scholarship) return;
        let pay: 'full' | 'half' | 'none';
        if (!isDue) pay = chance(0.15) ? 'full' : 'none';
        else if (st.payer === 'uptodate') pay = 'full';
        else if (st.payer === 'partial') pay = isLast && isDue ? 'half' : 'full';
        else pay = isLast && isDue ? 'none' : chance(0.5) ? 'full' : 'half';
        if (pay === 'none') {
          if (isDue && chance(0.25)) {
            disputes.push({
              studentId: st.id,
              feeTrancheId: tr.id,
              reason: pick([
                'Montant contesté par la famille',
                'Reçu manquant',
                'Paiement effectué à l’école, non enregistré',
              ]),
              openedById: ownerId,
              openedAt: new Date(Math.min(addDays(due, int(3, 20)).getTime(), today.getTime())),
              resolvedAt: chance(0.4) ? addDays(due, int(21, 40)) : null,
            });
          }
          return;
        }
        const method = pick(METHODS);
        const late = st.payer === 'late' && isDue && chance(0.6);
        const paidAt = late ? addDays(due, int(16, 45)) : addDays(due, -int(0, 25));
        const amount = pay === 'full' ? tr.amount : Math.round(tr.amount / 2 / 100) * 100;
        payments.push({
          schoolId,
          studentId: st.id,
          feeTrancheId: tr.id,
          amount,
          penaltyAmount: late ? Math.round((tr.amount * 5) / 100) : 0,
          method,
          reference:
            method === 'ESPECES'
              ? null
              : `${method.slice(0, 3)}-${yyyymmdd(paidAt)}-${int(1000, 9999)}`,
          notes: pay === 'half' ? 'Paiement partiel — solde à venir.' : null,
          paidAt: paidAt > today ? today : paidAt,
          recordedById: ownerId,
        });
      });
    }
  }
  await prisma.feePayment.createMany({ data: payments });
  await prisma.feeDispute.createMany({ data: disputes });
  await prisma.feeAutomationSettings.create({
    data: { schoolId, lateFeeEnabled: true, autoRemindersEnabled: true, currency: 'HTG' },
  });
  console.log(`  ${payments.length} paiements, ${disputes.length} litiges`);

  // Kindergarten (livret préscolaire) — spec §8/§12/§13. Deliberately built
  // outside LEVELS/CLASSES/SUBJECTS (Ruling R1): the birth-year formula, the
  // GradeLevel.order = 0 requirement, and "a qualitative subject must never
  // get a numeric Evaluation" would each need special-casing inside the
  // generic pipeline otherwise. teacherId/roomId reuse the 'silien'/'Salle
  // Maternelle' entries appended to TEACHERS/ROOMS above.
  const livretTemplate = await prisma.bulletinTemplate.findFirst({
    where: { schoolId: null, name: 'Livret préscolaire' },
    select: { id: true },
  });
  const kinderLevel = await prisma.gradeLevel.create({
    data: {
      schoolId,
      name: 'Kindergarten',
      order: 0,
      bulletinTemplateId: livretTemplate?.id ?? null,
    },
    select: { id: true },
  });
  const kinderClass = await prisma.class.create({
    data: {
      schoolId,
      academicYearId: yearId,
      name: 'Kindergarten A',
      level: 'Kindergarten',
      gradeLevelId: kinderLevel.id,
      room: 'Salle Maternelle',
      roomId: roomId.get('Salle Maternelle') ?? null,
      capacity: 20,
      color: '#fbbf24',
      track: null,
      homeroomTeacherId: tid('silien'),
    },
    select: { id: true },
  });

  const COMPORTEMENT_CRITERIA = [
    'Serviable',
    'Obéissant',
    'Attentif (ve)',
    'Généreux (se)',
    'Ordonné (e)',
    'Propre',
    'Poli (e)',
    'Agressif (ve)',
    'Timide',
    'Gai (e)',
    'Bavard (e)',
    'Remuant (e)',
    'Somnolent (e)',
  ];
  const PHYSIQUE_CRITERIA = [
    'Exercices physiques',
    'Rythmique',
    'Perception visuelle',
    'Perception auditive',
    'Sens du toucher, du goût de l’odorat',
    'Dessin – peinture',
    'Coloriage',
    'Découpage - collage',
    'Modelage',
    'Travaux manuels',
  ];
  const INTELLECTUEL_CRITERIA = [
    'Langage',
    'Poésie',
    'Chant',
    'Imagination',
    'Observation',
    'Schéma corporel',
    'Exercices sensoriels',
    'Connaissances des formes',
    'Orientation spatiale',
    'Orientation temporelle',
    'Pré-lecture',
    'Pré-écriture',
    'Graphisme',
    'Pré-calcul',
    'Comptage',
    'Bible',
  ];
  const COMPORTEMENT_SCALE = ['Toujours', 'Souvent', 'Parfois', 'Jamais'];
  const DEVELOPPEMENT_SCALE = ['Excellent', 'Très bien', 'Bien', 'Assez bien'];

  const comportement = await prisma.subject.create({
    data: {
      schoolId,
      name: 'Comportement',
      domain: 'Développement',
      level: 'Kindergarten',
      kind: 'REQUIRED',
      evaluationMode: 'QUALITATIVE',
      ratingScale: COMPORTEMENT_SCALE,
      responsibleTeacherId: tid('silien'),
    },
    select: { id: true },
  });
  const developpementPhysique = await prisma.subject.create({
    data: {
      schoolId,
      name: 'Développement physique',
      domain: 'Développement',
      level: 'Kindergarten',
      kind: 'REQUIRED',
      evaluationMode: 'QUALITATIVE',
      ratingScale: DEVELOPPEMENT_SCALE,
      responsibleTeacherId: tid('silien'),
    },
    select: { id: true },
  });
  const developpementIntellectuel = await prisma.subject.create({
    data: {
      schoolId,
      name: 'Développement intellectuel',
      domain: 'Développement',
      level: 'Kindergarten',
      kind: 'REQUIRED',
      evaluationMode: 'QUALITATIVE',
      ratingScale: DEVELOPPEMENT_SCALE,
      responsibleTeacherId: tid('silien'),
    },
    select: { id: true },
  });

  await prisma.subjectCriterion.createMany({
    data: [
      ...COMPORTEMENT_CRITERIA.map((label, i) => ({
        subjectId: comportement.id,
        label,
        order: i + 1,
      })),
      ...PHYSIQUE_CRITERIA.map((label, i) => ({
        subjectId: developpementPhysique.id,
        label,
        order: i + 1,
      })),
      ...INTELLECTUEL_CRITERIA.map((label, i) => ({
        subjectId: developpementIntellectuel.id,
        label,
        order: i + 1,
      })),
    ],
  });
  const [comportementCriteria, physiqueCriteria, intellectuelCriteria] = await Promise.all([
    prisma.subjectCriterion.findMany({
      where: { subjectId: comportement.id },
      orderBy: { order: 'asc' },
      select: { id: true },
    }),
    prisma.subjectCriterion.findMany({
      where: { subjectId: developpementPhysique.id },
      orderBy: { order: 'asc' },
      select: { id: true },
    }),
    prisma.subjectCriterion.findMany({
      where: { subjectId: developpementIntellectuel.id },
      orderBy: { order: 'asc' },
      select: { id: true },
    }),
  ]);

  // Created sequentially (not Promise.all) so createdAt ordering is
  // deterministic — loadPublishedGrids (student-views/criteria.ts) orders
  // grids by classSubject.createdAt asc, and the livret template expects
  // Comportement, then Développement physique, then Développement
  // intellectuel, matching the source document's order.
  const csComportement = await prisma.classSubject.create({
    data: { classId: kinderClass.id, subjectId: comportement.id, teacherId: tid('silien') },
    select: { id: true },
  });
  const csPhysique = await prisma.classSubject.create({
    data: {
      classId: kinderClass.id,
      subjectId: developpementPhysique.id,
      teacherId: tid('silien'),
    },
    select: { id: true },
  });
  const csIntellectuel = await prisma.classSubject.create({
    data: {
      classId: kinderClass.id,
      subjectId: developpementIntellectuel.id,
      teacherId: tid('silien'),
    },
    select: { id: true },
  });

  const kinderBirthYear = yearStart - 5;
  const kinderStudentInputs: Prisma.StudentCreateManyInput[] = [];
  for (let i = 0; i < 6; i++) {
    const female = chance(0.5);
    let firstName = '';
    let lastName = '';
    do {
      firstName = pick(female ? FIRST_NAMES_F : FIRST_NAMES_M);
      lastName = pick(LAST_NAMES);
    } while (usedNames.has(`${firstName} ${lastName}`));
    usedNames.add(`${firstName} ${lastName}`);
    counter += 1;
    kinderStudentInputs.push({
      schoolId,
      studentNumber: `EL-${yearStart}-${String(counter).padStart(3, '0')}`,
      firstName,
      lastName,
      gender: female ? 'Féminin' : 'Masculin',
      dateOfBirth: utc(kinderBirthYear - (chance(0.25) ? 1 : 0), int(1, 12), int(1, 28)),
      placeOfBirth: pick([
        'Port-au-Prince',
        'Pétion-Ville',
        'Cap-Haïtien',
        'Les Cayes',
        'Jacmel',
        'Gonaïves',
      ]),
      nationality: 'Haïtienne',
      address: `${pick(NEIGHBOURHOODS)}, Port-au-Prince`,
      motherTongue: pick(['Créole', 'Créole', 'Français']),
      enrollmentType: 'Nouvelle inscription',
      scholarship: chance(0.08),
      enrolledAt: addDays(cal.start, int(-20, 10)),
      status: 'ENROLLED',
    });
  }
  await prisma.student.createMany({ data: kinderStudentInputs });
  const kinderStudents = await prisma.student.findMany({
    where: { schoolId, studentNumber: { in: kinderStudentInputs.map((s) => s.studentNumber) } },
    orderBy: { studentNumber: 'asc' },
    select: { id: true, firstName: true, lastName: true },
  });

  const kinderGuardians: Prisma.GuardianCreateManyInput[] = kinderStudents.map((s) => {
    const motherFirst = pick(GUARDIAN_FIRST_F);
    return {
      studentId: s.id,
      name: `${motherFirst} ${s.lastName}`,
      relationship: 'Mère',
      phone: PHONE(),
      email: chance(0.6) ? `${slugName(motherFirst)}.${slugName(s.lastName)}@gmail.com` : null,
      profession: pick(PROFESSIONS),
      isPrimary: true,
    };
  });
  await prisma.guardian.createMany({ data: kinderGuardians });
  await prisma.enrollment.createMany({
    data: kinderStudents.map((s) => ({
      studentId: s.id,
      classId: kinderClass.id,
      academicYearId: yearId,
      enrolledAt: cal.start,
    })),
  });
  console.log(
    `  Kindergarten : niveau, classe, 3 matières qualitatives, ${kinderStudents.length} élèves`,
  );

  const term1 = at(terms, 0);
  const [assessComportement, assessPhysique, assessIntellectuel] = await Promise.all([
    prisma.criteriaAssessment.create({
      data: { classSubjectId: csComportement.id, termId: term1.id, status: 'PUBLISHED' },
      select: { id: true },
    }),
    prisma.criteriaAssessment.create({
      data: { classSubjectId: csPhysique.id, termId: term1.id, status: 'PUBLISHED' },
      select: { id: true },
    }),
    prisma.criteriaAssessment.create({
      data: { classSubjectId: csIntellectuel.id, termId: term1.id, status: 'PUBLISHED' },
      select: { id: true },
    }),
  ]);
  const kinderRatings: Prisma.CriteriaRatingCreateManyInput[] = [];
  for (const grid of [
    { assessmentId: assessComportement.id, criteria: comportementCriteria },
    { assessmentId: assessPhysique.id, criteria: physiqueCriteria },
    { assessmentId: assessIntellectuel.id, criteria: intellectuelCriteria },
  ]) {
    for (const student of kinderStudents) {
      for (const criterion of grid.criteria) {
        kinderRatings.push({
          assessmentId: grid.assessmentId,
          studentId: student.id,
          criterionId: criterion.id,
          level: int(0, 3),
        });
      }
    }
  }
  await prisma.criteriaRating.createMany({ data: kinderRatings });

  const KINDER_APPRECIATIONS = [
    'Une session bien remplie : l’enfant participe avec entrain et progresse à son rythme.',
    'Bon trimestre dans l’ensemble, de la curiosité et de bons progrès au fil des semaines.',
  ];
  await prisma.appreciation.createMany({
    data: kinderStudents.map((s) => ({
      studentId: s.id,
      termId: term1.id,
      subjectId: null,
      mention: 'BIEN',
      text: pick(KINDER_APPRECIATIONS),
      comportement: pick(['Excellent', 'Satisfaisant']),
      investissement: pick(['Excellent', 'Satisfaisant']),
      assiduite: 'Régulier',
      status: 'PUBLISHED',
      authorId: ownerId,
    })),
  });
  console.log('  feuilles de critères publiées, trimestre 1');

  // Active bulletin template = a fork of the global "Académique Vert".
  const source = await prisma.bulletinTemplate.findFirst({
    where: { schoolId: null, name: 'Académique Vert' },
    select: { id: true, name: true, description: true, config: true },
  });
  if (source) {
    await prisma.bulletinTemplate.create({
      data: {
        schoolId,
        name: `${source.name} — Les Étoiles`,
        description: source.description,
        isActive: true,
        forkedFromId: source.id,
        config: source.config as Prisma.InputJsonValue,
      },
    });
  }

  // SaaS subscription: PRO (Établissement Pro), ACTIVE since ~6 months,
  // monthly invoices — a manual/back-office subscription (no Stripe ids), so
  // the Abonnement tab renders the "Pro géré manuellement" state.
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { key: 'PRO' },
    select: { id: true, pricePerStudentCents: true },
  });
  if (plan) {
    const startedAt = addDays(today, -185);
    const monthly = students.length * plan.pricePerStudentCents;
    const sub = await prisma.subscription.create({
      data: {
        schoolId,
        planId: plan.id,
        status: 'ACTIVE',
        startedAt,
        trialEndsAt: addDays(startedAt, 14),
        renewsAt: nextMonthStart(today),
        statusChanges: {
          create: [
            { fromStatus: null, toStatus: 'TRIAL', createdAt: startedAt },
            { fromStatus: 'TRIAL', toStatus: 'ACTIVE', createdAt: addDays(startedAt, 14) },
          ],
        },
      },
      select: { id: true },
    });
    const txs: Prisma.BillingTransactionCreateManyInput[] = [];
    for (let m = 5; m >= 0; m--) {
      const periodStart = monthStart(addMonths(today, -m));
      if (periodStart < startedAt) continue;
      const paidAt = addDays(periodStart, int(1, 5));
      const failed = m === 2;
      txs.push({
        reference: `TXN-${yyyymmdd(paidAt)}-${String(int(1, 9999)).padStart(4, '0')}`,
        schoolId,
        subscriptionId: sub.id,
        amountCents: monthly,
        method: m % 3 === 0 ? 'BANK_TRANSFER' : 'MANUAL',
        status: failed ? 'FAILED' : 'SUCCEEDED',
        paidAt,
        periodStart,
      });
      if (failed) {
        const retryAt = addDays(paidAt, 3);
        txs.push({
          reference: `TXN-${yyyymmdd(retryAt)}-${String(int(1, 9999)).padStart(4, '0')}`,
          schoolId,
          subscriptionId: sub.id,
          amountCents: monthly,
          method: 'MANUAL',
          status: 'SUCCEEDED',
          paidAt: retryAt,
          periodStart,
        });
      }
    }
    await prisma.billingTransaction.createMany({ data: txs });
  }

  // Login history for the owner (admin activity heatmap / retention KPIs).
  const logins: Prisma.LoginEventCreateManyInput[] = [];
  for (let d = 0; d < 45; d++) {
    const day = addDays(today, -d);
    if (isWeekday(day) ? chance(0.7) : chance(0.2)) {
      logins.push({ userId: ownerId, createdAt: new Date(day.getTime() + int(7, 18) * 3_600_000) });
    }
  }
  await prisma.loginEvent.createMany({ data: logins });
  await prisma.user.update({ where: { id: ownerId }, data: { lastLoginAt: addDays(now, -1) } });

  // Timetable: a weekly template per class (teacher/room conflict-free),
  // materialised over the current week ± 2 weeks, inside the school year.
  const sessions = buildTimetable(
    classes.map((c) => ({ id: c.id, seed: c.seed, subjects: c.subjects })),
    {
      schoolId,
      academicYearId: yearId,
      today,
      yearStart: cal.start,
      yearEnd: cal.end,
      sid,
      tid,
      rid: (name) => roomId.get(name),
    },
  );
  for (let i = 0; i < sessions.length; i += 500) {
    await prisma.timetableSession.createMany({ data: sessions.slice(i, i + 500) });
  }
  console.log(`  ${sessions.length} séances d’emploi du temps`);
}

function monthStart(d: Date): Date {
  return utc(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}
function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, Math.min(d.getUTCDate(), 28)));
}
function nextMonthStart(d: Date): Date {
  return monthStart(addMonths(monthStart(d), 1));
}

interface TimetableClass {
  id: string;
  seed: ClassSeed;
  subjects: { key: string; classSubjectId: string; teacherKey: string }[];
}
interface TimetableCtx {
  schoolId: string;
  academicYearId: string;
  today: Date;
  yearStart: Date;
  yearEnd: Date;
  sid: (key: string) => string;
  tid: (key: string) => string;
  /** Catalogue room id for a room label — undefined for a free-text place. */
  rid?: (name: string) => string | undefined;
}

// Exported for the companion test (pure — no DB).
export function buildTimetable(
  classes: TimetableClass[],
  ctx: TimetableCtx,
): Prisma.TimetableSessionCreateManyInput[] {
  const teacherBusy = new Set<string>(); // `${teacherKey}|${day}|${slot}`
  const roomBusy = new Set<string>(); // `${room}|${day}|${slot}`
  const out: Prisma.TimetableSessionCreateManyInput[] = [];
  const monday = mondayOf(ctx.today);
  const weeks = [-2, -1, 0, 1, 2].map((w) => addDays(monday, w * 7));

  classes.forEach((c, classIdx) => {
    const classBusy = new Set<string>(); // `${day}|${slot}`
    const bySubject = new Map(SUBJECTS.map((s) => [s.key, s]));
    // Heaviest subjects first so they get the spread-out slots.
    const ordered = [...c.subjects].sort(
      (a, b) => (bySubject.get(b.key)?.hours ?? 0) - (bySubject.get(a.key)?.hours ?? 0),
    );
    ordered.forEach((cs, subjIdx) => {
      const subject = bySubject.get(cs.key);
      if (!subject) return;
      const room = subject.room ?? c.seed.room;
      let remaining = subject.hours;
      // Blocks: 2h when the subject has ≥ 3h/week (one double per week), else 1h.
      const blocks: (1 | 2)[] = [];
      if (remaining >= 3) {
        blocks.push(2);
        remaining -= 2;
      }
      while (remaining > 0) {
        blocks.push(1);
        remaining -= 1;
      }
      let dayCursor = (classIdx + subjIdx) % WEEKDAYS.length;
      while (blocks.length > 0) {
        const length = blocks.shift() ?? 1;
        let placed: Slot | null = null;
        for (let attempt = 0; attempt < WEEKDAYS.length && !placed; attempt++) {
          const day = at(WEEKDAYS, (dayCursor + attempt) % WEEKDAYS.length);
          const halves: readonly (readonly number[])[] = chance(0.65)
            ? [MORNING, AFTERNOON]
            : [AFTERNOON, MORNING];
          for (const half of halves) {
            for (let i = 0; i + length <= half.length && !placed; i++) {
              const slots = half.slice(i, i + length);
              const free = slots.every(
                (s) =>
                  !classBusy.has(`${day}|${s}`) &&
                  !teacherBusy.has(`${cs.teacherKey}|${day}|${s}`) &&
                  !roomBusy.has(`${room}|${day}|${s}`),
              );
              if (free) placed = { day, slot: at(slots, 0), length };
            }
            if (placed) break;
          }
        }
        if (!placed) {
          // A 2h block that fits nowhere is split into two 1h blocks; a 1h
          // block that fits nowhere is dropped rather than overlapping.
          if (length === 2) blocks.push(1, 1);
          continue;
        }
        dayCursor = (WEEKDAYS.indexOf(placed.day) + 1) % WEEKDAYS.length;
        for (let k = 0; k < placed.length; k++) {
          classBusy.add(`${placed.day}|${placed.slot + k}`);
          teacherBusy.add(`${cs.teacherKey}|${placed.day}|${placed.slot + k}`);
          roomBusy.add(`${room}|${placed.day}|${placed.slot + k}`);
        }
        const seriesId = `seed-${c.id.slice(-6)}-${cs.key}-${placed.day}-${placed.slot}`;
        const startMinutes = at(SLOT_STARTS, placed.slot);
        const endMinutes = startMinutes + placed.length * 60;
        const type =
          subject.type !== 'TP' ? 'CM' : placed.length === 2 || chance(0.5) ? 'TP' : 'TD';
        for (const weekMonday of weeks) {
          const date = addDays(weekMonday, placed.day - 1);
          if (date < ctx.yearStart || date > ctx.yearEnd) continue;
          out.push({
            schoolId: ctx.schoolId,
            academicYearId: ctx.academicYearId,
            classId: c.id,
            subjectId: ctx.sid(cs.key),
            teacherId: ctx.tid(cs.teacherKey),
            room,
            roomId: ctx.rid?.(room) ?? null,
            type,
            // No per-session override: the grid paints the subject's own
            // colour, so recolouring a subject in Configuration recolours
            // its sessions. (Copying `subject.color` here froze every seeded
            // session to the colour of the day.)
            color: null,
            date,
            startMinutes,
            endMinutes,
            seriesId,
            description: type === 'TP' ? 'Séance de travaux pratiques' : null,
          });
        }
      }
    });
  });
  return out;
}

async function seedHelp(prisma: PrismaClient, ownerId: string, now: Date): Promise<void> {
  console.log(`— ${HELP.name} (vide)`);
  const { schoolId } = await createTenant(prisma, {
    slug: HELP.slug,
    name: HELP.name,
    shortName: HELP.shortName,
    ownerId,
    city: 'Cap-Haïtien',
    estimatedStudents: 120,
    statute: 'École communautaire',
    officialCode: 'MENFP-NOR-2021-0088',
    officialEmail: 'info@help-haiti.org',
    website: null,
    address: 'Rue 17 B, Cap-Haïtien',
  });
  await createYearWithTerms(prisma, schoolId, now);
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { key: 'STARTER' },
    select: { id: true },
  });
  if (plan) {
    const today = startOfUtcDay(now);
    await prisma.subscription.create({
      data: {
        schoolId,
        planId: plan.id,
        status: 'TRIAL',
        startedAt: addDays(today, -4),
        trialEndsAt: addDays(today, 10),
        renewsAt: addDays(today, 10),
        statusChanges: {
          create: [{ fromStatus: null, toStatus: 'TRIAL', createdAt: addDays(today, -4) }],
        },
      },
    });
  }
}

// CLI entrypoint guard — mirrors seed-dev.ts.
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
