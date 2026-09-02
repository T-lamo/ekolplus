'use client';

// Saisie des appréciations, côté enseignant — the school wizard retargeted
// at the teacher surface: same mention buttons, general form and
// per-subject rows, but data and writes go through
// /api/teacher/students/[id]/appreciations (ownership enforced
// server-side), the general card renders only when I homeroom the class,
// the roster comes from the same response (no second fetch), and saves are
// plain api() calls — the offline queue is deliberately not used on the
// teacher portal (spec: online-first).
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Save,
  Check,
  Settings2,
  User,
  Star,
  BookOpen,
  BarChart2,
  Zap,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useApi, getCache } from '@/lib/useApi';
import { ASIDE_GRID } from '@/lib/layout';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, SelectItem } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { fmtAverage } from '@/app/(school)/pedagogie/appreciations/format';
import { MENTIONS } from '@/app/(school)/pedagogie/appreciations/types';
import type { Mention } from '@/app/(school)/pedagogie/appreciations/types';
import type { TeacherStudentAppreciationData } from '../types';

const MENTION_BTN_CLASS: Record<Mention, string> = {
  TRES_BIEN: 'border-success bg-success text-success-foreground',
  BIEN: 'border-[#2563eb] bg-info text-info-foreground',
  ASSEZ_BIEN: 'border-warning-foreground bg-warning text-warning-foreground',
  PASSABLE: 'border-border bg-muted text-muted-foreground',
  INSUFFISANT: 'border-destructive-foreground bg-destructive text-destructive-foreground',
  FAIBLE: 'border-destructive-foreground bg-destructive text-destructive-foreground',
};

// `value` is what gets PERSISTED (the API stores these three fields as free
// text and hands them straight back to the <Select>), so it stays the exact
// French string it has always been — renaming it to the enum-ish `key` would
// orphan every appreciation already saved. `key` is only the translation
// lookup, same dynamic-key pattern as Gradebook.evaluationType.
const COMPORTEMENT_OPTIONS = [
  { value: 'Excellent', key: 'EXCELLENT' },
  { value: 'Satisfaisant', key: 'SATISFAISANT' },
  { value: 'À améliorer', key: 'A_AMELIORER' },
  { value: 'Perturbateur', key: 'PERTURBATEUR' },
] as const;
const INVESTISSEMENT_OPTIONS = [
  { value: 'Excellent', key: 'EXCELLENT' },
  { value: 'Satisfaisant', key: 'SATISFAISANT' },
  { value: 'À améliorer', key: 'A_AMELIORER' },
  { value: 'Insuffisant', key: 'INSUFFISANT' },
] as const;
const ASSIDUITE_OPTIONS = [
  { value: 'Régulier', key: 'REGULIER' },
  { value: 'Irrégulier', key: 'IRREGULIER' },
  { value: 'Absences répétées', key: 'ABSENCES_REPETEES' },
] as const;

const QUICK_PHRASE_KEYS = [
  'serious',
  'efforts',
  'insufficient',
  'satisfactory',
  'exemplary',
  'regularity',
] as const;

const COMMENT_MAX = 500;

function suggestMention(avg: number | null): Mention | null {
  if (avg == null) return null;
  if (avg < 8) return 'FAIBLE';
  if (avg < 10) return 'INSUFFISANT';
  if (avg < 11) return 'PASSABLE';
  if (avg < 12) return 'ASSEZ_BIEN';
  if (avg < 14) return 'BIEN';
  return 'TRES_BIEN';
}

interface SubjectRowState {
  text: string;
}

