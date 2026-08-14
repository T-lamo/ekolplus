'use client';

// Orchestrator for the 3-step "nouvelle année" (academic-year rollover)
// wizard. OWNER-only, self-gated (see the role check below) since this
// route can be navigated to directly. Wires Step1NewYear / Step2Promotion /
// Step3Summary to the draft CRUD + confirm API routes, autosaving each
// step's data into the single per-school
// AcademicYearRolloverDraft as the user progresses.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { FormStepsBar, type FormStep } from '@/components/school/FormStepsBar';
import { Step1NewYear } from './Step1NewYear';
import { Step2Promotion } from './Step2Promotion';
import { Step3Summary } from './Step3Summary';
import { ACADEMIC_YEAR_ROLLOVER } from '@/lib/constants';
import type { SchoolResponse } from '../types';
import type {
  RolloverDraft,
  WizardStep,
  ClassForPromotion,
  StudentForPromotion,
  ClassMappingEntry,
  StudentExceptionEntry,
  PromotionStats,
} from './types';

/** Wire shape of the `draft` field returned by GET/POST/PATCH
 * /api/school/academic-year-rollover. Dates travel as ISO strings over
 * JSON — `RolloverDraft`'s `Date` fields are the server-side shape, not
 * what actually lands here. */
interface DraftPayload {
  id: string;
  newYearLabel: string;
  newYearStartDate: string;
  newYearEndDate: string;
  classMapping: Record<string, ClassMappingEntry>;
  studentExceptions: Record<string, StudentExceptionEntry>;
}

interface RolloverGetResponse {
  draft: DraftPayload | null;
  activeYear: { id: string; label: string };
  classes: ClassForPromotion[];
  students: StudentForPromotion[];
}

/** Shape Step1NewYear's `draft` prop expects. */
type Step1DraftProp = Omit<RolloverDraft, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>;

type LoadState = 'loading' | 'ready' | 'noActiveYear' | 'error';

const WIZARD_STEPS: FormStep[] = [
  { id: 'step1', label: ACADEMIC_YEAR_ROLLOVER.step1.title },
  { id: 'step2', label: ACADEMIC_YEAR_ROLLOVER.step2.title },
  { id: 'step3', label: ACADEMIC_YEAR_ROLLOVER.step3.title },
];

interface Step3StudentView {
  id: string;
  firstName: string;
  lastName: string;
  status: 'promu' | 'exception' | 'nonreinscrit';
  destClassName?: string;
}

/** Mirrors `computeStats`'s exception > class-mapping > unenrolled
 * precedence exactly — see `computeStats` in
 * frontend/src/lib/server/academic-year-rollover.ts, which is the
 * authoritative source of truth but can't be imported here (`server-only`).
 * Keep this in sync if that precedence ever changes. */
function deriveStep3Students(
  students: StudentForPromotion[],
  classMapping: Record<string, ClassMappingEntry>,
  studentExceptions: Record<string, StudentExceptionEntry>,
  classes: ClassForPromotion[],
): Step3StudentView[] {
  return students.map((student) => {
    const base = { id: student.id, firstName: student.firstName, lastName: student.lastName };
    const exception = studentExceptions[student.id];

    if (exception?.skip) {
      return { ...base, status: 'nonreinscrit' as const };
    }
    if (exception?.destClassId) {
      const destClassName =
        classes.find((c) => c.id === exception.destClassId)?.name ?? exception.destClassId;
      return { ...base, status: 'exception' as const, destClassName };
    }

    const mapping = classMapping[student.classId];
    if (mapping?.destClassId || (mapping?.isNew && mapping?.newClass)) {
      const destClassName =
        mapping.newClass?.name ?? classes.find((c) => c.id === mapping.destClassId)?.name;
      // `exactOptionalPropertyTypes` — only set the key when it has a
      // value; an explicit `destClassName: undefined` is rejected.
      return {
        ...base,
        status: 'promu' as const,
        ...(destClassName !== undefined ? { destClassName } : {}),
      };
    }

    return { ...base, status: 'nonreinscrit' as const };
  });
}

