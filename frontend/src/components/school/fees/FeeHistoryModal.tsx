'use client';

import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { LOCALE_BCP47 } from '@/lib/locales';
import { fmtMoney, fmtDate } from '@/lib/fees-format';
import { openReceiptAndPrint, type FeePaymentMethod } from '@/lib/fees-receipt';
import { TrancheStatusBadge, type TrancheStatus } from './badges';

const DEFAULT_CURRENCY = 'HTG';

interface HistoryTranche {
  id: string;
  label: string;
  amount: number;
  dueDate: string;
  status: TrancheStatus;
  paidAmount: number;
  remaining: number;
}

interface HistoryPayment {
  id: string;
  amount: number;
  penaltyAmount: number;
  method: FeePaymentMethod;
  reference: string | null;
  paidAt: string;
  feeTrancheId: string;
  recordedByName: string;
}

interface HistoryResponse {
  student: { id: string; firstName: string; lastName: string; studentNumber: string };
  class: { id: string; name: string } | null;
  balance: number;
  tranches: HistoryTranche[];
  payments: HistoryPayment[];
}

// "Voir l'historique" row action, shared by Fee Management and Relances
// Impayés — read-only view of a student's tranches + full payment ledger,
// each payment reprintable via the same receipt helper the registration
// modal uses.
export function FeeHistoryModal({
  studentId,
  onClose,
}: {
  studentId: string;
  onClose: () => void;
}) {
  const t = useTranslations('Fees.history');
  const tMethod = useTranslations('Fees.paymentMethod');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<HistoryResponse>(`/api/school/fees/students/${studentId}/history`)
      .then(setData)
      .catch(() => setError(t('loadError')));
    api<{ settings: { currency: string } }>('/api/school/fees/automation-settings')
      .then((res) => setCurrency(res.settings.currency))
      .catch(() => {});
  }, [studentId, t]);

  function print(payment: HistoryPayment) {
    if (!data) return;
    const tranche = data.tranches.find((tr) => tr.id === payment.feeTrancheId);
    openReceiptAndPrint({
      studentName: `${data.student.firstName} ${data.student.lastName}`,
      studentNumber: data.student.studentNumber,
      trancheLabel: tranche?.label ?? '—',
      amount: payment.amount,
      penaltyAmount: payment.penaltyAmount,
      method: payment.method,
      reference: payment.reference ?? undefined,
      paidAt: payment.paidAt,
      currency,
    });
  }

  return (
    <Modal title={t('title')} onClose={onClose}>
      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}
      {!data && !error && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {data && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between rounded-md bg-secondary px-3.5 py-2.5">
            <div>
              <div className="text-sm font-bold text-foreground">
                {data.student.firstName} {data.student.lastName}
              </div>
              <div className="text-2xs text-muted-foreground">
                #{data.student.studentNumber} {data.class ? `· ${data.class.name}` : ''}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xs text-muted-foreground">{t('balanceLabel')}</div>
              <div className="text-sm font-extrabold text-foreground">
                {fmtMoney(data.balance, currency)}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {data.tranches.map((tr) => (
              <div
                key={tr.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div>
                  <div className="text-sm font-semibold text-foreground">{tr.label}</div>
                  <div className="text-2xs text-muted-foreground">
                    {fmtMoney(tr.paidAmount, currency)} / {fmtMoney(tr.amount, currency)} ·{' '}
                    {t('dueDatePrefix')} {fmtDate(tr.dueDate, bcp47)}
                  </div>
                </div>
                <TrancheStatusBadge status={tr.status} />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-foreground">{t('paymentsTitle')}</span>
            {data.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noPayments')}</p>
            ) : (
              <div className="flex flex-col divide-y divide-border rounded-md border border-border">
                {data.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">
                        {fmtMoney(p.amount + p.penaltyAmount, currency)}
                      </div>
                      <div className="truncate text-2xs text-muted-foreground">
                        {fmtDate(p.paidAt, bcp47)} · {tMethod(p.method)} · {p.recordedByName}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => print(p)}
                      aria-label={t('printReceiptAria')}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                    >
                      <Printer size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
