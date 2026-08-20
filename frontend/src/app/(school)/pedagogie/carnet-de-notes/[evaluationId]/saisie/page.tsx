'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Check,
  Save,
  Upload,
  UserX,
  Eraser,
  Users,
  BarChart2,
  TrendingUp,
  TrendingDown,
  Pencil,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { PageNumbers } from '@/components/ui/Pager';
import { LIST_PAGE, STICKY_THEAD, TABLE_SCROLL } from '@/lib/layout';
import { submitOrQueue } from '@/lib/offline-queue';
import { OFFLINE_SYNC } from '@/lib/constants';

interface EvaluationDetail {
  id: string;
  label: string;
  type: string;
  maxScore: number;
  coefficient: number;
  countsTowardAverage: boolean;
  status: 'DRAFT' | 'PUBLISHED';
  date: string | null;
  classSubjectId: string;
  termId: string;
  classSubject: {
    class: { id: string; name: string };
    subject: { id: string; name: string };
    teacher: { id: string; name: string } | null;
  };
  term: { id: string; label: string };
}

interface NotebookStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  grades: { evaluationId: string; score: number | null; absent: boolean; comment: string | null }[];
}

interface NotebookResponse {
  evaluations: { id: string; coefficient: number; status: string; countsTowardAverage: boolean }[];
  students: NotebookStudent[];
}

interface RowState {
  score: string;
  absent: boolean;
  comment: string;
}

const PAGE_SIZE = 20;

function tone(avg: number | null): 'excellent' | 'good' | 'average' | 'poor' | 'neutral' {
  if (avg == null) return 'neutral';
  if (avg < 8) return 'poor';
  if (avg < 12) return 'average';
  if (avg < 16) return 'good';
  return 'excellent';
}
const PILL_CLASS: Record<string, string> = {
  excellent: 'bg-success text-success-foreground',
  good: 'bg-info text-info-foreground',
  average: 'bg-warning text-warning-foreground',
  poor: 'bg-destructive text-destructive-foreground',
  neutral: 'bg-muted text-muted-foreground',
};

