'use client';

import { useState, type FormEvent } from 'react';
import { Check, Clock, ShieldCheck, UserX } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { AttendanceStatus } from './types';

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; icon: typeof Check }[] = [
  { value: 'PRESENT', label: 'Présent', icon: Check },
  { value: 'ABSENT', label: 'Absent', icon: UserX },
  { value: 'LATE', label: 'Retard', icon: Clock },
  { value: 'EXCUSED', label: 'Justifié', icon: ShieldCheck },
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
  const [status, setStatus] = useState<AttendanceStatus>(
    focusJustification ? 'EXCUSED' : (initialStatus ?? 'PRESENT'),
  );
  const [justification, setJustification] = useState(initialJustification ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateLabel = new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (status === 'EXCUSED' && !justification.trim()) {
      setError('Indique un motif pour justifier cette absence.');
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
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={focusJustification ? "Justifier l'absence" : 'Modifier la présence'}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <div>
          <div className="text-sm font-semibold text-foreground">{studentName}</div>
          <div className="text-xs text-muted-foreground capitalize">{dateLabel}</div>
        </div>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-foreground">Statut</span>
          <div className="grid grid-cols-2 gap-2">
            {STATUS_OPTIONS.map((opt) => (
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
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-foreground">
            Motif {status === 'EXCUSED' ? '(requis)' : '(optionnel)'}
          </span>
          <textarea
            autoFocus={focusJustification}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={3}
            placeholder="Ex. : Rendez-vous médical, certificat fourni..."
            className="rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-primary/10"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <Button type="submit" loading={submitting}>
          {submitting ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </form>
    </Modal>
  );
}
