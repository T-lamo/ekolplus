'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Pager } from '@/components/ui/Pager';
import {
  StudentStatusBadge,
  type StudentRolloverStatus,
} from '@/components/school/StudentStatusBadge';
import { PromoCounterCard } from '@/components/school/PromoCounterCard';
import { ACADEMIC_YEAR_ROLLOVER } from '@/lib/constants';
import type { PromotionStats } from './types';

// Reusing `school-danger-zone.ts`'s destructive-button styling technique
// (see `ZoneDangereuseSection.tsx`'s `DESTRUCTIVE_BTN`): `Button` only ships
// `primary` / `outline` / `ghost` variants, so the destructive tone is a
// className override on top of `primary`.
const DESTRUCTIVE_BTN = 'bg-destructive text-destructive-foreground hover:bg-destructive/90';

export interface SummaryStudent {
  id: string;
  firstName: string;
  lastName: string;
  status: StudentRolloverStatus;
  destClassName?: string;
}

interface Step4SummaryProps {
  stats: PromotionStats;
  students: SummaryStudent[];
  oldYearLabel: string;
  newYearLabel: string;
  schoolName: string;
  onConfirm: (confirmName: string) => Promise<void>;
  onPrev: () => void;
  isLoading?: boolean;
}

const PAGE_SIZE = 8;

/** `ApiError.message` is the stable code; the server's French text
 * (MAPPING_STALE → "revenir à l'étape 3…", DEMOTION_NOT_ALLOWED, …) lives in
 * `body.message`. */
function confirmErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    const detail = typeof err.body.message === 'string' ? err.body.message : null;
    return detail ?? err.message;
  }
  return err instanceof Error ? err.message : 'Erreur lors de la confirmation';
}

/** Step 4 of the "nouvelle année" wizard — read-only recap (counter cards +
 * paginated student table) followed by the destructive type-to-confirm zone
 * that commits the rollover. Status/destClassName are computed upstream by
 * the wizard orchestrator (`deriveOutcome` in student-decisions.ts, from the
 * class mapping + per-student decisions) — this component only renders what
 * it's given; decisions are edited in Step 3 (« Étape précédente »). */
export function Step4Summary({
  stats,
  students,
  oldYearLabel,
  newYearLabel,
  schoolName,
  onConfirm,
  onPrev,
  isLoading = false,
}: Step4SummaryProps) {
  const t = ACADEMIC_YEAR_ROLLOVER.step4;
  const [confirmInput, setConfirmInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(students.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const startIdx = currentPage * PAGE_SIZE;
  const pageStudents = students.slice(startIdx, startIdx + PAGE_SIZE);
  const matches = confirmInput.trim() === schoolName;

  async function handleConfirm() {
    setError(null);

    if (!matches) {
      setError("Le nom de l'école ne correspond pas");
      return;
    }

    try {
      await onConfirm(confirmInput.trim());
    } catch (err) {
      setError(confirmErrorText(err));
    }
  }

  return (
    <div className="space-y-4">
      {/* Counter cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <PromoCounterCard count={stats.promoted} label={t.promoted} tone="success" />
        <PromoCounterCard count={stats.repeating} label={t.repeating} tone="warning" />
        <PromoCounterCard count={stats.unenrolled} label={t.unenrolled} tone="destructive" />
      </div>

      {/* Student table */}
      <Card className="p-4 sm:p-6">
        <p className="mb-3 text-sm font-semibold text-foreground">{t.students}</p>

        {pageStudents.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun élève</p>
        ) : (
          <div className="space-y-3">
            {pageStudents.map((student) => (
              <div
                key={student.id}
                className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-none last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {student.firstName} {student.lastName}
                  </span>
                  {student.destClassName && (
                    <p className="truncate text-xs text-muted-foreground">
                      {student.destClassName}
                    </p>
                  )}
                </div>
                <StudentStatusBadge status={student.status} />
              </div>
            ))}
          </div>
        )}

        {students.length > PAGE_SIZE && (
          <div className="mt-2">
            <Pager
              page={currentPage + 1}
              pageSize={PAGE_SIZE}
              total={students.length}
              onChange={(p) => setPage(p - 1)}
              centered
            />
          </div>
        )}
      </Card>

      {/* Destructive type-to-confirm zone — inline in the page flow (not a
          Modal), per the design spec's "Confirm button, previous/next step
          nav buttons at bottom" being part of Step 3's own layout. */}
      <Card className="border-destructive/50 bg-destructive/5 p-4 sm:p-6">
        <p className="text-sm font-semibold text-foreground">{t.confirmTitle}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t.confirmText(oldYearLabel, newYearLabel, stats.promoted, stats.repeating)}
        </p>

        <div className="mt-4">
          <Field
            label={t.typeToConfirm}
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder={schoolName}
            autoComplete="off"
          />
        </div>

        {error && (
          <p role="alert" className="mt-2 text-xs text-destructive-foreground">
            {error}
          </p>
        )}

        <div className="mt-4">
          <Button
            type="button"
            loading={isLoading}
            disabled={isLoading || !matches}
            onClick={handleConfirm}
            className={`w-fit ${DESTRUCTIVE_BTN}`}
          >
            {t.confirmButton}
          </Button>
        </div>
      </Card>

      <Button variant="outline" className="w-fit" onClick={onPrev} disabled={isLoading}>
        {t.previousStep}
      </Button>
    </div>
  );
}
