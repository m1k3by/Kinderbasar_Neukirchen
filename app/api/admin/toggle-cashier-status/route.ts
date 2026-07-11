import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/apiAuth';

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const { sellerId } = await request.json();
    if (!sellerId) return NextResponse.json({ error: 'Seller ID fehlt' }, { status: 400 });

    const seller = await prisma.seller.findUnique({
      where: { sellerId: typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId },
    });
    if (!seller) return NextResponse.json({ error: 'Verkäufer nicht gefunden' }, { status: 404 });

    const updated = await prisma.seller.update({
      where: { sellerId: seller.sellerId },
      data: { isCashier: !seller.isCashier },
    });

    return NextResponse.json({
      message: updated.isCashier ? 'Kassierer-Status aktiviert' : 'Kassierer-Status deaktiviert',
      isCashier: updated.isCashier,
    });
  } catch (error) {
    console.error('Error toggling cashier status:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
