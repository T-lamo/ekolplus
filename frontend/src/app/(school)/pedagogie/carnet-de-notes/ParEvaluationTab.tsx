'use client';

// "Par évaluation" tab — was a toast stub ("bientôt disponible"). Flips
// the notebook's axis: instead of one row per student, one row/card per
// evaluation, with real per-evaluation stats computed client-side from
// the same `unified` data the "Vue tableau" tab already loaded (no new
// API calls, no fabricated numbers). Average/best/worst stay in the
// evaluation's own maxScore scale (no /20 rescaling here — unlike the
// Statistiques tab's cross-evaluation aggregates, each card only ever
// compares a single evaluation against itself).

import { useMemo } from 'react';
import { AlertCircle, Calendar, Pencil, UserX } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import type { EvaluationType, UnifiedNotebookData } from './types';

const TYPE_LABEL: Record<EvaluationType, string> = {
  DS: 'Devoir surveillé',
  INTERROGATION: 'Interrogation',
  EXAMEN: 'Examen',
  AUTRE: 'Autre',
};

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(1).replace('.', ',');
}

function fmtDate(d: string | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

interface EvalRow {
  key: string;
  subjectName: string;
  label: string;
  type: EvaluationType;
  status: 'DRAFT' | 'PUBLISHED';
  coefficient: number;
  maxScore: number;
  date: string | null;
  average: number | null;
  best: number | null;
  worst: number | null;
  gradedCount: number;
  absentCount: number;
  totalCount: number;
}

export function ParEvaluationTab({ unified }: { unified: UnifiedNotebookData }) {
  const rows = useMemo<EvalRow[]>(() => {
    const list = unified.subjects.flatMap((sub) =>
      sub.evaluations.map((ev) => {
        const scores: number[] = [];
        let absentCount = 0;
        for (const student of unified.students) {
          const cell = student.bySubject[sub.classSubjectId];
          const g = cell?.grades.find((gr) => gr.evaluationId === ev.id);
          if (!g) continue;
          if (g.absent) {
            absentCount++;
            continue;
          }
          if (g.score == null) continue;
          scores.push(g.score);
        }
        return {
          key: ev.id,
          subjectName: sub.subjectName,
          label: ev.label,
          type: ev.type,
          status: ev.status,
          coefficient: ev.coefficient,
          maxScore: ev.maxScore,
          date: ev.date,
          average:
            scores.length > 0
              ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10
              : null,
          best: scores.length > 0 ? Math.max(...scores) : null,
          worst: scores.length > 0 ? Math.min(...scores) : null,
          gradedCount: scores.length,
          absentCount,
          totalCount: unified.students.length,
        };
      }),
    );
    // Chronological (undated evaluations last), stable within a subject.
    return list.sort((a, b) => {
      if (a.date && b.date) return a.date.localeCompare(b.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });
  }, [unified]);

  if (rows.length === 0) {
    return (
      <Card className="items-center gap-2 p-10 text-center">
        <AlertCircle size={24} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Aucune évaluation pour cette période — crée la première avec « Nouvelle évaluation ».
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <Card key={r.key} className="gap-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {unified.combined && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-2xs font-semibold text-primary">
                    {r.subjectName}
                  </span>
                )}
                <span className="font-semibold text-foreground">{r.label}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">
                  {TYPE_LABEL[r.type]}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${
                    r.status === 'PUBLISHED'
                      ? 'bg-success text-success-foreground'
                      : 'bg-warning text-warning-foreground'
                  }`}
                >
                  {r.status === 'PUBLISHED' ? 'Publiée' : 'Brouillon'}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
                <span>Coeff. {r.coefficient}</span>
                <span>Sur {r.maxScore} pts</span>
                {fmtDate(r.date) && (
                  <span className="flex items-center gap-1">
                    <Calendar size={11} />
                    {fmtDate(r.date)}
                  </span>
                )}
                {r.absentCount > 0 && (
                  <span className="flex items-center gap-1 text-warning-foreground">
                    <UserX size={11} />
                    {r.absentCount} absent{r.absentCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
            <Link
              href={`/pedagogie/carnet-de-notes/${r.key}/saisie`}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-2xs font-semibold text-foreground hover:bg-muted"
            >
              <Pencil size={12} />
              Voir / modifier les notes
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-4">
            <EvalStat
              label="Moyenne"
              value={r.average != null ? `${fmt(r.average)}/${r.maxScore}` : '—'}
            />
            <EvalStat
              label="Meilleure note"
              value={r.best != null ? `${fmt(r.best)}/${r.maxScore}` : '—'}
            />
            <EvalStat
              label="Note la plus basse"
              value={r.worst != null ? `${fmt(r.worst)}/${r.maxScore}` : '—'}
            />
            <EvalStat label="Notes saisies" value={`${r.gradedCount} / ${r.totalCount}`} />
          </div>
        </Card>
      ))}
    </div>
  );
}

function EvalStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xs text-muted-foreground">{label}</div>
      <div className="text-caption font-bold text-foreground">{value}</div>
    </div>
  );
}
