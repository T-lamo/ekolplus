-- Qualitative subjects (spec docs/superpowers/specs/2026-09-05-bulletin-prescolaire-et-pages-design.md §4).
-- Hand-written: the shared dev database is never touched by `migrate dev`.

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN "evaluationMode" TEXT NOT NULL DEFAULT 'NUMERIC',
ADD COLUMN "ratingScale" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "SubjectCriterion" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriteriaAssessment" (
    "id" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CriteriaAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriteriaRating" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CriteriaRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubjectCriterion_subjectId_order_idx" ON "SubjectCriterion"("subjectId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "CriteriaAssessment_classSubjectId_termId_key" ON "CriteriaAssessment"("classSubjectId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "CriteriaRating_assessmentId_studentId_criterionId_key" ON "CriteriaRating"("assessmentId", "studentId", "criterionId");

-- CreateIndex
CREATE INDEX "CriteriaRating_studentId_idx" ON "CriteriaRating"("studentId");

-- AddForeignKey
ALTER TABLE "SubjectCriterion" ADD CONSTRAINT "SubjectCriterion_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriteriaAssessment" ADD CONSTRAINT "CriteriaAssessment_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "ClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriteriaAssessment" ADD CONSTRAINT "CriteriaAssessment_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriteriaRating" ADD CONSTRAINT "CriteriaRating_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "CriteriaAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriteriaRating" ADD CONSTRAINT "CriteriaRating_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriteriaRating" ADD CONSTRAINT "CriteriaRating_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "SubjectCriterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
