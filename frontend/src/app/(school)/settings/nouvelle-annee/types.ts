export interface ClassMappingEntry {
  destClassId?: string;
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
