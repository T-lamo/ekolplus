'use client';

import { useState, type FormEvent } from 'react';
import { Check, Clock, ShieldCheck, UserX } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { LOCALE_BCP47 } from '@/lib/locales';
import { statusLabel } from './status-label';
import type { AttendanceStatus } from './types';

const STATUS_OPTIONS_STYLE: { value: AttendanceStatus; icon: typeof Check }[] = [
  { value: 'PRESENT', icon: Check },
  { value: 'ABSENT', icon: UserX },
  { value: 'LATE', icon: Clock },
  { value: 'EXCUSED', icon: ShieldCheck },
];

// Shared by the row-kebab's "Modifier la présence" (all 4 statuses open,
// motif optional) and "Justifier l'absence" (pre-selects Justifié, motif
// required) — one modal, two entry props, both call the same PATCH.
export function AttendanceEditModal({
  studentId,
  studentName,
  date,
  initialStatus,
  initialJustification,
  focusJustification = false,
  onClose,
  onSaved,
}: {
  studentId: string;
  studentName: string;
  date: string;
  initialStatus: AttendanceStatus | null;
  initialJustification: string | null;
  focusJustification?: boolean;
  onClose: () => void;
  onSaved: (status: AttendanceStatus, justification: string | null) => void;
}) {
  const t = useTranslations('Presences.editModal');
  const tStatus = useTranslations('Presences.status');
  const tCommon = useTranslations('Common');
  const locale = useLocale();

  const [status, setStatus] = useState<AttendanceStatus>(
    focusJustification ? 'EXCUSED' : (initialStatus ?? 'PRESENT'),
  );
  const [justification, setJustification] = useState(initialJustification ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateLabel = new Date(date).toLocaleDateString(LOCALE_BCP47[locale], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (status === 'EXCUSED' && !justification.trim()) {
      setError(t('motifRequiredError'));
      return;
    }
    setSubmitting(true);
    try {
      await api('/api/school/attendance', {
        method: 'PATCH',
        body: {
          studentId,
          date,
          status,
          justification: justification.trim() || null,
        },
      });
      onSaved(status, justification.trim() || null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={focusJustification ? t('justifyTitle') : t('editTitle')} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <div>
          <div className="text-sm font-semibold text-foreground">{studentName}</div>
          <div className="text-xs text-muted-foreground capitalize">{dateLabel}</div>
        </div>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-foreground">{t('statusLabel')}</span>
          <div className="grid grid-cols-2 gap-2">
            {STATUS_OPTIONS_STYLE.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatus(opt.value)}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${
                  status === opt.value
                    ? 'border-primary bg-secondary text-primary'
                    : 'border-border text-foreground'
                }`}
              >
                <opt.icon size={14} />
                {statusLabel(opt.value, tStatus)}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-foreground">
            {status === 'EXCUSED' ? t('motifRequired') : t('motifOptional')}
          </span>
          <textarea
            autoFocus={focusJustification}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={3}
            placeholder={t('motifPlaceholder')}
            className="rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-primary/10"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <Button type="submit" loading={submitting}>
          {submitting ? t('saving') : t('save')}
        </Button>
      </form>
    </Modal>
  );
}
