import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import bcrypt from 'bcrypt';

export async function POST(req: Request) {
  try {
    const { token, newPassword } = await req.json();

    if (!token || !newPassword) {
      return NextResponse.json(
        { error: 'Token und neues Passwort sind erforderlich' },
        { status: 400 }
      );
    }

    // Passwort-Validierung
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Passwort muss mindestens 6 Zeichen lang sein' },
        { status: 400 }
      );
    }

    // Suche Seller mit diesem Token
    const seller = await prisma.seller.findUnique({
      where: { resetToken: token },
    });

    if (!seller) {
      return NextResponse.json(
        { error: 'Ungültiger oder abgelaufener Reset-Link' },
        { status: 400 }
      );
    }

    // Prüfe ob Token abgelaufen ist
    if (!seller.resetTokenExpiry || seller.resetTokenExpiry < new Date()) {
      return NextResponse.json(
        { error: 'Dieser Reset-Link ist abgelaufen. Bitte fordern Sie einen neuen an.' },
        { status: 400 }
      );
    }

    // Hash neues Passwort
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update Passwort und lösche Token
    await prisma.seller.update({
      where: { sellerId: seller.sellerId },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    return NextResponse.json({
      message: 'Passwort erfolgreich zurückgesetzt',
    });

  } catch (error) {
    console.error('Password reset confirm error:', error);
    return NextResponse.json(
      { error: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.' },
      { status: 500 }
    );
  }
}
