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

    // Check registration periods
    const settings = await prisma.settings.findMany();
    const settingsObj: Record<string, string> = {};
    settings.forEach(s => {
      settingsObj[s.key] = s.value;
    });

    // Helper function to determine if a date is in DST (Daylight Saving Time) for Europe/Berlin
    // MESZ (Sommerzeit): Last Sunday in March 2:00 to Last Sunday in October 3:00
    // MEZ (Winterzeit): Rest of the year
    const isDST = (date: Date): boolean => {
      const year = date.getFullYear();
      
      // Find last Sunday in March
      const marchLastDay = new Date(Date.UTC(year, 2, 31, 1, 0, 0)); // March 31 at 01:00 UTC (= 02:00 MEZ)
      const marchLastSunday = new Date(marchLastDay);
      marchLastSunday.setUTCDate(31 - ((marchLastDay.getUTCDay() || 7) - 1));
      
      // Find last Sunday in October
      const octoberLastDay = new Date(Date.UTC(year, 9, 31, 1, 0, 0)); // October 31 at 01:00 UTC (= 02:00 MESZ)
      const octoberLastSunday = new Date(octoberLastDay);
      octoberLastSunday.setUTCDate(31 - ((octoberLastDay.getUTCDay() || 7) - 1));
      
      return date >= marchLastSunday && date < octoberLastSunday;
    };

    // Helper function to parse datetime string as Europe/Berlin timezone
    const parseAsGermanTime = (dateTimeStr: string): Date => {
      if (!dateTimeStr.includes('T')) {
        // Old format: date only
        dateTimeStr = dateTimeStr + 'T00:00:00';
      }
      
      // If already has timezone, use it
      if (dateTimeStr.includes('+') || dateTimeStr.includes('Z')) {
        return new Date(dateTimeStr);
      }
      
      // Parse without timezone first to get the date for DST check
      const parts = dateTimeStr.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
      if (!parts) return new Date(dateTimeStr);
      
      const [, year, month, day, hour, minute] = parts;
      // Create a date in UTC to check DST
      const testDate = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute)));
      
      // Determine offset: +01:00 (MEZ/Winter) or +02:00 (MESZ/Summer)
      const offset = isDST(testDate) ? '+02:00' : '+01:00';
      
      return new Date(dateTimeStr + offset);
    };

    const now = new Date();

    // Check if registration period is open for the given type
    if (isEmployee) {
      if (settingsObj.registration_employee_start && settingsObj.registration_employee_end) {
        const start = parseAsGermanTime(settingsObj.registration_employee_start);
        const end = parseAsGermanTime(settingsObj.registration_employee_end);
        
        if (now < start || now > end) {
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
          return NextResponse.json(
            { error: 'Die Verkäufer-Registrierung ist derzeit geschlossen.' },
            { status: 403 }
          );
        }
      }
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

    // Note: We don't block registration based on active sellers anymore
    // Users can register, but won't be able to activate their seller status if limit is reached

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