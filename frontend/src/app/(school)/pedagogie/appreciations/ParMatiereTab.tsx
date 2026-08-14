'use client';

// "Par matière" tab — was a toast stub ("bientôt disponible"). Pivots the
// appreciations list from one row per student to one row per matière
// enseignée dans la classe, so a homeroom teacher / admin can see at a
// glance which subject teachers still owe their per-subject appreciation.
// `data.subjects` is computed server-side (see the classes/[id]/appreciations
// route) — no separate fetch here.

import { BookOpen } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import type { AppreciationsListData } from './types';

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(1).replace('.', ',');
}

function moyColor(avg: number | null): string {
  if (avg == null) return 'text-muted-foreground';
  if (avg < 8) return 'text-destructive-foreground';
  if (avg < 12) return 'text-warning-foreground';
  if (avg < 16) return 'text-info-foreground';
  return 'text-success-foreground';
}

export function ParMatiereTab({ data }: { data: AppreciationsListData }) {
  if (data.subjects.length === 0) {
    return (
      <Card className="items-center gap-2 p-10 text-center">
        <BookOpen size={28} className="text-muted-foreground" />
        <p className="max-w-sm text-sm text-muted-foreground">
          Aucune matière configurée pour cette classe.
        </p>
      </Card>
    );
  }

  return (
    <Card className="gap-0 overflow-visible">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                Matière
              </th>
              <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                Enseignant
              </th>
              <th className="px-3 py-2.5 text-center text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                Coeff.
              </th>
              <th className="px-3 py-2.5 text-center text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                Moyenne classe
              </th>
              <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                Appréciations saisies
              </th>
              <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                Statut
              </th>
            </tr>
          </thead>
          <tbody>
            {data.subjects.map((s) => {
              const complete = s.totalCount > 0 && s.saisieCount === s.totalCount;
              const started = s.saisieCount > 0 && !complete;
              return (
                <tr key={s.classSubjectId} className="border-b border-border last:border-b-0">
                  <td className="px-3.5 py-2.5">
                    <span className="text-caption font-semibold text-foreground">
                      {s.subjectName}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-medium text-foreground">
                      {s.teacherName ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="text-xs text-muted-foreground">{s.coefficient ?? '—'}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-sm font-bold ${moyColor(s.classAverage)}`}>
                      {fmt(s.classAverage)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-medium text-foreground">
                      {s.saisieCount} / {s.totalCount}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {complete ? (
                      <span className="inline-flex items-center rounded-full bg-success px-2 py-0.5 text-2xs font-semibold text-success-foreground">
                        Complet
                      </span>
                    ) : started ? (
                      <span className="inline-flex items-center rounded-full bg-warning px-2 py-0.5 text-2xs font-semibold text-warning-foreground">
                        En cours
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-2xs font-semibold text-muted-foreground">
                        À faire
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
