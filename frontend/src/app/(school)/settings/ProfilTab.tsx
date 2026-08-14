// Migrated verbatim from the old standalone src/app/settings/page.tsx (see
// school-settings.md) — same API calls, same behavior, now a tab instead of
// a whole page.
'use client';

import { useMemo, useState, type FormEvent } from 'react';
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
import { ROLE_LABEL } from './AdministrateursTab';
import type { MemberData } from './types';

function ProfileInfoCard({ user, myRole }: { user: User; myRole: MemberData['role'] | null }) {
  const { refresh } = useAuth();
  const { toast } = useToast();

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
      toast('Photo de profil mise à jour.', 'success');
    } catch (err) {
      setAvatarUrl(previous);
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
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
      toast('Profil mis à jour.', 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="gap-3 p-5">
      <div className="border-b border-border pb-3.5">
        <h2 className="text-[13px] font-bold text-foreground">Mon profil</h2>
        <p className="text-[11px] text-muted-foreground">Informations du compte administrateur</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="w-32">
          <ImageUploader
            label="Photo de profil"
            hint="PNG, JPG ou WebP"
            value={avatarUrl}
            onChange={saveAvatar}
          />
        </div>
        <Field label="Nom complet" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Adresse courriel" value={user.email} disabled />
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <PhoneInput label="Téléphone" value={phone} onChange={setPhone} />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-semibold text-foreground">Rôle</span>
            <span className="flex h-10 items-center gap-2 rounded-md border border-border bg-muted px-3 text-foreground">
              {myRole ? ROLE_LABEL[myRole] : '—'}
            </span>
          </label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <Button type="submit" loading={submitting} className="w-fit">
          {submitting ? 'Enregistrement…' : 'Enregistrer les modifications'}
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

const STRENGTH_META = [
  { label: '', color: 'var(--color-muted)' },
  { label: 'Faible', color: 'var(--color-destructive-foreground)' },
  { label: 'Moyen', color: 'var(--color-warning-foreground)' },
  { label: 'Moyen', color: 'var(--color-warning-foreground)' },
  { label: 'Fort', color: 'var(--color-success-foreground)' },
];

function generatePassword(): string {
  const chars =
    'abcdefghijkmnopqrstuvwxyz' + 'ABCDEFGHJKLMNPQRSTUVWXYZ' + '23456789' + '!@#$%&*-_+=';
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function formatLastChanged(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  const months = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 30)),
  );
  const relative =
    months === 0 ? "Aujourd'hui" : months === 1 ? 'Il y a 1 mois' : `Il y a ${months} mois`;
  const absolute = date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  return `${relative} · ${absolute}`;
}

function VisibilityToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
      className="flex h-full w-9 shrink-0 items-center justify-center text-muted-foreground"
    >
      {visible ? <EyeOff size={14} /> : <Eye size={14} />}
    </button>
  );
}

function PasswordCard({ user }: { user: User }) {
  const { refresh } = useAuth();
  const { toast } = useToast();

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
  const strengthMeta = STRENGTH_META[strength]!;
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
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
      setError('Saisis un nouveau mot de passe.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }

    setSubmitting(true);
    try {
      if (hasPassword) {
        await api('/api/auth/change-password', {
          method: 'PUT',
          body: { currentPassword, newPassword },
        });
        toast('Mot de passe mis à jour.', 'success');
      } else {
        await api('/api/auth/set-password', {
          method: 'POST',
          body: { newPassword },
        });
        toast('Mot de passe défini. Tu peux maintenant te connecter par email.', 'success');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const map: Record<string, string> = {
          INVALID_CREDENTIALS: 'Mot de passe actuel incorrect.',
          PASSWORD_BANNED: 'Ce mot de passe est trop courant.',
          PASSWORD_TOO_SHORT: err.message || 'Mot de passe trop court.',
          PASSWORD_PWNED: 'Ce mot de passe a fuité — choisis-en un autre.',
          PASSWORD_ALREADY_SET:
            'Un mot de passe est déjà défini. Utilise « changer le mot de passe ».',
          VALIDATION_FAILED: 'Champs invalides.',
        };
        setError(map[err.code] ?? err.message);
      } else {
        setError('Erreur réseau. Réessaie.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="gap-3 p-5">
      <div className="border-b border-border pb-3.5">
        <h2 className="text-[13px] font-bold text-foreground">
          {hasPassword ? 'Mot de passe' : 'Définir un mot de passe'}
        </h2>
        <p className="text-[11px] text-muted-foreground">
          {hasPassword
            ? 'Modifie ton mot de passe de connexion'
            : 'Tu t’es connecté via Google. Définis un mot de passe pour pouvoir aussi te connecter par email.'}
        </p>
      </div>

      {hasPassword && lastChanged && (
        <div className="flex items-center gap-2.5 rounded-md bg-secondary px-3.5 py-3">
          <ShieldAlert size={16} className="shrink-0 text-primary" />
          <div>
            <div className="text-xs font-semibold text-primary">Dernière modification</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{lastChanged}</div>
          </div>
        </div>
      )}

      <form onSubmit={onSubmitPassword} className="flex flex-col gap-4">
        {hasPassword && (
          <Field
            label="Mot de passe actuel"
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
            label="Nouveau mot de passe"
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
          <p className="mt-1 text-[11px] text-muted-foreground">
            Min. 8 caractères, une majuscule, un chiffre
          </p>
        </div>
        <div>
          <Field
            label="Confirmer le nouveau mot de passe"
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
              <span className="text-[11px] font-medium text-success-foreground">
                Les mots de passe correspondent
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
            {submitting
              ? 'Enregistrement…'
              : hasPassword
                ? 'Enregistrer le mot de passe'
                : 'Définir le mot de passe'}
          </Button>
          <Button type="button" variant="outline" className="w-fit gap-1.5" onClick={onGenerate}>
            <RefreshCw size={13} />
            Générer un mot de passe
          </Button>
        </div>
        {hasPassword && (
          <div className={cn('flex items-start gap-2 rounded-md bg-warning px-3.5 py-2.5')}>
            <ShieldAlert size={14} className="mt-0.5 shrink-0 text-warning-foreground" />
            <p className="text-[11px] leading-relaxed text-warning-foreground">
              Après modification, tu seras déconnecté·e de toutes les sessions actives.
            </p>
          </div>
        )}
      </form>
    </Card>
  );
}

export function ProfilTab({ user, myRole }: { user: User; myRole: MemberData['role'] | null }) {
  return (
    <div className="flex flex-col gap-5">
      <ProfileInfoCard user={user} myRole={myRole} />
      <PasswordCard user={user} />
    </div>
  );
}
