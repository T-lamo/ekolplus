'use client';

import { Calendar } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { Skeleton } from '@/components/ui/Skeleton';

interface SchoolYearResponse {
  academicYear: { label: string } | null;
}

// Read-only display of the school's active academic year. Previously a
// dropdown with hardcoded mock years and no real selection behavior — the
// active year is actually set from Paramètres > Année scolaire (rollover
// flow), so a topbar selector had nothing real to switch between. This just
// reflects the one active AcademicYear row for the school.
export function AcademicYearBadge() {
  const { data, loading } = useApi<SchoolYearResponse>('/api/school');

  if (loading && !data) {
    return <Skeleton className="hidden h-10 w-28 rounded-full sm:block" />;
  }

  const label = data?.academicYear?.label;
  if (!label) return null;

  return (
    <div className="hidden h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-medium text-foreground sm:flex">
      <Calendar size={13} className="text-muted-foreground" />
      {label}
    </div>
  );
}
