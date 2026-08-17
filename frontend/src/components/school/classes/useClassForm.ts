'use client';

// Form state + validation + persistence of the fiche classe (add-class.md).
// Create: one POST with `subjectIds` (pivots created server-side in the same
// tx). Edit: PATCH of the profile fields; subject toggles are persisted on the
// fly through the class-subjects endpoints (same behaviour as the subject
// page's « Classes concernées »), a pivot with grades is locked (409 server-side).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { ClassData, ClassDetail } from '@/app/(school)/configuration/classes/types';

export const OTHER_LEVEL = '__other__';
/** Sentinel of the room select: free-text location instead of a catalogue room. */
export const OTHER_ROOM = '__other__';

export interface ClassFormValues {
  name: string;
  /** Catalog value, or OTHER_LEVEL when typed freely. */
  level: string;
  levelOther: string;
  /** Catalogue room id, OTHER_ROOM for a free-text place, '' for none. */
  roomId: string;
  /** Free-text place (used when roomId === OTHER_ROOM or without catalogue). */
  room: string;
  capacity: string;
  track: string;
  homeroomTeacherId: string | null;
  color: string | null;
  subjectIds: string[];
}

export type ClassFormErrors = Partial<Record<'name' | 'level' | 'capacity', string>>;

export interface ClassFormSubject {
  id: string;
  name: string;
  defaultCoefficient: number | null;
  /** Chip label (abbreviation, else code) — falls back to the name. */
  abbreviation: string | null;
  color: string | null;
}

/** Editable pivot fields of « Détail des matières » (edit mode). */
export interface ClassPivot {
  id: string;
  subjectId: string;
  teacherId: string | null;
  coefficient: number | null;
  weeklyHours: number | null;
  locked: boolean;
}

function initialValues(
  cls: ClassDetail | null | undefined,
  catalog: string[],
  roomIds: string[],
): ClassFormValues {
  const level = cls?.level ?? '';
  const inCatalog = level !== '' && catalog.includes(level);
  const room = cls?.room ?? '';
  const catalogRoomId = cls?.roomId && roomIds.includes(cls.roomId) ? cls.roomId : null;
  return {
    name: cls?.name ?? '',
    level: level === '' ? '' : inCatalog || catalog.length === 0 ? level : OTHER_LEVEL,
    levelOther: level !== '' && !inCatalog && catalog.length > 0 ? level : '',
    // Catalogue room → its id ; free-text room with a catalogue → « Autre lieu… » ;
    // no catalogue → plain text field.
    roomId: catalogRoomId ?? (room !== '' && roomIds.length > 0 ? OTHER_ROOM : ''),
    room: catalogRoomId ? '' : room,
    capacity: cls?.capacity != null ? String(cls.capacity) : '',
    track: cls?.track ?? '',
    homeroomTeacherId: cls?.homeroomTeacher?.id ?? null,
    color: cls?.color ?? null,
    subjectIds: cls?.subjectIds ?? [],
  };
}

export function effectiveLevel(v: ClassFormValues): string {
  return (v.level === OTHER_LEVEL ? v.levelOther : v.level).trim();
}

/** Displayed room label: catalogue name, or the free-text place. */
export function effectiveRoom(v: ClassFormValues, rooms: { id: string; name: string }[]): string {
  if (v.roomId && v.roomId !== OTHER_ROOM) {
    return rooms.find((r) => r.id === v.roomId)?.name ?? '';
  }
  return v.room.trim();
}

export function validate(v: ClassFormValues): ClassFormErrors {
  const errors: ClassFormErrors = {};
  if (v.name.trim().length < 1) errors.name = 'Le nom est requis.';
  else if (v.name.trim().length > 40) errors.name = '40 caractères maximum.';
  if (effectiveLevel(v).length < 1) errors.level = 'Le niveau est requis.';
  const cap = Number(v.capacity);
  if (v.capacity.trim() === '') errors.capacity = 'La capacité est requise.';
  else if (!Number.isInteger(cap) || cap < 1 || cap > 500)
    errors.capacity = 'Nombre entier entre 1 et 500.';
  return errors;
}

