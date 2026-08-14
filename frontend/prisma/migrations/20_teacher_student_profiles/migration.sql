-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "email" TEXT,
ADD COLUMN     "enrollmentType" TEXT,
ADD COLUMN     "motherTongue" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "previousSchool" TEXT,
ADD COLUMN     "scholarship" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "transferNumber" TEXT;

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "address" TEXT,
ADD COLUMN     "civility" TEXT,
ADD COLUMN     "contractType" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "hiredAt" TIMESTAMP(3),
ADD COLUMN     "idNumber" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "secondaryPhone" TEXT,
ADD COLUMN     "weeklyHoursTarget" INTEGER;
