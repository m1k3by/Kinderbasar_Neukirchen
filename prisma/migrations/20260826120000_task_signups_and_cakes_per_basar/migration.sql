-- Helferschichten und Kuchen gehoeren ab hier zu genau einem Basar.
--
-- Bestandsdaten: die Spalte wird nullable angelegt, mit demselben Basar befuellt, den die
-- Oberflaeche als Vorgabe waehlt (ACTIVE -> OPEN -> juengster), und erst danach auf NOT NULL
-- gesetzt. Existiert ueberhaupt kein passender Basar, bleibt basarId NULL; solche Zeilen sind
-- keinem Basar zuzuordnen und im neuen Modell nicht darstellbar - sie werden entfernt, damit
-- SET NOT NULL nicht scheitert und der Build nicht mitten im Deployment stehenbleibt.

-- ── TaskSignup ────────────────────────────────────────────────────────────────
ALTER TABLE "TaskSignup" ADD COLUMN "basarId" TEXT;

UPDATE "TaskSignup" SET "basarId" = (
  SELECT "id" FROM "Basar"
  WHERE "isArchived" = false AND "status" <> 'DRAFT'
  ORDER BY CASE "status" WHEN 'ACTIVE' THEN 0 WHEN 'OPEN' THEN 1 ELSE 2 END,
           "eventDate" DESC
  LIMIT 1
) WHERE "basarId" IS NULL;

DELETE FROM "TaskSignup" WHERE "basarId" IS NULL;

ALTER TABLE "TaskSignup" ALTER COLUMN "basarId" SET NOT NULL;

DROP INDEX "TaskSignup_taskId_sellerId_key";
CREATE UNIQUE INDEX "TaskSignup_taskId_sellerId_basarId_key" ON "TaskSignup"("taskId", "sellerId", "basarId");
CREATE INDEX "TaskSignup_basarId_idx" ON "TaskSignup"("basarId");

ALTER TABLE "TaskSignup" ADD CONSTRAINT "TaskSignup_basarId_fkey"
  FOREIGN KEY ("basarId") REFERENCES "Basar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Cake ──────────────────────────────────────────────────────────────────────
ALTER TABLE "Cake" ADD COLUMN "basarId" TEXT;

UPDATE "Cake" SET "basarId" = (
  SELECT "id" FROM "Basar"
  WHERE "isArchived" = false AND "status" <> 'DRAFT'
  ORDER BY CASE "status" WHEN 'ACTIVE' THEN 0 WHEN 'OPEN' THEN 1 ELSE 2 END,
           "eventDate" DESC
  LIMIT 1
) WHERE "basarId" IS NULL;

DELETE FROM "Cake" WHERE "basarId" IS NULL;

ALTER TABLE "Cake" ALTER COLUMN "basarId" SET NOT NULL;

CREATE INDEX "Cake_basarId_idx" ON "Cake"("basarId");

ALTER TABLE "Cake" ADD CONSTRAINT "Cake_basarId_fkey"
  FOREIGN KEY ("basarId") REFERENCES "Basar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
