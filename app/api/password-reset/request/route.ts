import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import crypto from 'crypto';
import { sendMail } from '@/app/lib/mail';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: 'E-Mail ist erforderlich' },
        { status: 400 }
      );
    }

    // Suche Seller mit dieser E-Mail
    const seller = await prisma.seller.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Aus Sicherheitsgründen immer erfolgreiche Antwort zurückgeben
    // (verhindert E-Mail-Enumeration)
    if (!seller) {
      return NextResponse.json({
        message: 'Falls ein Konto mit dieser E-Mail existiert, wurde ein Reset-Link gesendet.',
      });
    }

    // Generiere Reset-Token (32 Byte = 64 Hex-Zeichen)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 Stunde gültig

    // Speichere Token in Datenbank
    await prisma.seller.update({
      where: { id: seller.id },
      data: {
        resetToken,
        resetTokenExpiry,
      },
    });

    // Sende E-Mail mit Reset-Link
    const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/password-reset/${resetToken}`;
    
    await sendMail(
      seller.email,
      'Passwort zurücksetzen - Kinderbasar Neukirchen',
      `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Passwort zurücksetzen</h2>
          <p>Hallo ${seller.firstName} ${seller.lastName},</p>
          <p>Sie haben eine Anfrage zum Zurücksetzen Ihres Passworts gestellt.</p>
          <p>Klicken Sie auf den folgenden Link, um Ihr Passwort zurückzusetzen:</p>
          <p>
            <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">
              Passwort zurücksetzen
            </a>
          </p>
          <p>Oder kopieren Sie diesen Link in Ihren Browser:</p>
          <p style="word-break: break-all; color: #666;">${resetUrl}</p>
          <p><strong>Dieser Link ist 1 Stunde gültig.</strong></p>
          <p>Falls Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren.</p>
          <hr style="margin: 24px 0; border: none; border-top: 1px solid #ddd;">
          <p style="color: #666; font-size: 12px;">Kinderbasar Neukirchen</p>
        </div>
      `
    );

    return NextResponse.json({
      message: 'Falls ein Konto mit dieser E-Mail existiert, wurde ein Reset-Link gesendet.',
    });

  } catch (error) {
    console.error('Password reset request error:', error);
    return NextResponse.json(
      { error: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.' },
      { status: 500 }
    );
  }
}
