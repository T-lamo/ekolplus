'use client';

import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { FEES } from '@/lib/constants';
import { fmtMoney, fmtDate } from '@/lib/fees-format';
import { openReceiptAndPrint, type FeePaymentMethod } from '@/lib/fees-receipt';
import { TrancheStatusBadge, type TrancheStatus } from './badges';

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
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [currency, setCurrency] = useState<string>(FEES.currency);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<HistoryResponse>(`/api/school/fees/students/${studentId}/history`)
      .then(setData)
      .catch(() => setError('Impossible de charger l’historique.'));
    api<{ settings: { currency: string } }>('/api/school/fees/automation-settings')
      .then((res) => setCurrency(res.settings.currency))
      .catch(() => {});
  }, [studentId]);

  function print(payment: HistoryPayment) {
    if (!data) return;
    const tranche = data.tranches.find((t) => t.id === payment.feeTrancheId);
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
    <Modal title="Historique des paiements" onClose={onClose}>
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
              <div className="text-[11px] text-muted-foreground">
                #{data.student.studentNumber} {data.class ? `· ${data.class.name}` : ''}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-muted-foreground">Solde dû</div>
              <div className="text-sm font-extrabold text-foreground">
                {fmtMoney(data.balance, currency)}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {data.tranches.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div>
                  <div className="text-sm font-semibold text-foreground">{t.label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {fmtMoney(t.paidAmount, currency)} / {fmtMoney(t.amount, currency)} · échéance{' '}
                    {fmtDate(t.dueDate)}
                  </div>
                </div>
                <TrancheStatusBadge status={t.status} />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-foreground">Paiements enregistrés</span>
            {data.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun paiement enregistré.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border rounded-md border border-border">
                {data.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">
                        {fmtMoney(p.amount + p.penaltyAmount, currency)}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {fmtDate(p.paidAt)} · {FEES.paymentMethodLabel[p.method]} ·{' '}
                        {p.recordedByName}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => print(p)}
                      aria-label="Imprimer le reçu"
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
