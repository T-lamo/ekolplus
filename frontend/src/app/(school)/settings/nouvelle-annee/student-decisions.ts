// Per-student decisions of the academic-year rollover (wizard Step 3
// « Décisions par élève ») — pure, shared by the step (select ⇄ draft entry)
// and the summary (status badges / counters). No React, no fetch.
//
// A decision is persisted in the draft's existing `studentExceptions` map
// (studentId → { destClassId } | { skip: true }); no new storage:
//   - "passe"      → no entry: the student follows their class's mapping
//                    (Step 2), whatever it is (promotion, collective repeat,
//                    fin de cursus);
//   - "redouble"   → { destClassId: <the student's CURRENT class> } — the own
//                    class is the clone template, so the student lands in the
//                    same-named class of the new year (see executeRollover);
//   - "class:<id>" → { destClassId: id } — any other allowed class;
//   - "quitte"     → { skip: true } — deliberately not re-enrolled.
//
// The OUTCOME (what actually happens at confirm) follows executeRollover's
// precedence exactly: exception > class mapping > unenrolled. Its status is
// what the summary shows: `redoublant` when the destination is of the SAME
// level as the current class (repeat year — individually or as a whole
// class), `promu` for any other destination, `nonreinscrit` otherwise.
import type { ClassMappingEntry, PromotionStats, StudentExceptionEntry } from './types';

export type DecisionKind = 'passe' | 'redouble' | 'autre' | 'quitte';
export type StudentOutcomeStatus = 'promu' | 'redoublant' | 'nonreinscrit';

export interface StudentOutcome {
  kind: DecisionKind;
  status: StudentOutcomeStatus;
  destClassId?: string;
  destClassName?: string;
}

/** Minimal class shape the outcome derivation needs (id → name/level). */
export interface ClassRef {
  id: string;
  name: string;
  level: string;
}

export const DECISION_PASSE = 'passe';
export const DECISION_REDOUBLE = 'redouble';
export const DECISION_QUITTE = 'quitte';
const CLASS_PREFIX = 'class:';

export function toClassValue(classId: string): string {
  return `${CLASS_PREFIX}${classId}`;
}

/** Select value for a student's current draft entry. */
export function decisionValue(
  entry: StudentExceptionEntry | undefined,
  student: { classId: string },
): string {
  if (entry?.skip) return DECISION_QUITTE;
  if (entry?.destClassId) {
    return entry.destClassId === student.classId
      ? DECISION_REDOUBLE
      : toClassValue(entry.destClassId);
  }
  return DECISION_PASSE;
}

/** Draft entry for a select value — `null` means "remove the entry" (the
 * student simply follows their class). Unknown values are treated as
 * "passe" so a stale option can never persist garbage. */
export function entryForDecision(
  value: string,
  student: { classId: string },
): StudentExceptionEntry | null {
  if (value === DECISION_REDOUBLE) return { destClassId: student.classId };
  if (value === DECISION_QUITTE) return { skip: true };
  if (value.startsWith(CLASS_PREFIX) && value.length > CLASS_PREFIX.length) {
    return { destClassId: value.slice(CLASS_PREFIX.length) };
  }
  return null;
}

function statusFor(currentLevel: string | undefined, destLevel: string | undefined) {
  return currentLevel !== undefined && destLevel !== undefined && currentLevel === destLevel
    ? ('redoublant' as const)
    : ('promu' as const);
}

export function deriveOutcome(
  student: { id: string; classId: string },
  classMapping: Record<string, ClassMappingEntry>,
  studentExceptions: Record<string, StudentExceptionEntry>,
  classById: Map<string, ClassRef>,
): StudentOutcome {
  const currentLevel = classById.get(student.classId)?.level;
  const exception = studentExceptions[student.id];

  if (exception?.skip) return { kind: 'quitte', status: 'nonreinscrit' };

  if (exception?.destClassId) {
    const dest = classById.get(exception.destClassId);
    return {
      kind: exception.destClassId === student.classId ? 'redouble' : 'autre',
      status: statusFor(currentLevel, dest?.level),
      destClassId: exception.destClassId,
      destClassName: dest?.name ?? exception.destClassId,
    };
  }

  const mapping = classMapping[student.classId];
  if (mapping?.destClassId) {
    const dest = classById.get(mapping.destClassId);
    return {
      kind: 'passe',
      status: statusFor(currentLevel, dest?.level),
      destClassId: mapping.destClassId,
      destClassName: dest?.name ?? mapping.destClassId,
    };
  }
  if (mapping?.isNew && mapping.newClass) {
    // Legacy "Créer nouvelle" entry — still honoured server-side.
    return {
      kind: 'passe',
      status: statusFor(currentLevel, mapping.newClass.level),
      destClassName: mapping.newClass.name,
    };
  }
  // `unenroll: true` (Fin de cursus) or no decision yet.
  return { kind: 'passe', status: 'nonreinscrit' };
}

export function summarizeOutcomes(
  outcomes: Array<{ status: StudentOutcomeStatus }>,
): PromotionStats {
  const stats: PromotionStats = { promoted: 0, repeating: 0, unenrolled: 0 };
  for (const o of outcomes) {
    if (o.status === 'promu') stats.promoted += 1;
    else if (o.status === 'redoublant') stats.repeating += 1;
    else stats.unenrolled += 1;
  }
  return stats;
}
