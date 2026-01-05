import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { sellerId, sellerStatusActive } = body;

    if (!sellerId) {
      return NextResponse.json(
        { error: 'Verkäufer-ID ist erforderlich' },
        { status: 400 }
      );
    }

    // Parse sellerId to integer
    const sellerIdInt = typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId;

    if (isNaN(sellerIdInt)) {
      return NextResponse.json(
        { error: 'Ungültige Verkäufer-ID' },
        { status: 400 }
      );
    }

    // Find seller by their sellerId
    const seller = await prisma.seller.findFirst({
      where: { sellerId: sellerIdInt }
    });

    if (!seller) {
      return NextResponse.json(
        { error: 'Verkäufer nicht gefunden' },
        { status: 404 }
      );
    }

    // If trying to activate status, check if limit is reached
    if (sellerStatusActive && !seller.sellerStatusActive) {
      const activeSellers = await prisma.seller.count({
        where: {
          sellerStatusActive: true
        }
      });
      const maxSellers = parseInt(process.env.MAX_SELLERS || '200');
      
      if (activeSellers >= maxSellers) {
        return NextResponse.json(
          { error: `Die maximale Anzahl von ${maxSellers} aktiven Verkäufern ist bereits erreicht. Sie können Ihren Status derzeit nicht aktivieren.` },
          { status: 400 }
        );
      }
    }

    // Update seller status
    const updatedSeller = await prisma.seller.update({
      where: { sellerId: sellerIdInt },
      data: { sellerStatusActive },
    });

    return NextResponse.json({ 
      success: true, 
      sellerStatusActive: updatedSeller.sellerStatusActive 
    });
  } catch (error: any) {
    console.error('Error updating seller status:', error);
    return NextResponse.json(
      { error: 'Fehler beim Aktualisieren des Verkäuferstatus' },
      { status: 500 }
    );
  }
}
