'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Field } from '@/components/ui/Field';
import { DateField } from '@/components/ui/DateField';
import { Select, SelectItem } from '@/components/ui/Select';
import { Avatar } from '@/components/ui/Avatar';
import type { ClassSubjectOption, EvaluationConfig, EvaluationType, TermOption } from './types';

const EVALUATION_TYPES: EvaluationType[] = ['DS', 'INTERROGATION', 'EXAMEN', 'AUTRE'];

export function EvaluationConfigForm({
  value,
  onChange,
  classSubjects,
  terms,
  lockPair = false,
}: {
  value: EvaluationConfig;
  onChange: (next: EvaluationConfig) => void;
  classSubjects: ClassSubjectOption[];
  terms: TermOption[];
  lockPair?: boolean;
}) {
  const t = useTranslations('Gradebook.evaluationForm');
  const tType = useTranslations('Gradebook.evaluationType');

  const classes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const cs of classSubjects) seen.set(cs.classId, cs.class.name);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [classSubjects]);

  const current = classSubjects.find((cs) => cs.id === value.classSubjectId) ?? null;
  const classId = current?.classId ?? classSubjects[0]?.classId ?? '';
  const subjectsForClass = classSubjects.filter((cs) => cs.classId === classId);

  function set<K extends keyof EvaluationConfig>(key: K, v: EvaluationConfig[K]) {
    onChange({ ...value, [key]: v });
  }

  function onClassChange(nextClassId: string) {
    const first = classSubjects.find((cs) => cs.classId === nextClassId);
    set('classSubjectId', first?.id ?? '');
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3.5">
        <Select
          label={t('classLabel')}
          value={classId}
          disabled={lockPair}
          onValueChange={onClassChange}
        >
          {classes.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </Select>
        <Select
          label={t('subjectLabel')}
          value={value.classSubjectId}
          disabled={lockPair}
          onValueChange={(v) => set('classSubjectId', v)}
        >
          {subjectsForClass.map((cs) => (
            <SelectItem key={cs.id} value={cs.id}>
              {cs.subject.name}
            </SelectItem>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <Select label={t('termLabel')} value={value.termId} onValueChange={(v) => set('termId', v)}>
          {terms.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.label}
            </SelectItem>
          ))}
        </Select>
        <Select
          label={t('typeLabel')}
          value={value.type}
          onValueChange={(v) => set('type', v as EvaluationType)}
        >
          {EVALUATION_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {tType(type)}
            </SelectItem>
          ))}
        </Select>
      </div>

      <Field
        label={t('titleLabel')}
        placeholder={t('titlePlaceholder')}
        value={value.label}
        onChange={(e) => set('label', e.target.value)}
        required
      />

      <div className="grid grid-cols-3 gap-3.5">
        <DateField
          label={t('dateLabel')}
          value={value.date ?? ''}
          onChange={(v) => set('date', v || null)}
        />
        <Select
          label={t('maxScoreLabel')}
          value={String(value.maxScore)}
          onValueChange={(v) => set('maxScore', Number(v))}
        >
          {[5, 10, 20, 100].map((n) => (
            <SelectItem key={n} value={String(n)}>
              {t('maxScoreOption', { n })}
            </SelectItem>
          ))}
        </Select>
        <Field
          label={t('coefficientLabel')}
          type="number"
          min={1}
          max={10}
          value={String(value.coefficient)}
          onChange={(e) => set('coefficient', Number(e.target.value) || 1)}
        />
      </div>

      <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2.5">
        <div>
          <div className="text-xs font-semibold text-foreground">
            {t('countsTowardAverageLabel')}
          </div>
          <div className="text-[11px] text-muted-foreground">{t('countsTowardAverageHint')}</div>
        </div>
        <div className="flex overflow-hidden rounded-md border border-border">
          {([true, false] as const).map((optionValue) => {
            const active = optionValue === value.countsTowardAverage;
            return (
              <button
                key={String(optionValue)}
                type="button"
                onClick={() => set('countsTowardAverage', optionValue)}
                className={`px-3 py-1.5 text-xs font-semibold ${active ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
              >
                {optionValue ? t('yes') : t('no')}
              </button>
            );
          })}
        </div>
      </div>

      {current?.teacher && (
        <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
          <Avatar name={current.teacher.name} size={22} />
          <span className="text-xs text-muted-foreground">
            {t('teacherInCharge')}{' '}
            <strong className="text-foreground">{current.teacher.name}</strong>
          </span>
        </div>
      )}

      <Field
        label={t('notesLabel')}
        placeholder={t('notesPlaceholder')}
        value={value.notes ?? ''}
        onChange={(e) => set('notes', e.target.value || null)}
      />
    </div>
  );
}
