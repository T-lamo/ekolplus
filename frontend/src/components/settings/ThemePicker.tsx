'use client';

// Colour-theme picker (Paramètres › Apparence, and the « Apparence » card of
// the SaaS admin settings). A radiogroup of theme tiles — each tile is a
// miniature of the app shell (dark sidebar strip, tinted page, white card,
// primary button, secondary chip) painted with THAT theme's tokens, so the
// user compares palettes before clicking. Selecting applies immediately
// through ThemeProvider (which also persists User.theme).
//
// Same keyboard contract as PlanCards: roving tabindex, ←/→/↑/↓ move and
// select, Space/Enter select. Tiles stay neutral (no per-card colour) — the
// preview IS the content; the selected state is the usual primary ring.
import { useId, useState, type KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { DEFAULT_THEME, THEMES, THEME_KEYS, type ThemeDef, type ThemeKey } from '@/lib/themes';
import { cn } from '@/lib/utils';

export function ThemePicker({ className }: { className?: string }) {
  const t = useTranslations('ThemePicker');
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const groupId = useId();
  const [busy, setBusy] = useState<ThemeKey | null>(null);

  async function select(next: ThemeKey) {
    if (next === theme || busy) return;
    const label = t(`themes.${next}.label`);
    setBusy(next);
    try {
      await setTheme(next);
      toast(t('applied', { label }), 'success');
    } catch {
      // The theme is already applied on this device (DOM + localStorage);
      // only the account write failed — say so, don't revert.
      toast(t('saveError'), 'warning');
    } finally {
      setBusy(null);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, key: ThemeKey) {
    const idx = THEME_KEYS.indexOf(key);
    let next: ThemeKey | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
      next = THEME_KEYS[(idx + 1) % THEME_KEYS.length] ?? null;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = THEME_KEYS[(idx - 1 + THEME_KEYS.length) % THEME_KEYS.length] ?? null;
    else if (e.key === ' ' || e.key === 'Enter') next = key;
    if (!next) return;
    e.preventDefault();
    void select(next);
    document.getElementById(`${groupId}-${next}`)?.focus();
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div
        role="radiogroup"
        aria-label={t('groupLabel')}
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {THEMES.map((def) => (
          <ThemeTile
            key={def.key}
            id={`${groupId}-${def.key}`}
            def={def}
            selected={theme === def.key}
            busy={busy === def.key}
            onSelect={() => void select(def.key)}
            onKeyDown={(e) => onKeyDown(e, def.key)}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('contrastNote')}</p>
    </div>
  );
}

function ThemeTile({
  id,
  def,
  selected,
  busy,
  onSelect,
  onKeyDown,
}: {
  id: string;
  def: ThemeDef;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const t = useTranslations('ThemePicker');
  return (
    <button
      type="button"
      id={id}
      role="radio"
      aria-checked={selected}
      aria-busy={busy || undefined}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        'flex flex-col gap-2.5 rounded-xl border bg-card p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        selected
          ? 'border-primary ring-2 ring-primary ring-offset-1'
          : 'border-border hover:border-primary/50',
      )}
    >
      <ThemePreview def={def} />
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            {t(`themes.${def.key}.label`)}
            {def.key === DEFAULT_THEME && (
              <span className="text-2xs font-medium text-muted-foreground">· {t('default')}</span>
            )}
          </span>
          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
            {t(`themes.${def.key}.description`)}
          </span>
        </span>
        <span
          aria-hidden
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background',
          )}
        >
          {selected && <Check size={12} strokeWidth={3} />}
        </span>
      </span>
    </button>
  );
}

/** Miniature shell painted with the theme's own colours (not the live tokens,
 * so every tile shows its own palette regardless of the active theme). */
function ThemePreview({ def }: { def: ThemeDef }) {
  const t = useTranslations('ThemePicker');
  const { primary, secondary, sidebarDark } = def.swatch;
  return (
    <span
      role="img"
      aria-label={t('previewAlt', { label: t(`themes.${def.key}.label`) })}
      className="flex h-16 w-full overflow-hidden rounded-lg border border-border"
      style={{ background: '#f4f4f8' }}
    >
      {/* dark sidebar strip */}
      <span className="flex w-7 shrink-0 flex-col gap-1 p-1.5" style={{ background: sidebarDark }}>
        <span className="h-1 w-3 rounded-sm" style={{ background: primary }} />
        <span className="h-1 w-4 rounded-sm bg-white/30" />
        <span className="h-1 w-3 rounded-sm bg-white/30" />
      </span>
      {/* page with one card */}
      <span className="flex min-w-0 flex-1 flex-col gap-1.5 p-2">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-8 rounded-sm" style={{ background: primary, opacity: 0.85 }} />
          <span className="h-1.5 w-5 rounded-sm" style={{ background: secondary }} />
        </span>
        <span className="flex flex-1 items-center gap-2 rounded-md bg-white px-2">
          <span className="h-2 w-10 rounded-sm" style={{ background: secondary }} />
          <span className="h-2 flex-1 rounded-sm bg-[#ececf0]" />
          <span className="h-3 w-8 rounded" style={{ background: primary }} />
        </span>
      </span>
    </span>
  );
}
