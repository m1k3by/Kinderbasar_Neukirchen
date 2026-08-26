# CLAUDE.md

Projektregeln für Kinderbasar Neukirchen (Next.js 16 App Router, React 19, TypeScript, Prisma/PostgreSQL, Tailwind v4, Deployment auf Vercel).

---

## Befehle

```bash
npm run dev            # Dev-Server
npm run build          # prisma generate + prisma migrate deploy + next build
npm run lint           # ESLint
npm run test:run       # Vitest einmalig
npm run test:coverage  # Coverage (Schwellwert 90 %)
npm run db:push        # Prisma-Schema anwenden – nur lokal!
```

> **Migrationen laufen im Build.** `npm run build` ruft `prisma migrate deploy` auf, bevor
> `next build` startet. Grund: am 19.08.2026 ging die Seite auf 500, weil vier Migrationen
> vom 17.08. als Code deployt, aber nie gegen die Datenbank ausgeführt wurden
> (`The column Basar.maxArticlesPerEmployee does not exist in the current database`, P2022).
> Solange das Anwenden ein manueller Schritt war, konnte er vergessen werden. Nebenwirkung
> mit Absicht: ist die Datenbank beim Build nicht erreichbar, scheitert das Deployment —
> besser als eine Seite, die erst zur Laufzeit auseinanderfliegt.
>
> **`db push` niemals gegen die Produktivdatenbank.** Es gleicht das Tabellenschema ab, führt
> aber die Migrations-SQL nicht aus – von Migrationen angelegte Daten fehlen dann. Produktiv
> gilt `prisma migrate deploy`. Wenn eine Migration Daten braucht (Seed-Zeilen, Backfills),
> muss der Code den Fall „Daten fehlen" zusätzlich selbst abfangen können, statt ihn als
> regulären Zustand zu interpretieren.

Tests liegen unter `__tests__/` und decken `app/lib/**` und `app/api/**` ab. Prisma und externe Dienste (Mail, QR) werden pro Testdatei gemockt.

### Testregeln

> **Ein Mock, der sich anders verhält als das echte System, widerlegt keine falsche Annahme – er bestätigt sie.** Alle Tests sind vollständig gemockt, keiner spricht mit Postgres. Deshalb gelten drei Regeln:

1. **`Decimal`-Spalten mit `dec()` mocken**, nie als `number` – siehe `__tests__/helpers/decimal.ts`. Prisma liefert `Prisma.Decimal`, dessen `valueOf()` ein String ist: `0 + dec(2.50) + dec(3.00)` ergibt `"02.53"`, nicht `5.5`. Nur Werte aus JSON-Request-Bodys bleiben `number`. Betroffen sind `Article.price`, `SellerArticle.price`, `Sale.salePrice`, `Basar.commissionPercent`, `Basar.entryFee`, `BasarSeller.commissionOverride` und alle vier `Settlement`-Beträge.
2. **Wirkung prüfen, nicht nur den Statuscode.** Bei 401/403 ist der Code der ganze Vertrag – bei allem, was schreibt, nicht. Ein Storno, der `isCancelled: false` setzt, liefert ebenfalls 200.
3. **Bei `$transaction` die Argumente der Schreiboperationen prüfen.** Ein gemocktes `$transaction` führt nichts aus; ohne Argumentprüfung ist der gesamte fachliche Inhalt ungetestet.

Wer einen Fehler behebt, baut ihn danach einmal wieder ein und prüft, dass der neue Test rot wird. Ein Test, der ohne diesen Nachweis geschrieben wurde, ist nicht als Regressionsschutz belegt.

---

## Struktur

- `app/api/**` – Route Handler. Auth immer über `app/lib/apiAuth.ts` (`getAuth()`), nie selbst JWT parsen.
- `app/lib/**` – geteilte Logik (Auth, Mail, Zeitfenster, Größen, Rate Limiting). Neue Geschäftslogik gehört hierhin, nicht in Page-Komponenten – nur so ist sie testbar.
- `app/admin | seller | employee/**` – rollenspezifische Oberflächen.
- `prisma/schema.prisma` – Datenmodell.

