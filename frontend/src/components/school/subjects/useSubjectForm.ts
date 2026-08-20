'use client';

// Form state + submit for the subject profile (add-matiere.md). Owned by the
// page so the header/footer buttons living outside the form body can drive
// it; `SubjectForm` is the presentational half.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import {
  OTHER_DOMAIN,
  SUBJECT_DOMAINS,
  suggestSubjectCode,
  type SubjectKind,
  type SubjectStatus,
} from '@/app/(school)/configuration/matieres/subject-form.constants';
import type { SubjectDetail, SubjectProfile } from '@/app/(school)/configuration/matieres/types';

export interface SubjectFormValues {
  name: string;
  code: string;
  abbreviation: string;
  domain: string; // catalog value, an existing school domain, or OTHER_DOMAIN
  domainOther: string;
  level: string;
  kind: SubjectKind;
  description: string;
  defaultCoefficient: string;
  maxScore: string;
  passingScore: string;
  totalHours: string;
  hoursCM: string;
  hoursTD: string;
  hoursTP: string;
  evaluationType: string;
  maxCapacity: string;
  includeInAverage: boolean;
  showOnBulletin: boolean;
  responsibleTeacherId: string | null;
  room: string;
  prerequisiteIds: string[];
  eliminatoryScore: string;
  icon: string | null;
  color: string | null;
  status: SubjectStatus;
  classIds: string[]; // create mode only — edit manages assignments live
}

export type SubjectFormErrors = Partial<Record<keyof SubjectFormValues, string>>;

const numOrEmpty = (v: number | null | undefined) => (v == null ? '' : String(v));

export function initialValues(
  subject: SubjectDetail | null,
  knownDomains: string[],
): SubjectFormValues {
  const domain = subject?.domain ?? '';
  const inCatalog = domain === '' || knownDomains.includes(domain);
  return {
    name: subject?.name ?? '',
    code: subject?.code ?? '',
    abbreviation: subject?.abbreviation ?? '',
    domain: inCatalog ? domain : OTHER_DOMAIN,
    domainOther: inCatalog ? '' : domain,
    level: subject?.level ?? '',
    kind: subject?.kind ?? 'REQUIRED',
    description: subject?.description ?? '',
    defaultCoefficient: numOrEmpty(subject?.defaultCoefficient),
    maxScore: String(subject?.maxScore ?? 20),
    passingScore: String(subject?.passingScore ?? 10),
    totalHours: numOrEmpty(subject?.totalHours),
    hoursCM: numOrEmpty(subject?.hoursCM),
    hoursTD: numOrEmpty(subject?.hoursTD),
    hoursTP: numOrEmpty(subject?.hoursTP),
    evaluationType: subject?.evaluationType ?? '',
    maxCapacity: numOrEmpty(subject?.maxCapacity),
    includeInAverage: subject?.includeInAverage ?? true,
    showOnBulletin: subject?.showOnBulletin ?? true,
    responsibleTeacherId: subject?.responsibleTeacherId ?? null,
    room: subject?.room ?? '',
    prerequisiteIds: subject?.prerequisiteIds ?? [],
    eliminatoryScore: numOrEmpty(subject?.eliminatoryScore),
    icon: subject?.icon ?? null,
    color: subject?.color ?? null,
    status: subject?.status ?? 'ACTIVE',
    classIds: subject?.classSubjects.map((cs) => cs.classId) ?? [],
  };
}

