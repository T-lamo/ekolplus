'use client';

// Orchestrator for the 4-step "nouvelle année" (academic-year rollover)
// wizard. OWNER-only, self-gated (see the role check below) since this
// route can be navigated to directly. Wires Step1NewYear / Step2Promotion /
// Step3Decisions / Step4Summary to the draft CRUD + confirm API routes,
// autosaving each step's data into the single per-school
// AcademicYearRolloverDraft as the user progresses.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { useUser } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { FormStepsBar, type FormStep } from '@/components/school/FormStepsBar';
import { Step1NewYear } from './Step1NewYear';
import { Step2Promotion } from './Step2Promotion';
import { Step3Decisions } from './Step3Decisions';
import { Step4Summary, type SummaryStudent } from './Step4Summary';
import type { GradeLevelOption } from './suggest-promotions';
import { deriveOutcome, summarizeOutcomes } from './student-decisions';
import { ACADEMIC_YEAR_ROLLOVER } from '@/lib/constants';
import type { SchoolResponse } from '../types';
import type {
  RolloverDraft,
  WizardStep,
  ClassForPromotion,
  StudentForPromotion,
  ClassMappingEntry,
  StudentExceptionEntry,
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
  gradeLevels: GradeLevelOption[];
}

/** Shape Step1NewYear's `draft` prop expects. */
type Step1DraftProp = Omit<RolloverDraft, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>;

type LoadState = 'loading' | 'ready' | 'noActiveYear' | 'error';

const WIZARD_STEPS: FormStep[] = [
  { id: 'step1', label: ACADEMIC_YEAR_ROLLOVER.step1.title },
  { id: 'step2', label: ACADEMIC_YEAR_ROLLOVER.step2.title },
  { id: 'step3', label: ACADEMIC_YEAR_ROLLOVER.step3.title },
  { id: 'step4', label: ACADEMIC_YEAR_ROLLOVER.step4.title },
];

/** Summary rows — one outcome per student, following executeRollover's
 * exception > class-mapping > unenrolled precedence (`deriveOutcome`, shared
 * with Step 3 so both screens always agree). */
function deriveSummaryStudents(
  students: StudentForPromotion[],
  classMapping: Record<string, ClassMappingEntry>,
  studentExceptions: Record<string, StudentExceptionEntry>,
  classes: ClassForPromotion[],
): SummaryStudent[] {
  const classById = new Map(classes.map((c) => [c.id, c]));
  const classOrder = new Map(classes.map((c, i) => [c.id, i]));
  return (
    [...students]
      // Same order as Step 3: by current class, then name.
      .sort(
        (a, b) =>
          (classOrder.get(a.classId) ?? 0) - (classOrder.get(b.classId) ?? 0) ||
          a.lastName.localeCompare(b.lastName, 'fr') ||
          a.firstName.localeCompare(b.firstName, 'fr'),
      )
      .map((student) => {
        const outcome = deriveOutcome(student, classMapping, studentExceptions, classById);
        return {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          status: outcome.status,
          // `exactOptionalPropertyTypes` — only set the key when it has a value.
          ...(outcome.destClassName !== undefined ? { destClassName: outcome.destClassName } : {}),
        };
      })
  );
}

