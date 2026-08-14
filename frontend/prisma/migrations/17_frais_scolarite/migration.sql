-- CreateEnum
CREATE TYPE "FeePaymentMethod" AS ENUM ('ESPECES', 'MONCASH', 'NATCASH', 'CHEQUE', 'VIREMENT');

-- CreateEnum
CREATE TYPE "FeeReminderRule" AS ENUM ('BEFORE_5_DAYS', 'DUE_DATE', 'WEEKLY_OVERDUE', 'CRITICAL_OVERDUE');

-- CreateTable
CREATE TABLE "FeeStructure" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "registrationFee" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeTranche" (
    "id" TEXT NOT NULL,
    "feeStructureId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "latePenaltyPercent" INTEGER,
    "latePenaltyGraceDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeTranche_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeePayment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "feeTrancheId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "penaltyAmount" INTEGER NOT NULL DEFAULT 0,
    "method" "FeePaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeDispute" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "feeTrancheId" TEXT NOT NULL,
    "reason" TEXT,
    "openedById" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "FeeDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeAutomationSettings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "lateFeeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoRemindersEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reminderBefore5Days" BOOLEAN NOT NULL DEFAULT true,
    "reminderOnDueDate" BOOLEAN NOT NULL DEFAULT true,
    "reminderWeeklyOverdue" BOOLEAN NOT NULL DEFAULT false,
    "reminderCriticalOverdue" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT NOT NULL DEFAULT 'HTG',

    CONSTRAINT "FeeAutomationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeReminderLog" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "feeTrancheId" TEXT NOT NULL,
    "rule" "FeeReminderRule" NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'stub',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeeStructure_classId_key" ON "FeeStructure"("classId");

-- CreateIndex
CREATE INDEX "FeeStructure_schoolId_idx" ON "FeeStructure"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "FeeTranche_feeStructureId_order_key" ON "FeeTranche"("feeStructureId", "order");

-- CreateIndex
CREATE INDEX "FeePayment_studentId_feeTrancheId_idx" ON "FeePayment"("studentId", "feeTrancheId");

-- CreateIndex
CREATE INDEX "FeePayment_schoolId_idx" ON "FeePayment"("schoolId");

-- CreateIndex
CREATE INDEX "FeeDispute_studentId_feeTrancheId_idx" ON "FeeDispute"("studentId", "feeTrancheId");

-- CreateIndex
CREATE UNIQUE INDEX "FeeAutomationSettings_schoolId_key" ON "FeeAutomationSettings"("schoolId");

-- CreateIndex
CREATE INDEX "FeeReminderLog_studentId_feeTrancheId_rule_idx" ON "FeeReminderLog"("studentId", "feeTrancheId", "rule");

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeTranche" ADD CONSTRAINT "FeeTranche_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "FeeStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_feeTrancheId_fkey" FOREIGN KEY ("feeTrancheId") REFERENCES "FeeTranche"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeDispute" ADD CONSTRAINT "FeeDispute_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeDispute" ADD CONSTRAINT "FeeDispute_feeTrancheId_fkey" FOREIGN KEY ("feeTrancheId") REFERENCES "FeeTranche"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeDispute" ADD CONSTRAINT "FeeDispute_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeAutomationSettings" ADD CONSTRAINT "FeeAutomationSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeReminderLog" ADD CONSTRAINT "FeeReminderLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeReminderLog" ADD CONSTRAINT "FeeReminderLog_feeTrancheId_fkey" FOREIGN KEY ("feeTrancheId") REFERENCES "FeeTranche"("id") ON DELETE CASCADE ON UPDATE CASCADE;
