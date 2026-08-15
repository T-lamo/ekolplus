'use client';

import { useEffect, useMemo, useState } from 'react';
import { Banknote, Building2, FileText, Smartphone } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { DateField } from '@/components/ui/DateField';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { FEES } from '@/lib/constants';
import { fmtMoney, fmtDate } from '@/lib/fees-format';
import { openReceiptAndPrint } from '@/lib/fees-receipt';
import { TrancheStatusBadge, type TrancheStatus } from './badges';

interface HistoryTranche {
  id: string;
  order: number;
  label: string;
  amount: number;
  dueDate: string;
  latePenaltyPercent: number | null;
  latePenaltyGraceDays: number | null;
  status: TrancheStatus;
  paidAmount: number;
  remaining: number;
}

interface HistoryResponse {
  student: { id: string; firstName: string; lastName: string; studentNumber: string };
  balance: number;
  tranches: HistoryTranche[];
}

type Method = 'ESPECES' | 'MONCASH' | 'NATCASH' | 'CHEQUE' | 'VIREMENT';

const METHOD_ICON: Record<Method, typeof Banknote> = {
  ESPECES: Banknote,
  MONCASH: Smartphone,
  NATCASH: Smartphone,
  CHEQUE: FileText,
  VIREMENT: Building2,
};

