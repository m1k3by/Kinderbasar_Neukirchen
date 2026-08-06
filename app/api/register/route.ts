import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '../../lib/prisma';
import { generateQR, generateBarcode } from '../../lib/qr';
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

    try {
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