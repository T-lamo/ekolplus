// Colour themes — the accessibility guard behind « Apparence ».
//
// Reads app/globals.css (the single source of truth for token values),
// resolves every theme (base `@theme` + its `[data-theme]` overrides) and
// asserts that each text/background pair the UI relies on clears WCAG AA
// (4.5:1) — the same check Lighthouse's `color-contrast` audit runs. Also
// keeps the TS registry (picker swatches, keys) and the CSS from drifting.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_THEME,
  THEMES,
  THEME_ATTR,
  THEME_INIT_SCRIPT,
  THEME_KEYS,
  THEME_STORAGE_KEY,
  isThemeKey,
  resolveThemeKey,
} from './themes';

const css = readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8');

type Tokens = Record<string, string>;

function parseBlock(body: string): Tokens {
  const out: Tokens = {};
  for (const m of body.matchAll(/--color-([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1]!] = m[2]!.toLowerCase();
  }
  return out;
}

function baseTokens(): Tokens {
  const m = css.match(/@theme\s*\{([\s\S]*?)\n\}/);
  if (!m) throw new Error('@theme block not found in globals.css');
  return parseBlock(m[1]!);
}

function themeOverrides(key: string): Tokens | null {
  const re = new RegExp(`:root\\[${THEME_ATTR}=['"]${key}['"]\\]\\s*\\{([\\s\\S]*?)\\n\\}`);
  const m = css.match(re);
  return m ? parseBlock(m[1]!) : null;
}

// ── WCAG 2.x relative luminance / contrast ──────────────────────────────
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function rgb(hex: string): [number, number, number] {
  const n = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)) as [number, number, number];
}
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
/** `fg` at `alpha` composited over `bg` (what `text-white/50` renders as). */
function blend(fg: string, alpha: number, bg: string): string {
  const f = rgb(fg);
  const g = rgb(bg);
  return (
    '#' +
    f
      .map((c, i) =>
        Math.round(c * alpha + g[i]! * (1 - alpha))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

// Tokens a theme MUST override — one forgotten token = the previous brand
// colour leaking into the new theme (a lavender sidebar under a blue app).
const THEMED_TOKENS = [
  'background',
  'foreground',
  'border',
  'muted',
  'muted-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'accent',
  'accent-foreground',
  'primary-gradient-end',
  'card-foreground',
  'sidebar-light-foreground',
  'sidebar-dark',
  'sidebar-dark-foreground',
].sort();

// [text token, background token] — every pairing the app actually renders.
const TEXT_PAIRS: Array<[string, string]> = [
  ['primary', 'card'], // text-primary on cards, links, icons
  ['primary', 'background'],
  ['primary', 'secondary'], // active nav item, chips
  ['primary', 'muted'],
  ['primary-foreground', 'primary'], // buttons
  ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'muted'],
  ['muted-foreground', 'secondary'],
  ['foreground', 'background'],
  ['foreground', 'card'],
  ['foreground', 'secondary'],
  ['foreground', 'muted'],
  ['card-foreground', 'card'],
  ['sidebar-light-foreground', 'sidebar-light'],
  ['sidebar-dark-foreground', 'sidebar-dark'],
  // Status text used as plain coloured text on page/card surfaces
  // ("+12 %", "Impayé", "Justifié") — the tinted backgrounds change per theme.
  ['success-foreground', 'background'],
  ['success-foreground', 'card'],
  ['warning-foreground', 'background'],
  ['warning-foreground', 'card'],
  ['destructive-foreground', 'background'],
  ['destructive-foreground', 'card'],
  ['info-foreground', 'background'],
  ['info-foreground', 'card'],
];
const AA = 4.5;

function resolved(key: string): Tokens {
  const base = baseTokens();
  if (key === DEFAULT_THEME) return base;
  const over = themeOverrides(key);
  if (!over) throw new Error(`no [data-theme='${key}'] block in globals.css`);
  return { ...base, ...over };
}

describe('themes registry', () => {
  it('lists every theme once, default first', () => {
    expect(THEMES.map((t) => t.key)).toEqual([...THEME_KEYS]);
    expect(THEME_KEYS[0]).toBe(DEFAULT_THEME);
    expect(new Set(THEME_KEYS).size).toBe(THEME_KEYS.length);
  });

  it('validates keys strictly and falls back to the default', () => {
    expect(isThemeKey('ocean')).toBe(true);
    expect(isThemeKey('dark')).toBe(false);
    expect(isThemeKey(null)).toBe(false);
    expect(resolveThemeKey('foret')).toBe('foret');
    expect(resolveThemeKey('nope')).toBe(DEFAULT_THEME);
    expect(resolveThemeKey(undefined)).toBe(DEFAULT_THEME);
  });

  it('pre-paint script is valid JS, knows every key and only sets non-default themes', () => {
    expect(() => new Function(THEME_INIT_SCRIPT)).not.toThrow();
    for (const k of THEME_KEYS) expect(THEME_INIT_SCRIPT).toContain(`"${k}"`);
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_INIT_SCRIPT).toContain(THEME_ATTR);
    // Simulated run: the stored theme lands on <html>, the default never does.
    const run = (stored: string | null) => {
      const el = { attrs: {} as Record<string, string> };
      const documentElement = {
        setAttribute: (k: string, v: string) => {
          el.attrs[k] = v;
        },
      };
      const fn = new Function(
        'localStorage',
        'document',
        THEME_INIT_SCRIPT.replace(/^\(function\(\)\{/, '').replace(/\}\)\(\);$/, ''),
      );
      fn({ getItem: () => stored }, { documentElement });
      return el.attrs[THEME_ATTR] ?? null;
    };
    expect(run('ocean')).toBe('ocean');
    expect(run(DEFAULT_THEME)).toBeNull();
    expect(run('garbage')).toBeNull();
    expect(run(null)).toBeNull();
  });
});

describe('theme CSS (globals.css)', () => {
  it('every non-default theme has a [data-theme] block overriding the same token set', () => {
    for (const key of THEME_KEYS) {
      if (key === DEFAULT_THEME) continue;
      const over = themeOverrides(key);
      expect(over, `[data-theme='${key}'] block`).not.toBeNull();
      expect(Object.keys(over!).sort(), `tokens overridden by ${key}`).toEqual(THEMED_TOKENS);
    }
    // The default theme must not have an override block (it IS the base).
    expect(themeOverrides(DEFAULT_THEME)).toBeNull();
  });

  it('picker swatches equal the CSS tokens of their theme', () => {
    for (const t of THEMES) {
      const tokens = resolved(t.key);
      expect(t.swatch.primary, `${t.key} primary`).toBe(tokens['primary']);
      expect(t.swatch.secondary, `${t.key} secondary`).toBe(tokens['secondary']);
      expect(t.swatch.sidebarDark, `${t.key} sidebar-dark`).toBe(tokens['sidebar-dark']);
    }
  });

  it.each(THEME_KEYS)('%s — every text/background pair clears WCAG AA (≥ 4.5:1)', (key) => {
    const tokens = resolved(key);
    const failures: string[] = [];
    for (const [fg, bg] of TEXT_PAIRS) {
      const f = tokens[fg];
      const b = tokens[bg];
      if (!f || !b) throw new Error(`missing token ${!f ? fg : bg} in ${key}`);
      const r = contrast(f, b);
      if (r < AA) failures.push(`${fg} on ${bg}: ${r.toFixed(2)}`);
    }
    // Inactive items of the dark shell render as text-white/50 over sidebar-dark.
    const inactive = contrast(
      blend('#ffffff', 0.5, tokens['sidebar-dark']!),
      tokens['sidebar-dark']!,
    );
    if (inactive < AA) failures.push(`white/50 on sidebar-dark: ${inactive.toFixed(2)}`);
    // Login panel copy is plain white on sidebar-dark.
    const loginPanel = contrast('#ffffff', tokens['sidebar-dark']!);
    if (loginPanel < AA) failures.push(`white on sidebar-dark: ${loginPanel.toFixed(2)}`);
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('the semantic and data tokens are NOT themed (status colours stay stable)', () => {
    const fixed = [
      'success',
      'success-foreground',
      'warning',
      'warning-foreground',
      'destructive',
      'destructive-foreground',
      'info',
      'info-foreground',
      'gold-500',
      'chart-1',
      'chart-2',
      'chart-3',
      'card',
      'bulletin-gradient-end',
    ];
    for (const key of THEME_KEYS) {
      if (key === DEFAULT_THEME) continue;
      const over = themeOverrides(key)!;
      for (const t of fixed) expect(over[t], `${key} must not override ${t}`).toBeUndefined();
    }
    expect(baseTokens()['bulletin-gradient-end']).toBeDefined();
  });
});