export default function GradeEntryPage() {
  const t = useTranslations('Gradebook.saisie');
  const tStatus = useTranslations('Gradebook.evaluationStatus');
  const tCommon = useTranslations('Common');
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const params = useParams<{ evaluationId: string }>();
  const [evaluation, setEvaluation] = useState<EvaluationDetail | null>(null);
  const [notebook, setNotebook] = useState<NotebookResponse | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!user) return;
    api<{ evaluation: EvaluationDetail }>(`/api/school/evaluations/${params.evaluationId}`)
      .then((res) => {
        setEvaluation(res.evaluation);
        return api<NotebookResponse>(
          `/api/school/class-subjects/${res.evaluation.classSubjectId}/notebook?termId=${res.evaluation.termId}`,
        );
      })
      .then((nb) => {
        setNotebook(nb);
        const initial: Record<string, RowState> = {};
        for (const s of nb.students) {
          const cell = s.grades.find((g) => g.evaluationId === params.evaluationId);
          initial[s.studentId] = {
            score: cell?.score != null ? String(cell.score) : '',
            absent: cell?.absent ?? false,
            comment: cell?.comment ?? '',
          };
        }
        setRows(initial);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setError(t('notFound'));
          return;
        }
        setError(t('loadError'));
      });
  }, [user, params.evaluationId, t]);

  function previewAverage(studentId: string): number | null {
    if (!notebook || !evaluation) return null;
    const student = notebook.students.find((s) => s.studentId === studentId);
    if (!student) return null;
    const row = rows[studentId];
    const rowsForAvg: { value: number; weight: number }[] = [];
    for (const ev of notebook.evaluations) {
      if (ev.id === evaluation.id) {
        if (row && !row.absent && row.score.trim() !== '' && !Number.isNaN(Number(row.score))) {
          rowsForAvg.push({ value: Number(row.score), weight: ev.coefficient });
        }
        continue;
      }
      if (ev.status !== 'PUBLISHED' || !ev.countsTowardAverage) continue;
      const cell = student.grades.find((g) => g.evaluationId === ev.id);
      if (cell && !cell.absent && cell.score != null)
        rowsForAvg.push({ value: cell.score, weight: ev.coefficient });
    }
    if (rowsForAvg.length === 0) return null;
    const totalWeight = rowsForAvg.reduce((a, r) => a + r.weight, 0);
    return (
      Math.round((rowsForAvg.reduce((a, r) => a + r.value * r.weight, 0) / totalWeight) * 10) / 10
    );
  }

  const stats = useMemo(() => {
    const values = Object.values(rows);
    const scored = values.filter(
      (r) => !r.absent && r.score.trim() !== '' && !Number.isNaN(Number(r.score)),
    );
    const nums = scored.map((r) => Number(r.score));
    const absents = values.filter((r) => r.absent).length;
    return {
      noted: scored.length,
      total: values.length,
      avg: nums.length
        ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
        : null,
      max: nums.length ? Math.max(...nums) : null,
      min: nums.length ? Math.min(...nums) : null,
      absents,
      pending: values.length - scored.length - absents,
    };
  }, [rows]);

  // The server rejects a score above evaluation.maxScore outright (it
  // would corrupt every average computed from it) — mirror that here so
  // "Enregistrer"/"Valider" are disabled instead of firing a request that
  // will 400, and the teacher sees why before they click.
  const hasInvalidScore = useMemo(() => {
    if (!evaluation) return false;
    return Object.values(rows).some((r) => {
      if (r.absent || r.score.trim() === '') return false;
      const num = Number(r.score);
      return Number.isNaN(num) || num > evaluation.maxScore || num < 0;
    });
  }, [rows, evaluation]);

  function setRow(studentId: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [studentId]: { ...prev[studentId]!, ...patch } }));
  }

  function markAllAbsent() {
    setRows((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next))
        next[id] = { score: '', absent: true, comment: next[id]!.comment };
      return next;
    });
  }
  function clearAll() {
    setRows((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) next[id] = { score: '', absent: false, comment: '' };
      return next;
    });
  }

  async function save(publish: boolean) {
    if (!evaluation || !notebook || !user) return;
    setSaving(true);
    setError(null);
    try {
      const grades = notebook.students.map((s) => {
        const r = rows[s.studentId]!;
        return {
          studentId: s.studentId,
          score: r.absent || r.score.trim() === '' ? null : Number(r.score),
          absent: r.absent,
          comment: r.comment.trim() || null,
        };
      });
      const gradesResult = await submitOrQueue(
        {
          path: `/api/school/evaluations/${evaluation.id}/grades`,
          method: 'PUT',
          body: { grades },
          label: `Notes — ${evaluation.classSubject.subject.name}`,
        },
        user.id,
      );
      let queued = gradesResult.queued;
      if (publish) {
        const publishResult = await submitOrQueue(
          {
            path: `/api/school/evaluations/${evaluation.id}`,
            method: 'PATCH' as const,
            body: { status: 'PUBLISHED' },
            label: `Validation — ${evaluation.classSubject.subject.name}`,
          },
          user.id,
        );
        queued = queued || publishResult.queued;
      }
      if (queued) {
        toast(OFFLINE_SYNC.queuedToast, 'info');
      } else if (publish) {
        toast(t('validatedToast'), 'success');
      } else {
        toast(t('draftSavedToast'), 'success');
      }
      if (publish) {
        router.push('/pedagogie/carnet-de-notes');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSaving(false);
    }
  }

  if (!user || (!evaluation && !error)) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }
  if (error || !evaluation || !notebook) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/pedagogie/carnet-de-notes"
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          {t('back')}
        </Link>
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(notebook.students.length / PAGE_SIZE));
  const pageStudents = notebook.students.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className={`${LIST_PAGE} gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/pedagogie/carnet-de-notes"
            className="mb-1 flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
          >
            <ArrowLeft size={14} />
            {t('back')}
          </Link>
          <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => toast(t('importCsvToast'), 'info')}
          >
            <Upload size={14} />
            {t('importCsv')}
          </Button>
          <Link
            href={`/pedagogie/carnet-de-notes/${evaluation.id}/edit`}
            className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground"
          >
            <Pencil size={14} />
            {t('edit')}
          </Link>
        </div>
      </div>

      <Card className="flex-row flex-wrap items-center gap-2 p-3.5">
        <Badge>{evaluation.classSubject.class.name}</Badge>
        <Badge>{evaluation.classSubject.subject.name}</Badge>
        <Badge muted>{evaluation.term.label}</Badge>
        <Badge muted>{evaluation.label}</Badge>
        <Badge muted>{t('coefficientBadge', { n: evaluation.coefficient })}</Badge>
        <Badge muted>{t('outOfBadge', { n: evaluation.maxScore })}</Badge>
        {evaluation.status === 'DRAFT' && <Badge warning>{tStatus('DRAFT')}</Badge>}
      </Card>

      <Card className="gap-0 overflow-visible">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-foreground">
              {t('tableTitle', { className: evaluation.classSubject.class.name })}
            </span>
            <Badge muted small>
              {t('studentsBadge', { count: stats.total })}
            </Badge>
            <Badge success small>
              {t('gradedBadge', { count: stats.noted })}
            </Badge>
            {stats.pending > 0 && (
              <Badge warning small>
                {t('pendingBadge', { count: stats.pending })}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={markAllAbsent}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground"
            >
              <UserX size={12} />
              {t('markAllAbsent')}
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground"
            >
              <Eraser size={12} />
              {t('clearAll')}
            </button>
          </div>
        </div>

        <div className={TABLE_SCROLL}>
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className={STICKY_THEAD}>
              <tr className="border-b border-border">
                <th className="w-9 py-2.5 pl-4 text-left text-2xs font-semibold text-muted-foreground">
                  {t('colNumber')}
                </th>
                <th className="py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t('colStudent')}
                </th>
                <th className="px-3 py-2.5 text-center text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t('colScore', { n: evaluation.maxScore })}
                </th>
                <th className="px-3 py-2.5 text-center text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t('colAbsent')}
                </th>
                <th className="px-3 py-2.5 text-center text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t('colAveragePreview')}
                </th>
                <th className="px-3 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t('colComment')}
                </th>
              </tr>
            </thead>
            <tbody>
              {pageStudents.map((s, i) => {
                const row = rows[s.studentId] ?? { score: '', absent: false, comment: '' };
                const num = Number(row.score);
                const invalid =
                  row.score.trim() !== '' && (Number.isNaN(num) || num > evaluation.maxScore);
                const preview = previewAverage(s.studentId);
                return (
                  <tr key={s.studentId} className="border-b border-border last:border-b-0">
                    <td className="py-2.5 pl-4 text-xs font-semibold text-muted-foreground">
                      {(page - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={`${s.firstName} ${s.lastName}`} size={28} />
                        <div>
                          <div
                            className={`text-caption font-semibold ${row.absent ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                          >
                            {s.firstName} {s.lastName}
                          </div>
                          <div className="text-2xs text-muted-foreground">#{s.studentNumber}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {row.absent ? (
                        <span className="inline-flex h-8 w-16 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                          {t('absentBadge')}
                        </span>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <input
                            value={row.score}
                            onChange={(e) => setRow(s.studentId, { score: e.target.value })}
                            inputMode="decimal"
                            className={`h-8 w-16 rounded-md border-[1.5px] text-center text-sm font-semibold outline-none ${
                              invalid
                                ? 'border-destructive-foreground bg-destructive text-destructive-foreground'
                                : 'border-border bg-input text-foreground focus:border-primary'
                            }`}
                          />
                          {invalid && (
                            <span className="text-[10px] font-semibold text-destructive-foreground">
                              {t('maxScoreHint', { n: evaluation.maxScore })}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => setRow(s.studentId, { absent: !row.absent, score: '' })}
                        aria-label={t('markAbsentAriaLabel')}
                        aria-pressed={row.absent}
                        className={`mx-auto flex h-6.5 w-6.5 items-center justify-center rounded-md ${row.absent ? 'bg-destructive text-destructive-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                      >
                        <UserX size={14} />
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className={`inline-flex min-w-13 items-center justify-center rounded-md px-2 py-1 text-xs font-bold ${PILL_CLASS[tone(preview)]}`}
                      >
                        {preview != null ? preview.toFixed(1) : '—'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <input
                        value={row.comment}
                        onChange={(e) => setRow(s.studentId, { comment: e.target.value })}
                        placeholder={t('commentPlaceholder')}
                        className="w-full min-w-[160px] rounded-md border border-border bg-input px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-border focus:border-primary"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-border bg-muted px-4 py-3">
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Users size={13} />
              {t('notedStat')}{' '}
              <strong className="text-foreground">
                {stats.noted} / {stats.total}
              </strong>
            </span>
            <span className="flex items-center gap-1.5">
              <BarChart2 size={13} />
              {t('provisionalAvgStat')}{' '}
              <strong className="text-primary">
                {stats.avg != null ? stats.avg.toFixed(1) : '—'} / {evaluation.maxScore}
              </strong>
            </span>
            <span className="flex items-center gap-1.5">
              <TrendingUp size={13} />
              {t('maxStat')} <strong className="text-success-foreground">{stats.max ?? '—'}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <TrendingDown size={13} />
              {t('minStat')}{' '}
              <strong className="text-destructive-foreground">{stats.min ?? '—'}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <UserX size={13} />
              {t('absentsStat')} <strong className="text-foreground">{stats.absents}</strong>
            </span>
          </div>
          {pageCount > 1 && (
            <div className="flex items-center gap-1">
              <PageNumbers page={page} totalPages={pageCount} onChange={setPage} />
            </div>
          )}
        </div>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      <Card className="flex-row flex-wrap items-center justify-between gap-2 p-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${hasInvalidScore ? 'bg-destructive-foreground' : 'bg-warning-foreground'}`}
          />
          <span className="text-caption text-muted-foreground">
            {hasInvalidScore ? (
              <strong className="text-destructive-foreground">
                {t('fixInvalidScores', { n: evaluation.maxScore })}
              </strong>
            ) : stats.pending > 0 ? (
              <>
                {t('unsavedChanges')}{' '}
                <strong className="text-foreground">
                  {t('pendingEntry', { count: stats.pending })}
                </strong>
              </>
            ) : (
              t('allGraded')
            )}
          </span>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button
            variant="ghost"
            className="w-fit"
            onClick={() => router.push('/pedagogie/carnet-de-notes')}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => save(false)}
            loading={saving}
            disabled={hasInvalidScore}
          >
            <Save size={14} />
            {t('saveDraft')}
          </Button>
          <Button
            className="w-fit"
            onClick={() => save(true)}
            loading={saving}
            disabled={hasInvalidScore}
          >
            <Check size={14} />
            {t('validate')}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Badge({
  children,
  muted,
  warning,
  success,
  small,
}: {
  children: ReactNode;
  muted?: boolean;
  warning?: boolean;
  success?: boolean;
  small?: boolean;
}) {
  const cls = warning
    ? 'bg-warning text-warning-foreground'
    : success
      ? 'bg-success text-success-foreground'
      : muted
        ? 'bg-muted text-muted-foreground'
        : 'bg-secondary text-primary';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${small ? 'text-2xs' : 'text-xs'} ${cls}`}
    >
      {children}
    </span>
  );
}
