'use client';

// « Programme annuel » tab of the subject detail page (programme-annuel.md):
// one accordion block per period of the active year, chapter rows edited
// inline (autosaved, debounced per chapter) and reordered by drag & drop
// (framer-motion Reorder → PUT /chapters/reorder), plus the sticky right
// column (résumé, calendrier, matière) and the page footer.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import { Reorder, useDragControls } from 'framer-motion';
import {
  BarChart2,
  Book,
  BookMarked,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Download,
  GripVertical,
  Info,
  PlusCircle,
  Trash2,
  Upload,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { exportToCsv } from '@/lib/csv-export';
import { ASIDE_GRID } from '@/lib/layout';
import { LOCALE_BCP47 } from '@/lib/locales';
import { getSubjectVisual } from '@/lib/subject-visuals';
import { cn } from '@/lib/utils';
import type {
  ChapterData,
  SubjectDetail,
  TermData,
} from '@/app/(school)/configuration/matieres/types';
import { SubjectPageFooter, SubjectStatusBadge } from './SubjectPageShell';

// T1 / T2 / T3 palette of the mock — secondary/primary, success, warning —
// cycling for schools with more than three periods.
const TERM_TONES: { pill: string; bar: string; badge: BadgeTone }[] = [
  { pill: 'bg-secondary text-primary', bar: 'bg-primary', badge: 'muted' },
  { pill: 'bg-success text-success-foreground', bar: 'bg-success-foreground', badge: 'success' },
  { pill: 'bg-warning text-warning-foreground', bar: 'bg-warning-foreground', badge: 'warning' },
];
const toneOf = (index: number) => TERM_TONES[index % TERM_TONES.length]!;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function termRange(t: TermData, bcp47: string): string {
  const a = new Date(t.startDate);
  const b = new Date(t.endDate);
  const month = (d: Date) => cap(d.toLocaleDateString(bcp47, { month: 'long' }));
  return a.getFullYear() === b.getFullYear()
    ? `${month(a)} – ${month(b)} ${b.getFullYear()}`
    : `${month(a)} ${a.getFullYear()} – ${month(b)} ${b.getFullYear()}`;
}
function termShort(t: TermData, bcp47: string): string {
  const f = (d: Date) =>
    cap(new Date(d).toLocaleDateString(bcp47, { month: 'short', year: 'numeric' }));
  return `${f(new Date(t.startDate))} → ${f(new Date(t.endDate))}`;
}
const fmtHours = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)} h`;

type ChapterPatch = Partial<
  Pick<ChapterData, 'title' | 'objectives' | 'hours' | 'reference' | 'competence'>
>;

export function ProgrammeTab({
  subject,
  onChapterCountChange,
}: {
  subject: SubjectDetail;
  onChapterCountChange: (count: number) => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const t = useTranslations('Configuration.matieres.programme');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
  const bcp47 = LOCALE_BCP47[locale];
  const [terms, setTerms] = useState<TermData[] | null>(null);
  const [chapters, setChapters] = useState<ChapterData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; patch: ChapterPatch }>(),
  );

  const load = useCallback(async () => {
    try {
      const res = await api<{ terms: TermData[]; chapters: ChapterData[] }>(
        `/api/school/subjects/${subject.id}/chapters`,
      );
      setTerms(res.terms);
      setChapters(res.chapters);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('loadError'));
    }
  }, [subject.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onChapterCountChange(chapters.length);
  }, [chapters.length, onChapterCountChange]);

  // ── autosave ────────────────────────────────────────────────────────
  const flushOne = useCallback(
    async (chapterId: string) => {
      const entry = pending.current.get(chapterId);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.current.delete(chapterId);
      try {
        await api(`/api/school/subjects/${subject.id}/chapters/${chapterId}`, {
          method: 'PATCH',
          body: entry.patch,
        });
      } catch (err) {
        toast(err instanceof ApiError ? err.message : t('saveError'), 'error');
      }
    },
    [subject.id, toast, t],
  );

  const edit = useCallback(
    (chapterId: string, patch: ChapterPatch) => {
      setChapters((prev) => prev.map((c) => (c.id === chapterId ? { ...c, ...patch } : c)));
      const existing = pending.current.get(chapterId);
      if (existing) clearTimeout(existing.timer);
      const merged = { ...(existing?.patch ?? {}), ...patch };
      pending.current.set(chapterId, {
        patch: merged,
        timer: setTimeout(() => void flushOne(chapterId), 600),
      });
    },
    [flushOne],
  );

  const flushAll = useCallback(async () => {
    const ids = [...pending.current.keys()];
    await Promise.all(ids.map((id) => flushOne(id)));
  }, [flushOne]);

  useEffect(() => {
    const map = pending.current;
    return () => {
      // Unmount: fire whatever is still queued instead of dropping edits.
      for (const id of [...map.keys()]) void flushOne(id);
    };
  }, [flushOne]);

  // ── mutations ───────────────────────────────────────────────────────
  async function addChapter(termId: string) {
    try {
      const res = await api<{ chapter: ChapterData }>(
        `/api/school/subjects/${subject.id}/chapters`,
        {
          method: 'POST',
          body: { termId, title: t('newChapterTitle') },
        },
      );
      setChapters((prev) => [...prev, res.chapter]);
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLInputElement>(
          `[data-chapter-title="${res.chapter.id}"]`,
        );
        el?.focus();
        el?.select();
      });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    }
  }

  async function removeChapter(chapter: ChapterData) {
    if (!(await confirm({ message: t('deleteConfirm', { title: chapter.title }), danger: true })))
      return;
    try {
      pending.current.delete(chapter.id);
      await api(`/api/school/subjects/${subject.id}/chapters/${chapter.id}`, { method: 'DELETE' });
      setChapters((prev) => prev.filter((c) => c.id !== chapter.id));
      toast(t('toast.chapterDeleted'), 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('errors.network'), 'error');
    }
  }

  async function reorder(termId: string, ordered: ChapterData[]) {
    setChapters((prev) => [
      ...prev.filter((c) => c.termId !== termId),
      ...ordered.map((c, i) => ({ ...c, order: i + 1 })),
    ]);
    try {
      await api(`/api/school/subjects/${subject.id}/chapters/reorder`, {
        method: 'PUT',
        body: { termId, ids: ordered.map((c) => c.id) },
      });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('reorderError'), 'error');
      void load();
    }
  }

  async function saveAll() {
    setSaving(true);
    await flushAll();
    setSaving(false);
    toast(t('toast.saved'), 'success');
  }

  function exportCsv() {
    const byTerm = new Map((terms ?? []).map((term) => [term.id, term.label]));
    exportToCsv(
      `programme-${subject.code ?? subject.name}.csv`,
      [
        t('csv.period'),
        t('csv.number'),
        t('csv.chapter'),
        t('csv.objectives'),
        t('csv.hours'),
        t('csv.reference'),
        t('csv.competence'),
      ],
      sortedChapters.map((c, i) => [
        byTerm.get(c.termId) ?? '',
        String(i + 1),
        c.title,
        c.objectives ?? '',
        c.hours != null ? String(c.hours) : '',
        c.reference ?? '',
        c.competence ?? '',
      ]),
    );
  }

  // ── derived ─────────────────────────────────────────────────────────
  const termOrder = useMemo(() => new Map((terms ?? []).map((term, i) => [term.id, i])), [terms]);
  const sortedChapters = useMemo(
    () =>
      [...chapters].sort(
        (a, b) =>
          (termOrder.get(a.termId) ?? 0) - (termOrder.get(b.termId) ?? 0) || a.order - b.order,
      ),
    [chapters, termOrder],
  );
  const perTerm = useMemo(() => {
    const m = new Map<string, { chapters: ChapterData[]; hours: number }>();
    for (const term of terms ?? []) m.set(term.id, { chapters: [], hours: 0 });
    for (const c of sortedChapters) {
      const e = m.get(c.termId);
      if (!e) continue;
      e.chapters.push(c);
      e.hours += c.hours ?? 0;
    }
    return m;
  }, [terms, sortedChapters]);
  const totalHours = sortedChapters.reduce((s, c) => s + (c.hours ?? 0), 0);
  const globalIndex = useMemo(
    () => new Map(sortedChapters.map((c, i) => [c.id, i + 1])),
    [sortedChapters],
  );
  const visual = getSubjectVisual(subject.name, { icon: subject.icon, color: subject.color });
  const teacherLabel =
    subject.responsibleTeacher?.name ??
    subject.classSubjects.find((cs) => cs.teacher)?.teacher?.name ??
    '—';
  const classLabel = subject.classSubjects.map((cs) => cs.class.name).join(', ') || '—';
  const termsCount = (terms ?? []).length;

  const footer = (
    <SubjectPageFooter
      left={
        <>
          <BookMarked size={14} />
          <span>
            {t(sortedChapters.length > 1 ? 'plural.chapters.other' : 'plural.chapters.one', {
              count: sortedChapters.length,
            })}{' '}
            · {fmtHours(totalHours)} {t('footer.totalOn')}{' '}
            {t(termsCount > 1 ? 'plural.periods.other' : 'plural.periods.one', {
              count: termsCount,
            })}
          </span>
        </>
      }
      right={
        <>
          <Button variant="ghost" className="w-fit" onClick={() => void load()}>
            {t('footer.cancel')}
          </Button>
          <Button
            variant="outline"
            className="w-fit"
            onClick={exportCsv}
            disabled={sortedChapters.length === 0}
          >
            <Download size={13} />
            {t('footer.export')}
          </Button>
          <Button className="w-fit" loading={saving} onClick={() => void saveAll()}>
            <Check size={14} />
            {t('footer.save')}
          </Button>
        </>
      }
    />
  );

  if (error) {
    return (
      <>
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
        {footer}
      </>
    );
  }
  if (terms === null) {
    return (
      <>
        <div className={cn(ASIDE_GRID, 'pb-4')}>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
          <Skeleton className="h-64 rounded-lg" />
        </div>
        {footer}
      </>
    );
  }

  return (
    <>
      <div className="pb-4">
        {/* Toolbar */}
        <div className="mb-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[15px] font-bold text-foreground">{t('toolbar.title')}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{t('toolbar.description')}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="w-auto"
              onClick={() => toast(t('toolbar.importToast'), 'info')}
            >
              <Upload size={13} />
              {t('toolbar.import')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-auto"
              onClick={() => toast(t('toolbar.duplicateToast'), 'info')}
            >
              <Copy size={13} />
              {t('toolbar.duplicate')}
            </Button>
          </div>
        </div>

        <div className={cn(ASIDE_GRID, 'items-start')}>
          {/* LEFT: terms */}
          <div className="min-w-0">
            {terms.length === 0 ? (
              <div className="rounded-lg border border-border bg-card px-5 py-8 text-center">
                <p className="text-caption font-semibold text-foreground">{t('empty.title')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('empty.description')}</p>
                <Link
                  href="/settings?tab=year"
                  className="mt-3 inline-flex text-xs font-semibold text-primary"
                >
                  {t('empty.link')}
                </Link>
              </div>
            ) : (
              <Accordion.Root
                type="multiple"
                defaultValue={terms.map((term) => term.id)}
                className="flex flex-col gap-3"
              >
                {terms.map((term, index) => {
                  const tone = toneOf(index);
                  const bucket = perTerm.get(term.id) ?? { chapters: [], hours: 0 };
                  return (
                    <Accordion.Item
                      key={term.id}
                      value={term.id}
                      className="overflow-hidden rounded-lg border border-border bg-card"
                    >
                      <Accordion.Header>
                        <Accordion.Trigger className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={cn(
                                'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-xs font-bold',
                                tone.pill,
                              )}
                            >
                              T{index + 1}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-bold text-foreground">
                                {term.label}
                              </span>
                              <span className="mt-px block truncate text-xs text-muted-foreground">
                                {termRange(term, bcp47)}
                              </span>
                            </span>
                            <Badge tone={tone.badge} className="ml-1 hidden sm:inline-flex">
                              {t(
                                bucket.chapters.length > 1
                                  ? 'plural.chapters.other'
                                  : 'plural.chapters.one',
                                { count: bucket.chapters.length },
                              )}
                            </Badge>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="rounded-md bg-muted px-2.5 py-[3px] text-xs font-semibold text-foreground">
                              {fmtHours(bucket.hours)}
                            </span>
                            <ChevronDown
                              size={16}
                              className="text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
                            />
                          </span>
                        </Accordion.Trigger>
                      </Accordion.Header>
                      <Accordion.Content className="accordion-content overflow-hidden">
                        <div className="border-t border-border px-3.5 pt-2.5 pb-3">
                          <Reorder.Group
                            axis="y"
                            values={bucket.chapters}
                            onReorder={(next) => void reorder(term.id, next)}
                            className="flex flex-col"
                          >
                            {bucket.chapters.map((chapter) => (
                              <ChapterRow
                                key={chapter.id}
                                chapter={chapter}
                                index={globalIndex.get(chapter.id) ?? 0}
                                pillClass={tone.pill}
                                onEdit={(patch) => edit(chapter.id, patch)}
                                onDelete={() => void removeChapter(chapter)}
                                t={t}
                              />
                            ))}
                          </Reorder.Group>
                          <button
                            type="button"
                            onClick={() => void addChapter(term.id)}
                            className="mt-1.5 flex w-full items-center gap-2 border-t border-dashed border-border pt-2 pb-0.5 pl-8 text-xs font-medium text-primary"
                          >
                            <PlusCircle size={14} />
                            {t('addChapterButton')}
                          </button>
                        </div>
                      </Accordion.Content>
                    </Accordion.Item>
                  );
                })}
              </Accordion.Root>
            )}
          </div>

          {/* RIGHT: sticky summary */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-0">
            <InfoCard icon={<BarChart2 size={14} />} title={t('summary.title')}>
              <StatRow label={t('summary.totalChapters')} value={String(sortedChapters.length)} />
              <StatRow label={t('summary.totalHours')} value={fmtHours(totalHours)} />
              {terms.map((term, i) => {
                const b = perTerm.get(term.id) ?? { chapters: [], hours: 0 };
                return (
                  <StatRow
                    key={term.id}
                    label={t('summary.termLabel', { number: i + 1 })}
                    value={t('summary.termValue', {
                      hours: fmtHours(b.hours),
                      count: b.chapters.length,
                    })}
                  />
                );
              })}
              {terms.length > 0 && (
                <div className="mt-3">
                  <div className="mb-[5px] flex justify-between text-2xs text-muted-foreground">
                    <span>{t('summary.distribution')}</span>
                    <span>{t('summary.distributionTotal', { hours: fmtHours(totalHours) })}</span>
                  </div>
                  <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
                    {terms.map((term, i) => {
                      const h = perTerm.get(term.id)?.hours ?? 0;
                      return (
                        <div
                          key={term.id}
                          className={cn(toneOf(i).bar)}
                          style={{ flex: totalHours > 0 ? h : 1 }}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-2.5">
                    {terms.map((term, i) => (
                      <span
                        key={term.id}
                        className="flex items-center gap-1 text-2xs text-muted-foreground"
                      >
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', toneOf(i).bar)} />T
                        {i + 1}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </InfoCard>

            <InfoCard icon={<Calendar size={14} />} title={t('calendar.title')}>
              {terms.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('calendar.empty')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {terms.map((term, i) => (
                    <div key={term.id} className="flex items-start gap-2">
                      <span
                        className={cn('mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full', toneOf(i).bar)}
                      />
                      <div>
                        <div className="text-xs font-semibold text-foreground">{term.label}</div>
                        <div className="text-2xs text-muted-foreground">
                          {termShort(term, bcp47)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </InfoCard>

            <InfoCard icon={<Info size={14} />} title={t('subjectCard.title')}>
              <div className="mb-2.5 flex items-center gap-2.5 rounded-md bg-background px-2.5 py-2">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                  style={{ background: visual.iconBg, color: visual.iconFg }}
                >
                  <visual.Icon size={16} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-caption font-bold text-foreground">
                    {subject.name}
                  </div>
                  <div className="truncate text-2xs text-muted-foreground">
                    {[
                      subject.code,
                      subject.defaultCoefficient != null
                        ? t('subjectCard.coeffPrefix', { coefficient: subject.defaultCoefficient })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </div>
                </div>
              </div>
              <StatRow label={t('subjectCard.teacher')} value={teacherLabel} small />
              <StatRow label={t('subjectCard.classes')} value={classLabel} small />
              <div className="flex items-center justify-between py-[5px] text-xs">
                <span className="font-medium text-muted-foreground">{t('subjectCard.status')}</span>
                <SubjectStatusBadge status={subject.status} />
              </div>
            </InfoCard>
          </div>
        </div>
      </div>
      {footer}
    </>
  );
}

// ── pieces ──────────────────────────────────────────────────────────────

type ChapterRowT = (
  key:
    | 'chapterRow.reorderAria'
    | 'chapterRow.titlePlaceholder'
    | 'chapterRow.objectivesPlaceholder'
    | 'chapterRow.objectivesAria'
    | 'chapterRow.durationLabel'
    | 'chapterRow.durationAria'
    | 'chapterRow.referencePlaceholder'
    | 'chapterRow.referenceAria'
    | 'chapterRow.competencePlaceholder'
    | 'chapterRow.deleteAria',
) => string;

function ChapterRow({
  chapter,
  index,
  pillClass,
  onEdit,
  onDelete,
  t,
}: {
  chapter: ChapterData;
  index: number;
  pillClass: string;
  onEdit: (patch: ChapterPatch) => void;
  onDelete: () => void;
  t: ChapterRowT;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={chapter}
      dragListener={false}
      dragControls={controls}
      className="flex items-start gap-2.5 border-b border-border bg-card py-2.5 last:border-b-0"
    >
      <button
        type="button"
        aria-label={t('chapterRow.reorderAria')}
        onPointerDown={(e) => controls.start(e)}
        className="mt-0.5 flex shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical size={15} />
      </button>
      <span
        className={cn(
          'mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-2xs font-bold',
          pillClass,
        )}
      >
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <input
          data-chapter-title={chapter.id}
          value={chapter.title}
          onChange={(e) => onEdit({ title: e.target.value })}
          placeholder={t('chapterRow.titlePlaceholder')}
          aria-label={t('chapterRow.titlePlaceholder')}
          className="w-full bg-transparent text-caption leading-[1.4] font-semibold text-foreground outline-none placeholder:text-muted-foreground"
        />
        <AutoTextarea
          value={chapter.objectives ?? ''}
          onChange={(v) => onEdit({ objectives: v || null })}
          placeholder={t('chapterRow.objectivesPlaceholder')}
          ariaLabel={t('chapterRow.objectivesAria')}
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1 text-2xs text-muted-foreground">
            <Clock size={11} />
            {t('chapterRow.durationLabel')}
            <span className="flex items-center rounded-sm bg-muted px-2 py-px text-2xs font-semibold text-foreground">
              <input
                type="number"
                min={0}
                step={0.5}
                value={chapter.hours ?? ''}
                onChange={(e) =>
                  onEdit({ hours: e.target.value === '' ? null : Number(e.target.value) })
                }
                aria-label={t('chapterRow.durationAria')}
                className="w-8 bg-transparent text-right outline-none"
              />
              h
            </span>
          </label>
          <label className="flex items-center gap-1 text-2xs text-muted-foreground">
            <Book size={11} />
            <input
              value={chapter.reference ?? ''}
              onChange={(e) => onEdit({ reference: e.target.value || null })}
              placeholder={t('chapterRow.referencePlaceholder')}
              aria-label={t('chapterRow.referenceAria')}
              className="w-24 bg-transparent outline-none placeholder:text-muted-foreground/70"
            />
          </label>
          <input
            value={chapter.competence ?? ''}
            onChange={(e) => onEdit({ competence: e.target.value || null })}
            placeholder={t('chapterRow.competencePlaceholder')}
            aria-label={t('chapterRow.competencePlaceholder')}
            className="w-32 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-primary outline-none placeholder:text-primary/50"
          />
        </div>
      </div>
      <button
        type="button"
        aria-label={t('chapterRow.deleteAria')}
        onClick={onDelete}
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-sm text-destructive-foreground hover:bg-destructive"
      >
        <Trash2 size={13} />
      </button>
    </Reorder.Item>
  );
}

function AutoTextarea({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className="mt-[3px] w-full resize-none overflow-hidden bg-transparent text-xs leading-normal text-muted-foreground outline-none placeholder:text-muted-foreground/60"
    />
  );
}

function InfoCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-[7px] border-b border-border px-3.5 pt-[11px] pb-[9px] text-caption font-bold text-foreground">
        <span className="text-primary">{icon}</span>
        {title}
      </div>
      <div className="px-3.5 py-3">{children}</div>
    </div>
  );
}

function StatRow({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-[5px] text-xs last:border-b-0">
      <span className="shrink-0 font-medium text-muted-foreground">{label}</span>
      <span className={cn('truncate text-right font-bold text-foreground', small && 'text-xs')}>
        {value}
      </span>
    </div>
  );
}
