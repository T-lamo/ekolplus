'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Bell,
  CircleAlert,
  Download,
  Eye,
  FileSpreadsheet,
  Flag,
  Send,
  Wallet,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Switch } from '@/components/ui/Switch';
import {
  Skeleton,
  SkeletonFilters,
  SkeletonStatCards,
  SkeletonTable,
} from '@/components/ui/Skeleton';
import { exportToCsv } from '@/lib/csv-export';
import { FEES } from '@/lib/constants';
import { fmtMoney, fmtDate } from '@/lib/fees-format';
import { FeesTabs } from '@/components/school/fees/FeesTabs';
import { FeeKpiRow } from '@/components/school/fees/FeeKpiRow';
import { SeverityBadge, type OverdueSeverity } from '@/components/school/fees/badges';
import { PaymentRegistrationModal } from '@/components/school/fees/PaymentRegistrationModal';
import { FeeHistoryModal } from '@/components/school/fees/FeeHistoryModal';
import { Pager } from '@/components/school/fees/Pager';
import { DisputeModal } from './DisputeModal';

interface OverdueRow {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  classId: string;
  className: string;
  trancheId: string;
  trancheLabel: string;
  amountDue: number;
  daysOverdue: number;
  severity: OverdueSeverity;
  lastReminderAt: string | null;
  disputed: boolean;
}

interface OverdueResponse {
  rows: OverdueRow[];
  total: number;
  page: number;
  pageSize: number;
  classes: { id: string; name: string }[];
  breakdown: { className: string; count: number }[];
  kpis: {
    totalUnpaid: number;
    overdueStudentCount: number;
    criticalCount: number;
    remindersSentThisMonth: number;
    nextDue: { trancheLabel: string; dueDate: string; amount: number } | null;
  };
}

interface AutomationSettings {
  lateFeeEnabled: boolean;
  autoRemindersEnabled: boolean;
  reminderBefore5Days: boolean;
  reminderOnDueDate: boolean;
  reminderWeeklyOverdue: boolean;
  reminderCriticalOverdue: boolean;
  currency: string;
}

const t = FEES.overdue;

