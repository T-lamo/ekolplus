'use client';

// /admin/system/settings — Paramètres Système (Banani wYzeYOvmfsoL).
// Plan: .planning/banani/system-settings.md. Scope = Q3: identity, plan
// pricing, trial days and notification switches are real (PlatformSettings
// singleton + SubscriptionPlan); Stripe block reads env presence only; 2FA/
// API key/backups are honest read-only ("bientôt"/informative); maintenance
// mode deferred. Mutations SUPERADMIN-only — plain ADMIN gets a read-only
// banner and disabled controls.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CreditCard, Database, Lock, RotateCcw, Save, ShieldAlert } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useToast } from '@/contexts/ToastContext';
import { ADMIN_SETTINGS as T, APPEARANCE } from '@/lib/constants';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { Select, SelectItem } from '@/components/ui/Select';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { SkeletonStatCards } from '@/components/ui/Skeleton';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { LanguagePicker } from '@/components/settings/LanguagePicker';

interface SettingsForm {
  platformName: string;
  domain: string;
  supportEmail: string;
  timezone: string;
  locale: string;
  logoUrl: string | null;
  trialDays: string;
  notifyNewSubscription: boolean;
  notifyFailedPayment: boolean;
  weeklyReport: boolean;
  expiryReminders: boolean;
  /** Plan key → price in dollars (input string). */
  prices: Record<string, string>;
}

interface SettingsResponse {
  settings: {
    platformName: string;
    domain: string | null;
    supportEmail: string | null;
    timezone: string;
    locale: string;
    logoUrl: string | null;
    trialDays: number;
    notifyNewSubscription: boolean;
    notifyFailedPayment: boolean;
    weeklyReport: boolean;
    expiryReminders: boolean;
  };
  plans: { key: string; name: string; pricePerStudentCents: number; currency: string }[];
  stripe: { configured: boolean; mode: 'live' | 'test' | null; missing: string[] };
  version: string;
  primaryAdminEmail: string | null;
  isSuperadmin: boolean;
}

const TIMEZONES = [
  'America/Port-au-Prince',
  'America/New_York',
  'Africa/Dakar',
  'Europe/Paris',
  'UTC',
];

const NOTIFICATION_KEYS = [
  'notifyNewSubscription',
  'notifyFailedPayment',
  'weeklyReport',
  'expiryReminders',
] as const;

function toForm(d: SettingsResponse): SettingsForm {
  return {
    platformName: d.settings.platformName,
    domain: d.settings.domain ?? '',
    supportEmail: d.settings.supportEmail ?? '',
    timezone: d.settings.timezone,
    locale: d.settings.locale,
    logoUrl: d.settings.logoUrl,
    trialDays: String(d.settings.trialDays),
    notifyNewSubscription: d.settings.notifyNewSubscription,
    notifyFailedPayment: d.settings.notifyFailedPayment,
    weeklyReport: d.settings.weeklyReport,
    expiryReminders: d.settings.expiryReminders,
    prices: Object.fromEntries(
      d.plans.map((p) => [p.key, (p.pricePerStudentCents / 100).toFixed(2)]),
    ),
  };
}

function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="scroll-mt-20 p-4 sm:p-5" id={id}>
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      <p className="mt-0.5 mb-4 text-xs text-muted-foreground">{description}</p>
      {children}
    </Card>
  );
}

