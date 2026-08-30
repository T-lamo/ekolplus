'use client';

// /admin/billing/subscriptions — Admin Subscriptions (Banani M0FRcZpAIEZQ).
// Plan: .planning/banani/admin-subscriptions.md. The mockup's "Utilisation"
// column is omitted (no capacity metric exists — plan's open question);
// "Envoyer rappels" is an honest stub (no send channel wired, fees-module
// precedent). Everything else is real CRUD on the billing models.

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  CalendarClock,
  CreditCard,
  FileSpreadsheet,
  Plus,
  Wallet,
  XCircle,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useToast } from '@/contexts/ToastContext';
import { ADMIN_SAAS, ADMIN_SUBSCRIPTIONS as T } from '@/lib/constants';
import { fmtDateMed, fmtUsd, fmtUsdRound } from '@/lib/admin-format';
import { exportToCsv } from '@/lib/csv-export';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { DateField } from '@/components/ui/DateField';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { Pager } from '@/components/ui/Pager';
import { Select, SelectItem as FormSelectItem } from '@/components/ui/Select';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { SkeletonFilters, SkeletonStatCards, SkeletonTable } from '@/components/ui/Skeleton';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatCard } from '@/components/admin/StatCard';
import { BarChart } from '@/components/admin/charts/BarChart';
import { DonutChart } from '@/components/admin/charts/DonutChart';
import { PlanBadge, SubscriptionStatusBadge } from '@/components/admin/badges';

interface SubRow {
  id: string;
  school: { id: string; name: string; city: string; country: string };
  plan: { key: string; name: string; priceCents: number };
  students: number;
  monthlyCents: number;
  status: 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELED';
  startedAt: string;
  renewsAt: string;
  trialEndsAt: string | null;
  expiringSoon: boolean;
  coupon: { id: string; code: string } | null;
  stripe: {
    subscriptionId: string;
    status: string | null;
    interval: 'MONTH' | 'YEAR' | null;
    cancelAtPeriodEnd: boolean;
    billedSeats: number | null;
  } | null;
}

interface SubsResponse {
  items: SubRow[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    activeCount: number;
    mrrCents: number;
    mrrDeltaPct: number | null;
    renewalsThisMonth: number;
    nextRenewalAt: string | null;
    expiredCount: number;
  };
  planBreakdown: {
    total: number;
    expired: number;
    items: { key: string; name: string; count: number; pct: number }[];
  };
  mrrSeries: { label: string; cents: number }[];
  expiring: { count: number; names: string[] };
  freeSchools: { id: string; name: string }[];
}

const TH_CLASS =
  'px-3 py-2 text-left text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase';
const TD_CLASS = 'px-3 py-2.5 text-[13px] whitespace-nowrap';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS);
}

type ModalState = { kind: 'none' } | { kind: 'create' } | { kind: 'manage'; sub: SubRow };

export default function AdminSubscriptionsPage() {
  return (
    <Suspense fallback={null}>
      <SubscriptionsPage />
    </Suspense>
  );
}

