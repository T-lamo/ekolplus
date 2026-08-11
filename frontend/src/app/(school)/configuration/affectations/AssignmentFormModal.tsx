'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TeacherPicker, type TeacherOption } from '@/components/school/TeacherPicker';
import type { AssignmentRow, ClassOption, SubjectOption } from './types';

export function AssignmentFormModal({
  assignment,
  classes,
  subjects,
  existingRows,
  teachers,
  onTeacherCreated,
  onClose,
  onSaved,
}: {
  assignment: AssignmentRow | null;
  classes: ClassOption[];
  subjects: SubjectOption[];
  existingRows: AssignmentRow[];
  teachers: TeacherOption[];
  onTeacherCreated: (teacher: TeacherOption) => void;
  onClose: () => void;
  onSaved: (row: AssignmentRow) => void;
}) {
  const { toast } = useToast();
  const [classId, setClassId] = useState(assignment?.classId ?? classes[0]?.id ?? '');
  const [subjectId, setSubjectId] = useState(assignment?.subjectId ?? subjects[0]?.id ?? '');
  const [teacherId, setTeacherId] = useState<string | null>(assignment?.teacher?.id ?? null);
  const [weeklyHours, setWeeklyHours] = useState(assignment?.weeklyHours?.toString() ?? '');
  const [coefficient, setCoefficient] = useState(assignment?.coefficient?.toString() ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = assignment !== null;

  const duplicate = useMemo(() => {
    if (locked) return null;
    return existingRows.find((r) => r.classId === classId && r.subjectId === subjectId) ?? null;
  }, [locked, existingRows, classId, subjectId]);

  function onPairChange(nextClassId: string, nextSubjectId: string) {
    setClassId(nextClassId);
    setSubjectId(nextSubjectId);
    const found = existingRows.find(
      (r) => r.classId === nextClassId && r.subjectId === nextSubjectId,
    );
    setTeacherId(found?.teacher?.id ?? null);
    setWeeklyHours(found?.weeklyHours?.toString() ?? '');
    setCoefficient(found?.coefficient?.toString() ?? '');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<{ classSubject: AssignmentRow }>('/api/school/class-subjects', {
        method: 'POST',
        body: {
          classId,
          subjectId,
          teacherId,
          weeklyHours: weeklyHours ? Number(weeklyHours) : null,
          coefficient: coefficient ? Number(coefficient) : null,
        },
      });
      onSaved(res.classSubject);
      toast('Affectation enregistrée.', 'success');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={assignment ? "Modifier l'affectation" : 'Nouvelle affectation'} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-3.5">
          <Select
            label="Classe"
            value={classId}
            disabled={locked}
            onChange={(e) => onPairChange(e.target.value, subjectId)}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            label="Matière"
            value={subjectId}
            disabled={locked}
            onChange={(e) => onPairChange(classId, e.target.value)}
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>

        {duplicate && (
          <p className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">
            Cette matière est déjà affectée à cette classe — les valeurs actuelles ont été chargées.
          </p>
        )}

        <TeacherPicker
          label="Enseignant"
          teachers={teachers}
          value={teacherId}
          onChange={setTeacherId}
          onTeacherCreated={onTeacherCreated}
        />

        <div className="grid grid-cols-2 gap-3.5">
          <Field
            label="Volume horaire (h/semaine)"
            type="number"
            min={0.5}
            step={0.5}
            value={weeklyHours}
            onChange={(e) => setWeeklyHours(e.target.value)}
          />
          <Field
            label="Coefficient"
            type="number"
            min={1}
            max={10}
            value={coefficient}
            onChange={(e) => setCoefficient(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <Button type="submit" loading={submitting}>
          {submitting ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </form>
    </Modal>
  );
}
