'use client';

// Step 3 of the rollover wizard — « Décisions par élève ». One row per
// enrolled student; by default everyone follows their class's Step 2
// destination, and the director records the exceptions here: redoublement
// (the student stays at their level), another class, or "non réinscrit".
// User decision 2026-08-17: "ce n'est pas tous les élèves qui vont passer…
// il faut une étape dans laquelle on pourra prendre une décision pour
// chaque élève". Decisions persist in the draft's existing
// `studentExceptions` (see student-decisions.ts for the encoding); the
// no-demotion rule filters the "autre classe" options (promotion-rules.ts).

import { useMemo, useState } from 'react';
import { ApiError } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { StudentStatusBadge } from '@/components/school/StudentStatusBadge';
import { ACADEMIC_YEAR_ROLLOVER } from '@/lib/constants';
import type {
  ClassForPromotion,
  ClassMappingEntry,
  StudentExceptionEntry,
  StudentForPromotion,
} from './types';
import type { GradeLevelOption } from './suggest-promotions';
import { buildLevelRank, findExceptionDemotions, isDemotion } from './promotion-rules';
import {
  DECISION_PASSE,
  DECISION_QUITTE,
  DECISION_REDOUBLE,
  decisionValue,
  deriveOutcome,
  entryForDecision,
  summarizeOutcomes,
  toClassValue,
} from './student-decisions';

interface Step3DecisionsProps {
  classes: ClassForPromotion[];
  students: StudentForPromotion[];
  gradeLevels: GradeLevelOption[];
  classMapping: Record<string, ClassMappingEntry>;
  studentExceptions: Record<string, StudentExceptionEntry>;
  /** `null` entry = remove the student's exception (follows the class). */
  onExceptionChange: (studentId: string, entry: StudentExceptionEntry | null) => void;
  onSave: (exceptions: Record<string, StudentExceptionEntry>) => Promise<void>;
  onPrev: () => void;
  onNext: () => void;
  isLoading?: boolean;
}

/** `ApiError.message` is the stable code; the server puts the human text in
 * `body.message` (DEMOTION_NOT_ALLOWED lists the offending students). */
function saveErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    const detail = typeof err.body.message === 'string' ? err.body.message : null;
    return detail ?? err.message;
  }
  return err instanceof Error ? err.message : 'Erreur lors de la sauvegarde';
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function Step3Decisions({
  classes,
  students,
  gradeLevels,
  classMapping,
  studentExceptions,
  onExceptionChange,
  onSave,
  onPrev,
  onNext,
  isLoading = false,
}: Step3DecisionsProps) {
  const t = ACADEMIC_YEAR_ROLLOVER.step3;
  const [error, setError] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [search, setSearch] = useState('');

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const levelRank = useMemo(() => buildLevelRank(gradeLevels), [gradeLevels]);

  // Outcome per student (what confirm will actually do) — drives the
  // Destination column, the badge and the summary line.
  const outcomes = useMemo(
    () =>
      new Map(
        students.map((s) => [s.id, deriveOutcome(s, classMapping, studentExceptions, classById)]),
      ),
    [students, classMapping, studentExceptions, classById],
  );
  const stats = useMemo(() => summarizeOutcomes([...outcomes.values()]), [outcomes]);

  const visible = useMemo(() => {
    const q = normalize(search.trim());
    const classOrder = new Map(classes.map((c, i) => [c.id, i]));
    return students
      .filter((s) => (classFilter ? s.classId === classFilter : true))
      .filter((s) => (q ? normalize(`${s.firstName} ${s.lastName}`).includes(q) : true))
      .sort(
        (a, b) =>
          (classOrder.get(a.classId) ?? 0) - (classOrder.get(b.classId) ?? 0) ||
          a.lastName.localeCompare(b.lastName, 'fr') ||
          a.firstName.localeCompare(b.firstName, 'fr'),
      );
  }, [students, classes, classFilter, search]);

  /** Label of the class's own Step 2 destination ("Comme la classe → …"). */
  function followLabel(cls: ClassForPromotion | undefined): string {
    const mapping = cls ? classMapping[cls.id] : undefined;
    const dest = mapping?.destClassId
      ? (classById.get(mapping.destClassId)?.name ?? mapping.destClassId)
      : mapping?.isNew && mapping.newClass
        ? mapping.newClass.name
        : null;
    return dest ? t.followClass(dest) : t.followClassUnenrolled;
  }

  const handleProceed = async () => {
    setError('');
    // NO DEMOTION — options are already filtered, but a draft saved before
    // the catalog changed can still hold one. Same rule the API re-checks.
    const bad = findExceptionDemotions(studentExceptions, students, classes, gradeLevels);
    if (bad.length > 0) {
      const names = bad
        .map((b) => {
          const s = students.find((x) => x.id === b.studentId);
          return s ? `${s.firstName} ${s.lastName} (${b.fromLevel} → ${b.toLevel})` : b.studentId;
        })
        .join(' ; ');
      setError(`Rétrogradation impossible — ${names}.`);
      return;
    }
    try {
      await onSave(studentExceptions);
      onNext();
    } catch (err) {
      setError(saveErrorText(err));
    }
  };

  const handleSaveDraft = async () => {
    setError('');
    try {
      await onSave(studentExceptions);
    } catch (err) {
      setError(saveErrorText(err));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="gap-3 p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">{t.help}</p>
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="max-w-[300px]"
          />
          <FilterSelect value={classFilter} onValueChange={setClassFilter} title={t.currentClass}>
            <SelectItem value="">{t.allClasses}</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </FilterSelect>
          <span role="status" className="text-sm text-muted-foreground">
            {t.summary(students.length, stats.promoted, stats.repeating, stats.unenrolled)}
          </span>
        </div>
      </Card>

      <Card className="overflow-x-auto p-4 sm:p-6">
        {students.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t.noStudents}</p>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t.noResults}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left font-medium">{t.student}</th>
                <th className="px-3 py-2 text-left font-medium">{t.currentClass}</th>
                <th className="px-3 py-2 text-left font-medium">{t.decision}</th>
                <th className="px-3 py-2 text-left font-medium">{t.destination}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((student) => {
                const cls = classById.get(student.classId);
                const mapping = classMapping[student.classId];
                const entry = studentExceptions[student.id];
                const value = decisionValue(entry, student);
                const outcome = outcomes.get(student.id);
                // "Autre classe" candidates: every class of equal or higher
                // level (no demotion), except the student's own class
                // (= "Redouble") and the class's default destination (=
                // "Comme la classe").
                const others = classes.filter(
                  (c) =>
                    c.id !== student.classId &&
                    c.id !== mapping?.destClassId &&
                    (!cls || !isDemotion(cls.level, c.level, levelRank)),
                );
                // A persisted destination the rule now forbids (stale draft):
                // it isn't in the options, so say why the select looks off.
                const forbiddenDest =
                  entry?.destClassId && cls
                    ? classes.find(
                        (c) =>
                          c.id === entry.destClassId && isDemotion(cls.level, c.level, levelRank),
                      )
                    : undefined;

                return (
                  <tr key={student.id} className="border-b border-border">
                    <td className="px-3 py-2 align-middle font-medium">
                      {student.firstName} {student.lastName}
                    </td>
                    <td className="px-3 py-2 align-middle">{cls?.name ?? '—'}</td>
                    <td className="px-3 py-2 align-middle">
                      <div className="flex min-w-60 flex-col gap-1">
                        <FilterSelect
                          value={value}
                          onValueChange={(v) =>
                            onExceptionChange(student.id, entryForDecision(v, student))
                          }
                          disabled={isLoading}
                          title={`${t.decision} — ${student.firstName} ${student.lastName}`}
                        >
                          <SelectItem value={DECISION_PASSE}>{followLabel(cls)}</SelectItem>
                          {cls && mapping?.destClassId !== cls.id && (
                            <SelectItem value={DECISION_REDOUBLE}>{t.repeat(cls.name)}</SelectItem>
                          )}
                          {!mapping?.unenroll && (
                            <SelectItem value={DECISION_QUITTE}>{t.leave}</SelectItem>
                          )}
                          {others.map((c) => (
                            <SelectItem key={c.id} value={toClassValue(c.id)}>
                              {t.otherClass(c.name, c.level)}
                            </SelectItem>
                          ))}
                        </FilterSelect>
                        {forbiddenDest && (
                          <span role="alert" className="text-[11px] text-destructive-foreground">
                            {t.demotionHint(forbiddenDest.name, forbiddenDest.level)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <div className="flex flex-wrap items-center gap-2">
                        {outcome && <StudentStatusBadge status={outcome.status} />}
                        <span className="text-xs text-muted-foreground">
                          {outcome?.destClassName ?? t.noDestination}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="w-fit" onClick={onPrev} disabled={isLoading}>
          {t.previousStep}
        </Button>
        <Button variant="outline" className="w-fit" onClick={handleSaveDraft} disabled={isLoading}>
          {t.saveAsDraft}
        </Button>
        <Button className="w-fit" onClick={handleProceed} disabled={isLoading}>
          {t.nextStep}
        </Button>
      </div>
    </div>
  );
}
