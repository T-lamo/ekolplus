import { Card } from '@/components/ui/Card';
import { DASHBOARD } from '@/lib/constants';
import type { DashboardData } from './types';

const t = DASHBOARD.subjectPerformance;

export function SubjectPerformanceCard({
  subjects,
}: {
  subjects: DashboardData['subjectPerformance'];
}) {
  return (
    <Card className="gap-3 p-4 sm:p-5">
      <div>
        <div className="text-caption font-semibold text-foreground">{t.title}</div>
        <div className="text-2xs text-muted-foreground">{t.subtitle}</div>
      </div>
      {subjects.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune note publiée sur la période.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {subjects.map((s) => (
            <div key={s.subjectId} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground">{s.name}</span>
                <span className="text-xs font-semibold text-foreground">
                  {s.average != null ? s.average : '—'}{' '}
                  <span className="font-normal text-muted-foreground">/20</span>
                </span>
              </div>
              <div className="h-[5px] overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${s.average != null ? (s.average / 20) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
