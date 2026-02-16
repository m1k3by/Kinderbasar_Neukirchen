import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import bcrypt from 'bcrypt';

export async function POST(req: Request) {
  try {
    const { sellerId, currentPassword, newPassword } = await req.json();

    if (!sellerId || !currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Alle Felder sind erforderlich' },
        { status: 400 }
      );
    }

    // Validate new password length
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Das neue Passwort muss mindestens 6 Zeichen lang sein' },
        { status: 400 }
      );
    }

    // Find the seller
    const seller = await prisma.seller.findUnique({
      where: { sellerId: parseInt(sellerId, 10) },
    });

    if (!seller || !seller.password) {
      return NextResponse.json(
        { error: 'Benutzer nicht gefunden oder kein Passwort gesetzt' },
        { status: 404 }
      );
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, seller.password);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Das aktuelle Passwort ist falsch' },
        { status: 401 }
      );
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    await prisma.seller.update({
      where: { sellerId: parseInt(sellerId, 10) },
      data: { password: hashedNewPassword },
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