export default function AcademicYearWizardPage() {
  const router = useRouter();
  const user = useUser();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [activeYear, setActiveYear] = useState<{ id: string; label: string } | null>(null);
  const [classes, setClasses] = useState<ClassForPromotion[]>([]);
  const [students, setStudents] = useState<StudentForPromotion[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevelOption[]>([]);

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

  const { data: schoolData } = useApi<SchoolResponse>('/api/school', {
    skip: !user,
    onError: (err) => {
      setLoadError(err instanceof Error ? err.message : ACADEMIC_YEAR_ROLLOVER.error);
      setLoadState('error');
      return true;
    },
  });

  // OWNER-only gate — mirrors ZoneDangereuseSection's rendering rule in
  // settings/page.tsx. Redirect instead of letting the rollover API's own
  // 404 surface, for a cleaner UX (no flash of error).
  const myRole =
    user && schoolData
      ? (schoolData.members.find((m) => m.userId === user.id)?.role ?? null)
      : null;
  const isOwner = myRole === 'OWNER';

  useEffect(() => {
    if (schoolData && myRole !== null && !isOwner) {
      router.replace('/settings');
    }
  }, [schoolData, myRole, isOwner, router]);

  const { data: rolloverData } = useApi<RolloverGetResponse>('/api/school/academic-year-rollover', {
    skip: !schoolData || !isOwner,
    onError: (err) => {
      if (err instanceof ApiError && err.status === 424) {
        setLoadState('noActiveYear');
      } else {
        setLoadError(err instanceof Error ? err.message : ACADEMIC_YEAR_ROLLOVER.error);
        setLoadState('error');
      }
      return true;
    },
  });

  const seededRef = useRef(false);
  useEffect(() => {
    if (rolloverData && schoolData && !seededRef.current) {
      seededRef.current = true;
      setActiveYear(rolloverData.activeYear);
      setClasses(rolloverData.classes);
      setStudents(rolloverData.students);
      setGradeLevels(rolloverData.gradeLevels ?? []);
      if (rolloverData.draft) {
        // A draft already exists — resume at step 1 regardless of prior
        // progress. There's no persisted "current step" field on the
        // draft, so this is the simplest correct behavior.
        applyDraft(rolloverData.draft, schoolData.school.id);
      }
      setLoadState('ready');
    }
  }, [rolloverData, schoolData, applyDraft]);

  const summaryStudents = useMemo(
    () => deriveSummaryStudents(students, classMapping, studentExceptions, classes),
    [students, classMapping, studentExceptions, classes],
  );
  const stats = useMemo(() => summarizeOutcomes(summaryStudents), [summaryStudents]);

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

  async function handleStep3Save(exceptions: Record<string, StudentExceptionEntry>) {
    if (!schoolData) return;
    setIsLoading(true);
    try {
      const response = await api<{ draft: DraftPayload }>('/api/school/academic-year-rollover', {
        method: 'PATCH',
        body: { studentExceptions: exceptions },
      });
      applyDraft(response.draft, schoolData.school.id);
    } finally {
      setIsLoading(false);
    }
  }

  /** `null` = the student follows their class again (entry removed). */
  function handleExceptionChange(studentId: string, entry: StudentExceptionEntry | null) {
    setStudentExceptions((prev) => {
      if (entry === null) {
        if (!(studentId in prev)) return prev;
        const rest = { ...prev };
        delete rest[studentId];
        return rest;
      }
      return { ...prev, [studentId]: entry };
    });
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
        <Button className="w-fit" onClick={() => router.push('/settings')}>
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
        <Button className="w-fit" onClick={() => router.push('/settings')}>
          {ACADEMIC_YEAR_ROLLOVER.backToSettings}
        </Button>
      </div>
    );
  }

  return (
    // Same width as the settings page it belongs to (`max-w-4xl` in
    // settings/page.tsx) — a settings screen doesn't span the full width
    // (user decision 2026-08-17).
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">
          {ACADEMIC_YEAR_ROLLOVER.title}
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {ACADEMIC_YEAR_ROLLOVER.subtitle(activeYear.label, draftFields?.newYearLabel || '—')}
        </p>
      </div>

      {/* Same warning-banner recipe as carnet-de-notes (bg-warning +
          text-warning-foreground). `text-warning` is the pale BACKGROUND
          token (#fff8e1) — used as text it was invisible. */}
      <div className="flex items-center gap-2.5 rounded-lg border-l-[3px] border-warning-foreground bg-warning px-4 py-3">
        <AlertTriangle size={16} className="shrink-0 text-warning-foreground" />
        <p className="text-sm font-semibold text-warning-foreground">
          {ACADEMIC_YEAR_ROLLOVER.warningBanner}
        </p>
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
            gradeLevels={gradeLevels}
            activeMapping={classMapping}
            onMappingChange={handleMappingChange}
            onSave={handleStep2Save}
            onNext={() => goToStep(3)}
            isLoading={isLoading}
          />
        )}
        {step === 3 && (
          <Step3Decisions
            classes={classes}
            students={students}
            gradeLevels={gradeLevels}
            classMapping={classMapping}
            studentExceptions={studentExceptions}
            onExceptionChange={handleExceptionChange}
            onSave={handleStep3Save}
            onPrev={() => setStep(2)}
            onNext={() => goToStep(4)}
            isLoading={isLoading}
          />
        )}
        {step === 4 && (
          <Step4Summary
            stats={stats}
            students={summaryStudents}
            oldYearLabel={activeYear.label}
            newYearLabel={draftFields?.newYearLabel ?? ''}
            schoolName={schoolData.school.name}
            onConfirm={handleConfirm}
            onPrev={() => setStep(3)}
            isLoading={isLoading}
          />
        )}
      </div>

      <Button variant="ghost" className="w-fit" onClick={() => router.push('/settings')}>
        {ACADEMIC_YEAR_ROLLOVER.backToSettings}
      </Button>
    </div>
  );
}
