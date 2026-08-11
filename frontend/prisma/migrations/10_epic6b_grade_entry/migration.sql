-- AlterTable
ALTER TABLE "Evaluation" ADD COLUMN     "coefficient" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "countsTowardAverage" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "Grade" ADD COLUMN     "absent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "comment" TEXT;
