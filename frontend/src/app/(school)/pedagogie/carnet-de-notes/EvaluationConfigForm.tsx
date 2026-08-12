'use client';

import { useMemo } from 'react';
import { Field } from '@/components/ui/Field';
import { Select, SelectItem } from '@/components/ui/Select';
import { Avatar } from '@/components/ui/Avatar';
import type { ClassSubjectOption, EvaluationConfig, EvaluationType, TermOption } from './types';

const TYPE_LABEL: Record<EvaluationType, string> = {
  DS: 'Devoir surveillé (DS)',
  INTERROGATION: 'Interrogation',
  EXAMEN: 'Examen',
  AUTRE: 'Autre',
};

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
        <Select label="Classe" value={classId} disabled={lockPair} onValueChange={onClassChange}>
          {classes.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </Select>
        <Select
          label="Matière"
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
        <Select
          label="Trimestre / Période"
          value={value.termId}
          onValueChange={(v) => set('termId', v)}
        >
          {terms.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.label}
            </SelectItem>
          ))}
        </Select>
        <Select
          label="Type d'évaluation"
          value={value.type}
          onValueChange={(v) => set('type', v as EvaluationType)}
        >
          {(Object.keys(TYPE_LABEL) as EvaluationType[]).map((t) => (
            <SelectItem key={t} value={t}>
              {TYPE_LABEL[t]}
            </SelectItem>
          ))}
        </Select>
      </div>

      <Field
        label="Intitulé de l'évaluation"
        placeholder="Ex. : Devoir surveillé n°3, Interrogation surprise..."
        value={value.label}
        onChange={(e) => set('label', e.target.value)}
        required
      />

      <div className="grid grid-cols-3 gap-3.5">
        <Field
          label="Date"
          type="date"
          value={value.date ?? ''}
          onChange={(e) => set('date', e.target.value || null)}
        />
        <Select
          label="Note maximale"
          value={String(value.maxScore)}
          onValueChange={(v) => set('maxScore', Number(v))}
        >
          {[5, 10, 20, 100].map((n) => (
            <SelectItem key={n} value={String(n)}>
              Sur {n}
            </SelectItem>
          ))}
        </Select>
        <Field
          label="Coefficient"
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
            Prise en compte dans la moyenne
          </div>
          <div className="text-[11px] text-muted-foreground">
            Inclure cette évaluation dans le calcul de la moyenne
          </div>
        </div>
        <div className="flex overflow-hidden rounded-md border border-border">
          {(['Oui', 'Non'] as const).map((label) => {
            const active = (label === 'Oui') === value.countsTowardAverage;
            return (
              <button
                key={label}
                type="button"
                onClick={() => set('countsTowardAverage', label === 'Oui')}
                className={`px-3 py-1.5 text-xs font-semibold ${active ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {current?.teacher && (
        <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
          <Avatar name={current.teacher.name} size={22} />
          <span className="text-xs text-muted-foreground">
            Enseignant responsable :{' '}
            <strong className="text-foreground">{current.teacher.name}</strong>
          </span>
        </div>
      )}

      <Field
        label="Remarques (optionnel)"
        placeholder="Notes internes visibles par les administrateurs et enseignants"
        value={value.notes ?? ''}
        onChange={(e) => set('notes', e.target.value || null)}
      />
    </div>
  );
}
