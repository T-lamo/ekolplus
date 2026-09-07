'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { LocaleQuickSwitcher } from '@/components/settings/LanguagePicker';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

// Consumes a TEACHER_INVITE code (Task 8's POST /api/auth/teacher-invite/accept)
// — the link a teacher lands on from their invite email. Unlike
// /reset-password (a pre-session, no-cookies endpoint), accepting the invite
// DOES establish a session: the route issues all three auth cookies on
// success, so this page just refreshes AuthContext and drops the teacher
// straight into their portal — no separate "done" screen needed.
//
// The email link carries ?email=&code= so both arrive pre-filled — the
// teacher still has to choose a password and press submit themselves (no
// auto-submit on load), same anti-prefetch-burn reasoning as
// /reset-password and /verify-email.
export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordForm />
    </Suspense>
  );
}

function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const t = useTranslations('SetPassword');
  const tLogin = useTranslations('Login');
  const email = searchParams.get('email') ?? '';
  const code = searchParams.get('code') ?? '';
  // `?portal=staff` = invitation from Paramètres › Administrateurs (same
  // accept route, different copy and landing: the account may hold several
  // espaces, so route by `spaces` the way /login does).
  const portal = searchParams.get('portal') === 'staff' ? 'staff' : 'teacher';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/teacher-invite/accept', {
        method: 'POST',
        body: { email, code: code.trim().toUpperCase(), newPassword: password },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      const me = await refresh();
      if (portal === 'teacher') {
        router.push('/espace-enseignant');
      } else {
        const spaces = me?.spaces;
        const available = [
          ...(spaces?.school ? ['/dashboard'] : []),
          ...(spaces?.teacher ? ['/espace-enseignant'] : []),
          ...(spaces?.student ? ['/eleve'] : []),
        ];
        router.push(
          available.length >= 2 ? '/espaces?pref=school' : (available[0] ?? '/dashboard'),
        );
      }
    } catch (err) {
      if (err instanceof ApiError) {
        // Static, literal keys on purpose — next-intl's typed t() validates
        // each one against the real SetPassword.errors.* keys at compile
        // time; a dynamically built key would bypass that check (see
        // frontend/src/app/login/page.tsx for the same reasoning).
        switch (err.code) {
          case 'VERIFICATION_CODE_INVALID':
            setError(t('errors.VERIFICATION_CODE_INVALID'));
            break;
          case 'VERIFICATION_CODE_EXPIRED':
            setError(t('errors.VERIFICATION_CODE_EXPIRED'));
            break;
          case 'PASSWORD_TOO_SHORT':
            setError(t('errors.PASSWORD_TOO_SHORT'));
            break;
          case 'PASSWORD_BANNED':
            setError(t('errors.PASSWORD_BANNED'));
            break;
          case 'PASSWORD_PWNED':
            setError(t('errors.PASSWORD_PWNED'));
            break;
          default:
            setError(t('errors.generic'));
        }
      } else {
        setError(t('errors.generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      <div className="relative flex shrink-0 flex-col items-start justify-center overflow-hidden bg-sidebar-dark px-6 py-8 text-white lg:w-[60%] lg:items-center lg:px-10 lg:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-24 hidden h-85 w-85 rounded-full border border-primary/20 lg:block"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -left-16 hidden h-55 w-55 rounded-full border border-primary/10 lg:block"
        />

        <div className="absolute top-4 right-4 z-20 hidden lg:top-6 lg:right-8 lg:block">
          <LocaleQuickSwitcher variant="dark" />
        </div>

        <div className="relative z-10 flex w-full max-w-md flex-col items-start">
          <div className="mb-4 flex items-center lg:mb-12">
            <Image
              src="/logos/schoolgesti-lockup-blanc.svg"
              alt="Schoolgesti"
              width={164}
              height={44}
              className="h-13 w-auto"
              priority
            />
          </div>
          <h1 className="mb-3 hidden text-[32px] leading-tight font-extrabold tracking-tight lg:block">
            {tLogin('headline')}
          </h1>
          <p className="mb-10 hidden text-sm leading-relaxed text-white/50 lg:block">
            {tLogin('subline')}
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-background p-4 sm:p-6 lg:p-10">
        <Card className="w-full max-w-[430px] px-6 py-7 sm:px-9 sm:pt-9 sm:pb-7">
          <div className="mb-5 flex flex-col items-start gap-2">
            <Image
              src="/logos/schoolgesti-lockup.svg"
              alt="Schoolgesti"
              width={164}
              height={44}
              className="h-11 w-auto"
            />
            <LocaleQuickSwitcher className="lg:hidden" />
          </div>

          <h2 className="mb-1.5 text-[22px] font-extrabold tracking-tight text-foreground">
            {t('title')}
          </h2>
          <p className="mb-6 text-caption leading-relaxed text-muted-foreground">
            {portal === 'staff' ? t('subtitleStaff') : t('subtitle')}
          </p>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field
              label={t('passwordLabel')}
              type="password"
              name="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock size={14} />}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive-foreground">
                {error}
              </p>
            )}
            <Button type="submit" loading={submitting}>
              {submitting ? t('submitting') : t('submit')}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
