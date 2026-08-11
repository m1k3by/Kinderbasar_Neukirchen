# Kinderbasar Neukirchen

Web-Anwendung für die Verwaltung von Verkäufern, Helfern und dem Kassenbetrieb beim Kinderbasar.

---

## Features

### Verkäufer
- Registrierung mit permanenter Verkäufernummer (sellerId)
- Verkäuferstatus aktivieren/deaktivieren
- Artikel anlegen pro Basar (Beschreibung, Größe, Preis, Zielgruppe: Junge/Mädchen/Unisex)
- Druckbare Etiketten mit QR-Code – **stabil über mehrere Basare**, kein Neudruck bei Wiederverwendung (→ [Etiketten & PDF-Druck](#etiketten--pdf-druck))
- Artikel aus vorherigem Basar ins Archiv übernehmen
- Abrechnung nach Basar-Ende einsehen und als PDF exportieren
- Passwort selbst ändern / zurücksetzen per E-Mail

### Mitarbeiter / Helfer
- Helferstatus aktivieren/deaktivieren
- Aufgaben (Schichten) eintragen, Kuchenliste pflegen
- Kassierer-Rolle: QR-Scanner, Warenkorb, Rückgeldrechner, Offline-Modus mit automatischer Synchronisierung

### Admin
- Basare anlegen und verwalten (Status: Vorbereitung → Anmeldung → Aktiv → Beendet)
- Verkäuferliste inkl. Statusanzeige, Passwort-Reset, Benutzer löschen
- Artikelübersicht und Abrechnung je Basar als PDF
- Einstellungen (max. Verkäufer, Provision, Teilnahmegebühr je Basar)

### Allgemein
- E-Mail: Registrierungsbestätigung, Passwort-Reset (Mailjet)
- AGB, Impressum, Datenschutzerklärung (DSGVO-konform)
- Rate Limiting, JWT-Auth (httpOnly Cookie), bcrypt, Security Headers

---

## Technischer Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Datenbank | PostgreSQL via Supabase/Vercel, Prisma 6 ORM |
| Styling | Tailwind CSS v4 |
| Auth | JWT (httpOnly Cookie) + bcrypt |
| E-Mail | Nodemailer + Mailjet SMTP |
| QR/Barcode | qrcode, bwip-js |
| PDF | jsPDF (absolute mm-Koordinaten, serverseitig erzeugt) |
| Offline-Kasse | idb-keyval (IndexedDB) |
| Hosting | Vercel |

---

## Etiketten & PDF-Druck

> **Grundsatz: Ein PDF muss auf jedem Gerät identisch aussehen und auf jedem Drucker identisch herauskommen.**
> iOS, iPadOS, Android, Windows, macOS, Linux – Smartphone, Tablet, Notebook. Diskrepanzen sind nicht akzeptabel.

Etiketten werden auf **vorgestanzte Bögen (Avery Zweckform 3475, 70 × 36 mm, 3 × 8 = 24 pro A4-Blatt)** gedruckt. Das Raster ist fix – schon wenige Millimeter Abweichung machen einen Bogen unbrauchbar.

### Warum nicht per Browser-Druck

Ein HTML-Bogen mit `@page { size: A4; margin: 0 }` und `window.print()` funktioniert **nicht** geräteübergreifend:

- **iOS Safari ignoriert `@page`-Ränder**, erzwingt eigene Druckränder (~14 mm) und skaliert den Inhalt per Shrink-to-Fit in den Rest hinein. Das ist ein bekanntes, seit Jahren bestehendes Verhalten der Safari-Druck-Engine.
- Gemessen an einem real erzeugten Bogen (iOS 26, „Als PDF sichern"): Skalierungsfaktor **0,866** → Spaltenraster **60,7 mm statt 70 mm**, Zeilenraster **31,1 mm statt 36 mm**, erste Spalte 16,2 mm statt 2,5 mm vom Rand.
- Der Versatz summiert sich: In Zeile 8 sind es **~21 mm** – mehr als eine halbe Etikettenhöhe.
- Entscheidend: Der Fehler steckt dann **bereits in der PDF-Datei**. Kein späterer Druckdialog auf Android oder PC kann ihn noch korrigieren – deshalb kam beim selben Drucker von beiden Geräten dasselbe schiefe Ergebnis heraus.

### Verbindliche Vorgaben

1. **PDFs serverseitig erzeugen** und als Datei ausliefern (`Content-Type: application/pdf`). Das Endgerät rendert nichts selbst – Geräteunabhängigkeit ist damit strukturell garantiert.
2. **Absolute Millimeter-Koordinaten** (`new jsPDF({ unit: 'mm', format: 'a4' })`). Kein HTML-Layout, kein Textfluss, kein `html2canvas`.
3. **Nur PDF-Standardfonts (Helvetica) oder eingebettete Schriften.** `Arial` gibt es auf Linux/Android nicht.
4. **QR-Codes als Vektor zeichnen** (`QRCode.create()` → Rechtecke), nicht als PNG einbetten. Auflösungsunabhängig, bei jeder Drucker-DPI scannbar, deutlich kleinere Dateien.
5. **`doc.viewerPreferences({ PrintScaling: 'None' })`** setzen – Adobe Acrobat/Reader wählt daraufhin „Tatsächliche Größe" vor. Chrome und Firefox ignorieren den Hinweis, deshalb zusätzlich Punkt 6.
6. **Hinweis in der Oberfläche**: „Beim Drucken *Tatsächliche Größe* / 100 % wählen – nicht *An Seite anpassen*."
7. **Mindestens 5 mm Inhaltsabstand zur Papierkante.** Avery 3475 nutzt mit 3 × 70 mm exakt die volle A4-Breite, typische Drucker haben aber 4–5 mm nicht bedruckbaren Rand.

Die technische Spezifikation dazu: **[docs/spec-etiketten-pdf.md](docs/spec-etiketten-pdf.md)**

### Für Nutzer: so drucken

1. Etiketten-PDF in der App herunterladen (nicht über „Seite drucken → Als PDF sichern" im Browser erzeugen).
2. PDF öffnen und drucken mit **Papierformat A4** und **Skalierung „Tatsächliche Größe" / 100 %**.
3. Vor dem ersten Bogen einen Probedruck auf Normalpapier machen und gegen den Etikettenbogen halten.

---

## Lokale Installation

> Benötigt eine PostgreSQL-Datenbank. Ohne `.env` schlägt `npm run dev` fehl.

```bash
npm install
copy .env.example .env   # Werte eintragen (siehe unten)
npx prisma db push
npm run dev
```

Öffnen: http://localhost:3000

---

## Umgebungsvariablen (`.env`)

```properties
ADMIN_USER=admin
ADMIN_PASS=sicheresPasswort

POSTGRES_PRISMA_URL=postgres://USER:PASS@HOST:5432/DBNAME?sslmode=require
POSTGRES_URL_NON_POOLING=postgres://USER:PASS@HOST:5432/DBNAME?sslmode=require

SMTP_HOST=in-v3.mailjet.com
SMTP_PORT=587
SMTP_USER=mailjetApiKey
SMTP_PASS=mailjetSecretKey
MAIL_FROM=Kinderbasar Neukirchen <deine@email.de>

JWT_SECRET=zufaelligerGeheimstring
MAX_SELLERS=200
```

---

## Vercel Deployment

1. Repository auf GitHub pushen
2. Vercel → **New Project** → Repository importieren
3. **Storage → Create Database → Postgres** anlegen (DB-Variablen werden automatisch gesetzt)
4. Restliche Umgebungsvariablen in Project Settings → Environment Variables eintragen
5. Nach erstem Deploy:
   ```bash
   npx vercel link
   vercel env pull .env.local
   npx prisma migrate deploy
   ```

> ⚠️ **Für Produktivdatenbanken `prisma migrate deploy` verwenden, nicht `prisma db push`.**
> `db push` gleicht nur das Tabellenschema ab und führt die Migrations-SQL **nicht** aus. Alles,
> was eine Migration an Daten anlegt, fehlt danach – etwa die Zählerzeile in `SellerIdCounter`.
> Ohne sie schlägt jede Registrierung mit „Alle Verkäufer-IDs sind vergeben" fehl, obwohl der
> Bereich 1000–9999 leer ist. `db push` ist nur für die lokale Entwicklung gedacht.

---

## Nützliche Befehle

```bash
npx prisma studio     # Datenbank-UI
npx prisma db push       # Schema-Änderungen anwenden – nur lokal, siehe Warnung oben
npx prisma migrate deploy # Migrationen produktiv ausführen
npx prisma generate   # Prisma Client neu generieren
npm run build         # Production Build testen
vercel --prod         # Manueller Deploy
```

---

## Unit Tests

Tests sind mit **Vitest** umgesetzt und decken `app/lib/**` sowie `app/api/**` ab.

**Setup** (`__tests__/`):
- `setup.ts` – setzt Test-Umgebungsvariablen (JWT_SECRET, ADMIN_PASS, etc.)
- `helpers/tokens.ts` – erzeugt signierte JWTs für verschiedene Rollen (admin, seller, cashier)
- Prisma und externe Dienste (Mail, QR-Code) werden pro Testdatei gemockt

**Befehle:**

```bash
npm run test:run          # alle Tests einmalig ausführen
npm test                  # Tests im Watch-Modus
npm run test:coverage     # Coverage-Report (Schwellwert: 90 %)
```

Das Coverage-Ergebnis wird in der Konsole angezeigt. Fehlgeschlagene Tests werden mit `✕` markiert und zeigen Datei + Zeile. Der HTML-Report liegt unter `coverage/index.html`.

---

## Rechtliches (Deutschland)

- **Impressum** (`/impressum`) und **Datenschutzerklärung** (`/datenschutz`) müssen mit echten Daten befüllt werden
- **AGB** (`/agb`): Provisionssatz und Kontaktdaten anpassen
- Google Fonts sind self-hosted via `next/font` – keine externe Verbindung, DSGVO-konform
- Keine Tracking-Cookies, kein Cookie-Banner erforderlich

---

## Checkliste vor Go-Live

- [ ] Impressum mit echten Daten ausfüllen
- [ ] Datenschutzerklärung aktualisieren
- [ ] AGB anpassen (Provision, Kontakt)
- [ ] `ADMIN_PASS` und `JWT_SECRET` ändern
- [ ] Mailjet-Absender verifizieren
- [ ] Testregistrierung + E-Mail prüfen
- [ ] Mobile-Ansicht auf echtem Gerät testen
- [ ] Etikettenbogen von **iPhone, Android und PC** herunterladen und drucken – die drei Ausdrucke müssen deckungsgleich sein und auf den Avery-3475-Bogen passen


