// Business rules of the academic-year rollover, shared by the wizard (client)
// and the API routes (PATCH draft + confirm). Pure — no React, no fetch, no
// Prisma — so both sides enforce the exact same rule and it's unit-tested
// once (promotion-rules.test.ts).
//
// Rules:
//  - a class is DECIDED when it has a destination (existing class as
//    template, or a legacy "créer nouvelle" entry) OR is explicitly marked
//    "Fin de cursus" (`unenroll: true`);
//  - NO DEMOTION: a destination whose level ranks below the source's level in
//    the school's grade-level catalog is refused ("un élève de 3ème ne peut
//    pas être mis en 4ème ou en 5ème"). Same level = repeat year, allowed.
//    Skipping levels upward is allowed. When either level is not in the
//    catalog the rule cannot be judged and does not apply.
import type { ClassMappingEntry, StudentExceptionEntry } from './types';

export interface ClassLevelRef {
  id: string;
  name: string;
  level: string;
}

export interface GradeLevelRef {
  name: string;
  order: number;
}

export function hasDestination(entry: ClassMappingEntry | undefined): boolean {
  return Boolean(entry?.destClassId) || Boolean(entry?.isNew && entry?.newClass);
}

export function isDecided(entry: ClassMappingEntry | undefined): boolean {
  return hasDestination(entry) || entry?.unenroll === true;
}

/** Level name → positional rank in the `order`-sorted catalog (0-based).
 * Positional (not the raw `order`) so a gap left by a deleted level doesn't
 * matter — same convention as `suggestPromotions`. */
export function buildLevelRank(gradeLevels: GradeLevelRef[]): Map<string, number> {
  const sorted = [...gradeLevels].sort((a, b) => a.order - b.order);
  return new Map(sorted.map((l, i) => [l.name, i]));
}

export function isDemotion(fromLevel: string, toLevel: string, rank: Map<string, number>): boolean {
  const from = rank.get(fromLevel);
  const to = rank.get(toLevel);
  return from !== undefined && to !== undefined && to < from;
}

export interface Demotion {
  classId: string;
  className: string;
  fromLevel: string;
  destClassId: string;
  destClassName: string;
  toLevel: string;
}

/** Every class-mapping entry whose destination class ranks below the source
 * class's level. `classes` must contain both sources and destinations
 * (the current year's classes). */
export function findDemotions(
  classMapping: Record<string, ClassMappingEntry>,
  classes: ClassLevelRef[],
  gradeLevels: GradeLevelRef[],
): Demotion[] {
  const rank = buildLevelRank(gradeLevels);
  const byId = new Map(classes.map((c) => [c.id, c]));
  const out: Demotion[] = [];
  for (const [classId, entry] of Object.entries(classMapping)) {
    if (!entry?.destClassId) continue;
    const from = byId.get(classId);
    const to = byId.get(entry.destClassId);
    if (!from || !to) continue;
    if (isDemotion(from.level, to.level, rank)) {
      out.push({
        classId,
        className: from.name,
        fromLevel: from.level,
        destClassId: to.id,
        destClassName: to.name,
        toLevel: to.level,
      });
    }
  }
  return out;
}

export interface ExceptionDemotion {
  studentId: string;
  fromLevel: string;
  destClassId: string;
  destClassName: string;
  toLevel: string;
}

/** Same rule for per-student overrides: the student's CURRENT class level vs
 * the override's destination level. */
export function findExceptionDemotions(
  studentExceptions: Record<string, StudentExceptionEntry>,
  students: Array<{ id: string; classId: string }>,
  classes: ClassLevelRef[],
  gradeLevels: GradeLevelRef[],
): ExceptionDemotion[] {
  const rank = buildLevelRank(gradeLevels);
  const classById = new Map(classes.map((c) => [c.id, c]));
  const studentClass = new Map(students.map((s) => [s.id, s.classId]));
  const out: ExceptionDemotion[] = [];
  for (const [studentId, entry] of Object.entries(studentExceptions)) {
    if (!entry?.destClassId || entry.skip) continue;
    const currentClassId = studentClass.get(studentId);
    const from = currentClassId ? classById.get(currentClassId) : undefined;
    const to = classById.get(entry.destClassId);
    if (!from || !to) continue;
    if (isDemotion(from.level, to.level, rank)) {
      out.push({
        studentId,
        fromLevel: from.level,
        destClassId: to.id,
        destClassName: to.name,
        toLevel: to.level,
      });
    }
  }
  return out;
}

/** French one-liner for a 400 `DEMOTION_NOT_ALLOWED` / Step 2 error. */
export function formatDemotions(demotions: Demotion[]): string {
  const list = demotions
    .map((d) => `${d.className} (${d.fromLevel}) → ${d.destClassName} (${d.toLevel})`)
    .join(' ; ');
  return `Rétrogradation impossible — la classe de destination doit être d'un niveau égal ou supérieur : ${list}.`;
}
