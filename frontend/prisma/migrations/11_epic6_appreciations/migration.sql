-- CreateTable
CREATE TABLE "Appreciation" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "subjectId" TEXT,
    "mention" TEXT,
    "text" TEXT,
    "comportement" TEXT,
    "investissement" TEXT,
    "assiduite" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appreciation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Appreciation_studentId_termId_idx" ON "Appreciation"("studentId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "Appreciation_studentId_termId_subjectId_key" ON "Appreciation"("studentId", "termId", "subjectId");

-- AddForeignKey
ALTER TABLE "Appreciation" ADD CONSTRAINT "Appreciation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appreciation" ADD CONSTRAINT "Appreciation_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appreciation" ADD CONSTRAINT "Appreciation_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appreciation" ADD CONSTRAINT "Appreciation_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
