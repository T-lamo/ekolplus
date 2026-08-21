'use client';

// /admin — SaaS Admin Dashboard (Banani VZVQxm_1YTAi).
// Plan: .planning/banani/saas-admin-dashboard.md. One GET hydrates all
// blocks; every figure is real data — a fresh install shows zeros/empties.

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, Plus, School, Users, Activity, CreditCard, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useApi } from '@/lib/useApi';
import type { AdminOverviewResponse } from '@/lib/admin-types';
import { LOCALE_BCP47 } from '@/lib/locales';
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
import { CreateSchoolModal } from '@/components/admin/CreateSchoolModal';
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
  'px-3 py-2 text-left text-2xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase';
const TD_CLASS = 'px-3 py-2.5 text-caption whitespace-nowrap';

export default function AdminDashboardPage() {
  const router = useRouter();
  const tAdmin = useTranslations('AdminDashboard');
  const locale = useLocale();
  const { data, loading, error, refresh } = useApi<AdminOverviewResponse>(
    '/api/admin/stats/overview',
  );
  const [schoolSearch, setSchoolSearch] = useState('');
  const [showCreateSchool, setShowCreateSchool] = useState(false);

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
      [tAdmin('csvIndicator'), tAdmin('csvValue')],
      [
        [tAdmin('kpi.totalSchools'), String(data.kpis.totalSchools)],
        [tAdmin('kpi.totalUsers'), String(data.kpis.totalUsers)],
        [tAdmin('kpi.activeUsers'), String(data.kpis.activeUsers)],
        [tAdmin('kpi.activeSubscriptions'), String(data.kpis.activeSubscriptions)],
        [tAdmin('kpi.monthRevenue'), fmtUsd(data.kpis.monthRevenueCents)],
        ...data.revenue.series.map((m) => [
          `${tAdmin('revenue.csvLabelPrefix')} ${m.label}`,
          fmtUsd(m.cents),
        ]),
      ],
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <p className="text-sm text-muted-foreground">{tAdmin('loadError')}</p>
        <Button className="w-auto" onClick={() => void refresh()}>
          {tAdmin('retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <AdminPageHeader
        title={tAdmin('title')}
        subtitle={tAdmin('subtitle')}
        actions={
          <>
            <Button variant="outline" className="sm:w-auto" onClick={onExport} disabled={!data}>
              <FileSpreadsheet size={14} />
              {tAdmin('exportReport')}
            </Button>
            <Button className="sm:w-auto" onClick={() => setShowCreateSchool(true)}>
              <Plus size={14} />
              {tAdmin('createSchool')}
            </Button>
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
              label={tAdmin('kpi.totalSchools')}
              value={String(data.kpis.totalSchools)}
              icon={<School size={15} />}
              delta={`+${data.kpis.schoolsDeltaMonth}`}
              sub={tAdmin('kpi.thisMonth')}
            />
            <StatCard
              label={tAdmin('kpi.totalUsers')}
              value={data.kpis.totalUsers.toLocaleString(LOCALE_BCP47[locale])}
              icon={<Users size={15} />}
              delta={`+${data.kpis.usersDeltaMonth}`}
              sub={tAdmin('kpi.thisMonth')}
            />
            <StatCard
              label={tAdmin('kpi.activeUsers')}
              value={data.kpis.activeUsers.toLocaleString(LOCALE_BCP47[locale])}
              icon={<Activity size={15} />}
              deltaTone="muted"
              sub={`${data.kpis.activeUsersPct}% ${tAdmin('kpi.ofTotal')}`}
            />
            <StatCard
              label={tAdmin('kpi.activeSubscriptions')}
              value={String(data.kpis.activeSubscriptions)}
              icon={<CreditCard size={15} />}
              delta={data.kpis.expiringSoon > 0 ? String(data.kpis.expiringSoon) : undefined}
              deltaTone={data.kpis.expiringSoon > 0 ? 'destructive' : 'muted'}
              sub={data.kpis.expiringSoon > 0 ? tAdmin('kpi.expiringSoon') : undefined}
            />
            <StatCard
              label={tAdmin('kpi.monthRevenue')}
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
              sub={data.kpis.revenueDeltaPct !== null ? tAdmin('kpi.vsLastMonth') : undefined}
            />
          </div>

          {/* Revenue chart + recent users */}
          <div className="grid min-w-0 gap-4 lg:grid-cols-[2fr_1fr]">
            <SectionCard title={tAdmin('revenue.title')} subtitle={tAdmin('revenue.subtitle')}>
              <div className="px-4 py-4">
                <BarChart
                  data={data.revenue.series.map((m) => ({ label: m.label, value: m.cents }))}
                  formatValue={(v) => fmtUsdRound(v)}
                  ariaLabel={tAdmin('revenue.title')}
                />
                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3">
                  <div>
                    <div className="text-2xs text-muted-foreground">{tAdmin('revenue.total')}</div>
                    <div className="text-sm font-extrabold text-foreground">
                      {fmtUsdRound(data.revenue.totalCents)}
                    </div>
                  </div>
                  <div>
                    <div className="text-2xs text-muted-foreground">{tAdmin('revenue.avg')}</div>
                    <div className="text-sm font-extrabold text-foreground">
                      {fmtUsdRound(data.revenue.avgCents)}
                    </div>
                  </div>
                  <div>
                    <div className="text-2xs text-muted-foreground">{tAdmin('revenue.growth')}</div>
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
              title={tAdmin('recentUsers.title')}
              subtitle={tAdmin('recentUsers.subtitle')}
              action={
                <Link href="/admin/users" className="text-xs font-semibold text-primary">
                  {tAdmin('seeAll')}
                </Link>
              }
            >
              {data.recentUsers.length === 0 ? (
                <EmptyRow>{tAdmin('recentUsers.empty')}</EmptyRow>
              ) : (
                <div className="divide-y divide-border">
                  {data.recentUsers.map((u) => (
                    <div key={u.id} className="flex items-center gap-2.5 px-4 py-2.5">
                      <Avatar name={u.name} size={30} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-caption font-semibold text-foreground">
                          {u.name}
                        </div>
                        <div className="truncate text-2xs text-muted-foreground">
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
            title={tAdmin('schools.title')}
            subtitle={tAdmin(
              data.kpis.totalSchools > 1 ? 'schools.subtitle.other' : 'schools.subtitle.one',
              { n: data.kpis.totalSchools },
            )}
            action={
              <div className="hidden items-center gap-2 sm:flex">
                <form onSubmit={onSchoolSearch}>
                  <SearchInput
                    placeholder={tAdmin('schools.searchPlaceholder')}
                    value={schoolSearch}
                    onChange={(e) => setSchoolSearch(e.target.value)}
                    className="h-9 w-44 text-xs"
                  />
                </form>
                <Button size="sm" className="w-auto" onClick={() => setShowCreateSchool(true)}>
                  <Plus size={13} />
                  {tAdmin('schools.newSchool')}
                </Button>
              </div>
            }
          >
            {data.schools.length === 0 ? (
              <EmptyRow>{tAdmin('schools.empty')}</EmptyRow>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className={TH_CLASS}>{tAdmin('schools.columns.school')}</th>
                      <th className={TH_CLASS}>{tAdmin('schools.columns.location')}</th>
                      <th className={TH_CLASS}>{tAdmin('schools.columns.plan')}</th>
                      <th className={`${TH_CLASS} text-right`}>
                        {tAdmin('schools.columns.students')}
                      </th>
                      <th className={`${TH_CLASS} text-right`}>
                        {tAdmin('schools.columns.users')}
                      </th>
                      <th className={`${TH_CLASS} text-right`}>
                        {tAdmin('schools.columns.billing')}
                      </th>
                      <th className={TH_CLASS}>{tAdmin('schools.columns.status')}</th>
                      <th className={TH_CLASS}>{tAdmin('schools.columns.renewal')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.schools.map((s) => (
                      <tr key={s.id} className="hover:bg-muted/50">
                        <td className={TD_CLASS}>
                          <div className="font-semibold text-foreground">{s.name}</div>
                          {s.officialCode && (
                            <div className="text-2xs text-muted-foreground">{s.officialCode}</div>
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
              title={tAdmin('transactions.title')}
              subtitle={tAdmin('transactions.subtitle')}
              action={
                <Link
                  href="/admin/billing/transactions"
                  className="text-xs font-semibold text-primary"
                >
                  {tAdmin('seeAll')}
                </Link>
              }
            >
              {data.recentTransactions.length === 0 ? (
                <EmptyRow>{tAdmin('transactions.empty')}</EmptyRow>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={TH_CLASS}>{tAdmin('transactions.columns.school')}</th>
                        <th className={`${TH_CLASS} text-right`}>
                          {tAdmin('transactions.columns.amount')}
                        </th>
                        <th className={TH_CLASS}>{tAdmin('transactions.columns.date')}</th>
                        <th className={TH_CLASS}>{tAdmin('transactions.columns.status')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.recentTransactions.map((t) => (
                        <tr key={t.id} className="hover:bg-muted/50">
                          <td className={TD_CLASS}>
                            <div className="font-semibold text-foreground">{t.schoolName}</div>
                            <div className="text-2xs text-muted-foreground">
                              {t.planName ?? '—'} · {t.students} {tAdmin('studentsSuffix')}
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
              title={tAdmin('coupons.title')}
              subtitle={tAdmin('coupons.subtitle')}
              action={
                <Link href="/admin/billing/coupons" className="text-xs font-semibold text-primary">
                  {tAdmin('coupons.newCoupon')}
                </Link>
              }
            >
              {data.coupons.length === 0 ? (
                <EmptyRow>{tAdmin('coupons.empty')}</EmptyRow>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={TH_CLASS}>{tAdmin('coupons.columns.code')}</th>
                        <th className={TH_CLASS}>{tAdmin('coupons.columns.discount')}</th>
                        <th className={TH_CLASS}>{tAdmin('coupons.columns.uses')}</th>
                        <th className={TH_CLASS}>{tAdmin('coupons.columns.expiry')}</th>
                        <th className={TH_CLASS}>{tAdmin('coupons.columns.status')}</th>
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
                            {c.expiresAt ? fmtDateMed(c.expiresAt) : tAdmin('coupons.noLimit')}
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

      {showCreateSchool && (
        <CreateSchoolModal
          onClose={() => setShowCreateSchool(false)}
          onCreated={() => {
            setShowCreateSchool(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
