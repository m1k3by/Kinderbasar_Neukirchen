-- Storno-Protokoll: wer hat wann storniert. Additiv und nullable, kein Backfill – bereits
-- stornierte Altverkäufe behalten cancelledAt/cancelledById = NULL und erscheinen in der
-- Storno-Liste als "unbekannt (vor Protokollierung)". Siehe
-- app/api/basars/[id]/cancellations/route.ts.
--
-- cancelledById zeigt auf Seller.sellerId. NULL bei einem Admin-Storno (Admins haben keine
-- sellerId) – unterscheidbar vom Altbestand daran, dass cancelledAt gesetzt ist.

ALTER TABLE "Sale" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN "cancelledById" INTEGER;

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cancelledById_fkey"
  FOREIGN KEY ("cancelledById") REFERENCES "Seller"("sellerId") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Sale_basarId_cancelledAt_idx" ON "Sale"("basarId", "cancelledAt");
