'use client';

import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Select, SelectItem } from '@/components/ui/Select';
import { ACADEMIC_YEAR_ROLLOVER } from '@/lib/constants';
import type { ClassForPromotion, ClassMappingEntry } from './types';
import { hasDestination, suggestPromotions, type GradeLevelOption } from './suggest-promotions';

type NewClassPayload = NonNullable<ClassMappingEntry['newClass']>;

interface Step2PromotionProps {
  classes: ClassForPromotion[];
  /** School's ordered level catalog (Configuration → Niveaux). Empty →
   * the suggest button is a no-op and a hint points to the config page. */
  gradeLevels: GradeLevelOption[];
  allClasses: ClassForPromotion[];
  activeMapping: Record<string, ClassMappingEntry>;
  onMappingChange: (classId: string, mapping: ClassMappingEntry) => void;
  onSave: (mapping: Record<string, ClassMappingEntry>) => Promise<void>;
  onNext: () => void;
  isLoading?: boolean;
}

/** "Créer nouvelle" inline form — modeled on `AnneeScolaireTab.tsx`'s
 * `NouvellePeriodeModal` (Modal + Field + outline/primary Button footer).
 * `homeroomTeacherId` is intentionally omitted: this component has no
 * teacher list in its props, and wiring a teacher-picker here is out of
 * scope for this task (see task-10 report). */
