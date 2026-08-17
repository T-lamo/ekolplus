export interface ClassMappingEntry {
  /** A CURRENT-year class used as the template the rollover clones into the
   * new year (see `executeRollover` step 4). */
  destClassId?: string;
  /** Explicit "fin de cursus": the class's students are deliberately not
   * re-enrolled. Distinct from "no decision yet" (empty entry), which Step 2
   * refuses to proceed with. */
  unenroll?: boolean;
  /** Legacy "Créer nouvelle" path — still honoured server-side for drafts
   * saved before the destination picker; the UI no longer produces it. */
  isNew?: boolean;
  newClass?: {
    name: string;
    level: string;
    room?: string;
    capacity?: number;
    homeroomTeacherId?: string;
  };
}

export interface StudentExceptionEntry {
  destClassId?: string;
  skip?: boolean;
}

export interface RolloverDraft {
  id: string;
  schoolId: string;
  newYearLabel: string;
  newYearStartDate: Date;
  newYearEndDate: Date;
  classMapping: Record<string, ClassMappingEntry>;
  studentExceptions: Record<string, StudentExceptionEntry>;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface PromotionStats {
  promoted: number;
  exceptions: number;
  unenrolled: number;
}

export type WizardStep = 1 | 2 | 3;

export interface ClassForPromotion {
  id: string;
  name: string;
  level: string;
  studentCount: number;
}

export interface StudentForPromotion {
  id: string;
  firstName: string;
  lastName: string;
  classId: string;
  enrolledAt: Date;
}
