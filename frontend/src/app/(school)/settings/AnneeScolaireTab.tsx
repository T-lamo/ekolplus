'use client';

import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import type { AcademicYearData, TermData } from './types';

const STATUS_LABEL: Record<TermData['status'], string> = {
  DONE: 'Terminé',
  CURRENT: 'En cours',
  UPCOMING: 'À venir',
};

const STATUS_CLASS: Record<TermData['status'], string> = {
  DONE: 'bg-muted text-muted-foreground',
  CURRENT: 'bg-success text-success-foreground',
  UPCOMING: 'bg-secondary text-secondary-foreground',
};

function fmt(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function AnneeScolaireTab({
  academicYear,
  onTermAdded,
}: {
  academicYear: AcademicYearData | null;
  onTermAdded: (term: TermData) => void;
}) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!label || !startDate || !endDate) {
      setError('Merci de remplir tous les champs.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ term: TermData }>('/api/school/terms', {
        method: 'POST',
        body: { label, startDate, endDate },
      });
      onTermAdded(res.term);
      toast('Période ajoutée.', 'success');
      setLabel('');
      setStartDate('');
      setEndDate('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div>
          <h2 className="text-[13px] font-bold text-foreground">Année scolaire &amp; Calendrier</h2>
          <p className="text-[11px] text-muted-foreground">
            Définissez les trimestres et périodes d&apos;évaluation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-3.5 text-xs font-semibold text-primary-foreground"
        >
          <Plus size={14} />
          Nouvelle période
        </button>
      </div>

      <div className="flex flex-col gap-4 p-5">
        {academicYear ? (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="text-muted-foreground">
                Année scolaire active —{' '}
                <span className="font-semibold text-foreground">{academicYear.label}</span>
              </span>
              {academicYear.gradingScale && (
                <span className="text-muted-foreground">
                  Système de notation —{' '}
                  <span className="font-semibold text-foreground">{academicYear.gradingScale}</span>
                </span>
              )}
            </div>

            {academicYear.terms.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune période configurée pour l&apos;instant — ajoute la première avec « Nouvelle
                période ».
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {academicYear.terms.map((term) => (
                  <div
                    key={term.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3.5 py-3"
                  >
                    <div>
                      <div className="text-sm font-semibold text-foreground">{term.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {fmt(term.startDate)} → {fmt(term.endDate)}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_CLASS[term.status]}`}
                    >
                      {STATUS_LABEL[term.status]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucune année scolaire configurée — crée la première période avec « Nouvelle période ».
          </p>
        )}

        {showForm && (
          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-3.5 rounded-md border border-border p-4"
          >
            <Field
              label="Nom de la période"
              placeholder="1er Trimestre"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <Field
                label="Date de début"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <Field
                label="Date de fin"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive-foreground">
                {error}
              </p>
            )}
            <Button type="submit" loading={submitting} className="w-fit">
              {submitting ? 'Ajout…' : 'Ajouter la période'}
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}
