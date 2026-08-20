'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Pencil,
  Calendar,
  CalendarRange,
  Layers,
  Clock,
  PlayCircle,
  CheckCircle,
  Info,
  PlusCircle,
  ArrowRight,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { DateField } from '@/components/ui/DateField';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/lib/utils';
import { LOCALE_BCP47 } from '@/lib/locales';
import { TERM_TYPES, ORDINAL_LABELS, ACADEMIC_YEAR_ROLLOVER } from '@/lib/constants';
import type { AcademicYearData, TermData } from './types';

const STATUS_BADGE_CLASS: Record<TermData['status'], string> = {
  DONE: 'bg-success text-success-foreground',
  CURRENT: 'border border-primary bg-secondary text-primary',
  UPCOMING: 'bg-muted text-muted-foreground',
};

const STATUS_DOT_CLASS: Record<TermData['status'], string> = {
  DONE: 'bg-success-foreground',
  CURRENT: 'bg-primary',
  UPCOMING: 'bg-muted-foreground',
};

const STATUS_ROW_CLASS: Record<TermData['status'], string> = {
  DONE: 'border-border bg-background',
  CURRENT: 'border-[1.5px] border-primary bg-secondary',
  UPCOMING: 'border-border bg-background',
};

const TERM_TYPE_ICON = { calendar: Calendar, 'calendar-range': CalendarRange, layers: Layers };

// Composites with the fenced ORDINAL_LABELS constant to build generated
// term names ("1er Trimestre") — stays French, see this plan's Global
// Constraints (cross-dependency fences).
const TERM_TYPE_LABEL: Record<TermData['type'], string> = {
  TRIMESTRE: 'Trimestre',
  SEMESTRE: 'Semestre',
  LIBRE: 'Période libre',
};

function toDateInput(dateStr: string): string {
  return dateStr.slice(0, 10);
}

function computeStatus(startDate: string, endDate: string): TermData['status'] {
  if (!startDate || !endDate) return 'UPCOMING';
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (now > end) return 'DONE';
  if (now < start) return 'UPCOMING';
  return 'CURRENT';
}

function StatusBadge({ status }: { status: TermData['status'] }) {
  const t = useTranslations('Settings.anneeScolaire.statusLabel');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap',
        STATUS_BADGE_CLASS[status],
      )}
    >
      {status === 'DONE' && <CheckCircle size={10} />}
      {t(status)}
    </span>
  );
}

