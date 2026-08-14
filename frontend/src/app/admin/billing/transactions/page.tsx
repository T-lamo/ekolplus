'use client';

// /admin/billing/transactions — Admin Transactions (Banani Csehe4Ndlnml).
// Plan: .planning/banani/admin-transactions.md. "Enregistrer un paiement"
// (hors mockup) is the only data source until Stripe lands — confirmed at
// plan review. "Rapport PDF" is an honest stub. The mockup's PayPal split
// becomes the real method enum (Stripe / Manuel / Virement bancaire).

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CalendarClock, Download, FileText, Plus, Receipt, Wallet } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { ADMIN_TRANSACTIONS as T } from '@/lib/constants';
import { fmtDateMed, fmtMonthYear, fmtUsd, fmtUsdRound } from '@/lib/admin-format';
import { exportToCsv } from '@/lib/csv-export';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
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
import { PlanBadge, TransactionStatusBadge } from '@/components/admin/badges';
import { ADMIN_SAAS } from '@/lib/constants';

interface TxRow {
  id: string;
  reference: string;
  school: { id: string; name: string };
  plan: { key: string; name: string } | null;
  amountCents: number;
  method: 'STRIPE' | 'MANUAL' | 'BANK_TRANSFER';
  status: 'SUCCEEDED' | 'PENDING' | 'FAILED' | 'REFUNDED';
  paidAt: string;
  periodStart: string;
  refund: { id: string; reference: string } | null;
  refundOf: { id: string; reference: string } | null;
}

interface TxResponse {
  items: TxRow[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    yearCents: number;
    yearDeltaPct: number | null;
    monthCents: number;
    monthDeltaPct: number | null;
    monthCount: number;
    pendingRefundCount: number;
    pendingRefundCents: number;
    succeededCount: number;
    failedCount: number;
    succeededPct: number | null;
    refundedCents: number;
    avgTicketCents: number | null;
  };
  methods: { method: string; cents: number; pct: number }[];
  series: { label: string; cents: number }[];
  peak: { label: string; cents: number };
  schools: { id: string; name: string }[];
}

const TH_CLASS =
  'px-3 py-2 text-left text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase';
const TD_CLASS = 'px-3 py-2.5 text-[13px] whitespace-nowrap';

type ModalState = { kind: 'none' } | { kind: 'detail'; tx: TxRow } | { kind: 'record' };

function monthOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: fmtMonthYear(d),
    });
  }
  return out;
}

