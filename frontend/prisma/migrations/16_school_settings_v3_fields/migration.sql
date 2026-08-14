-- AlterTable
ALTER TABLE "Term" ADD COLUMN     "gradeEntryEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'TRIMESTRE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);
