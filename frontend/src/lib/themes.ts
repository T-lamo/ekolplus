// Colour themes — registry shared by the CSS (globals.css `[data-theme]`
// blocks), the pre-paint script in app/layout.tsx, the ThemeProvider and the
// « Apparence » pickers (school settings + SaaS admin settings).
//
// A theme only re-skins the BRAND tokens (primary, secondary, accent, the
// dark sidebar / login panel, the page tints). Semantic status colours
// (success / warning / destructive / info / gold) and data colours (subjects,
// avatars, charts, bulletins) stay the same in every theme on purpose — a
// red alert must read as red whatever the user picked.
//
// The token VALUES live in globals.css only (single source of truth);
// `swatch` below is a 3-colour preview for the picker tile and
// src/lib/themes.test.ts asserts it matches the CSS, and that every colour
// pair the UI relies on clears WCAG AA (4.5:1) in every theme.
//
// Client-safe: no server imports.

export const THEME_KEYS = ['lavande', 'ocean', 'foret', 'ardoise', 'terracotta'] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];

export const DEFAULT_THEME: ThemeKey = 'lavande';

/** `<html data-theme="…">` — read by the CSS and by the pre-paint script. */
export const THEME_ATTR = 'data-theme';
/** localStorage key mirrored by the pre-paint script (no flash on reload). */
export const THEME_STORAGE_KEY = 'sg-theme';

export interface ThemeDef {
  key: ThemeKey;
  label: string;
  description: string;
  /** Picker tile preview — must equal the CSS tokens of the theme. */
  swatch: { primary: string; secondary: string; sidebarDark: string };
}

export const THEMES: readonly ThemeDef[] = [
  {
    key: 'lavande',
    label: 'Lavande',
    description: 'Le thème Schoolgesti d’origine — violet profond, fonds gris-lilas.',
    swatch: { primary: '#6c2bd9', secondary: '#ede9fb', sidebarDark: '#16102e' },
  },
  {
    key: 'ocean',
    label: 'Océan',
    description: 'Bleu marine posé, fonds gris-bleu — sobre et institutionnel.',
    swatch: { primary: '#1e40af', secondary: '#dbe7fe', sidebarDark: '#0e1b3d' },
  },
  {
    key: 'foret',
    label: 'Forêt',
    description: 'Vert émeraude, fonds gris-vert — calme et naturel.',
    swatch: { primary: '#047857', secondary: '#d3f3e4', sidebarDark: '#0b2a21' },
  },
  {
    key: 'ardoise',
    label: 'Ardoise',
    description: 'Gris-bleu neutre — discret, idéal pour les longues sessions.',
    swatch: { primary: '#334155', secondary: '#e2e8f0', sidebarDark: '#0f172a' },
  },
  {
    key: 'terracotta',
    label: 'Terre cuite',
    description: 'Orange brûlé, fonds sable — chaleureux et contrasté.',
    swatch: { primary: '#b4400f', secondary: '#fde8d8', sidebarDark: '#2e1a10' },
  },
];

export function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === 'string' && (THEME_KEYS as readonly string[]).includes(value);
}

/** Normalises any stored/received value to a known theme (default otherwise). */
export function resolveThemeKey(value: unknown): ThemeKey {
  return isThemeKey(value) ? value : DEFAULT_THEME;
}

/** Stamps the theme on `<html>` — the default theme removes the attribute
 * so the base `@theme` tokens apply untouched. */
export function applyThemeToDocument(doc: Document, theme: ThemeKey): void {
  if (theme === DEFAULT_THEME) doc.documentElement.removeAttribute(THEME_ATTR);
  else doc.documentElement.setAttribute(THEME_ATTR, theme);
}

/**
 * Inline script run in <head> BEFORE the first paint: re-applies the theme
 * saved in localStorage so a reload never flashes the default colours.
 * Kept dependency-free and tiny; the attribute/keys are injected from the
 * constants above so they cannot drift. CSP allows inline scripts (see
 * next.config.ts — the App Router's own hydration payload needs it).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t&&t!==${JSON.stringify(DEFAULT_THEME)}&&${JSON.stringify(
  THEME_KEYS,
)}.indexOf(t)>-1){document.documentElement.setAttribute(${JSON.stringify(
  THEME_ATTR,
)},t)}}catch(e){}})();`;
