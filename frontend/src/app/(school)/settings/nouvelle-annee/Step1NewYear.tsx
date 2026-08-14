'use client';

import { useState } from 'react';
import { Field } from '@/components/ui/Field';
import { DateField } from '@/components/ui/DateField';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ApiError } from '@/lib/api';
import { ACADEMIC_YEAR_ROLLOVER } from '@/lib/constants';
import type { RolloverDraft } from './types';

interface Step1NewYearProps {
  draft: Omit<RolloverDraft, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> | null;
  onSave: (data: {
    newYearLabel: string;
    newYearStartDate: string;
    newYearEndDate: string;
  }) => Promise<void>;
  onNext: () => void;
  isLoading?: boolean;
}

/** 'YYYY-MM-DD' string, matching DateField's value contract. */
function toDateInput(value: Date | string | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0] ?? '';
}

export function Step1NewYear({ draft, onSave, onNext, isLoading = false }: Step1NewYearProps) {
  const t = ACADEMIC_YEAR_ROLLOVER.step1;

  const [label, setLabel] = useState(draft?.newYearLabel ?? '');
  const [startDate, setStartDate] = useState(toDateInput(draft?.newYearStartDate));
  const [endDate, setEndDate] = useState(toDateInput(draft?.newYearEndDate));
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!label) return t.validation.yearRequired;
    if (!startDate) return t.validation.startDateRequired;
    if (!endDate) return t.validation.endDateRequired;
    if (endDate <= startDate) return t.validation.endDateAfterStart;
    return null;
  }

  function buildPayload() {
    return {
      newYearLabel: label,
      newYearStartDate: `${startDate}T00:00:00Z`,
      newYearEndDate: `${endDate}T23:59:59Z`,
    };
  }

  async function handleSaveAsDraft() {
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      await onSave(buildPayload());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    }
  }

  async function handleNext() {
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      await onSave(buildPayload());
      onNext();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    }
  }

  return (
    <Card className="gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-4">
        <Field
          label={t.yearLabel}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="2025-2026"
        />

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <DateField label={t.startDate} value={startDate} onChange={setStartDate} />
          <DateField label={t.endDate} value={endDate} onChange={setEndDate} />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          onClick={handleSaveAsDraft}
          loading={isLoading}
        >
          {t.saveAsDraft}
        </Button>
        <Button type="button" className="w-fit" onClick={handleNext} loading={isLoading}>
          {t.nextStep}
        </Button>
      </div>
    </Card>
  );
}
