import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import bcrypt from 'bcrypt';

export async function POST(req: Request) {
  try {
    const { sellerId, newPassword } = await req.json();

    if (!sellerId || !newPassword) {
      return NextResponse.json(
        { error: 'Verkäufer-ID und neues Passwort sind erforderlich' },
        { status: 400 }
      );
    }

    // Validate new password length
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Das Passwort muss mindestens 6 Zeichen lang sein' },
        { status: 400 }
      );
    }

    // Find the seller
    const seller = await prisma.seller.findUnique({
      where: { sellerId: parseInt(sellerId, 10) },
    });

    if (!seller) {
      return NextResponse.json(
        { error: 'Benutzer nicht gefunden' },
        { status: 404 }
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    await prisma.seller.update({
      where: { sellerId: parseInt(sellerId, 10) },
      data: { password: hashedPassword },
    });

    return NextResponse.json({
      success: true,
      message: 'Passwort erfolgreich geändert',
    });

  } catch (error) {
    console.error('Password change error:', error);
    return NextResponse.json(
      { error: 'Ein Fehler ist beim Ändern des Passworts aufgetreten.' },
      { status: 500 }
    );
  }
}
