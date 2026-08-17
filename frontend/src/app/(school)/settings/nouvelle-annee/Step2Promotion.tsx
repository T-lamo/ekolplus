'use client';

// Step 2 of the rollover wizard — one row per current-year class, and for
// each a destination picked among the school's EXISTING classes (which the
// confirm step clones into the new year — see `executeRollover` step 4) or
// an explicit "Fin de cursus" (students leave the school). No class
// creation happens here (user decision 2026-08-17: "ce n'est pas le moment
// de demander la création d'une nouvelle classe"). "Suggérer toutes les
// promotions" bulk-fills undecided rows from the grade-level catalog.

import { useMemo, useState } from 'react';
import { Wand2 } from 'lucide-react';
import Link from 'next/link';
import { ApiError } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { ACADEMIC_YEAR_ROLLOVER } from '@/lib/constants';
import type { ClassForPromotion, ClassMappingEntry } from './types';
import { isDecided, suggestPromotions, type GradeLevelOption } from './suggest-promotions';
import { buildLevelRank, findDemotions, formatDemotions, isDemotion } from './promotion-rules';

/** Sentinel option value for "Fin de cursus" (`unenroll: true`). Class ids
 * are cuids, so no collision. */
const UNENROLL_VALUE = '__unenroll__';

interface Step2PromotionProps {
  classes: ClassForPromotion[];
  /** School's ordered level catalog (Configuration → Niveaux). Empty →
   * the suggest button is a no-op and a hint points to the config page. */
  gradeLevels: GradeLevelOption[];
  activeMapping: Record<string, ClassMappingEntry>;
  onMappingChange: (classId: string, mapping: ClassMappingEntry) => void;
  onSave: (mapping: Record<string, ClassMappingEntry>) => Promise<void>;
  onNext: () => void;
  isLoading?: boolean;
}

/** `ApiError.message` is the stable code; the server puts the human text in
 * `body.message` (e.g. DEMOTION_NOT_ALLOWED lists the offending classes). */
function saveErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    const detail = typeof err.body.message === 'string' ? err.body.message : null;
    if (err.code === 'DEMOTION_NOT_ALLOWED' && detail) return detail;
    return detail ?? err.message;
  }
  return err instanceof Error ? err.message : 'Erreur lors de la sauvegarde';
}

function selectValue(entry: ClassMappingEntry | undefined): string {
  if (entry?.destClassId) return entry.destClassId;
  if (entry?.unenroll) return UNENROLL_VALUE;
  return '';
}