function deriveStats(students: Step3StudentView[]): PromotionStats {
  return students.reduce(
    (acc, s) => {
      if (s.status === 'promu') acc.promoted += 1;
      else if (s.status === 'exception') acc.exceptions += 1;
      else acc.unenrolled += 1;
      return acc;
    },
    { promoted: 0, exceptions: 0, unenrolled: 0 },
  );
}

export default function AcademicYearWizardPage() {
  const router = useRouter();
  const user = useUser();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [schoolData, setSchoolData] = useState<SchoolResponse | null>(null);
  const [activeYear, setActiveYear] = useState<{ id: string; label: string } | null>(null);
  const [classes, setClasses] = useState<ClassForPromotion[]>([]);
  const [students, setStudents] = useState<StudentForPromotion[]>([]);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftFields, setDraftFields] = useState<Step1DraftProp | null>(null);
  const [classMapping, setClassMapping] = useState<Record<string, ClassMappingEntry>>({});
  const [studentExceptions, setStudentExceptions] = useState<Record<string, StudentExceptionEntry>>(
    {},
  );

  const [step, setStep] = useState<WizardStep>(1);
  const [maxReachedStep, setMaxReachedStep] = useState<WizardStep>(1);
  const [isLoading, setIsLoading] = useState(false);

  const applyDraft = useCallback((payload: DraftPayload, schoolId: string) => {
    setDraftId(payload.id);
    setDraftFields({
      schoolId,
      newYearLabel: payload.newYearLabel,
      newYearStartDate: new Date(payload.newYearStartDate),
      newYearEndDate: new Date(payload.newYearEndDate),
      classMapping: payload.classMapping,
      studentExceptions: payload.studentExceptions,
    });
    setClassMapping(payload.classMapping);
    setStudentExceptions(payload.studentExceptions);
  }, []);

  useEffect(() => {
    if (!user) return;
    // Captured as a plain string so the async closure below doesn't rely on
    // TS narrowing `user` across the function boundary (it can't — `user`
    // stays typed `User | null` inside `load()`).
    const userId = user.id;
    let cancelled = false;

    async function load() {
      try {
        const school = await api<SchoolResponse>('/api/school');
        if (cancelled) return;

        // OWNER-only gate — mirrors ZoneDangereuseSection's rendering rule
        // in settings/page.tsx. Redirect instead of letting the rollover
        // API's own 404 surface, for a cleaner UX (no flash of error).
        const myRole = school.members.find((m) => m.userId === userId)?.role ?? null;
        if (myRole !== 'OWNER') {
          router.replace('/settings');
          return;
        }
        setSchoolData(school);

        const rollover = await api<RolloverGetResponse>('/api/school/academic-year-rollover');
        if (cancelled) return;

        setActiveYear(rollover.activeYear);
        setClasses(rollover.classes);
        setStudents(rollover.students);
        if (rollover.draft) {
          // A draft already exists — resume at step 1 regardless of prior
          // progress. There's no persisted "current step" field on the
          // draft, so this is the simplest correct behavior.
          applyDraft(rollover.draft, school.school.id);
        }
        setLoadState('ready');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 424) {
          setLoadState('noActiveYear');
        } else {
          setLoadError(err instanceof Error ? err.message : ACADEMIC_YEAR_ROLLOVER.error);
          setLoadState('error');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, router, applyDraft]);

  const step3Students = useMemo(
    () => deriveStep3Students(students, classMapping, studentExceptions, classes),
    [students, classMapping, studentExceptions, classes],
  );
  const stats = useMemo(() => deriveStats(step3Students), [step3Students]);

  function goToStep(next: WizardStep) {
    setStep(next);
    setMaxReachedStep((prev) => (prev >= next ? prev : next));
  }

  async function handleStep1Save(data: {
    newYearLabel: string;
    newYearStartDate: string;
    newYearEndDate: string;
  }) {
    if (!schoolData) return;
    setIsLoading(true);
    try {
      const response = await api<{ draft: DraftPayload }>('/api/school/academic-year-rollover', {
        method: draftId ? 'PATCH' : 'POST',
        body: data,
      });
      applyDraft(response.draft, schoolData.school.id);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStep2Save(mapping: Record<string, ClassMappingEntry>) {
    if (!schoolData) return;
    setIsLoading(true);
    try {
      const response = await api<{ draft: DraftPayload }>('/api/school/academic-year-rollover', {
        method: 'PATCH',
        body: { classMapping: mapping },
      });
      applyDraft(response.draft, schoolData.school.id);
    } finally {
      setIsLoading(false);
    }
  }

  function handleMappingChange(classId: string, mapping: ClassMappingEntry) {
    setClassMapping((prev) => ({ ...prev, [classId]: mapping }));
  }

  async function handleConfirm(confirmName: string) {
    setIsLoading(true);
    try {
      await api<{ newAcademicYearId: string }>('/api/school/academic-year-rollover/confirm', {
        method: 'POST',
        body: { confirmName },
      });
      router.push('/dashboard');
    } finally {
      setIsLoading(false);
    }
  }

  if (!user || loadState === 'loading') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-4">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  if (loadState === 'noActiveYear') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <p className="text-sm text-muted-foreground">{ACADEMIC_YEAR_ROLLOVER.emptyState}</p>
        <Button onClick={() => router.push('/settings')}>
          {ACADEMIC_YEAR_ROLLOVER.backToSettings}
        </Button>
      </div>
    );
  }

  if (loadState === 'error' || !schoolData || !activeYear) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <p role="alert" className="text-sm text-destructive-foreground">
          {loadError || ACADEMIC_YEAR_ROLLOVER.error}
        </p>
        <Button onClick={() => router.push('/settings')}>
          {ACADEMIC_YEAR_ROLLOVER.backToSettings}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{ACADEMIC_YEAR_ROLLOVER.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ACADEMIC_YEAR_ROLLOVER.subtitle(activeYear.label, draftFields?.newYearLabel || '—')}
        </p>
      </div>

      <div className="rounded-lg border border-warning bg-warning/5 p-3 text-xs text-warning">
        {ACADEMIC_YEAR_ROLLOVER.warningBanner}
      </div>

      <FormStepsBar
        steps={WIZARD_STEPS}
        activeIndex={step - 1}
        maxReachedIndex={maxReachedStep - 1}
        onStepSelect={(index) => setStep((index + 1) as WizardStep)}
      />

      <div>
        {step === 1 && (
          <Step1NewYear
            draft={draftFields}
            onSave={handleStep1Save}
            onNext={() => goToStep(2)}
            isLoading={isLoading}
          />
        )}
        {step === 2 && (
          <Step2Promotion
            classes={classes}
            // The new AcademicYear (and therefore any real destination
            // `Class` rows) doesn't exist until confirm runs
            // `executeRollover` — so at Step 2 editing time there are no
            // valid pre-existing destination classes to offer. "Créer
            // nouvelle" is the only real path in v1. Passing the source
            // `classes` list here instead would let a class be "promoted"
            // into itself.
            allClasses={[]}
            activeMapping={classMapping}
            onMappingChange={handleMappingChange}
            onSave={handleStep2Save}
            onNext={() => goToStep(3)}
            isLoading={isLoading}
          />
        )}
        {step === 3 && (
          <Step3Summary
            stats={stats}
            students={step3Students}
            oldYearLabel={activeYear.label}
            newYearLabel={draftFields?.newYearLabel ?? ''}
            schoolName={schoolData.school.name}
            onConfirm={handleConfirm}
            isLoading={isLoading}
          />
        )}
      </div>

      <Button variant="ghost" onClick={() => router.push('/settings')}>
        {ACADEMIC_YEAR_ROLLOVER.backToSettings}
      </Button>
    </div>
  );
}