function toInt(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

type SubjectFormErrorCode =
  | 'nameTooShort'
  | 'codeRequired'
  | 'domainRequired'
  | 'domainOtherRequired'
  | 'levelRequired'
  | 'coefficientRange'
  | 'maxScoreRange'
  | 'scoreRange'
  | 'evaluationTypeRequired';

export type SubjectFormErrorCodes = Partial<Record<keyof SubjectFormValues, SubjectFormErrorCode>>;

export function validate(v: SubjectFormValues): { codes: SubjectFormErrorCodes; max: number } {
  const errors: SubjectFormErrorCodes = {};
  if (v.name.trim().length < 2) errors.name = 'nameTooShort';
  if (v.code.trim() === '') errors.code = 'codeRequired';
  if (v.domain === '') errors.domain = 'domainRequired';
  if (v.domain === OTHER_DOMAIN && v.domainOther.trim() === '') {
    errors.domainOther = 'domainOtherRequired';
  }
  if (v.level === '') errors.level = 'levelRequired';
  const coeff = toInt(v.defaultCoefficient);
  if (coeff === null || coeff < 1 || coeff > 10) errors.defaultCoefficient = 'coefficientRange';
  const max = toInt(v.maxScore) ?? 20;
  if (max < 1 || max > 100) errors.maxScore = 'maxScoreRange';
  const pass = toInt(v.passingScore);
  if (pass !== null && (pass < 0 || pass > max)) errors.passingScore = 'scoreRange';
  const elim = toInt(v.eliminatoryScore);
  if (elim !== null && (elim < 0 || elim > max)) errors.eliminatoryScore = 'scoreRange';
  if (v.evaluationType === '') errors.evaluationType = 'evaluationTypeRequired';
  return { codes: errors, max };
}

type SubjectFormErrorsT = (
  key: `errors.${SubjectFormErrorCode}`,
  values?: { max?: number },
) => string;

function translateErrors(
  codes: SubjectFormErrorCodes,
  max: number,
  t: SubjectFormErrorsT,
): SubjectFormErrors {
  const errors: SubjectFormErrors = {};
  for (const key of Object.keys(codes) as (keyof SubjectFormValues)[]) {
    const code = codes[key];
    if (!code) continue;
    errors[key] = t(`errors.${code}`, code === 'scoreRange' ? { max } : {});
  }
  return errors;
}

/** Maps form strings to the JSON body accepted by POST/PATCH /api/school/subjects. */
export function toBody(v: SubjectFormValues, status: SubjectStatus) {
  const domain = v.domain === OTHER_DOMAIN ? v.domainOther.trim() : v.domain;
  return {
    name: v.name.trim(),
    code: v.code.trim() || null,
    abbreviation: v.abbreviation.trim() || null,
    domain: domain || null,
    level: v.level || null,
    kind: v.kind,
    description: v.description.trim() || null,
    defaultCoefficient: toInt(v.defaultCoefficient),
    maxScore: toInt(v.maxScore) ?? 20,
    passingScore: toInt(v.passingScore) ?? 10,
    totalHours: toInt(v.totalHours),
    hoursCM: toInt(v.hoursCM),
    hoursTD: toInt(v.hoursTD),
    hoursTP: toInt(v.hoursTP),
    evaluationType: v.evaluationType || null,
    maxCapacity: toInt(v.maxCapacity),
    includeInAverage: v.includeInAverage,
    showOnBulletin: v.showOnBulletin,
    responsibleTeacherId: v.responsibleTeacherId,
    room: v.room || null,
    prerequisiteIds: v.prerequisiteIds,
    eliminatoryScore: toInt(v.eliminatoryScore),
    icon: v.icon,
    color: v.color,
    status,
  };
}

export function useSubjectForm({
  subject,
  existingCodes,
  schoolDomains,
  onSaved,
}: {
  subject: SubjectDetail | null;
  /** Codes already used by the school (for the auto-suggested code). */
  existingCodes: (string | null)[];
  /** Domains already saved by the school — merged with the base catalog. */
  schoolDomains: string[];
  onSaved: (subject: SubjectProfile, intent: 'draft' | 'publish') => void;
}) {
  const t = useTranslations('Configuration.matieres.form');
  const tCommon = useTranslations('Common');
  const domainOptions = useMemo(
    () => [...new Set<string>([...SUBJECT_DOMAINS, ...schoolDomains])],
    [schoolDomains],
  );
  const [values, setValues] = useState<SubjectFormValues>(() =>
    initialValues(subject, domainOptions),
  );
  const [errors, setErrors] = useState<SubjectFormErrors>({});
  const [submitting, setSubmitting] = useState<'draft' | 'publish' | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [codeTouched, setCodeTouched] = useState(!!subject?.code);

  // Re-seed only when the loaded subject changes (edit page hydration), not
  // on every refetch — a refetch after "Classes concernées" toggles must not
  // wipe unsaved edits in the other fields.
  const subjectId = subject?.id ?? null;
  useEffect(() => {
    if (subject && subject.id === subjectId) setValues(initialValues(subject, domainOptions));
  }, [subjectId]);

  const setField = useCallback(
    <K extends keyof SubjectFormValues>(key: K, value: SubjectFormValues[K]) => {
      setValues((prev) => {
        const next = { ...prev, [key]: value };
        // "Code court unique (généré automatiquement)" — follows the name
        // until the user edits the code themselves.
        if (key === 'name' && !codeTouched) {
          next.code = suggestSubjectCode(String(value), existingCodes);
        }
        return next;
      });
      if (key === 'code') setCodeTouched(true);
      setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    },
    [codeTouched, existingCodes],
  );

  const submit = useCallback(
    async (intent: 'draft' | 'publish') => {
      setServerError(null);
      const status: SubjectStatus = intent === 'draft' ? 'DRAFT' : values.status;
      const { codes: nextCodes, max } =
        intent === 'draft' ? { codes: {}, max: 20 } : validate(values);
      if (intent === 'draft' && values.name.trim().length < 2) {
        nextCodes.name = 'nameTooShort';
      }
      if (Object.keys(nextCodes).length > 0) {
        setErrors(translateErrors(nextCodes, max, t));
        const first = document.querySelector<HTMLElement>('[data-field-error="true"]');
        first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      setSubmitting(intent);
      try {
        const body = toBody(values, status);
        const res = subject
          ? await api<{ subject: SubjectProfile }>(`/api/school/subjects/${subject.id}`, {
              method: 'PATCH',
              body,
            })
          : await api<{ subject: SubjectProfile }>('/api/school/subjects', {
              method: 'POST',
              body: { ...body, classIds: values.classIds },
            });
        onSaved(res.subject, intent);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'SUBJECT_CODE_TAKEN') {
          setErrors((prev) => ({ ...prev, code: err.message }));
        } else {
          setServerError(err instanceof ApiError ? err.message : tCommon('errors.network'));
        }
      } finally {
        setSubmitting(null);
      }
    },
    [values, subject, onSaved, t, tCommon],
  );

  return { values, setField, errors, submit, submitting, serverError, domainOptions };
}

export type SubjectFormController = ReturnType<typeof useSubjectForm>;
