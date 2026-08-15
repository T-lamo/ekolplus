'use client';

import { useEffect, useState } from 'react';
import { CalendarCheck, CalendarX, Clock, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Skeleton, SkeletonTable } from '@/components/ui/Skeleton';
import type { AttendanceStatus, StudentAttendanceResponse } from '../../pedagogie/presences/types';

const STATUS_META: Record<AttendanceStatus, { label: string; bg: string; fg: string }> = {
  PRESENT: { label: 'Présent', bg: 'bg-success', fg: 'text-success-foreground' },
  ABSENT: { label: 'Absent', bg: 'bg-destructive', fg: 'text-destructive-foreground' },
  LATE: { label: 'Retard', bg: 'bg-warning', fg: 'text-warning-foreground' },
  EXCUSED: { label: 'Justifié', bg: 'bg-info', fg: 'text-info-foreground' },
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function PresencesTab({ studentId }: { studentId: string }) {
  const [termId, setTermId] = useState('');
  const [data, setData] = useState<StudentAttendanceResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = termId ? `?termId=${termId}` : '';
    api<StudentAttendanceResponse>(`/api/school/students/${studentId}/attendance${qs}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setTermId(d.resolvedTermId ?? '');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [studentId, termId]);

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
        <span className="text-xs font-semibold text-muted-foreground">Filtrer par :</span>
        <FilterSelect value={termId} onValueChange={setTermId}>
          {data.terms.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.label}
            </SelectItem>
          ))}
        </FilterSelect>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AttendanceStat
          icon={CalendarCheck}
          tone="success"
          label="Taux de présence"
          value={data.ratePercent != null ? `${data.ratePercent}%` : '—'}
        />
        <AttendanceStat
          icon={CalendarX}
          tone="destructive"
          label="Absences"
          value={String(data.absences)}
        />
        <AttendanceStat
          icon={Clock}
          tone="warning"
          label="Retards"
          value={String(data.summary.late)}
        />
        <AttendanceStat
          icon={ShieldCheck}
          tone="blue"
          label="Justifiées"
          value={String(data.summary.excused)}
        />
      </div>

      <Card className="gap-3 p-4.5">
        <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
          <CalendarCheck size={14} className="text-primary" />
          Journal de présence
        </div>
        {sortedDays.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucune présence enregistrée pour cette période.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                    Date
                  </th>
                  <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                    Statut
                  </th>
                  <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                    Justification
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedDays.map((d) => {
                  const meta = STATUS_META[d.status];
                  return (
                    <tr key={d.date} className="border-b border-border last:border-b-0">
                      <td className="px-2 py-2.5 text-caption font-medium text-foreground capitalize">
                        {fmtDate(d.date)}
                      </td>
                      <td className="px-2 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-2xs font-bold ${meta.bg} ${meta.fg}`}
                        >
                          {meta.label}
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
