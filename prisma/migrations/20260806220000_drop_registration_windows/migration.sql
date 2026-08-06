-- Entfernt Basar.registrationSellerStart/End und Basar.registrationEmployeeStart/End.
--
-- Hintergrund: Die Kontoregistrierung wurde von der Basar-Teilnahme entkoppelt (siehe
-- app/api/register/route.ts) – ein Konto anzulegen ist jetzt jederzeit möglich und
-- basar-unabhängig, nur die TEILNAHME an einem konkreten Basar bleibt zeitlich begrenzt
-- (Basar.activationSellerStart/End, activationEmployeeStart/End). Diese vier Spalten
-- werden seit diesem Umbau nirgends mehr gelesen oder geschrieben.
--
-- Additiv/idempotent wie die vorherigen Migrationen: nichts wird vorausgesetzt, was nicht
-- nachweislich in der Live-DB existiert.

DO $$
BEGIN
  IF to_regclass('"Basar"') IS NULL THEN
    RAISE NOTICE 'Tabelle "Basar" fehlt – Migration übersprungen';
    RETURN;
  END IF;

  ALTER TABLE "Basar"
    DROP COLUMN IF EXISTS "registrationSellerStart",
    DROP COLUMN IF EXISTS "registrationSellerEnd",
    DROP COLUMN IF EXISTS "registrationEmployeeStart",
    DROP COLUMN IF EXISTS "registrationEmployeeEnd";
END $$;
