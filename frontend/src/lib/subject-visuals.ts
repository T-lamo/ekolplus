// Per-subject icon + color, matching the Banani mockups pixel-for-pixel for
// the known demo subjects (matieres-list.md / affectations.md / coefficients-config.md).
// Unknown subjects (a real school typing its own curriculum) fall back to a
// deterministic color from a small rotating palette so the UI never looks
// broken for names outside the Banani demo set.
import {
  Atom,
  Book,
  BookOpen,
  Brush,
  Calculator,
  Dumbbell,
  FlaskConical,
  Globe,
  Landmark,
  Languages,
  LayoutDashboard,
  Map as MapIcon,
  Microscope,
  Monitor,
  Music,
  PencilRuler,
  Star,
  type LucideIcon,
} from 'lucide-react';

export interface SubjectVisual {
  Icon: LucideIcon;
  iconBg: string;
  iconFg: string;
  badgeBg: string;
  badgeFg: string;
}

// The 16 icons offered by the subject form's "Apparence" card
// (add-matiere.md) — `Subject.icon` stores one of these keys.
export const SUBJECT_ICONS: { key: string; Icon: LucideIcon }[] = [
  { key: 'calculator', Icon: Calculator },
  { key: 'flask-conical', Icon: FlaskConical },
  { key: 'book', Icon: Book },
  { key: 'globe', Icon: Globe },
  { key: 'landmark', Icon: Landmark },
  { key: 'music', Icon: Music },
  { key: 'dumbbell', Icon: Dumbbell },
  { key: 'monitor', Icon: Monitor },
  { key: 'pencil-ruler', Icon: PencilRuler },
  { key: 'atom', Icon: Atom },
  { key: 'map', Icon: MapIcon },
  { key: 'brush', Icon: Brush },
  { key: 'microscope', Icon: Microscope },
  { key: 'languages', Icon: Languages },
  { key: 'star', Icon: Star },
  { key: 'layout-dashboard', Icon: LayoutDashboard },
];

// The 10 accent swatches of the same card — `Subject.color` stores the hex.
export const SUBJECT_COLORS = [
  '#2563eb',
  '#7c3aed',
  '#388e3c',
  '#c2185b',
  '#e65100',
  '#00897b',
  '#f59e0b',
  '#ad1457',
  '#1976d2',
  '#455a64',
] as const;

const ICON_BY_KEY = new Map(SUBJECT_ICONS.map((i) => [i.key, i.Icon]));

/** Light tint of an accent color for the icon chip background. */
export function tintOf(color: string): string {
  return `color-mix(in srgb, ${color} 12%, white)`;
}

const KNOWN: Record<string, SubjectVisual> = {
  mathématiques: {
    Icon: Calculator,
    iconBg: '#e0f0ff',
    iconFg: '#2563eb',
    badgeBg: '#e0f0ff',
    badgeFg: '#2563eb',
  },
  'sciences de la vie et de la terre': {
    Icon: FlaskConical,
    iconBg: '#e8f5e9',
    iconFg: '#388e3c',
    badgeBg: '#e0f7f4',
    badgeFg: '#00897b',
  },
  français: {
    Icon: BookOpen,
    iconBg: '#fce4ec',
    iconFg: '#c2185b',
    badgeBg: '#ececf3',
    badgeFg: '#8884a0',
  },
  anglais: {
    Icon: Globe,
    iconBg: '#e3f2fd',
    iconFg: '#1976d2',
    badgeBg: '#ececf3',
    badgeFg: '#8884a0',
  },
  'histoire-géographie': {
    Icon: Landmark,
    iconBg: '#fff3e0',
    iconFg: '#e65100',
    badgeBg: '#fff3e0',
    badgeFg: '#e65100',
  },
  informatique: {
    Icon: Monitor,
    iconBg: '#ede9fb',
    iconFg: '#6c4cff',
    badgeBg: '#ede9fb',
    badgeFg: '#6c4cff',
  },
  'éducation musicale': {
    Icon: Music,
    iconBg: '#fce4ec',
    iconFg: '#ad1457',
    badgeBg: '#ececf3',
    badgeFg: '#8884a0',
  },
  'éducation physique et sportive': {
    Icon: Dumbbell,
    iconBg: '#e8f5e9',
    iconFg: '#388e3c',
    badgeBg: '#ececf3',
    badgeFg: '#8884a0',
  },
};

const FALLBACK_PALETTE: { iconBg: string; iconFg: string }[] = [
  { iconBg: '#e0f0ff', iconFg: '#2563eb' },
  { iconBg: '#e8f5e9', iconFg: '#388e3c' },
  { iconBg: '#fce4ec', iconFg: '#c2185b' },
  { iconBg: '#fff3e0', iconFg: '#e65100' },
  { iconBg: '#ede9fb', iconFg: '#6c4cff' },
  { iconBg: '#e3f2fd', iconFg: '#1976d2' },
];

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash);
}

/**
 * Icon + colors for a subject. An icon/color chosen on the subject form
 * (stored on the row) wins over the name-derived defaults; each half falls
 * back independently so a subject with only a color still gets its default
 * icon and vice-versa.
 */
export function getSubjectVisual(
  name: string,
  stored?: { icon?: string | null; color?: string | null },
): SubjectVisual {
  const known = KNOWN[name.trim().toLowerCase()];
  const p = FALLBACK_PALETTE[hashString(name) % FALLBACK_PALETTE.length]!;
  const base: SubjectVisual = known ?? {
    Icon: BookOpen,
    iconBg: p.iconBg,
    iconFg: p.iconFg,
    badgeBg: '#ececf3',
    badgeFg: '#8884a0',
  };
  const Icon = (stored?.icon && ICON_BY_KEY.get(stored.icon)) || base.Icon;
  if (stored?.color) {
    return { ...base, Icon, iconBg: tintOf(stored.color), iconFg: stored.color };
  }
  return { ...base, Icon };
}

const DOT_PALETTE = ['#6c2bd9', '#2563eb', '#1a9e5c', '#f59e0b', '#d93025', '#00897b', '#ad1457'];

export function getClassDotColor(seed: string): string {
  return DOT_PALETTE[hashString(seed) % DOT_PALETTE.length]!;
}
