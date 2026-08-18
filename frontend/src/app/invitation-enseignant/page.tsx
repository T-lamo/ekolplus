'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { GraduationCap, KeyRound, Lock, PartyPopper } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AUTH_TEACHER_INVITE } from '@/lib/constants';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

export default function TeacherInvitePage() {
  return (
    <Suspense fallback={null}>
      <TeacherInviteForm />
    </Suspense>
  );
}

function TeacherInviteForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [resolved, setResolved] = useState<{ teacherName: string; schoolName: string } | null>(
    null,
  );
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setInvalid(true);
      return;
    }
    api<{ teacherName: string; schoolName: string }>(`/api/auth/teacher-invite/${token}`)
      .then(setResolved)
      .catch(() => setInvalid(true));
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api(`/api/auth/teacher-invite/${token}/accept`, { method: 'POST', body: { password } });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code in AUTH_TEACHER_INVITE.errors) {
        setError(AUTH_TEACHER_INVITE.errors[err.code as keyof typeof AUTH_TEACHER_INVITE.errors]);
      } else if (err instanceof ApiError) {
        setError(AUTH_TEACHER_INVITE.errors.default);
      } else {
        setError(AUTH_TEACHER_INVITE.errors.network);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md gap-5 p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
            <GraduationCap size={22} />
          </div>
          <div className="text-lg font-bold text-foreground">Schoolgesti</div>
        </div>

        {invalid ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <KeyRound size={28} className="text-muted-foreground" />
            <p className="font-semibold text-foreground">{AUTH_TEACHER_INVITE.invalid.title}</p>
            <p className="text-sm text-muted-foreground">{AUTH_TEACHER_INVITE.invalid.subtitle}</p>
          </div>
        ) : done ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <PartyPopper size={28} className="text-primary" />
            <p className="font-semibold text-foreground">{AUTH_TEACHER_INVITE.done.title}</p>
            <p className="text-sm text-muted-foreground">{AUTH_TEACHER_INVITE.done.subtitle}</p>
            <Link href="/login" className="mt-2">
              <Button>{AUTH_TEACHER_INVITE.done.cta}</Button>
            </Link>
          </div>
        ) : resolved ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div>
              <p className="text-lg font-bold text-foreground">{AUTH_TEACHER_INVITE.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {AUTH_TEACHER_INVITE.subtitle(resolved.teacherName, resolved.schoolName)}
              </p>
            </div>
            <Field
              label={AUTH_TEACHER_INVITE.passwordLabel}
              icon={<Lock size={15} />}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && (
              <p role="alert" className="text-sm text-destructive-foreground">
                {error}
              </p>
            )}
            <Button type="submit" loading={submitting}>
              {submitting ? AUTH_TEACHER_INVITE.submitting : AUTH_TEACHER_INVITE.submit}
            </Button>
          </form>
        ) : null}
      </Card>
    </main>
  );
}
