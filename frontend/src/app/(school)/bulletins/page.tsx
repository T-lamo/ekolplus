'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  AlertTriangle,
  Download,
  Eye,
  Pencil,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect } from '@/components/ui/FilterSelect';
import { SelectItem } from '@/components/ui/Select';
import { Avatar } from '@/components/ui/Avatar';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import {
  Skeleton,
  SkeletonFilters,
  SkeletonStatCards,
  SkeletonTable,
} from '@/components/ui/Skeleton';
import { exportToCsv } from '@/lib/csv-export';
import type { ClassSubjectOption } from '../pedagogie/carnet-de-notes/types';
import type { BulletinsListData, ListStudentRow } from './types';

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(1).replace('.', ',');
}
function moyColor(avg: number | null): string {
  if (avg == null) return 'var(--color-muted-foreground)';
  if (avg < 8) return 'var(--color-destructive-foreground)';
  if (avg < 12) return 'var(--color-warning-foreground)';
  return 'var(--color-success-foreground)';
}
function moyToneClass(avg: number | null): string {
  if (avg == null) return 'text-muted-foreground';
  if (avg < 8) return 'text-destructive-foreground';
  if (avg < 12) return 'text-warning-foreground';
  return 'text-success-foreground';
}

export default function BulletinsListPage() {
  const user = useUser();
  const router = useRouter();
  const [classSubjects, setClassSubjects] = useState<ClassSubjectOption[]>([]);
  const [classId, setClassId] = useState('');
  const [termId, setTermId] = useState('');
  const [data, setData] = useState<BulletinsListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;
    api<{ classSubjects: ClassSubjectOption[] }>('/api/school/class-subjects')
      .then((cs) => {
        setClassSubjects(cs.classSubjects);
        if (cs.classSubjects[0]) setClassId(cs.classSubjects[0].classId);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        setError('Impossible de charger les bulletins.');
      });
  }, [user, router]);

  useEffect(() => {
    if (!classId) return;
    const qs = termId ? `?termId=${termId}` : '';
    api<BulletinsListData>(`/api/school/classes/${classId}/bulletins${qs}`)
      .then((d) => {
        setData(d);
        setTermId(d.resolvedTermId ?? '');
      })
      .catch(() => setError('Impossible de charger les bulletins.'));
  }, [classId, termId]);

  const classes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const cs of classSubjects) seen.set(cs.classId, cs.class.name);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [classSubjects]);

  const filteredStudents = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.students;
    return data.students.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q));
  }, [data, search]);

  function exportCsv() {
    if (!data) return;
    exportToCsv(
      `bulletins-${data.className.replace(/\s+/g, '-').toLowerCase()}.csv`,
      ['Élève', 'N° élève', 'Moyenne générale', 'Rang', 'Appréciation', 'Statut'],
      data.students.map((s) => [
        `${s.firstName} ${s.lastName}`,
        s.studentNumber,
        s.average ?? '',
        s.rank ?? '',
        s.appreciation ?? '',
        s.status === 'GENERATED' ? 'Généré' : 'En attente',
      ]),
    );
  }

  if (!user || (!data && !error)) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="mt-1.5 h-3 w-56" />
          </div>
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>

        <SkeletonStatCards count={5} />

        <Card className="p-3.5">
          <SkeletonFilters />
        </Card>

        <Card className="overflow-hidden">
          <SkeletonTable rows={8} cols={5} />
        </Card>
      </div>
    );
  }
  if (error || !data) {
    return (
      <p role="alert" className="text-sm text-destructive-foreground">
        {error}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Bulletins</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Génération et suivi des bulletins — {data.className}
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground"
        >
          <Download size={14} />
          Exporter tout
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryCard
          icon={Users}
          tone="secondary"
          label="Total élèves"
          value={String(data.totalCount)}
        />
        <SummaryCard
          icon={CheckCircle2}
          tone="success"
          label="Bulletins générés"
          value={String(data.generatedCount)}
          sub={`sur ${data.totalCount} élèves`}
        />
        <SummaryCard
          icon={Clock}
          tone="warning"
          label="En attente"
          value={String(data.pendingCount)}
          sub="notes manquantes"
        />
        <SummaryCard
          icon={TrendingUp}
          tone="blue"
          label="Moyenne de classe"
          value={fmt(data.classAverage)}
        />
        <SummaryCard
          icon={AlertTriangle}
          tone="destructive"
          label="Élèves en difficulté"
          value={String(data.strugglingCount)}
          sub="moyenne < 8/20"
        />
      </div>

      <Card className="flex-row flex-wrap items-center gap-3 p-3.5">
        <SearchInput
          placeholder="Rechercher un élève..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-[260px]"
        />
        <FilterSelect value={classId} onValueChange={setClassId}>
          {classes.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </FilterSelect>
        <FilterSelect value={termId} onValueChange={setTermId}>
          {data.terms.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.label}
            </SelectItem>
          ))}
        </FilterSelect>
        <span className="ml-auto text-sm text-muted-foreground">
          {filteredStudents.length} élève{filteredStudents.length > 1 ? 's' : ''}
        </span>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <Th>Élève</Th>
                <Th>Moyenne générale</Th>
                <Th>Rang</Th>
                <Th>Appréciation</Th>
                <Th>Statut bulletin</Th>
                <Th className="w-[60px]" />
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                    Aucun élève trouvé.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s) => (
                  <StudentRow key={s.studentId} student={s} termId={data.resolvedTermId} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StudentRow({ student, termId }: { student: ListStudentRow; termId: string | null }) {
  const viewHref = `/bulletins/${student.studentId}/${termId ?? ''}`;
  const items: ActionMenuItem[] = [
    {
      label: 'Voir le bulletin',
      icon: <Eye size={13} />,
      onClick: () => (window.location.href = viewHref),
    },
    {
      label: "Modifier l'appréciation",
      icon: <Pencil size={13} />,
      onClick: () =>
        (window.location.href = `/pedagogie/appreciations/${student.studentId}/saisie?termId=${termId ?? ''}`),
    },
  ];

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <Avatar name={`${student.firstName} ${student.lastName}`} size={30} />
          <div>
            <div className="text-caption font-semibold text-foreground">
              {student.firstName} {student.lastName}
            </div>
            <div className="text-xs text-muted-foreground">#{student.studentNumber}</div>
          </div>
        </div>
      </td>
      <td className="px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-15 overflow-hidden rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full"
              style={{
                width: `${Math.min(100, ((student.average ?? 0) / 20) * 100)}%`,
                background: moyColor(student.average),
              }}
            />
          </div>
          <span className={`text-sm font-bold ${moyToneClass(student.average)}`}>
            {fmt(student.average)} / 20
          </span>
        </div>
      </td>
      <td className="px-3.5 py-2.5 text-sm font-bold text-foreground">
        {student.rank ? `${student.rank}${student.rank === 1 ? 'er' : 'ème'}` : '—'}
      </td>
      <td className="max-w-[220px] px-3.5 py-2.5">
        <span className="block truncate text-xs text-muted-foreground italic">
          {student.appreciation ?? '—'}
        </span>
      </td>
      <td className="px-3.5 py-2.5">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ${student.status === 'GENERATED' ? 'bg-success text-success-foreground' : 'bg-warning text-warning-foreground'}`}
        >
          {student.status === 'GENERATED' ? 'Généré' : 'En attente'}
        </span>
      </td>
      <td className="px-3.5 py-2.5">
        <div className="flex items-center gap-1">
          <Link
            href={viewHref}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <Eye size={14} />
          </Link>
          <ActionMenu items={items} />
        </div>
      </td>
    </tr>
  );
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase ${className}`}
    >
      {children}
    </th>
  );
}

function SummaryCard({
  icon: Icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ size?: number }>;
  tone: 'secondary' | 'success' | 'warning' | 'blue' | 'destructive';
  label: string;
  value: string;
  sub?: string;
}) {
  const iconBg: Record<string, string> = {
    secondary: 'bg-secondary text-primary',
    success: 'bg-success text-success-foreground',
    warning: 'bg-warning text-warning-foreground',
    blue: 'bg-info text-info-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
  };
  const valueColor: Record<string, string> = {
    secondary: 'text-foreground',
    success: 'text-success-foreground',
    warning: 'text-warning-foreground',
    blue: 'text-info-foreground',
    destructive: 'text-destructive-foreground',
  };
  return (
    <Card className="flex-row items-center gap-3 p-3.5">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${iconBg[tone]}`}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-2xs font-medium text-muted-foreground">{label}</div>
        <div className={`text-lg font-bold ${valueColor[tone]}`}>{value}</div>
        {sub && <div className="truncate text-2xs text-muted-foreground">{sub}</div>}
      </div>
    </Card>
  );
}
