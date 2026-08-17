'use client';

// Loads everything the fiche classe needs besides the class itself: active
// subjects (checkbox list), teachers (homeroom picker + their subjects),
// the school's grade-level catalog, the rooms catalogue, the active year
// (label / grading scale / terms) and the active bulletin template. One hook
// for create + edit.
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { GradeLevelRow } from '@/app/(school)/configuration/classes/types';
import type { RoomRow } from '@/lib/rooms';
import type { ClassFormOptions, ClassFormTeacher } from './ClassForm';
import type { ClassFormSubject } from './useClassForm';

interface SubjectRow {
  id: string;
  name: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  isActive: boolean;
  defaultCoefficient: number | null;
  abbreviation: string | null;
  code: string | null;
  color: string | null;
}
interface SchoolPayload {
  academicYear: {
    label: string;
    gradingScale: string | null;
    terms: { type: string }[];
  } | null;
}
interface TemplateRow {
  id: string;
  name: string;
  isActive: boolean;
}

const TERM_TYPE_LABEL: Record<string, string> = {
  TRIMESTRE: 'trimestre',
  SEMESTRE: 'semestre',
  LIBRE: 'période',
};

export type ClassFormBaseOptions = Omit<ClassFormOptions, 'studentCount'>;

export function useClassFormData(enabled: boolean) {
  const [options, setOptions] = useState<ClassFormBaseOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noSchool, setNoSchool] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    Promise.all([
      api<{ subjects: SubjectRow[] }>('/api/school/subjects'),
      api<{ teachers: ClassFormTeacher[] }>('/api/school/teachers'),
      api<{ levels: GradeLevelRow[] }>('/api/school/grade-levels'),
      api<SchoolPayload>('/api/school'),
      api<{ personal: TemplateRow[]; global: TemplateRow[] }>('/api/school/bulletin-templates'),
      api<{ rooms: RoomRow[] }>('/api/school/rooms'),
    ])
      .then(([s, t, g, school, tpl, rm]) => {
        if (cancelled) return;
        const subjects: ClassFormSubject[] = s.subjects
          .filter((row) => row.status === 'ACTIVE' && row.isActive)
          .map((row) => ({
            id: row.id,
            name: row.name,
            defaultCoefficient: row.defaultCoefficient,
            abbreviation: row.abbreviation ?? row.code ?? null,
            color: row.color ?? null,
          }));
        const year = school.academicYear;
        const termType = year?.terms[0]?.type ?? null;
        const activeTemplate =
          tpl.personal.find((x) => x.isActive) ?? tpl.global.find((x) => x.isActive) ?? null;
        setOptions({
          teachers: t.teachers.map((row) => ({
            id: row.id,
            name: row.name,
            photoUrl: row.photoUrl,
            subjects: row.subjects ?? [],
          })),
          subjects,
          levelCatalog: [...g.levels].sort((a, b) => a.order - b.order).map((l) => l.name),
          rooms: rm.rooms,
          yearLabel: year?.label ?? null,
          grading: {
            scale: year?.gradingScale ?? null,
            termCount: year?.terms.length ?? 0,
            termType: termType ? (TERM_TYPE_LABEL[termType] ?? 'période') : null,
            bulletinTemplate: activeTemplate?.name ?? null,
          },
        });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          setNoSchool(true);
          return;
        }
        setError('Impossible de charger les données du formulaire.');
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { options, error, noSchool };
}