function CreateClassModal({
  initial,
  existingNames,
  onCreate,
  onClose,
}: {
  initial: NewClassPayload | undefined;
  /** Every other row's `activeMapping[*].newClass?.name` — used to warn
   * about a same-name collision client-side (case-sensitive exact match).
   * Server-side, `executeRollover` now dedupes same-name creates by reusing
   * the first one (see academic-year-rollover.ts's implementer note), so a
   * collision no longer crashes the rollover — but a clear message here is
   * better UX than silently merging behind the user's back. */
  existingNames: string[];
  onCreate: (newClass: NewClassPayload) => void;
  onClose: () => void;
}) {
  const t = ACADEMIC_YEAR_ROLLOVER.createNewClass;
  const [name, setName] = useState(initial?.name ?? '');
  const [level, setLevel] = useState(initial?.level ?? '');
  const [room, setRoom] = useState(initial?.room ?? '');
  const [capacity, setCapacity] = useState(initial?.capacity ? String(initial.capacity) : '');
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName || !level.trim()) {
      setError('Le nom et le niveau sont requis.');
      return;
    }

    if (existingNames.includes(trimmedName)) {
      setError(`Une autre classe utilise déjà le nom « ${trimmedName} ».`);
      return;
    }

    let parsedCapacity: number | undefined;
    if (capacity.trim()) {
      parsedCapacity = Number(capacity);
      if (Number.isNaN(parsedCapacity) || parsedCapacity <= 0) {
        setError('La capacité doit être un nombre positif.');
        return;
      }
    }

    onCreate({
      name: trimmedName,
      level: level.trim(),
      ...(room.trim() ? { room: room.trim() } : {}),
      ...(parsedCapacity !== undefined ? { capacity: parsedCapacity } : {}),
    });
  }

  return (
    <Modal title={t.title} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <Field label={t.name} value={name} onChange={(e) => setName(e.target.value)} />
        <Field label={t.level} value={level} onChange={(e) => setLevel(e.target.value)} />

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field label={t.room} value={room} onChange={(e) => setRoom(e.target.value)} />
          <Field
            label={t.capacity}
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" className="w-fit" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" className="w-fit gap-1.5">
            <Plus size={13} />
            {t.create}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function Step2Promotion({
  classes,
  gradeLevels,
  allClasses,
  activeMapping,
  onMappingChange,
  onSave,
  onNext,
  isLoading = false,
}: Step2PromotionProps) {
  const t = ACADEMIC_YEAR_ROLLOVER.step2;
  const [error, setError] = useState('');
  // Old-class id currently targeted by the "Créer nouvelle" modal, or null
  // when closed. Re-opening on a row that already has an `isNew` mapping
  // prefills the form so "Créer nouvelle" doubles as "modifier".
  const [creatingForClassId, setCreatingForClassId] = useState<string | null>(null);
  // Feedback line under the suggest button ("N classes pré-remplies" /
  // "aucune…"). Cleared on the next click.
  const [suggestNotice, setSuggestNotice] = useState<string | null>(null);

  const handleSuggestAll = () => {
    setError('');
    const suggestions = suggestPromotions(classes, gradeLevels, activeMapping);
    // `onMappingChange` is a functional setState in the parent, so a burst
    // of calls in one tick doesn't clobber itself.
    for (const s of suggestions) onMappingChange(s.classId, s.entry);
    setSuggestNotice(suggestions.length > 0 ? t.suggestApplied(suggestions.length) : t.suggestNone);
  };

  const handleProceed = async () => {
    setError('');

    // Validate all classes have a destination. Mirrors executeRollover's
    // real class-creation guard (see computeStats in
    // academic-year-rollover.ts): an `isNew: true` mapping only counts as a
    // valid destination when `newClass` is also present — otherwise it
    // silently produces zero enrollments for that class server-side.
    // (`hasDestination` in ./suggest-promotions.ts is that exact rule.)
    for (const cls of classes) {
      if (!hasDestination(activeMapping[cls.id])) {
        setError(`${cls.name} n'a pas de classe de destination`);
        return;
      }
    }

    try {
      await onSave(activeMapping);
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    }
  };

  const handleSaveDraft = async () => {
    setError('');
    try {
      await onSave(activeMapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    }
  };

  const creatingForClass = creatingForClassId
    ? (classes.find((c) => c.id === creatingForClassId) ?? null)
    : null;

  return (
    <div className="space-y-4">
      <Card className="gap-3 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{t.help}</p>
          <Button
            type="button"
            variant="outline"
            className="w-fit shrink-0"
            onClick={handleSuggestAll}
            disabled={isLoading || classes.length === 0}
          >
            <Wand2 size={14} />
            {t.suggestAll}
          </Button>
        </div>
        {gradeLevels.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t.suggestHint}{' '}
            <Link
              href="/configuration/niveaux"
              className="font-medium text-primary hover:underline"
            >
              Ouvrir Configuration &gt; Niveaux
            </Link>
          </p>
        )}
        {suggestNotice && (
          <p role="status" className="text-xs text-muted-foreground">
            {suggestNotice}
          </p>
        )}
      </Card>

      <Card className="overflow-x-auto p-4 sm:p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium">{t.currentClass}</th>
              <th className="px-3 py-2 text-left font-medium">{t.studentCount}</th>
              <th className="px-3 py-2 text-left font-medium">{t.currentLevel}</th>
              <th className="px-3 py-2 text-left font-medium">{t.destClass}</th>
              <th className="px-3 py-2 text-left font-medium">{t.createNew}</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((cls) => {
              const mapping = activeMapping[cls.id] || {};

              return (
                <tr key={cls.id} className="border-b border-border">
                  <td className="px-3 py-2 align-top">{cls.name}</td>
                  <td className="px-3 py-2 align-top">{cls.studentCount}</td>
                  <td className="px-3 py-2 align-top">{cls.level}</td>
                  <td className="px-3 py-2 align-top">
                    {mapping.isNew && mapping.newClass ? (
                      <div className="flex flex-col gap-0.5 rounded-md border-2 border-dashed border-primary/40 bg-secondary px-3 py-2">
                        <span className="text-xs font-semibold text-primary">
                          {mapping.newClass.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {mapping.newClass.level}
                        </span>
                      </div>
                    ) : allClasses.length === 0 ? (
                      // v1: the new year's classes don't exist yet at Step 2
                      // (see page.tsx's `allClasses={[]}` comment) — an
                      // empty dropdown whose only option is "--" would
                      // falsely imply an existing-class pick is possible.
                      <p className="text-xs text-muted-foreground">{t.noExistingClasses}</p>
                    ) : (
                      <Select
                        label={t.destClass}
                        value={mapping.destClassId ?? ''}
                        onValueChange={(value) =>
                          onMappingChange(
                            cls.id,
                            value ? { destClassId: value, isNew: false } : { isNew: false },
                          )
                        }
                      >
                        <SelectItem value="">--</SelectItem>
                        {allClasses.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} ({c.level})
                          </SelectItem>
                        ))}
                      </Select>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {mapping.isNew ? (
                      <button
                        type="button"
                        onClick={() => setCreatingForClassId(cls.id)}
                        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground whitespace-nowrap transition-colors hover:border-primary hover:bg-secondary"
                      >
                        <Pencil size={12} />
                        {ACADEMIC_YEAR_ROLLOVER.actions.editDestination}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCreatingForClassId(cls.id)}
                        className="flex items-center gap-1.5 rounded-md border-2 border-dashed border-border px-3 py-1.5 text-xs font-semibold text-primary whitespace-nowrap transition-colors hover:border-primary hover:bg-secondary"
                      >
                        <Plus size={12} />
                        {t.createNew}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {error && (
        <div className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="rounded-md border border-border bg-muted px-4 py-3 text-xs text-muted-foreground">
        {t.step3Preview}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={handleSaveDraft} disabled={isLoading}>
          {ACADEMIC_YEAR_ROLLOVER.step1.saveAsDraft}
        </Button>
        <Button onClick={handleProceed} disabled={isLoading}>
          {t.nextStep}
        </Button>
      </div>

      {creatingForClass && (
        <CreateClassModal
          initial={activeMapping[creatingForClass.id]?.newClass}
          existingNames={Object.entries(activeMapping)
            .filter(([classId]) => classId !== creatingForClass.id)
            .map(([, mapping]) => mapping.newClass?.name)
            .filter((name): name is string => Boolean(name))}
          onClose={() => setCreatingForClassId(null)}
          onCreate={(newClass) => {
            onMappingChange(creatingForClass.id, { isNew: true, newClass });
            setCreatingForClassId(null);
          }}
        />
      )}
    </div>
  );
}
