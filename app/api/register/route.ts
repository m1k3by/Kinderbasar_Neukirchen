import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '../../lib/prisma';
import { generateQR, generateBarcode } from '../../lib/qr';
import { sendMail } from '../../lib/mail';
import { parseAsGermanTime } from '../../lib/time';
import path from 'path';
import fs from 'fs';
import { rateLimit } from '../../lib/rateLimit';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getAuth } from '../../lib/apiAuth';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  let email: string | undefined;

  try {
    const body = await request.json();
    const { email: emailInput, firstName, lastName, isEmployee: isEmployeeInput } = body;
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

    // Rate limiting: 5 registration attempts per 15 minutes per IP (skip for admin)
    if (!isAdmin) {
      const rateLimitKey = `register:${ip}`;
      
      if (!rateLimit(rateLimitKey, { maxRequests: 5, windowMs: 15 * 60 * 1000 })) {
        console.log('[REGISTER] Rate limit exceeded:', { email: email?.substring(0, 3) + '***', ip });
        return NextResponse.json(
          { error: 'Zu viele Registrierungsversuche. Bitte versuchen Sie es später erneut.' },
          { status: 429 }
        );
      }
    }

    // Check registration periods (skip for admin)
    const settings = await prisma.settings.findMany();
    const settingsObj: Record<string, string> = {};
    settings.forEach(s => {
      settingsObj[s.key] = s.value;
    });

    const now = new Date();

    // Check if registration period is open for the given type (skip for admin)
    if (!isAdmin) {
      if (isEmployee) {
        if (settingsObj.registration_employee_start && settingsObj.registration_employee_end) {
          const start = parseAsGermanTime(settingsObj.registration_employee_start);
          const end = parseAsGermanTime(settingsObj.registration_employee_end);
          
          if (now < start || now > end) {
            console.log('[REGISTER] Failed: Employee registration period closed', { 
              now: now.toISOString(),
              start: start.toISOString(),
              end: end.toISOString(),
              ip 
            });
            return NextResponse.json(
              { error: 'Die Mitarbeiter-Registrierung ist derzeit geschlossen.' },
              { status: 403 }
            );
          }
        }
      } else {
        if (settingsObj.registration_seller_start && settingsObj.registration_seller_end) {
          const start = parseAsGermanTime(settingsObj.registration_seller_start);
          const end = parseAsGermanTime(settingsObj.registration_seller_end);
          
          if (now < start || now > end) {
            console.log('[REGISTER] Failed: Seller registration period closed', { 
              now: now.toISOString(),
              start: start.toISOString(),
              end: end.toISOString(),
              ip 
            });
            return NextResponse.json(
              { error: 'Die Verkäufer-Registrierung ist derzeit geschlossen.' },
              { status: 403 }
            );
          }
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

    // First, try 10er numbers (ending in 0): 1010, 1020, 1030, ..., 9990
    // Then fill in ones place: 1011, 1021, 1031, etc.
    // Priority order: first all ending in 0, then 1, then 2, etc.
    function computeNextSellerId(existingIds: Set<number>): number | null {
      for (let lastDigit = 0; lastDigit <= 9; lastDigit++) {
        for (let base = 100; base <= 999; base++) {
          const id = base * 10 + lastDigit;
          if (id >= 1000 && id <= 9999 && !existingIds.has(id)) {
            return id;
          }
        }
      }
      return null;
    }

    let seller: Awaited<ReturnType<typeof prisma.seller.create>> | undefined;
    let sellerId: number | null = null;
    const MAX_ATTEMPTS = 3;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // Get all existing seller IDs in this range (re-read each attempt so a concurrent
      // registration that just took our candidate ID is reflected on retry)
      const existingSellers = await prisma.seller.findMany({
        where: { sellerId: { gte: 1000, lte: 9999 } },
        select: { sellerId: true },
        orderBy: { sellerId: 'asc' },
      });
      const existingIds = new Set(existingSellers.map(s => s.sellerId));
      sellerId = computeNextSellerId(existingIds);

      // If no ID available (all 9000 IDs are used)
      if (sellerId === null) {
        console.log('[REGISTER] Failed: All IDs used', { totalExisting: existingIds.size, ip });
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

    // Use settings already loaded at the beginning for email
    const formatDateTime = (dateTimeString: string | undefined) => {
      if (!dateTimeString) return null;
      try {
        const date = new Date(dateTimeString);
        return date.toLocaleString('de-DE', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch {
        return null;
      }
    };

    const deliveryStart = formatDateTime(settingsObj.delivery_start);
    const deliveryEnd = formatDateTime(settingsObj.delivery_end);
    const deliveryStart2 = formatDateTime(settingsObj.delivery_start2);
    const deliveryEnd2 = formatDateTime(settingsObj.delivery_end2);
    const pickupStart = formatDateTime(settingsObj.pickup_start);
    const pickupEnd = formatDateTime(settingsObj.pickup_end);
    const pickupStart2 = formatDateTime(settingsObj.pickup_start2);
    const pickupEnd2 = formatDateTime(settingsObj.pickup_end2);

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

      // Send email with attachments if any
      await sendMail(email, 'Ihre Registrierung beim Kinderbasar Neukirchen', emailHtml, attachments);
    } catch (emailError) {
      console.error('[REGISTER] Email sending failed:', { 
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