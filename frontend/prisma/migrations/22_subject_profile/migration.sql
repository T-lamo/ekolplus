-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "abbreviation" TEXT,
ADD COLUMN     "color" TEXT,
ADD COLUMN     "defaultCoefficient" INTEGER,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "eliminatoryScore" INTEGER,
ADD COLUMN     "evaluationType" TEXT,
ADD COLUMN     "hoursCM" INTEGER,
ADD COLUMN     "hoursTD" INTEGER,
ADD COLUMN     "hoursTP" INTEGER,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "includeInAverage" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'REQUIRED',
ADD COLUMN     "level" TEXT,
ADD COLUMN     "maxCapacity" INTEGER,
ADD COLUMN     "maxScore" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "passingScore" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "responsibleTeacherId" TEXT,
ADD COLUMN     "room" TEXT,
ADD COLUMN     "showOnBulletin" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "totalHours" INTEGER;

-- CreateTable
CREATE TABLE "SubjectChapter" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "objectives" TEXT,
    "hours" DOUBLE PRECISION,
    "reference" TEXT,
    "competence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectChapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SubjectPrerequisites" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "SubjectChapter_subjectId_termId_order_idx" ON "SubjectChapter"("subjectId", "termId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "_SubjectPrerequisites_AB_unique" ON "_SubjectPrerequisites"("A", "B");

-- CreateIndex
CREATE INDEX "_SubjectPrerequisites_B_index" ON "_SubjectPrerequisites"("B");

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_responsibleTeacherId_fkey" FOREIGN KEY ("responsibleTeacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectChapter" ADD CONSTRAINT "SubjectChapter_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectChapter" ADD CONSTRAINT "SubjectChapter_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubjectPrerequisites" ADD CONSTRAINT "_SubjectPrerequisites_A_fkey" FOREIGN KEY ("A") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubjectPrerequisites" ADD CONSTRAINT "_SubjectPrerequisites_B_fkey" FOREIGN KEY ("B") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: subjects archived before `status` existed keep their archived state.
UPDATE "Subject" SET "status" = 'ARCHIVED' WHERE "isActive" = false;
