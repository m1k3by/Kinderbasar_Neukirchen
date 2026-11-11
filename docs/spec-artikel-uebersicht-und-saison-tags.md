# Spec: Artikel-Übersicht für Verkäufer und Saison-Tags im Archiv

**Status:** teilweise umgesetzt (Stand 11.11.2026). Freie Tags am Archiv-Eintrag, Suche und Filter
im Artikelbestand (L7, Abschnitt 5) gibt es seit Commit `6468b86` unter `/seller/articles`; das Formular auf der
Basar-Seite ist entfallen. Abschnitt 2 („Ist-Zustand") beschreibt den Stand vom 24.10.2026.
Die übrigen Vorschläge (L2–L6, L8, L9) sind weiter **Idee – nicht umsetzen, bevor die offenen
Fragen geklärt sind**.
**Erstellt:** 2026-10-24
**Betroffen (voraussichtlich):** [app/seller/basars/[id]/page.tsx](../app/seller/basars/[id]/page.tsx), [app/api/seller-articles/route.ts](../app/api/seller-articles/route.ts), [app/api/basars/[id]/articles/route.ts](../app/api/basars/[id]/articles/route.ts), [prisma/schema.prisma](../prisma/schema.prisma) (`SellerArticle`)

---

## 1. Anlass

Wunsch der Orga (24.10.2026): Verkäufer sollen ihre Artikel besser überblicken – „als Listen", wie bei anderen Basar-Systemen – und ihr Archiv nach Saison ordnen können (Herbst/Winter, Frühling/Sommer).

---

## 2. Ist-Zustand

**Basar-Seite des Verkäufers** (`/seller/basars/[id]`):
- Eine flache Artikelliste in Anlage-Reihenfolge, Kennzahlen (angelegt, verkauft, Erlös).
- Etiketten-PDF für alle oder ausgewählte Artikel.
- Abschnitt „Aus früherem Basar übernehmen": Archiv (`SellerArticle`) mit Mehrfachauswahl und Löschen.
- **Keine** Suche, kein Filter, keine Sortierung, keine Gruppierung, keine eigene Liste zum Ausdrucken oder Exportieren.

**Archiv** (`SellerArticle`): `title`, `sizeLabel`, `gender`, `price`, `qrCode` – keine Kategorie, keine Saison.

---

## 3. Vergleich: Basarlino (öffentlich dokumentierter Stand, Recherche 24.10.2026)

Öffentlich ist wenig beschrieben; belegt sind:
- **Artikelliste je Veranstaltung**; nach Veranstaltungsende per Button in eine andere Veranstaltung **übertragbar** (neue Preisschilder nötig). Quelle: basarlino.de/faq
- **Lagerbereich:** nicht verkaufte Artikel wandern automatisch ins persönliche Lager und lassen sich mit einem Klick in einen neuen Basar übernehmen (bei uns: Archiv). Quelle: basarlino.de
- **Spende-Kennzeichen** je Artikel, in der Artikelliste ausgewiesen. Quelle: basarlino.de/faq
- **Größenspiegel** (Veranstalter): Artikel nach Größe und Geschlecht aufgeschlüsselt, auch als PDF/Excel. Quelle: basarlino.de/releases (05.07.2026)
- Basare verlangen teils die **ausgedruckte, unterschriebene Artikelliste** bei der Abgabe. Quelle: Veranstalterseiten
- Einzelne Basare erlauben **mehrere Listen pro Person** (z. B. „bis zu 3 Listen à 30 Artikel") – dort offenbar mehrere Nummern/Listen je Person, nicht Ordner innerhalb einer Liste.
- Kritik in einer App-Rezension: identische Artikel lassen sich schlecht **doppelt erfassen**.

Nicht öffentlich dokumentiert (also unbekannt): Filter, Sortierung, Kategorien, Tags innerhalb der Verkäufer-Artikelliste.

---

## 4. Vorschläge Übersicht („Listen") – noch nicht entschieden

Sortiert nach Aufwand, jeweils ohne Mehrlast für Server/DB, wenn clientseitig über die ohnehin geladene Liste gelöst:

| # | Vorschlag | Aufwand | Anmerkung |
|---|---|---|---|
| L1 | **Filter-Chips** Alle / Offen / Verkauft / Zurückgegeben + **Suche** im Titel | klein | rein clientseitig |
| L2 | **Sortieren** nach Anlage, Titel, Größe, Preis | klein | clientseitig |
| L3 | **Gruppieren** nach Größe oder Geschlecht, je Gruppe Anzahl, verkauft, Summe (auf-/zuklappbar) | klein–mittel | eigener Größenspiegel für den Verkäufer |
| L4 | **Artikel kopieren** („Noch einmal anlegen") für identische Teile | klein | neuer QR-Code, sonst gleiche Daten |
| L5 | **Eigene Artikelliste als PDF** (Abgabeliste, optional mit Unterschriftsfeld) | mittel | serverseitig, PDF-Regeln aus CLAUDE.md |
| L6 | **Export als Excel** der eigenen Artikel | klein | `write-excel-file` ist im Projekt |
| L7 | Dieselben Filter/Suche im **Archiv** (Übernahme-Liste) | klein | wichtig, sobald das Archiv groß wird |
| L8 | **Eigene benannte Listen** („Kiste 1", „Winterjacken"): Artikel einer Liste zuordnen, Etiketten und Übersicht je Liste | groß | Schema-Änderung; Abgrenzung zu Saison-Tags (Abschnitt 5) klären |
| L9 | **Spende-Kennzeichen** je Artikel | mittel | **Orga-Entscheidung** – was passiert mit Spenden bei Abholung/Abrechnung? Nicht erfinden |

---

## 5. Saison-Tags im Archiv – **für später**

**Wunsch:** Beim Anlegen bzw. im Archiv einen Artikel optional als **Herbst/Winter** oder **Frühling/Sommer** kennzeichnen, damit das Archiv nach Saison getrennt und gefiltert werden kann („Ordnung im Archiv").

**Skizze (nicht entschieden):**
- Feld am **Archiv-Eintrag** (`SellerArticle`), nicht am basarbezogenen `Article` – die Saison gehört zum Kleidungsstück, nicht zum Basar. Übernahme in einen Basar ändert nichts daran.
- Freiwillig: ohne Tag bleibt alles wie heute.
- Filter „Herbst/Winter · Frühling/Sommer · ohne Saison" in der Übernahme-Liste (siehe L7); evtl. Vorauswahl passend zur Saison des Basars.

**Offene Fragen (nicht erfinden – mit der Orga klären):**
1. Feste Werte (nur die zwei Saisons, evtl. „ganzjährig") oder **freie Tags/Kategorien**, die jeder selbst anlegt (z. B. „Schuhe", „Spielzeug")?
2. Mehrere Tags je Artikel erlaubt (z. B. ganzjährig + Spielzeug)?
3. Saison am Basar hinterlegen, damit die Übernahme-Liste automatisch vorfiltert? Woran erkennt man die Saison eines Basars (Titel, Datum, eigenes Feld)?
4. Nachträglich änderbar? (Vorschlag: ja, es ist nur Ordnung, keine Abrechnungsgröße.)
5. Verhältnis zu L8 „eigene benannte Listen": ein gemeinsames Konzept („Tags") oder zwei getrennte?

**Technische Hinweise:**
- Schema-Änderung per **Migration** (`prisma migrate`), niemals `db push` gegen Produktion (CLAUDE.md).
- Bei freien Tags: eigene Tabelle (`SellerTag`, n:m zu `SellerArticle`) statt Freitext-Spalte, sonst keine saubere Filterung.
- Keine Mehrlast: Tags kommen mit der ohnehin geladenen Archivliste mit, Filter clientseitig.
