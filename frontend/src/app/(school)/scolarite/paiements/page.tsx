'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
  CalendarClock,
  CircleAlert,
  Download,
  Eye,
  MessageCircle,
  Printer,
  Settings2,
  Users,
  Wallet,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import {
  Skeleton,
  SkeletonFilters,
  SkeletonStatCards,
  SkeletonTable,
} from '@/components/ui/Skeleton';
import { exportToCsv } from '@/lib/csv-export';
import { LOCALE_BCP47 } from '@/lib/locales';
import { fmtMoney, fmtDate, fmtFraction } from '@/lib/fees-format';
import { openReceiptAndPrint } from '@/lib/fees-receipt';
import { FeesTabs } from '@/components/school/fees/FeesTabs';
import { FeeKpiRow } from '@/components/school/fees/FeeKpiRow';
import { StudentStatusBadge, type StudentFeeStatus } from '@/components/school/fees/badges';
import { PaymentRegistrationModal } from '@/components/school/fees/PaymentRegistrationModal';
// Code-split: only mounted when a row's "historique" action is clicked —
// see the matching StudentFormModal split in eleves/page.tsx for why.
const FeeHistoryModal = dynamic(
  () => import('@/components/school/fees/FeeHistoryModal').then((m) => m.FeeHistoryModal),
  { ssr: false },
);
import { Pager } from '@/components/school/fees/Pager';
import { LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';

const STUDENT_STATUS_KEYS: StudentFeeStatus[] = ['UP_TO_DATE', 'PARTIAL', 'OVERDUE', 'UNPAID'];

interface StudentRow {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  classId: string;
  className: string;
  totalDue: number;
  totalPaid: number;
  remaining: number;
  status: StudentFeeStatus;
  tranchesPaid: number;
  tranchesTotal: number;
}

interface OverviewResponse {
  students: StudentRow[];
  total: number;
  page: number;
  pageSize: number;
  classes: { id: string; name: string }[];
  kpis: {
    totalCollected: number;
    totalExpected: number;
    upToDateCount: number;
    totalStudents: number;
    overdueCount: number;
    overdueAmount: number;
    nextTranche: { label: string; dueDate: string; expectedAmount: number } | null;
  };
  overdueAlert: {
    count: number;
    trancheLabel: string;
    dueDate: string;
    totalUnpaid: number;
  } | null;
}

export default function FeeManagementPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('Fees.overview');
  const tStatus = useTranslations('Fees.studentStatus');
  const tWhatsapp = useTranslations('Fees.whatsapp');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | StudentFeeStatus>('');
  const [page, setPage] = useState(1);
  const [registeringFor, setRegisteringFor] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string>('HTG');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (classFilter) params.set('classId', classFilter);
    if (statusFilter) params.set('status', statusFilter);
    params.set('page', String(page));
    api<OverviewResponse>(`/api/school/fees/overview?${params.toString()}`)
      .then(setData)
      .catch(() => setError(t('loadError')));
  }, [search, classFilter, statusFilter, page, t]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  useEffect(() => {
    if (!user) return;
    api<{ settings: { currency: string } }>('/api/school/fees/automation-settings')
      .then((res) => setCurrency(res.settings.currency))
      .catch(() => {});
  }, [user]);

  function updateSearch(value: string) {
    setPage(1);
    setSearch(value);
  }
  function updateClassFilter(value: string) {
    setPage(1);
    setClassFilter(value);
  }
  function updateStatusFilter(value: '' | StudentFeeStatus) {
    setPage(1);
    setStatusFilter(value);
  }

  async function printLastReceipt(row: StudentRow) {
    try {
      const history = await api<{
        student: { firstName: string; lastName: string; studentNumber: string };
        tranches: { id: string; label: string }[];
        payments: {
          amount: number;
          penaltyAmount: number;
          method: 'ESPECES' | 'MONCASH' | 'NATCASH' | 'CHEQUE' | 'VIREMENT';
          reference: string | null;
          paidAt: string;
          feeTrancheId: string;
        }[];
      }>(`/api/school/fees/students/${row.studentId}/history`);
      const last = history.payments[0];
      if (!last) {
        toast(t('printReceiptNoPayment'), 'info');
        return;
      }
      const tranche = history.tranches.find((tr) => tr.id === last.feeTrancheId);
      openReceiptAndPrint({
        studentName: `${history.student.firstName} ${history.student.lastName}`,
        studentNumber: history.student.studentNumber,
        trancheLabel: tranche?.label ?? '—',
        amount: last.amount,
        penaltyAmount: last.penaltyAmount,
        method: last.method,
        reference: last.reference ?? undefined,
        paidAt: last.paidAt,
        currency,
      });
    } catch {
      toast(t('printReceiptLoadError'), 'error');
    }
  }

  async function sendWhatsappReminder(row: StudentRow) {
    try {
      await api(`/api/school/fees/students/${row.studentId}/send-whatsapp`, { method: 'POST' });
      toast(tWhatsapp('sentSuccess'), 'success');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'NO_GUARDIAN_PHONE') {
          toast(tWhatsapp('errorNoGuardianPhone'), 'error');
          return;
        }
        if (err.code === 'NO_BALANCE_DUE') {
          toast(tWhatsapp('errorNoBalance'), 'error');
          return;
        }
        if (err.code === 'NOT_CONFIGURED') {
          toast(tWhatsapp('errorNotConfigured'), 'error');
          return;
        }
      }
      toast(tWhatsapp('errorSendFailed'), 'error');
    }
  }

  function menuItemsFor(row: StudentRow) {
    return [
      {
        label: t('rowActions.registerPayment'),
        icon: <Wallet size={14} />,
        onClick: () => setRegisteringFor(row.studentId),
      },
      {
        label: t('rowActions.sendWhatsapp'),
        icon: <MessageCircle size={14} />,
        onClick: () => void sendWhatsappReminder(row),
      },
      {
        label: t('rowActions.viewHistory'),
        icon: <Eye size={14} />,
        onClick: () => setHistoryFor(row.studentId),
        divider: true,
      },
      {
        label: t('rowActions.printReceipt'),
        icon: <Printer size={14} />,
        onClick: () => printLastReceipt(row),
      },
    ];
  }

  function onExport() {
    if (!data) return;
    exportToCsv(
      'frais-scolarite.csv',
      [
        t('columns.student'),
        t('columns.class'),
        t('columns.totalDue'),
        t('columns.paid'),
        t('columns.remaining'),
        t('columns.status'),
        t('columns.tranches'),
      ],
      data.students.map((s) => [
        `${s.firstName} ${s.lastName}`,
        s.className,
        s.totalDue,
        s.totalPaid,
        s.remaining,
        tStatus(s.status),
        fmtFraction(s.tranchesPaid, s.tranchesTotal),
      ]),
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  return (
    <div className={`${LIST_PAGE} gap-5`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => router.push('/scolarite/configuration')}
          >
            <Settings2 size={14} />
            {t('configureFees')}
          </Button>
          <Button variant="outline" className="w-fit" onClick={onExport} disabled={!data}>
            <Download size={14} />
            {t('export')}
          </Button>
        </div>
      </div>

      <FeesTabs active="paiements" />

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {!data && !error && (
        <div className="flex flex-col gap-3.5">
          <SkeletonStatCards />
          <SkeletonFilters />
          <Card className="overflow-hidden">
            <SkeletonTable rows={8} cols={6} />
          </Card>
        </div>
      )}

      {data && (
        <>
          {data.overdueAlert && (
            <Card className="flex-row items-center justify-between gap-3 border-destructive bg-destructive p-4">
              <div>
                <p className="text-sm font-bold text-destructive-foreground">
                  {t(data.overdueAlert.count > 1 ? 'alertBanner.other' : 'alertBanner.one', {
                    n: data.overdueAlert.count,
                    tranche: data.overdueAlert.trancheLabel,
                    dueDate: fmtDate(data.overdueAlert.dueDate, bcp47),
                  })}
                </p>
                <p className="mt-0.5 text-xs text-destructive-foreground">
                  {t('alertBannerSub', {
                    amount: fmtMoney(data.overdueAlert.totalUnpaid, currency),
                  })}
                </p>
              </div>
            </Card>
          )}

          <FeeKpiRow
            items={[
              {
                icon: <Wallet size={14} />,
                label: t('kpiTotalCollected'),
                value: fmtMoney(data.kpis.totalCollected, currency),
                progressPercent:
                  data.kpis.totalExpected > 0
                    ? (data.kpis.totalCollected / data.kpis.totalExpected) * 100
                    : 0,
              },
              {
                icon: <Users size={14} />,
                label: t('kpiUpToDate'),
                value: `${data.kpis.upToDateCount}/${data.kpis.totalStudents}`,
                progressPercent:
                  data.kpis.totalStudents > 0
                    ? (data.kpis.upToDateCount / data.kpis.totalStudents) * 100
                    : 0,
              },
              {
                icon: <CircleAlert size={14} />,
                label: t('kpiOverdue'),
                value: String(data.kpis.overdueCount),
                sub: fmtMoney(data.kpis.overdueAmount, currency),
              },
              {
                icon: <CalendarClock size={14} />,
                label: t('kpiNextDueDate'),
                value: data.kpis.nextTranche ? fmtDate(data.kpis.nextTranche.dueDate, bcp47) : '—',
                sub: data.kpis.nextTranche?.label,
              },
            ]}
          />

          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="max-w-[300px]"
            />
            <FilterSelect value={classFilter} onValueChange={updateClassFilter}>
              <SelectItem value="">{t('classFilterAll')}</SelectItem>
              {data.classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              value={statusFilter}
              onValueChange={(v) => updateStatusFilter(v as '' | StudentFeeStatus)}
            >
              <SelectItem value="">{t('statusFilterAll')}</SelectItem>
              {STUDENT_STATUS_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {tStatus(key)}
                </SelectItem>
              ))}
            </FilterSelect>
            <span className="text-sm text-muted-foreground">
              {t(data.total > 1 ? 'resultCount.other' : 'resultCount.one', { n: data.total })}
            </span>
          </div>

          {data.students.length === 0 ? (
            <Card>
              <p className="p-5 text-sm text-muted-foreground">{t('noResults')}</p>
            </Card>
          ) : (
            <Card>
              {/* md+: table. Below that a table needs constant horizontal
                  scrolling to read a single student's balance — cards show
                  the numbers that matter (reste dû, statut) without it,
                  trading the secondary columns (dû/payé/tranches) for a tap
                  into the row's own menu (Historique shows the full detail). */}
              <div className={cn('hidden md:block', TABLE_SCROLL)}>
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead className={STICKY_THEAD}>
                    <tr className="border-b border-border">
                      <Th>{t('columns.student')}</Th>
                      <Th>{t('columns.class')}</Th>
                      <Th>{t('columns.totalDue')}</Th>
                      <Th>{t('columns.paid')}</Th>
                      <Th>{t('columns.remaining')}</Th>
                      <Th>{t('columns.status')}</Th>
                      <Th>{t('columns.tranches')}</Th>
                      <Th className="w-[70px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.map((s) => (
                      <tr key={s.studentId} className="border-b border-border last:border-none">
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={`${s.firstName} ${s.lastName}`} size={32} />
                            <div>
                              <div className="font-semibold text-foreground">
                                {s.firstName} {s.lastName}
                              </div>
                              <div className="text-2xs text-muted-foreground">
                                #{s.studentNumber}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 text-muted-foreground">{s.className}</td>
                        <td className="px-3.5 py-2.5 text-muted-foreground">
                          {fmtMoney(s.totalDue, currency)}
                        </td>
                        <td className="px-3.5 py-2.5 text-muted-foreground">
                          {fmtMoney(s.totalPaid, currency)}
                        </td>
                        <td className="px-3.5 py-2.5 font-semibold text-foreground">
                          {fmtMoney(s.remaining, currency)}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <StudentStatusBadge status={s.status} />
                        </td>
                        <td className="px-3.5 py-2.5 text-muted-foreground">
                          {fmtFraction(s.tranchesPaid, s.tranchesTotal)}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <ActionMenu items={menuItemsFor(s)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* < md: cards */}
              <div className="flex flex-col gap-2.5 p-3.5 md:hidden">
                {data.students.map((s) => (
                  <div key={s.studentId} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={`${s.firstName} ${s.lastName}`} size={32} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-foreground">
                            {s.firstName} {s.lastName}
                          </div>
                          <div className="truncate text-2xs text-muted-foreground">
                            #{s.studentNumber} · {s.className}
                          </div>
                        </div>
                      </div>
                      <div className="-mt-1 -mr-1 shrink-0">
                        <ActionMenu items={menuItemsFor(s)} />
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2.5">
                      <StudentStatusBadge status={s.status} />
                      <span className="text-caption font-bold text-foreground">
                        {t('columns.remaining')} : {fmtMoney(s.remaining, currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <Pager
                centered
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                onChange={setPage}
              />
            </Card>
          )}
        </>
      )}

      {registeringFor && (
        <PaymentRegistrationModal
          studentId={registeringFor}
          onClose={() => setRegisteringFor(null)}
          onSaved={load}
        />
      )}
      {historyFor && <FeeHistoryModal studentId={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase ${className}`}
    >
      {children}
    </th>
  );
}
