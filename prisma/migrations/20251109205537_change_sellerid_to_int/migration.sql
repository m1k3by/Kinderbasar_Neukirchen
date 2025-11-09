/*
  Warnings:

  - You are about to alter the column `sellerId` on the `Seller` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Seller" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "isEmployee" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "password" TEXT
);
INSERT INTO "new_Seller" ("createdAt", "email", "firstName", "id", "isEmployee", "lastName", "password", "sellerId") SELECT "createdAt", "email", "firstName", "id", "isEmployee", "lastName", "password", "sellerId" FROM "Seller";
DROP TABLE "Seller";
ALTER TABLE "new_Seller" RENAME TO "Seller";
CREATE UNIQUE INDEX "Seller_email_key" ON "Seller"("email");
CREATE UNIQUE INDEX "Seller_sellerId_key" ON "Seller"("sellerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
