import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '../../lib/prisma';
import { generateQR, generateBarcode } from '../../lib/qr';
import { isRegistrationOpen } from '../../lib/basarWindows';
import path from 'path';
import fs from 'fs';
import { rateLimit } from '../../lib/rateLimit';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getAuth } from '../../lib/apiAuth';

// Allocates the next sellerId atomically (range 1000-9999). A single UPDATE...RETURNING
// statement, serialized by Postgres at the row level, so two concurrent registrations always
// get different ids. Replaces the old approach of loading every existing sellerId and
// scanning for the first free slot, which was O(n) per request (repeated on every retry) and
// still raced under parallel load – two requests could compute the same "free" id and one
// would lose to a P2002 on create. Returns null once the range is exhausted (nextId > 9999).
async function allocateSellerId(): Promise<number | null> {
  const rows = await prisma.$transaction(async (tx) => {
    return tx.$queryRaw<{ allocated: number }[]>`
      UPDATE "SellerIdCounter"
      SET "nextId" = "nextId" + 1
      WHERE "id" = 'default' AND "nextId" <= 9999
      RETURNING "nextId" - 1 AS "allocated"
    `;
  });
  if (!rows || rows.length === 0) return null;
  return rows[0].allocated;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  let email: string | undefined;

  try {
    const body = await request.json();
    const { email: emailInput, firstName, lastName, isEmployee: isEmployeeInput, basarId } = body;
    email = emailInput;
    // Strict boolean coercion – nothing else in the body may influence privileges
    // (isCashier in particular is never settable through registration).
    const isEmployee = isEmployeeInput === true;

    console.log('[REGISTER] Attempt:', {
      email: email ? email.substring(0, 3) + '***' : 'undefined',
      firstName: firstName ? firstName.substring(0, 1) + '***' : 'undefined',
      lastName: lastName ? lastName.substring(0, 1) + '***' : 'undefined',
      isEmployee,
      ip,
      userAgent: userAgent.substring(0, 50),
      timestamp: new Date().toISOString()
    });

    // Normalize email to lowercase for case-insensitive comparison
    email = email?.toLowerCase();

    // Check if request is from admin (skip validations)
    const auth = await getAuth();
    const isAdmin = auth?.role === 'admin';

    // Rate limiting: per-email (the identity that actually matters for abuse) rather than
    // per-IP – at a bazaar hall or in a family, everyone shares one NAT IP, so a strict
    // per-IP limit locks out legitimate co-located users. A much higher per-IP limit is kept
    // as a coarse guard against a single source hammering the endpoint. Skipped for admin.
    if (!isAdmin) {
      const emailKey = `register:email:${email}`;
      const ipKey = `register:ip:${ip}`;
      const [emailAllowed, ipAllowed] = await Promise.all([
        rateLimit(emailKey, { maxRequests: 5, windowMs: 15 * 60 * 1000 }),
        rateLimit(ipKey, { maxRequests: 50, windowMs: 15 * 60 * 1000 }),
      ]);

      if (!emailAllowed || !ipAllowed) {
        console.log('[REGISTER] Rate limit exceeded:', { email: email?.substring(0, 3) + '***', ip, emailAllowed, ipAllowed });
        return NextResponse.json(
          { error: 'Zu viele Registrierungsversuche. Bitte versuchen Sie es später erneut.' },
          { status: 429 }
        );
      }
    }

    // Registrierung ist an einen Basar gebunden – ein Konto entsteht, aber die
    // Teilnahme (BasarSeller) gehört zu genau diesem Basar. Admins dürfen weiterhin
    // ein reines Konto ohne Basarbezug anlegen (z.B. Helferlisten-Verwaltung).
    if (!isAdmin && !basarId) {
      return NextResponse.json({ error: 'Basar ist ein Pflichtfeld' }, { status: 400 });
    }

    const basar = basarId
      ? await prisma.basar.findUnique({ where: { id: basarId } })
      : null;

    if (basarId && !basar) {
      return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });
    }

    const now = new Date();

    if (!isAdmin && basar) {
      if (basar.isArchived || basar.status === 'CLOSED' || basar.status === 'DRAFT') {
        return NextResponse.json(
          { error: 'Für diesen Basar ist derzeit keine Registrierung möglich.' },
          { status: 403 }
        );
      }

      if (!isRegistrationOpen(basar, isEmployee, now)) {
        console.log('[REGISTER] Failed: Registration period closed', {
          basarId: basar.id,
          isEmployee,
          now: now.toISOString(),
          ip,
        });
        return NextResponse.json(
          {
            error: isEmployee
              ? 'Die Mitarbeiter-Registrierung ist derzeit geschlossen.'
              : 'Die Verkäufer-Registrierung ist derzeit geschlossen.',
          },
          { status: 403 }
        );
      }

      // Kapazität nur für Verkäufer geprüft – Mitarbeiter zählen nicht gegen
      // maxSellers, analog zur bisherigen globalen Zählung.
      if (!isEmployee) {
        const activeSellers = await prisma.basarSeller.count({
          where: { basarId: basar.id, isActive: true, seller: { isEmployee: false } },
        });
        if (activeSellers >= basar.maxSellers) {
          console.log('[REGISTER] Failed: Basar capacity reached', {
            basarId: basar.id, activeSellers, maxSellers: basar.maxSellers, ip,
          });
          return NextResponse.json(
            { error: `Die maximale Anzahl von ${basar.maxSellers} Verkäufern für diesen Basar ist bereits erreicht.` },
            { status: 400 }
          );
        }
      }
    }

    // Validate required fields
    if (!email || !firstName || !lastName) {
      console.log('[REGISTER] Failed: Missing fields', { 
        hasEmail: !!email, 
        hasFirstName: !!firstName, 
        hasLastName: !!lastName,
        ip 
      });
      return NextResponse.json(
        { error: 'Fehlende Pflichtfelder: email, firstName, lastName' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log('[REGISTER] Failed: Invalid email format', { email: email?.substring(0, 3) + '***', ip });
      return NextResponse.json(
        { error: 'Ungültige E-Mail Adresse' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingSeller = await prisma.seller.findUnique({
      where: { email },
    });

    if (existingSeller) {
      console.log('[REGISTER] Failed: Email already exists', { 
        email: email?.substring(0, 3) + '***', 
        existingSellerId: existingSeller.sellerId,
        ip 
      });
      return NextResponse.json(
        { error: 'Diese E-Mail Adresse ist bereits registriert' },
        { status: 400 }
      );
    }

    // Note: We don't block registration based on active sellers anymore
    // Users can register, but won't be able to activate their seller status if limit is reached

    // Generate password for everyone (crypto-secure temp password)
    const tempPassword = crypto.randomBytes(9).toString('base64url').slice(0, 12);
    const password = await bcrypt.hash(tempPassword, 10);

    let seller: Awaited<ReturnType<typeof prisma.seller.create>> | undefined;
    let sellerId: number | null = null;
    const MAX_ATTEMPTS = 3;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // Atomic allocation – no more loading every existing id and scanning for a gap.
      sellerId = await allocateSellerId();

      // If no ID available (all 9000 IDs are used)
      if (sellerId === null) {
        console.log('[REGISTER] Failed: All IDs used', { ip });
        return NextResponse.json(
          { error: 'Alle Verkäufer-IDs sind vergeben (1000-9999). Keine weiteren Registrierungen möglich.' },
          { status: 400 }
        );
      }

      // Generate QR code and Barcode with format: sellerId_lastName_firstName
      const qrData = `${sellerId}_${lastName}_${firstName}`;
      const qrCode = await generateQR(qrData);
      const barcode = await generateBarcode(qrData);

      try {
        seller = await prisma.seller.create({
          data: {
            sellerId,
            email,
            firstName,
            lastName,
            isEmployee,
            password,
            qrCode,
            barcode,
          },
        });
        break; // success
      } catch (createError: unknown) {
        const err = createError as { code?: string; meta?: { target?: string[] | string } };
        if (err.code === 'P2002') {
          const target = err.meta?.target;
          const targetStr = Array.isArray(target) ? target.join(',') : String(target ?? '');
          if (targetStr.includes('email')) {
            return NextResponse.json(
              { error: 'Diese E-Mail Adresse ist bereits registriert' },
              { status: 400 }
            );
          }
          // sellerId collision (race with a concurrent registration) → retry with a freshly recomputed ID
          if (attempt < MAX_ATTEMPTS) {
            console.log('[REGISTER] sellerId collision, retrying', { sellerId, attempt, ip });
            continue;
          }
        }
        throw createError;
      }
    }

    if (!seller) {
      return NextResponse.json(
        { error: 'Registrierung fehlgeschlagen. Bitte versuchen Sie es später erneut.' },
        { status: 500 }
      );
    }

    // Teilnahme an diesem Basar direkt anlegen. Das lazy Anlegen beim ersten
    // Artikel (app/api/basars/[id]/articles/route.ts) bleibt als Fallback für
    // Alt-Basare bzw. admin-erstellte Konten ohne Basarbezug bestehen.
    if (basar) {
      await prisma.basarSeller.create({
        data: { basarId: basar.id, sellerId: seller.sellerId, isActive: true, activatedAt: new Date() },
      });
    }

    const formatDateTime = (dateTimeValue: Date | null | undefined) => {
      if (!dateTimeValue) return null;
      try {
        const date = dateTimeValue instanceof Date ? dateTimeValue : new Date(dateTimeValue);
        return date.toLocaleString('de-DE', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Europe/Berlin',
        });
      } catch {
        return null;
      }
    };

    const deliveryStart = formatDateTime(basar?.deliveryStart);
    const deliveryEnd = formatDateTime(basar?.deliveryEnd);
    const deliveryStart2 = formatDateTime(basar?.deliveryStart2);
    const deliveryEnd2 = formatDateTime(basar?.deliveryEnd2);
    const pickupStart = formatDateTime(basar?.pickupStart);
    const pickupEnd = formatDateTime(basar?.pickupEnd);
    const pickupStart2 = formatDateTime(basar?.pickupStart2);
    const pickupEnd2 = formatDateTime(basar?.pickupEnd2);

    let deliveryInfo = '';
    if (deliveryStart && deliveryEnd) {
      deliveryInfo = `
        <div style="margin-top: 20px; padding: 15px; background-color: #f0f9ff; border-left: 4px solid #3b82f6; border-radius: 4px;">
          <h3 style="margin: 0 0 10px 0; color: #1e40af;">Anlieferung der Ware</h3>
          <p style="margin: 0;"><strong>Zeitfenster 1 - Von:</strong> ${deliveryStart}</p>
          <p style="margin: 5px 0 0 0;"><strong>Bis:</strong> ${deliveryEnd}</p>
          ${deliveryStart2 && deliveryEnd2 ? `
            <p style="margin: 10px 0 0 0;"><strong>Zeitfenster 2 - Von:</strong> ${deliveryStart2}</p>
            <p style="margin: 5px 0 0 0;"><strong>Bis:</strong> ${deliveryEnd2}</p>
          ` : ''}
        </div>
      `;
    }

    let pickupInfo = '';
    if (pickupStart && pickupEnd) {
      pickupInfo = `
        <div style="margin-top: 15px; padding: 15px; background-color: #f0fdf4; border-left: 4px solid #10b981; border-radius: 4px;">
          <h3 style="margin: 0 0 10px 0; color: #065f46;">Abholung der Ware</h3>
          <p style="margin: 0;"><strong>Zeitfenster 1 - Von:</strong> ${pickupStart}</p>
          <p style="margin: 5px 0 0 0;"><strong>Bis:</strong> ${pickupEnd}</p>
          ${pickupStart2 && pickupEnd2 ? `
            <p style="margin: 10px 0 0 0;"><strong>Zeitfenster 2 - Von:</strong> ${pickupStart2}</p>
            <p style="margin: 5px 0 0 0;"><strong>Bis:</strong> ${pickupEnd2}</p>
          ` : ''}
        </div>
      `;
    }

    try {
      // Prepare unified styling for delivery and pickup
      const deliverySection = deliveryStart && deliveryEnd
        ? `<div style="margin-top:20px;padding:14px;border-radius:8px;background:#f3f4f6;border:1px solid #e5e7eb;">
             <strong>Anlieferung</strong><br/>
             <span style="font-size:0.95em;">Zeitfenster 1:</span><br/>
             <span>${deliveryStart}</span><br/><span>${deliveryEnd}</span>
             ${deliveryStart2 && deliveryEnd2 ? `
               <br/><br/><span style="font-size:0.95em;">Zeitfenster 2:</span><br/>
               <span>${deliveryStart2}</span><br/><span>${deliveryEnd2}</span>
             ` : ''}
           </div>`
        : '';

      const pickupSection = pickupStart && pickupEnd
        ? `<div style="margin-top:12px;padding:14px;border-radius:8px;background:#f3f4f6;border:1px solid #e5e7eb;">
             <strong>Abholung</strong><br/>
             <span style="font-size:0.95em;">Zeitfenster 1:</span><br/>
             <span>${pickupStart}</span><br/><span>${pickupEnd}</span>
             ${pickupStart2 && pickupEnd2 ? `
               <br/><br/><span style="font-size:0.95em;">Zeitfenster 2:</span><br/>
               <span>${pickupStart2}</span><br/><span>${pickupEnd2}</span>
             ` : ''}
           </div>`
        : '';

      // Combine sections into a consistent info box
      const datesBox = (deliverySection || pickupSection)
        ? `<div style="margin-top:20px;display:flex;flex-direction:column;gap:10px;">
             ${deliverySection}
             ${pickupSection}
           </div>`
        : '';

      // Attachments: add general info JPEG from project root if present
      const attachments: any[] = [];
      const generalInfoPath = path.join(process.cwd(), 'Generelle_Verkäuferinformationen.jpeg');
      if (fs.existsSync(generalInfoPath)) {
        attachments.push({ filename: 'Generelle_Verkäuferinformationen.jpeg', path: generalInfoPath });
      }

      const attachmentNotice = attachments.length > 0
        ? `<p style="margin-top:12px;">Im Anhang finden Sie weitere Informationen: <strong>Generelle_Verkäuferinformationen.jpeg</strong></p>`
        : '';

      const passwordSection = tempPassword
        ? `<div style="margin-top: 20px; padding: 15px; background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px;">
             <h3 style="margin: 0 0 10px 0; color: #92400e;">Ihr Login</h3>
             <p style="margin: 0;">Benutzername: <strong>${email}</strong></p>
             <p style="margin: 5px 0 0 0;">Passwort: <strong>${tempPassword}</strong></p>
             <p style="margin: 10px 0 0 0; font-size: 0.9em; color: #78350f;">Bitte ändern Sie Ihr Passwort nach dem ersten Login.</p>
           </div>`
        : '';

      const emailHtml = `
        <div style="font-family:system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; color:#111827;">
          <h1 style="color:#0f172a;">Willkommen beim Basar</h1>
          <p>Vielen Dank für Ihre Registrierung!</p>
          <p>Ihre Verkäufer-Nummer: <strong>${sellerId}</strong></p>
          ${passwordSection}
          ${datesBox}
          ${attachmentNotice}
          <p style="margin-top:18px;">Bewahren Sie diese Informationen gut auf!</p>
          <p style="margin-top:18px;">Mit freundlichen Grüßen,<br/><strong>Dein Basar-Team</strong></p>
        </div>
      `;

      // Enqueue the confirmation email instead of sending it synchronously – a slow or
      // unavailable SMTP server used to block the request (and QR/barcode generation,
      // bcrypt, and now-atomic id allocation still make this endpoint hot enough that adding
      // a synchronous SMTP round trip on top is what actually risked Vercel timeouts under
      // load). A separate processor (app/api/admin/mail-queue/route.ts) drains PENDING rows
      // with retry/backoff; failures land in status=FAILED with lastError instead of being
      // silently swallowed.
      await prisma.mailQueue.create({
        data: {
          to: email,
          subject: 'Ihre Registrierung beim Kinderbasar Neukirchen',
          html: emailHtml,
          attachmentsJson: attachments.length > 0 ? JSON.stringify(attachments) : null,
        },
      });
    } catch (emailError) {
      console.error('[REGISTER] Failed to enqueue confirmation email:', {
        sellerId,
        email: email?.substring(0, 3) + '***',
        error: emailError,
        ip
      });
      // Don't return error to client, registration was successful
    }

    console.log('[REGISTER] Success:', { 
      sellerId, 
      email: email?.substring(0, 3) + '***',
      isEmployee: !!isEmployee,
      ip 
    });

    return NextResponse.json({ 
      success: true, 
      sellerId,
      message: 'Registrierung erfolgreich. Bitte prüfen Sie Ihre E-Mails.'
    });

  } catch (error: any) {
    console.error('[REGISTER] Exception:', { 
      error: error.message,
      code: error.code,
      stack: error.stack?.substring(0, 200),
      email: email?.substring(0, 3) + '***',
      ip
    });

    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Diese E-Mail Adresse ist bereits registriert' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Registrierung fehlgeschlagen. Bitte versuchen Sie es später erneut.' },
      { status: 500 }
    );
  }
}