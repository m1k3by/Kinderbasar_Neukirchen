# Vercel Deployment Guide - Kinderbasar Neukirchen

## 🎯 Schritt-für-Schritt Anleitung

### 1. Vercel Account & Projekt Import

1. Gehe zu: https://vercel.com/new
2. Klicke auf **"Import Git Repository"**
3. Wenn du noch nicht verbunden bist: **"Add GitHub Account"**
4. Suche und wähle: `m1k3by/Kinderbasar_Neukirchen`
5. Klicke auf **"Import"**

---

### 2. Projekt-Einstellungen

Vercel erkennt Next.js automatisch. Prüfe die Settings:

**Framework Preset**: Next.js ✅ (automatisch erkannt)

**Build Settings**:
- **Build Command**: `npm run build` ✅
- **Output Directory**: `.next` ✅
- **Install Command**: `npm install` ✅

**Root Directory**: `/` (leer lassen)

**Node.js Version**: 20.x (automatisch)

➡️ **Klicke noch NICHT auf "Deploy"** - erst Environment Variables setzen!

---

### 3. Environment Variables hinzufügen

**WICHTIG**: Klicke auf **"Environment Variables"** (vor dem Deploy!)

Füge folgende Variablen hinzu:

#### **Erforderliche Variables:**

```
ADMIN_USER=admin
```

```
ADMIN_PASS=dein-sicheres-passwort-hier
```

```
JWT_SECRET=generiere-ein-mindestens-32-zeichen-langes-secret
```

**JWT_SECRET generieren (PowerShell):**
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

#### **SMTP Settings (für Email-Versand):**

```
SMTP_HOST=smtp.gmail.com
```

```
SMTP_PORT=587
```

```
SMTP_USER=deine-email@gmail.com
```

```
SMTP_PASS=dein-app-passwort
```

**Gmail App-Passwort erstellen:**
1. https://myaccount.google.com/apppasswords
2. App auswählen: "Mail"
3. Gerät: "Windows Computer"
4. Passwort kopieren

```
MAIL_FROM=Kinderbasar Neukirchen <noreply@deine-domain.com>
```

#### **App Settings:**

```
MAX_SELLERS=200
```

```
DATABASE_URL=file:./prisma/data.db
```

**Wichtig für alle Variablen:**
- Wähle **"All Environments"** (Production, Preview, Development)
- Klicke jeweils auf **"Add"**

---

### 4. Datenbank konfigurieren

#### **Option A: Vercel Postgres** (Empfohlen) ⭐

**Vorteile:**
- Native Vercel Integration
- Automatisches Backup
- Kostenlos für kleine Projekte
- Ähnlich wie Cloudflare D1

**Setup:**
1. Gehe zu deinem Projekt → **"Storage"** Tab
2. Klicke **"Create Database"** → **"Postgres"**
3. Wähle Region (am besten nahe deiner Nutzer)
4. Database Name: `kinderbasar-db`
5. Klicke **"Create"**

**Prisma Schema anpassen:**

Ändere in `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"  // statt sqlite
  url      = env("POSTGRES_PRISMA_URL")
}
```

**Migration durchführen:**
```powershell
# Nach dem ersten Deployment in Vercel Dashboard:
# Settings → Functions → "Deploy" → Wait
# Dann lokal:
npx prisma migrate dev --name init
npx vercel env pull .env.local
npx prisma db push
```

#### **Option B: SQLite in /tmp** (Einfach, aber NICHT persistent!)

SQLite funktioniert auf Vercel, **aber Daten gehen bei jedem Deployment verloren!**

Nur für Testing geeignet.

**Besser für Production:** Option A (Vercel Postgres)

#### **Option C: Externe Datenbank**

- **Supabase**: PostgreSQL, kostenlos, einfach
- **PlanetScale**: MySQL-kompatibel, serverless
- **Railway**: PostgreSQL, einfaches Setup

---

### 5. Deploy starten! 🚀

1. Scrolle nach unten
2. Klicke auf **"Deploy"**
3. Warte ca. 2-3 Minuten
4. ✅ Deine App ist live!

**Deployment URL:**
- Production: `https://kinderbasar-neukirchen.vercel.app`
- Jeder Git Push deployed automatisch eine Preview

---

### 6. Nach dem Deployment

#### **Datenbank initialisieren** (nur bei Vercel Postgres):

1. Gehe zu deinem Projekt → **Settings** → **Functions**
2. Öffne die Vercel CLI lokal:

```powershell
npm install -g vercel
vercel login
vercel link
vercel env pull .env.local
npx prisma db push
```

#### **Testen:**

1. Öffne deine App: `https://dein-projekt.vercel.app`
2. Teste Registrierung: `/register/seller`
3. Teste Admin-Login: `/login`
4. Teste Email-Versand

#### **Logs anzeigen:**

Vercel Dashboard → Dein Projekt → **"Logs"** Tab

#### **Custom Domain hinzufügen** (Optional):

Settings → **Domains** → Eigene Domain verbinden

---

## 🔧 Troubleshooting

### Build Fehler

**Problem**: Prisma Client nicht gefunden  
**Lösung**: Füge zu `package.json` hinzu:
```json
"scripts": {
  "postinstall": "prisma generate"
}
```

### Email-Versand funktioniert nicht

**Problem**: SMTP blockiert  
**Lösung**: Wechsel zu Resend (siehe `EMAIL_SETUP.md`)

### Datenbank-Verbindung fehlgeschlagen

**Problem**: DATABASE_URL falsch  
**Lösung**: Prüfe Environment Variables im Vercel Dashboard

---

## 📊 Vercel Features nutzen

### Analytics aktivieren

Dashboard → Analytics → Enable

### Performance Monitoring

Dashboard → Speed Insights → Enable

### Preview Deployments

Jeder Branch + PR bekommt automatisch eine Preview-URL!

---

## 🎉 Fertig!

Deine App läuft jetzt auf Vercel mit:
- ✅ Automatischem Deployment bei jedem Git Push
- ✅ HTTPS (kostenlos)
- ✅ CDN weltweit
- ✅ Serverless Functions
- ✅ Zero-Config

**Support:**
- Vercel Docs: https://vercel.com/docs
- Next.js Docs: https://nextjs.org/docs

Viel Erfolg mit dem Kinderbasar! 🎈