---

## PDF & Druck – verbindliche Regeln

> **Grundsatz: Ein PDF muss auf jedem Gerät bitgleich sein und auf jedem Drucker identisch herauskommen.**
> iOS, iPadOS, Android, Windows, macOS, Linux – Handy, Tablet, Notebook. Es darf keine Diskrepanz geben.
> Das gilt besonders für Etiketten: sie werden auf vorgestanzte Bögen (Avery Zweckform 3475, 70 × 36 mm, 3 × 8 = 24 pro A4-Bogen) gedruckt. Schon 2 mm Abweichung zerstören den Bogen.

### Verboten

- **Kein `window.print()` für Etiketten oder andere maßhaltige Ausgaben.** Kein `window.open()` mit HTML-Bogen, kein `@page`/`@media print`-CSS als Layoutgrundlage.
  *Warum:* iOS Safari ignoriert `@page { margin: 0 }`, erzwingt eigene Druckränder (~14 mm) und skaliert den Inhalt per Shrink-to-Fit. Gemessen an einem realen Etikettenbogen: Faktor **0,866** → Spaltenraster 60,7 mm statt 70 mm, Zeilenraster 31,1 mm statt 36 mm. Bei Zeile 8 sind das **21 mm Versatz** – die Etiketten sind unbrauchbar. Der Fehler steckt dann bereits in der Datei, kein Druckdialog kann ihn noch korrigieren.
- **Kein `html2canvas`, kein HTML-zu-PDF im Browser.** Ergebnis hängt von Viewport, DPR, Systemschriften und Engine ab.
- **Keine Systemschriften.** Nur PDF-Standardfonts (Helvetica) oder eingebettete Fonts. `Arial` existiert auf Linux/Android nicht und fällt auf eine andere Metrik zurück.
- **Kein Layout, das exakt die volle Papierbreite ausnutzt**, ohne Sicherheitsabstand nach innen (siehe unten).

### Vorgeschrieben

1. **PDF serverseitig erzeugen**, als Route Handler mit `Content-Type: application/pdf`, z. B. `GET /api/basars/[id]/labels.pdf`. Das Gerät lädt eine fertige Datei herunter und rendert nichts selbst – damit ist Geräteunabhängigkeit strukturell garantiert und nicht nur getestet.
2. **Absolute Koordinaten in Millimetern**, `new jsPDF({ unit: 'mm', format: 'a4' })`. Keine relativen Layouts, kein Textfluss, kein Umbruch durch die Engine. Jede Position wird berechnet:
   ```ts
   const x = col * 70;          // Spaltenraster
   const y = 4.5 + row * 36;    // Zeilenraster, 4.5 mm Bogenrand oben
   ```
3. **QR-Codes als Vektor zeichnen**, nicht als PNG einbetten:
   ```ts
   const qr = QRCode.create(code, { errorCorrectionLevel: 'M' });
   const n = qr.modules.size;              // z. B. 21
   const m = sizeMm / (n + 2 * quietZone); // Modulkantenlänge in mm
   // pro gesetztem Modul: doc.rect(x, y, m, m, 'F')
   ```
   Vektor ist auflösungsunabhängig, scannt bei jeder Drucker-DPI sauber und macht das PDF um Größenordnungen kleiner. Ein 300-px-PNG auf 17 mm ist bei 600 dpi bereits interpoliert.