export default function AdminTransactionsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [month, setMonth] = useState('');
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (month) params.set('month', month);
    if (status) params.set('status', status);
    if (method) params.set('method', method);
    params.set('page', String(page));
    try {
      setData(await api<TxResponse>(`/api/admin/billing/transactions?${params.toString()}`));
    } catch {
      setError(T.loadError);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, month, status, method, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, month, status, method]);

  function onExport() {
    if (!data) return;
    exportToCsv(
      'transactions.csv',
      [
        T.columns.reference,
        T.columns.school,
        T.columns.plan,
        T.columns.amount,
        T.columns.method,
        T.columns.date,
        T.columns.period,
        T.columns.status,
      ],
      data.items.map((t) => [
        t.reference,
        t.school.name,
        t.plan?.name ?? '—',
        fmtUsd(t.amountCents),
        T.methods.labels[t.method] ?? t.method,
        fmtDateMed(t.paidAt),
        fmtMonthYear(t.periodStart),
        ADMIN_SAAS.transactionStatus[t.status],
      ]),
    );
  }

  const stats = data?.stats;
  const year = new Date().getFullYear();

  return (
    <div className="mx-auto max-w-[1200px]">
      <AdminPageHeader
        title={T.title}
        subtitle={T.subtitle}
        actions={
          <>
            <Button variant="outline" className="sm:w-auto" onClick={onExport} disabled={!data}>
              <Download size={14} />
              {T.exportCsv}
            </Button>
            <Button variant="outline" className="sm:w-auto" onClick={() => toast(T.stub)}>
              <FileText size={14} />
              {T.reportPdf}
            </Button>
            <Button className="sm:w-auto" onClick={() => setModal({ kind: 'record' })}>
              <Plus size={14} />
              {T.recordPayment}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        {stats ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={T.kpi.year(year)}
              value={fmtUsdRound(stats.yearCents)}
              icon={<Wallet size={15} />}
              delta={
                stats.yearDeltaPct !== null
                  ? `${stats.yearDeltaPct >= 0 ? '+' : ''}${stats.yearDeltaPct}%`
                  : undefined
              }
              deltaTone={
                stats.yearDeltaPct !== null && stats.yearDeltaPct < 0 ? 'destructive' : 'success'
              }
              sub={stats.yearDeltaPct !== null ? T.kpi.vsPrevYear(year - 1) : undefined}
            />
            <StatCard
              label={T.kpi.month}
              value={fmtUsdRound(stats.monthCents)}
              icon={<CalendarClock size={15} />}
              delta={
                stats.monthDeltaPct !== null
                  ? `${stats.monthDeltaPct >= 0 ? '+' : ''}${stats.monthDeltaPct}%`
                  : undefined
              }
              deltaTone={
                stats.monthDeltaPct !== null && stats.monthDeltaPct < 0 ? 'destructive' : 'success'
              }
              sub={stats.monthDeltaPct !== null ? T.kpi.vsLastMonth : undefined}
            />
            <StatCard
              label={T.kpi.monthCount}
              value={String(stats.monthCount)}
              icon={<Receipt size={15} />}
              deltaTone="muted"
              sub={undefined}
            />
            <StatCard
              label={T.kpi.pendingRefunds}
              value={String(stats.pendingRefundCount)}
              icon={<FileText size={15} />}
              deltaTone={stats.pendingRefundCount > 0 ? 'destructive' : 'muted'}
              sub={
                stats.pendingRefundCount > 0
                  ? `${fmtUsd(stats.pendingRefundCents)} ${T.kpi.toProcess}`
                  : undefined
              }
            />
          </div>
        ) : (
          <SkeletonStatCards count={4} />
        )}

        {data && (
          <div className="grid min-w-0 gap-4 lg:grid-cols-[2fr_1fr]">
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-bold text-foreground">{T.chart.title(year)}</h2>
              <BarChart
                data={data.series.map((m) => ({ label: m.label, value: m.cents }))}
                formatValue={(v) => fmtUsdRound(v)}
                height={150}
                ariaLabel={T.chart.title(year)}
              />
              <div className="mt-3 flex gap-6 border-t border-border pt-3">
                <div>
                  <div className="text-[11px] text-muted-foreground">{T.chart.best}</div>
                  <div className="text-sm font-extrabold text-foreground">
                    {data.peak.cents > 0
                      ? `${data.peak.label} — ${fmtUsdRound(data.peak.cents)}`
                      : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">{T.chart.ytd}</div>
                  <div className="text-sm font-extrabold text-foreground">
                    {fmtUsdRound(data.series.reduce((s, b) => s + b.cents, 0))}
                  </div>
                </div>
              </div>
            </Card>
            <Card className="flex flex-col gap-3 p-4">
              <h2 className="text-sm font-bold text-foreground">{T.methods.title}</h2>
              {data.methods.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">—</p>
              ) : (
                data.methods.map((m) => (
                  <div key={m.method} className="flex items-center gap-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {T.methods.labels[m.method] ?? m.method}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {m.pct}% — {fmtUsdRound(m.cents)}
                    </span>
                  </div>
                ))
              )}
              <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-3 text-[11px]">
                <div>
                  <div className="text-muted-foreground">{T.methods.succeeded}</div>
                  <div className="font-bold text-foreground">
                    {stats
                      ? `${stats.succeededCount}${stats.succeededPct !== null ? ` (${stats.succeededPct}%)` : ''}`
                      : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">{T.methods.failed}</div>
                  <div className="font-bold text-foreground">{stats?.failedCount ?? '—'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">{T.methods.refunded}</div>
                  <div className="font-bold text-foreground">
                    {stats ? T.methods.refundedSub(fmtUsd(stats.refundedCents)) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">{T.methods.avgTicket}</div>
                  <div className="font-bold text-foreground">
                    {stats && stats.avgTicketCents !== null
                      ? `${fmtUsd(stats.avgTicketCents)} ${T.methods.perTx}`
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
              className="sm:max-w-[300px]"
            />
            <FilterSelect value={month} onValueChange={setMonth} className="min-w-40">
              <SelectItem value="">{T.filters.allMonths}</SelectItem>
              {monthOptions().map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={status} onValueChange={setStatus} className="min-w-36">
              <SelectItem value="">{T.filters.allStatuses}</SelectItem>
              {(['SUCCEEDED', 'PENDING', 'FAILED', 'REFUNDED'] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {ADMIN_SAAS.transactionStatus[s]}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect value={method} onValueChange={setMethod} className="min-w-36">
              <SelectItem value="">{T.filters.allMethods}</SelectItem>
              {(['STRIPE', 'MANUAL', 'BANK_TRANSFER'] as const).map((m) => (
                <SelectItem key={m} value={m}>
                  {T.methods.labels[m]}
                </SelectItem>
              ))}
            </FilterSelect>
          </div>
        ) : (
          <SkeletonFilters />
        )}

        <Card>
          {data && (
            <div className="border-b border-border px-4 py-3.5">
              <h2 className="text-sm font-bold text-foreground">{T.list.title}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{T.list.subtitle(data.total)}</p>
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
            <SkeletonTable rows={7} cols={7} />
          ) : data.items.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">{T.empty}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className={TH_CLASS}>{T.columns.reference}</th>
                      <th className={TH_CLASS}>{T.columns.school}</th>
                      <th className={TH_CLASS}>{T.columns.plan}</th>
                      <th className={`${TH_CLASS} text-right`}>{T.columns.amount}</th>
                      <th className={TH_CLASS}>{T.columns.method}</th>
                      <th className={TH_CLASS}>{T.columns.date}</th>
                      <th className={TH_CLASS}>{T.columns.period}</th>
                      <th className={TH_CLASS}>{T.columns.status}</th>
                      <th className={`${TH_CLASS} text-right`}>{T.columns.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.items.map((t) => (
                      <tr key={t.id} className="hover:bg-muted/50">
                        <td className={`${TD_CLASS} font-mono text-xs font-bold text-foreground`}>
                          {t.reference}
                        </td>
                        <td className={TD_CLASS}>
                          <div className="flex items-center gap-2">
                            <Avatar name={t.school.name} size={26} />
                            <span className="max-w-[180px] truncate font-semibold text-foreground">
                              {t.school.name}
                            </span>
                          </div>
                        </td>
                        <td className={TD_CLASS}>
                          {t.plan ? <PlanBadge planKey={t.plan.key} name={t.plan.name} /> : '—'}
                        </td>
                        <td
                          className={`${TD_CLASS} text-right font-semibold ${t.amountCents < 0 ? 'text-destructive-foreground' : 'text-foreground'}`}
                        >
                          {fmtUsd(t.amountCents)}
                        </td>
                        <td className={`${TD_CLASS} text-muted-foreground`}>
                          {T.methods.labels[t.method] ?? t.method}
                        </td>
                        <td className={`${TD_CLASS} text-muted-foreground`}>
                          {fmtDateMed(t.paidAt)}
                        </td>
                        <td className={`${TD_CLASS} text-muted-foreground`}>
                          {fmtMonthYear(t.periodStart)}
                        </td>
                        <td className={TD_CLASS}>
                          <TransactionStatusBadge status={t.status} />
                        </td>
                        <td className={`${TD_CLASS} text-right`}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-auto w-auto"
                            onClick={() => setModal({ kind: 'detail', tx: t })}
                          >
                            {T.view}
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
      </div>

      {modal.kind === 'detail' && (
        <DetailModal
          tx={modal.tx}
          onClose={() => setModal({ kind: 'none' })}
          onRefunded={() => {
            setModal({ kind: 'none' });
            toast(T.detailModal.refunded, 'success');
            void load();
          }}
        />
      )}
      {modal.kind === 'record' && data && (
        <RecordModal
          schools={data.schools}
          onClose={() => setModal({ kind: 'none' })}
          onDone={() => {
            setModal({ kind: 'none' });
            toast(T.recordModal.saved, 'success');
            void load();
          }}
        />
      )}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-[13px] font-semibold text-foreground">{children}</span>
    </div>
  );
}

function DetailModal({
  tx,
  onClose,
  onRefunded,
}: {
  tx: TxRow;
  onClose: () => void;
  onRefunded: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const refundable = tx.status === 'SUCCEEDED' && tx.amountCents > 0 && !tx.refund;

  async function onRefund() {
    setBusy(true);
    try {
      await api(`/api/admin/billing/transactions/${tx.id}/refund`, { method: 'POST', body: {} });
      onRefunded();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : T.loadError, 'error');
      setBusy(false);
    }
  }

  return (
    <Modal title={T.detailModal.title} onClose={onClose}>
      <div className="divide-y divide-border">
        <DetailRow label={T.detailModal.reference}>
          <span className="font-mono">{tx.reference}</span>
        </DetailRow>
        <DetailRow label={T.detailModal.school}>{tx.school.name}</DetailRow>
        <DetailRow label={T.detailModal.amount}>
          <span className={tx.amountCents < 0 ? 'text-destructive-foreground' : ''}>
            {fmtUsd(tx.amountCents)}
          </span>
        </DetailRow>
        <DetailRow label={T.detailModal.method}>
          {T.methods.labels[tx.method] ?? tx.method}
        </DetailRow>
        <DetailRow label={T.detailModal.date}>{fmtDateMed(tx.paidAt)}</DetailRow>
        <DetailRow label={T.detailModal.period}>{fmtMonthYear(tx.periodStart)}</DetailRow>
        <DetailRow label={T.detailModal.status}>
          <TransactionStatusBadge status={tx.status} />
        </DetailRow>
        {tx.refund && (
          <DetailRow label={T.detailModal.refundedBy}>
            <span className="font-mono">{tx.refund.reference}</span>
          </DetailRow>
        )}
        {tx.refundOf && (
          <DetailRow label={T.detailModal.refundOf}>
            <span className="font-mono">{tx.refundOf.reference}</span>
          </DetailRow>
        )}
      </div>
      <div className="mt-4 flex gap-2.5">
        <Button variant="outline" onClick={onClose}>
          {T.detailModal.close}
        </Button>
        {refundable && (
          <Button
            loading={busy}
            className="bg-destructive-foreground hover:bg-destructive-foreground/90"
            onClick={() => void onRefund()}
          >
            {busy ? T.detailModal.refunding : T.detailModal.refund}
          </Button>
        )}
      </div>
    </Modal>
  );
}

function RecordModal({
  schools,
  onClose,
  onDone,
}: {
  schools: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const now = new Date();
  const [schoolId, setSchoolId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('MANUAL');
  const [status, setStatus] = useState('SUCCEEDED');
  const [period, setPeriod] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  );
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(Number.parseFloat(amount.replace(',', '.')) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      toast(T.recordModal.invalidAmount, 'error');
      return;
    }
    setBusy(true);
    try {
      await api('/api/admin/billing/transactions', {
        method: 'POST',
        body: { schoolId, amountCents: cents, method, status, period },
      });
      onDone();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : T.loadError, 'error');
      setBusy(false);
    }
  }

  return (
    <Modal title={T.recordModal.title} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <Select label={T.recordModal.school} value={schoolId} onValueChange={setSchoolId}>
          <FormSelectItem value="">{T.recordModal.schoolPlaceholder}</FormSelectItem>
          {schools.map((s) => (
            <FormSelectItem key={s.id} value={s.id}>
              {s.name}
            </FormSelectItem>
          ))}
        </Select>
        <div>
          <Field
            label={T.recordModal.amount}
            name="amount"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="156.00"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">{T.recordModal.amountHint}</p>
        </div>
        <Select label={T.recordModal.method} value={method} onValueChange={setMethod}>
          <FormSelectItem value="MANUAL">{T.methods.labels['MANUAL']}</FormSelectItem>
          <FormSelectItem value="BANK_TRANSFER">{T.methods.labels['BANK_TRANSFER']}</FormSelectItem>
          <FormSelectItem value="STRIPE">{T.methods.labels['STRIPE']}</FormSelectItem>
        </Select>
        <Select label={T.recordModal.status} value={status} onValueChange={setStatus}>
          <FormSelectItem value="SUCCEEDED">
            {ADMIN_SAAS.transactionStatus.SUCCEEDED}
          </FormSelectItem>
          <FormSelectItem value="PENDING">{ADMIN_SAAS.transactionStatus.PENDING}</FormSelectItem>
          <FormSelectItem value="FAILED">{ADMIN_SAAS.transactionStatus.FAILED}</FormSelectItem>
        </Select>
        <Field
          label={T.recordModal.period}
          name="period"
          type="month"
          required
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        />
        <div className="mt-1 flex gap-2.5">
          <Button type="button" variant="outline" onClick={onClose}>
            {T.recordModal.cancel}
          </Button>
          <Button type="submit" loading={busy} disabled={!schoolId}>
            {busy ? T.recordModal.saving : T.recordModal.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
