import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { generateQR, generateBarcode } from '../../lib/qr';
import { sendMail } from '../../lib/mail';
import path from 'path';
import fs from 'fs';
import { rateLimit } from '../../lib/rateLimit';
import bcrypt from 'bcrypt';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, firstName, lastName, isEmployee } = body;

    // Rate limiting: 5 registration attempts per 15 minutes per IP
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateLimitKey = `register:${ip}`;
    
    if (!rateLimit(rateLimitKey, { maxRequests: 5, windowMs: 15 * 60 * 1000 })) {
      return NextResponse.json(
        { error: 'Zu viele Registrierungsversuche. Bitte versuchen Sie es später erneut.' },
        { status: 429 }
      );
    }

    // Validate required fields
    if (!email || !firstName || !lastName) {
      return NextResponse.json(
        { error: 'Fehlende Pflichtfelder: email, firstName, lastName' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
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
      return NextResponse.json(
        { error: 'Diese E-Mail Adresse ist bereits registriert' },
        { status: 400 }
      );
    }

    // Check total number of sellers against configured maximum
    const totalSellers = await prisma.seller.count();
    const maxSellers = parseInt(process.env.MAX_SELLERS || '200');
    if (totalSellers >= maxSellers) {
      return NextResponse.json(
        { error: `Die maximale Anzahl von ${maxSellers} Verkäufern ist erreicht` },
        { status: 400 }
      );
    }

    // Generate seller ID in range 1000-9999
    // Get all existing seller IDs in this range
    const existingSellers = await prisma.seller.findMany({
      where: {
        sellerId: {
          gte: 1000,
          lte: 9999
        }
      },
      select: { sellerId: true },
      orderBy: { sellerId: 'asc' }
    });

    const existingIds = new Set(existingSellers.map(s => s.sellerId));
    
    let sellerId = null;
    
    // First, try to find the next available ID starting from 1000
    for (let id = 1000; id <= 9999; id++) {
      if (!existingIds.has(id)) {
        sellerId = id;
        break;
      }
    }
    
    // If no ID available (all 9000 IDs are used)
    if (sellerId === null) {
      return NextResponse.json(
        { error: 'Alle Verkäufer-IDs sind vergeben (1000-9999). Keine weiteren Registrierungen möglich.' },
        { status: 400 }
      );
    }
    
    // Generate password for everyone
    const tempPassword = Math.random().toString(36).substring(2, 10);
    const password = await bcrypt.hash(tempPassword, 10);

    // Generate QR code and Barcode with format: sellerId_lastName_firstName
    const qrData = `${sellerId}_${lastName}_${firstName}`;
    const qrCode = await generateQR(qrData);
    const barcode = await generateBarcode(qrData);

    // Create seller with codes stored
    const seller = await prisma.seller.create({
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

    // Fetch settings for email
    const settings = await prisma.settings.findMany();
    const settingsObj: Record<string, string> = {};
    settings.forEach(s => {
      settingsObj[s.key] = s.value;
    });

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
    const pickupStart = formatDateTime(settingsObj.pickup_start);
    const pickupEnd = formatDateTime(settingsObj.pickup_end);

    let deliveryInfo = '';
    if (deliveryStart && deliveryEnd) {
      deliveryInfo = `
        <div style="margin-top: 20px; padding: 15px; background-color: #f0f9ff; border-left: 4px solid #3b82f6; border-radius: 4px;">
          <h3 style="margin: 0 0 10px 0; color: #1e40af;">Anlieferung der Ware</h3>
          <p style="margin: 0;"><strong>Von:</strong> ${deliveryStart}</p>
          <p style="margin: 5px 0 0 0;"><strong>Bis:</strong> ${deliveryEnd}</p>
        </div>
      `;
    }

    let pickupInfo = '';
    if (pickupStart && pickupEnd) {
      pickupInfo = `
        <div style="margin-top: 15px; padding: 15px; background-color: #f0fdf4; border-left: 4px solid #10b981; border-radius: 4px;">
          <h3 style="margin: 0 0 10px 0; color: #065f46;">Abholung der Ware</h3>
          <p style="margin: 0;"><strong>Von:</strong> ${pickupStart}</p>
          <p style="margin: 5px 0 0 0;"><strong>Bis:</strong> ${pickupEnd}</p>
        </div>
      `;
    }

    try {
      // Prepare unified styling for delivery and pickup
      const deliverySection = deliveryStart && deliveryEnd
        ? `<div style="margin-top:20px;padding:14px;border-radius:8px;background:#f3f4f6;border:1px solid #e5e7eb;">
             <strong>Anlieferung</strong><br/><span>${deliveryStart}</span><br/><span>${deliveryEnd}</span>
           </div>`
        : '';

      const pickupSection = pickupStart && pickupEnd
        ? `<div style="margin-top:12px;padding:14px;border-radius:8px;background:#f3f4f6;border:1px solid #e5e7eb;">
             <strong>Abholung</strong><br/><span>${pickupStart}</span><br/><span>${pickupEnd}</span>
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
      console.error('Email sending failed:', emailError);
      // Don't return error to client, registration was successful
    }

    return NextResponse.json({ 
      success: true, 
      sellerId,
      message: 'Registrierung erfolgreich. Bitte prüfen Sie Ihre E-Mails.'
    });

  } catch (error: any) {
    console.error('Registration error:', error);

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