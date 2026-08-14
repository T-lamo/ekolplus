-- CreateTable
CREATE TABLE "AcademicYearRolloverDraft" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "newYearLabel" TEXT NOT NULL,
    "newYearStartDate" TIMESTAMP(3) NOT NULL,
    "newYearEndDate" TIMESTAMP(3) NOT NULL,
    "classMapping" JSONB NOT NULL DEFAULT '{}',
    "studentExceptions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "AcademicYearRolloverDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYearRolloverDraft_schoolId_key" ON "AcademicYearRolloverDraft"("schoolId");

-- AddForeignKey
ALTER TABLE "AcademicYearRolloverDraft" ADD CONSTRAINT "AcademicYearRolloverDraft_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

