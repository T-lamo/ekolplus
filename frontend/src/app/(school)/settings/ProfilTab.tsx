// Migrated verbatim from the old standalone src/app/settings/page.tsx (see
// school-settings.md) — same API calls, same behavior, now a tab instead of
// a whole page.
'use client';

import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth, type User } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

export function ProfilTab({ user }: { user: User }) {
  const { refresh } = useAuth();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPassword = user.hasPassword;
  const googleLinked = user.linkedProviders.includes('google');

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
    <div className="flex flex-col gap-5">
      <Card className="gap-3 p-5">
        <div>
          <h2 className="text-base font-bold text-foreground">
            {hasPassword ? 'Changer le mot de passe' : 'Définir un mot de passe'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasPassword
              ? 'Tu peux modifier ton mot de passe ici. Les autres sessions seront déconnectées.'
              : 'Tu t’es connecté via Google. Définis un mot de passe pour pouvoir aussi te connecter par email.'}
          </p>
        </div>
        <form onSubmit={onSubmitPassword} className="mt-2 flex flex-col gap-4">
          {hasPassword && (
            <Field
              label="Mot de passe actuel"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          )}
          <Field
            label="Nouveau mot de passe"
            type="password"
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Field
            label="Confirmer le nouveau mot de passe"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          )}
          <Button type="submit" loading={submitting}>
            {submitting
              ? 'Enregistrement…'
              : hasPassword
                ? 'Changer le mot de passe'
                : 'Définir le mot de passe'}
          </Button>
        </form>
      </Card>

      <Card className="gap-3 p-5">
        <h2 className="text-base font-bold text-foreground">Comptes liés</h2>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">Google</span>
            <span className="text-xs text-muted-foreground">
              {googleLinked
                ? 'Tu peux te connecter via Google.'
                : 'Lie ton compte Google pour te connecter en un clic.'}
            </span>
          </div>
          {googleLinked ? (
            <span className="rounded-full border border-success-foreground/20 bg-success px-3 py-1 text-xs font-medium text-success-foreground">
              Lié
            </span>
          ) : (
            <a
              href="/api/auth/oauth/google/start?next=/settings"
              className="flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground"
            >
              Lier Google
            </a>
          )}
        </div>
      </Card>
    </div>
  );
}
