-- Überführt die globalen Settings (Termine, Registrierungs-/Aktivierungsfenster,
-- Anlieferung, Abholung, Größenliste) und die globale Teilnahme
-- (Seller.sellerStatusActive) in den jeweiligen Basar.
--
-- Bewusst additiv und idempotent: Das Basar-Schema wurde seinerzeit per
-- `prisma db push` eingespielt, die Migrationshistorie ist gegenüber
-- schema.prisma gedriftet. Diese Migration setzt daher nichts voraus, prüft
-- jede Tabelle vor dem Zugriff und lässt Settings sowie
-- Seller.sellerStatusActive unangetastet – die fallen erst in Phase 3.

-- ─── Neue Spalten ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('"Basar"') IS NULL THEN
    RAISE NOTICE 'Tabelle "Basar" fehlt – Migration übersprungen';
    RETURN;
  END IF;

  ALTER TABLE "Basar"
    ADD COLUMN IF NOT EXISTS "dateFriday"                TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "dateSaturday"              TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "dateSunday"                TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "registrationSellerStart"   TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "registrationSellerEnd"     TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "registrationEmployeeStart" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "registrationEmployeeEnd"   TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "activationSellerStart"     TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "activationSellerEnd"       TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "activationEmployeeStart"   TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "activationEmployeeEnd"     TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "deliveryStart"             TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "deliveryEnd"               TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "deliveryStart2"            TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "deliveryEnd2"              TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "pickupStart"               TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "pickupEnd"                 TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "pickupStart2"              TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "pickupEnd2"                TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "allowedSizes"              TEXT;

  IF to_regclass('"BasarSeller"') IS NOT NULL THEN
    ALTER TABLE "BasarSeller"
      ADD COLUMN IF NOT EXISTS "isActive"    BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "activatedAt" TIMESTAMP(3);
  END IF;
END $$;

-- ─── Backfill ────────────────────────────────────────────────────────────────
-- Settings-Werte sind naive Strings in deutscher Ortszeit ("2026-09-01T10:00").
-- Prisma erwartet in TIMESTAMP(3) die UTC-Wandzeit, daher die doppelte
-- AT-TIME-ZONE-Umrechnung. Der Regex-Filter verhindert, dass ein leerer oder
-- kaputter Wert die Migration abbricht.
-- plpgsql statt sql: Eine SQL-Funktion validiert ihren Body schon beim Anlegen
-- und würde ohne Settings-Tabelle sofort fehlschlagen – noch bevor der Guard
-- weiter unten greift.
CREATE OR REPLACE FUNCTION pg_temp.setting_ts(p_key TEXT) RETURNS TIMESTAMP(3) AS $fn$
DECLARE
  raw TEXT;
