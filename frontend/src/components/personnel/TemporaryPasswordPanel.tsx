'use client';

// Shared "Compte créé" / "Mot de passe réinitialisé" panel (spec
// docs/superpowers/specs/2026-09-04-personnel-module-design.md §6.6),
// pixel-matching the Banani mockup
// .planning/banani/fetches/personnel-module/compte-cree.html — success
// icon, credentials block (username + temporary password, each with its
// own Copy button), warning banner, single close button. Rendered inline
// (a Card, not a full-screen modal backdrop) since every real caller shows
// it in place of prior content rather than as an overlay: the Personnel
// creation wizard (this task) replaces its own form with this panel on
// success, and the Personnel fiche's Compte tab
// (frontend/src/app/(school)/personnel/[id]/CompteTab.tsx) does the same
// inside its tab body with a MINIMAL LOCAL copy of this exact shape,
// pending a follow-up swap to this shared component (a later cleanup task,
// not this one).
//
// Purely presentational: no network calls. The temporary password only
// ever arrives as a prop (from the route's one-time response), is never
// cached, never put in a URL, and disappears from memory the moment the
// parent unmounts this component after `onClose`.
import { useState } from 'react';
import { Check, CheckCircle2, Copy, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function TemporaryPasswordPanel({
  name,
  username,
  temporaryPassword,
  onClose,
}: {
  name: string;
  /** null when this panel is shown for an account that has no username at
   * all (should not happen in practice — every caller of this panel is on
   * a username-creation or username-reset path — but kept nullable so the
   * type stays exactly compatible with CompteTab.tsx's existing local
   * copy). */
  username: string | null;
  temporaryPassword: string;
  onClose: () => void;
}) {
  const t = useTranslations('Personnel.fiche.compte.tempPasswordPanel');
  const [copied, setCopied] = useState<'username' | 'password' | null>(null);

  async function copy(value: string, which: 'username' | 'password') {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      window.setTimeout(() => setCopied((c) => (c === which ? null : c)), 2000);
    } catch {
      // Clipboard API unavailable (insecure context, permission denied) —
      // the value stays selectable/visible on screen either way.
    }
  }

  return (
    <Card className="mx-auto flex w-full max-w-md flex-col items-center gap-0 p-5 text-center sm:p-7">
      <span className="mb-5 flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground ring-8 ring-success/40">
        <CheckCircle2 size={30} />
      </span>
      <div className="text-lg font-bold text-foreground">{t('title', { name })}</div>
      <p className="mt-1.5 mb-6 text-caption text-muted-foreground">{t('subtitle')}</p>

      <div className="flex w-full flex-col gap-3.5 rounded-2xl border border-border bg-muted px-4 py-4 sm:px-5">
        {username && (
          <>
            {/* Stacked on mobile (label above value+button, each free to use
                the full card width) — a horizontal row here squeezed the
                value column so hard at 375px that both the username and the
                password truncated to 2-3 characters, defeating the whole
                point of a panel meant to be read or copied by hand. */}
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2.5">
              <span className="text-2xs font-bold tracking-wide text-muted-foreground uppercase">
                {t('usernameLabel')}
              </span>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 font-mono text-sm font-semibold break-all text-foreground sm:text-right">
                  {username}
                </span>
                <button
                  type="button"
                  aria-label={t('copyButton')}
                  title={t('copyButton')}
                  onClick={() => void copy(username, 'username')}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground"
                >
                  {copied === 'username' ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            </div>
            <div className="h-px bg-border" />
          </>
        )}
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2.5">
          <span className="text-2xs font-bold tracking-wide text-muted-foreground uppercase">
            {t('passwordLabel')}
          </span>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 font-mono text-sm font-semibold break-all text-foreground sm:text-right">
              {temporaryPassword}
            </span>
            <button
              type="button"
              aria-label={t('copyButton')}
              title={t('copyButton')}
              onClick={() => void copy(temporaryPassword, 'password')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground"
            >
              {copied === 'password' ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex w-full items-start gap-2.5 rounded-xl bg-warning px-3.5 py-3 text-left">
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-warning-foreground" />
        <p className="text-xs text-warning-foreground">{t('warning')}</p>
      </div>

      <Button type="button" className="mt-5 w-full" onClick={onClose}>
        <Check size={14} />
        {t('closeButton')}
      </Button>
    </Card>
  );
}
