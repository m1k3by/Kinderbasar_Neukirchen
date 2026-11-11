import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { requireAuth } from '@/app/lib/apiAuth';
import bcrypt from 'bcrypt';

// POST /api/change-password  body: { newPassword }
// Ändert das Passwort des *angemeldeten* Kontos. Die Verkäufernummer kommt aus dem Token,
// nie aus dem Body: bis 11.11.2026 nahm die Route `sellerId` aus dem Body und prüfte keine
// Anmeldung (sie steht auch nicht im matcher von middleware.ts) – jeder konnte von außen das
// Passwort jeder der durchzählbaren Nummern 1000–9999 setzen. Ein mitgeschicktes `sellerId`
// wird ignoriert.
export async function POST(req: Request) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const sellerId = authResult.auth.sellerId;
    // Admin-Token haben keine sellerId; das Admin-Passwort steht in ADMIN_PASS.
    if (!sellerId) {
      return NextResponse.json({ error: 'Nur für Verkäufer und Mitarbeiter' }, { status: 403 });
    }

    const { newPassword } = await req.json();

    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json(
        { error: 'Neues Passwort ist erforderlich' },
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
    const seller = await prisma.seller.findUnique({ where: { sellerId } });

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
      where: { sellerId },
      data: { password: hashedPassword },
    });

    return NextResponse.json({
      success: true,
      message: 'Passwort erfolgreich geändert',
    });

  } catch (error) {
    console.error('POST /api/change-password error:', error);
    return NextResponse.json(
      { error: 'Ein Fehler ist beim Ändern des Passworts aufgetreten.' },
      { status: 500 }
    );
  }
}
