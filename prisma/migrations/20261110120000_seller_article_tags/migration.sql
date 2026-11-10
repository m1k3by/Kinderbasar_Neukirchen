-- Freie Tags am Archiv-Eintrag (SellerArticle), z. B. „Sommer"/„Winter".
-- Erzeugt mit `prisma migrate diff` aus altem gegen neues Schema, nicht von Hand geschrieben.
-- Rein additiv: neue Spalte mit Default leeres Array. Bestehende Zeilen bleiben unverändert.

-- AlterTable
ALTER TABLE "SellerArticle" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

