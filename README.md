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
- **Passwort-Reset**: Verkäufer können vergessene Passwörter per E-Mail zurücksetzen
- **AGB**: Allgemeine Geschäftsbedingungen müssen bei Registrierung akzeptiert werden

## Lokale Installation (zum Testen)

> **Wichtig:** Die App benötigt eine PostgreSQL-Datenbank. Ohne gültige `.env`-Datei
> mit `POSTGRES_PRISMA_URL` schlägt sowohl `npx prisma db push` als auch `npm run dev` fehl.

1. **Dateien herunterladen**
   - Projekt von GitHub herunterladen oder entpacken

2. **Node.js installieren** (falls noch nicht vorhanden)
   - Von https://nodejs.org herunterladen und installieren

3. **Terminal öffnen** und zum Projektordner navigieren

4. **Pakete installieren**
   ```bash
   npm install
   ```

5. **PostgreSQL-Datenbank bereitstellen** (einmalig)

   Du benötigst zwei Verbindungs-URLs für deine PostgreSQL-Datenbank.
   Kostenlose Optionen:
   - **Neon** (empfohlen für lokale Tests): https://neon.tech → New Project → Connection String kopieren
   - **Supabase**: https://supabase.com → New Project → Settings → Database → Connection string

   Nach dem Anlegen erhältst du zwei URLs:
   - **Pooling-URL** → für `POSTGRES_PRISMA_URL`
   - **Direkte URL** → für `POSTGRES_URL_NON_POOLING`

6. **`.env` Datei anlegen** (vor `prisma db push`!)

   Kopiere `.env.example` als `.env` und trage deine Werte ein:
   ```bash
   copy .env.example .env
   ```
   Dann `.env` öffnen und alle Felder ausfüllen (mindestens `POSTGRES_PRISMA_URL` und `POSTGRES_URL_NON_POOLING`).

7. **Datenbank-Schema hochladen**
   ```bash
   npx prisma db push
   ```

8. **Entwicklungsserver starten**
   ```bash
   npm run dev
   ```

9. **Im Browser öffnen**: http://localhost:3000

## Einstellungen anpassen (.env Datei)

Die vollständige `.env` Datei im Hauptordner:

