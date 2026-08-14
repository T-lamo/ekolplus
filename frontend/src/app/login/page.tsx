'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BarChart2,
  BookOpen,
  Check,
  ClipboardCheck,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  Lock,
  LogIn,
  Mail,
  Shield,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { AUTH_LOGIN } from '@/lib/constants';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

const ROLE_TABS = [
  { key: 'admin', label: AUTH_LOGIN.roleTabs.admin, icon: Shield },
  { key: 'teacher', label: AUTH_LOGIN.roleTabs.teacher, icon: User },
  { key: 'studentParent', label: AUTH_LOGIN.roleTabs.studentParent, icon: Users },
] as const;

const FEATURE_ICONS = [BookOpen, ClipboardCheck, FileText, BarChart2];

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [role, setRole] = useState<(typeof ROLE_TABS)[number]['key']>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      const me = await refresh();
      // Platform staff (ADMIN/SUPERADMIN) land on the SaaS back-office;
      // school users land on their configuration home. `/` stays the public
      // marketing landing — a logged-in user must never land there.
      const isPlatformStaff = me?.role === 'SUPERADMIN' || me?.role === 'ADMIN';
      router.push(isPlatformStaff ? '/admin' : '/configuration/classes');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.code === 'TOO_MANY_LOGIN_ATTEMPTS'
            ? AUTH_LOGIN.errors.TOO_MANY_LOGIN_ATTEMPTS
            : AUTH_LOGIN.errors.default,
        );
      } else {
        setError(AUTH_LOGIN.errors.network);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      {/* Branding panel — full feature showcase on lg+, compact header band on mobile */}
      <div className="relative flex shrink-0 flex-col items-start justify-center overflow-hidden bg-sidebar-dark px-6 py-8 text-white lg:w-[60%] lg:items-center lg:px-10 lg:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-24 hidden h-85 w-85 rounded-full border border-primary/20 lg:block"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -left-16 hidden h-55 w-55 rounded-full border border-primary/10 lg:block"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-16 -right-20 hidden h-70 w-70 rounded-full bg-[radial-gradient(circle,rgba(108,43,217,0.25)_0%,transparent_70%)] lg:block"
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

          <div className="mb-4 hidden w-full flex-col gap-4 lg:flex">
            {AUTH_LOGIN.features.map((text, i) => {
              const Icon = FEATURE_ICONS[i];
              return (
                <div key={text} className="flex items-center gap-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/35">
                    {Icon && <Icon size={15} className="text-violet-300" />}
                  </div>
                  <span className="text-[13px] font-medium text-white/78">{text}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Form panel */}
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

          <h2 className="mb-1.5 text-[26px] font-extrabold tracking-tight text-foreground">
            {AUTH_LOGIN.welcome}
          </h2>
          <p className="mb-6 text-[13px] leading-relaxed text-muted-foreground">
            {AUTH_LOGIN.formSubtitle}
          </p>

          <div
            role="tablist"
            aria-label="Type de compte"
            className="mb-6 flex gap-0.5 rounded-md bg-muted p-1"
          >
            {ROLE_TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={role === key}
                onClick={() => setRole(key)}
                className={`flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-sm px-1.5 text-[11px] font-semibold whitespace-nowrap ${
                  role === key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'
                }`}
              >
                <Icon size={11} />
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field
              label={AUTH_LOGIN.emailLabel}
              type="email"
              name="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail size={14} />}
            />

            <div className="flex flex-col gap-1">
              <Field
                label={AUTH_LOGIN.passwordLabel}
                type={showPassword ? 'text' : 'password'}
                name="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<Lock size={14} className="text-muted-foreground" />}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                    }
                    className="flex h-12 w-12 shrink-0 items-center justify-center text-muted-foreground"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                }
              />
              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="inline-flex items-center py-1.5 text-[11px] font-semibold text-primary"
                >
                  {AUTH_LOGIN.forgotPassword}
                </Link>
              </div>
            </div>

            <label className="flex min-h-12 cursor-pointer items-center gap-2">
              <span
                onClick={() => setRememberMe((v) => !v)}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm ${
                  rememberMe ? 'bg-primary' : 'border border-border'
                }`}
              >
                {rememberMe && <Check size={10} className="text-white" />}
              </span>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="sr-only"
              />
              <span className="text-xs text-muted-foreground">{AUTH_LOGIN.rememberMe}</span>
            </label>

            {error && (
              <p role="alert" className="text-sm text-destructive-foreground">
                {error}
              </p>
            )}

            <Button type="submit" loading={submitting}>
              <LogIn size={16} />
              {submitting ? AUTH_LOGIN.submitting : AUTH_LOGIN.submit}
            </Button>
          </form>

          <p className="mb-3.5 text-center text-xs leading-relaxed text-muted-foreground">
            {AUTH_LOGIN.noAccount}{' '}
            <Link href="/#contact-demo" className="font-semibold text-primary">
              {AUTH_LOGIN.contactAdmin}
            </Link>
          </p>

          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2.5 text-[11px] text-muted-foreground">
            <ShieldCheck size={13} className="shrink-0 text-success-foreground" />
            <span>{AUTH_LOGIN.securityNote}</span>
          </div>
        </Card>
      </div>
    </main>
  );
}
