-- AlterTable
ALTER TABLE "Guardian" ADD COLUMN "nif" TEXT,
ADD COLUMN "niu" TEXT,
ADD COLUMN "vitalStatus" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN "nisu" TEXT;

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN "birthPlace" TEXT,
ADD COLUMN "diploma" TEXT,
ADD COLUMN "nif" TEXT,
ADD COLUMN "niu" TEXT;

-- Data migration: idNumber already held a NIF value in practice (see
-- schema comment history) — carry it over before dropping the column
-- (spec §3.2).
UPDATE "Teacher" SET "nif" = "idNumber" WHERE "idNumber" IS NOT NULL;

-- AlterTable
ALTER TABLE "Teacher" DROP COLUMN "idNumber";

-- CreateEnum
CREATE TYPE "StudentDocumentType" AS ENUM ('BIRTH_CERTIFICATE', 'VACCINATION_RECORD', 'PREVIOUS_SCHOOL_RECORD');

-- CreateTable
CREATE TABLE "StudentDocument" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "StudentDocumentType" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,

    CONSTRAINT "StudentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentDocument_studentId_type_key" ON "StudentDocument"("studentId", "type");

-- CreateIndex
CREATE INDEX "StudentDocument_studentId_idx" ON "StudentDocument"("studentId");

-- AddForeignKey
ALTER TABLE "StudentDocument" ADD CONSTRAINT "StudentDocument_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentDocument" ADD CONSTRAINT "StudentDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
