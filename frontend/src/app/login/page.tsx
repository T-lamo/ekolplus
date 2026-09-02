'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  BarChart2,
  BookOpen,
  Check,
  ClipboardCheck,
  Eye,
  EyeOff,
  FileText,
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
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { LocaleQuickSwitcher } from '@/components/settings/LanguagePicker';

const ROLE_TAB_KEYS = ['admin', 'teacher', 'studentParent'] as const;
const ROLE_TAB_ICONS = { admin: Shield, teacher: User, studentParent: Users } as const;
const FEATURE_KEYS = ['grades', 'attendance', 'bulletins', 'stats'] as const;
const FEATURE_ICONS = {
  grades: BookOpen,
  attendance: ClipboardCheck,
  bulletins: FileText,
  stats: BarChart2,
} as const;

// ApiError.code values this screen knows how to translate — everything
// else (VALIDATION_FAILED and any future/unmapped code) falls through to
// Common.errors.generic. Kept local to this screen rather than in a
// shared table: only /login ever returns these particular codes today
// (see frontend/src/app/api/auth/login/route.ts).
export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const t = useTranslations('Login');
  const tCommon = useTranslations('Common');
  const [role, setRole] = useState<(typeof ROLE_TAB_KEYS)[number]>('admin');
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
      // Multi-espaces (spec 2026-09-01 §6) : plateforme (ADMIN/SUPERADMIN)
      // d'abord ; 1 seul espace → entrée directe (l'onglet est ignoré) ;
      // ≥ 2 espaces → page « Choisissez votre espace », l'onglet du login
      // pré-sélectionnant la carte ; 0 espace → /dashboard (écran « pas
      // d'école » existant). `/` reste la landing publique.
      const isPlatformStaff = me?.role === 'SUPERADMIN' || me?.role === 'ADMIN';
      const spaces = me?.spaces;
      const available = [
        ...(spaces?.school ? ['/dashboard'] : []),
        ...(spaces?.teacher ? ['/espace-enseignant'] : []),
        ...(spaces?.student ? ['/eleve'] : []),
      ];
      const pref = role === 'studentParent' ? 'student' : role;
      const destination = isPlatformStaff
        ? '/admin'
        : available.length >= 2
          ? `/espaces?pref=${pref}`
          : (available[0] ?? '/dashboard');
      router.push(destination);
    } catch (err) {
      if (err instanceof ApiError) {
        // Static, literal keys on purpose — next-intl's typed t() (see
        // Task 7's AppConfig augmentation) validates each one against the
        // real Login.errors.* keys at compile time; a dynamically built
        // key (`t(`errors.${code}`)`) would bypass that check.
        switch (err.code) {
          case 'TOO_MANY_LOGIN_ATTEMPTS':
            setError(t('errors.TOO_MANY_LOGIN_ATTEMPTS'));
            break;
          case 'LOCKED_OUT':
            setError(t('errors.LOCKED_OUT'));
            break;
          case 'INVALID_CREDENTIALS':
            setError(t('errors.INVALID_CREDENTIALS'));
            break;
          case 'EMAIL_NOT_VERIFIED':
            setError(t('errors.EMAIL_NOT_VERIFIED'));
            break;
          case 'ACCOUNT_SUSPENDED':
            setError(t('errors.ACCOUNT_SUSPENDED'));
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
          className="pointer-events-none absolute top-16 -right-20 hidden h-70 w-70 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--color-primary)_25%,transparent)_0%,transparent_70%)] lg:block"
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
            {t('headline')}
          </h1>
          <p className="mb-10 hidden text-sm leading-relaxed text-white/50 lg:block">
            {t('subline')}
          </p>

          <div className="mb-4 hidden w-full flex-col gap-4 lg:flex">
            {FEATURE_KEYS.map((key) => {
              const Icon = FEATURE_ICONS[key];
              return (
                <div key={key} className="flex items-center gap-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/35">
                    <Icon size={15} className="text-sidebar-dark-foreground" />
                  </div>
                  <span className="text-[13px] font-medium text-white/78">
                    {t(`features.${key}`)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-background p-4 sm:p-6 lg:p-10">
        <Card className="w-full max-w-[430px] px-6 py-7 sm:px-9 sm:pt-9 sm:pb-7">
          <div className="mb-2 flex flex-col items-start gap-2">
            <Image
              src="/logos/schoolgesti-lockup.svg"
              alt="Schoolgesti"
              width={164}
              height={44}
              className="h-11 w-auto"
            />
            <LocaleQuickSwitcher className="lg:hidden" />
          </div>

          <h2 className="mb-1.5 text-[26px] font-extrabold tracking-tight text-foreground">
            {t('welcome')}
          </h2>
          <p className="mb-6 text-[13px] leading-relaxed text-muted-foreground">
            {t('formSubtitle')}
          </p>

          <div
            role="tablist"
            aria-label={t('accountTypeLabel')}
            className="mb-6 flex gap-0.5 rounded-md bg-muted p-1"
          >
            {ROLE_TAB_KEYS.map((key) => {
              const Icon = ROLE_TAB_ICONS[key];
              return (
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
                  {t(`roleTabs.${key}`)}
                </button>
              );
            })}
          </div>

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

            <div className="flex flex-col gap-1">
              <Field
                label={t('passwordLabel')}
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
                    aria-label={showPassword ? t('hidePassword') : t('showPassword')}
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
                  {t('forgotPassword')}
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
              <span className="text-xs text-muted-foreground">{t('rememberMe')}</span>
            </label>

            {error && (
              <p role="alert" className="text-sm text-destructive-foreground">
                {error}
              </p>
            )}

            <Button type="submit" loading={submitting}>
              <LogIn size={16} />
              {submitting ? t('submitting') : t('submit')}
            </Button>
          </form>

          <p className="mb-3.5 text-center text-xs leading-relaxed text-muted-foreground">
            {t('noAccount')}{' '}
            <Link href="/#contact" className="font-semibold text-primary">
              {t('contactAdmin')}
            </Link>
          </p>

          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2.5 text-[11px] text-muted-foreground">
            <ShieldCheck size={13} className="shrink-0 text-success-foreground" />
            <span>{t('securityNote')}</span>
          </div>
        </Card>
      </div>
    </main>
  );
}
