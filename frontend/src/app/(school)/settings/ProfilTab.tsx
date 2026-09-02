// Migrated verbatim from the old standalone src/app/settings/page.tsx (see
// school-settings.md) — same API calls, same behavior, now a tab instead of
// a whole page.
'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle, Eye, EyeOff, RefreshCw, ShieldAlert } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth, type User } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Button } from '@/components/ui/Button';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { cn } from '@/lib/utils';
import { LOCALE_BCP47 } from '@/lib/locales';
import { roleLabel } from './role-label';
import type { MemberData } from './types';

interface ProfilTabProps {
  user: User;
  myRole: MemberData['role'] | null;
  /** Overrides the card subtitle (the default speaks of an administrator account). */
  subtitle?: string;
  /** Read-only role text shown when the account has no org role (teacher/student portals). */
  roleDisplay?: string;
}

function ProfileInfoCard({ user, myRole, subtitle, roleDisplay }: ProfilTabProps) {
  const { refresh } = useAuth();
  const { toast } = useToast();
  const t = useTranslations('Settings.profil.info');
  const tCommon = useTranslations('Common');
  const tRoles = useTranslations('Common.roles');

  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [name, setName] = useState(user.name ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveAvatar(url: string | null) {
    const previous = avatarUrl;
    setAvatarUrl(url);
    try {
      await api('/api/auth/me', { method: 'PATCH', body: { avatarUrl: url } });
      await refresh();
      toast(t('avatarUpdated'), 'success');
    } catch (err) {
      setAvatarUrl(previous);
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api('/api/auth/me', {
        method: 'PATCH',
        body: { name: name.trim() || null, phone: phone || null },
      });
      await refresh();
      toast(t('profileUpdated'), 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="gap-3 p-5">
      <div className="border-b border-border pb-3.5">
        <h2 className="text-caption font-bold text-foreground">{t('title')}</h2>
        <p className="text-2xs text-muted-foreground">{subtitle ?? t('subtitle')}</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="w-32">
          <ImageUploader
            label={t('avatarLabel')}
            hint={t('avatarHint')}
            value={avatarUrl}
            onChange={saveAvatar}
          />
        </div>
        <Field label={t('nameLabel')} value={name} onChange={(e) => setName(e.target.value)} />
        <Field label={t('emailLabel')} value={user.email} disabled />
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <PhoneInput label={t('phoneLabel')} value={phone} onChange={setPhone} />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-semibold text-foreground">{t('roleLabel')}</span>
            <span className="flex h-10 items-center gap-2 rounded-md border border-border bg-muted px-3 text-foreground">
              {myRole ? roleLabel(myRole, tRoles) : (roleDisplay ?? '—')}
            </span>
          </label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <Button type="submit" loading={submitting} className="w-fit">
          {submitting ? t('saving') : t('save')}
        </Button>
      </form>
    </Card>
  );
}

// 4-point heuristic (length, uppercase, digit, symbol) — cosmetic strength
// hint only, the real gate is the server's PASSWORD_TOO_SHORT/PASSWORD_BANNED/
// PASSWORD_PWNED checks in change-password/set-password.
function passwordStrength(pwd: string): number {
  if (!pwd) return 0;
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return score;
}

function generatePassword(): string {
  const chars =
    'abcdefghijkmnopqrstuvwxyz' + 'ABCDEFGHJKLMNPQRSTUVWXYZ' + '23456789' + '!@#$%&*-_+=';
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function VisibilityToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  const t = useTranslations('Settings.profil.password');
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? t('hidePassword') : t('showPassword')}
      className="flex h-full w-9 shrink-0 items-center justify-center text-muted-foreground"
    >
      {visible ? <EyeOff size={14} /> : <Eye size={14} />}
    </button>
  );
}

function PasswordCard({ user }: { user: User }) {
  const { refresh } = useAuth();
  const { toast } = useToast();
  const t = useTranslations('Settings.profil.password');
  const tCommon = useTranslations('Common');
  const locale = useLocale();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPassword = user.hasPassword;
  const strength = useMemo(() => passwordStrength(newPassword), [newPassword]);
  const strengthMeta = [
    { label: '', color: 'var(--color-muted)' },
    { label: t('strength.weak'), color: 'var(--color-destructive-foreground)' },
    { label: t('strength.medium'), color: 'var(--color-warning-foreground)' },
    { label: t('strength.medium'), color: 'var(--color-warning-foreground)' },
    { label: t('strength.strong'), color: 'var(--color-success-foreground)' },
  ][strength]!;
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;

  function formatLastChanged(iso: string | null): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    const months = Math.max(
      0,
      Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 30)),
    );
    const relative =
      months === 0
        ? t('lastChangedToday')
        : t(months === 1 ? 'lastChangedMonthsAgo.one' : 'lastChangedMonthsAgo.other', { months });
    const absolute = date.toLocaleDateString(LOCALE_BCP47[locale], {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    return `${relative} · ${absolute}`;
  }
  const lastChanged = formatLastChanged(user.passwordChangedAt);

  function onGenerate() {
    const generated = generatePassword();
    setNewPassword(generated);
    setConfirmPassword(generated);
  }

  async function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length === 0) {
      setError(t('errorMissingNew'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('errorMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      if (hasPassword) {
        await api('/api/auth/change-password', {
          method: 'PUT',
          body: { currentPassword, newPassword },
        });
        toast(t('updatedToast'), 'success');
      } else {
        await api('/api/auth/set-password', {
          method: 'POST',
          body: { newPassword },
        });
        toast(t('setToast'), 'success');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const map: Record<string, string> = {
          INVALID_CREDENTIALS: t('errors.invalidCredentials'),
          PASSWORD_BANNED: t('errors.passwordBanned'),
          PASSWORD_TOO_SHORT: err.message || t('errors.passwordTooShort'),
          PASSWORD_PWNED: t('errors.passwordPwned'),
          PASSWORD_ALREADY_SET: t('errors.passwordAlreadySet'),
          VALIDATION_FAILED: t('errors.validationFailed'),
        };
        setError(map[err.code] ?? err.message);
      } else {
        setError(tCommon('errors.network'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="gap-3 p-5">
      <div className="border-b border-border pb-3.5">
        <h2 className="text-caption font-bold text-foreground">
          {hasPassword ? t('titleChange') : t('titleSet')}
        </h2>
        <p className="text-2xs text-muted-foreground">
          {hasPassword ? t('subtitleChange') : t('subtitleSet')}
        </p>
      </div>

      {hasPassword && lastChanged && (
        <div className="flex items-center gap-2.5 rounded-md bg-secondary px-3.5 py-3">
          <ShieldAlert size={16} className="shrink-0 text-primary" />
          <div>
            <div className="text-xs font-semibold text-primary">{t('lastChangedLabel')}</div>
            <div className="mt-0.5 text-2xs text-muted-foreground">{lastChanged}</div>
          </div>
        </div>
      )}

      <form onSubmit={onSubmitPassword} className="flex flex-col gap-4">
        {hasPassword && (
          <Field
            label={t('currentPasswordLabel')}
            type={showCurrent ? 'text' : 'password'}
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            trailing={
              <VisibilityToggle visible={showCurrent} onToggle={() => setShowCurrent((v) => !v)} />
            }
          />
        )}
        <div>
          <Field
            label={t('newPasswordLabel')}
            type={showNew ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            trailing={<VisibilityToggle visible={showNew} onToggle={() => setShowNew((v) => !v)} />}
          />
          {newPassword.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1">
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="h-1 flex-1 rounded-full"
                  style={{ background: i <= strength ? strengthMeta.color : 'var(--color-muted)' }}
                />
              ))}
              <span
                className="ml-1 shrink-0 text-[10px] font-semibold whitespace-nowrap"
                style={{ color: strengthMeta.color }}
              >
                {strengthMeta.label}
              </span>
            </div>
          )}
          <p className="mt-1 text-2xs text-muted-foreground">{t('hint')}</p>
        </div>
        <div>
          <Field
            label={t('confirmPasswordLabel')}
            type={showConfirm ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            trailing={
              <VisibilityToggle visible={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
            }
          />
          {passwordsMatch && (
            <div className="mt-1 flex items-center gap-1.5">
              <CheckCircle size={11} className="text-success-foreground" />
              <span className="text-2xs font-medium text-success-foreground">
                {t('passwordsMatch')}
              </span>
            </div>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" loading={submitting} className="w-fit">
            {submitting ? t('saving') : hasPassword ? t('save') : t('define')}
          </Button>
          <Button type="button" variant="outline" className="w-fit gap-1.5" onClick={onGenerate}>
            <RefreshCw size={13} />
            {t('generate')}
          </Button>
        </div>
        {hasPassword && (
          <div className={cn('flex items-start gap-2 rounded-md bg-warning px-3.5 py-2.5')}>
            <ShieldAlert size={14} className="mt-0.5 shrink-0 text-warning-foreground" />
            <p className="text-2xs leading-relaxed text-warning-foreground">{t('logoutWarning')}</p>
          </div>
        )}
      </form>
    </Card>
  );
}

export function ProfilTab(props: ProfilTabProps) {
  return (
    <div className="flex flex-col gap-5">
      <ProfileInfoCard {...props} />
      <PasswordCard user={props.user} />
    </div>
  );
}
