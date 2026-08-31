'use client';

import { Calendar } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { Skeleton } from '@/components/ui/Skeleton';

interface TeacherMeYearResponse {
  academicYear: { label: string } | null;
}

// Teacher twin of topbar/AcademicYearBadge — same pill, different source:
// GET /api/school is deny-by-default for teacher-linked accounts, while
// /api/teacher/me already carries the active year (and is cached by useApi,
// so this costs nothing extra next to the dashboard's own fetch).
export function TeacherAcademicYearBadge() {
  const { data, loading } = useApi<TeacherMeYearResponse>('/api/teacher/me');

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
