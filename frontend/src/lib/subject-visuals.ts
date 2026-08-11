// Per-subject icon + color, matching the Banani mockups pixel-for-pixel for
// the known demo subjects (matieres-list.md / affectations.md / coefficients-config.md).
// Unknown subjects (a real school typing its own curriculum) fall back to a
// deterministic color from a small rotating palette so the UI never looks
// broken for names outside the Banani demo set.
import {
  BookOpen,
  Calculator,
  Dumbbell,
  FlaskConical,
  Globe,
  Landmark,
  Monitor,
  Music,
  type LucideIcon,
} from 'lucide-react';

export interface SubjectVisual {
  Icon: LucideIcon;
  iconBg: string;
  iconFg: string;
  badgeBg: string;
  badgeFg: string;
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

export function getSubjectVisual(name: string): SubjectVisual {
  const known = KNOWN[name.trim().toLowerCase()];
  if (known) return known;
  const p = FALLBACK_PALETTE[hashString(name) % FALLBACK_PALETTE.length]!;
  return {
    Icon: BookOpen,
    iconBg: p.iconBg,
    iconFg: p.iconFg,
    badgeBg: '#ececf3',
    badgeFg: '#8884a0',
  };
}

const DOT_PALETTE = ['#6c2bd9', '#2563eb', '#1a9e5c', '#f59e0b', '#d93025', '#00897b', '#ad1457'];

export function getClassDotColor(seed: string): string {
  return DOT_PALETTE[hashString(seed) % DOT_PALETTE.length]!;
}
