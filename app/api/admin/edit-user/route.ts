import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export async function PUT(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  
  try {
    const body = await request.json();
    let { sellerId, email, firstName, lastName, isEmployee } = body;

    console.log('[EDIT-USER] Attempt:', {
      sellerId,
      email: email ? email.substring(0, 3) + '***' : 'undefined',
      firstName: firstName ? firstName.substring(0, 1) + '***' : 'undefined',
      lastName: lastName ? lastName.substring(0, 1) + '***' : 'undefined',
      isEmployee: !!isEmployee,
      ip,
      timestamp: new Date().toISOString()
    });

    if (!sellerId) {
      console.log('[EDIT-USER] Failed: Missing sellerId', { ip });
      return NextResponse.json(
        { error: 'Verkäufer-ID ist erforderlich' },
        { status: 400 }
      );
    }

    if (!email || !firstName || !lastName) {
      console.log('[EDIT-USER] Failed: Missing fields', {
        sellerId,
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

    // Normalize email to lowercase
    email = email.toLowerCase();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log('[EDIT-USER] Failed: Invalid email format', { sellerId, email: email?.substring(0, 3) + '***', ip });
      return NextResponse.json(
        { error: 'Ungültige E-Mail Adresse' },
        { status: 400 }
      );
    }

    // Check if seller exists
    const existingSeller = await prisma.seller.findUnique({
      where: { sellerId: parseInt(sellerId, 10) }
    });

    if (!existingSeller) {
      console.log('[EDIT-USER] Failed: Seller not found', { sellerId, ip });
      return NextResponse.json(
        { error: 'Benutzer nicht gefunden' },
        { status: 404 }
      );
    }

    // Check if email is already taken by another user
    const emailTaken = await prisma.seller.findFirst({
      where: {
        email,
        sellerId: { not: parseInt(sellerId, 10) }
      }
    });

    if (emailTaken) {
      console.log('[EDIT-USER] Failed: Email already exists', {
        sellerId,
        email: email?.substring(0, 3) + '***',
        existingSellerId: emailTaken.sellerId,
        ip
      });
      return NextResponse.json(
        { error: 'Diese E-Mail Adresse wird bereits von einem anderen Benutzer verwendet' },
        { status: 400 }
      );
    }

    // Update the seller
    const updatedSeller = await prisma.seller.update({
      where: { sellerId: parseInt(sellerId, 10) },
      data: {
        email,
        firstName,
        lastName,
        isEmployee: !!isEmployee
      }
    });

    console.log('[EDIT-USER] Success:', {
      sellerId: updatedSeller.sellerId,
      email: email?.substring(0, 3) + '***',
      isEmployee: updatedSeller.isEmployee,
      ip
    });

    return NextResponse.json({
      success: true,
      message: 'Benutzer erfolgreich aktualisiert',
      seller: {
        sellerId: updatedSeller.sellerId,
        email: updatedSeller.email,
        firstName: updatedSeller.firstName,
        lastName: updatedSeller.lastName,
        isEmployee: updatedSeller.isEmployee
      }
    });

  } catch (error: any) {
    console.error('[EDIT-USER] Exception:', {
      error: error.message,
      code: error.code,
      stack: error.stack?.substring(0, 200),
      ip
    });

    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Diese E-Mail Adresse wird bereits verwendet' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Fehler beim Bearbeiten des Benutzers' },
      { status: 500 }
    );
  }
}
