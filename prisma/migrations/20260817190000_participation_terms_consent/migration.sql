-- Zustimmung zu AGB und Datenschutzerklärung beim Aktivieren der Basar-Teilnahme.
-- Nullable und ohne Backfill: bestehende Teilnahmen wurden vor Einführung des Dialogs
-- aktiviert, für sie liegt keine dokumentierte Zustimmung vor – das ist ein gültiger
-- Zustand und darf nicht als "heute zugestimmt" verfälscht werden.
ALTER TABLE "BasarSeller" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