export default function TeacherSaisirAppreciationPage() {
  const t = useTranslations('Appreciations.saisie');
  const tMention = useTranslations('Appreciations.mention');
  const tComportement = useTranslations('Appreciations.saisie.comportement');
  const tInvestissement = useTranslations('Appreciations.saisie.investissement');
  const tAssiduite = useTranslations('Appreciations.saisie.assiduite');
  const tPhrases = useTranslations('Appreciations.saisie.quickPhrases');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const params = useParams<{ studentId: string }>();
  const searchParams = useSearchParams();

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [termId, setTermId] = useState(searchParams.get('termId') ?? '');

  const [mention, setMention] = useState<Mention | null>(null);
  const [text, setText] = useState('');
  const [comportement, setComportement] = useState('');
  const [investissement, setInvestissement] = useState('');
  const [assiduite, setAssiduite] = useState('');
  const [subjectRows, setSubjectRows] = useState<Record<string, SubjectRowState>>({});

  const dataQs = termId ? `?termId=${termId}` : '';
  const dataPath = `/api/teacher/students/${params.studentId}/appreciations${dataQs}`;
  const { data } = useApi<TeacherStudentAppreciationData>(dataPath, {
    skip: !user,
    onError: (err) => {
      setError(
        err instanceof ApiError && err.status === 404 ? t('studentNotFound') : t('loadError'),
      );
      return true;
    },
  });

  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (data && getCache(dataPath) === data && seededRef.current !== dataPath) {
      seededRef.current = dataPath;
      setTermId(data.resolvedTermId ?? '');
      setMention(data.general?.mention ?? suggestMention(data.overallAverage));
      setText(data.general?.text ?? '');
      setComportement(data.general?.comportement ?? '');
      setInvestissement(data.general?.investissement ?? '');
      setAssiduite(data.general?.assiduite ?? '');
      const rows: Record<string, SubjectRowState> = {};
      for (const s of data.subjects) rows[s.subjectId] = { text: s.text ?? '' };
      setSubjectRows(rows);
    }
  }, [data, dataPath]);

  const filledSubjects = useMemo(
    () => Object.values(subjectRows).filter((r) => r.text.trim() !== '').length,
    [subjectRows],
  );

  async function save(publish: boolean) {
    if (!data || !user) return;
    setSaving(true);
    setError(null);
    const status = publish ? 'PUBLISHED' : 'DRAFT';
    try {
      if (data.isMyHomeroom) {
        await api(`/api/teacher/students/${data.studentId}/appreciations`, {
          method: 'PUT',
          body: {
            termId: data.resolvedTermId,
            subjectId: null,
            mention,
            text,
            comportement,
            investissement,
            assiduite,
            status,
          },
        });
      }
      await Promise.all(
        data.subjects
          .filter((s) => (subjectRows[s.subjectId]?.text ?? '').trim() !== '')
          .map((s) =>
            api(`/api/teacher/students/${data.studentId}/appreciations`, {
              method: 'PUT',
              body: {
                termId: data.resolvedTermId,
                subjectId: s.subjectId,
                text: subjectRows[s.subjectId]!.text,
                mention: suggestMention(s.average),
                status,
              },
            }),
          ),
      );
      toast(publish ? t('validatedToast') : t('draftSavedToast'), 'success');
      if (publish) {
        if (data.nextStudentId) {
          router.push(
            `/espace-enseignant/appreciations/${data.nextStudentId}?termId=${data.resolvedTermId}`,
          );
        } else {
          router.push('/espace-enseignant/appreciations');
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSaving(false);
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
          href="/espace-enseignant/appreciations"
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          {t('backToList')}
        </Link>
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      </div>
    );
  }

  const currentTermLabel = data.terms.find((term) => term.id === data.resolvedTermId)?.label ?? '';
  const prevName = data.classmates.find((s) => s.studentId === data.prevStudentId);
  const nextName = data.classmates.find((s) => s.studentId === data.nextStudentId);
  const saisieCount = data.classmates.filter((s) => s.saisieStatus === 'PUBLISHED').length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">
            {currentTermLabel} — {data.className}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/espace-enseignant/appreciations"
            className="flex w-fit items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold text-muted-foreground"
          >
            <ArrowLeft size={14} />
            {t('backToList')}
          </Link>
          <Button
            variant="ghost"
            className="w-fit border border-border"
            onClick={() => save(false)}
            loading={saving}
          >
            <Save size={14} />
            {t('saveDraft')}
          </Button>
          <Button className="w-fit" onClick={() => save(true)} loading={saving}>
            <Check size={14} />
            {t('validate')}
          </Button>
        </div>
      </div>

      {data.classSize > 0 && (
        <Card className="flex-row items-center gap-3 p-3.5">
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {t('classProgress')}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${data.classSize ? (saisieCount / data.classSize) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="text-xs font-bold whitespace-nowrap text-primary">
            {t(data.classSize > 1 ? 'progressCount.other' : 'progressCount.one', {
              count: saisieCount,
              total: data.classSize,
            })}
          </span>
        </Card>
      )}

      <div className={ASIDE_GRID}>
        <div className="flex flex-col gap-4">
          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Settings2 size={14} className="text-primary" />
              {t('contextTitle')}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="mb-1 text-xs font-semibold text-foreground">{t('classLabel')}</div>
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
                  {data.className}
                </div>
              </div>
              <Select label={t('termLabel')} value={termId} onValueChange={setTermId}>
                {data.terms.map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.label}
                  </SelectItem>
                ))}
              </Select>
              <div>
                <div className="mb-1 text-xs font-semibold text-foreground">
                  {t('studentLabel')}
                </div>
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
                  {data.studentIndex} / {data.classSize}
                </div>
              </div>
            </div>
          </Card>

          <Card className="gap-3 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <User size={14} className="text-primary" />
                {t('selectedStudent')}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!data.prevStudentId}
                  onClick={() =>
                    data.prevStudentId &&
                    router.push(
                      `/espace-enseignant/appreciations/${data.prevStudentId}?termId=${data.resolvedTermId}`,
                    )
                  }
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground disabled:opacity-40"
                >
                  <ChevronLeft size={13} />
                  {t('previous')}
                </button>
                <button
                  type="button"
                  disabled={!data.nextStudentId}
                  onClick={() =>
                    data.nextStudentId &&
                    router.push(
                      `/espace-enseignant/appreciations/${data.nextStudentId}?termId=${data.resolvedTermId}`,
                    )
                  }
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground disabled:opacity-40"
                >
                  {t('next')}
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3.5 rounded-md bg-secondary p-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {data.firstName[0]}
                {data.lastName[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-foreground">
                  {data.firstName} {data.lastName}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('studentMeta', { number: data.studentNumber, className: data.className })}
                  {data.rank
                    ? ` · ${t(data.rank === 1 ? 'provisionalRank.one' : 'provisionalRank.other', {
                        rank: data.rank,
                      })}`
                    : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="mb-0.5 text-2xs text-muted-foreground">{t('overallAverage')}</div>
                <div className="text-xl font-extrabold text-foreground">
                  {fmtAverage(data.overallAverage, locale)}
                </div>
                <div className="text-2xs text-muted-foreground">/20</div>
              </div>
            </div>

            {data.classmates.length > 1 && (
              <div className="max-h-[180px] overflow-y-auto rounded-md border border-border">
                {data.classmates.map((s) => (
                  <button
                    key={s.studentId}
                    type="button"
                    onClick={() =>
                      router.push(
                        `/espace-enseignant/appreciations/${s.studentId}?termId=${data.resolvedTermId}`,
                      )
                    }
                    className={`flex w-full items-center gap-2.5 border-b border-border px-3 py-2 text-left last:border-b-0 ${s.studentId === data.studentId ? 'bg-secondary' : 'hover:bg-muted'}`}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground">
                      {s.firstName[0]}
                      {s.lastName[0]}
                    </span>
                    <span
                      className={`flex-1 truncate text-caption ${s.studentId === data.studentId ? 'font-semibold text-primary' : 'text-foreground'}`}
                    >
                      {s.firstName} {s.lastName}
                    </span>
                    {s.saisieStatus === 'PUBLISHED' ? (
                      <CheckCircle2 size={13} className="text-success-foreground" />
                    ) : (
                      <Clock size={13} className="text-warning-foreground" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </Card>

          {data.isMyHomeroom && (
            <Card className="gap-3 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Star size={14} className="text-primary" />
                {t('generalTitle')}
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold text-foreground">
                  {t('mentionLabel')}
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {MENTIONS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMention(m)}
                      className={`rounded-md border-2 px-2 py-2 text-center text-xs font-bold ${mention === m ? MENTION_BTN_CLASS[m] : 'border-border bg-card text-muted-foreground'}`}
                    >
                      {tMention(m)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-px bg-border" />

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    {t('commentLabel')}{' '}
                    <span className="font-normal text-muted-foreground">{t('commentHint')}</span>
                  </span>
                  <span className="text-2xs text-muted-foreground">
                    {t('charCount', { count: text.length, max: COMMENT_MAX })}
                  </span>
                </div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, COMMENT_MAX))}
                  rows={4}
                  placeholder={t('commentPlaceholder')}
                  className="w-full rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/10"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Select
                  label={t('comportementLabel')}
                  value={comportement}
                  onValueChange={setComportement}
                >
                  <SelectItem value="">—</SelectItem>
                  {COMPORTEMENT_OPTIONS.map((o) => (
                    <SelectItem key={o.key} value={o.value}>
                      {tComportement(o.key)}
                    </SelectItem>
                  ))}
                </Select>
                <Select
                  label={t('investissementLabel')}
                  value={investissement}
                  onValueChange={setInvestissement}
                >
                  <SelectItem value="">—</SelectItem>
                  {INVESTISSEMENT_OPTIONS.map((o) => (
                    <SelectItem key={o.key} value={o.value}>
                      {tInvestissement(o.key)}
                    </SelectItem>
                  ))}
                </Select>
                <Select label={t('assiduiteLabel')} value={assiduite} onValueChange={setAssiduite}>
                  <SelectItem value="">—</SelectItem>
                  {ASSIDUITE_OPTIONS.map((o) => (
                    <SelectItem key={o.key} value={o.value}>
                      {tAssiduite(o.key)}
                    </SelectItem>
                  ))}
                </Select>
              </div>
            </Card>
          )}

          <Card className="gap-3 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <BookOpen size={14} className="text-primary" />
                {t('bySubjectTitle')}
              </div>
              <span className="text-xs text-muted-foreground">
                {t(data.subjects.length > 1 ? 'subjectsCount.other' : 'subjectsCount.one', {
                  count: data.subjects.length,
                  filled: filledSubjects,
                })}
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {data.subjects.map((s) => (
                <div
                  key={s.classSubjectId}
                  className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[140px_60px_70px_1fr] sm:items-start sm:gap-2.5"
                >
                  {/* `sm:contents` drops this wrapper from layout at `sm` and
                      up so the 3 fields resume their place as direct grid
                      columns — below that the fixed 140/60/70px columns
                      would leave the comment column ~40px wide, so they
                      become one row above the full-width textarea instead. */}
                  <div className="flex items-center gap-2 sm:contents">
                    <span className="text-caption font-semibold text-foreground sm:pt-2">
                      {s.subjectName}
                    </span>
                    <span className="text-xs text-muted-foreground sm:pt-2">
                      × {s.coefficient ?? 1}
                    </span>
                    <span className="sm:pt-1.5">
                      <span className="inline-flex min-w-[44px] items-center justify-center rounded-md bg-muted px-2 py-1 text-xs font-bold text-foreground">
                        {fmtAverage(s.average, locale)}
                      </span>
                    </span>
                  </div>
                  <textarea
                    value={subjectRows[s.subjectId]?.text ?? ''}
                    onChange={(e) =>
                      setSubjectRows((prev) => ({
                        ...prev,
                        [s.subjectId]: { text: e.target.value.slice(0, 300) },
                      }))
                    }
                    rows={2}
                    placeholder={t('subjectPlaceholder')}
                    className="w-full rounded-md border border-border bg-input px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground placeholder:italic focus:border-primary"
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex-row flex-wrap items-center justify-between gap-2 p-3.5">
            {prevName ? (
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/espace-enseignant/appreciations/${prevName.studentId}?termId=${data.resolvedTermId}`,
                  )
                }
                className="flex min-w-0 max-w-full items-center gap-1.5 text-sm font-medium text-muted-foreground"
              >
                <ArrowLeft size={14} className="shrink-0" />
                <span className="truncate">
                  {t('prevStudent', { name: `${prevName.firstName} ${prevName.lastName}` })}
                </span>
              </button>
            ) : (
              <span />
            )}
            {/* Order-first on mobile: the real save actions outrank the
                prev/next nav, which wraps below them instead of squeezing
                the row. */}
            <div className="order-first flex w-full flex-wrap items-center gap-2 sm:order-none sm:w-auto">
              <Button
                variant="ghost"
                className="w-fit border border-border"
                onClick={() => save(false)}
                loading={saving}
              >
                <Save size={14} />
                {t('saveDraft')}
              </Button>
              <Button className="w-fit" onClick={() => save(true)} loading={saving}>
                <Check size={14} />
                {t('validateAndNext')}
              </Button>
            </div>
            {nextName ? (
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/espace-enseignant/appreciations/${nextName.studentId}?termId=${data.resolvedTermId}`,
                  )
                }
                className="flex min-w-0 max-w-full items-center gap-1.5 text-sm font-medium text-muted-foreground"
              >
                <span className="truncate">
                  {t('nextStudent', { name: `${nextName.firstName} ${nextName.lastName}` })}
                </span>
                <ArrowRight size={14} className="shrink-0" />
              </button>
            ) : (
              <span />
            )}
          </Card>

          {error && (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <BarChart2 size={14} className="text-primary" />
              {t('summaryTitle')}
            </div>
            <div className="flex flex-col items-center gap-1.5 text-center">
              <div className="flex h-13 w-13 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">
                {data.firstName[0]}
                {data.lastName[0]}
              </div>
              <div className="text-sm font-bold text-foreground">
                {data.firstName} {data.lastName}
              </div>
              <div className="text-xs text-muted-foreground">
                {data.className} · #{data.studentNumber}
              </div>
            </div>
            <div className="h-px bg-border" />
            {data.isMyHomeroom && (
              <>
                <InfoRow
                  label={t('info.overallAverage')}
                  value={`${fmtAverage(data.overallAverage, locale)} / 20`}
                />
                <InfoRow
                  label={t('info.rank')}
                  value={
                    data.rank
                      ? t(data.rank === 1 ? 'rankValue.one' : 'rankValue.other', {
                          rank: data.rank,
                          total: data.rankedCount,
                        })
                      : '—'
                  }
                />
                <InfoRow
                  label={t('info.classAverage')}
                  value={`${fmtAverage(data.classAverage, locale)} / 20`}
                />
              </>
            )}
            <InfoRow label={t('info.absences')} value="—" />
            <InfoRow label={t('info.lateArrivals')} value="—" />
            {data.subjects.length > 0 && (
              <div className="mt-1">
                <div className="mb-1.5 text-2xs text-muted-foreground">{t('subjectGrades')}</div>
                <div className="flex flex-col gap-1.5">
                  {data.subjects.map((s) => (
                    <div key={s.classSubjectId}>
                      <div className="mb-0.5 flex justify-between text-2xs">
                        <span className="font-medium text-foreground">{s.subjectName}</span>
                        <span className="font-bold text-foreground">
                          {fmtAverage(s.average, locale)}
                        </span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${s.average != null ? (s.average / 20) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {data.isMyHomeroom && (
            <Card className="gap-2 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Zap size={14} className="text-primary" />
                {t('quickPhrasesTitle')}
              </div>
              <p className="text-2xs text-muted-foreground">{t('quickPhrasesSubtitle')}</p>
              <div className="flex flex-col gap-1.5">
                {QUICK_PHRASE_KEYS.map((phraseKey) => {
                  const phrase = tPhrases(phraseKey);
                  return (
                    <button
                      key={phraseKey}
                      type="button"
                      onClick={() =>
                        setText((prev) =>
                          (prev ? `${prev.trim()} ${phrase}` : phrase).slice(0, COMMENT_MAX),
                        )
                      }
                      className="rounded-md border border-border px-2.5 py-2 text-left text-2xs text-foreground hover:bg-muted"
                    >
                      {phrase}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
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
