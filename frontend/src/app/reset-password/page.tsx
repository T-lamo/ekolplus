'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, GraduationCap, KeyRound, Lock, Mail, PartyPopper } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AUTH_LOGIN, AUTH_RESET_PASSWORD } from '@/lib/constants';
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
      if (err instanceof ApiError && err.code in AUTH_RESET_PASSWORD.errors) {
        setError(AUTH_RESET_PASSWORD.errors[err.code as keyof typeof AUTH_RESET_PASSWORD.errors]);
      } else if (err instanceof ApiError) {
        setError(AUTH_RESET_PASSWORD.errors.default);
      } else {
        setError(AUTH_RESET_PASSWORD.errors.network);
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
        <div className="relative z-10 flex w-full max-w-md flex-col items-start">
          <div className="mb-4 flex items-center gap-3 lg:mb-12">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary">
              <GraduationCap size={22} />
            </div>
            <div className="text-2xl font-black tracking-tight">
              {AUTH_LOGIN.brandName}
              <span className="text-violet-300">{AUTH_LOGIN.brandSuffix}</span>
            </div>
          </div>
          <h1 className="mb-3 hidden text-[32px] leading-tight font-extrabold tracking-tight lg:block">
            {AUTH_LOGIN.headline}
          </h1>
          <p className="mb-10 hidden text-sm leading-relaxed text-white/50 lg:block">
            {AUTH_LOGIN.subline}
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-background p-4 sm:p-6 lg:p-10">
        <Card className="w-full max-w-[430px] px-6 py-7 sm:px-9 sm:pt-9 sm:pb-7">
          <div className="mb-5 flex items-center gap-2">
            <div className="flex h-[34px] w-[34px] items-center justify-center rounded-md bg-primary">
              <GraduationCap size={17} className="text-primary-foreground" />
            </div>
            <div className="text-lg font-black tracking-tight text-foreground">
              {AUTH_LOGIN.brandName}
              <span className="text-primary">{AUTH_LOGIN.brandSuffix}</span>
            </div>
          </div>

          {done ? (
            <>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-success">
                <PartyPopper size={20} className="text-success-foreground" />
              </div>
              <h2 className="mb-1.5 text-[22px] font-extrabold tracking-tight text-foreground">
                {AUTH_RESET_PASSWORD.done.title}
              </h2>
              <p className="mb-6 text-[13px] leading-relaxed text-muted-foreground">
                {AUTH_RESET_PASSWORD.done.subtitle}
              </p>
              <Button onClick={() => router.push('/login')}>{AUTH_RESET_PASSWORD.done.cta}</Button>
            </>
          ) : (
            <>
              <h2 className="mb-1.5 text-[22px] font-extrabold tracking-tight text-foreground">
                {AUTH_RESET_PASSWORD.title}
              </h2>
              <p className="mb-6 text-[13px] leading-relaxed text-muted-foreground">
                {AUTH_RESET_PASSWORD.subtitle}
              </p>
              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                <Field
                  label={AUTH_RESET_PASSWORD.emailLabel}
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  icon={<Mail size={14} />}
                />
                <Field
                  label={AUTH_RESET_PASSWORD.codeLabel}
                  type="text"
                  name="code"
                  required
                  placeholder={AUTH_RESET_PASSWORD.codePlaceholder}
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  icon={<KeyRound size={14} />}
                  className="uppercase"
                />
                <Field
                  label={AUTH_RESET_PASSWORD.passwordLabel}
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
                  {submitting ? AUTH_RESET_PASSWORD.submitting : AUTH_RESET_PASSWORD.submit}
                </Button>
              </form>
              <Link
                href="/login"
                className="mt-5 flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground"
              >
                <ArrowLeft size={14} />
                {AUTH_RESET_PASSWORD.backToLogin}
              </Link>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
