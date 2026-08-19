'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, MailCheck } from 'lucide-react';
import Image from 'next/image';
import { api, ApiError } from '@/lib/api';
import { AUTH_LOGIN, AUTH_FORGOT_PASSWORD } from '@/lib/constants';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOO_MANY_FORGOT_ATTEMPTS') {
        setError(AUTH_FORGOT_PASSWORD.errors.TOO_MANY_FORGOT_ATTEMPTS);
      } else if (err instanceof ApiError) {
        setError(AUTH_FORGOT_PASSWORD.errors.default);
      } else {
        setError(AUTH_FORGOT_PASSWORD.errors.network);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      {/* Same branding panel as /login, kept visually consistent. */}
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
            {AUTH_LOGIN.headline}
          </h1>
          <p className="mb-10 hidden text-sm leading-relaxed text-white/50 lg:block">
            {AUTH_LOGIN.subline}
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-background p-4 sm:p-6 lg:p-10">
        <Card className="w-full max-w-[430px] px-6 py-7 sm:px-9 sm:pt-9 sm:pb-7">
          <div className="mb-5 flex items-center">
            <Image
              src="/logos/schoolgesti-lockup.svg"
              alt="Schoolgesti"
              width={164}
              height={44}
              className="h-11 w-auto"
            />
          </div>

          {submitted ? (
            <>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-success">
                <MailCheck size={20} className="text-success-foreground" />
              </div>
              <h2 className="mb-1.5 text-[22px] font-extrabold tracking-tight text-foreground">
                {AUTH_FORGOT_PASSWORD.confirmation.title}
              </h2>
              <p className="mb-6 text-caption leading-relaxed text-muted-foreground">
                {AUTH_FORGOT_PASSWORD.confirmation.body(email)}
              </p>
              <Link
                href="/login"
                className="flex items-center justify-center gap-1.5 text-sm font-semibold text-primary"
              >
                <ArrowLeft size={14} />
                {AUTH_FORGOT_PASSWORD.backToLogin}
              </Link>
            </>
          ) : (
            <>
              <h2 className="mb-1.5 text-[22px] font-extrabold tracking-tight text-foreground">
                {AUTH_FORGOT_PASSWORD.title}
              </h2>
              <p className="mb-6 text-caption leading-relaxed text-muted-foreground">
                {AUTH_FORGOT_PASSWORD.subtitle}
              </p>

              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                <Field
                  label={AUTH_FORGOT_PASSWORD.emailLabel}
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  icon={<Mail size={14} />}
                />

                {error && (
                  <p role="alert" className="text-sm text-destructive-foreground">
                    {error}
                  </p>
                )}

                <Button type="submit" loading={submitting}>
                  <Mail size={16} />
                  {submitting ? AUTH_FORGOT_PASSWORD.submitting : AUTH_FORGOT_PASSWORD.submit}
                </Button>
              </form>

              <Link
                href="/login"
                className="mt-5 flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground"
              >
                <ArrowLeft size={14} />
                {AUTH_FORGOT_PASSWORD.backToLogin}
              </Link>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
