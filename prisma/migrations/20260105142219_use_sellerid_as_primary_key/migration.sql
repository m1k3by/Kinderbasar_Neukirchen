/*
  Warnings:

  - The primary key for the `Seller` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Seller` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[resetToken]` on the table `Seller` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `sellerId` on the `Cake` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `sellerId` on the `Seller` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `sellerId` on the `TaskSignup` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "Cake" DROP CONSTRAINT "Cake_sellerId_fkey";

-- DropForeignKey
ALTER TABLE "TaskSignup" DROP CONSTRAINT "TaskSignup_sellerId_fkey";

-- DropIndex
DROP INDEX "Seller_sellerId_key";

-- AlterTable
ALTER TABLE "Cake" DROP COLUMN "sellerId",
ADD COLUMN     "sellerId" INTEGER NOT NULL,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Seller" DROP CONSTRAINT "Seller_pkey",
DROP COLUMN "id",
ADD COLUMN     "resetToken" TEXT,
ADD COLUMN     "resetTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "sellerStatusActive" BOOLEAN NOT NULL DEFAULT false,
DROP COLUMN "sellerId",
ADD COLUMN     "sellerId" INTEGER NOT NULL,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "Seller_pkey" PRIMARY KEY ("sellerId");

-- AlterTable
ALTER TABLE "Task" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TaskSignup" DROP COLUMN "sellerId",
ADD COLUMN     "sellerId" INTEGER NOT NULL,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Settings_key_key" ON "Settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_resetToken_key" ON "Seller"("resetToken");

-- CreateIndex
CREATE UNIQUE INDEX "TaskSignup_taskId_sellerId_key" ON "TaskSignup"("taskId", "sellerId");

-- AddForeignKey
ALTER TABLE "TaskSignup" ADD CONSTRAINT "TaskSignup_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("sellerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cake" ADD CONSTRAINT "Cake_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("sellerId") ON DELETE RESTRICT ON UPDATE CASCADE;
