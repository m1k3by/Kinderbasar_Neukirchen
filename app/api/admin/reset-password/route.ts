import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { sendMail } from '@/app/lib/mail';
import bcrypt from 'bcrypt';

export async function POST(req: Request) {
  try {
    const { sellerId } = await req.json();

    if (!sellerId) {
      return NextResponse.json(
        { error: 'Seller ID ist erforderlich' },
        { status: 400 }
      );
    }

    // Find the seller
    const seller = await prisma.seller.findUnique({
      where: { sellerId: parseInt(sellerId, 10) },
    });

    if (!seller) {
      return NextResponse.json(
        { error: 'Verkäufer/Mitarbeiter nicht gefunden' },
        { status: 404 }
      );
    }

    // Generate new temporary password
    const tempPassword = Math.random().toString(36).substring(2, 10);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Update password in database
    await prisma.seller.update({
      where: { sellerId: parseInt(sellerId, 10) },
      data: { password: hashedPassword },
    });

    // Send email with new password
    const loginUrl = 'https://www.basar-neukirchen.de/login';
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
        <h1 style="color: #0f172a;">Ihr Passwort wurde zurückgesetzt</h1>
        <p>Hallo ${seller.firstName} ${seller.lastName},</p>
        <p>Ihr Passwort für den Kinderbasar Neukirchen wurde von einem Administrator zurückgesetzt.</p>
        
        <div style="margin-top: 20px; padding: 15px; background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px;">
          <h3 style="margin: 0 0 10px 0; color: #92400e;">Ihre neuen Login-Daten</h3>
          <p style="margin: 0;">Benutzername/E-Mail: <strong>${seller.email}</strong></p>
          <p style="margin: 5px 0 0 0;">Neues Passwort: <strong>${tempPassword}</strong></p>
          <p style="margin: 10px 0 0 0; font-size: 0.9em; color: #78350f;">
            Bitte ändern Sie Ihr Passwort nach dem ersten Login.
          </p>
        </div>

        <div style="margin-top: 20px;">
          <a href="${loginUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Zum Login
          </a>
        </div>

        <p style="margin-top: 20px; font-size: 0.9em; color: #666;">
          Oder kopieren Sie diesen Link in Ihren Browser:<br>
          <a href="${loginUrl}" style="color: #4F46E5;">${loginUrl}</a>
        </p>

        <p style="margin-top: 20px;">
          Falls Sie Fragen haben, wenden Sie sich bitte an das Basar-Team.
        </p>

        <p style="margin-top: 18px;">
          Mit freundlichen Grüßen,<br/>
          <strong>Ihr Basar-Team</strong>
        </p>

        <hr style="margin: 24px 0; border: none; border-top: 1px solid #ddd;">
        <p style="color: #666; font-size: 12px;">Kinderbasar Neukirchen</p>
      </div>
    `;

    await sendMail(
      seller.email,
      'Ihr Passwort wurde zurückgesetzt - Kinderbasar Neukirchen',
      emailHtml
    );

    return NextResponse.json({
      success: true,
      message: `Passwort zurückgesetzt und E-Mail an ${seller.email} gesendet.`,
    });

  } catch (error) {
    console.error('Password reset error:', error);
    return NextResponse.json(
      { error: 'Ein Fehler ist beim Zurücksetzen des Passworts aufgetreten.' },
      { status: 500 }
    );
  }
}