// Client-side preview only — mirrors lib/server/fees.ts's computeLatePenalty
// formula so the modal can show the banner/total before submit, but the
// server recomputes and stores the authoritative value; never trust this
// for the actual charge.
function previewPenalty(tranche: HistoryTranche, paidAt: Date, lateFeeEnabled: boolean): number {
  if (!lateFeeEnabled || tranche.latePenaltyPercent == null) return 0;
  const graceDays = tranche.latePenaltyGraceDays ?? 0;
  const graceDeadline = new Date(new Date(tranche.dueDate).getTime() + graceDays * 86_400_000);
  if (paidAt <= graceDeadline) return 0;
  return Math.round((tranche.amount * tranche.latePenaltyPercent) / 100);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PaymentRegistrationModal({
  studentId,
  preselectedTrancheId,
  onClose,
  onSaved,
}: {
  studentId: string;
  preselectedTrancheId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const t = FEES.registerPayment;
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [lateFeeEnabled, setLateFeeEnabled] = useState(true);
  const [currency, setCurrency] = useState<string>(FEES.currency);
  const [selectedTrancheId, setSelectedTrancheId] = useState(preselectedTrancheId ?? '');
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(today());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState<Method>('ESPECES');
  const [submitting, setSubmitting] = useState<'confirm' | 'print' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<HistoryResponse>(`/api/school/fees/students/${studentId}/history`),
      api<{ settings: { lateFeeEnabled: boolean; currency: string } }>(
        '/api/school/fees/automation-settings',
      ),
    ])
      .then(([history, automation]) => {
        setData(history);
        setLateFeeEnabled(automation.settings.lateFeeEnabled);
        setCurrency(automation.settings.currency);
        const initial =
          history.tranches.find((tr) => tr.id === preselectedTrancheId) ??
          history.tranches.find((tr) => tr.status !== 'PAID') ??
          history.tranches[0];
        if (initial) {
          setSelectedTrancheId(initial.id);
          setAmount(String(initial.remaining));
        }
      })
      .catch(() => setError('Impossible de charger les informations de paiement.'));
  }, [studentId, preselectedTrancheId]);

  const tranche = useMemo(
    () => data?.tranches.find((tr) => tr.id === selectedTrancheId) ?? null,
    [data, selectedTrancheId],
  );
  const amountNum = Number(amount) || 0;
  const penalty = tranche ? previewPenalty(tranche, new Date(paidAt), lateFeeEnabled) : 0;
  const total = amountNum + penalty;
  const remainingAfter = tranche ? Math.max(tranche.remaining - amountNum, 0) : 0;

  function selectTranche(tr: HistoryTranche) {
    setSelectedTrancheId(tr.id);
    setAmount(String(tr.remaining));
  }

  async function submit(mode: 'confirm' | 'print') {
    if (!tranche || amountNum <= 0) return;
    setError(null);
    setSubmitting(mode);
    try {
      await api('/api/school/fees/payments', {
        method: 'POST',
        body: {
          studentId,
          feeTrancheId: tranche.id,
          amount: amountNum,
          method,
          reference: reference || undefined,
          notes: notes || undefined,
          paidAt,
        },
      });
      if (mode === 'print' && data) {
        openReceiptAndPrint({
          studentName: `${data.student.firstName} ${data.student.lastName}`,
          studentNumber: data.student.studentNumber,
          trancheLabel: tranche.label,
          amount: amountNum,
          penaltyAmount: penalty,
          method,
          reference,
          paidAt,
          currency,
        });
      }
      toast('Paiement enregistré.', 'success');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Modal title={t.title} onClose={onClose}>
      {!data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-xs text-muted-foreground">{t.subtitle}</p>

          <div className="flex items-center justify-between rounded-md bg-secondary px-3.5 py-2.5">
            <div>
              <div className="text-sm font-bold text-foreground">
                {data.student.firstName} {data.student.lastName}
              </div>
              <div className="text-[11px] text-muted-foreground">#{data.student.studentNumber}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-muted-foreground">{t.balanceLabel}</div>
              <div className="text-sm font-extrabold text-foreground">
                {fmtMoney(data.balance, currency)}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-foreground">{t.selectTranche}</span>
            <div className="flex flex-col gap-1.5">
              {data.tranches.map((tr) => (
                <button
                  key={tr.id}
                  type="button"
                  onClick={() => selectTranche(tr)}
                  className={`flex items-center justify-between rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                    tr.id === selectedTrancheId
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-foreground">{tr.label}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {fmtMoney(tr.amount, currency)} · échéance {fmtDate(tr.dueDate)}
                    </div>
                  </div>
                  <TrancheStatusBadge status={tr.status} />
                </button>
              ))}
            </div>
          </div>

          {tranche && tranche.status === 'OVERDUE' && penalty > 0 && (
            <p className="rounded-md bg-warning px-3 py-2.5 text-xs text-warning-foreground">
              {t.latePenaltyNote(fmtMoney(penalty, currency), tranche.latePenaltyPercent ?? 0)}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold text-foreground">{t.detailsTitle}</span>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={t.amountLabel}
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <DateField label={t.dateLabel} value={paidAt} onChange={setPaidAt} />
            </div>
            <Field
              label={t.referenceLabel}
              placeholder={t.referencePlaceholder}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-semibold text-foreground">{t.notesLabel}</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.notesPlaceholder}
                rows={2}
                className="rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-primary/10"
              />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-foreground">{t.methodTitle}</span>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {(Object.keys(FEES.paymentMethodLabel) as Method[]).map((m) => {
                const Icon = METHOD_ICON[m];
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-[11px] font-semibold ${
                      method === m
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    <Icon size={16} />
                    {FEES.paymentMethodLabel[m]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 rounded-md border border-border p-3.5">
            <span className="text-xs font-semibold text-foreground">{t.totalTitle}</span>
            {penalty > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {t.breakdownLabel(fmtMoney(amountNum, currency), fmtMoney(penalty, currency))}
              </p>
            )}
            <div className="text-lg font-extrabold text-foreground">
              {fmtMoney(total, currency)}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t.remainingAfter}</span>
              <span className={remainingAfter === 0 ? 'font-semibold text-success-foreground' : ''}>
                {remainingAfter === 0 ? t.settled : fmtMoney(remainingAfter, currency)}
              </span>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t.cancel}
            </Button>
            <Button
              variant="outline"
              loading={submitting === 'print'}
              disabled={!tranche || amountNum <= 0 || submitting !== null}
              onClick={() => submit('print')}
            >
              {t.saveAndPrint}
            </Button>
            <Button
              loading={submitting === 'confirm'}
              disabled={!tranche || amountNum <= 0 || submitting !== null}
              onClick={() => submit('confirm')}
            >
              {t.confirm}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
