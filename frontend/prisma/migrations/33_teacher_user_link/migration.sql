-- Teacher.userId login link for Espace Enseignant Phase 1
ALTER TABLE "Teacher" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "Teacher_userId_key" ON "Teacher"("userId");
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