export function useClassForm({
  cls,
  levelCatalog,
  roomIds,
  subjects,
  onSaved,
}: {
  /** null/undefined = create mode. */
  cls?: ClassDetail | null;
  levelCatalog: string[];
  /** Ids of the catalogue rooms offered by the form (configuration/salles). */
  roomIds: string[];
  subjects: ClassFormSubject[];
  onSaved: (cls: ClassData) => void;
}) {
  const mode: 'create' | 'edit' = cls ? 'edit' : 'create';
  const [values, setValues] = useState<ClassFormValues>(() =>
    initialValues(cls, levelCatalog, roomIds),
  );
  const [errors, setErrors] = useState<ClassFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pivotBySubject, setPivotBySubject] = useState<Record<string, string>>(
    cls?.classSubjectIdBySubject ?? {},
  );
  const [pivots, setPivots] = useState<Record<string, ClassPivot>>(() =>
    Object.fromEntries((cls?.classSubjects ?? []).map((p) => [p.subjectId, p])),
  );
  const [pivotBusy, setPivotBusy] = useState<string | null>(null);
  const [subjectError, setSubjectError] = useState<string | null>(null);

  // Re-seed only when the entity (or the catalog it depends on) changes.
  const clsId = cls?.id ?? null;
  const catalogKey = `${levelCatalog.join('|')}#${roomIds.join('|')}`;
  useEffect(() => {
    setValues(initialValues(cls, levelCatalog, roomIds));
    setPivotBySubject(cls?.classSubjectIdBySubject ?? {});
    setPivots(Object.fromEntries((cls?.classSubjects ?? []).map((p) => [p.subjectId, p])));
    setErrors({});
  }, [clsId, catalogKey]);

  const setField = useCallback(
    <K extends keyof ClassFormValues>(key: K, value: ClassFormValues[K]) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => (key in prev ? { ...prev, [key]: undefined } : prev));
    },
    [],
  );

  const lockedSubjectIds = useMemo(() => new Set(cls?.lockedSubjectIds ?? []), [cls]);

  /** Create: local; edit: persisted immediately (upsert / delete pivot). */
  const toggleSubject = useCallback(
    async (subjectId: string, checked: boolean) => {
      setSubjectError(null);
      if (mode === 'create' || !cls) {
        setValues((prev) => ({
          ...prev,
          subjectIds: checked
            ? [...new Set([...prev.subjectIds, subjectId])]
            : prev.subjectIds.filter((id) => id !== subjectId),
        }));
        return;
      }
      if (!checked && lockedSubjectIds.has(subjectId)) return;
      const subject = subjects.find((s) => s.id === subjectId);
      // Optimistic flip, rolled back on error.
      setValues((prev) => ({
        ...prev,
        subjectIds: checked
          ? [...new Set([...prev.subjectIds, subjectId])]
          : prev.subjectIds.filter((id) => id !== subjectId),
      }));
      try {
        if (checked) {
          const res = await api<{
            classSubject: {
              id: string;
              teacherId: string | null;
              coefficient: number | null;
              weeklyHours: number | null;
            };
          }>('/api/school/class-subjects', {
            method: 'POST',
            body: { classId: cls.id, subjectId, coefficient: subject?.defaultCoefficient ?? null },
          });
          setPivotBySubject((prev) => ({ ...prev, [subjectId]: res.classSubject.id }));
          setPivots((prev) => ({
            ...prev,
            [subjectId]: {
              id: res.classSubject.id,
              subjectId,
              teacherId: res.classSubject.teacherId ?? null,
              coefficient: res.classSubject.coefficient ?? null,
              weeklyHours: res.classSubject.weeklyHours ?? null,
              locked: false,
            },
          }));
        } else {
          const pivotId = pivotBySubject[subjectId];
          if (pivotId) await api(`/api/school/class-subjects/${pivotId}`, { method: 'DELETE' });
          setPivotBySubject((prev) => {
            const next = { ...prev };
            delete next[subjectId];
            return next;
          });
          setPivots((prev) => {
            const next = { ...prev };
            delete next[subjectId];
            return next;
          });
        }
      } catch (err) {
        setValues((prev) => ({
          ...prev,
          subjectIds: checked
            ? prev.subjectIds.filter((id) => id !== subjectId)
            : [...new Set([...prev.subjectIds, subjectId])],
        }));
        setSubjectError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
      }
    },
    [mode, cls, lockedSubjectIds, subjects, pivotBySubject],
  );

  /** Multi-select handler: toggles every id that changed, one at a time. */
  const setSubjectIds = useCallback(
    async (ids: string[]) => {
      const current = new Set(values.subjectIds);
      const next = new Set(ids);
      const added = ids.filter((id) => !current.has(id));
      const removed = values.subjectIds.filter((id) => !next.has(id));
      for (const id of added) await toggleSubject(id, true);
      for (const id of removed) await toggleSubject(id, false);
    },
    [values.subjectIds, toggleSubject],
  );

  /** Edit mode only — inline « Détail des matières » edits (upsert pivot). */
  const updatePivot = useCallback(
    async (
      subjectId: string,
      patch: {
        teacherId?: string | null;
        coefficient?: number | null;
        weeklyHours?: number | null;
      },
    ) => {
      if (!cls) return;
      const before = pivots[subjectId];
      if (!before) return;
      setSubjectError(null);
      setPivotBusy(subjectId);
      setPivots((prev) => {
        const cur = prev[subjectId];
        return cur ? { ...prev, [subjectId]: { ...cur, ...patch } } : prev;
      });
      try {
        await api('/api/school/class-subjects', {
          method: 'POST',
          body: { classId: cls.id, subjectId, ...patch },
        });
      } catch (err) {
        setPivots((prev) => ({ ...prev, [subjectId]: before }));
        setSubjectError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
      } finally {
        setPivotBusy(null);
      }
    },
    [cls, pivots],
  );

  const submit = useCallback(async () => {
    const nextErrors = validate(values);
    setErrors(nextErrors);
    setServerError(null);
    if (Object.keys(nextErrors).length > 0) {
      document
        .querySelector<HTMLElement>('[data-field-error]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    setSubmitting(true);
    try {
      const body = {
        name: values.name.trim(),
        level: effectiveLevel(values),
        // Catalogue room → roomId (the API copies its name into `room`) ;
        // « Autre lieu… » / no catalogue → free text, roomId cleared.
        roomId: values.roomId && values.roomId !== OTHER_ROOM ? values.roomId : null,
        room: values.roomId && values.roomId !== OTHER_ROOM ? null : values.room.trim() || null,
        capacity: Number(values.capacity),
        track: values.track.trim() || null,
        homeroomTeacherId: values.homeroomTeacherId,
        color: values.color,
      };
      const res = cls
        ? await api<{ class: ClassData }>(`/api/school/classes/${cls.id}`, {
            method: 'PATCH',
            body,
          })
        : await api<{ class: ClassData }>('/api/school/classes', {
            method: 'POST',
            body: { ...body, subjectIds: values.subjectIds },
          });
      onSaved({
        ...res.class,
        subjectCount: values.subjectIds.length,
        studentCount: res.class.studentCount ?? cls?.studentCount ?? 0,
      });
      return true;
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [values, cls, onSaved]);

  return {
    mode,
    values,
    setField,
    errors,
    submit,
    submitting,
    serverError,
    toggleSubject,
    setSubjectIds,
    subjectError,
    lockedSubjectIds,
    pivots,
    pivotBusy,
    updatePivot,
  };
}

export type ClassFormController = ReturnType<typeof useClassForm>;
