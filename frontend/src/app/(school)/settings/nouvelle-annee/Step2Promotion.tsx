'use client';

import { useState, type FormEvent } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Select, SelectItem } from '@/components/ui/Select';
import { ACADEMIC_YEAR_ROLLOVER } from '@/lib/constants';
import type { ClassForPromotion, ClassMappingEntry } from './types';

type NewClassPayload = NonNullable<ClassMappingEntry['newClass']>;

interface Step2PromotionProps {
  classes: ClassForPromotion[];
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
  onCreate,
  onClose,
}: {
  initial: NewClassPayload | undefined;
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

    if (!name.trim() || !level.trim()) {
      setError('Le nom et le niveau sont requis.');
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
      name: name.trim(),
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

  const handleProceed = async () => {
    setError('');

    // Validate all classes have a destination. Mirrors executeRollover's
    // real class-creation guard (see computeStats in
    // academic-year-rollover.ts): an `isNew: true` mapping only counts as a
    // valid destination when `newClass` is also present — otherwise it
    // silently produces zero enrollments for that class server-side.
    for (const cls of classes) {
      const mapping = activeMapping[cls.id];
      const hasDestination =
        Boolean(mapping?.destClassId) || Boolean(mapping?.isNew && mapping?.newClass);
      if (!hasDestination) {
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

  const creatingForClass = creatingForClassId
    ? (classes.find((c) => c.id === creatingForClassId) ?? null)
    : null;

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">{t.help}</p>
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
        <Button variant="outline" onClick={() => onSave(activeMapping)} disabled={isLoading}>
          {ACADEMIC_YEAR_ROLLOVER.step1.saveAsDraft}
        </Button>
        <Button onClick={handleProceed} disabled={isLoading}>
          {t.nextStep}
        </Button>
      </div>

      {creatingForClass && (
        <CreateClassModal
          initial={activeMapping[creatingForClass.id]?.newClass}
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