export default function SystemSettingsPage() {
  const { toast } = useToast();
  const {
    data,
    loading,
    error: dataErr,
    refresh: load,
  } = useApi<SettingsResponse>('/api/admin/system/settings');
  const error = dataErr ? T.loadError : null;
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [initial, setInitial] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  // Seed the draft form once per fetch — never on a background
  // revalidation of the same data, which would otherwise silently discard
  // an in-progress unsaved edit. `onSave` resets this ref right before its
  // own explicit `load()` call so the post-save server truth (e.g. rounded
  // prices) re-syncs the draft and `dirty` correctly clears.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!seededRef.current && data) {
      seededRef.current = true;
      const f = toForm(data);
      setForm(f);
      setInitial(JSON.stringify(f));
    }
  }, [data]);

  const dirty = useMemo(() => form !== null && JSON.stringify(form) !== initial, [form, initial]);
  const readOnly = data ? !data.isSuperadmin : true;

  function patch(p: Partial<SettingsForm>) {
    setForm((f) => (f ? { ...f, ...p } : f));
  }

  async function onSave() {
    if (!form || !data) return;
    const trialDays = Number.parseInt(form.trialDays, 10);
    if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) {
      toast(T.billing.trialDays, 'error');
      return;
    }
    const planPrices: { key: string; pricePerStudentCents: number }[] = [];
    for (const p of data.plans) {
      const raw = form.prices[p.key];
      if (raw === undefined) continue;
      const cents = Math.round(Number.parseFloat(raw.replace(',', '.')) * 100);
      if (!Number.isFinite(cents) || cents <= 0) {
        toast(T.invalidPrice, 'error');
        return;
      }
      if (cents !== p.pricePerStudentCents)
        planPrices.push({ key: p.key, pricePerStudentCents: cents });
    }
    setSaving(true);
    try {
      await api('/api/admin/system/settings', {
        method: 'PUT',
        body: {
          platformName: form.platformName,
          domain: form.domain.trim() || null,
          supportEmail: form.supportEmail.trim() || null,
          timezone: form.timezone,
          locale: form.locale,
          logoUrl: form.logoUrl,
          trialDays,
          notifyNewSubscription: form.notifyNewSubscription,
          notifyFailedPayment: form.notifyFailedPayment,
          weeklyReport: form.weeklyReport,
          expiryReminders: form.expiryReminders,
          ...(planPrices.length > 0 ? { planPrices } : {}),
        },
      });
      toast(T.saved, 'success');
      seededRef.current = false;
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : T.loadError, 'error');
    } finally {
      setSaving(false);
    }
  }

  function onDiscard() {
    if (!data) return;
    setForm(toForm(data));
  }

  if (error) {
    return (
      <div className="w-full">
        <AdminPageHeader title={T.title} subtitle={T.subtitle} />
        <div className="flex flex-col items-center gap-3 py-12">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button className="w-auto" onClick={() => void load()}>
            {T.retry}
          </Button>
        </div>
      </div>
    );
  }

  if (loading || !form || !data) {
    return (
      <div className="w-full">
        <AdminPageHeader title={T.title} subtitle={T.subtitle} />
        <SkeletonStatCards count={4} />
      </div>
    );
  }

  const navItems = [
    { id: 'general', label: T.nav.general },
    { id: 'appearance', label: APPEARANCE.adminNav },
    { id: 'language', label: 'Langue' },
    { id: 'billing', label: T.nav.billing },
    { id: 'notifications', label: T.nav.notifications },
    { id: 'security', label: T.nav.security },
    { id: 'backups', label: T.nav.backups },
    { id: 'danger', label: T.nav.danger },
  ];

  return (
    <div className="w-full">
      <AdminPageHeader
        title={T.title}
        subtitle={T.subtitle}
        actions={
          !readOnly ? (
            <>
              <Button
                variant="outline"
                className="sm:w-auto"
                disabled={!dirty || saving}
                onClick={onDiscard}
              >
                <RotateCcw size={14} />
                {T.discard}
              </Button>
              <Button
                className="sm:w-auto"
                disabled={!dirty}
                loading={saving}
                onClick={() => void onSave()}
              >
                <Save size={14} />
                {saving ? T.saving : T.save}
              </Button>
            </>
          ) : undefined
        }
      />

      {readOnly && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-3 text-caption text-foreground">
          <Lock size={14} className="shrink-0 text-primary" />
          {T.superadminOnly}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <nav
          aria-label={T.title}
          className="flex gap-1.5 overflow-x-auto pb-1 lg:sticky lg:top-20 lg:w-48 lg:shrink-0 lg:flex-col lg:pb-0"
        >
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="rounded-lg px-3 py-2 text-caption font-medium whitespace-nowrap text-muted-foreground hover:bg-secondary hover:text-primary"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <SettingsSection id="general" title={T.general.title} description={T.general.description}>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field
                label={T.general.platformName}
                name="platformName"
                required
                disabled={readOnly}
                value={form.platformName}
                onChange={(e) => patch({ platformName: e.target.value })}
              />
              <Field
                label={T.general.domain}
                name="domain"
                disabled={readOnly}
                value={form.domain}
                onChange={(e) => patch({ domain: e.target.value })}
                placeholder="app.schoolgesti.com"
              />
              <Field
                label={T.general.supportEmail}
                name="supportEmail"
                type="email"
                disabled={readOnly}
                value={form.supportEmail}
                onChange={(e) => patch({ supportEmail: e.target.value })}
                placeholder="support@schoolgesti.com"
              />
              <Select
                label={T.general.timezone}
                value={form.timezone}
                onValueChange={(v) => patch({ timezone: v })}
                disabled={readOnly}
              >
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </Select>
              <Select
                label={T.general.locale}
                value={form.locale}
                onValueChange={(v) => patch({ locale: v })}
                disabled={readOnly}
              >
                {Object.entries(T.general.locales).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </Select>
              <Field
                label={T.general.version}
                name="version"
                value={`v${data.version}`}
                readOnly
                disabled
              />
            </div>
            {!readOnly && (
              <div className="mt-3.5">
                <ImageUploader
                  label={T.general.logo}
                  hint={T.general.logoHint}
                  value={form.logoUrl}
                  onChange={(url) => patch({ logoUrl: url })}
                />
              </div>
            )}
          </SettingsSection>

          {/* Per-user colour theme — applies immediately through ThemeProvider,
              independent of the Save button (not a PlatformSettings field). */}
          <SettingsSection
            id="appearance"
            title={APPEARANCE.title}
            description={APPEARANCE.description}
          >
            <ThemePicker />
          </SettingsSection>

          {/* Per-user UI language — same pattern as Apparence above, and
              likewise independent of the Save button / PlatformSettings.
              Distinct from PlatformSettings.locale (below, under General)
              which is an unrelated platform-wide default. */}
          <SettingsSection
            id="language"
            title="Langue"
            description="Langue de l'interface pour ton propre compte."
          >
            <LanguagePicker />
          </SettingsSection>

          <SettingsSection id="billing" title={T.billing.title} description={T.billing.description}>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field
                label={T.billing.currency}
                name="currency"
                value={T.billing.currencyValue}
                readOnly
                disabled
              />
              <div>
                <Field
                  label={T.billing.trialDays}
                  name="trialDays"
                  inputMode="numeric"
                  disabled={readOnly}
                  value={form.trialDays}
                  onChange={(e) => patch({ trialDays: e.target.value })}
                />
                <p className="mt-1 text-2xs text-muted-foreground">{T.billing.trialDaysHint}</p>
              </div>
              {data.plans.map((p) => (
                <Field
                  key={p.key}
                  label={T.billing.pricePerStudent(p.name)}
                  name={`price-${p.key}`}
                  inputMode="decimal"
                  disabled={readOnly}
                  value={form.prices[p.key] ?? ''}
                  onChange={(e) => patch({ prices: { ...form.prices, [p.key]: e.target.value } })}
                />
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border bg-background p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                  <CreditCard size={15} />
                </span>
                <div>
                  <div className="text-caption font-semibold text-foreground">
                    {T.billing.stripeTitle}
                  </div>
                  <div className="text-2xs text-muted-foreground">{T.billing.stripeHint}</div>
                </div>
              </div>
              <Badge
                tone={data.stripe.configured ? 'success' : data.stripe.mode ? 'warning' : 'muted'}
              >
                {data.stripe.configured
                  ? `${T.billing.stripeConnected}${data.stripe.mode ? ` — ${T.billing.stripeMode[data.stripe.mode]}` : ''}`
                  : data.stripe.mode
                    ? T.billing.stripePartial(data.stripe.missing)
                    : T.billing.stripeNotConfigured}
              </Badge>
            </div>
          </SettingsSection>

          <SettingsSection
            id="notifications"
            title={T.notifications.title}
            description={T.notifications.description}
          >
            <div className="flex flex-col divide-y divide-border">
              {NOTIFICATION_KEYS.map((key) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <div className="text-caption font-semibold text-foreground">
                      {T.notifications.items[key].label}
                    </div>
                    <div className="text-2xs text-muted-foreground">
                      {T.notifications.items[key].sub} — {T.notifications.channelPending}
                    </div>
                  </div>
                  <Switch
                    checked={form[key]}
                    disabled={readOnly}
                    label={T.notifications.items[key].label}
                    onChange={(checked) => patch({ [key]: checked } as Partial<SettingsForm>)}
                  />
                </div>
              ))}
            </div>
          </SettingsSection>

          <SettingsSection
            id="security"
            title={T.security.title}
            description={T.security.description}
          >
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field
                label={T.security.primaryAdmin}
                name="primaryAdmin"
                value={data.primaryAdminEmail ?? '—'}
                readOnly
                disabled
              />
              <div>
                <Field
                  label={T.security.sessionTitle}
                  name="session"
                  value={T.security.sessionValue}
                  readOnly
                  disabled
                />
                <p className="mt-1 text-2xs text-muted-foreground">{T.security.sessionHint}</p>
              </div>
            </div>
            <div className="mt-3.5 flex flex-col gap-2">
              {[T.security.twoFa, T.security.apiKey].map((label) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3.5 py-3"
                >
                  <span className="text-caption font-medium text-foreground">{label}</span>
                  <Badge tone="muted">{T.security.comingSoon}</Badge>
                </div>
              ))}
            </div>
          </SettingsSection>

          <SettingsSection id="backups" title={T.backups.title} description={T.backups.description}>
            <div className="flex items-start gap-2.5 rounded-xl border border-border bg-background p-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                <Database size={15} />
              </span>
              <p className="text-caption leading-relaxed text-muted-foreground">{T.backups.body}</p>
            </div>
          </SettingsSection>

          {!readOnly && (
            <Card className="scroll-mt-20 border-destructive-foreground/30 p-4 sm:p-5" id="danger">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-destructive-foreground">
                <ShieldAlert size={15} />
                {T.danger.title}
              </h2>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-caption font-semibold text-foreground">
                    {T.danger.resetTitle}
                  </div>
                  <div className="text-2xs text-muted-foreground">{T.danger.resetBody}</div>
                </div>
                <Button
                  variant="outline"
                  className="sm:w-auto border-destructive-foreground/40 text-destructive-foreground hover:bg-destructive"
                  onClick={() => setResetOpen(true)}
                >
                  {T.danger.resetButton}
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {resetOpen && (
        <ResetModal
          onClose={() => setResetOpen(false)}
          onDone={() => {
            setResetOpen(false);
            toast(T.danger.done, 'success');
            void load();
          }}
        />
      )}
    </div>
  );
}

function ResetModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function onReset() {
    setBusy(true);
    try {
      await api('/api/admin/system/settings', { method: 'DELETE' });
      onDone();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : T.loadError, 'error');
      setBusy(false);
    }
  }

  return (
    <Modal title={T.danger.modalTitle} onClose={onClose}>
      <p className="text-sm text-foreground">{T.danger.modalBody(T.danger.confirmWord)}</p>
      <div className="mt-3">
        <Field
          label={T.danger.confirmWord}
          name="confirmReset"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="mt-4 flex gap-2.5">
        <Button variant="outline" onClick={onClose}>
          {T.danger.cancel}
        </Button>
        <Button
          loading={busy}
          disabled={confirm !== T.danger.confirmWord}
          className="bg-destructive-foreground hover:bg-destructive-foreground/90"
          onClick={() => void onReset()}
        >
          {busy ? T.danger.resetting : T.danger.confirm}
        </Button>
      </div>
    </Modal>
  );
}
