-- CreateTable
CREATE TABLE "GradeLevel" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeLevel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GradeLevel_schoolId_order_idx" ON "GradeLevel"("schoolId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "GradeLevel_schoolId_name_key" ON "GradeLevel"("schoolId", "name");

-- AddForeignKey
ALTER TABLE "GradeLevel" ADD CONSTRAINT "GradeLevel_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
