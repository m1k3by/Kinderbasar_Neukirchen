-- Fehlende Fremdschlüssel-Indizes (Prisma legt FK-Indizes nicht automatisch an).
-- Ohne sie werden Archiv-Laden (SellerArticle.sellerId), Archiv-Löschen
-- (Article.sellerArticleId) und Abrechnungsliste (Settlement.basarId) zu Seq Scans,
-- die mit der Gesamttabelle statt mit der Ergebnismenge wachsen.
CREATE INDEX "Article_sellerArticleId_idx" ON "Article"("sellerArticleId");
CREATE INDEX "SellerArticle_sellerId_idx" ON "SellerArticle"("sellerId");
CREATE INDEX "Settlement_basarId_idx" ON "Settlement"("basarId");

-- Teilnehmerzählung je Basar (GET /api/basars, _count mit where isActive) bei jedem
-- Verkäufer-Dashboard-Aufruf. Ohne isActive im Index muss jede Zeile aus dem Heap.
CREATE INDEX "BasarSeller_basarId_isActive_idx" ON "BasarSeller"("basarId", "isActive");
