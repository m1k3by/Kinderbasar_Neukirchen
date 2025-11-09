# Cloudflare Pages Deployment Guide

## Voraussetzungen
- Cloudflare Account
- Wrangler CLI installiert (`npm install -g wrangler`)
- Git Repository auf GitHub

## 1. Cloudflare D1 Datenbank erstellen

```powershell
# Login bei Cloudflare
wrangler login

# D1 Datenbank erstellen
wrangler d1 create kinderbasar-db
```

Die Ausgabe enthält eine `database_id`. Kopiere diese ID und füge sie in `wrangler.toml` ein:
```toml
[[d1_databases]]
binding = "DB"
database_name = "kinderbasar-db"
database_id = "DEINE-DATABASE-ID-HIER"  # <-- Hier einfügen
```

## 2. Prisma Schema für D1 migrieren

Da D1 SQLite-kompatibel ist, funktioniert dein aktuelles Prisma Schema. Führe die Migration aus:

```powershell
# Prisma Schema in SQL exportieren
npx prisma migrate dev --name init

# Die generierte SQL-Datei zu D1 hochladen
wrangler d1 execute kinderbasar-db --file=./prisma/migrations/MIGRATION_ORDNER/migration.sql
```

Alternative: Manuelles SQL hochladen
```powershell
# Schema direkt hochladen
wrangler d1 execute kinderbasar-db --command="CREATE TABLE Seller (...);"
```

## 3. Umgebungsvariablen in Cloudflare Pages setzen

Gehe zu: Cloudflare Dashboard → Workers & Pages → Dein Projekt → Settings → Environment Variables

Füge folgende Variablen hinzu:

### Production Environment:
```
ADMIN_USER=admin
ADMIN_PASS=dein-sicheres-passwort
JWT_SECRET=ein-sehr-langes-geheimes-secret-mindestens-32-zeichen
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=deine-email@gmail.com
SMTP_PASS=dein-app-passwort
MAIL_FROM=Kinderbasar Neukirchen <noreply@example.com>
MAX_SELLERS=200
DATABASE_URL=file:./data.db  # Wird von D1 binding überschrieben
```

## 4. Prisma für D1 konfigurieren

Aktualisiere `app/lib/prisma.ts` um D1 zu nutzen:

```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// In Cloudflare Pages wird DB binding verfügbar sein
export const getPrisma = (env?: any) => {
  if (env?.DB) {
    // Cloudflare D1
    const adapter = new PrismaD1(env.DB);
    return new PrismaClient({ adapter });
  }
  // Lokal: SQLite
  return globalForPrisma.prisma || new PrismaClient();
};

export const prisma = getPrisma();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

**Wichtig:** Installiere den D1 Adapter:
```powershell
npm install @prisma/adapter-d1
```

## 5. Repository mit Cloudflare Pages verbinden

1. Gehe zu Cloudflare Dashboard → Workers & Pages → Create Application
2. Wähle "Pages" → "Connect to Git"
3. Wähle dein GitHub Repository
4. Build Settings:
   - **Framework preset**: Next.js
   - **Build command**: `npm run build`
   - **Build output directory**: `.next`
   - **Root directory**: `/` (oder leer lassen)

5. Environment Variables hinzufügen (siehe Schritt 3)
6. Klicke auf "Save and Deploy"

## 6. D1 Binding in Pages konfigurieren

Nach dem ersten Deployment:
1. Gehe zu Settings → Functions
2. Füge unter "D1 database bindings" hinzu:
   - **Variable name**: `DB`
   - **D1 database**: Wähle `kinderbasar-db`

## 7. Testen

Nach dem Deployment kannst du die App unter `https://dein-projekt.pages.dev` aufrufen.

## Bekannte Einschränkungen

### ⚠️ Nodemailer in Edge Runtime
Nodemailer könnte in Cloudflare Workers/Pages nicht funktionieren. Alternativen:

**Option 1: Resend (empfohlen)**
```powershell
npm install resend
```

Ersetze `app/lib/mail.ts`:
```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendMail = async (to: string, subject: string, html: string) => {
  await resend.emails.send({
    from: process.env.MAIL_FROM!,
    to,
    subject,
    html,
  });
};
```

**Option 2: SendGrid**
```powershell
npm install @sendgrid/mail
```

**Option 3: Cloudflare Email Workers**
Nutze Cloudflare's eigene Email API.

### ✅ Was funktioniert
- ✅ Next.js SSR/SSG
- ✅ API Routes
- ✅ Prisma mit D1
- ✅ QR-Code Generation (qrcode Package)
- ✅ Barcode Generation (bwip-js)
- ✅ bcrypt Hashing
- ✅ JWT Authentication

### ❌ Was NICHT funktioniert
- ❌ Nodemailer (siehe Alternativen oben)
- ❌ Node.js native modules (canvas, sharp, etc.)
- ❌ Dateisystem-Zugriffe (fs, path für Dateien)

## Lokale Entwicklung

Für lokale Entwicklung mit SQLite:
```powershell
npm run dev
```

Für lokale Entwicklung mit D1 (empfohlen):
```powershell
# Lokale D1 Datenbank erstellen
wrangler d1 execute kinderbasar-db --local --file=./prisma/migrations/MIGRATION/migration.sql

# Dev-Server mit D1 binding
npx wrangler pages dev npm run dev -- --experimental-local
```

## Troubleshooting

### Build-Fehler mit canvas/native Modulen
Falls noch Probleme auftauchen:
```powershell
npm uninstall jsbarcode
```

### Prisma Client Generation
Nach Schema-Änderungen:
```powershell
npx prisma generate
npx prisma migrate dev
wrangler d1 execute kinderbasar-db --file=./prisma/migrations/XXX/migration.sql
```

### Edge Runtime Errors
Manche API Routes müssen explizit für Edge Runtime konfiguriert werden:
```typescript
export const runtime = 'edge'; // In route.ts hinzufügen
```

## Weitere Optimierungen

### Caching
Nutze Cloudflare's CDN für statische Assets:
```typescript
// In next.config.ts
const nextConfig = {
  images: {
    loader: 'custom',
    loaderFile: './cloudflare-image-loader.ts',
  },
};
```

### Performance
- Nutze `export const runtime = 'edge'` in API Routes für bessere Latenz
- Aktiviere Cloudflare's Auto Minify (HTML, CSS, JS)
- Nutze Cloudflare Analytics
