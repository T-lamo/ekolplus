'use client';

// "Par matière" tab — was a toast stub ("bientôt disponible"). Pivots the
// appreciations list from one row per student to one row per matière
// enseignée dans la classe, so a homeroom teacher / admin can see at a
// glance which subject teachers still owe their per-subject appreciation.
// `data.subjects` is computed server-side (see the classes/[id]/appreciations
// route) — no separate fetch here.

import { BookOpen } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { fmtAverage, moyColor } from './format';
import type { AppreciationsListData } from './types';

export function ParMatiereTab({ data }: { data: AppreciationsListData }) {
  const t = useTranslations('Appreciations.parMatiere');
  const locale = useLocale();

  if (data.subjects.length === 0) {
    return (
      <Card className="items-center gap-2 p-10 text-center">
        <BookOpen size={28} className="text-muted-foreground" />
        <p className="max-w-sm text-sm text-muted-foreground">{t('emptyState')}</p>
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
                {t('colSubject')}
              </th>
              <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t('colTeacher')}
              </th>
              <th className="px-3 py-2.5 text-center text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t('colCoefficient')}
              </th>
              <th className="px-3 py-2.5 text-center text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t('colClassAverage')}
              </th>
              <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t('colRecorded')}
              </th>
              <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t('colStatus')}
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
                      {fmtAverage(s.classAverage, locale)}
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
                        {t('statusComplete')}
                      </span>
                    ) : started ? (
                      <span className="inline-flex items-center rounded-full bg-warning px-2 py-0.5 text-2xs font-semibold text-warning-foreground">
                        {t('statusInProgress')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-2xs font-semibold text-muted-foreground">
                        {t('statusTodo')}
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
