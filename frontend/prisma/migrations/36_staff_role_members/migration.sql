-- CreateTable
CREATE TABLE "_OrganizationMemberToStaffRole" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_OrganizationMemberToStaffRole_AB_unique" ON "_OrganizationMemberToStaffRole"("A", "B");

-- CreateIndex
CREATE INDEX "_OrganizationMemberToStaffRole_B_index" ON "_OrganizationMemberToStaffRole"("B");

-- AddForeignKey
ALTER TABLE "_OrganizationMemberToStaffRole" ADD CONSTRAINT "_OrganizationMemberToStaffRole_A_fkey" FOREIGN KEY ("A") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OrganizationMemberToStaffRole" ADD CONSTRAINT "_OrganizationMemberToStaffRole_B_fkey" FOREIGN KEY ("B") REFERENCES "StaffRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: carry over existing single-role assignments (spec §8)
INSERT INTO "_OrganizationMemberToStaffRole" ("A", "B")
SELECT "id", "staffRoleId" FROM "OrganizationMember" WHERE "staffRoleId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "OrganizationMember" DROP CONSTRAINT "OrganizationMember_staffRoleId_fkey";

-- AlterTable
ALTER TABLE "OrganizationMember" DROP COLUMN "staffRoleId";
