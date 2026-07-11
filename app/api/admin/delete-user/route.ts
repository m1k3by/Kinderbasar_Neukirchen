import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/apiAuth';

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult.response) return authResult.response;

  try {
    const { sellerId } = await request.json();

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

    // Delete the seller (Prisma will handle cascade deletes if configured)
    await prisma.seller.delete({
      where: { sellerId: parseInt(sellerId, 10) },
    });

    return NextResponse.json({
      message: `Benutzer ${seller.firstName} ${seller.lastName} (Nr. ${seller.sellerId}) wurde erfolgreich gelöscht.`,
    });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Fehler beim Löschen des Benutzers: ' + error.message },
      { status: 500 }
    );
  }
}