function SubscriptionsPage() {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [search, setSearch] = useState(searchParams.get('school') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const subsParams = new URLSearchParams();
  if (debouncedSearch) subsParams.set('q', debouncedSearch);
  if (plan) subsParams.set('plan', plan);
  if (status) subsParams.set('status', status);
  subsParams.set('page', String(page));
  const {
    data,
    loading,
    error: dataErr,
    refresh: load,
  } = useApi<SubsResponse>(`/api/admin/billing/subscriptions?${subsParams.toString()}`);
  const error = dataErr ? T.loadError : null;

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, plan, status]);

  function onExport() {
    if (!data) return;
    exportToCsv(
      'abonnements.csv',
      [
        T.columns.school,
        T.columns.plan,
        T.columns.students,
        T.columns.rate,
        T.columns.amount,
        T.columns.renewal,
        T.columns.status,
      ],
      data.items.map((s) => [
        s.school.name,
        s.plan.name,
        String(s.students),
        fmtUsd(s.plan.priceCents),
        fmtUsd(s.monthlyCents),
        fmtDateMed(s.renewsAt),
        ADMIN_SAAS.subscriptionStatus[s.status],
      ]),
    );
  }

  const stats = data?.stats;

  return (
    <div className="w-full">
      <AdminPageHeader
        title={T.title}
        subtitle={T.subtitle}
        actions={
          <>
            <Button variant="outline" className="sm:w-auto" onClick={onExport} disabled={!data}>
              <FileSpreadsheet size={14} />
              {T.export}
            </Button>
            <Button className="sm:w-auto" onClick={() => setModal({ kind: 'create' })}>
              <Plus size={14} />
              {T.newSubscription}
            </Button>
          </>
        }
      />

      <div className="flex min-h-full flex-col gap-4">
        {stats ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={T.kpi.active}
              value={String(stats.activeCount)}
              icon={<CreditCard size={15} />}
              deltaTone="muted"
              sub={undefined}
            />
            <StatCard
              label={T.kpi.mrr}
              value={fmtUsdRound(stats.mrrCents)}
              icon={<Wallet size={15} />}
              delta={
                stats.mrrDeltaPct !== null
                  ? `${stats.mrrDeltaPct >= 0 ? '+' : ''}${stats.mrrDeltaPct}%`
                  : undefined
              }
              deltaTone={
                stats.mrrDeltaPct !== null && stats.mrrDeltaPct < 0 ? 'destructive' : 'success'
              }
              sub={stats.mrrDeltaPct !== null ? T.kpi.vsLastMonth : undefined}
            />
            <StatCard
              label={T.kpi.renewals}
              value={String(stats.renewalsThisMonth)}
              icon={<CalendarClock size={15} />}
              deltaTone="muted"
              sub={
                stats.nextRenewalAt ? T.kpi.nextRenewal(fmtDateMed(stats.nextRenewalAt)) : undefined
              }
            />
            <StatCard
              label={T.kpi.expired}
              value={String(stats.expiredCount)}
              icon={<XCircle size={15} />}
              deltaTone={stats.expiredCount > 0 ? 'destructive' : 'muted'}
              sub={stats.expiredCount > 0 ? T.kpi.actionRequired : undefined}
            />
          </div>
        ) : (
          <SkeletonStatCards count={4} />
        )}

        {data && (
          <div className="grid min-w-0 gap-4 lg:grid-cols-[1fr_2fr]">
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-bold text-foreground">{T.planBreakdown.title}</h2>
              {data.planBreakdown.total === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  {T.planBreakdown.empty}
                </p>
              ) : (
                <DonutChart
                  items={data.planBreakdown.items.map((p) => ({
                    label: p.name,
                    value: p.count,
                    percentLabel: `${p.pct}%`,
                  }))}
                  centerValue={String(data.planBreakdown.total)}
                  centerLabel={T.planBreakdown.center}
                  ariaLabel={T.planBreakdown.title}
                  footer={
                    data.planBreakdown.expired > 0 ? (
                      <div className="mt-1 flex items-center gap-2 border-t border-border pt-2 text-[13px]">
                        <span
                          aria-hidden
                          className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/40"
                        />
                        <span className="text-muted-foreground">
                          {T.planBreakdown.expired(data.planBreakdown.expired)}
                        </span>
                      </div>
                    ) : undefined
                  }
                />
              )}
            </Card>
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-bold text-foreground">{T.mrrChart.title}</h2>
              <BarChart
                data={data.mrrSeries.map((m) => ({ label: m.label, value: m.cents }))}
                formatValue={(v) => fmtUsdRound(v)}
                height={140}
                ariaLabel={T.mrrChart.title}
              />
              <div className="mt-3 flex gap-6 border-t border-border pt-3">
                <div>
                  <div className="text-[11px] text-muted-foreground">{T.mrrChart.thisMonth}</div>
                  <div className="text-sm font-extrabold text-foreground">
                    {fmtUsdRound(data.mrrSeries[data.mrrSeries.length - 1]?.cents ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">{T.mrrChart.growth}</div>
                  <div className="text-sm font-extrabold text-success-foreground">
                    {stats && stats.mrrDeltaPct !== null
                      ? `${stats.mrrDeltaPct >= 0 ? '+' : ''}${stats.mrrDeltaPct}%`
                      : '—'}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {data || !loading ? (
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <SearchInput
              placeholder={T.filters.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:max-w-[280px]"
            />
            <FilterSelect value={plan} onValueChange={setPlan} className="min-w-36">
              <SelectItem value="">{T.filters.allPlans}</SelectItem>
              <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
              <SelectItem value="PRO">Établissement Pro</SelectItem>
              <SelectItem value="STARTER">Starter</SelectItem>
            </FilterSelect>
            <FilterSelect value={status} onValueChange={setStatus} className="min-w-36">
              <SelectItem value="">{T.filters.allStatuses}</SelectItem>
              {(['ACTIVE', 'TRIAL', 'EXPIRED', 'SUSPENDED', 'CANCELED'] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {ADMIN_SAAS.subscriptionStatus[s]}
                </SelectItem>
              ))}
            </FilterSelect>
          </div>
        ) : (
          <SkeletonFilters />
        )}

        <Card className="flex-1">
          {data && (
            <div className="border-b border-border px-4 py-3.5">
              <h2 className="text-sm font-bold text-foreground">{T.list.title}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {T.list.subtitle(data.total, data.stats.activeCount)}
              </p>
            </div>
          )}
          {error ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button className="w-auto" onClick={() => void load()}>
                {T.retry}
              </Button>
            </div>
          ) : loading || !data ? (
            <SkeletonTable rows={6} cols={6} />
          ) : data.items.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">{T.empty}</p>
          ) : (
            <>
              <div className="flex-1 overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className={TH_CLASS}>{T.columns.school}</th>
                      <th className={TH_CLASS}>{T.columns.plan}</th>
                      <th className={`${TH_CLASS} text-right`}>{T.columns.students}</th>
                      <th className={`${TH_CLASS} text-right`}>{T.columns.rate}</th>
                      <th className={`${TH_CLASS} text-right`}>{T.columns.amount}</th>
                      <th className={TH_CLASS}>{T.columns.renewal}</th>
                      <th className={TH_CLASS}>{T.columns.status}</th>
                      <th className={`${TH_CLASS} text-right`}>{T.columns.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.items.map((s) => (
                      <tr key={s.id} className="hover:bg-muted/50">
                        <td className={TD_CLASS}>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={s.school.name} size={32} />
                            <div className="min-w-0">
                              <div className="max-w-[220px] truncate font-semibold text-foreground">
                                {s.school.name}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {s.school.city}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className={TD_CLASS}>
                          <PlanBadge planKey={s.plan.key} name={s.plan.name} />
                          {s.coupon && (
                            <div className="text-[10px] font-semibold text-primary">
                              {s.coupon.code}
                            </div>
                          )}
                          {s.stripe && (
                            <a
                              href={`https://dashboard.stripe.com/subscriptions/${s.stripe.subscriptionId}`}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-[10px] font-semibold text-muted-foreground hover:text-primary hover:underline"
                              title={`Stripe · ${s.stripe.status ?? '—'}${s.stripe.interval ? ` · ${s.stripe.interval === 'YEAR' ? 'annuel' : 'mensuel'}` : ''}${s.stripe.cancelAtPeriodEnd ? ' · résiliation programmée' : ''}`}
                            >
                              Stripe{s.stripe.interval === 'YEAR' ? ' · annuel' : ''}
                              {s.stripe.cancelAtPeriodEnd ? ' · résilié' : ''}
                            </a>
                          )}
                        </td>
                        <td className={`${TD_CLASS} text-right font-semibold text-foreground`}>
                          {s.students}
                        </td>
                        <td className={`${TD_CLASS} text-right text-muted-foreground`}>
                          {fmtUsd(s.plan.priceCents)} {T.perStudent}
                        </td>
                        <td className={`${TD_CLASS} text-right font-semibold text-foreground`}>
                          {fmtUsd(s.monthlyCents)}
                        </td>
                        <td className={TD_CLASS}>
                          {s.status === 'EXPIRED' ? (
                            <div>
                              <div className="text-destructive-foreground">
                                {ADMIN_SAAS.subscriptionStatus.EXPIRED}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {T.sinceDays(Math.max(1, -daysUntil(s.renewsAt)))}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="text-foreground">{fmtDateMed(s.renewsAt)}</div>
                              {s.expiringSoon && (
                                <div className="text-[11px] font-semibold text-warning-foreground">
                                  {T.inDays(Math.max(0, daysUntil(s.renewsAt)))}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className={TD_CLASS}>
                          <SubscriptionStatusBadge
                            status={s.status}
                            expiringSoon={s.expiringSoon}
                          />
                        </td>
                        <td className={`${TD_CLASS} text-right`}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-auto w-auto"
                            onClick={() => setModal({ kind: 'manage', sub: s })}
                          >
                            {s.status === 'EXPIRED' ? T.relaunch : T.manage}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                onChange={setPage}
                itemsLabel={T.pagerLabel}
                shownCount={data.items.length}
              />
            </>
          )}
        </Card>

        {data && data.expiring.count > 0 && (
          <Card className="flex flex-col gap-3 border-warning-foreground/30 bg-warning p-4 sm:flex-row sm:items-center">
            <AlertTriangle size={18} className="shrink-0 text-warning-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-warning-foreground">
                {T.alert.title(data.expiring.count)}
              </div>
              <div className="text-xs text-warning-foreground/80">
                {T.alert.body(
                  data.expiring.names.join(', '),
                  data.expiring.count - data.expiring.names.length,
                )}
              </div>
            </div>
            <Button size="sm" className="w-auto" onClick={() => toast(T.stub)}>
              {T.alert.sendReminders}
            </Button>
          </Card>
        )}
      </div>

      {modal.kind === 'create' && data && (
        <CreateModal
          freeSchools={data.freeSchools}
          onClose={() => setModal({ kind: 'none' })}
          onDone={() => {
            setModal({ kind: 'none' });
            toast(T.createModal.created, 'success');
            void load();
          }}
        />
      )}
      {modal.kind === 'manage' && (
        <ManageModal
          sub={modal.sub}
          onClose={() => setModal({ kind: 'none' })}
          onDone={() => {
            setModal({ kind: 'none' });
            toast(T.manageModal.saved, 'success');
            void load();
          }}
        />
      )}
    </div>
  );
}

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function CreateModal({
  freeSchools,
  onClose,
  onDone,
}: {
  freeSchools: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const inOneYear = new Date();
  inOneYear.setFullYear(inOneYear.getFullYear() + 1);
  const [schoolId, setSchoolId] = useState('');
  const [planKey, setPlanKey] = useState('PRO');
  const [status, setStatus] = useState<'TRIAL' | 'ACTIVE'>('TRIAL');
  const [renewsAt, setRenewsAt] = useState(toDateInput(inOneYear));
  const [couponCode, setCouponCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/api/admin/billing/subscriptions', {
        method: 'POST',
        body: {
          schoolId,
          planKey,
          status,
          renewsAt,
          ...(couponCode.trim() ? { couponCode: couponCode.trim().toUpperCase() } : {}),
        },
      });
      onDone();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : T.loadError, 'error');
      setBusy(false);
    }
  }

  return (
    <Modal title={T.createModal.title} onClose={onClose}>
      {freeSchools.length === 0 ? (
        <p className="text-sm text-muted-foreground">{T.createModal.noFreeSchool}</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
          <Select label={T.createModal.school} value={schoolId} onValueChange={setSchoolId}>
            <FormSelectItem value="">{T.createModal.schoolPlaceholder}</FormSelectItem>
            {freeSchools.map((s) => (
              <FormSelectItem key={s.id} value={s.id}>
                {s.name}
              </FormSelectItem>
            ))}
          </Select>
          <Select label={T.createModal.plan} value={planKey} onValueChange={setPlanKey}>
            <FormSelectItem value="STARTER">Starter</FormSelectItem>
            <FormSelectItem value="PRO">Établissement Pro</FormSelectItem>
            <FormSelectItem value="ENTERPRISE">Enterprise</FormSelectItem>
          </Select>
          <Select
            label={T.createModal.status}
            value={status}
            onValueChange={(v) => setStatus(v as 'TRIAL' | 'ACTIVE')}
          >
            <FormSelectItem value="TRIAL">{T.createModal.trial}</FormSelectItem>
            <FormSelectItem value="ACTIVE">{T.createModal.activeNow}</FormSelectItem>
          </Select>
          <DateField
            label={T.createModal.renewsAt}
            name="renewsAt"
            required
            value={renewsAt}
            onChange={setRenewsAt}
          />
          <Field
            label={T.createModal.couponCode}
            name="couponCode"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
            autoComplete="off"
          />
          <div className="mt-1 flex gap-2.5">
            <Button type="button" variant="outline" onClick={onClose}>
              {T.createModal.cancel}
            </Button>
            <Button type="submit" loading={busy} disabled={!schoolId}>
              {busy ? T.createModal.creating : T.createModal.create}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ManageModal({
  sub,
  onClose,
  onDone,
}: {
  sub: SubRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [planKey, setPlanKey] = useState(sub.plan.key);
  const [status, setStatus] = useState<SubRow['status']>(sub.status);
  const [renewsAt, setRenewsAt] = useState(toDateInput(new Date(sub.renewsAt)));
  const [couponCode, setCouponCode] = useState(sub.coupon?.code ?? '');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const trimmed = couponCode.trim().toUpperCase();
    const originalCode = sub.coupon?.code ?? '';
    try {
      await api(`/api/admin/billing/subscriptions/${sub.id}`, {
        method: 'PATCH',
        body: {
          planKey,
          status,
          renewsAt,
          ...(trimmed !== originalCode ? { couponCode: trimmed === '' ? null : trimmed } : {}),
        },
      });
      onDone();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : T.loadError, 'error');
      setBusy(false);
    }
  }

  return (
    <Modal title={`${T.manageModal.title} — ${sub.school.name}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <Select label={T.manageModal.plan} value={planKey} onValueChange={setPlanKey}>
          <FormSelectItem value="STARTER">Starter</FormSelectItem>
          <FormSelectItem value="PRO">Établissement Pro</FormSelectItem>
          <FormSelectItem value="ENTERPRISE">Enterprise</FormSelectItem>
        </Select>
        <Select
          label={T.manageModal.status}
          value={status}
          onValueChange={(v) => setStatus(v as SubRow['status'])}
        >
          {(['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELED'] as const).map((s) => (
            <FormSelectItem key={s} value={s}>
              {ADMIN_SAAS.subscriptionStatus[s]}
            </FormSelectItem>
          ))}
        </Select>
        <DateField
          label={T.manageModal.renewsAt}
          name="renewsAt"
          required
          value={renewsAt}
          onChange={setRenewsAt}
        />
        <div>
          <Field
            label={T.manageModal.couponCode}
            name="couponCode"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
            autoComplete="off"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">{T.manageModal.couponHint}</p>
        </div>
        <div className="mt-1 flex gap-2.5">
          <Button type="button" variant="outline" onClick={onClose}>
            {T.manageModal.cancel}
          </Button>
          <Button type="submit" loading={busy}>
            {busy ? T.manageModal.saving : T.manageModal.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
