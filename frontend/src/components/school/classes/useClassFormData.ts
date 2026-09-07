'use client';

// Loads everything the fiche classe needs besides the class itself: active
// subjects (checkbox list), teachers (homeroom picker + their subjects),
// the school's grade-level catalog, the rooms catalogue, the active year
// (label / grading scale / terms) and the active bulletin template. One hook
// for create + edit.
import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
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

export type ClassFormBaseOptions = Omit<ClassFormOptions, 'studentCount'>;

type PeriodTypesT = (key: `periodTypes.${'TRIMESTRE' | 'SEMESTRE' | 'LIBRE'}`) => string;

function termTypeLabels(t: PeriodTypesT): Record<string, string> {
  return {
    TRIMESTRE: t('periodTypes.TRIMESTRE'),
    SEMESTRE: t('periodTypes.SEMESTRE'),
    LIBRE: t('periodTypes.LIBRE'),
  };
}

export function useClassFormData(enabled: boolean) {
  const t = useTranslations('Configuration.classes.form.notes');
  const tLoadError = useTranslations('Configuration.classes.form');
  const TERM_TYPE_LABEL = termTypeLabels(t);
  const [error, setError] = useState<string | null>(null);
  const [noSchool, setNoSchool] = useState(false);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
        setNoSchool(true);
        return true;
      }
      setError(tLoadError('loadError'));
      return true;
    },
    [tLoadError],
  );

  const { data: subjectsData } = useApi<{ subjects: SubjectRow[] }>('/api/school/subjects', {
    skip: !enabled,
    onError: handleError,
  });
  const { data: teachersData } = useApi<{ teachers: ClassFormTeacher[] }>('/api/school/teachers', {
    skip: !enabled,
    onError: handleError,
  });
  const { data: levelsData } = useApi<{ levels: GradeLevelRow[] }>('/api/school/grade-levels', {
    skip: !enabled,
    onError: handleError,
  });
  const { data: schoolData } = useApi<SchoolPayload>('/api/school', {
    skip: !enabled,
    onError: handleError,
  });
  const { data: templatesData } = useApi<{ personal: TemplateRow[]; global: TemplateRow[] }>(
    '/api/school/bulletin-templates',
    { skip: !enabled, onError: handleError },
  );
  const { data: roomsData } = useApi<{ rooms: RoomRow[] }>('/api/school/rooms', {
    skip: !enabled,
    onError: handleError,
  });

  const options = useMemo<ClassFormBaseOptions | null>(() => {
    if (
      !subjectsData ||
      !teachersData ||
      !levelsData ||
      !schoolData ||
      !templatesData ||
      !roomsData
    ) {
      return null;
    }
    const subjects: ClassFormSubject[] = subjectsData.subjects
      .filter((row) => row.status === 'ACTIVE' && row.isActive)
      .map((row) => ({
        id: row.id,
        name: row.name,
        defaultCoefficient: row.defaultCoefficient,
        abbreviation: row.abbreviation ?? row.code ?? null,
        color: row.color ?? null,
      }));
    const year = schoolData.academicYear;
    const termType = year?.terms[0]?.type ?? null;
    const activeTemplate =
      templatesData.personal.find((x) => x.isActive) ??
      templatesData.global.find((x) => x.isActive) ??
      null;
    return {
      teachers: teachersData.teachers.map((row) => ({
        id: row.id,
        name: row.name,
        photoUrl: row.photoUrl,
        subjects: row.subjects ?? [],
      })),
      subjects,
      levelCatalog: [...levelsData.levels].sort((a, b) => a.order - b.order).map((l) => l.name),
      rooms: roomsData.rooms,
      yearLabel: year?.label ?? null,
      grading: {
        scale: year?.gradingScale ?? null,
        termCount: year?.terms.length ?? 0,
        termType: termType ? (TERM_TYPE_LABEL[termType] ?? t('periodTypes.LIBRE')) : null,
        bulletinTemplate: activeTemplate?.name ?? null,
      },
    };
  }, [
    subjectsData,
    teachersData,
    levelsData,
    schoolData,
    templatesData,
    roomsData,
    TERM_TYPE_LABEL,
    t,
  ]);

  const levelCatalogRows = useMemo(
    () =>
      levelsData
        ? [...levelsData.levels]
            .sort((a, b) => a.order - b.order)
            .map((l) => ({ id: l.id, name: l.name }))
        : [],
    [levelsData],
  );

  return { options, levelCatalogRows, error, noSchool };
}
