'use client';

// Extracted verbatim from the old `/enseignants/[id]` fiche's "Enseignement"
// (Matières & Classes) tab — spec 2026-09-04-personnel-module-design.md
// §6.3: reused as-is, no regression. Same table, same columns
// (matière/classe/heures/coefficient), same empty state.
import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import type { TeacherWithAccess } from './types';

export function TeacherAssignmentsTab({ teacher }: { teacher: TeacherWithAccess }) {
  const t = useTranslations('Enseignants.profile');

  return (
    <Card className="p-5">
      <div className="mb-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
          <BookOpen size={14} className="text-primary" />
          {t('assignedSubjectsClasses')}
        </div>
        <Link href="/configuration/matieres" className="text-xs font-medium text-primary">
          {t('manage')}
        </Link>
      </div>
      {teacher.assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t.rich('noAssignments', {
            link: (chunks) => (
              <Link href="/configuration/matieres" className="font-semibold text-primary">
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                <th className="py-2 pr-3">{t('assignmentsTable.subject')}</th>
                <th className="py-2 pr-3">{t('assignmentsTable.class')}</th>
                <th className="py-2 pr-3">{t('assignmentsTable.weeklyHours')}</th>
                <th className="py-2">{t('assignmentsTable.coefficient')}</th>
              </tr>
            </thead>
            <tbody>
              {teacher.assignments.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 pr-3 text-caption font-medium text-foreground">
                    {a.subject.name}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="rounded-full bg-info px-2.5 py-1 text-xs font-semibold text-info-foreground">
                      {a.class.name}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-caption text-foreground">
                    {a.weeklyHours !== null ? `${a.weeklyHours} h` : '—'}
                  </td>
                  <td className="py-2.5 text-caption text-foreground">{a.coefficient ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
