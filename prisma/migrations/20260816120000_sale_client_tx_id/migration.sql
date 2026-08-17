-- Persistiert den Kassiervorgang (clientTxId), der bisher nur geloggt wurde. Additiv und
-- nullable, kein Backfill: Altbestand bleibt NULL und wird von der Transaktions-Ansicht als
-- eigener Einzelvorgang behandelt (siehe app/api/basars/[id]/transactions/route.ts).

ALTER TABLE "Sale" ADD COLUMN "clientTxId" TEXT;

CREATE INDEX "Sale_basarId_clientTxId_idx" ON "Sale"("basarId", "clientTxId");
