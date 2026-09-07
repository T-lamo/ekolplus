'use client';

// Controlled username input, shared by every "username login" surface
// (spec docs/superpowers/specs/2026-09-04-personnel-module-design.md §6.4
// point 3 and §6.7): the Personnel creation wizard (this task), and later
// the fiche élève's "Créer un accès par nom d'utilisateur" card and an
// existing teacher's "Donner un accès" flow — all reuse this one
// component rather than reimplementing the suggest/debounce/availability
// logic per screen.
//
// On mount, if the field is still empty and the caller hasn't typed
// anything of their own, it suggests `prenom.nom` (accents stripped,
// lowercased, non [a-z0-9] characters dropped — the same normalization
// `frontend/src/lib/username.ts`'s `normalizeUsername`/`USERNAME_REGEX`
// enforce server-side, so a suggestion this field settles on is always one
// the server will accept) and walks `prenom.nom2`, `prenom.nom3`, … until
// it finds one nobody has taken yet. Every value change (suggested or
// typed) is re-checked against
// `GET /api/school/personnel/username-available` after a 400ms debounce;
// the result is surfaced both inline (icon + caption) and to the parent via
// `onStatusChange`, so a wizard can disable its submit while a check is in
// flight or the name is taken.
import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Field } from '@/components/ui/Field';
import { normalizeUsername, USERNAME_REGEX } from '@/lib/username';

export type UsernameFieldStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

const MAX_SUFFIX_TRIES = 20;
const DEBOUNCE_MS = 400;

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function slugPart(s: string): string {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** `prenom.nom`, or null when there isn't enough to build a valid suggestion
 * from (e.g. a name made entirely of characters this slug drops). */
function baseSuggestion(firstName: string, lastName: string): string | null {
  const f = slugPart(firstName);
  const l = slugPart(lastName);
  if (!f || !l) return null;
  const candidate = normalizeUsername(`${f}.${l}`);
  return USERNAME_REGEX.test(candidate) ? candidate : null;
}

async function checkAvailability(candidate: string): Promise<boolean> {
  try {
    const res = await api<{ available: boolean }>(
      `/api/school/personnel/username-available?u=${encodeURIComponent(candidate)}`,
    );
    return res.available;
  } catch {
    return false;
  }
}

export function UsernameField({
  value,
  onChange,
  firstName,
  lastName,
  onStatusChange,
}: {
  value: string;
  onChange: (v: string) => void;
  firstName: string;
  lastName: string;
  onStatusChange?: (status: UsernameFieldStatus) => void;
}) {
  const t = useTranslations('Personnel.usernameField');
  const [status, setStatus] = useState<UsernameFieldStatus>('idle');
  // Flips the moment the person edits the field themselves — the mount-time
  // auto-suggestion loop checks this on every iteration so it never
  // clobbers something the person already started typing.
  const dirtyRef = useRef(false);

  function reportStatus(next: UsernameFieldStatus) {
    setStatus(next);
    onStatusChange?.(next);
  }

  // Auto-suggestion — runs once on mount only. By the time this field
  // renders (Step 3 of the wizard, or an already-filled-in name elsewhere),
  // firstName/lastName are already final, so a one-shot effect is enough;
  // this project's eslint config has no react-hooks plugin registered, so
  // an empty dep array here needs no suppression comment.
  useEffect(() => {
    if (value !== '') return; // already has a value (edit flow, or re-mount) — never override it
    const base = baseSuggestion(firstName, lastName);
    if (!base) return;
    let cancelled = false;
    (async () => {
      reportStatus('checking');
      for (let n = 0; n <= MAX_SUFFIX_TRIES; n++) {
        if (cancelled || dirtyRef.current) return;
        const candidate = n === 0 ? base : `${base}${n + 1}`;
        if (candidate.length > 30) break;
        const available = await checkAvailability(candidate);
        if (cancelled || dirtyRef.current) return;
        if (available) {
          onChange(candidate);
          return;
        }
      }
      if (!cancelled && !dirtyRef.current) reportStatus('idle');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Live availability check — debounced, fires on every value change
  // (suggested or typed).
  useEffect(() => {
    if (value === '') {
      reportStatus('idle');
      return;
    }
    const normalized = normalizeUsername(value);
    if (!USERNAME_REGEX.test(normalized)) {
      reportStatus('invalid');
      return;
    }
    reportStatus('checking');
    const timer = window.setTimeout(() => {
      void (async () => {
        const available = await checkAvailability(normalized);
        reportStatus(available ? 'available' : 'taken');
      })();
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <div className="flex w-full flex-col gap-1.5 text-left">
      <Field
        label={t('label')}
        value={value}
        onChange={(e) => {
          dirtyRef.current = true;
          onChange(e.target.value);
        }}
        placeholder={t('placeholder')}
        autoComplete="off"
        trailing={
          status === 'checking' ? (
            <Loader2 size={14} className="shrink-0 animate-spin text-muted-foreground" />
          ) : status === 'available' ? (
            <Check size={14} className="shrink-0 text-success-foreground" />
          ) : status === 'taken' || status === 'invalid' ? (
            <X size={14} className="shrink-0 text-destructive-foreground" />
          ) : null
        }
      />
      {status === 'available' && (
        <span className="flex items-center gap-1 text-2xs font-semibold text-success-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-success-foreground" />
          {t('available')}
        </span>
      )}
      {status === 'taken' && (
        <span className="text-2xs font-semibold text-destructive-foreground">{t('taken')}</span>
      )}
      {status === 'invalid' && (
        <span className="text-2xs text-muted-foreground">{t('invalidFormat')}</span>
      )}
    </div>
  );
}
