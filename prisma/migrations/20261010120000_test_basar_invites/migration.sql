-- Testbasar: nur für Admin und Eingeladene sichtbar (app/lib/basarAccess.ts).
-- Erzeugt mit `prisma migrate diff` aus altem gegen neues Schema, nicht von Hand geschrieben.
-- Rein additiv: neue Spalte mit Default false, neue Tabelle. Bestehende Zeilen bleiben unverändert.

-- AlterTable
ALTER TABLE "Basar" ADD COLUMN     "isTest" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BasarInvite" (
    "basarId" TEXT NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BasarInvite_pkey" PRIMARY KEY ("basarId","sellerId")
);

-- CreateIndex
CREATE INDEX "BasarInvite_sellerId_idx" ON "BasarInvite"("sellerId");

-- AddForeignKey
ALTER TABLE "BasarInvite" ADD CONSTRAINT "BasarInvite_basarId_fkey" FOREIGN KEY ("basarId") REFERENCES "Basar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasarInvite" ADD CONSTRAINT "BasarInvite_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("sellerId") ON DELETE CASCADE ON UPDATE CASCADE;

