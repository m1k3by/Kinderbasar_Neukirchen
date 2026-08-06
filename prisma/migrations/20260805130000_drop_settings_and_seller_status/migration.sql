-- Entfernt die globalen Settings und Seller.sellerStatusActive endgültig, nachdem
-- 20260805120000_basar_owns_settings deployed und der Backfill in Produktion
-- verifiziert wurde (Werte je Basar geprüft, BasarSeller.isActive gegen die
-- Anzahl vormals aktiver Seller abgeglichen).
--
-- NICHT vor dieser Verifikation ausführen – ab hier gibt es keinen Weg zurück
-- zu den alten globalen Werten.
--
-- Additiv/idempotent wie die vorherige Migration: nichts wird vorausgesetzt,
-- was nicht nachweislich in der Live-DB existiert.

DO $$
BEGIN
  IF to_regclass('"Settings"') IS NOT NULL THEN
    DROP TABLE "Settings";
  END IF;

  IF to_regclass('"Seller"') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'Seller' AND column_name = 'sellerStatusActive'
     ) THEN
    ALTER TABLE "Seller" DROP COLUMN "sellerStatusActive";
  END IF;
END $$;
