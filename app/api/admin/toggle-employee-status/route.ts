import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/apiAuth';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const body = await request.json();
    const { sellerId } = body;

    if (!sellerId) {
      return NextResponse.json({ error: 'Verkäufer-ID ist erforderlich' }, { status: 400 });
    }

    // Parse sellerId to integer
    const sellerIdInt = typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId;

    if (isNaN(sellerIdInt)) {
      return NextResponse.json({ error: 'Ungültige Verkäufer-ID' }, { status: 400 });
    }

    // Get current seller
    const seller = await prisma.seller.findUnique({
      where: { sellerId: sellerIdInt },
    });

    if (!seller) {
      return NextResponse.json({ error: 'Verkäufer nicht gefunden' }, { status: 404 });
    }

    // Toggle isEmployee status
    const updatedSeller = await prisma.seller.update({
      where: { sellerId: sellerIdInt },
      data: { isEmployee: !seller.isEmployee },
    });

    return NextResponse.json({ 
      success: true, 
      isEmployee: updatedSeller.isEmployee,
      message: `Rolle wurde geändert zu ${updatedSeller.isEmployee ? 'Mitarbeiter' : 'Verkäufer'}`
    });
  } catch (error: any) {
    console.error('Error toggling employee status:', error);
    return NextResponse.json(
      { error: 'Fehler beim Ändern der Rolle' },
      { status: 500 }
    );
  }
}
