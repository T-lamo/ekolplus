'use client';

// Onglet "Compte" (spec 2026-09-04-personnel-module-design.md §6.5) — new
// tab, genuinely governed by the Banani fiche mockup
// (.planning/banani/fetches/personnel-module/personnel-fiche.html "Compte
// variant 1/2/3"). Three states: pending e-mail invite (resend), active
// username-only account (admin-generated reset), active e-mail account (no
// admin reset — the person owns "mot de passe oublié").
//
// TemporaryPasswordPanel below is a MINIMAL LOCAL copy, scoped to this file
// only — Task 6 of the implementation plan builds the real shared
// `frontend/src/components/personnel/TemporaryPasswordPanel.tsx` reused at
// every "new password" surface (creation, teacher/student access,
// resets). Swap this local copy for the shared component once Task 6 lands.
import { useState } from 'react';
import { Check, Clock, Copy, KeyRound, Mail, MailCheck, Send, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { PersonnelAccountStatus } from '../types';

function TemporaryPasswordPanel({
  name,
  username,
  temporaryPassword,
  onClose,
}: {
  name: string;
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
    <Card className="flex flex-col gap-4 p-5">
      <div className="text-caption font-semibold text-foreground">{t('title', { name })}</div>
      {username && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-foreground">{t('usernameLabel')}</span>
          <div className="flex items-center gap-2">
            <span className="flex-1 rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground">
              {username}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => void copy(username, 'username')}
            >
              {copied === 'username' ? <Check size={14} /> : <Copy size={14} />}
              {t('copyButton')}
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-foreground">{t('passwordLabel')}</span>
        <div className="flex items-center gap-2">
          <span className="flex-1 rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground">
            {temporaryPassword}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => void copy(temporaryPassword, 'password')}
          >
            {copied === 'password' ? <Check size={14} /> : <Copy size={14} />}
            {t('copyButton')}
          </Button>
        </div>
      </div>
      <p className="rounded-md bg-warning px-3 py-2 text-xs text-warning-foreground">
        {t('warning')}
      </p>
      <Button type="button" className="w-fit" onClick={onClose}>
        {t('closeButton')}
      </Button>
    </Card>
  );
}

export function CompteTab({
  userId,
  name,
  accountStatus,
  email,
  username,
  onChanged,
}: {
  // Null exactly for accountStatus === 'NONE' (no User row linked at all —
  // never invited). resendInvite/resetPassword below are only reachable
  // from the PENDING/username-only branches, which by construction never
  // occur when userId is null, so the `${userId}` interpolations there stay
  // safe despite the widened type.
  userId: string | null;
  name: string;
  accountStatus: PersonnelAccountStatus;
  email: string | null;
  username: string | null;
  onChanged: () => void;
}) {
  const t = useTranslations('Personnel.fiche.compte');
  const tCommon = useTranslations('Common');
  const { toast } = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  function errorMessage(err: unknown): string {
    if (err instanceof ApiError) return err.message;
    return tCommon('errors.network');
  }

  async function resendInvite() {
    setBusy(true);
    try {
      await api(`/api/school/members/${userId}/invite`, { method: 'POST' });
      toast(t('pending.resent'), 'success');
      onChanged();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    const ok = await confirm({
      title: t('usernameOnly.confirmTitle'),
      message: t('usernameOnly.confirmBody', { name }),
      confirmLabel: t('usernameOnly.confirmButton'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api<{ ok: true; temporaryPassword: string }>(
        `/api/school/accounts/${userId}/reset-password`,
        { method: 'POST' },
      );
      setTempPassword(res.temporaryPassword);
      onChanged();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (tempPassword) {
    return (
      <TemporaryPasswordPanel
        name={name}
        username={username}
        temporaryPassword={tempPassword}
        onClose={() => setTempPassword(null)}
      />
    );
  }

  if (accountStatus === 'NONE') {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">{t('noAccount.description')}</p>
      </Card>
    );
  }

  if (accountStatus === 'PENDING') {
    return (
      <Card className="p-5">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted px-3.5 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning text-warning-foreground">
            <Clock size={18} />
          </span>
          <div>
            <div className="text-caption font-semibold text-foreground">{t('pending.title')}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('pending.description', { email: email ?? '' })}
            </p>
          </div>
        </div>
        <div className="mt-3.5 flex justify-end">
          <Button size="sm" className="w-fit" loading={busy} onClick={() => void resendInvite()}>
            <Send size={14} />
            {t('pending.resendButton')}
          </Button>
        </div>
      </Card>
    );
  }

  if (email == null) {
    // Active, username-only account.
    return (
      <Card className="p-5">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted px-3.5 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
            <User size={18} />
          </span>
          <div>
            <div className="text-caption font-semibold text-foreground">
              {t('usernameOnly.title')}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('usernameOnly.description')}</p>
          </div>
        </div>
        <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
          <span className="flex-1 rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm text-muted-foreground">
            {username}
          </span>
          <Button size="sm" className="w-fit" loading={busy} onClick={() => void resetPassword()}>
            <KeyRound size={14} />
            {t('usernameOnly.resetButton')}
          </Button>
        </div>
      </Card>
    );
  }

  // Active, e-mail account — no admin reset (own recovery channel).
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted px-3.5 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success text-success-foreground">
          <MailCheck size={18} />
        </span>
        <div>
          <div className="text-caption font-semibold text-foreground">{email}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('emailActive.description')}</p>
        </div>
      </div>
      <p className="mt-3.5 flex items-center gap-2 rounded-md bg-success px-3 py-2 text-xs text-success-foreground">
        <Mail size={14} />
        {t('emailActive.footerNote')}
      </p>
    </Card>
  );
}