export function Step2Promotion({
  classes,
  gradeLevels,
  activeMapping,
  onMappingChange,
  onSave,
  onNext,
  isLoading = false,
}: Step2PromotionProps) {
  const t = ACADEMIC_YEAR_ROLLOVER.step2;
  const [error, setError] = useState('');
  // Feedback line under the suggest button ("N classes pré-remplies" /
  // "aucune…"). Cleared on the next click.
  const [suggestNotice, setSuggestNotice] = useState<string | null>(null);
  // Level ranks from the catalog — drives the NO-DEMOTION rule: a class can
  // only be sent to a class of equal or higher level (promotion-rules.ts).
  const levelRank = useMemo(() => buildLevelRank(gradeLevels), [gradeLevels]);

  const handleSuggestAll = () => {
    setError('');
    const suggestions = suggestPromotions(classes, gradeLevels, classes, activeMapping);
    // `onMappingChange` is a functional setState in the parent, so a burst
    // of calls in one tick doesn't clobber itself.
    for (const s of suggestions) onMappingChange(s.classId, s.entry);
    setSuggestNotice(suggestions.length > 0 ? t.suggestApplied(suggestions.length) : t.suggestNone);
  };

  const handlePick = (classId: string, value: string) => {
    if (value === UNENROLL_VALUE) onMappingChange(classId, { unenroll: true });
    else if (value) onMappingChange(classId, { destClassId: value });
    else onMappingChange(classId, {});
  };

  const handleProceed = async () => {
    setError('');

    // Every class must be DECIDED: a destination, or an explicit "Fin de
    // cursus". Mirrors executeRollover's guard (see computeStats in
    // academic-year-rollover.ts): a legacy `isNew: true` entry only counts
    // when `newClass` is present.
    for (const cls of classes) {
      if (!isDecided(activeMapping[cls.id])) {
        setError(`${cls.name} n'a pas de classe de destination`);
        return;
      }
    }

    // NO DEMOTION — the picker already hides lower-level classes, but a
    // draft saved before the catalog changed can still hold one. Same rule
    // the API re-checks (400 DEMOTION_NOT_ALLOWED).
    const demotions = findDemotions(activeMapping, classes, gradeLevels);
    if (demotions.length > 0) {
      setError(formatDemotions(demotions));
      return;
    }

    try {
      await onSave(activeMapping);
      onNext();
    } catch (err) {
      setError(saveErrorText(err));
    }
  };

  const handleSaveDraft = async () => {
    setError('');
    try {
      await onSave(activeMapping);
    } catch (err) {
      setError(saveErrorText(err));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="gap-3 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{t.help}</p>
          <Button
            type="button"
            variant="outline"
            className="w-fit shrink-0"
            onClick={handleSuggestAll}
            disabled={isLoading || classes.length === 0}
          >
            <Wand2 size={14} />
            {t.suggestAll}
          </Button>
        </div>
        {gradeLevels.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t.suggestHint}{' '}
            <Link
              href="/configuration/niveaux"
              className="font-medium text-primary hover:underline"
            >
              Ouvrir Configuration &gt; Niveaux
            </Link>
          </p>
        )}
        {suggestNotice && (
          <p role="status" className="text-xs text-muted-foreground">
            {suggestNotice}
          </p>
        )}
      </Card>

      <Card className="overflow-x-auto p-4 sm:p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium">{t.currentClass}</th>
              <th className="px-3 py-2 text-left font-medium">{t.studentCount}</th>
              <th className="px-3 py-2 text-left font-medium">{t.currentLevel}</th>
              <th className="px-3 py-2 text-left font-medium">{t.destClass}</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((cls) => {
              const mapping = activeMapping[cls.id];
              const legacyNewClass =
                mapping?.isNew && mapping.newClass && !mapping.destClassId
                  ? mapping.newClass.name
                  : null;
              // A persisted destination that the rule now forbids (draft saved
              // before the catalog changed): it's filtered out of the options,
              // so say why the select looks empty.
              const forbiddenDest = mapping?.destClassId
                ? classes.find(
                    (c) =>
                      c.id === mapping.destClassId && isDemotion(cls.level, c.level, levelRank),
                  )
                : undefined;

              return (
                <tr key={cls.id} className="border-b border-border">
                  <td className="px-3 py-2 align-middle font-medium">{cls.name}</td>
                  <td className="px-3 py-2 align-middle">{cls.studentCount}</td>
                  <td className="px-3 py-2 align-middle">{cls.level}</td>
                  <td className="px-3 py-2 align-middle">
                    <div className="flex min-w-56 flex-col gap-1">
                      <FilterSelect
                        value={selectValue(mapping)}
                        onValueChange={(value) => handlePick(cls.id, value)}
                        disabled={isLoading}
                        title={`${t.destClass} — ${cls.name}`}
                      >
                        <SelectItem value="">{t.pickDestination}</SelectItem>
                        {classes
                          // NO DEMOTION: only classes of equal or higher level
                          // (unknown levels can't be judged → offered).
                          .filter((c) => !isDemotion(cls.level, c.level, levelRank))
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} ({c.level})
                            </SelectItem>
                          ))}
                        <SelectItem value={UNENROLL_VALUE}>{t.endOfCursus}</SelectItem>
                      </FilterSelect>
                      {legacyNewClass && (
                        <span className="text-[11px] text-muted-foreground">
                          {t.legacyNewClass(legacyNewClass)}
                        </span>
                      )}
                      {forbiddenDest && (
                        <span role="alert" className="text-[11px] text-destructive-foreground">
                          {t.demotionHint(forbiddenDest.name, forbiddenDest.level)}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      <div className="rounded-md border border-border bg-muted px-4 py-3 text-xs text-muted-foreground">
        {t.step3Preview}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="w-fit" onClick={handleSaveDraft} disabled={isLoading}>
          {ACADEMIC_YEAR_ROLLOVER.step1.saveAsDraft}
        </Button>
        <Button className="w-fit" onClick={handleProceed} disabled={isLoading}>
          {t.nextStep}
        </Button>
      </div>
    </div>
  );
}
