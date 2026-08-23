-- Orga-Kennzeichen für Mitarbeiter. Wirkt an genau zwei Stellen: Teilnahme gilt in jedem
-- Basar als aktiv (ohne eigene Aktivierung), und es greift kein Artikellimit.
ALTER TABLE "Seller" ADD COLUMN "isOrga" BOOLEAN NOT NULL DEFAULT false;
