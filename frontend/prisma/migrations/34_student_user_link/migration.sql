-- Student.userId login link for Espace Élève Phase 1
ALTER TABLE "Student" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "Student_userId_key" ON "Student"("userId");
ALTER TABLE "Student" ADD CONSTRAINT "Student_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
