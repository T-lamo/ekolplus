'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FEES } from '@/lib/constants';

export function DisputeModal({
  studentId,
  feeTrancheId,
  onClose,
  onSaved,
}: {
  studentId: string;
  feeTrancheId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = FEES.disputeModal;
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/school/fees/disputes', {
        method: 'POST',
        body: { studentId, feeTrancheId, reason: reason.trim() || undefined },
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t.title} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-foreground">{t.reasonLabel}</span>
          <textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-primary/10"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} className="sm:w-fit">
            {t.cancel}
          </Button>
          <Button loading={submitting} onClick={onSubmit}>
            {t.confirm}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
