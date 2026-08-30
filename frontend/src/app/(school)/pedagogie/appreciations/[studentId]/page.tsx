'use client';

import { useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Users,
  Hash,
  School,
  Calendar,
  Mail,
  FileText,
  Pencil,
  Star,
  BookOpen,
  AlertTriangle,
  BarChart2,
  UserCheck,
  History,
  Zap,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ASIDE_GRID } from '@/lib/layout';
import { LOCALE_BCP47 } from '@/lib/locales';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { fmtAverage, mentionClass } from '../format';
import type { StudentAppreciationData } from '../types';

function fmtDate(iso: string | undefined, locale: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function AppreciationDetailPage() {
  const t = useTranslations('Appreciations.detail');
  const tMention = useTranslations('Appreciations.mention');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const params = useParams<{ studentId: string }>();
  const searchParams = useSearchParams();
  const termId = searchParams.get('termId') ?? '';
  const [loadError, setLoadError] = useState<string | null>(null);
  const qs = termId ? `?termId=${termId}` : '';
  const { data } = useApi<StudentAppreciationData>(
    `/api/school/students/${params.studentId}/appreciations${qs}`,
    {
      skip: !user,
      onError: (err) => {
        setLoadError(
          err instanceof ApiError && err.status === 404 ? t('studentNotFound') : t('loadError'),
        );
        return true;
      },
    },
  );
  const error = loadError;

  async function onDelete() {
    if (!data) return;
    if (
      !(await confirm({
        message: t('deleteConfirm'),
        danger: true,
      }))
    )
      return;
    try {
      await api(
        `/api/school/students/${data.studentId}/appreciations?termId=${data.resolvedTermId}`,
        {
          method: 'DELETE',
        },
      );
      toast(t('deletedToast'), 'success');
      router.push('/pedagogie/appreciations');
    } catch {
      toast(t('deleteErrorToast'), 'error');
    }
  }

  if (!user || (!data && !error)) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/pedagogie/appreciations"
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

  const gradedSubjects = data.subjects.filter((s) => s.average != null);
  const minScore = gradedSubjects.length
    ? Math.min(...gradedSubjects.map((s) => s.average!))
    : null;
  const maxScore = gradedSubjects.length
    ? Math.max(...gradedSubjects.map((s) => s.average!))
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/pedagogie/appreciations"
        className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
      >
        <ArrowLeft size={13} />
        {t('back')}
      </Link>

      <Card className="flex-row flex-wrap items-center justify-between gap-2 p-3 px-4">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Users size={12} className="shrink-0" />
          <span className="truncate">
            {t('position', {
              index: data.studentIndex ?? '—',
              total: data.classSize,
              className: data.className,
              term: data.terms.find((term) => term.id === data.resolvedTermId)?.label ?? '',
            })}
          </span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!data.prevStudentId}
            onClick={() =>
              data.prevStudentId &&
              router.push(
                `/pedagogie/appreciations/${data.prevStudentId}?termId=${data.resolvedTermId}`,
              )
            }
            className="flex h-7 w-7 items-center justify-center rounded-md text-foreground disabled:opacity-30"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            disabled={!data.nextStudentId}
            onClick={() =>
              data.nextStudentId &&
              router.push(
                `/pedagogie/appreciations/${data.nextStudentId}?termId=${data.resolvedTermId}`,
              )
            }
            className="flex h-7 w-7 items-center justify-center rounded-md text-foreground disabled:opacity-30"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </Card>

      <Card className="flex-col items-start gap-3.5 p-4 sm:flex-row sm:items-center">
        <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
          {data.firstName[0]}
          {data.lastName[0]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold text-foreground">
            {data.firstName} {data.lastName}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Hash size={11} />
              {data.studentNumber}
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <School size={11} />
              {data.className}
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              {data.terms.find((term) => term.id === data.resolvedTermId)?.label ?? ''}
            </span>
            {data.general?.mention && (
              <>
                <span className="text-border">·</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-2xs font-bold ${mentionClass(data.general.mention)}`}
                >
                  {tMention(data.general.mention)}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {/* Both still toast placeholders ("bientôt disponible") — hidden on
              mobile so the one real action (Modifier) isn't crowded out by
              two buttons that don't do anything yet. */}
          <button
            type="button"
            onClick={() => toast(t('messagingSoon'), 'info')}
            className="hidden items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-caption font-semibold text-foreground sm:flex"
          >
            <Mail size={13} />
            {t('notifyGuardian')}
          </button>
          <button
            type="button"
            onClick={() => toast(t('reportCardsSoon'), 'info')}
            className="hidden items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-caption font-semibold text-foreground sm:flex"
          >
            <FileText size={13} />
            {t('generateReportCard')}
          </button>
          <Link
            href={`/pedagogie/appreciations/${data.studentId}/saisie?termId=${data.resolvedTermId}`}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-caption font-semibold text-primary-foreground"
          >
            <Pencil size={13} />
            {t('editAppreciation')}
          </Link>
        </div>
      </Card>

      <div className={ASIDE_GRID}>
        <div className="flex flex-col gap-4">
          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Star size={14} className="text-primary" />
              {t('generalTitle')}
            </div>
            {data.general ? (
              <>
                <div className="rounded-md bg-muted p-3.5 text-caption leading-relaxed text-foreground">
                  {data.general.text || <span className="text-muted-foreground italic">—</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {t('writtenBy')}{' '}
                    <strong className="text-foreground">{data.general.authorName ?? '—'}</strong>
                  </span>
                  <span className="text-border">·</span>
                  <span>{t('enteredOn', { date: fmtDate(data.general.createdAt, bcp47) })}</span>
                  <span className="text-border">·</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold ${data.general.status === 'PUBLISHED' ? 'bg-success text-success-foreground' : 'bg-warning text-warning-foreground'}`}
                  >
                    {data.general.status === 'PUBLISHED' ? t('statusRecorded') : t('statusDraft')}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground italic">{t('generalEmpty')}</p>
            )}
          </Card>

          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <BookOpen size={14} className="text-primary" />
              {t('bySubjectTitle')}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      {t('bySubject.subject')}
                    </th>
                    <th className="px-2 py-2 text-center text-2xs font-semibold text-muted-foreground uppercase">
                      {t('bySubject.coefficient')}
                    </th>
                    <th className="px-2 py-2 text-center text-2xs font-semibold text-muted-foreground uppercase">
                      {t('bySubject.average')}
                    </th>
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      {t('bySubject.mention')}
                    </th>
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      {t('bySubject.appreciation')}
                    </th>
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      {t('bySubject.teacher')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.subjects.map((s) => (
                    <tr key={s.classSubjectId} className="border-b border-border last:border-b-0">
                      <td className="px-2 py-2 text-caption font-semibold text-foreground">
                        {s.subjectName}
                      </td>
                      <td className="px-2 py-2 text-center text-xs text-muted-foreground">
                        {s.coefficient ?? '—'}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className="text-sm font-bold text-foreground">
                          {fmtAverage(s.average, locale)}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        {s.mention ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-2xs font-bold ${mentionClass(s.mention)}`}
                          >
                            {tMention(s.mention)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="max-w-[240px] px-2 py-2">
                        <span className="block truncate text-xs text-foreground">
                          {s.text ?? <span className="text-muted-foreground italic">—</span>}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs font-medium text-foreground">
                        {s.teacherName ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
              <span className="text-caption font-medium text-muted-foreground">
                {t('overallAverage')}
              </span>
              <span className="text-xl font-extrabold text-foreground">
                {fmtAverage(data.overallAverage, locale)} / 20
              </span>
              {data.general?.mention && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-2xs font-bold ${mentionClass(data.general.mention)}`}
                >
                  {tMention(data.general.mention)}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {t('rankLine', { rank: data.rank ?? '—', rankedCount: data.rankedCount })}
              </span>
            </div>
          </Card>

          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <AlertTriangle size={14} className="text-destructive-foreground" />
              {t('classCouncilTitle')}
            </div>
            <p className="text-sm text-muted-foreground italic">{t('classCouncilSoon')}</p>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <BarChart2 size={14} className="text-muted-foreground" />
              {t('statsTitle')}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatBox label={t('stats.average')} value={fmtAverage(data.overallAverage, locale)} />
              <StatBox
                label={t('stats.rank')}
                value={
                  data.rank
                    ? t(data.rank === 1 ? 'stats.rankValue.one' : 'stats.rankValue.other', {
                        rank: data.rank,
                      })
                    : '—'
                }
              />
              <StatBox label={t('stats.minScore')} value={fmtAverage(minScore, locale)} />
              <StatBox label={t('stats.maxScore')} value={fmtAverage(maxScore, locale)} />
            </div>
            <div className="h-px bg-border" />
            <InfoRow
              label={t('info.classAverage')}
              value={`${fmtAverage(data.classAverage, locale)} / 20`}
            />
            <InfoRow label={t('info.absences')} value="—" />
            <InfoRow label={t('info.lateArrivals')} value="—" />
            <InfoRow
              label={t('info.gradedSubjects')}
              value={`${gradedSubjects.length} / ${data.subjects.length}`}
            />
          </Card>

          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <UserCheck size={14} className="text-primary" />
              {t('homeroomTitle')}
            </div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-bold text-primary">
                {data.homeroomTeacherName?.[0] ?? '—'}
              </div>
              <div>
                <div className="text-caption font-bold text-foreground">
                  {data.homeroomTeacherName ?? t('notSet')}
                </div>
                <div className="text-xs text-muted-foreground">{data.className}</div>
              </div>
            </div>
            <div className="h-px bg-border" />
            <InfoRow label={t('info.enteredOn')} value={fmtDate(data.general?.createdAt, bcp47)} />
            <InfoRow
              label={t('info.lastModified')}
              value={fmtDate(data.general?.updatedAt, bcp47)}
            />
          </Card>

          <Card className="gap-2.5 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <History size={14} className="text-muted-foreground" />
              {t('historyTitle')}
            </div>
            <p className="text-xs text-muted-foreground italic">{t('auditHistorySoon')}</p>
          </Card>

          <Card className="gap-1 p-2">
            <div className="flex items-center gap-2 px-2 pt-2 text-sm font-bold text-foreground">
              <Zap size={14} className="text-muted-foreground" />
              {t('quickActionsTitle')}
            </div>
            <button
              type="button"
              onClick={() => toast(t('reportCardsSoon'), 'info')}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-caption font-medium text-foreground hover:bg-muted"
            >
              <FileText size={14} className="text-muted-foreground" />
              {t('generateReportCardPdf')}
            </button>
            <button
              type="button"
              onClick={() => toast(t('messagingSoon'), 'info')}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-caption font-medium text-foreground hover:bg-muted"
            >
              <Mail size={14} className="text-muted-foreground" />
              {t('sendToGuardian')}
            </button>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-caption font-medium text-destructive-foreground hover:bg-destructive"
            >
              <Trash2 size={14} />
              {t('deleteAppreciation')}
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted p-2.5 text-center">
      <div className="text-lg font-extrabold text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-caption">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
