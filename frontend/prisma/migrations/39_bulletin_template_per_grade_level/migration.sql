-- Modèle de bulletin par niveau (spec 2026-09-05 §8) : Class.gradeLevelId
-- (catalogue, `level` reste le libellé affiché) et
-- GradeLevel.bulletinTemplateId (repli : niveau -> défaut école -> global).
-- Écrite à la main (jamais migrate dev / db push sur la base partagée) —
-- appliquée au merge : prisma db execute + prisma migrate resolve --applied
-- + prisma generate.

-- AlterTable
ALTER TABLE "GradeLevel" ADD COLUMN "bulletinTemplateId" TEXT;
CREATE INDEX "GradeLevel_bulletinTemplateId_idx" ON "GradeLevel"("bulletinTemplateId");
ALTER TABLE "GradeLevel" ADD CONSTRAINT "GradeLevel_bulletinTemplateId_fkey" FOREIGN KEY ("bulletinTemplateId") REFERENCES "BulletinTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Class" ADD COLUMN "gradeLevelId" TEXT;
CREATE INDEX "Class_gradeLevelId_idx" ON "Class"("gradeLevelId");
ALTER TABLE "Class" ADD CONSTRAINT "Class_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
