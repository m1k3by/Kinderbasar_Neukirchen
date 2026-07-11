import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/apiAuth';

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const { sellerId } = await request.json();

    if (!sellerId) {
      return NextResponse.json({ error: 'Seller ID fehlt' }, { status: 400 });
    }

    // Get current seller
    const seller = await prisma.seller.findUnique({
      where: { sellerId: typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId },
    });

    if (!seller) {
      return NextResponse.json({ error: 'Verkäufer nicht gefunden' }, { status: 404 });
    }

    // Admins can always toggle seller status, no limit check needed
    // Toggle the seller status
    const updatedSeller = await prisma.seller.update({
      where: { sellerId: typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId },
      data: { sellerStatusActive: !seller.sellerStatusActive },
    });

    return NextResponse.json({
      message: updatedSeller.sellerStatusActive
        ? 'Verkäufer Status aktiviert'
        : 'Verkäufer Status deaktiviert',
      sellerStatusActive: updatedSeller.sellerStatusActive,
    });
  } catch (error) {
    console.error('Error toggling seller status:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
