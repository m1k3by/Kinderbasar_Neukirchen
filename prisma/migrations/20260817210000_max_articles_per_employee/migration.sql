-- Eigenes Artikellimit für Mitarbeiter/Orga je Basar.
--
-- Nullable und ohne Backfill: null bedeutet "kein eigenes Limit, es gilt das Verkäuferlimit".
-- Ein NOT NULL DEFAULT 50 hätte bei jedem Bestandsbasar mit einem höheren Verkäuferlimit das
-- Mitarbeiterlimit stillschweigend abgesenkt. Siehe app/lib/articleLimits.ts.
ALTER TABLE "Basar" ADD COLUMN IF NOT EXISTS "maxArticlesPerEmployee" INTEGER;