4. **`doc.viewerPreferences({ PrintScaling: 'None' })` setzen.** Das ist ein *Hinweis* an den Viewer, im Druckdialog „Tatsächliche Größe" vorzuwählen. Adobe Acrobat/Reader wertet ihn aus; Firefox/pdf.js ignoriert ihn nachweislich (Bugzilla 1243580), Chrome ebenfalls nicht zuverlässig. Deshalb ersetzt er nicht Punkt 5.
5. **Der Nutzer muss trotzdem informiert werden**: sichtbarer Hinweis an der Download-Stelle – *„Beim Drucken ‚Tatsächliche Größe' / 100 % wählen, nicht ‚An Seite anpassen'."*
6. **Mindestens 5 mm Inhaltsabstand zur Papierkante.** Avery 3475 hat keine Ränder – 3 × 70 mm = exakt 210 mm. Typische Laser- und Tintendrucker haben aber 4–5 mm nicht bedruckbaren Rand. Inhalt in der linken/rechten Etikettenspalte muss deshalb ≥ 5 mm eingerückt sein, sonst wird er abgeschnitten – unabhängig von der Skalierung.
7. **Jeder PDF-Link braucht `target="_blank"` und `rel="noopener"`.** Die App läuft als PWA mit
   `display: standalone` (`public/manifest.json`): vom iPhone-Home-Bildschirm gestartet hat sie
   keine Adressleiste, keine Tabs und keinen Zurück-Knopf. Wird dieses eine Fenster zum PDF
   navigiert, führt kein Weg zurück – der Nutzer muss die App beenden und neu starten und
   verliert dabei alles Nichtgespeicherte. `download` allein genügt nicht: iOS entscheidet
   selbst, ob es die Datei lädt oder anzeigt. Mit `_blank` übernimmt Safari das PDF und das
   App-Fenster bleibt unberührt stehen.

### Bestehende Stellen

Umsetzungsdetails für den Etikettenbogen: **[docs/spec-etiketten-pdf.md](docs/spec-etiketten-pdf.md)**

| Ort | Zweck | Status |
|---|---|---|
| `app/lib/labels.ts` + `app/api/basars/[id]/labels.pdf/route.ts` | Etikettenbogen | ✅ serverseitig, absolute mm, Vektor-QR |
| `app/lib/settlementPdf.ts` + `app/api/basars/[id]/settlements/[sellerIdParam]/abrechnung.pdf/route.ts` | Abrechnung (Verkäufer + Admin, ein gemeinsamer Generator) | ✅ serverseitig, absolute mm |
| `app/api/articles/[qrCode]/qr/route.ts` | QR als PNG (Bildschirmanzeige) | ✅ – für PDF stattdessen Vektor zeichnen |

### Prüfung bei Änderungen an PDFs

Nach jeder Änderung an einer PDF-Ausgabe: Datei erzeugen und die Geometrie messen, nicht nur ansehen. Erwartet für den Etikettenbogen:

- MediaBox `0 0 595.2756 841.8898` (A4)
- Spaltenraster 198,43 pt (70 mm), Zeilenraster 102,05 pt (36 mm)
- keine Skalierungsmatrix ≠ 1 auf Seitenebene

---

## Sonstige Konventionen

- Sprache der Oberfläche und aller Nutzertexte: **Deutsch**.
- Beträge über `fmt()` formatieren, Währung `€` mit schmalem Abstand davor.
- Verkäufernummer (`sellerId`) ist permanent und basarübergreifend stabil; QR-Codes von Artikeln dürfen sich bei Wiederverwendung über Basare hinweg **nicht** ändern (sonst müsste neu gedruckt werden).
- Fehler in Route Handlern: `console.error` mit Routenpfad als Präfix, nach außen generische Meldung.
- **Orga (`Seller.isOrga`) ist ein Zusatzkennzeichen für Mitarbeiter, kein eigener Rang.**
  Nur der Admin setzt es (`app/api/admin/toggle-orga-status`), und es hat genau zwei
  Wirkungen: die Person gilt in **jedem** Basar als teilnehmend, ohne sich zu aktivieren
  (`app/lib/participation.ts`), und für sie greift **kein** Artikellimit
  (`app/lib/articleLimits.ts` gibt `Infinity` zurück). Die Teilnahme wird bewusst *abgeleitet*
  statt gespeichert – sonst müssten beim Setzen des Kennzeichens und beim Anlegen jedes neuen
  Basars Zeilen nachgezogen werden, und beides liefe bei der ersten vergessenen Stelle
  auseinander. `BasarSeller.maxArticlesOverride` sticht weiterhin alles, auch Orga: sonst
  ließe sich eine Orga-Person gar nicht mehr begrenzen. Beim Zurückstufen zum Verkäufer fällt
  das Kennzeichen mit weg (`toggle-employee-status`) – ein Verkäufer mit stehengebliebenem
  Orga-Kennzeichen hätte unsichtbar kein Limit, weil die Oberfläche den Schalter nur
  Mitarbeitern zeigt.

