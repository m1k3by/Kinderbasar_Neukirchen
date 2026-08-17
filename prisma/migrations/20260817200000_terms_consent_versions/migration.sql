-- Fassungen von AGB und Datenschutzerklärung, denen beim Aktivieren der Teilnahme
-- zugestimmt wurde (siehe app/lib/legalDocs.ts).
--
-- Nullable und ohne Backfill, aus demselben Grund wie bei termsAcceptedAt: für frühere
-- Zustimmungen ist nicht belegt, welche Fassung damals angezeigt wurde. Ein Backfill mit
-- der heutigen Fassung würde einen Nachweis behaupten, den es nicht gibt.
ALTER TABLE "BasarSeller" ADD COLUMN IF NOT EXISTS "termsVersion" VARCHAR(32);
ALTER TABLE "BasarSeller" ADD COLUMN IF NOT EXISTS "privacyVersion" VARCHAR(32);
