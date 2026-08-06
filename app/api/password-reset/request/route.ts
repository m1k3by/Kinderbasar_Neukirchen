import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import crypto from 'crypto';
import { sendMail } from '@/app/lib/mail';
import { rateLimit } from '@/app/lib/rateLimit';

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

  try {
    const { email: emailInput } = await req.json();
    const email = emailInput?.toLowerCase();

    if (!email) {
      return NextResponse.json(
        { error: 'E-Mail ist erforderlich' },
        { status: 400 }
      );
    }

    // Rate limiting: per-email (the identity that actually matters here) rather than per-IP
    // – a bazaar hall or a family shares one NAT IP, so a strict per-IP limit would lock out
    // legitimate co-located users. A much higher per-IP limit is kept as a coarse abuse guard.
    // Rate limiting by email does not weaken the anti-enumeration response below: both a
    // known and an unknown email get throttled identically, and the ambiguous success
    // message is unchanged either way.
    const [emailAllowed, ipAllowed] = await Promise.all([
      rateLimit(`password-reset:email:${email}`, { maxRequests: 5, windowMs: 15 * 60 * 1000 }),
      rateLimit(`password-reset:ip:${ip}`, { maxRequests: 50, windowMs: 15 * 60 * 1000 }),
    ]);
    if (!emailAllowed || !ipAllowed) {
      return NextResponse.json(
        { error: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.' },
        { status: 429 }
      );
    }

    // Suche Seller mit dieser E-Mail
    const seller = await prisma.seller.findUnique({
      where: { email },
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
      where: { sellerId: seller.sellerId },
      data: {
        resetToken,
        resetTokenExpiry,
      },
    });

    // Sende E-Mail mit Reset-Link
    const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://localhost:3000'}/password-reset/${resetToken}`;
    
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
