-- AlterTable: email becomes optional (username-only accounts have none)
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable: add username (nullable, unique) for no-email accounts
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