function EditGradingScaleModal({
  gradingScale,
  onUpdated,
  onClose,
}: {
  gradingScale: string | null;
  onUpdated: (gradingScale: string | null) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const t = useTranslations('Settings.anneeScolaire.editGradingScaleModal');
  const tCommon = useTranslations('Common');
  const [value, setValue] = useState(gradingScale ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<{ academicYear: { gradingScale: string | null } }>(
        '/api/school/academic-year',
        { method: 'PATCH', body: { gradingScale: value.trim() || null } },
      );
      onUpdated(res.academicYear.gradingScale);
      toast(t('updated'), 'success');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t('title')} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <Field
          label={t('fieldLabel')}
          autoFocus
          placeholder={t('placeholder')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" className="w-fit" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" loading={submitting} className="w-fit">
            {t('save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function GradingScaleEditor({
  gradingScale,
  onUpdated,
}: {
  gradingScale: string | null;
  onUpdated: (gradingScale: string | null) => void;
}) {
  const t = useTranslations('Settings.anneeScolaire');
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-foreground">{t('gradingScaleLabel')}</span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex h-10 items-center justify-between gap-2 rounded-md border border-border bg-input px-3 text-left text-sm text-foreground"
      >
        <span className={gradingScale ? '' : 'text-muted-foreground'}>
          {gradingScale ?? t('gradingScaleUndefined')}
        </span>
        <Pencil size={13} className="shrink-0 text-muted-foreground" />
      </button>
      {editing && (
        <EditGradingScaleModal
          gradingScale={gradingScale}
          onUpdated={onUpdated}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function TermTypeAndToggleFields({
  type,
  onTypeChange,
  gradeEntryEnabled,
  onGradeEntryEnabledChange,
}: {
  type: TermData['type'];
  onTypeChange: (t: TermData['type']) => void;
  gradeEntryEnabled: boolean;
  onGradeEntryEnabledChange: (v: boolean) => void;
}) {
  const t = useTranslations('Settings.anneeScolaire.termTypeAndToggle');
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-foreground">{t('typeLabel')}</span>
        <div className="grid grid-cols-3 gap-2">
          {TERM_TYPES.map((tt) => {
            const Icon = TERM_TYPE_ICON[tt.icon];
            const selected = type === tt.value;
            return (
              <button
                key={tt.value}
                type="button"
                onClick={() => onTypeChange(tt.value)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-md border-[1.5px] px-2 py-3 text-center',
                  selected ? 'border-primary bg-secondary' : 'border-border',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-md',
                    selected ? 'bg-card' : 'bg-muted',
                  )}
                >
                  <Icon size={16} className={selected ? 'text-primary' : 'text-muted-foreground'} />
                </span>
                <span
                  className={cn(
                    'text-xs font-semibold',
                    selected ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {tt.label}
                </span>
                <span className="text-[10px] text-muted-foreground">{tt.sub}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-background px-3.5 py-2.5">
        <div>
          <div className="text-xs font-semibold text-foreground">{t('gradeEntryTitle')}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{t('gradeEntryDesc')}</div>
        </div>
        <Switch
          checked={gradeEntryEnabled}
          onChange={onGradeEntryEnabledChange}
          label={t('gradeEntryTitle')}
        />
      </div>
    </>
  );
}

function EditTermModal({
  term,
  onSaved,
  onClose,
}: {
  term: TermData;
  onSaved: (term: TermData) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const t = useTranslations('Settings.anneeScolaire.editTermModal');
  const tCommon = useTranslations('Common');
  const [label, setLabel] = useState(term.label);
  const [startDate, setStartDate] = useState(toDateInput(term.startDate));
  const [endDate, setEndDate] = useState(toDateInput(term.endDate));
  const [type, setType] = useState(term.type);
  const [gradeEntryEnabled, setGradeEntryEnabled] = useState(term.gradeEntryEnabled);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<{ term: TermData }>(`/api/school/terms/${term.id}`, {
        method: 'PATCH',
        body: { label, startDate, endDate, type, gradeEntryEnabled },
      });
      onSaved(res.term);
      toast(t('updated'), 'success');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t('title')} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <Field label={t('labelField')} value={label} onChange={(e) => setLabel(e.target.value)} />
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <DateField label={t('startDate')} value={startDate} onChange={setStartDate} />
          <DateField label={t('endDate')} value={endDate} onChange={setEndDate} />
        </div>
        <TermTypeAndToggleFields
          type={type}
          onTypeChange={setType}
          gradeEntryEnabled={gradeEntryEnabled}
          onGradeEntryEnabledChange={setGradeEntryEnabled}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" className="w-fit" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" loading={submitting} className="w-fit">
            {t('save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TermRow({ term, onSaved }: { term: TermData; onSaved: (term: TermData) => void }) {
  const t = useTranslations('Settings.anneeScolaire');
  const locale = useLocale();
  const [editing, setEditing] = useState(false);

  function fmt(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(LOCALE_BCP47[locale], {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  return (
    <>
      <div
        className={cn(
          'flex flex-wrap items-center gap-3 rounded-md border px-3.5 py-2.5',
          STATUS_ROW_CLASS[term.status],
        )}
      >
        <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT_CLASS[term.status])} />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'text-sm font-semibold',
              term.status === 'CURRENT' ? 'text-primary' : 'text-foreground',
            )}
          >
            {term.label}
          </div>
          <div className="text-xs text-muted-foreground">
            {fmt(term.startDate)} → {fmt(term.endDate)}
          </div>
        </div>
        <StatusBadge status={term.status} />
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={t('editTermAriaLabel', { label: term.label })}
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Pencil size={13} className={term.status === 'CURRENT' ? 'text-primary' : ''} />
        </button>
      </div>
      {editing && <EditTermModal term={term} onSaved={onSaved} onClose={() => setEditing(false)} />}
    </>
  );
}

function NouvellePeriodeModal({
  academicYearLabel,
  nextOrder,
  onCreated,
  onClose,
}: {
  academicYearLabel: string;
  nextOrder: number;
  onCreated: (term: TermData) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const t = useTranslations('Settings.anneeScolaire.newTermModal');
  const tStatus = useTranslations('Settings.anneeScolaire.statusLabel');
  const tCommon = useTranslations('Common');
  const [type, setType] = useState<TermData['type']>('TRIMESTRE');
  const ordinalIndex = Math.min(nextOrder - 1, ORDINAL_LABELS.length - 1);
  const defaultLabel = `${ORDINAL_LABELS[ordinalIndex]} ${TERM_TYPE_LABEL[type]}`;
  const [label, setLabel] = useState(defaultLabel);
  const [labelTouched, setLabelTouched] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [gradeEntryEnabled, setGradeEntryEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onTypeChange(next: TermData['type']) {
    setType(next);
    if (!labelTouched) setLabel(`${ORDINAL_LABELS[ordinalIndex]} ${TERM_TYPE_LABEL[next]}`);
  }

  const statusPreview = computeStatus(startDate, endDate);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!label || !startDate || !endDate) {
      setError(t('missingFields'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ term: TermData }>('/api/school/terms', {
        method: 'POST',
        body: { label, startDate, endDate, type, gradeEntryEnabled },
      });
      onCreated(res.term);
      toast(t('created'), 'success');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('errors.network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t('title')} onClose={onClose}>
      <p className="-mt-2.5 mb-4 text-xs text-muted-foreground">
        {t('intro', { academicYearLabel })}
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <TermTypeAndToggleFields
          type={type}
          onTypeChange={onTypeChange}
          gradeEntryEnabled={gradeEntryEnabled}
          onGradeEntryEnabledChange={setGradeEntryEnabled}
        />

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field
            label={t('termNumberLabel')}
            value={`${ORDINAL_LABELS[ordinalIndex]} ${TERM_TYPE_LABEL[type]}`}
            readOnly
            disabled
          />
          <Field
            label={t('displayLabelField')}
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setLabelTouched(true);
            }}
          />
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <DateField label={t('startDate')} required value={startDate} onChange={setStartDate} />
          <DateField label={t('endDate')} required value={endDate} onChange={setEndDate} />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-foreground">{t('initialStatus')}</span>
          <div className="flex gap-2.5">
            <span
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md border-[1.5px] px-3.5 py-2 text-xs font-semibold',
                statusPreview === 'UPCOMING'
                  ? 'border-muted-foreground bg-muted text-foreground'
                  : 'border-border text-muted-foreground',
              )}
            >
              <Clock size={13} />
              {tStatus('UPCOMING')}
            </span>
            <span
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md border-[1.5px] px-3.5 py-2 text-xs font-semibold',
                statusPreview === 'CURRENT'
                  ? 'border-primary bg-secondary text-primary'
                  : 'border-border text-muted-foreground',
              )}
            >
              <PlayCircle size={13} />
              {tStatus('CURRENT')}
            </span>
            <span
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md border-[1.5px] px-3.5 py-2 text-xs font-semibold',
                statusPreview === 'DONE'
                  ? 'border-success-foreground bg-success text-success-foreground'
                  : 'border-border text-muted-foreground',
              )}
            >
              <CheckCircle size={13} />
              {tStatus('DONE')}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">{t('statusHint')}</p>
        </div>

        <div className="flex items-start gap-2.5 rounded-md border border-primary/30 bg-secondary px-3.5 py-2.5">
          <Info size={14} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-[11px] leading-relaxed text-primary">{t('info')}</p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" className="w-fit" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" loading={submitting} className="w-fit gap-1.5">
            <PlusCircle size={13} />
            {t('create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function AnneeScolaireTab({
  academicYear,
  role,
  onTermAdded,
  onTermUpdated,
  onGradingScaleUpdated,
}: {
  academicYear: AcademicYearData | null;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | null;
  onTermAdded: (term: TermData) => void;
  onTermUpdated: (term: TermData) => void;
  onGradingScaleUpdated: (gradingScale: string | null) => void;
}) {
  const t = useTranslations('Settings.anneeScolaire');
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div>
          <h2 className="text-[13px] font-bold text-foreground">{t('title')}</h2>
          <p className="text-[11px] text-muted-foreground">{t('subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex min-h-11 items-center gap-1.5 rounded-md bg-secondary px-3.5 text-xs font-semibold text-primary"
        >
          <Plus size={14} />
          {t('newTerm')}
        </button>
      </div>

      <div className="flex flex-col gap-4 p-5">
        {academicYear ? (
          <>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-semibold text-foreground">
                  {t('activeYearLabel')}
                </span>
                <span className="flex h-10 items-center rounded-md border border-border bg-input px-3 font-semibold text-foreground">
                  {academicYear.label}
                </span>
              </div>
              <GradingScaleEditor
                gradingScale={academicYear.gradingScale}
                onUpdated={onGradingScaleUpdated}
              />
            </div>

            {academicYear.terms.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noTermsConfigured')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {academicYear.terms.map((term) => (
                  <TermRow key={term.id} term={term} onSaved={onTermUpdated} />
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('noYearConfigured')}</p>
        )}

        {role === 'OWNER' && academicYear && (
          <div className="flex justify-end border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              className="w-full gap-1.5 sm:w-fit"
              onClick={() => router.push('/settings/nouvelle-annee')}
            >
              {ACADEMIC_YEAR_ROLLOVER.title}
              <ArrowRight size={14} />
            </Button>
          </div>
        )}
      </div>

      {showModal && (
        <NouvellePeriodeModal
          academicYearLabel={academicYear?.label ?? ''}
          nextOrder={(academicYear?.terms.length ?? 0) + 1}
          onCreated={onTermAdded}
          onClose={() => setShowModal(false)}
        />
      )}
    </Card>
  );
}