```properties
# Admin-Zugangsdaten
ADMIN_USER=admin
ADMIN_PASS=deinPasswort

# PostgreSQL-Datenbank (Pflichtfeld!)
POSTGRES_PRISMA_URL=postgres://USER:PASS@HOST:5432/DBNAME?sslmode=require
POSTGRES_URL_NON_POOLING=postgres://USER:PASS@HOST:5432/DBNAME?sslmode=require

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
- **Schriftart**: Inter (self-hosted via next/font/google - keine externe Google-Verbindung)

## 🇩🇪 Rechtliche Konformität für Deutschland

### ✅ DSGVO (GDPR) Compliance

Die Anwendung ist **DSGVO-konform** und enthält:

- **Datenschutzerklärung** (`/datenschutz`)
  - Informiert über alle erhobenen Daten (Name, E-Mail, Verkäufer-ID)
  - Nennt alle Drittanbieter (Vercel, Supabase, Mailjet)
  - Erklärt Rechtsgrundlagen und Zwecke der Datenverarbeitung
  - Beschreibt Nutzerrechte (Auskunft, Löschung, Widerruf, etc.)
  - Speicherdauer: 3 Monate nach Basar-Ende
  
- **Impressum** (`/impressum`)
  - Pflichtangaben für Betreiber
  - **WICHTIG**: Muss mit echten Daten ausgefüllt werden!

- **AGB** (`/agb`)
  - Allgemeine Geschäftsbedingungen für Verkäufer
  - Regelt Warenannahme, Kommission (20%), Haftung
  - Muss bei Registrierung akzeptiert werden (Checkbox)
  - **WICHTIG**: Provisionssatz und Kontaktdaten anpassen!

- **Keine Tracking-Cookies**
  - Keine Google Analytics, Facebook Pixel o.ä.
  - Nur technisch notwendige Session-Daten (JWT im LocalStorage)
  - Kein Cookie-Banner erforderlich

- **Datenverarbeitung**
  - Minimale Datenerhebung (nur Name + E-Mail)
  - SSL/TLS-Verschlüsselung (HTTPS)
  - Sichere Passwort-Speicherung (bcrypt)
  - EU-Server via Supabase möglich

### ♿ WCAG 2.1 Accessibility (Barrierefreiheit)

Die Anwendung erfüllt **WCAG 2.1 Level A**:

- **Semantisches HTML**
  - Korrekte Verwendung von `<main>`, `<header>`, `<nav>`
  - Nur ein `<main>` Landmark pro Seite
  - Logische Überschriften-Hierarchie (h1, h2, h3)

- **ARIA-Attribute**
  - Burger-Menu mit `aria-expanded`, `aria-controls`, `aria-label`
  - SVG-Icons mit `aria-hidden="true"` und `focusable="false"`
  - Beschreibende Labels für alle interaktiven Elemente

- **Mobile Optimierung**
  - Mindestens 16px Schriftgröße auf Mobile
  - Touch-Targets mindestens 44px (Apple/WCAG-Empfehlung)
  - Responsive Design (mobile-first)
  - Burger-Menu für kleine Bildschirme

- **Tastatur-Navigation**
  - Alle Funktionen ohne Maus bedienbar
  - Logische Tab-Reihenfolge
  - Fokus-Indikatoren sichtbar

### 🔒 Security Features

**Implementierte Sicherheitsmaßnahmen:**

1. **Security Headers** (next.config.ts):
   - `Strict-Transport-Security` (HSTS) - erzwingt HTTPS
   - `X-Frame-Options: DENY` - verhindert Clickjacking
   - `X-Content-Type-Options: nosniff` - verhindert MIME-Sniffing
   - `Content-Security-Policy` - strenge CSP-Regeln
   - `Permissions-Policy` - blockiert Kamera, Mikrofon, Geolocation
   - `Referrer-Policy` - schützt Privatsphäre

2. **Authentifizierung**:
   - Passwort-Hashing mit bcrypt (10 Rounds)
   - JWT-Tokens mit Ablaufzeit
   - Admin-Bereich geschützt

3. **Rate Limiting**:
   - Login: Max 10 Versuche in 15 Minuten
   - Registrierung: Max 5 Versuche in 15 Minuten
   - **HINWEIS**: In-Memory Lösung - für hohe Last Redis/Upstash empfohlen

4. **Input-Validierung**:
   - SQL-Injection-Schutz durch Prisma (Prepared Statements)
   - XSS-Schutz durch React
   - E-Mail-Validierung
   - CSRF-Schutz durch Same-Origin Policy

5. **Datenbank**:
   - Verbindung nur via SSL/TLS
   - Keine sensiblen Daten im Code
   - Environment Variables für Credentials

### 🌐 Google Fonts & Privacy

**Kein Datenschutz-Problem:**

Die App nutzt **Next.js Font Optimization** (`next/font/google`):
- Fonts werden beim **Build** von Google heruntergeladen
- Fonts werden **self-hosted** auf Vercel
- **Keine Verbindung** zu Google-Servern im Browser
- **Keine IP-Adressen** werden an Google übertragen
- **100% DSGVO-konform**

Alternative: Lokale Schriftarten in `/public/fonts/` ablegen.

### 📋 Checkliste für Production-Start

Bevor du live gehst:

- [ ] **Impressum ausfüllen** mit echten Daten (Name, Adresse, Kontakt)
- [ ] **Datenschutz aktualisieren** mit deinen Kontaktdaten
- [ ] **AGB anpassen** (Provisionssatz, Kontaktdaten am Ende)
- [ ] **ADMIN_PASS ändern** - sicheres Passwort verwenden
- [ ] **JWT_SECRET ändern** - zufälligen String generieren
- [ ] **Mailjet verifizieren** - Absender-E-Mail bestätigen
- [ ] **SMTP-Daten prüfen** (SMTP_PORT=587, nicht API Key)
- [ ] **MAX_SELLERS** auf gewünschte Anzahl setzen
- [ ] **Testregistrierung** durchführen und E-Mail prüfen
- [ ] **Mobile Ansicht testen** auf echtem Smartphone
- [ ] **Accessibility prüfen** mit Browser-DevTools

### 🔍 Compliance-Tools zum Testen

**DSGVO:**
- https://www.dsgvo-portal.de/

**Accessibility:**
- Chrome DevTools Lighthouse (Accessibility Score)
- WAVE Browser Extension: https://wave.webaim.org/
- axe DevTools: https://www.deque.com/axe/

**Security:**
- https://securityheaders.com/
- https://observatory.mozilla.org/

### ⚖️ Haftungsausschluss

Die Anwendung enthält technische Umsetzungen für DSGVO und WCAG. Für rechtliche Beratung konsultiere einen Anwalt. Die Platzhalter in Impressum und Datenschutzerklärung müssen mit echten Daten ausgefüllt werden.