export default function OverdueFeesPage() {
  const user = useUser();
  const { toast } = useToast();
  const [data, setData] = useState<OverdueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [registeringFor, setRegisteringFor] = useState<{
    studentId: string;
    trancheId: string;
  } | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [disputing, setDisputing] = useState<{ studentId: string; trancheId: string } | null>(null);
  const [automation, setAutomation] = useState<AutomationSettings | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (classFilter) params.set('classId', classFilter);
    params.set('page', String(page));
    api<OverdueResponse>(`/api/school/fees/overdue?${params.toString()}`)
      .then((res) => {
        setData(res);
        setSelected(new Set());
      })
      .catch(() => setError('Impossible de charger les relances.'));
  }, [search, classFilter, page]);

  useEffect(() => {
    if (!user) return;
    load();
    api<{ settings: AutomationSettings }>('/api/school/fees/automation-settings')
      .then((res) => setAutomation(res.settings))
      .catch(() => {});
  }, [user, load]);

  function updateSearch(value: string) {
    setPage(1);
    setSearch(value);
  }
  function updateClassFilter(value: string) {
    setPage(1);
    setClassFilter(value);
  }

  function toggleRow(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleAll() {
    if (!data) return;
    setSelected((prev) =>
      prev.size === data.rows.length
        ? new Set()
        : new Set(data.rows.map((r) => `${r.studentId}:${r.trancheId}`)),
    );
  }

  async function patchAutomation(patch: Partial<AutomationSettings>) {
    if (!automation) return;
    const next = { ...automation, ...patch };
    setAutomation(next);
    try {
      await api('/api/school/fees/automation-settings', { method: 'PATCH', body: patch });
    } catch (err) {
      setAutomation(automation);
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    }
  }

  async function sendWhatsappReminder(row: OverdueRow) {
    try {
      await api(`/api/school/fees/students/${row.studentId}/send-whatsapp`, { method: 'POST' });
      toast('Rappel WhatsApp envoyé.', 'success');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'NO_GUARDIAN_PHONE') {
          toast('Aucun numéro de tuteur principal renseigné pour cet élève.', 'error');
          return;
        }
        if (err.code === 'NO_BALANCE_DUE') {
          toast('Aucun solde restant pour cet élève.', 'error');
          return;
        }
        if (err.code === 'NOT_CONFIGURED') {
          toast("L'envoi WhatsApp n'est pas encore configuré.", 'error');
          return;
        }
      }
      toast('Envoi WhatsApp impossible. Réessaie.', 'error');
    }
  }

  function menuItemsFor(row: OverdueRow) {
    return [
      {
        label: t.rowActions.registerPayment,
        icon: <Wallet size={14} />,
        onClick: () => setRegisteringFor({ studentId: row.studentId, trancheId: row.trancheId }),
      },
      {
        label: t.rowActions.sendReminder,
        icon: <Send size={14} />,
        onClick: () => void sendWhatsappReminder(row),
      },
      {
        label: t.rowActions.viewHistory,
        icon: <Eye size={14} />,
        onClick: () => setHistoryFor(row.studentId),
        divider: true,
      },
      {
        label: t.rowActions.markDisputed,
        icon: <Flag size={14} />,
        onClick: () => setDisputing({ studentId: row.studentId, trancheId: row.trancheId }),
      },
    ];
  }

  function onExportList() {
    if (!data) return;
    exportToCsv(
      'relances-impayes.csv',
      [
        t.columns.student,
        t.columns.class,
        t.columns.tranche,
        t.columns.amountDue,
        t.columns.overdue,
        t.columns.status,
        t.columns.lastReminder,
      ],
      data.rows.map((r) => [
        `${r.firstName} ${r.lastName}`,
        r.className,
        r.trancheLabel,
        r.amountDue,
        r.daysOverdue,
        r.severity,
        r.lastReminderAt ? fmtDate(r.lastReminderAt) : '—',
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
    <div className="flex min-h-full flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">{t.title}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="w-fit" onClick={onExportList} disabled={!data}>
            <Download size={14} />
            {t.exportList}
          </Button>
          <Button className="w-fit" onClick={() => toast(FEES.stub, 'info')}>
            <Bell size={14} />
            {t.bulkReminder(selected.size)}
          </Button>
        </div>
      </div>

      <FeesTabs active="relances" />

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
          <FeeKpiRow
            items={[
              {
                icon: <Wallet size={14} />,
                label: t.kpiTotalUnpaid,
                value: fmtMoney(data.kpis.totalUnpaid, automation?.currency),
              },
              {
                icon: <CircleAlert size={14} />,
                label: t.kpiCritical,
                value: String(data.kpis.criticalCount),
              },
              {
                icon: <Send size={14} />,
                label: t.kpiSent,
                value: String(data.kpis.remindersSentThisMonth),
              },
              {
                icon: <Bell size={14} />,
                label: t.kpiNextDue,
                value: data.kpis.nextDue ? fmtDate(data.kpis.nextDue.dueDate) : '—',
                sub: data.kpis.nextDue?.trancheLabel,
              },
            ]}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
            <div className="flex min-w-0 flex-col gap-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <SearchInput
                  value={search}
                  onChange={(e) => updateSearch(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className="max-w-[300px]"
                />
                <FilterSelect value={classFilter} onValueChange={updateClassFilter}>
                  <SelectItem value="">{FEES.overview.classFilterAll}</SelectItem>
                  {data.classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </FilterSelect>
                {selected.size > 0 && (
                  <span className="text-sm font-semibold text-primary">
                    {t.selectedCount(selected.size)}
                  </span>
                )}
              </div>

              {data.rows.length === 0 ? (
                <Card>
                  <p className="p-5 text-sm text-muted-foreground">Aucun retard de paiement.</p>
                </Card>
              ) : (
                <Card className="flex-1">
                  <div className="flex-1 overflow-x-auto">
                    <table className="w-full min-w-[920px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <Th className="w-10">
                            <input
                              type="checkbox"
                              aria-label="Tout sélectionner"
                              checked={selected.size === data.rows.length}
                              onChange={toggleAll}
                            />
                          </Th>
                          <Th>{t.columns.student}</Th>
                          <Th>{t.columns.class}</Th>
                          <Th>{t.columns.tranche}</Th>
                          <Th>{t.columns.amountDue}</Th>
                          <Th>{t.columns.overdue}</Th>
                          <Th>{t.columns.status}</Th>
                          <Th>{t.columns.lastReminder}</Th>
                          <Th className="w-[70px]" />
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((r) => {
                          const key = `${r.studentId}:${r.trancheId}`;
                          return (
                            <tr key={key} className="border-b border-border last:border-none">
                              <td className="px-3.5 py-2.5">
                                <input
                                  type="checkbox"
                                  aria-label={`Sélectionner ${r.firstName} ${r.lastName}`}
                                  checked={selected.has(key)}
                                  onChange={() => toggleRow(key)}
                                />
                              </td>
                              <td className="px-3.5 py-2.5">
                                <div className="flex items-center gap-2.5">
                                  <Avatar name={`${r.firstName} ${r.lastName}`} size={32} />
                                  <div>
                                    <div className="font-semibold text-foreground">
                                      {r.firstName} {r.lastName}
                                    </div>
                                    <div className="text-2xs text-muted-foreground">
                                      #{r.studentNumber}
                                      {r.disputed && ' · Litigieux'}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3.5 py-2.5 text-muted-foreground">{r.className}</td>
                              <td className="px-3.5 py-2.5 text-muted-foreground">
                                {r.trancheLabel}
                              </td>
                              <td className="px-3.5 py-2.5 font-semibold text-foreground">
                                {fmtMoney(r.amountDue, automation?.currency)}
                              </td>
                              <td className="px-3.5 py-2.5 text-muted-foreground">
                                {t.daysOverdue(r.daysOverdue)}
                              </td>
                              <td className="px-3.5 py-2.5">
                                <SeverityBadge severity={r.severity} />
                              </td>
                              <td className="px-3.5 py-2.5 text-muted-foreground">
                                {r.lastReminderAt ? fmtDate(r.lastReminderAt) : '—'}
                              </td>
                              <td className="px-3.5 py-2.5">
                                <ActionMenu items={menuItemsFor(r)} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <Pager
                    page={data.page}
                    pageSize={data.pageSize}
                    total={data.total}
                    onChange={setPage}
                  />
                </Card>
              )}
            </div>

            <div className="flex flex-col gap-5">
              <Card className="gap-3.5 p-4">
                <div>
                  <h2 className="text-sm font-bold text-foreground">{t.automationTitle}</h2>
                  <p className="text-xs text-muted-foreground">{t.automationSubtitle}</p>
                </div>
                {!automation ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <div className="flex flex-col gap-3">
                    <ToggleRow
                      label={t.reminderBefore5Days}
                      desc={t.reminderBefore5DaysDesc}
                      checked={automation.reminderBefore5Days}
                      onChange={(v) => patchAutomation({ reminderBefore5Days: v })}
                    />
                    <ToggleRow
                      label={t.reminderOnDueDate}
                      desc={t.reminderOnDueDateDesc}
                      checked={automation.reminderOnDueDate}
                      onChange={(v) => patchAutomation({ reminderOnDueDate: v })}
                    />
                    <ToggleRow
                      label={t.reminderWeekly}
                      desc={t.reminderWeeklyDesc}
                      checked={automation.reminderWeeklyOverdue}
                      onChange={(v) => patchAutomation({ reminderWeeklyOverdue: v })}
                    />
                    <ToggleRow
                      label={t.reminderCritical}
                      desc={t.reminderCriticalDesc}
                      checked={automation.reminderCriticalOverdue}
                      onChange={(v) => patchAutomation({ reminderCriticalOverdue: v })}
                    />
                  </div>
                )}
              </Card>

              <Card className="gap-3 p-4">
                <h2 className="text-sm font-bold text-foreground">{t.byClassTitle}</h2>
                <div className="flex flex-col gap-2">
                  {data.breakdown.length === 0 ? (
                    <p className="text-xs text-muted-foreground">—</p>
                  ) : (
                    data.breakdown.map((b) => (
                      <div key={b.className} className="flex items-center justify-between text-sm">
                        <span className="text-foreground">{b.className}</span>
                        <span className="font-semibold text-muted-foreground">{b.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card className="gap-2 p-4">
                <h2 className="text-sm font-bold text-foreground">{t.quickActionsTitle}</h2>
                <Button variant="outline" className="w-full" onClick={onExportList}>
                  <FileSpreadsheet size={14} />
                  {t.exportExcel}
                </Button>
              </Card>
            </div>
          </div>
        </>
      )}

      {registeringFor && (
        <PaymentRegistrationModal
          studentId={registeringFor.studentId}
          preselectedTrancheId={registeringFor.trancheId}
          onClose={() => setRegisteringFor(null)}
          onSaved={load}
        />
      )}
      {historyFor && <FeeHistoryModal studentId={historyFor} onClose={() => setHistoryFor(null)} />}
      {disputing && (
        <DisputeModal
          studentId={disputing.studentId}
          feeTrancheId={disputing.trancheId}
          onClose={() => setDisputing(null)}
          onSaved={load}
        />
      )}
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

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="text-2xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
