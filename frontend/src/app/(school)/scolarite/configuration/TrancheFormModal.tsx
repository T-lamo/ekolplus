'use client';

import { useState, type FormEvent } from 'react';
import { Field } from '@/components/ui/Field';
import { DateField } from '@/components/ui/DateField';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { FEES } from '@/lib/constants';

const t = FEES.configuration;

export interface TrancheFormValues {
  label: string;
  amount: string;
  dueDate: string;
  latePenaltyPercent: string;
  latePenaltyGraceDays: string;
}

export function TrancheFormModal({
  tranche,
  defaultLabel,
  lateFeeEnabled,
  totalAmount,
  onClose,
  onSave,
}: {
  tranche: TrancheFormValues | null;
  defaultLabel: string;
  lateFeeEnabled: boolean;
  totalAmount: number;
  onClose: () => void;
  onSave: (values: TrancheFormValues) => void;
}) {
  const [label, setLabel] = useState(tranche?.label ?? defaultLabel);
  const [amount, setAmount] = useState(tranche?.amount ?? '0');
  const [dueDate, setDueDate] = useState(tranche?.dueDate ?? new Date().toISOString().slice(0, 10));
  const [latePenaltyPercent, setLatePenaltyPercent] = useState(tranche?.latePenaltyPercent ?? '');
  const [latePenaltyGraceDays, setLatePenaltyGraceDays] = useState(
    tranche?.latePenaltyGraceDays ?? '',
  );

  const pct = totalAmount > 0 ? Math.round(((Number(amount) || 0) / totalAmount) * 100) : 0;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // When late fees are globally disabled, the penalty fields are hidden
    // (not editable) below — their state stays at its initial value, so this
    // never overwrites already-saved penalty data on an unrelated edit.
    onSave({ label, amount, dueDate, latePenaltyPercent, latePenaltyGraceDays });
    onClose();
  }

  return (
    <Modal title={tranche ? t.editTranche : t.addTranche} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <Field
          label={t.trancheLabelField}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3.5">
          <DateField label={t.trancheDueDateField} required value={dueDate} onChange={setDueDate} />
          <Field
            label={t.trancheAmountField}
            type="number"
            min={0}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            trailing={
              <span className="shrink-0 text-xs font-semibold text-muted-foreground">{pct}%</span>
            }
          />
        </div>
        {lateFeeEnabled && (
          <div className="grid grid-cols-2 gap-3.5">
            <Field
              label={t.trancheLatePenaltyField}
              type="number"
              min={0}
              max={100}
              placeholder={t.noLatePenalty}
              value={latePenaltyPercent}
              onChange={(e) => setLatePenaltyPercent(e.target.value)}
            />
            <Field
              label={t.trancheGraceDaysField}
              type="number"
              min={0}
              max={90}
              disabled={latePenaltyPercent === ''}
              value={latePenaltyGraceDays}
              onChange={(e) => setLatePenaltyGraceDays(e.target.value)}
            />
          </div>
        )}
        <Button type="submit">{t.saveTranche}</Button>
      </form>
    </Modal>
  );
}
