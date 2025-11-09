# Kinderbasar Neukirchen - Registrierungssystem

Eine einfache Web-Anwendung für die Verwaltung von Verkäufern und Helfern beim Kinderbasar.

## Was kann die Anwendung?

- **Verkäufer-Registrierung**: Verkäufer können sich anmelden und erhalten eine Nummer (1, 2, 3, ...)
- **Helfer-Registrierung**: Mitarbeiter können sich für Aufgaben eintragen (z.B. Tische aufstellen, Annahme)
- **Kuchen-Liste**: Mitarbeiter können eintragen, welchen Kuchen sie mitbringen
- **QR-Codes & Barcodes**: Jeder Verkäufer erhält automatisch QR-Code und Barcode mit Nummer und Namen
- **Admin-Bereich**: Übersicht über alle Verkäufer, Helfer und Kuchen
- **E-Mail-Versand**: Automatische Bestätigungsmail mit QR-Code nach Registrierung

## Lokale Installation (zum Testen)

1. **Dateien herunterladen**
   - Projekt von GitHub herunterladen oder entpacken

2. **Node.js installieren** (falls noch nicht vorhanden)
   - Von https://nodejs.org herunterladen und installieren

3. **Terminal öffnen** und zum Projektordner navigieren

4. **Pakete installieren**
   ```bash
   npm install
   ```

5. **Datenbank einrichten**
   ```bash
   npx prisma migrate dev
   npx tsx seed-tasks.ts
   ```

6. **Entwicklungsserver starten**
   ```bash
   npm run dev
   ```

7. **Im Browser öffnen**: http://localhost:3000

## Einstellungen anpassen (.env Datei)

Erstelle eine `.env` Datei im Hauptordner mit folgenden Einstellungen:

```properties
# Admin-Zugangsdaten
ADMIN_USER=admin
ADMIN_PASS=deinPasswort

# E-Mail-Versand (Mailjet)
SMTP_HOST=in-v3.mailjet.com
SMTP_PORT=587
SMTP_USER=deineMailjetAPIKey
SMTP_PASS=deinMailjetSecretKey
MAIL_FROM=deine@email.de

# Sicherheitsschlüssel (beliebiger Text)
JWT_SECRET=deinGeheimesPasswort123

# Maximale Anzahl Verkäufer
MAX_SELLERS=200
```

**E-Mail-Versand einrichten:**
1. Kostenloses Konto bei Mailjet erstellen: https://www.mailjet.com
2. API-Schlüssel kopieren und in `.env` eintragen
3. Absender-E-Mail verifizieren

## Cloudflare Pages Installation

### Schritt 1: Projekt vorbereiten

1. Projekt auf GitHub hochladen (privates Repository empfohlen)
2. Stelle sicher, dass alle Dateien da sind

### Schritt 2: Cloudflare Pages einrichten

1. **Bei Cloudflare anmelden**: https://dash.cloudflare.com
2. **Pages aufrufen**: Im Menü links auf "Workers & Pages" klicken
3. **Create application** → **Pages** → **Connect to Git**
4. **GitHub verbinden** und dein Repository auswählen
5. **Build-Einstellungen**:
   - Framework preset: **Next.js**
   - Build command: `npm run build`
   - Build output directory: `.next`
   - Node version: **18** oder höher

### Schritt 3: Umgebungsvariablen eintragen

In den Cloudflare Pages Settings → Environment variables:

```
ADMIN_USER = admin
ADMIN_PASS = deinPasswort
SMTP_HOST = in-v3.mailjet.com
SMTP_PORT = 587
SMTP_USER = deineMailjetAPIKey
SMTP_PASS = deinMailjetSecretKey
MAIL_FROM = deine@email.de
JWT_SECRET = deinGeheimesPasswort123
MAX_SELLERS = 200
```

### Schritt 4: Datenbank einrichten (Cloudflare D1)

**WICHTIG**: SQLite funktioniert nicht auf Cloudflare Pages. Du brauchst Cloudflare D1:

1. **D1 Datenbank erstellen**:
   - Im Cloudflare Dashboard: **Workers & Pages** → **D1**
   - **Create database** klicken
   - Name: `basar-db`

2. **D1 mit Pages verbinden**:
   - Zurück zu deinem Pages-Projekt
   - **Settings** → **Functions** → **D1 database bindings**
   - **Add binding**: Variable name: `DB`, Database: `basar-db`

3. **Prisma für D1 anpassen**:
   
   In `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "sqlite"
     url      = env("DATABASE_URL")
   }
   ```
   
   Umgebungsvariable hinzufügen:
   ```
   DATABASE_URL = file:./data.db
   ```

4. **Datenbank-Schema hochladen**:
   
   Nach dem ersten Deploy:
   ```bash
   npx wrangler d1 execute basar-db --file=./prisma/migrations/*/migration.sql
   ```

### Schritt 5: Deploy starten

1. **Save and Deploy** klicken
2. Cloudflare baut die Anwendung (dauert 2-3 Minuten)
3. Fertig! Du erhältst eine URL wie: `https://dein-projekt.pages.dev`

## Nach dem Deploy

### Admin-Login

- URL: `https://dein-projekt.pages.dev/login`
- Benutzername: `admin` (oder was du in ADMIN_USER eingetragen hast)
- Passwort: dein ADMIN_PASS

### Aufgaben einrichten

Die Standard-Aufgaben (Tische holen, Annahme, etc.) werden automatisch erstellt.
Falls nicht, kannst du das Script manuell ausführen.

## Datenbank-Struktur

- **Seller**: Verkäufer/Mitarbeiter mit Nummer, Namen, E-Mail
- **Task**: Aufgaben (z.B. "Tische stellen FR 17-19 Uhr")
- **TaskSignup**: Zuordnung wer sich für welche Aufgabe eingetragen hat
- **Cake**: Welcher Mitarbeiter bringt welchen Kuchen mit

Alle QR-Codes und Barcodes werden direkt in der Datenbank gespeichert (schneller!).

## Probleme beheben

**Build schlägt fehl:**
- Prüfe ob alle Umgebungsvariablen gesetzt sind
- Node Version muss mindestens 18 sein

**E-Mails werden nicht versendet:**
- Mailjet-Zugangsdaten prüfen
- Absender-E-Mail muss bei Mailjet verifiziert sein

**Datenbank-Fehler:**
- D1 muss mit dem Pages-Projekt verbunden sein
- Migrations müssen hochgeladen werden

## Support

Bei Fragen oder Problemen: Prüfe die Cloudflare Pages Logs unter **Deployments** → **View details**

## Technische Details

- **Framework**: Next.js 16 mit App Router
- **Datenbank**: SQLite (lokal) / Cloudflare D1 (Production)
- **ORM**: Prisma 6
- **Styling**: Tailwind CSS v4
- **Authentication**: JWT mit bcrypt
- **E-Mail**: Nodemailer mit Mailjet SMTP
