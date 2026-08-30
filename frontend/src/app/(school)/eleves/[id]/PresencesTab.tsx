'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarCheck, CalendarX, Clock, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { getCache, useApi } from '@/lib/useApi';
import { Card } from '@/components/ui/Card';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Skeleton, SkeletonTable } from '@/components/ui/Skeleton';
import { LOCALE_BCP47 } from '@/lib/locales';
import { statusLabel } from '../../pedagogie/presences/status-label';
import type { AttendanceStatus, StudentAttendanceResponse } from '../../pedagogie/presences/types';

const STATUS_STYLE: Record<AttendanceStatus, { bg: string; fg: string }> = {
  PRESENT: { bg: 'bg-success', fg: 'text-success-foreground' },
  ABSENT: { bg: 'bg-destructive', fg: 'text-destructive-foreground' },
  LATE: { bg: 'bg-warning', fg: 'text-warning-foreground' },
  EXCUSED: { bg: 'bg-info', fg: 'text-info-foreground' },
};

function fmtDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function PresencesTab({ studentId }: { studentId: string }) {
  const t = useTranslations('Eleves.attendanceTab');
  const tFilterBy = useTranslations('Eleves');
  const tPresences = useTranslations('Presences.summary');
  const tDistribution = useTranslations('Presences.stats.distribution');
  const tStatus = useTranslations('Presences.status');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const [termId, setTermId] = useState('');
  const qs = termId ? `?termId=${termId}` : '';
  const attendancePath = `/api/school/students/${studentId}/attendance${qs}`;
  const { data, loading } = useApi<StudentAttendanceResponse>(attendancePath);

  // `termId` is local state, not a URL param, so this component never
  // remounts on term change — gate the auto-seed on `getCache(...) === data`
  // (only true once the cache entry actually written for THIS path matches
  // what we're holding) so a stale sibling term's data can't seed the wrong
  // resolvedTermId.
  const keyRef = useRef<string | null>(null);
  useEffect(() => {
    if (data && getCache(attendancePath) === data && keyRef.current !== attendancePath) {
      keyRef.current = attendancePath;
      setTermId(data.resolvedTermId ?? '');
    }
  }, [data, attendancePath]);

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <Card className="flex-row flex-wrap items-center gap-3 p-3.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-40" />
        </Card>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-2 h-3 w-20" />
            </Card>
          ))}
        </div>
        <Card className="gap-3 p-4.5">
          <Skeleton className="h-4 w-48" />
          <SkeletonTable rows={6} cols={3} />
        </Card>
      </div>
    );
  }

  const sortedDays = [...data.days].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex-row flex-wrap items-center gap-3 p-3.5">
        <span className="text-xs font-semibold text-muted-foreground">{tFilterBy('filterBy')}</span>
        <FilterSelect value={termId} onValueChange={setTermId}>
          {data.terms.map((term) => (
            <SelectItem key={term.id} value={term.id}>
              {term.label}
            </SelectItem>
          ))}
        </FilterSelect>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AttendanceStat
          icon={CalendarCheck}
          tone="success"
          label={tPresences('attendanceRate')}
          value={data.ratePercent != null ? `${data.ratePercent}%` : '—'}
        />
        <AttendanceStat
          icon={CalendarX}
          tone="destructive"
          label={tDistribution('absent')}
          value={String(data.absences)}
        />
        <AttendanceStat
          icon={Clock}
          tone="warning"
          label={tDistribution('late')}
          value={String(data.summary.late)}
        />
        <AttendanceStat
          icon={ShieldCheck}
          tone="blue"
          label={tDistribution('excused')}
          value={String(data.summary.excused)}
        />
      </div>

      <Card className="gap-3 p-4.5">
        <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
          <CalendarCheck size={14} className="text-primary" />
          {t('journal')}
        </div>
        {sortedDays.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                    {t('table.date')}
                  </th>
                  <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                    {t('table.status')}
                  </th>
                  <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                    {t('table.justification')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedDays.map((d) => {
                  const style = STATUS_STYLE[d.status];
                  return (
                    <tr key={d.date} className="border-b border-border last:border-b-0">
                      <td className="px-2 py-2.5 text-caption font-medium text-foreground capitalize">
                        {fmtDate(d.date, bcp47)}
                      </td>
                      <td className="px-2 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-2xs font-bold ${style.bg} ${style.fg}`}
                        >
                          {statusLabel(d.status, tStatus)}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-xs text-muted-foreground">
                        {d.justification ?? <span className="italic">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {loading && <Skeleton className="mx-auto h-3 w-24" />}
    </div>
  );
}

function AttendanceStat({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof CalendarCheck;
  tone: 'success' | 'destructive' | 'warning' | 'blue';
  label: string;
  value: string;
}) {
  const toneBg: Record<string, string> = {
    success: 'bg-success text-success-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
    warning: 'bg-warning text-warning-foreground',
    blue: 'bg-info text-info-foreground',
  };
  return (
    <Card className="gap-2 p-4">
      <div className={`flex h-8 w-8 items-center justify-center rounded-md ${toneBg[tone]}`}>
        <Icon size={15} />
      </div>
      <div className="text-xl font-extrabold text-foreground">{value}</div>
      <div className="text-2xs text-muted-foreground">{label}</div>
    </Card>
  );
}
