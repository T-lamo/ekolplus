'use client';

// /admin — SaaS Admin Dashboard (Banani VZVQxm_1YTAi).
// Plan: .planning/banani/saas-admin-dashboard.md. One GET hydrates all
// blocks; every figure is real data — a fresh install shows zeros/empties.

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, Plus, School, Users, Activity, CreditCard, Wallet } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import type { AdminOverviewResponse } from '@/lib/admin-types';
import { ADMIN_DASHBOARD as T } from '@/lib/constants';
import {
  couponDiscountLabel,
  fmtAgoCompact,
  fmtDateMed,
  fmtUsd,
  fmtUsdRound,
} from '@/lib/admin-format';
import { exportToCsv } from '@/lib/csv-export';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { SearchInput } from '@/components/ui/SearchInput';
import { Skeleton, SkeletonStatCards, SkeletonTable } from '@/components/ui/Skeleton';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatCard } from '@/components/admin/StatCard';
import { BarChart } from '@/components/admin/charts/BarChart';
import {
  CouponStatusBadge,
  PlanBadge,
  SubscriptionStatusBadge,
  TransactionStatusBadge,
  UserStatusBadge,
} from '@/components/admin/badges';
import { ADMIN_SAAS } from '@/lib/constants';

function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function EmptyRow({ children }: { children: string }) {
  return <p className="px-4 py-8 text-center text-xs text-muted-foreground">{children}</p>;
}

const TH_CLASS =
  'px-3 py-2 text-left text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase';
const TD_CLASS = 'px-3 py-2.5 text-[13px] whitespace-nowrap';

