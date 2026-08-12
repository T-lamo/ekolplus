-- CreateTable
CREATE TABLE "BulletinTemplate" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "forkedFromId" TEXT,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulletinTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulletinTemplate_schoolId_idx" ON "BulletinTemplate"("schoolId");

-- AddForeignKey
ALTER TABLE "BulletinTemplate" ADD CONSTRAINT "BulletinTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulletinTemplate" ADD CONSTRAINT "BulletinTemplate_forkedFromId_fkey" FOREIGN KEY ("forkedFromId") REFERENCES "BulletinTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