- **Aufgaben sind basarübergreifend, ihre Anmeldungen nicht.** `Task` hat bewusst kein
  `basarId` – dieselben Schichten wiederholen sich jeden Basar, eine Kopie pro Basar wäre
  nur Pflegearbeit. `TaskSignup` und `Cake` haben eines, und `basarId` gehört in den
  Unique-Key (`@@unique([taskId, sellerId, basarId])`): ohne ihn könnte sich niemand im
  nächsten Basar für eine Schicht eintragen, für die er im letzten eingetragen war.
  `GET /api/tasks` und `GET /api/cakes` verlangen `basarId` als Pflichtparameter, ebenso
  die beiden `clear-*`-Routen – **kein stiller Fallback auf „alle Basare"**. Bei
  `clear-task-signups` hängt daran die gesamte Historie: ein `deleteMany({})` ohne `where`
  löscht die Anmeldungen sämtlicher Basare und liefert dabei ebenfalls 200.

- **Eine Zahl, die aus einem optionalen Feld kommt, das die API nicht mehr liefert, ist
  stumm falsch.** `/admin/tasks` zeigte monatelang „0 / 8 Helfer": die Projektion in
  `app/api/tasks/route.ts` hatte `_count` entfernt („never read by any consumer" – die Seite
  las es), und `task._count?.signups || 0` machte daraus wortlos eine 0. Kein Fehler, kein
  Log, und weil das Feld im Interface optional deklariert war, auch keine Typwarnung.
  Konsequenz: Felder, die eine Seite tatsächlich braucht, nicht optional deklarieren, und
  bei Projektionsänderungen die *Argumente* von `findMany` testen – ein gemocktes Prisma
  ignoriert `select` vollständig, die Antwort im Test beweist darüber nichts.

- **`npm run test:e2e` (Playwright) deckt die Naht zwischen API und Seite ab**, die die
  Unit-Tests strukturell nicht erreichen: Helfer meldet sich an, trägt sich in mehrere
  Schichten ein, Admin sieht dieselben Zahlen – pro Basar (`e2e/helferliste.spec.ts`).
  Braucht eine **eigene, leere** Postgres-Datenbank in `.env.test` (Vorlage:
  `.env.test.example`); der Seed leert Tabellen und verweigert den Dienst ohne
  `E2E_ALLOW_RESET=1` sowie sobald er fremde Verkäufer vorfindet. Läuft lokal, nicht im
  Build – der läuft auf Vercel gegen die Produktivdatenbank.

- **Artikel-Archiv (`SellerArticle`) überlebt das Basar-Ende.** Ob ein Archiv-Eintrag beim nächsten Basar wieder übernehmbar ist, entscheidet ausschließlich, ob ein damit verknüpfter `Article` den Status `SOLD` erreicht hat (`app/api/seller-articles/route.ts`, `soldPreviously`): nicht verkaufte Artikel (`AVAILABLE`/`RETURNED`) bleiben übernehmbar, verkaufte Artikel dauerhaft nicht – unabhängig davon, in wie vielen weiteren Basaren der Eintrag seitdem aufgetaucht ist.