export default function AdminDashboardPage() {
  const router = useRouter();
  const { data, loading, error, refresh } = useApi<AdminOverviewResponse>(
    '/api/admin/stats/overview',
  );
  const [schoolSearch, setSchoolSearch] = useState('');

  function onSchoolSearch(e: FormEvent) {
    e.preventDefault();
    router.push(
      schoolSearch ? `/admin/schools?q=${encodeURIComponent(schoolSearch)}` : '/admin/schools',
    );
  }

  function onExport() {
    if (!data) return;
    exportToCsv(
      'rapport-admin.csv',
      ['Indicateur', 'Valeur'],
      [
        [T.kpi.totalSchools, String(data.kpis.totalSchools)],
        [T.kpi.totalUsers, String(data.kpis.totalUsers)],
        [T.kpi.activeUsers, String(data.kpis.activeUsers)],
        [T.kpi.activeSubscriptions, String(data.kpis.activeSubscriptions)],
        [T.kpi.monthRevenue, fmtUsd(data.kpis.monthRevenueCents)],
        ...data.revenue.series.map((m) => [`Revenus ${m.label}`, fmtUsd(m.cents)]),
      ],
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <p className="text-sm text-muted-foreground">{T.loadError}</p>
        <Button className="w-auto" onClick={() => void refresh()}>
          {T.retry}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px]">
      <AdminPageHeader
        title={T.title}
        subtitle={T.subtitle}
        actions={
          <>
            <Button variant="outline" className="sm:w-auto" onClick={onExport} disabled={!data}>
              <Download size={14} />
              {T.exportReport}
            </Button>
            <Link href="/admin/schools/new" className="sm:w-auto">
              <Button className="sm:w-auto">
                <Plus size={14} />
                {T.createSchool}
              </Button>
            </Link>
          </>
        }
      />

      {loading || !data ? (
        <div className="flex flex-col gap-4">
          <SkeletonStatCards count={5} />
          <Skeleton className="h-64 w-full" />
          <SkeletonTable rows={5} cols={6} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard
              label={T.kpi.totalSchools}
              value={String(data.kpis.totalSchools)}
              icon={<School size={15} />}
              delta={`+${data.kpis.schoolsDeltaMonth}`}
              sub={T.kpi.thisMonth}
            />
            <StatCard
              label={T.kpi.totalUsers}
              value={data.kpis.totalUsers.toLocaleString('fr-FR')}
              icon={<Users size={15} />}
              delta={`+${data.kpis.usersDeltaMonth}`}
              sub={T.kpi.thisMonth}
            />
            <StatCard
              label={T.kpi.activeUsers}
              value={data.kpis.activeUsers.toLocaleString('fr-FR')}
              icon={<Activity size={15} />}
              deltaTone="muted"
              sub={`${data.kpis.activeUsersPct}% ${T.kpi.ofTotal}`}
            />
            <StatCard
              label={T.kpi.activeSubscriptions}
              value={String(data.kpis.activeSubscriptions)}
              icon={<CreditCard size={15} />}
              delta={data.kpis.expiringSoon > 0 ? String(data.kpis.expiringSoon) : undefined}
              deltaTone={data.kpis.expiringSoon > 0 ? 'destructive' : 'muted'}
              sub={data.kpis.expiringSoon > 0 ? T.kpi.expiringSoon : undefined}
            />
            <StatCard
              label={T.kpi.monthRevenue}
              value={fmtUsdRound(data.kpis.monthRevenueCents)}
              icon={<Wallet size={15} />}
              delta={
                data.kpis.revenueDeltaPct !== null
                  ? `${data.kpis.revenueDeltaPct >= 0 ? '+' : ''}${data.kpis.revenueDeltaPct}%`
                  : undefined
              }
              deltaTone={
                data.kpis.revenueDeltaPct !== null && data.kpis.revenueDeltaPct < 0
                  ? 'destructive'
                  : 'success'
              }
              sub={data.kpis.revenueDeltaPct !== null ? T.kpi.vsLastMonth : undefined}
            />
          </div>

          {/* Revenue chart + recent users */}
          <div className="grid min-w-0 gap-4 lg:grid-cols-[2fr_1fr]">
            <SectionCard title={T.revenue.title} subtitle={T.revenue.subtitle}>
              <div className="px-4 py-4">
                <BarChart
                  data={data.revenue.series.map((m) => ({ label: m.label, value: m.cents }))}
                  formatValue={(v) => fmtUsdRound(v)}
                  ariaLabel={T.revenue.title}
                />
                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3">
                  <div>
                    <div className="text-[11px] text-muted-foreground">{T.revenue.total}</div>
                    <div className="text-sm font-extrabold text-foreground">
                      {fmtUsdRound(data.revenue.totalCents)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">{T.revenue.avg}</div>
                    <div className="text-sm font-extrabold text-foreground">
                      {fmtUsdRound(data.revenue.avgCents)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">{T.revenue.growth}</div>
                    <div className="text-sm font-extrabold text-success-foreground">
                      {data.revenue.growthPct !== null
                        ? `${data.revenue.growthPct >= 0 ? '+' : ''}${data.revenue.growthPct}%`
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title={T.recentUsers.title}
              subtitle={T.recentUsers.subtitle}
              action={
                <Link href="/admin/users" className="text-xs font-semibold text-primary">
                  {T.seeAll}
                </Link>
              }
            >
              {data.recentUsers.length === 0 ? (
                <EmptyRow>{T.recentUsers.empty}</EmptyRow>
              ) : (
                <div className="divide-y divide-border">
                  {data.recentUsers.map((u) => (
                    <div key={u.id} className="flex items-center gap-2.5 px-4 py-2.5">
                      <Avatar name={u.name} size={30} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-foreground">
                          {u.name}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {u.schoolName ?? '—'}
                          {u.orgRole ? ` · ${ADMIN_SAAS.orgRole[u.orgRole]}` : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <UserStatusBadge status={u.status} />
                        <span className="text-[10px] text-muted-foreground">
                          {fmtAgoCompact(u.createdAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Client schools */}
          <SectionCard
            title={T.schools.title}
            subtitle={T.schools.subtitle(data.kpis.totalSchools)}
            action={
              <div className="hidden items-center gap-2 sm:flex">
                <form onSubmit={onSchoolSearch}>
                  <SearchInput
                    placeholder={T.schools.searchPlaceholder}
                    value={schoolSearch}
                    onChange={(e) => setSchoolSearch(e.target.value)}
                    className="h-9 w-44 text-xs"
                  />
                </form>
                <Link href="/admin/schools/new">
                  <Button size="sm" className="w-auto">
                    <Plus size={13} />
                    {T.schools.newSchool}
                  </Button>
                </Link>
              </div>
            }
          >
            {data.schools.length === 0 ? (
              <EmptyRow>{T.schools.empty}</EmptyRow>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className={TH_CLASS}>{T.schools.columns.school}</th>
                      <th className={TH_CLASS}>{T.schools.columns.location}</th>
                      <th className={TH_CLASS}>{T.schools.columns.plan}</th>
                      <th className={`${TH_CLASS} text-right`}>{T.schools.columns.students}</th>
                      <th className={`${TH_CLASS} text-right`}>{T.schools.columns.users}</th>
                      <th className={`${TH_CLASS} text-right`}>{T.schools.columns.billing}</th>
                      <th className={TH_CLASS}>{T.schools.columns.status}</th>
                      <th className={TH_CLASS}>{T.schools.columns.renewal}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.schools.map((s) => (
                      <tr key={s.id} className="hover:bg-muted/50">
                        <td className={TD_CLASS}>
                          <div className="font-semibold text-foreground">{s.name}</div>
                          {s.officialCode && (
                            <div className="text-[11px] text-muted-foreground">
                              {s.officialCode}
                            </div>
                          )}
                        </td>
                        <td className={`${TD_CLASS} text-muted-foreground`}>
                          {s.country} · {s.city}
                        </td>
                        <td className={TD_CLASS}>
                          {s.plan ? <PlanBadge planKey={s.plan.key} name={s.plan.name} /> : '—'}
                        </td>
                        <td className={`${TD_CLASS} text-right font-semibold text-foreground`}>
                          {s.students}
                        </td>
                        <td className={`${TD_CLASS} text-right text-muted-foreground`}>
                          {s.users}
                        </td>
                        <td className={`${TD_CLASS} text-right font-semibold text-foreground`}>
                          {s.monthlyCents !== null ? fmtUsd(s.monthlyCents) : '—'}
                        </td>
                        <td className={TD_CLASS}>
                          <SubscriptionStatusBadge
                            status={s.status}
                            expiringSoon={s.expiringSoon}
                          />
                        </td>
                        <td className={`${TD_CLASS} text-muted-foreground`}>
                          {s.status === 'EXPIRED'
                            ? ADMIN_SAAS.subscriptionStatus.EXPIRED
                            : s.renewsAt
                              ? fmtDateMed(s.renewsAt)
                              : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* Transactions + coupons */}
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <SectionCard
              title={T.transactions.title}
              subtitle={T.transactions.subtitle}
              action={
                <Link
                  href="/admin/billing/transactions"
                  className="text-xs font-semibold text-primary"
                >
                  {T.seeAll}
                </Link>
              }
            >
              {data.recentTransactions.length === 0 ? (
                <EmptyRow>{T.transactions.empty}</EmptyRow>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={TH_CLASS}>{T.transactions.columns.school}</th>
                        <th className={`${TH_CLASS} text-right`}>
                          {T.transactions.columns.amount}
                        </th>
                        <th className={TH_CLASS}>{T.transactions.columns.date}</th>
                        <th className={TH_CLASS}>{T.transactions.columns.status}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.recentTransactions.map((t) => (
                        <tr key={t.id} className="hover:bg-muted/50">
                          <td className={TD_CLASS}>
                            <div className="font-semibold text-foreground">{t.schoolName}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {t.planName ?? '—'} · {t.students} élèves
                            </div>
                          </td>
                          <td
                            className={`${TD_CLASS} text-right font-semibold ${t.amountCents < 0 ? 'text-destructive-foreground' : 'text-foreground'}`}
                          >
                            {fmtUsd(t.amountCents)}
                          </td>
                          <td className={`${TD_CLASS} text-muted-foreground`}>
                            {fmtDateMed(t.paidAt)}
                          </td>
                          <td className={TD_CLASS}>
                            <TransactionStatusBadge status={t.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title={T.coupons.title}
              subtitle={T.coupons.subtitle}
              action={
                <Link href="/admin/billing/coupons" className="text-xs font-semibold text-primary">
                  {T.coupons.newCoupon}
                </Link>
              }
            >
              {data.coupons.length === 0 ? (
                <EmptyRow>{T.coupons.empty}</EmptyRow>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={TH_CLASS}>{T.coupons.columns.code}</th>
                        <th className={TH_CLASS}>{T.coupons.columns.discount}</th>
                        <th className={TH_CLASS}>{T.coupons.columns.uses}</th>
                        <th className={TH_CLASS}>{T.coupons.columns.expiry}</th>
                        <th className={TH_CLASS}>{T.coupons.columns.status}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.coupons.map((c) => (
                        <tr key={c.id} className="hover:bg-muted/50">
                          <td className={`${TD_CLASS} font-mono text-xs font-bold text-foreground`}>
                            {c.code}
                          </td>
                          <td className={`${TD_CLASS} font-semibold text-foreground`}>
                            {couponDiscountLabel(c.type, c.value)}
                          </td>
                          <td className={`${TD_CLASS} text-muted-foreground`}>
                            {c.usedCount} / {c.maxUses ?? '∞'}
                          </td>
                          <td className={`${TD_CLASS} text-muted-foreground`}>
                            {c.expiresAt ? fmtDateMed(c.expiresAt) : T.coupons.noLimit}
                          </td>
                          <td className={TD_CLASS}>
                            <CouponStatusBadge status={c.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}
