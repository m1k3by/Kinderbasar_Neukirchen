# Kinderbasar Neukirchen - Registrierungssystem

Eine einfache Web-Anwendung für die Verwaltung von Verkäufern und Helfern beim Kinderbasar.

**Live-App:** https://kinderbasar-neukirchen.vercel.app

## Was kann die Anwendung?

- **Verkäufer-Registrierung**: Verkäufer können sich anmelden und erhalten eine Nummer (1, 2, 3, ...)
- **Helfer-Registrierung**: Mitarbeiter können sich für Aufgaben eintragen (z.B. Tische aufstellen, Annahme)
- **Kuchen-Liste**: Mitarbeiter können eintragen, welchen Kuchen sie mitbringen
- **QR-Codes & Barcodes**: Jeder Verkäufer erhält automatisch QR-Code und Barcode mit Nummer und Namen
- **Admin-Bereich**: Übersicht über alle Verkäufer, Helfer und Kuchen
- **E-Mail-Versand**: Automatische Bestätigungsmail mit QR-Code nach Registrierung
- **Datum-Einstellung**: Basar-Termine können über Admin-Oberfläche verwaltet werden

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
   npx prisma db push
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
MAIL_FROM=Kinderbasar Neukirchen <deine@email.de>

# Sicherheitsschlüssel (beliebiger Text)
JWT_SECRET=deinGeheimesPasswort123

# Maximale Anzahl Verkäufer
MAX_SELLERS=200

# PostgreSQL Datenbank (Supabase via Vercel)
POSTGRES_PRISMA_URL=postgres://...
POSTGRES_URL_NON_POOLING=postgres://...
```

**E-Mail-Versand einrichten:**
1. Kostenloses Konto bei Mailjet erstellen: https://www.mailjet.com
2. API-Schlüssel kopieren und in `.env` eintragen
3. Absender-E-Mail verifizieren

## Vercel Deployment

### Schritt 1: Projekt vorbereiten

1. Projekt auf GitHub hochladen (privates Repository empfohlen)
2. Stelle sicher, dass alle Dateien da sind

### Schritt 2: Vercel einrichten

1. **Bei Vercel anmelden**: https://vercel.com
2. **New Project** klicken
3. **Import Git Repository** und dein GitHub-Repository auswählen
4. **Build-Einstellungen** (werden automatisch erkannt):
   - Framework preset: **Next.js**
   - Build command: `npm run build`
   - Output directory: `.next`

### Schritt 3: Datenbank einrichten

1. **Postgres Datenbank erstellen**:
   - Im Vercel Dashboard zu deinem Projekt
   - **Storage** Tab → **Create Database**
   - **Postgres** auswählen
   - Datenbank wird automatisch mit deinem Projekt verbunden

2. **Umgebungsvariablen werden automatisch gesetzt**:
   - `POSTGRES_PRISMA_URL`
   - `POSTGRES_URL_NON_POOLING`

### Schritt 4: Weitere Umgebungsvariablen eintragen

In den Vercel Project Settings → Environment Variables:

```
ADMIN_USER = admin
ADMIN_PASS = deinPasswort
SMTP_HOST = in-v3.mailjet.com
SMTP_PORT = 587
SMTP_USER = deineMailjetAPIKey
SMTP_PASS = deinMailjetSecretKey
MAIL_FROM = Kinderbasar Neukirchen <deine@email.de>
JWT_SECRET = deinGeheimesPasswort123
MAX_SELLERS = 200
```

### Schritt 5: Datenbank-Schema hochladen

Nach dem ersten Deploy:

```bash
# Mit Vercel verbinden
npx vercel link

# Datenbank Schema hochladen
npx prisma db push
```

Alternativ über Vercel CLI mit Environment-Variablen:
```bash
vercel env pull .env.local
npx prisma db push
```

### Schritt 6: Deploy starten

1. **Deploy** klicken
2. Vercel baut die Anwendung (dauert 2-3 Minuten)
3. Fertig! Du erhältst eine URL wie: `https://dein-projekt.vercel.app`

## Nach dem Deploy

### Admin-Login

- URL: `https://dein-projekt.vercel.app/login`
- Benutzername: `admin` (oder was du in ADMIN_USER eingetragen hast)
- Passwort: dein ADMIN_PASS

### Aufgaben und Termine einrichten

1. Als Admin einloggen
2. **Datum einstellen** aufrufen und Basar-Termine eintragen
3. **Aufgaben** aufrufen und Helferschichten anlegen

### Datenbank verwalten

**Prisma Studio (lokal):**
```bash
npx prisma studio
```

**Vercel Dashboard:**
- Storage → Postgres → Data
- Oder direkt über Supabase Dashboard

## Datenbank-Struktur

- **Seller**: Verkäufer/Mitarbeiter mit Nummer, Namen, E-Mail
- **Task**: Aufgaben (z.B. "Kuchenverkauf Samstag 14-16 Uhr")
- **TaskSignup**: Zuordnung wer sich für welche Aufgabe eingetragen hat
- **Cake**: Welcher Mitarbeiter bringt welchen Kuchen mit
- **Settings**: Basar-Termine (Freitag, Samstag, Sonntag)

Alle QR-Codes und Barcodes werden direkt in der Datenbank gespeichert.

## Probleme beheben

**Build schlägt fehl:**
- Prüfe ob alle Umgebungsvariablen gesetzt sind
- Node Version muss mindestens 18 sein

**E-Mails werden nicht versendet:**
- Mailjet-Zugangsdaten prüfen
- Absender-E-Mail muss bei Mailjet verifiziert sein
- `SMTP_PORT` muss `587` sein (nicht der API Key)
- `SMTP_USER` ist der API Key

**Datenbank-Fehler:**
- Postgres Datenbank muss in Vercel Storage erstellt sein
- `npx prisma db push` nach Schema-Änderungen ausführen
- Umgebungsvariablen `POSTGRES_PRISMA_URL` und `POSTGRES_URL_NON_POOLING` müssen gesetzt sein

## Nützliche Befehle

```bash
# Prisma Studio starten
npx prisma studio

# Datenbank Schema aktualisieren
npx prisma db push

# Prisma Client neu generieren
npx prisma generate

# Production Build testen
npm run build

# Vercel Production Deploy
vercel --prod
```

## Technische Details

- **Framework**: Next.js 16 mit App Router
- **Datenbank**: PostgreSQL (Supabase via Vercel Storage)
- **ORM**: Prisma 6
- **Styling**: Tailwind CSS v4
- **Authentication**: JWT mit bcrypt
- **E-Mail**: Nodemailer mit Mailjet SMTP
- **Hosting**: Vercel
- **Barcode/QR**: bwip-js, qrcode


