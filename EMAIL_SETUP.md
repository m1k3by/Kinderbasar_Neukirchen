# Email Provider Setup für Cloudflare Pages

Da `nodemailer` möglicherweise nicht in Cloudflare Workers/Pages funktioniert, hier Alternativen:

## Option 1: Resend (Empfohlen) ⭐

### Vorteile
- ✅ Einfache API
- ✅ Funktioniert in Edge Runtime
- ✅ Günstiger Free-Tier (3.000 emails/Monat)
- ✅ Gute Developer Experience

### Setup

1. **Account erstellen**: https://resend.com/signup
2. **API Key generieren**: Dashboard → API Keys → Create API Key
3. **Package installieren**:
   ```powershell
   npm install resend
   ```

4. **`app/lib/mail.ts` ersetzen**:
   ```typescript
   import { Resend } from 'resend';
   import { env } from './env';

   const resend = new Resend(process.env.RESEND_API_KEY);

   export const sendMail = async (to: string, subject: string, html: string) => {
     const { data, error } = await resend.emails.send({
       from: env.MAIL_FROM,
       to: [to],
       subject,
       html,
     });

     if (error) {
       console.error('Email error:', error);
       throw new Error('Failed to send email');
     }

     return data;
   };
   ```

5. **Environment Variable hinzufügen**:
   - Cloudflare Dashboard → Settings → Environment Variables
   - `RESEND_API_KEY=re_xxxxxxxxxx`

6. **`app/lib/env.ts` erweitern**:
   ```typescript
   export const env = {
     // ... existing vars
     RESEND_API_KEY: process.env.RESEND_API_KEY,
   } as const;
   ```

---

## Option 2: SendGrid

### Vorteile
- ✅ Sehr zuverlässig
- ✅ 100 emails/Tag gratis
- ✅ Funktioniert in Edge Runtime

### Setup

1. **Account erstellen**: https://sendgrid.com
2. **API Key generieren**: Settings → API Keys
3. **Package installieren**:
   ```powershell
   npm install @sendgrid/mail
   ```

4. **`app/lib/mail.ts` ersetzen**:
   ```typescript
   import sgMail from '@sendgrid/mail';
   import { env } from './env';

   sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

   export const sendMail = async (to: string, subject: string, html: string) => {
     const msg = {
       to,
       from: env.MAIL_FROM,
       subject,
       html,
     };

     try {
       await sgMail.send(msg);
     } catch (error) {
       console.error('SendGrid error:', error);
       throw new Error('Failed to send email');
     }
   };
   ```

5. **Environment Variable**: `SENDGRID_API_KEY`

---

## Option 3: Cloudflare Email Workers

### Vorteile
- ✅ Native Cloudflare Integration
- ✅ Keine externen Dependencies

### Setup

1. **Email Routing aktivieren**: Cloudflare Dashboard → Email → Email Routing
2. **Email Worker erstellen**:
   ```typescript
   // workers/email-worker.ts
   export default {
     async email(message, env, ctx) {
       await fetch('https://api.mailchannels.net/tx/v1/send', {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({
           personalizations: [{ to: [{ email: message.to }] }],
           from: { email: message.from },
           subject: message.subject,
           content: [{ type: 'text/html', value: message.html }],
         }),
       });
     },
   };
   ```

3. **In wrangler.toml**:
   ```toml
   [[email_bindings]]
   name = "EMAIL"
   destination_address = "basar@your-domain.com"
   ```

---

## Option 4: Nodemailer BEHALTEN (könnte funktionieren)

### Test in Cloudflare Pages

Nodemailer könnte mit SMTP über TLS in Cloudflare Workers funktionieren. Teste es:

1. **Keine Änderungen nötig** - behalte aktuellen Code
2. **Deploye zu Cloudflare Pages**
3. **Teste Email-Versand**
4. **Falls Fehler**: Wechsel zu Resend/SendGrid

### Bekannte Probleme
- ❌ Cloudflare Workers haben eingeschränkte TCP-Sockets
- ❌ SMTP könnte timeout issues haben
- ⚠️ Funktioniert eventuell nur mit `secure: true` (Port 465)

### Fallback-Strategie
```typescript
// app/lib/mail.ts
import nodemailer from 'nodemailer';
import { env } from './env';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: 465, // Nutze 465 statt 587
  secure: true, // true für Port 465
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export const sendMail = async (to: string, subject: string, html: string) => {
  try {
    await transporter.sendMail({
      from: env.MAIL_FROM,
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error('Email error:', error);
    // Fallback: Log to console or queue for later
    console.log('Email would be sent to:', to, 'Subject:', subject);
    throw new Error('Email service unavailable');
  }
};
```

---

## Empfehlung

**Für Production: Resend** (Option 1)
- Schnellstes Setup
- Beste Edge Runtime Kompatibilität
- Großzügiger Free-Tier
- Modern API

**Für Testing: Aktuellen nodemailer behalten** (Option 4)
- Erstmal deployen und testen
- Bei Problemen zu Resend wechseln
- Schnellster Weg zum ersten Deployment

---

## Migration Steps

### Von Nodemailer zu Resend

1. Install Resend:
   ```powershell
   npm install resend
   npm uninstall nodemailer @types/nodemailer
   ```

2. Ersetze `app/lib/mail.ts` (siehe Option 1)

3. Füge `RESEND_API_KEY` zu Cloudflare hinzu

4. Update `app/lib/env.ts`

5. Test lokal:
   ```powershell
   npm run dev
   ```

6. Deploy:
   ```powershell
   git add .
   git commit -m "Switch to Resend for email"
   git push
   ```

Das war's! 🎉
