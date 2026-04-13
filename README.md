# Kinderbasar Neukirchen

Web-Anwendung für die Verwaltung von Verkäufern, Helfern und dem Kassenbetrieb beim Kinderbasar.

---

## Features

### Verkäufer
- Registrierung mit permanenter Verkäufernummer (sellerId)
- Verkäuferstatus aktivieren/deaktivieren
- Artikel anlegen pro Basar (Beschreibung, Größe, Preis, Zielgruppe: Junge/Mädchen/Unisex)
- Druckbare Etiketten mit QR-Code – **stabil über mehrere Basare**, kein Neudruck bei Wiederverwendung
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
| Offline-Kasse | idb-keyval (IndexedDB) |
| Hosting | Vercel |

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
   npx prisma db push
   ```

---

## Nützliche Befehle

```bash
npx prisma studio     # Datenbank-UI
npx prisma db push    # Schema-Änderungen anwenden
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


