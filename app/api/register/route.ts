import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { generateQR, generateBarcode } from '../../lib/qr';
import { sendMail } from '../../lib/mail';
import bcrypt from 'bcrypt';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, firstName, lastName, isEmployee } = body;

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

    // Generate sequential seller ID (next number)
    const lastSeller = await prisma.seller.findMany({
      orderBy: { sellerId: 'desc' },
      take: 1
    });
    const sellerId = lastSeller.length > 0 ? lastSeller[0].sellerId + 1 : 1;
    
    // Generate password if employee
    let password = null;
    let tempPassword = null;  // Declare here so it's available in the email scope
    if (isEmployee) {
      tempPassword = Math.random().toString(36).substring(2, 10);
      password = await bcrypt.hash(tempPassword, 10);
    }

    // Generate QR code and Barcode with format: sellerId_lastName_firstName
    const qrData = `${sellerId}_${lastName}_${firstName}`;
    const qrCode = await generateQR(qrData);
    const barcode = generateBarcode(qrData);

    // Create seller with codes stored
    const seller = await prisma.seller.create({
      data: {
        email,
        firstName,
        lastName,
        sellerId,
        isEmployee,
        password,
        qrCode,
        barcode,
      },
    });

    try {
      // Send email
      await sendMail(
        email,
        'Ihre Registrierung beim Basar',
        `
          <h1>Willkommen beim Basar</h1>
          <p>Ihre Verkäufer-ID: <strong>${sellerId}</strong></p>
          ${isEmployee && tempPassword ? 
            `<p>Ihr temporäres Passwort: <strong>${tempPassword}</strong></p>
             <p>Bitte ändern Sie Ihr Passwort bei der ersten Anmeldung.</p>` 
            : ''}
          <p>QR-Code für Ihre Verkäufer-ID:</p>
          <img src="${qrCode}" alt="QR Code" style="max-width: 200px;" />
          <p>Bewahren Sie diese Informationen gut auf!</p>
        `
      );
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