BEGIN
  IF to_regclass('"Settings"') IS NULL THEN
    RETURN NULL;
  END IF;

  EXECUTE 'SELECT "value" FROM "Settings" WHERE "key" = $1 LIMIT 1' INTO raw USING p_key;

  IF raw IS NULL OR raw !~ '^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$' THEN
    RETURN NULL;
  END IF;

  RETURN (raw::timestamp AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'UTC';
END;
$fn$ LANGUAGE plpgsql STABLE;

DO $$
DECLARE
  -- Manuell bestätigtes Backfill-Ziel statt einer "neuester offener Basar"-Heuristik:
  -- In der Live-DB stammen die globalen Settings-Termine (März 2026) aus keinem der
  -- vorhandenen Basare – eine automatische Auswahl nach Status/Datum hätte den
  -- Testdatensatz "Test Sample 2026-08-05" getroffen statt des tatsächlich laufenden
  -- Basars "Herbst 4" (status ACTIVE, mit den 210 echten aktiven Verkäufern).
  target_id TEXT := 'cmnnnzc1k0004l104r9c1cqtg'; -- "Herbst 4"
  moved     INTEGER;
BEGIN
  IF to_regclass('"Basar"') IS NULL OR to_regclass('"Settings"') IS NULL THEN
    RAISE NOTICE 'Basar oder Settings fehlt – Backfill übersprungen';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "Basar" WHERE "id" = target_id) THEN
    RAISE NOTICE 'Backfill-Zielbasar % nicht gefunden – Backfill übersprungen', target_id;
    RETURN;
  END IF;

  -- COALESCE: ein bereits gepflegter Wert am Basar gewinnt, der Backfill ist
  -- dadurch gefahrlos wiederholbar.
  UPDATE "Basar" SET
    "dateFriday"                = COALESCE("dateFriday",                pg_temp.setting_ts('date_freitag')),
    "dateSaturday"              = COALESCE("dateSaturday",              pg_temp.setting_ts('date_samstag')),
    "dateSunday"                = COALESCE("dateSunday",                pg_temp.setting_ts('date_sonntag')),
    "registrationSellerStart"   = COALESCE("registrationSellerStart",   pg_temp.setting_ts('registration_seller_start')),
    "registrationSellerEnd"     = COALESCE("registrationSellerEnd",     pg_temp.setting_ts('registration_seller_end')),
    "registrationEmployeeStart" = COALESCE("registrationEmployeeStart", pg_temp.setting_ts('registration_employee_start')),
    "registrationEmployeeEnd"   = COALESCE("registrationEmployeeEnd",   pg_temp.setting_ts('registration_employee_end')),
    "activationSellerStart"     = COALESCE("activationSellerStart",     pg_temp.setting_ts('activation_seller_start')),
    "activationSellerEnd"       = COALESCE("activationSellerEnd",       pg_temp.setting_ts('activation_seller_end')),
    "activationEmployeeStart"   = COALESCE("activationEmployeeStart",   pg_temp.setting_ts('activation_employee_start')),
    "activationEmployeeEnd"     = COALESCE("activationEmployeeEnd",     pg_temp.setting_ts('activation_employee_end')),
    "deliveryStart"             = COALESCE("deliveryStart",             pg_temp.setting_ts('delivery_start')),
    "deliveryEnd"               = COALESCE("deliveryEnd",               pg_temp.setting_ts('delivery_end')),
    "deliveryStart2"            = COALESCE("deliveryStart2",            pg_temp.setting_ts('delivery_start2')),
    "deliveryEnd2"              = COALESCE("deliveryEnd2",              pg_temp.setting_ts('delivery_end2')),
    "pickupStart"               = COALESCE("pickupStart",               pg_temp.setting_ts('pickup_start')),
    "pickupEnd"                 = COALESCE("pickupEnd",                 pg_temp.setting_ts('pickup_end')),
    "pickupStart2"              = COALESCE("pickupStart2",              pg_temp.setting_ts('pickup_start2')),
    "pickupEnd2"                = COALESCE("pickupEnd2",                pg_temp.setting_ts('pickup_end2')),
    "allowedSizes"              = COALESCE(
      "allowedSizes",
      NULLIF((SELECT "value" FROM "Settings" WHERE "key" = 'allowed_sizes' LIMIT 1), ''),
      'XXS,XS,S,M,L,XL,XXL,3XL,4XL,5XL,50,56,62,68,74,80,86,92,98,104,110,116,122,128,134,140,146,152,158,164,170,176,W24,W25,W26,W27,W28,W29,W30,W31,W32,W33,W34,W36,W38,W40,W42,W44,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49'
    )
  WHERE "id" = target_id;

  -- eventDate wird ab jetzt abgeleitet (frühester gesetzter Tag). LEAST ignoriert
  -- NULL-Werte; ohne jeden Tag bleibt der bisherige Wert stehen.
  UPDATE "Basar"
  SET "eventDate" = COALESCE(LEAST("dateFriday", "dateSaturday", "dateSunday"), "eventDate")
  WHERE "id" = target_id;

  -- Globale Teilnahme → Teilnahme an diesem Basar.
  IF to_regclass('"BasarSeller"') IS NOT NULL THEN
    INSERT INTO "BasarSeller" ("id", "basarId", "sellerId", "isActive", "activatedAt", "createdAt")
    SELECT gen_random_uuid()::text, target_id, s."sellerId", true, NOW(), NOW()
    FROM "Seller" s
    WHERE s."sellerStatusActive" = true
    ON CONFLICT ("basarId", "sellerId") DO UPDATE
      SET "isActive"    = true,
          "activatedAt" = COALESCE("BasarSeller"."activatedAt", NOW());

    GET DIAGNOSTICS moved = ROW_COUNT;
    RAISE NOTICE 'Backfill: % Teilnahmen auf Basar % übertragen', moved, target_id;
  END IF;
END $$;

DROP FUNCTION IF EXISTS pg_temp.setting_ts(TEXT);
