'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, KeyRound, Lock, Mail, PartyPopper } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { LocaleQuickSwitcher } from '@/components/settings/LanguagePicker';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

// Consumes a PASSWORD_RESET code (sent by /forgot-password) via
// POST /api/auth/reset-password. That route issues no cookies — it's a
// pre-session endpoint where the code itself is the proof — so success sends
// the user back to /login to sign in with their new password.
//
// The email link (see lib/server/auth/email-templates.ts) carries
// ?email=&code= so both fields arrive pre-filled — the user still has to
// enter a new password and press submit themselves (no auto-submit on load),
// so a corporate email scanner pre-fetching the link can't burn the
// single-use code.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('ResetPassword');
  const tLogin = useTranslations('Login');
  const tCommon = useTranslations('Common');
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [code, setCode] = useState(searchParams.get('code') ?? '');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: { email, code: code.trim().toUpperCase(), newPassword: password },
      });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        switch (err.code) {
          case 'VERIFICATION_CODE_INVALID':
            setError(t('errors.VERIFICATION_CODE_INVALID'));
            break;
          case 'VERIFICATION_CODE_EXPIRED':
            setError(t('errors.VERIFICATION_CODE_EXPIRED'));
            break;
          case 'TOO_MANY_RESET_ATTEMPTS':
            setError(t('errors.TOO_MANY_RESET_ATTEMPTS'));
            break;
          case 'PASSWORD_BANNED':
            setError(t('errors.PASSWORD_BANNED'));
            break;
          case 'PASSWORD_TOO_SHORT':
            setError(t('errors.PASSWORD_TOO_SHORT'));
            break;
          case 'PASSWORD_PWNED':
            setError(t('errors.PASSWORD_PWNED'));
            break;
          default:
            setError(tCommon('errors.generic'));
        }
      } else {
        setError(tCommon('errors.network'));
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
          <LocaleQuickSwitcher className="[&_button]:text-white/70 [&_button[aria-current]]:text-white" />
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
          <div className="mb-5 flex items-center justify-between gap-3">
            <Image
              src="/logos/schoolgesti-lockup.svg"
              alt="Schoolgesti"
              width={164}
              height={44}
              className="h-11 w-auto"
            />
            <LocaleQuickSwitcher className="lg:hidden" />
          </div>

          {done ? (
            <>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-success">
                <PartyPopper size={20} className="text-success-foreground" />
              </div>
              <h2 className="mb-1.5 text-[22px] font-extrabold tracking-tight text-foreground">
                {t('done.title')}
              </h2>
              <p className="mb-6 text-caption leading-relaxed text-muted-foreground">
                {t('done.subtitle')}
              </p>
              <Button onClick={() => router.push('/login')}>{t('done.cta')}</Button>
            </>
          ) : (
            <>
              <h2 className="mb-1.5 text-[22px] font-extrabold tracking-tight text-foreground">
                {t('title')}
              </h2>
              <p className="mb-6 text-caption leading-relaxed text-muted-foreground">
                {t('subtitle')}
              </p>
              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                <Field
                  label={t('emailLabel')}
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  icon={<Mail size={14} />}
                />
                <Field
                  label={t('codeLabel')}
                  type="text"
                  name="code"
                  required
                  placeholder={t('codePlaceholder')}
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  icon={<KeyRound size={14} />}
                  className="uppercase"
                />
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
              <Link
                href="/login"
                className="mt-5 flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground"
              >
                <ArrowLeft size={14} />
                {t('backToLogin')}
              </Link>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
