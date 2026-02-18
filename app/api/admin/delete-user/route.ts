import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

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
